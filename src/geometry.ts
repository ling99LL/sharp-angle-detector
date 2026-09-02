export interface Point {
	x: number;
	y: number;
}

export interface AcuteCorner {
	point: Point;
	angle: number;
	index: number;
}

export type PolygonSource = Array<'L' | 'ARC' | 'CARC' | 'C' | 'R' | 'CIRCLE' | number>;

export interface PolygonLike {
	getSource: () => PolygonSource | Array<PolygonSource>;
	getSourceStrictComplex?: () => Array<PolygonSource>;
}

const EPSILON = 1e-7;
const ACUTE_ANGLE_LIMIT = 90;
const RIGHT_ANGLE_TOLERANCE = 1;

function isNumber(value: unknown): value is number {
	return typeof value === 'number' && Number.isFinite(value);
}

function samePoint(a: Point, b: Point, tolerance = EPSILON): boolean {
	return Math.abs(a.x - b.x) <= tolerance && Math.abs(a.y - b.y) <= tolerance;
}

function dedupeConsecutive(points: Point[]): Point[] {
	const deduped: Point[] = [];
	for (const point of points) {
		if (!deduped.length || !samePoint(deduped[deduped.length - 1], point)) {
			deduped.push(point);
		}
	}
	return deduped;
}

function rotatePoint(point: Point, center: Point, degrees: number): Point {
	const radians = degrees * Math.PI / 180;
	const cos = Math.cos(radians);
	const sin = Math.sin(radians);
	const dx = point.x - center.x;
	const dy = point.y - center.y;
	return {
		x: center.x + dx * cos - dy * sin,
		y: center.y + dx * sin + dy * cos,
	};
}

function parseSource(source: PolygonSource): Point[] {
	const first = source[0];
	if (first === 'CIRCLE') {
		return [];
	}
	if (first === 'R') {
		const x = source[1];
		const y = source[2];
		const width = source[3];
		const height = source[4];
		const rotation = source[5];
		const round = source[6];
		if (![x, y, width, height, rotation, round].every(isNumber)) {
			return [];
		}
		if (round > EPSILON) {
			return [];
		}
		const center = { x: x + width / 2, y: y + height / 2 };
		const corners = [
			{ x, y },
			{ x: x + width, y },
			{ x: x + width, y: y + height },
			{ x, y: y + height },
		];
		return corners.map(point => rotatePoint(point, center, rotation));
	}

	if (!isNumber(source[0]) || !isNumber(source[1])) {
		return [];
	}

	const points: Point[] = [{ x: source[0], y: source[1] }];
	let cursor = 2;
	while (cursor < source.length) {
		const command = source[cursor++];
		if (typeof command !== 'string') {
			if (isNumber(command) && isNumber(source[cursor])) {
				points.push({ x: command, y: source[cursor] });
				cursor += 1;
			}
			continue;
		}

		const values: number[] = [];
		while (cursor < source.length && isNumber(source[cursor])) {
			values.push(source[cursor]);
			cursor += 1;
		}

		if (command === 'L') {
			for (let index = 0; index + 1 < values.length; index += 2) {
				points.push({ x: values[index], y: values[index + 1] });
			}
		}
		else if (command === 'ARC' || command === 'CARC') {
			// The current point is the arc start. Each arc payload is angle, endX, endY.
			for (let index = 0; index + 2 < values.length; index += 3) {
				points.push({ x: values[index + 1], y: values[index + 2] });
			}
		}
		else if (command === 'C') {
			// Each cubic segment has two control points and one end point.
			for (let index = 0; index + 5 < values.length; index += 6) {
				points.push({ x: values[index + 4], y: values[index + 5] });
			}
		}
	}

	return dedupeConsecutive(points);
}

export function getPolygonRings(shape: PolygonLike): PolygonSource[] {
	const strictSource = typeof shape.getSourceStrictComplex === 'function'
		? shape.getSourceStrictComplex()
		: shape.getSource();
	if (!Array.isArray(strictSource) || strictSource.length === 0) {
		return [];
	}
	if (typeof strictSource[0] === 'string' || typeof strictSource[0] === 'number') {
		return [strictSource as PolygonSource];
	}
	return (strictSource as Array<PolygonSource | unknown>).filter(Array.isArray) as PolygonSource[];
}

function findCorners(
	points: Point[],
	closed: boolean,
	matches: (angle: number) => boolean,
): AcuteCorner[] {
	let normalised = dedupeConsecutive(points);
	if (closed && normalised.length > 1 && samePoint(normalised[0], normalised[normalised.length - 1])) {
		normalised = normalised.slice(0, -1);
	}
	const minimumPoints = closed ? 3 : 3;
	if (normalised.length < minimumPoints) {
		return [];
	}
	const orientation = closed
		? normalised.reduce((area, point, index) => {
				const next = normalised[(index + 1) % normalised.length];
				return area + point.x * next.y - next.x * point.y;
			}, 0)
		: 0;

	const corners: AcuteCorner[] = [];
	const start = closed ? 0 : 1;
	const end = closed ? normalised.length : normalised.length - 1;
	for (let index = start; index < end; index += 1) {
		const point = normalised[index];
		const previous = normalised[(index - 1 + normalised.length) % normalised.length];
		const next = normalised[(index + 1) % normalised.length];
		const previousVector = { x: previous.x - point.x, y: previous.y - point.y };
		const nextVector = { x: next.x - point.x, y: next.y - point.y };
		const previousLength = Math.hypot(previousVector.x, previousVector.y);
		const nextLength = Math.hypot(nextVector.x, nextVector.y);
		if (previousLength <= EPSILON || nextLength <= EPSILON) {
			continue;
		}
		if (closed && Math.abs(orientation) > EPSILON) {
			const incoming = { x: point.x - previous.x, y: point.y - previous.y };
			const outgoing = { x: next.x - point.x, y: next.y - point.y };
			const cross = incoming.x * outgoing.y - incoming.y * outgoing.x;
			if (cross * orientation <= EPSILON) {
				continue;
			}
		}
		const cosine = Math.max(-1, Math.min(1, (previousVector.x * nextVector.x + previousVector.y * nextVector.y) / (previousLength * nextLength)));
		const angle = Math.acos(cosine) * 180 / Math.PI;
		if (matches(angle)) {
			corners.push({ point, angle, index });
		}
	}
	return corners;
}

export function findAcuteCorners(points: Point[], closed: boolean): AcuteCorner[] {
	return findCorners(points, closed, isAcuteAngle);
}

export function findRightCorners(points: Point[], closed: boolean): AcuteCorner[] {
	return findCorners(points, closed, isRightAngle);
}

export function findPolygonAcuteCorners(shape: PolygonLike): AcuteCorner[] {
	return getPolygonRings(shape).flatMap(source => findAcuteCorners(parseSource(source), true));
}

export function findPolylineAcuteCorners(shape: PolygonLike): AcuteCorner[] {
	return getPolygonRings(shape).flatMap(source => findAcuteCorners(parseSource(source), false));
}

export function findPolylineRightCorners(shape: PolygonLike): AcuteCorner[] {
	return getPolygonRings(shape).flatMap(source => findRightCorners(parseSource(source), false));
}

export function angleBetweenVectors(a: Point, b: Point): number {
	const aLength = Math.hypot(a.x, a.y);
	const bLength = Math.hypot(b.x, b.y);
	if (aLength <= EPSILON || bLength <= EPSILON) {
		return 180;
	}
	const cosine = Math.max(-1, Math.min(1, (a.x * b.x + a.y * b.y) / (aLength * bLength)));
	return Math.acos(cosine) * 180 / Math.PI;
}

export function isAcuteAngle(angle: number): boolean {
	return angle < ACUTE_ANGLE_LIMIT - 1e-5;
}

export function isRightAngle(angle: number): boolean {
	return Math.abs(angle - ACUTE_ANGLE_LIMIT) <= RIGHT_ANGLE_TOLERANCE;
}

export function arcEndpointProbe(start: Point, end: Point, arcAngle: number, atStart: boolean): Point {
	const chordAngle = Math.atan2(end.y - start.y, end.x - start.x);
	const tangentAngle = chordAngle - (arcAngle * Math.PI / 180) / 2 + (atStart ? 0 : Math.PI);
	return {
		x: (atStart ? start.x : end.x) + Math.cos(tangentAngle),
		y: (atStart ? start.y : end.y) + Math.sin(tangentAngle),
	};
}
