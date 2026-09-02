"use strict";
var edaEsbuildExportName = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // src/index.ts
  var src_exports = {};
  __export(src_exports, {
    activate: () => activate,
    clearSharpAngleHighlights: () => clearSharpAngleHighlights,
    startSharpAngleDetection: () => startSharpAngleDetection
  });

  // extension.json
  var extension_default = {
    name: "sharp-angle-detector",
    uuid: "8bea93b8d4bf47c1a2087d0e3ba25fde",
    displayName: "\u9510\u89D2\u68C0\u6D4B",
    description: "\u626B\u63CF\u6240\u6709\u4FE1\u53F7\u5C42\uFF1A\u5BFC\u7EBF\u68C0\u6D4B\u9510\u89D2\u548C\u76F4\u89D2\uFF0C\u8986\u94DC\u53CA\u586B\u5145\u533A\u57DF\u4EC5\u68C0\u6D4B\u9510\u89D2\uFF0C\u5E76\u9AD8\u4EAE\u663E\u793A\u68C0\u6D4B\u7ED3\u679C\u3002",
    version: "1.0.3",
    publisher: "\u9E22\u67AD",
    engines: {
      eda: "^3.2.0"
    },
    license: "Apache-2.0",
    repository: {
      type: "extension-store",
      url: ""
    },
    categories: "PCB",
    keywords: [
      "PCB",
      "DRC",
      "\u9510\u89D2",
      "\u76F4\u89D2",
      "\u8986\u94DC"
    ],
    images: {
      logo: "./images/logo.png"
    },
    homepage: "https://github.com/ling99LL/sharp-angle-detector",
    bugs: "https://github.com/ling99LL/sharp-angle-detector/issues",
    activationEvents: {},
    entry: "./dist/index",
    dependentExtensions: {},
    headerMenus: {
      home: [
        {
          id: "sharp-angle-detector-home",
          title: "\u9510\u89D2\u68C0\u6D4B",
          menuItems: [
            {
              id: "start-home",
              title: "\u5F00\u59CB\u68C0\u6D4B",
              registerFn: "startSharpAngleDetection"
            },
            {
              id: "clear-home",
              title: "\u6E05\u9664\u9AD8\u4EAE",
              registerFn: "clearSharpAngleHighlights"
            }
          ]
        }
      ],
      pcb: [
        {
          id: "sharp-angle-detector-pcb",
          title: "\u9510\u89D2\u68C0\u6D4B",
          menuItems: [
            {
              id: "start-pcb",
              title: "\u5F00\u59CB\u68C0\u6D4B",
              registerFn: "startSharpAngleDetection"
            },
            {
              id: "clear-pcb",
              title: "\u6E05\u9664\u9AD8\u4EAE",
              registerFn: "clearSharpAngleHighlights"
            }
          ]
        }
      ]
    }
  };

  // src/geometry.ts
  var EPSILON = 1e-7;
  var ACUTE_ANGLE_LIMIT = 90;
  var RIGHT_ANGLE_TOLERANCE = 1;
  function isNumber(value) {
    return typeof value === "number" && Number.isFinite(value);
  }
  function samePoint(a, b, tolerance = EPSILON) {
    return Math.abs(a.x - b.x) <= tolerance && Math.abs(a.y - b.y) <= tolerance;
  }
  function dedupeConsecutive(points) {
    const deduped = [];
    for (const point of points) {
      if (!deduped.length || !samePoint(deduped[deduped.length - 1], point)) {
        deduped.push(point);
      }
    }
    return deduped;
  }
  function rotatePoint(point, center, degrees) {
    const radians = degrees * Math.PI / 180;
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);
    const dx = point.x - center.x;
    const dy = point.y - center.y;
    return {
      x: center.x + dx * cos - dy * sin,
      y: center.y + dx * sin + dy * cos
    };
  }
  function parseSource(source) {
    const first = source[0];
    if (first === "CIRCLE") {
      return [];
    }
    if (first === "R") {
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
        { x, y: y + height }
      ];
      return corners.map((point) => rotatePoint(point, center, rotation));
    }
    if (!isNumber(source[0]) || !isNumber(source[1])) {
      return [];
    }
    const points = [{ x: source[0], y: source[1] }];
    let cursor = 2;
    while (cursor < source.length) {
      const command = source[cursor++];
      if (typeof command !== "string") {
        if (isNumber(command) && isNumber(source[cursor])) {
          points.push({ x: command, y: source[cursor] });
          cursor += 1;
        }
        continue;
      }
      const values = [];
      while (cursor < source.length && isNumber(source[cursor])) {
        values.push(source[cursor]);
        cursor += 1;
      }
      if (command === "L") {
        for (let index = 0; index + 1 < values.length; index += 2) {
          points.push({ x: values[index], y: values[index + 1] });
        }
      } else if (command === "ARC" || command === "CARC") {
        for (let index = 0; index + 2 < values.length; index += 3) {
          points.push({ x: values[index + 1], y: values[index + 2] });
        }
      } else if (command === "C") {
        for (let index = 0; index + 5 < values.length; index += 6) {
          points.push({ x: values[index + 4], y: values[index + 5] });
        }
      }
    }
    return dedupeConsecutive(points);
  }
  function getPolygonRings(shape) {
    const strictSource = typeof shape.getSourceStrictComplex === "function" ? shape.getSourceStrictComplex() : shape.getSource();
    if (!Array.isArray(strictSource) || strictSource.length === 0) {
      return [];
    }
    if (typeof strictSource[0] === "string" || typeof strictSource[0] === "number") {
      return [strictSource];
    }
    return strictSource.filter(Array.isArray);
  }
  function findCorners(points, closed, matches) {
    let normalised = dedupeConsecutive(points);
    if (closed && normalised.length > 1 && samePoint(normalised[0], normalised[normalised.length - 1])) {
      normalised = normalised.slice(0, -1);
    }
    const minimumPoints = closed ? 3 : 3;
    if (normalised.length < minimumPoints) {
      return [];
    }
    const orientation = closed ? normalised.reduce((area, point, index) => {
      const next = normalised[(index + 1) % normalised.length];
      return area + point.x * next.y - next.x * point.y;
    }, 0) : 0;
    const corners = [];
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
  function findAcuteCorners(points, closed) {
    return findCorners(points, closed, isAcuteAngle);
  }
  function findRightCorners(points, closed) {
    return findCorners(points, closed, isRightAngle);
  }
  function findPolygonAcuteCorners(shape) {
    return getPolygonRings(shape).flatMap((source) => findAcuteCorners(parseSource(source), true));
  }
  function findPolylineAcuteCorners(shape) {
    return getPolygonRings(shape).flatMap((source) => findAcuteCorners(parseSource(source), false));
  }
  function findPolylineRightCorners(shape) {
    return getPolygonRings(shape).flatMap((source) => findRightCorners(parseSource(source), false));
  }
  function angleBetweenVectors(a, b) {
    const aLength = Math.hypot(a.x, a.y);
    const bLength = Math.hypot(b.x, b.y);
    if (aLength <= EPSILON || bLength <= EPSILON) {
      return 180;
    }
    const cosine = Math.max(-1, Math.min(1, (a.x * b.x + a.y * b.y) / (aLength * bLength)));
    return Math.acos(cosine) * 180 / Math.PI;
  }
  function isAcuteAngle(angle) {
    return angle < ACUTE_ANGLE_LIMIT - 1e-5;
  }
  function isRightAngle(angle) {
    return Math.abs(angle - ACUTE_ANGLE_LIMIT) <= RIGHT_ANGLE_TOLERANCE;
  }
  function arcEndpointProbe(start, end, arcAngle, atStart) {
    const chordAngle = Math.atan2(end.y - start.y, end.x - start.x);
    const tangentAngle = chordAngle - arcAngle * Math.PI / 180 / 2 + (atStart ? 0 : Math.PI);
    return {
      x: (atStart ? start.x : end.x) + Math.cos(tangentAngle),
      y: (atStart ? start.y : end.y) + Math.sin(tangentAngle)
    };
  }

  // src/index.ts
  var COORDINATE_TOLERANCE = 0.01;
  var MARKER_RADIUS = 35;
  var MARKER_LINE_WIDTH = 10;
  var detectionInProgress = false;
  function errorMessage(error) {
    if (error instanceof Error) {
      return error.message;
    }
    return String(error);
  }
  function quantizedKey(point) {
    return `${Math.round(point.x / COORDINATE_TOLERANCE)}:${Math.round(point.y / COORDINATE_TOLERANCE)}`;
  }
  function pointFrom(x, y) {
    return { x, y };
  }
  function layerNameMap(layers) {
    return new Map(
      layers.filter((layer) => layer.type === EPCB_LayerType.SIGNAL).map((layer) => [layer.id, layer.name])
    );
  }
  function addPolygonCorners(target, primitiveId, layer, shape, closed, category) {
    const corners = closed ? findPolygonAcuteCorners(shape) : findPolylineAcuteCorners(shape);
    for (const corner of corners) {
      if (category === "wire" && isRightAngle(corner.angle)) {
        continue;
      }
      target.push({
        point: corner.point,
        angle: corner.angle,
        category,
        primitiveId,
        layer
      });
    }
  }
  function addLineEndpoint(groups, layer, net, point, otherPoint, primitiveId) {
    const key = `${layer}:${net}:${quantizedKey(point)}`;
    const endpoints = groups.get(key) ?? [];
    endpoints.push({ point, otherPoint, primitiveId, category: "wire" });
    groups.set(key, endpoints);
  }
  function addLineCorners(groups, layer, acuteTarget, rightTarget) {
    for (const endpoints of groups.values()) {
      if (endpoints.length < 2) {
        continue;
      }
      const anchor = endpoints[0].point;
      for (let first = 0; first < endpoints.length - 1; first += 1) {
        for (let second = first + 1; second < endpoints.length; second += 1) {
          const firstVector = {
            x: endpoints[first].otherPoint.x - anchor.x,
            y: endpoints[first].otherPoint.y - anchor.y
          };
          const secondVector = {
            x: endpoints[second].otherPoint.x - anchor.x,
            y: endpoints[second].otherPoint.y - anchor.y
          };
          const angle = angleBetweenVectors(firstVector, secondVector);
          const target = isRightAngle(angle) ? rightTarget : isAcuteAngle(angle) ? acuteTarget : void 0;
          if (target !== void 0) {
            target.push({
              point: anchor,
              angle,
              category: "wire",
              primitiveId: `${endpoints[first].primitiveId},${endpoints[second].primitiveId}`,
              layer
            });
          }
        }
      }
    }
  }
  function addArcEndpoints(groups, layer, net, arc) {
    const start = pointFrom(arc.getState_StartX(), arc.getState_StartY());
    const end = pointFrom(arc.getState_EndX(), arc.getState_EndY());
    const arcAngle = arc.getState_ArcAngle();
    const startProbe = arcEndpointProbe(start, end, arcAngle, true);
    const endProbe = arcEndpointProbe(start, end, arcAngle, false);
    const primitiveId = arc.getState_PrimitiveId();
    addLineEndpoint(groups, layer, net, start, startProbe, primitiveId);
    addLineEndpoint(groups, layer, net, end, endProbe, primitiveId);
  }
  async function getSignalLayers() {
    const layers = await eda.pcb_Layer.getAllLayers();
    return layers.filter((layer) => layer.type === EPCB_LayerType.SIGNAL).map((layer) => ({ id: layer.id, name: layer.name }));
  }
  async function scanSignalLayer(layer, pourLayerById, result) {
    const [lines, polylines, arcs, pours, fills] = await Promise.all([
      eda.pcb_PrimitiveLine.getAll(void 0, layer),
      eda.pcb_PrimitivePolyline.getAll(void 0, layer),
      eda.pcb_PrimitiveArc.getAll(void 0, layer),
      eda.pcb_PrimitivePour.getAll(void 0, layer),
      eda.pcb_PrimitiveFill.getAll(layer)
    ]);
    const endpoints = /* @__PURE__ */ new Map();
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
        polyline.getState_Polygon(),
        false,
        "wire"
      );
      const rightCorners = findPolylineRightCorners(polyline.getState_Polygon());
      for (const corner of rightCorners) {
        result.wireRightCorners.push({
          point: corner.point,
          angle: corner.angle,
          category: "wire",
          primitiveId,
          layer
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
        pour.getState_ComplexPolygon(),
        true,
        "pour"
      );
    }
    result.pourCount += pours.length;
    for (const fill of fills) {
      const primitiveId = fill.getState_PrimitiveId();
      addPolygonCorners(
        result.fillCorners,
        primitiveId,
        layer,
        fill.getState_ComplexPolygon(),
        true,
        "fill"
      );
    }
    result.fillCount += fills.length;
  }
  function scanPouredFills(allPoured, pourLayerById, result) {
    for (const poured of allPoured) {
      const layer = pourLayerById.get(poured.getState_PourPrimitiveId());
      if (layer === void 0) {
        continue;
      }
      const primitiveId = poured.getState_PrimitiveId();
      const pourFills = poured.getState_PourFills();
      for (const pourFill of pourFills) {
        addPolygonCorners(
          result.pouredCorners,
          `${primitiveId}:${pourFill.id}`,
          layer,
          pourFill.path,
          true,
          "poured"
        );
      }
      result.pouredCount += pourFills.length;
    }
  }
  function markerForCorner(corner) {
    return {
      type: EDMT_IndicatorMarkerType.CIRCLE,
      x: corner.point.x,
      y: corner.point.y,
      r: MARKER_RADIUS
    };
  }
  function uniqueCorners(corners) {
    const seen = /* @__PURE__ */ new Set();
    return corners.filter((corner) => {
      const key = `${corner.category}:${corner.layer}:${quantizedKey(corner.point)}:${corner.primitiveId}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }
  function formatLayerSummary(layers) {
    if (layers.length === 0) {
      return "\u672A\u627E\u5230\u4FE1\u53F7\u5C42";
    }
    return layers.map((layer) => `${layer.name}(${layer.id})`).join("\u3001");
  }
  function showResult(result, markersRendered) {
    const wireCorners = uniqueCorners(result.wireCorners);
    const wireRightCorners = uniqueCorners(result.wireRightCorners);
    const pourCorners = uniqueCorners(result.pourCorners);
    const pouredCorners = uniqueCorners(result.pouredCorners);
    const fillCorners = uniqueCorners(result.fillCorners);
    const pourTotal = pourCorners.length + pouredCorners.length;
    const acuteTotal = wireCorners.length + pourTotal + fillCorners.length;
    const total = acuteTotal + wireRightCorners.length;
    const status = total === 0 ? "\u672A\u53D1\u73B0\u9510\u89D2\u6216\u5BFC\u7EBF\u76F4\u89D2\u3002" : markersRendered ? "\u5DF2\u9AD8\u4EAE\u6240\u6709\u68C0\u6D4B\u5230\u7684\u9510\u89D2\u548C\u5BFC\u7EBF\u76F4\u89D2\u3002" : "\u68C0\u6D4B\u5230\u9510\u89D2\u6216\u5BFC\u7EBF\u76F4\u89D2\uFF0C\u4F46\u5F53\u524D\u753B\u5E03\u4E0D\u652F\u6301\u6307\u793A\u6807\u8BB0\u9AD8\u4EAE\u3002";
    const details = [
      `\u626B\u63CF\u4FE1\u53F7\u5C42\uFF1A${formatLayerSummary(result.layers)}`,
      `\u5BFC\u7EBF\u56FE\u5143\uFF1A${result.wirePrimitiveCount}\uFF08\u76F4\u7EBF ${result.lineSegmentCount}\u3001\u6298\u7EBF ${result.polylineCount}\u3001\u5706\u5F27 ${result.arcCount}\uFF09`,
      `\u8986\u94DC\u8FB9\u6846\uFF1A${result.pourCount} \u4E2A\uFF0C\u9510\u89D2 ${pourCorners.length} \u5904`,
      `\u8986\u94DC\u586B\u5145\u533A\u57DF\uFF1A${result.pouredCount} \u4E2A\uFF0C\u9510\u89D2 ${pouredCorners.length} \u5904`,
      `\u586B\u5145\u56FE\u5143\uFF1A${result.fillCount} \u4E2A\uFF0C\u9510\u89D2 ${fillCorners.length} \u5904`,
      `\u5BFC\u7EBF\u9510\u89D2\uFF1A${wireCorners.length} \u5904`,
      `\u5BFC\u7EBF\u76F4\u89D2\uFF1A${wireRightCorners.length} \u5904`,
      `\u9510\u89D2\u603B\u6570\uFF1A${acuteTotal} \u5904`,
      `\u68C0\u6D4B\u5230\u7684\u95EE\u9898\u603B\u6570\uFF1A${total} \u5904`,
      status
    ].join("\n");
    console.log(`[${extension_default.displayName}]
${details}`);
    eda.sys_Dialog.showInformationMessage(details, "\u9510\u89D2\u68C0\u6D4B\u7ED3\u679C", "\u77E5\u9053\u4E86");
  }
  function activate(status, arg) {
  }
  async function startSharpAngleDetection() {
    if (detectionInProgress) {
      eda.sys_Message.showToastMessage("\u9510\u89D2\u68C0\u6D4B\u6B63\u5728\u8FDB\u884C\u4E2D\uFF0C\u8BF7\u7A0D\u5019\u3002");
      return;
    }
    detectionInProgress = true;
    try {
      const currentDocument = await eda.dmt_SelectControl.getCurrentDocumentInfo();
      if (currentDocument?.documentType !== EDMT_EditorDocumentType.PCB) {
        eda.sys_Dialog.showInformationMessage("\u8BF7\u5148\u6253\u5F00\u5E76\u6FC0\u6D3B\u4E00\u4E2A PCB \u753B\u5E03\uFF0C\u518D\u8FD0\u884C\u9510\u89D2\u68C0\u6D4B\u3002", "\u9510\u89D2\u68C0\u6D4B");
        return;
      }
      await eda.dmt_EditorControl.removeIndicatorMarkers();
      eda.sys_Message.showToastMessage("\u6B63\u5728\u626B\u63CF\u6240\u6709\u4FE1\u53F7\u5C42\u7684\u5BFC\u7EBF\u3001\u8986\u94DC\u548C\u586B\u5145\u533A\u57DF\u2026");
      const allLayers = await eda.pcb_Layer.getAllLayers();
      const layers = await getSignalLayers();
      if (layers.length === 0) {
        eda.sys_Dialog.showInformationMessage("\u5F53\u524D PCB \u6CA1\u6709\u53EF\u626B\u63CF\u7684\u4FE1\u53F7\u5C42\u3002", "\u9510\u89D2\u68C0\u6D4B");
        return;
      }
      const allPoured = await eda.pcb_PrimitivePoured.getAll();
      const pourLayerById = /* @__PURE__ */ new Map();
      const result = {
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
        fillCorners: []
      };
      const names = layerNameMap(allLayers);
      result.layers = layers.map((layer) => ({ id: layer.id, name: names.get(layer.id) ?? layer.name }));
      for (const layer of layers) {
        await scanSignalLayer(layer.id, pourLayerById, result);
      }
      scanPouredFills(allPoured, pourLayerById, result);
      const allCorners = uniqueCorners([
        ...result.wireCorners,
        ...result.wireRightCorners,
        ...result.pourCorners,
        ...result.pouredCorners,
        ...result.fillCorners
      ]);
      let markersRendered = true;
      if (allCorners.length > 0) {
        markersRendered = await eda.dmt_EditorControl.generateIndicatorMarkers(
          allCorners.map(markerForCorner),
          { r: 255, g: 32, b: 32, alpha: 1 },
          MARKER_LINE_WIDTH,
          false
        );
      }
      showResult(result, markersRendered);
    } catch (error) {
      const message = errorMessage(error);
      console.error(`[${extension_default.displayName}]`, error);
      eda.sys_Dialog.showInformationMessage(`\u68C0\u6D4B\u5931\u8D25\uFF1A${message}`, "\u9510\u89D2\u68C0\u6D4B");
    } finally {
      detectionInProgress = false;
    }
  }
  async function clearSharpAngleHighlights() {
    await eda.dmt_EditorControl.removeIndicatorMarkers();
    eda.sys_Message.showToastMessage("\u5DF2\u6E05\u9664\u9510\u89D2\u548C\u5BFC\u7EBF\u76F4\u89D2\u68C0\u6D4B\u9AD8\u4EAE\u3002");
  }
  return __toCommonJS(src_exports);
})();
