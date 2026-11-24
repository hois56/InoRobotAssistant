import * as THREE from 'three';
import { advanceConveyorObject } from './conveyor-core.mjs?v=20261116-feed-1';

const meshToFrame = new THREE.Matrix4();
const meshBounds = new THREE.Box3();

export function conveyorLocalBounds(model, frame, inverseFrame) {
    const bounds = new THREE.Box3();
    if (!inverseFrame) {
        frame.updateWorldMatrix(true, false);
        inverseFrame = frame.matrixWorld.clone().invert();
    }
    model.updateWorldMatrix(true, true);
    model.traverseVisible(mesh => {
        if (!mesh.isMesh || !mesh.geometry) return;
        if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
        const box = mesh.geometry.boundingBox;
        if (!box || box.isEmpty()) return;
        meshToFrame.multiplyMatrices(inverseFrame, mesh.matrixWorld);
        bounds.union(meshBounds.copy(box).applyMatrix4(meshToFrame));
    });
    return bounds;
}

export function moveConveyorObjects(mappings, models, resolveBelt, seconds, beforeMove = () => {}) {
    const moved = new Set();
    const belts = new Set(mappings.map(resolveBelt).filter(Boolean));
    for (const mapping of mappings) {
        const belt = resolveBelt(mapping);
        if (!belt || belt.visible === false || belt.userData.attachmentHost) continue;
        const beltBounds = conveyorLocalBounds(belt, belt);
        if (beltBounds.isEmpty()) continue;
        for (const object of models) {
            if ([...belts].some(belt => { for (let parent = belt; parent; parent = parent.parent) if (parent === object) return true; return false; }) || moved.has(object) || object.visible === false
                || object.userData.tcpFrame || object.userData.attachmentHost
                || object.userData.equipmentOwner || object.userData.equipmentFilm
                || (object.userData.placement && object.userData.placement !== 'scene')) continue;
            const bounds = conveyorLocalBounds(object, belt);
            if (bounds.isEmpty()) continue;
            const distance = advanceConveyorObject(beltBounds, bounds, mapping.conveyorAxis, mapping.conveyorSpeed, seconds, 2, Boolean(object.userData.conveyorFeedSource) && object.userData.conveyorFeedBelt === mapping.gripObjectRef);
            if (!distance) continue;
            const delta = new THREE.Vector3();
            delta[mapping.conveyorAxis.endsWith('Y') ? 'y' : 'x'] = distance;
            const origin = belt.localToWorld(new THREE.Vector3());
            delta.copy(belt.localToWorld(delta).sub(origin));
            const position = object.getWorldPosition(new THREE.Vector3()).add(delta);
            object.parent?.worldToLocal(position);
            const travelSeconds = Math.min(seconds, Math.abs(distance) / mapping.conveyorSpeed);
            beforeMove(object, mapping, position, travelSeconds);
            object.position.copy(position);
            object.updateMatrix();
            object.matrixWorldNeedsUpdate = true;
            object.updateMatrixWorld(true);
            moved.add(object);
        }
    }
    return moved;
}
