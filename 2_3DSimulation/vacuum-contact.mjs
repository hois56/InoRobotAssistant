import * as THREE from 'three';
import { MeshCollisionSystem } from './collision-system.mjs';
import { equipmentReferences } from './equipment-core.mjs?v=20261101-vacuum-surface-1';

const within = (object, root) => { for (let node = object; node; node = node.parent) if (node === root) return true; return false; };
const visible = object => { for (let node = object; node; node = node.parent) if (node.visible === false) return false; return true; };

export class VacuumContact {
    constructor(adapter = {}) { this.adapter = adapter; this.clear(); }
    clear() { this.system = new MeshCollisionSystem(); this.proxies = new WeakMap(); this.objects = new WeakMap(); }
    meshes(root) {
        const result = [];
        root?.traverse(mesh => {
            if (mesh.isMesh && mesh.geometry?.getAttribute('position') && visible(mesh)
                && !mesh.userData.collisionDebugMesh && !mesh.userData.simulationSnapFaceOverlay && !mesh.userData.outlineSource) result.push(mesh);
        });
        return result;
    }
    proxy(mesh, ranges = null) {
        const key = JSON.stringify(ranges), entries = this.proxies.get(mesh) || new Map();
        this.proxies.set(mesh, entries);
        let entry = entries.get(key);
        if (!entry || entry.source !== mesh.geometry) {
            let geometry = mesh.geometry;
            if (ranges) {
                const position = geometry.getAttribute('position'), count = Math.floor((geometry.index?.count || position.count) / 3), indices = [];
                for (const range of ranges) {
                    if (range.last >= count) throw new Error('흡착 면을 다시 선택하세요.');
                    for (let triangle = range.first; triangle <= range.last; triangle++) for (let i = 0; i < 3; i++) indices.push(geometry.index ? geometry.index.getX(triangle * 3 + i) : triangle * 3 + i);
                }
                geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', position); geometry.setIndex(indices);
            }
            const proxy = new THREE.Mesh(geometry); proxy.matrixAutoUpdate = false;
            entry = { source: mesh.geometry, proxy }; entries.set(key, entry);
        }
        mesh.updateWorldMatrix(true, false);
        entry.proxy.matrix.copy(mesh.matrixWorld); entry.proxy.updateMatrixWorld(true);
        return entry.proxy;
    }
    path(root, mesh) {
        if (this.adapter.objectPath) return this.adapter.objectPath(root, mesh);
        const path = [];
        for (let node = mesh; node !== root; node = node.parent) {
            if (!node.parent) return null;
            path.unshift(node.parent.children.indexOf(node));
        }
        return path;
    }
    atPath(root, path) { return this.adapter.objectAtPath ? this.adapter.objectAtPath(root, path) : path?.reduce((node, index) => node?.children[index], root); }
    sources(def, resolve) {
        if (def.vacuumMode === 'FACE') {
            const source = resolve(def.movingRef), face = def.vacuumFace;
            const mesh = face && this.atPath(source?.model, face.meshPath);
            if (!source || !mesh?.isMesh || !within(mesh, source.object)) throw new Error('흡착 면을 다시 선택하세요.');
            return [{ mesh, ref: source.ref, meshPath: face.meshPath, proxy: this.proxy(mesh, face.triangleRanges) }];
        }
        const result = [], seen = new Set();
        for (const ref of equipmentReferences(def)) {
            const source = resolve(ref);
            if (!source) throw new Error('진공을 설정한 모델 또는 부품이 없습니다.');
            for (const mesh of this.meshes(source.object)) if (!seen.has(mesh)) {
                seen.add(mesh); result.push({ mesh, ref, meshPath: this.path(source.model, mesh), proxy: this.proxy(mesh) });
            }
        }
        return result;
    }
    objectProxy(object) {
        const meshes = this.meshes(object), root = this.objects.get(object) || new THREE.Group();
        this.objects.set(object, root); root.clear(); this.system.meshCache.delete(root);
        for (const mesh of meshes) root.add(this.proxy(mesh));
        root.updateMatrixWorld(true);
        return root;
    }
    prepare(definitions, candidates, resolve) {
        const roots = [];
        for (const def of definitions) if (def.type === 'VACUUM' && def.enabled) {
            try { roots.push(...this.sources(def, resolve).map(source => source.proxy)); } catch { /* Invalid saved face is reported when used or edited. */ }
        }
        if (!roots.length) return;
        roots.push(...candidates.map(candidate => this.objectProxy(candidate.object)));
        this.system.prepare(roots);
    }
    find(def, candidates, resolve) {
        const sources = this.sources(def, resolve), contacts = [];
        for (const candidate of candidates) {
            const proxy = this.objectProxy(candidate.object);
            for (const source of sources) {
                if (within(source.mesh, candidate.object) || within(candidate.object, source.mesh)) continue;
                if (this.system.isWithinDistance(source.proxy, proxy, 1)) {
                    contacts.push({ candidate, source }); break;
                }
            }
        }
        return contacts;
    }
}
