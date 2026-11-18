import * as THREE from 'three';
import { normalizeConveyorSettings } from './conveyor-core.mjs';

// The catalog STEP has an endless belt with a capsule cross-section in X/Z.
// Shade the existing surface: no helper mesh, changed bounds, or moving CAD frame.
const fragment = `
varying vec3 conveyorPoint;
uniform vec3 conveyorCapsule;
uniform float conveyorRadius;
uniform float conveyorTravel;
uniform float conveyorPitch;
float conveyorArc(vec2 p) {
    float halfLength = conveyorCapsule.z;
    float straight = 2.0 * halfLength;
    float arc = 3.14159265359 * conveyorRadius;
    if (p.x > halfLength) return straight + conveyorRadius * atan(p.x - halfLength, p.y);
    if (p.x < -halfLength) return 2.0 * straight + arc + conveyorRadius * atan(-p.x - halfLength, -p.y);
    return p.y >= 0.0 ? p.x + halfLength : straight + arc + halfLength - p.x;
}
`;

function beltShape(mesh) {
    if (!/^Endless_belt_/i.test(mesh.userData.cadPartName || mesh.name) || !mesh.geometry) return null;
    if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
    const box = mesh.geometry.boundingBox;
    const radius = (box.max.z - box.min.z) / 2;
    const halfLength = (box.max.x - box.min.x) / 2 - radius;
    if (!(radius > 0 && halfLength > 0)) return null;
    return { radius, halfLength, x: (box.max.x + box.min.x) / 2, z: (box.max.z + box.min.z) / 2 };
}

export function createConveyorVisuals() {
    const records = new Map();
    function remove(mesh, record) {
        if (mesh.material === record.material) mesh.material = record.original;
        for (const material of record.clones) material.dispose();
        records.delete(mesh);
    }
    function prepare(mesh, shape) {
        let record = records.get(mesh);
        if (record && mesh.material !== record.material) { remove(mesh, record); record = null; }
        if (record) return record;
        const original = mesh.material;
        const sources = Array.isArray(original) ? original : [original];
        if (!sources.every(material => material?.isMeshStandardMaterial || material?.isMeshPhongMaterial || material?.isMeshLambertMaterial || material?.isMeshBasicMaterial)) return null;
        const length = 4 * shape.halfLength + 2 * Math.PI * shape.radius;
        const uniforms = {
            conveyorCapsule: { value: new THREE.Vector3(shape.x, shape.z, shape.halfLength) },
            conveyorRadius: { value: shape.radius }, conveyorTravel: { value: 0 },
            conveyorPitch: { value: length / Math.max(1, Math.round(length / 65)) }
        };
        const clones = sources.map(source => {
            const material = source.clone();
            // The renderer attaches AO to each new material; do not copy its source hook.
            const previous = material.onBeforeCompile;
            const cacheKey = material.customProgramCacheKey();
            material.onBeforeCompile = (shader, renderer) => {
                previous.call(material, shader, renderer);
                Object.assign(shader.uniforms, uniforms);
                shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 conveyorPoint;')
                    .replace('#include <begin_vertex>', '#include <begin_vertex>\nconveyorPoint = position;');
                shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\n' + fragment)
                    .replace('#include <color_fragment>', `#include <color_fragment>
                        float beltS = conveyorArc(conveyorPoint.xz - conveyorCapsule.xy);
                        float stripe = fract((beltS - conveyorTravel) / conveyorPitch);
                        float mark = smoothstep(0.02, 0.05, stripe) * (1.0 - smoothstep(0.14, 0.17, stripe));
                        diffuseColor.rgb *= mix(0.22, 1.45, mark);
                    `);
            };
            material.customProgramCacheKey = () => cacheKey + ':conveyor-capsule-v1';
            return material;
        });
        mesh.material = Array.isArray(original) ? clones : clones[0];
        record = { original, material: mesh.material, clones, uniforms, length };
        records.set(mesh, record);
        return record;
    }
    return {
        update(allMappings, activeMappings, resolveBelt, seconds, catalogModels = []) {
            const retained = new Set(), advanced = new Set();
            const retain = model => model?.traverse(mesh => {
                if (!mesh.isMesh) return;
                const shape = beltShape(mesh);
                if (shape && prepare(mesh, shape)) retained.add(mesh);
            });
            // Catalog conveyors show the same belt even before motion is configured.
            for (const model of catalogModels) retain(model);
            // Keep the markings and phase while stopped. Restore materials on deletion.
            for (const mapping of allMappings) {
                if (mapping.action !== 'CONVEYOR') continue;
                retain(resolveBelt(mapping));
            }
            for (const [mesh, record] of records) if (!retained.has(mesh)) remove(mesh, record);
            if (!(seconds > 0 && seconds <= 0.25)) return;
            for (const mapping of activeMappings) {
                const frame = resolveBelt(mapping);
                if (!frame) continue;
                const { conveyorAxis: axis, conveyorSpeed: speed } = normalizeConveyorSettings(mapping);
                frame.updateWorldMatrix(true, true);
                frame.traverseVisible(mesh => {
                    const record = records.get(mesh);
                    if (!record || advanced.has(mesh)) return;
                    advanced.add(mesh);
                    // Match object transport in the mapping frame, including model scale/rotation.
                    const local = new THREE.Vector3(axis.endsWith('X') ? 1 : 0, axis.endsWith('Y') ? 1 : 0, 0);
                    const inverse = mesh.matrixWorld.clone().invert();
                    const origin = new THREE.Vector3().applyMatrix4(frame.matrixWorld).applyMatrix4(inverse);
                    local.applyMatrix4(frame.matrixWorld).applyMatrix4(inverse).sub(origin);
                    const travel = record.uniforms.conveyorTravel;
                    travel.value = (travel.value + local.x * (axis.startsWith('-') ? -1 : 1) * speed * seconds) % record.length;
                });
            }
        },
        reset() { for (const record of records.values()) record.uniforms.conveyorTravel.value = 0; },
        dispose() { for (const [mesh, record] of records) remove(mesh, record); }
    };
}
