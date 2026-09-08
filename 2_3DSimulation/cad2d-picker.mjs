import * as THREE from 'three';
import { CAD_RENDER_LAYER } from './cad2d-renderer.mjs';

export function findCadEntityAncestor(object, root = null) {
    let current = object;
    while (current && current !== root) {
        if (current.userData?.cadEntityId) return current;
        current = current.parent;
    }
    return null;
}

export function pickCadEntity(raycaster, camera, pointerNdc, root, threshold = 4) {
    if (!raycaster || !camera || !root?.visible) return null;
    raycaster.params.Line.threshold = Math.max(0.01, Number(threshold) || 4);
    raycaster.layers.enable(CAD_RENDER_LAYER);
    raycaster.setFromCamera(pointerNdc instanceof THREE.Vector2 ? pointerNdc : new THREE.Vector2(pointerNdc?.x || 0, pointerNdc?.y || 0), camera);
    const hitProxies = [];
    root.traverse((child) => {
        if (child.userData?.cadHitProxy && child.visible) hitProxies.push(child);
    });
    const hit = raycaster.intersectObjects(hitProxies, false)[0];
    if (!hit) return null;
    const faceRegion = hit.object.userData?.cadFaceRegion || null;
    const segmentIds = hit.object.userData?.cadHitSegmentIds;
    const rawIndex = Number(hit.index);
    const segmentIndexCandidates = Number.isInteger(rawIndex)
        ? [rawIndex, Math.floor(rawIndex / 2)]
        : [];
    const batchedEntityId = Array.isArray(segmentIds)
        ? segmentIndexCandidates.map((index) => segmentIds[index]).find(Boolean)
        : null;
    const entityId = faceRegion?.outerEntityId
        || hit.object.userData?.cadEntityId
        || batchedEntityId;
    const entity = root.userData?.cadDocument?.entities?.find((candidate) => candidate.id === entityId) || null;
    return entity
        ? {
            entity,
            object: hit.object,
            point: hit.point,
            face: faceRegion,
            selectionKind: faceRegion ? 'face' : 'entity'
        }
        : null;
}
