import { Vector3 } from 'three';

const black = { color: 0x292c2f };
const orangeLens = { color: 0xff8200, roughness: 0.32 };
const steel = { color: 0xc4c8cc, metalness: 0.55, roughness: 0.28 };

// Measurements are in the S7-50 standard STL frame, in millimetres.
function baseFinish(face) {
    if (face.every(p => p.z >= 10.99 && Math.hypot(p.x + 113, p.y) <= 27)
        && face.some(p => p.z > 11.01)) return black;

    // The two rear plugs each have a cap seam at X = -155 and seat at X = -142.
    if (!face.every(p => p.x <= -141.99)) return null;
    const onPlug = [-95.25, -127.25].some(z =>
        face.every(p => Math.hypot(p.y + 12, p.z - z) <= 15.05));
    if (!onPlug) return null;
    return face.every(p => p.x <= -154.99) ? black : steel;
}

function upperArmFinish(face) {
    // The gland has already been split at its swivel. Only its stationary foot is on J2.
    if (face.every(p => p.z >= 264.99 && Math.hypot(p.x - 225, p.y) <= 27)
        && face.some(p => p.z > 265.01)) return black;
    if (face.every(p => p.z >= 264.2 && Math.hypot(p.x - 274.4, p.y) <= 10)
        && face.some(p => p.z > 270)) return orangeLens;
    return null;
}

export function applyS7HardwareFinish(mesh) {
    if (!mesh.isMesh) return;
    const finishFor = mesh.name === 'P0' ? baseFinish : mesh.name === 'J2' ? upperArmFinish : null;
    if (!finishFor) return;

    const { geometry } = mesh;
    const position = geometry.getAttribute('position');
    const index = geometry.index;
    const groups = geometry.groups.length ? geometry.groups : [
        { start: 0, count: index?.count ?? position.count, materialIndex: 0 }
    ];
    const materials = [].concat(mesh.material);
    const byMaterial = new Map();
    const face = [new Vector3(), new Vector3(), new Vector3()];
    for (const group of groups) {
        for (let i = group.start; i < group.start + group.count; i += 3) {
            const a = index ? index.getX(i) : i;
            const b = index ? index.getX(i + 1) : i + 1;
            const c = index ? index.getX(i + 2) : i + 2;
            let key = group.materialIndex;
            if (key === 0) {
                face[0].fromBufferAttribute(position, a);
                face[1].fromBufferAttribute(position, b);
                face[2].fromBufferAttribute(position, c);
                key = finishFor(face) ?? key;
            }
            if (!byMaterial.has(key)) byMaterial.set(key, []);
            byMaterial.get(key).push(a, b, c);
        }
    }
    geometry.clearGroups();
    let start = 0;
    for (const [finish, indices] of byMaterial) {
        let materialIndex = finish;
        if (typeof finish !== 'number') {
            const material = materials[0].clone();
            material.setValues(finish);
            materialIndex = materials.push(material) - 1;
        }
        geometry.addGroup(start, indices.length, materialIndex);
        start += indices.length;
    }
    geometry.setIndex(Array.from(byMaterial.values()).flat());
    mesh.material = materials;
}
