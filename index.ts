import type { AcuteCorner, Point, PolygonLike } from './geometry.ts';

/**
 * 锐角检测 / Acute Angle Detector
 *
 * 这是一个嘉立创EDA专业版扩展：在所有信号层读取导线、覆铜和填充的几何
 * 数据；导线检测锐角和直角，覆铜/填充区域仅检测锐角，并使用编辑器指示标记高亮位置。
 */
import extensionConfig from '../extension.json' with { type: 'json' };
import {
	angleBetweenVectors,
	arcEndpointProbe,
	findPolygonAcuteCorners,
	findPolylineAcuteCorners,
	findPolylineRightCorners,
	isAcuteAngle,
	isRightAngle,
} from './geometry.ts';

const COORDINATE_TOLERANCE = 0.01;
const MARKER_RADIUS = 35;
const MARKER_LINE_WIDTH = 10;

type SignalLayer = TPCB_LayersOfCopper;

interface DetectedCorner {
	point: Point;
	angle: number;
	category: 'wire' | 'pour' | 'poured' | 'fill';
	primitiveId: string;
	layer: SignalLayer;
}

interface LineEndpoint {
	point: Point;
	otherPoint: Point;
	primitiveId: string;
	category: 'wire';
}

interface ScanResult {
	layers: Array<{ id: SignalLayer; name: string }>;
	wirePrimitiveCount: number;
	lineSegmentCount: number;
	polylineCount: number;
	arcCount: number;
	pourCount: number;
	pouredCount: number;
	fillCount: number;
	wireCorners: DetectedCorner[];
	wireRightCorners: DetectedCorner[];
	pourCorners: DetectedCorner[];
	pouredCorners: DetectedCorner[];
	fillCorners: DetectedCorner[];
}

let detectionInProgress = false;

function errorMessage(error: unknown): string {
	if (error instanceof Error) {
		return error.message;
	}
	return String(error);
}

function quantizedKey(point: Point): string {
	return `${Math.round(point.x / COORDINATE_TOLERANCE)}:${Math.round(point.y / COORDINATE_TOLERANCE)}`;
}

function pointFrom(x: number, y: number): Point {
	return { x, y };
}

function layerNameMap(layers: Array<IPCB_LayerItem>): Map<SignalLayer, string> {
	return new Map(
		layers
			.filter(layer => layer.type === EPCB_LayerType.SIGNAL)
			.map(layer => [layer.id as SignalLayer, layer.name]),
	);
}

function addPolygonCorners(
	target: DetectedCorner[],
	primitiveId: string,
	layer: SignalLayer,
	shape: PolygonLike,
	closed: boolean,
	category: DetectedCorner['category'],
): void {
	const corners: AcuteCorner[] = closed
		? findPolygonAcuteCorners(shape)
		: findPolylineAcuteCorners(shape);
	for (const corner of corners) {
		// 导线的近似直角由独立的直角路径统计，避免同一顶点同时计入锐角。
		if (category === 'wire' && isRightAngle(corner.angle)) {
			continue;
		}
		target.push({
			point: corner.point,
			angle: corner.angle,
			category,
			primitiveId,
			layer,
		});
	}
}

function addLineEndpoint(
	groups: Map<string, LineEndpoint[]>,
	layer: SignalLayer,
	net: string,
	point: Point,
	otherPoint: Point,
	primitiveId: string,
): void {
	const key = `${layer}:${net}:${quantizedKey(point)}`;
	const endpoints = groups.get(key) ?? [];
	endpoints.push({ point, otherPoint, primitiveId, category: 'wire' });
	groups.set(key, endpoints);
}

function addLineCorners(
	groups: Map<string, LineEndpoint[]>,
	layer: SignalLayer,
	acuteTarget: DetectedCorner[],
	rightTarget: DetectedCorner[],
): void {
	for (const endpoints of groups.values()) {
		if (endpoints.length < 2) {
			continue;
		}
		const anchor = endpoints[0].point;
		for (let first = 0; first < endpoints.length - 1; first += 1) {
			for (let second = first + 1; second < endpoints.length; second += 1) {
				const firstVector = {
					x: endpoints[first].otherPoint.x - anchor.x,
					y: endpoints[first].otherPoint.y - anchor.y,
				};
				const secondVector = {
					x: endpoints[second].otherPoint.x - anchor.x,
					y: endpoints[second].otherPoint.y - anchor.y,
				};
				const angle = angleBetweenVectors(firstVector, secondVector);
				const target = isRightAngle(angle) ? rightTarget : isAcuteAngle(angle) ? acuteTarget : undefined;
				if (target !== undefined) {
					target.push({
						point: anchor,
						angle,
						category: 'wire',
						primitiveId: `${endpoints[first].primitiveId},${endpoints[second].primitiveId}`,
						layer,
					});
				}
			}
		}
	}
}

function addArcEndpoints(
	groups: Map<string, LineEndpoint[]>,
	layer: SignalLayer,
	net: string,
	arc: IPCB_PrimitiveArc,
): void {
	const start = pointFrom(arc.getState_StartX(), arc.getState_StartY());
	const end = pointFrom(arc.getState_EndX(), arc.getState_EndY());
	const arcAngle = arc.getState_ArcAngle();
	const startProbe = arcEndpointProbe(start, end, arcAngle, true);
	const endProbe = arcEndpointProbe(start, end, arcAngle, false);
	const primitiveId = arc.getState_PrimitiveId();
	addLineEndpoint(groups, layer, net, start, startProbe, primitiveId);
	addLineEndpoint(groups, layer, net, end, endProbe, primitiveId);
}

async function getSignalLayers(): Promise<Array<{ id: SignalLayer; name: string }>> {
	const layers = await eda.pcb_Layer.getAllLayers();
	return layers
		.filter(layer => layer.type === EPCB_LayerType.SIGNAL)
		.map(layer => ({ id: layer.id as SignalLayer, name: layer.name }));
}

async function scanSignalLayer(
	layer: SignalLayer,
	pourLayerById: Map<string, SignalLayer>,
	result: ScanResult,
): Promise<void> {
	const [lines, polylines, arcs, pours, fills] = await Promise.all([
		eda.pcb_PrimitiveLine.getAll(undefined, layer),
		eda.pcb_PrimitivePolyline.getAll(undefined, layer),
		eda.pcb_PrimitiveArc.getAll(undefined, layer),
		eda.pcb_PrimitivePour.getAll(undefined, layer),
		eda.pcb_PrimitiveFill.getAll(layer),
	]);

	const endpoints = new Map<string, LineEndpoint[]>();
	for (const line of lines) {
		const primitiveId = line.getState_PrimitiveId();
		const start = pointFrom(line.getState_StartX(), line.getState_StartY());
		const end = pointFrom(line.getState_EndX(), line.getState_EndY());
		addLineEndpoint(endpoints, layer, line.getState_Net(), start, end, primitiveId);
		addLineEndpoint(endpoints, layer, line.getState_Net(), end, start, primitiveId);
	}
	for (const arc of arcs) {
		addArcEndpoints(endpoints, layer, arc.getState_Net(), arc);
	}
	addLineCorners(endpoints, layer, result.wireCorners, result.wireRightCorners);

	result.lineSegmentCount += lines.length;
	result.arcCount += arcs.length;
	result.polylineCount += polylines.length;
	result.wirePrimitiveCount += lines.length + arcs.length + polylines.length;

	for (const polyline of polylines) {
		const primitiveId = polyline.getState_PrimitiveId();
		addPolygonCorners(
			result.wireCorners,
			primitiveId,
			layer,
			polyline.getState_Polygon() as unknown as PolygonLike,
			false,
			'wire',
		);
		const rightCorners = findPolylineRightCorners(polyline.getState_Polygon() as unknown as PolygonLike);
		for (const corner of rightCorners) {
			result.wireRightCorners.push({
				point: corner.point,
				angle: corner.angle,
				category: 'wire',
				primitiveId,
				layer,
			});
		}
	}

	for (const pour of pours) {
		const primitiveId = pour.getState_PrimitiveId();
		pourLayerById.set(primitiveId, layer);
		addPolygonCorners(
			result.pourCorners,
			primitiveId,
			layer,
			pour.getState_ComplexPolygon() as unknown as PolygonLike,
			true,
			'pour',
		);
	}
	result.pourCount += pours.length;

	for (const fill of fills) {
		const primitiveId = fill.getState_PrimitiveId();
		addPolygonCorners(
			result.fillCorners,
			primitiveId,
			layer,
			fill.getState_ComplexPolygon() as unknown as PolygonLike,
			true,
			'fill',
		);
	}
	result.fillCount += fills.length;
}

function scanPouredFills(
	allPoured: Array<IPCB_PrimitivePoured>,
	pourLayerById: Map<string, SignalLayer>,
	result: ScanResult,
): void {
	for (const poured of allPoured) {
		const layer = pourLayerById.get(poured.getState_PourPrimitiveId());
		if (layer === undefined) {
			continue;
		}
		const primitiveId = poured.getState_PrimitiveId();
		const pourFills = poured.getState_PourFills();
		for (const pourFill of pourFills) {
			addPolygonCorners(
				result.pouredCorners,
				`${primitiveId}:${pourFill.id}`,
				layer,
				pourFill.path as unknown as PolygonLike,
				true,
				'poured',
			);
		}
		result.pouredCount += pourFills.length;
	}
}

function markerForCorner(corner: DetectedCorner): IDMT_IndicatorMarkerShape {
	return {
		type: EDMT_IndicatorMarkerType.CIRCLE,
		x: corner.point.x,
		y: corner.point.y,
		r: MARKER_RADIUS,
	};
}

function uniqueCorners(corners: DetectedCorner[]): DetectedCorner[] {
	const seen = new Set<string>();
	return corners.filter((corner) => {
		const key = `${corner.category}:${corner.layer}:${quantizedKey(corner.point)}:${corner.primitiveId}`;
		if (seen.has(key)) {
			return false;
		}
		seen.add(key);
		return true;
	});
}

function formatLayerSummary(layers: Array<{ id: SignalLayer; name: string }>): string {
	if (layers.length === 0) {
		return '未找到信号层';
	}
	return layers.map(layer => `${layer.name}(${layer.id})`).join('、');
}

function showResult(result: ScanResult, markersRendered: boolean): void {
	const wireCorners = uniqueCorners(result.wireCorners);
	const wireRightCorners = uniqueCorners(result.wireRightCorners);
	const pourCorners = uniqueCorners(result.pourCorners);
	const pouredCorners = uniqueCorners(result.pouredCorners);
	const fillCorners = uniqueCorners(result.fillCorners);
	const pourTotal = pourCorners.length + pouredCorners.length;
	const acuteTotal = wireCorners.length + pourTotal + fillCorners.length;
	const total = acuteTotal + wireRightCorners.length;
	const status = total === 0
		? '未发现锐角或导线直角。'
		: markersRendered ? '已高亮所有检测到的锐角和导线直角。' : '检测到锐角或导线直角，但当前画布不支持指示标记高亮。';
	const details = [
		`扫描信号层：${formatLayerSummary(result.layers)}`,
		`导线图元：${result.wirePrimitiveCount}（直线 ${result.lineSegmentCount}、折线 ${result.polylineCount}、圆弧 ${result.arcCount}）`,
		`覆铜边框：${result.pourCount} 个，锐角 ${pourCorners.length} 处`,
		`覆铜填充区域：${result.pouredCount} 个，锐角 ${pouredCorners.length} 处`,
		`填充图元：${result.fillCount} 个，锐角 ${fillCorners.length} 处`,
		`导线锐角：${wireCorners.length} 处`,
		`导线直角：${wireRightCorners.length} 处`,
		`锐角总数：${acuteTotal} 处`,
		`检测到的问题总数：${total} 处`,
		status,
	].join('\n');
	console.log(`[${extensionConfig.displayName}]\n${details}`);
	eda.sys_Dialog.showInformationMessage(details, '锐角检测结果', '知道了');
}

export function activate(status?: 'onStartupFinished', arg?: string): void {
	void status;
	void arg;
}

export async function startSharpAngleDetection(): Promise<void> {
	if (detectionInProgress) {
		eda.sys_Message.showToastMessage('锐角检测正在进行中，请稍候。');
		return;
	}
	detectionInProgress = true;
	try {
		const currentDocument = await eda.dmt_SelectControl.getCurrentDocumentInfo();
		if (currentDocument?.documentType !== EDMT_EditorDocumentType.PCB) {
			eda.sys_Dialog.showInformationMessage('请先打开并激活一个 PCB 画布，再运行锐角检测。', '锐角检测');
			return;
		}

		await eda.dmt_EditorControl.removeIndicatorMarkers();
		eda.sys_Message.showToastMessage('正在扫描所有信号层的导线、覆铜和填充区域…');

		const allLayers = await eda.pcb_Layer.getAllLayers();
		const layers = await getSignalLayers();
		if (layers.length === 0) {
			eda.sys_Dialog.showInformationMessage('当前 PCB 没有可扫描的信号层。', '锐角检测');
			return;
		}

		const allPoured = await eda.pcb_PrimitivePoured.getAll();
		const pourLayerById = new Map<string, SignalLayer>();
		const result: ScanResult = {
			layers,
			wirePrimitiveCount: 0,
			lineSegmentCount: 0,
			polylineCount: 0,
			arcCount: 0,
			pourCount: 0,
			pouredCount: 0,
			fillCount: 0,
			wireCorners: [],
			wireRightCorners: [],
			pourCorners: [],
			pouredCorners: [],
			fillCorners: [],
		};
		const names = layerNameMap(allLayers);
		result.layers = layers.map(layer => ({ id: layer.id, name: names.get(layer.id) ?? layer.name }));

		for (const layer of layers) {
			await scanSignalLayer(layer.id, pourLayerById, result);
		}
		scanPouredFills(allPoured, pourLayerById, result);

		const allCorners = uniqueCorners([
			...result.wireCorners,
			...result.wireRightCorners,
			...result.pourCorners,
			...result.pouredCorners,
			...result.fillCorners,
		]);
		let markersRendered = true;
		if (allCorners.length > 0) {
			markersRendered = await eda.dmt_EditorControl.generateIndicatorMarkers(
				allCorners.map(markerForCorner),
				{ r: 255, g: 32, b: 32, alpha: 1 },
				MARKER_LINE_WIDTH,
				false,
			);
		}
		showResult(result, markersRendered);
	}
	catch (error) {
		const message = errorMessage(error);
		console.error(`[${extensionConfig.displayName}]`, error);
		eda.sys_Dialog.showInformationMessage(`检测失败：${message}`, '锐角检测');
	}
	finally {
		detectionInProgress = false;
	}
}

export async function clearSharpAngleHighlights(): Promise<void> {
	await eda.dmt_EditorControl.removeIndicatorMarkers();
	eda.sys_Message.showToastMessage('已清除锐角和导线直角检测高亮。');
}
