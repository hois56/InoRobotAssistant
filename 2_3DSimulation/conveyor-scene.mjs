import * as THREE from 'three';
import { advanceConveyorObject } from './conveyor-core.mjs';

export function conveyorLocalBounds(model, frame) {
    const bounds = new THREE.Box3();
    frame.updateWorldMatrix(true, false);
    model.updateWorldMatrix(true, true);
    const inverse = frame.matrixWorld.clone().invert();
    model.traverseVisible(mesh => {
        if (!mesh.isMesh || !mesh.geometry) return;
        if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
        const box = mesh.geometry.boundingBox;
        if (!box || box.isEmpty()) return;
        const matrix = inverse.clone().multiply(mesh.matrixWorld);
        for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
            bounds.expandByPoint(new THREE.Vector3(x, y, z).applyMatrix4(matrix));
        }
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
            const distance = advanceConveyorObject(beltBounds, bounds, mapping.conveyorAxis, mapping.conveyorSpeed, seconds);
            if (!distance) continue;
            const delta = new THREE.Vector3();
            delta[mapping.conveyorAxis.endsWith('Y') ? 'y' : 'x'] = distance;
            const origin = belt.localToWorld(new THREE.Vector3());
            delta.copy(belt.localToWorld(delta).sub(origin));
            const world = object.getWorldPosition(new THREE.Vector3()).add(delta);
            beforeMove(object);
            object.position.copy(object.parent ? object.parent.worldToLocal(world) : world);
            object.updateMatrix();
            object.matrixWorldNeedsUpdate = true;
            object.updateMatrixWorld(true);
            moved.add(object);
        }
    }
    return moved;
}
