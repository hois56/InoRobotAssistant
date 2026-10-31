import { ROBOT_JOINT_ACCENTS } from './robot-joint-accent-faces.mjs?v=20261031-r50-flange-12';
import { SCARA_LOWER_COVERS } from './scara-lower-cover-faces.mjs?v=20261031-r16-clean-10';
export const ROBOT_JOINT_ACCENT_COLOR = 0x009cde;
export const SCARA_LOWER_COVER_COLOR = 0xb6b6bb;
export const R4_JOINT_ACCENT = ROBOT_JOINT_ACCENTS['IR-R4-56'];
export const R4_JOINT_ACCENT_END_X = R4_JOINT_ACCENT.endX;

export function applyRobotJointAccent(geometry, folder, meshName) {
    const mask = ROBOT_JOINT_ACCENTS[folder] || SCARA_LOWER_COVERS[folder];
    if (!mask || meshName !== (mask.mesh || 'P4.stl')
        || geometry.getAttribute('position').count !== mask.triangleCount * 3) return geometry;
    const axis = mask.axis ?? 0;
    const boundary = mask.endZ ?? mask.endX;
    const accentTriangles = new Set();
    for (const [start, count] of mask.ranges) {
        for (let triangle = start; triangle < start + count; triangle++) accentTriangles.add(triangle);
    }
    const result = geometry.clone();
    result.userData.robotJointAccentColor = mask.axis === 2 ? SCARA_LOWER_COVER_COLOR : ROBOT_JOINT_ACCENT_COLOR;
    const source = geometry.index;
    const positions = geometry.getAttribute('position');
    const normals = geometry.getAttribute('normal');
    const vertexCount = positions.count;
    const groups = geometry.groups.length ? geometry.groups : [{ start: 0, count: vertexCount, materialIndex: 0 }];
    const body = { positions: [], normals: [] };
    const accent = { positions: [], normals: [] };
    function readVertex(index) {
        return [positions.getX(index), positions.getY(index), positions.getZ(index),
            normals.getX(index), normals.getY(index), normals.getZ(index)];
    }
    function clip(vertices, inside) {
        const polygon = [];
        for (let i = 0; i < vertices.length; i++) {
            const a = vertices[i], b = vertices[(i + 1) % vertices.length];
            const aInside = inside(a[axis]), bInside = inside(b[axis]);
            if (aInside) polygon.push(a);
            if (aInside !== bInside) {
                const t = (boundary - a[axis]) / (b[axis] - a[axis]);
                const point = a.map((value, component) => value + t * (b[component] - value));
                point[axis] = boundary;
                polygon.push(point);
            }
        }
        return polygon;
    }
    function append(target, polygon) {
        for (let i = 1; i + 1 < polygon.length; i++) {
            const triangle = [polygon[0], polygon[i], polygon[i + 1]];
            const [a, b, c] = triangle;
            const u = b.slice(0, 3).map((v, k) => v - a[k]);
            const v = c.slice(0, 3).map((v, k) => v - a[k]);
            if (Math.hypot(u[1]*v[2]-u[2]*v[1], u[2]*v[0]-u[0]*v[2], u[0]*v[1]-u[1]*v[0]) < 1e-9) continue;
            for (const vertex of triangle) {
                target.positions.push(...vertex.slice(0, 3));
                target.normals.push(...vertex.slice(3));
            }
        }
    }
    result.clearGroups();
    for (const group of groups) {
        const start = body.positions.length / 3;
        for (let offset = group.start; offset < group.start + group.count; offset += 3) {
            const first = source ? source.getX(offset) : offset;
            const vertices = [0, 1, 2].map(vertex => readVertex(source ? source.getX(offset + vertex) : offset + vertex));
            if (accentTriangles.has(first / 3)) {
                append(accent, clip(vertices, coordinate => coordinate <= boundary));
                append(body, clip(vertices, coordinate => coordinate > boundary));
            } else append(body, vertices);
        }
        result.addGroup(start, body.positions.length / 3 - start, group.materialIndex);
    }
    result.addGroup(body.positions.length / 3, accent.positions.length / 3, 2);
    result.setIndex(Array.from({ length: (body.positions.length + accent.positions.length) / 3 }, (_, index) => index));
    result.setAttribute('position', new positions.constructor(new Float32Array(body.positions.concat(accent.positions)), 3));
    result.setAttribute('normal', new normals.constructor(new Float32Array(body.normals.concat(accent.normals)), 3));
    return result;
}
