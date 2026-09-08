import * as THREE from 'three';
import { getCadLineDashSpec } from './cad2d-core.mjs?v=20260907-cad-style-1';
import { buildCadProfileRegions } from './cad2d-geometry.mjs';

export const CAD_RENDER_LAYER = 5;
export const CAD_DEFAULT_COLOR = 0x38bdf8;
export const CAD_SELECTED_COLOR = 0xfacc15;
export const CAD_HOVER_COLOR = 0x67e8f9;

function colorValue(value, fallback = CAD_DEFAULT_COLOR) {
    try {
        return new THREE.Color(value || fallback);
    } catch (_) {
        return new THREE.Color(fallback);
    }
}

function makeLineGeometry(points) {
    const safePoints = Array.isArray(points) && points.length ? points : [[0, 0]];
    return new THREE.BufferGeometry().setFromPoints(safePoints.map((point) => new THREE.Vector3(
        Number(point?.[0]) || 0,
        Number(point?.[1]) || 0,
        0
    )));
}

function makePointGeometry(point, size = 5) {
    const x = Number(point?.[0]) || 0;
    const y = Number(point?.[1]) || 0;
    return new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(x - size, y, 0), new THREE.Vector3(x + size, y, 0),
        new THREE.Vector3(x, y - size, 0), new THREE.Vector3(x, y + size, 0)
    ]);
}

function drawPolygonPath(path, points) {
    const safePoints = Array.isArray(points) ? points : [];
    if (safePoints.length < 3) return false;
    path.moveTo(Number(safePoints[0][0]) || 0, Number(safePoints[0][1]) || 0);
    safePoints.slice(1).forEach((point) => {
        path.lineTo(Number(point?.[0]) || 0, Number(point?.[1]) || 0);
    });
    path.closePath();
    return true;
}

function makeCadRegionShape(region) {
    const shape = new THREE.Shape();
    if (!drawPolygonPath(shape, region?.outer?.points)) return null;
    (region?.holes || []).forEach((hole) => {
        const path = new THREE.Path();
        if (drawPolygonPath(path, hole.points)) shape.holes.push(path);
    });
    return shape;
}

function createCadFaceVisual(region, layerGroup, settings) {
    const shape = makeCadRegionShape(region);
    if (!shape) return null;
    const geometry = new THREE.ShapeGeometry(shape);
    const material = new THREE.MeshBasicMaterial({
        color: CAD_DEFAULT_COLOR,
        transparent: true,
        opacity: 0.08,
        side: THREE.DoubleSide,
        depthTest: false,
        depthWrite: false
    });
    const face = new THREE.Mesh(geometry, material);
    face.name = `FACE · ${region.outerEntityId}`;
    face.userData.cadFaceRegionId = region.id;
    face.userData.cadFaceVisual = true;
    face.renderOrder = 24;
    face.layers.set(0);
    layerGroup.add(face);

    const hitMaterial = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        depthTest: false,
        depthWrite: false
    });
    const hitProxy = new THREE.Mesh(geometry.clone(), hitMaterial);
    hitProxy.name = `FACE · ${region.outerEntityId} · hit`;
    hitProxy.userData.cadEntityId = region.outerEntityId;
    hitProxy.userData.cadFaceRegion = region;
    hitProxy.userData.cadHitProxy = true;
    hitProxy.renderOrder = 23;
    hitProxy.layers.set(0);
    layerGroup.add(hitProxy);
    return { region, face, hitProxy, material };
}

function disposeMaterial(material) {
    if (Array.isArray(material)) material.forEach(disposeMaterial);
    else material?.dispose?.();
}

function createCadEntityVisual(entity, layerGroup, settings) {
    const group = new THREE.Group();
    group.name = `${entity.type} · ${entity.handle}`;
    group.userData.cadEntityId = entity.id;
    group.userData.cadEntity = entity;
    group.userData.cadLayerId = entity.layerId;
    group.userData.cadEntityType = entity.type;
    group.userData.cadEntityGroup = true;
    const baseColor = colorValue(entity.color, settings.color || CAD_DEFAULT_COLOR);
    const dashSpec = getCadLineDashSpec(entity.linetype, entity.linePattern);
    const LineMaterial = dashSpec ? THREE.LineDashedMaterial : THREE.LineBasicMaterial;
    const material = new LineMaterial({
        color: baseColor,
        transparent: true,
        opacity: Number(settings.opacity) > 0 ? Number(settings.opacity) : 1,
        depthTest: false,
        depthWrite: false,
        linewidth: 1,
        ...(dashSpec || {})
    });
    const points = entity.renderType === 'point'
        ? [entity.geometry?.point || entity.renderPoints?.[0]]
        : entity.renderPoints;
    const geometry = entity.renderType === 'point'
        ? makePointGeometry(points[0], Number(settings.pointSize) || 5)
        : makeLineGeometry(points);
    const line = entity.renderType === 'point'
        ? new THREE.LineSegments(geometry, material)
        : new THREE.Line(geometry, material);
    line.name = `${entity.type} · ${entity.handle} · visual`;
    line.userData.cadEntityId = entity.id;
    line.userData.cad2dSnapLine = true;
    line.userData.cadSnapEntityIds = [entity.id];
    line.userData.cadVisual = true;
    line.renderOrder = 25;
    line.layers.set(0);
    if (material.isLineDashedMaterial) line.computeLineDistances();
    group.add(line);

    const hitGeometry = geometry.clone();
    const hitMaterial = new THREE.LineBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0,
        depthTest: false,
        depthWrite: false
    });
    const hitProxy = entity.renderType === 'point'
        ? new THREE.LineSegments(hitGeometry, hitMaterial)
        : new THREE.Line(hitGeometry, hitMaterial);
    hitProxy.name = `${entity.type} · ${entity.handle} · hit`;
    hitProxy.userData.cadEntityId = entity.id;
    hitProxy.userData.cadHitProxy = true;
    hitProxy.renderOrder = 26;
    hitProxy.layers.set(0);
    group.add(hitProxy);
    layerGroup.add(group);
    return { group, line, hitProxy, material };
}

function createCadBatchVisual(entities, layerGroup, settings) {
    const positions = [];
    const colors = [];
    const segmentEntityIds = [];
    const entitySegments = new Map();
    const pointSize = Number(settings.pointSize) || 5;
    (Array.isArray(entities) ? entities : []).forEach((entity) => {
        const sourcePoints = Array.isArray(entity.renderPoints) ? entity.renderPoints : [];
        const segments = [];
        if (entity.renderType === 'point' || sourcePoints.length === 1) {
            const point = sourcePoints[0] || entity.geometry?.point;
            if (Array.isArray(point)) {
                const x = Number(point[0]) || 0;
                const y = Number(point[1]) || 0;
                segments.push([[x - pointSize, y], [x + pointSize, y]]);
                segments.push([[x, y - pointSize], [x, y + pointSize]]);
            }
        } else {
            for (let index = 1; index < sourcePoints.length; index += 1) {
                const start = sourcePoints[index - 1];
                const end = sourcePoints[index];
                if (Array.isArray(start) && Array.isArray(end)) segments.push([start, end]);
            }
        }
        if (!segments.length) return;
        const color = colorValue(entity.color, settings.color || CAD_DEFAULT_COLOR);
        const rgb = color.toArray();
        const segmentIndices = [];
        segments.forEach(([start, end]) => {
            const segmentIndex = segmentEntityIds.length;
            segmentEntityIds.push(entity.id);
            segmentIndices.push(segmentIndex);
            positions.push(
                Number(start[0]) || 0, Number(start[1]) || 0, 0,
                Number(end[0]) || 0, Number(end[1]) || 0, 0
            );
            colors.push(...rgb, ...rgb);
        });
        entitySegments.set(entity.id, {
            entity,
            segmentIndices,
            baseColor: color
        });
    });
    if (!segmentEntityIds.length) return null;

    const group = new THREE.Group();
    group.name = `CAD geometry · ${entities.length} entities`;
    group.userData.cadBatch = true;
    group.userData.cadLayerGroup = layerGroup;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    const colorAttribute = new THREE.Float32BufferAttribute(colors, 3);
    geometry.setAttribute('color', colorAttribute);
    const material = new THREE.LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: Number(settings.opacity) > 0 ? Number(settings.opacity) : 1,
        depthTest: false,
        depthWrite: false
    });
    const line = new THREE.LineSegments(geometry, material);
    line.name = `CAD geometry · ${entities.length} entities · visual`;
    line.userData.cad2dSnapLine = true;
    line.userData.cadSnapEntityIds = entities.map((entity) => entity.id);
    line.userData.cadVisual = true;
    line.userData.cadBatch = true;
    line.renderOrder = 25;
    line.layers.set(0);
    group.add(line);

    const hitMaterial = new THREE.LineBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0,
        depthTest: false,
        depthWrite: false
    });
    const hitProxy = new THREE.LineSegments(geometry.clone(), hitMaterial);
    hitProxy.name = `CAD geometry · ${entities.length} entities · hit`;
    hitProxy.userData.cadHitProxy = true;
    hitProxy.userData.cadBatch = true;
    hitProxy.userData.cadHitSegmentIds = segmentEntityIds;
    hitProxy.renderOrder = 26;
    hitProxy.layers.set(0);
    group.add(hitProxy);
    layerGroup.add(group);
    return { group, line, hitProxy, material, colorAttribute, entitySegments };
}

export function createCadDocumentRoot(document, options = {}) {
    const root = new THREE.Group();
    root.name = options.name || document?.source?.fileName || '2D CAD';
    root.userData.cad2d = true;
    root.userData.cad2dSchemaVersion = Number(document?.schemaVersion) || 1;
    root.userData.cadDocumentId = document?.documentId || '';
    root.userData.cadDocument = document;
    root.userData.uploaded = true;
    root.userData.modelName = options.name || document?.source?.fileName || '2D CAD';
    root.userData.sourceExtension = document?.source?.extension || '';
    root.userData.sourceUnit = document?.source?.sourceUnit || 'unknown';
    root.userData.sourceFileSize = Number(document?.source?.size) || 0;
    root.userData.sourceUpAxis = 'z';
    root.userData.placement = 'scene';
    root.userData.cadLayerGroups = new Map();
    root.userData.cadEntityVisuals = new Map();
    root.userData.cadFaceRegions = buildCadProfileRegions(document?.entities || []);
    root.userData.cadFaceVisuals = new Map();
    root.userData.cadLayerVisibility = Object.fromEntries((document?.drawing?.layers || []).map((layer) => [layer.id, layer.visible !== false]));
    root.userData.cadDisplaySettings = {
        opacity: Number(options.opacity) > 0 ? Number(options.opacity) : 1,
        pointSize: Number(options.pointSize) > 0 ? Number(options.pointSize) : 5,
        color: options.color || CAD_DEFAULT_COLOR
    };
    root.layers.enable(CAD_RENDER_LAYER);
    const settings = root.userData.cadDisplaySettings;
    (document?.drawing?.layers || []).forEach((layer) => {
        const group = new THREE.Group();
        group.name = `Layer: ${layer.name}`;
        group.userData.cadLayerId = layer.id;
        group.userData.cadLayerName = layer.name;
        group.userData.cadLayerGroup = true;
        group.visible = root.userData.cadLayerVisibility[layer.id] !== false;
        group.layers.enable(CAD_RENDER_LAYER);
        root.userData.cadLayerGroups.set(layer.id, group);
        root.add(group);
    });
    const entities = Array.isArray(document?.entities) ? document.entities : [];
    const useBatchedRendering = entities.length >= 12000;
    if (useBatchedRendering) {
        const entitiesByLayer = new Map();
        entities.forEach((entity) => {
            const layerEntities = entitiesByLayer.get(entity.layerId) || [];
            layerEntities.push(entity);
            entitiesByLayer.set(entity.layerId, layerEntities);
        });
        entitiesByLayer.forEach((layerEntities, layerId) => {
            const layerGroup = root.userData.cadLayerGroups.get(layerId);
            const visual = createCadBatchVisual(layerEntities, layerGroup || root, settings);
            if (!visual) return;
            visual.entitySegments.forEach((entry, entityId) => {
                root.userData.cadEntityVisuals.set(entityId, {
                    ...visual,
                    batch: visual,
                    segmentIndices: entry.segmentIndices
                });
            });
        });
    } else {
        entities.forEach((entity) => {
            let layerGroup = root.userData.cadLayerGroups.get(entity.layerId);
            if (!layerGroup) {
                layerGroup = new THREE.Group();
                layerGroup.name = `Layer: ${entity.layerName || '0'}`;
                layerGroup.userData.cadLayerId = entity.layerId;
                layerGroup.userData.cadLayerName = entity.layerName || '0';
                layerGroup.userData.cadLayerGroup = true;
                root.userData.cadLayerGroups.set(entity.layerId, layerGroup);
                root.userData.cadLayerVisibility[entity.layerId] = true;
                root.add(layerGroup);
            }
            const visual = createCadEntityVisual(entity, layerGroup, settings);
            root.userData.cadEntityVisuals.set(entity.id, visual);
        });
    }
    root.userData.cadFaceRegions.forEach((region) => {
        const layerGroup = root.userData.cadLayerGroups.get(region.layerId) || root;
        const visual = createCadFaceVisual(region, layerGroup, settings);
        if (visual) root.userData.cadFaceVisuals.set(region.id, visual);
    });
    root.updateMatrixWorld(true);
    return root;
}

export function setCadEntityVisualState(root, selectedIds = new Set(), hoveredId = null) {
    const visuals = root?.userData?.cadEntityVisuals;
    if (!(visuals instanceof Map)) return;
    const batches = new Set();
    visuals.forEach(({ material }, entityId) => {
        const visual = visuals.get(entityId);
        if (visual?.batch) {
            batches.add(visual.batch);
            return;
        }
        if (!material?.color) return;
        if (entityId === hoveredId) material.color.set(CAD_HOVER_COLOR);
        else if (selectedIds.has(entityId)) material.color.set(CAD_SELECTED_COLOR);
        else {
            const entity = root.userData.cadDocument?.entities?.find((candidate) => candidate.id === entityId);
            material.color.copy(colorValue(entity?.color, root.userData.cadDisplaySettings?.color || CAD_DEFAULT_COLOR));
        }
        material.needsUpdate = true;
    });
    batches.forEach((batch) => {
        batch.entitySegments.forEach((entry, entityId) => {
            const color = entityId === hoveredId
                ? new THREE.Color(CAD_HOVER_COLOR)
                : selectedIds.has(entityId)
                ? new THREE.Color(CAD_SELECTED_COLOR)
                : entry.baseColor;
            entry.segmentIndices.forEach((segmentIndex) => {
                const vertexIndex = segmentIndex * 2;
                batch.colorAttribute.setXYZ(vertexIndex, color.r, color.g, color.b);
                batch.colorAttribute.setXYZ(vertexIndex + 1, color.r, color.g, color.b);
            });
        });
        batch.colorAttribute.needsUpdate = true;
    });
    root.userData?.cadFaceVisuals?.forEach(({ region, material }) => {
        if (!material?.color) return;
        const selected = region.entityIds.some((entityId) => selectedIds.has(entityId));
        const hovered = region.entityIds.includes(hoveredId);
        if (hovered) {
            material.color.set(CAD_HOVER_COLOR);
            material.opacity = 0.14;
        } else if (selected) {
            material.color.set(CAD_SELECTED_COLOR);
            material.opacity = 0.2;
        } else {
            material.color.set(CAD_DEFAULT_COLOR);
            material.opacity = 0.08;
        }
        material.needsUpdate = true;
    });
}

export function setCadLayerVisibility(root, layerId, visible) {
    const group = root?.userData?.cadLayerGroups?.get(layerId);
    if (!group) return false;
    const nextVisible = Boolean(visible);
    group.visible = nextVisible;
    if (root.userData.cadLayerVisibility) root.userData.cadLayerVisibility[layerId] = nextVisible;
    return true;
}

export function getCadEntityVisual(root, entityId) {
    return root?.userData?.cadEntityVisuals?.get(entityId) || null;
}

export function disposeCadDocumentRoot(root) {
    if (!root) return;
    root.traverse((child) => {
        if (child.geometry) child.geometry.dispose();
        disposeMaterial(child.material);
    });
}
