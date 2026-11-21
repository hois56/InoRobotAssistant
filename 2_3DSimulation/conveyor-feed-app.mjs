import * as THREE from 'three';
import { conveyorLocalBounds } from './conveyor-scene.mjs?v=20261116-feed-1';
import { planConveyorFeed, normalizeConveyorFeedVariation, conveyorFeedEnvelope, sampleConveyorFeedRotation } from './conveyor-feed-core.mjs?v=20261117-variation-1';

export function createConveyorFeedApp(adapter) {
    const records = new Map();
    const sources = () => adapter.objects().filter(item => !item.model.userData.conveyorFeedSource
        && !adapter.mappings().some(mapping => {
            if (mapping.action !== 'CONVEYOR') return false;
            for (let node = adapter.resolveBelt(mapping); node; node = node.parent) if (node === item.object) return true;
            return false;
        }));
    const available = object => object.visible !== false && !object.userData.attachmentHost
        && !object.userData.equipmentOwner && (!object.userData.placement || object.userData.placement === 'scene');
    const coordinate = mapping => mapping.conveyorAxis.endsWith('Y') ? 'y' : 'x';
    const random = adapter.random || Math.random;
    let dirty = false;
    function configure(value) {
        const gap = Number(value.gap);
        if (value.gap === '' || !Number.isFinite(gap) || gap < 0 || gap > 1000000) throw new Error('물체 사이 간격은 0~1000000mm로 입력하세요.');
        const variation = normalizeConveyorFeedVariation(value);
        const mapping = adapter.mappings().find(item => item.action === 'CONVEYOR' && item.gripObjectRef === value.belt);
        const belt = mapping && adapter.resolveBelt(mapping);
        const source = sources().find(item => item.ref === value.sourceRef);
        if (!belt) throw new Error('등록된 컨베이어를 선택하세요.');
        if (!source || !available(source.model)) throw new Error('장면에 놓인 등록 오브젝트를 선택하세요.');
        const bounds = conveyorLocalBounds(source.object, belt), beltBounds = conveyorLocalBounds(belt, belt);
        const size = bounds.getSize(new THREE.Vector3()), axis = coordinate(mapping), across = axis === 'x' ? 'y' : 'x';
        if (bounds.isEmpty() || beltBounds.isEmpty() || size[axis] <= 0.001 || size[axis] > beltBounds.max[axis] - beltBounds.min[axis]
            || size[across] > beltBounds.max[across] - beltBounds.min[across]) throw new Error('오브젝트가 벨트 길이와 폭 안에 들어가야 합니다.');
        source.object.updateWorldMatrix(true, true); belt.updateWorldMatrix(true, false);
        const old = records.get(value.belt);
        const matrix = belt.matrixWorld.clone().invert().multiply(source.object.matrixWorld).toArray();
        const unchanged = old && old.sourceRef === value.sourceRef && old.gap === gap
            && old.positionRange === variation.positionRange && old.rotationRange === variation.rotationRange;
        const envelope = conveyorFeedEnvelope(size.toArray(), variation.rotationRange);
        const record = { belt: value.belt, sourceRef: value.sourceRef, gap, ...variation, enabled: value.enabled !== false,
            matrix: unchanged ? old.matrix : matrix, size: unchanged ? old.size : size.toArray(),
            progress: unchanged ? old.progress : Math.min(envelope[axis === 'x' ? 0 : 1], beltBounds.max[axis] - beltBounds.min[axis]) + gap,
            groupId: old?.groupId || 'conveyor-feed-' + crypto.randomUUID(), sequence: old?.sequence || 0 };
        records.set(record.belt, record); adapter.save?.(); adapter.requestRender?.();
        return record;
    }
    function inLane(bounds, beltBounds, axis) {
        const across = axis === 'x' ? 'y' : 'x';
        return !bounds.isEmpty() && Math.abs(bounds.min.z - beltBounds.max.z) <= 2
            && bounds.min[across] >= beltBounds.min[across] - 2 && bounds.max[across] <= beltBounds.max[across] + 2;
    }
    function place(object, belt, record, mapping, offset) {
        const matrix = new THREE.Matrix4().fromArray(record.matrix);
        const world = belt.matrixWorld.clone().multiply(matrix);
        world.decompose(object.position, object.quaternion, object.scale);
        object.updateMatrixWorld(true);
        let box = conveyorLocalBounds(object, belt);
        const area = conveyorLocalBounds(belt, belt), baseCenter = box.getCenter(new THREE.Vector3());
        const angle = sampleConveyorFeedRotation(record.size, area.getSize(new THREE.Vector3()).toArray(), record.rotationRange, random);
        if (angle) {
            world.copy(belt.matrixWorld).multiply(new THREE.Matrix4().makeRotationZ(angle)).multiply(matrix);
            world.decompose(object.position, object.quaternion, object.scale);
            object.updateMatrixWorld(true);
            box = conveyorLocalBounds(object, belt);
        }
        const axis = coordinate(mapping), across = axis === 'x' ? 'y' : 'x', negative = mapping.conveyorAxis.startsWith('-');
        const delta = new THREE.Vector3();
        delta[axis] = negative ? area.max[axis] - box.max[axis] + offset : area.min[axis] - box.min[axis] - offset;
        const center = (box.min[across] + box.max[across]) / 2, half = (box.max[across] - box.min[across]) / 2;
        const min = area.min[across] + half, max = area.max[across] - half;
        const nominal = THREE.MathUtils.clamp(baseCenter[across], min, max);
        const low = Math.max(min, nominal - record.positionRange), high = Math.min(max, nominal + record.positionRange);
        delta[across] = low + random() * (high - low) - center;
        delta.z = area.max.z - box.min.z;
        const origin = belt.localToWorld(new THREE.Vector3());
        object.position.add(belt.localToWorld(delta).sub(origin));
        object.updateMatrixWorld(true);
    }
    return {
        sources,
        label: item => adapter.label(item),
        configure,
        settings: belt => records.get(belt),
        beforeStep(active, seconds) {
            if (!(seconds > 0)) return;
            const candidates = adapter.objects();
            const processed = new Set();
            for (const mapping of active) {
                const record = records.get(mapping.gripObjectRef);
                if (!record?.enabled || processed.has(record.belt)) continue;
                processed.add(record.belt);
                const belt = adapter.resolveBelt(mapping), source = sources().find(item => item.ref === record.sourceRef);
                if (!belt || !source) { record.enabled = false; adapter.report?.('자동 공급 원본 또는 컨베이어가 없어 공급을 중지했습니다.'); continue; }
                if (!available(belt)) continue;
                const axis = coordinate(mapping), negative = mapping.conveyorAxis.startsWith('-');
                const area = conveyorLocalBounds(belt, belt), envelope = conveyorFeedEnvelope(record.size, record.rotationRange);
                const length = Math.min(envelope[axis === 'x' ? 0 : 1], area.max[axis] - area.min[axis]), pitch = length + record.gap;
                const across = axis === 'x' ? 'y' : 'x';
                if (area.isEmpty() || record.size[axis === 'x' ? 0 : 1] > area.max[axis] - area.min[axis]
                    || record.size[across === 'x' ? 0 : 1] > area.max[across] - area.min[across]) {
                    record.enabled = false; adapter.report?.('벨트 크기 또는 방향이 바뀌어 자동 공급을 중지했습니다. 공급 설정을 다시 적용하세요.'); continue;
                }
                const plan = planConveyorFeed(record.progress, mapping.conveyorSpeed * seconds, pitch);
                record.progress = plan.progress;
                for (const offset of plan.offsets) {
                    // Do not insert into an existing workpiece at the inlet. Existing originals stay intact.
                    const blocked = candidates.some(item => {
                        if (!available(item.model) || !available(item.object)) return false;
                        const b = conveyorLocalBounds(item.object, belt);
                        if (!inLane(b, area, axis) || b.max[axis] < area.min[axis] - 2 || b.min[axis] > area.max[axis] + 2) return false;
                        const trailing = negative ? area.max[axis] - b.max[axis] : b.min[axis] - area.min[axis];
                        return trailing + offset < pitch - 1e-6;
                    });
                    if (blocked) continue;
                    const object = adapter.clone(source.object);
                    object.visible = true;
                    object.userData.placement = 'scene';
                    object.userData.uploaded = true;
                    delete object.userData.equipmentOwner;
                    object.userData.conveyorFeedBelt = record.belt;
                    object.userData.conveyorFeedSource = record.sourceRef;
                    object.userData.modelTreeName = `${adapter.label(source)} · 공급 ${++record.sequence}`;
                    place(object, belt, record, mapping, offset);
                    adapter.add(object, record);
                    candidates.push({ object, model: object });
                    dirty = true;
                }
            }
        },
        afterStep() {
            for (const object of [...adapter.models()]) {
                const key = object.userData.conveyorFeedBelt;
                if (!key || !available(object)) continue;
                const mapping = adapter.mappings().find(item => item.action === 'CONVEYOR' && item.gripObjectRef === key);
                const belt = mapping && adapter.resolveBelt(mapping);
                if (!belt) continue;
                const area = conveyorLocalBounds(belt, belt), b = conveyorLocalBounds(object, belt), axis = coordinate(mapping);
                // Picked, manually moved, and placed objects are never removed by the outlet cleanup.
                if (!inLane(b, area, axis)) continue;
                if (b.min[axis] > area.max[axis] + 0.001 || b.max[axis] < area.min[axis] - 0.001) {
                    adapter.remove(object); dirty = true;
                }
            }
            if (dirty) { dirty = false; adapter.changed(); }
        },
        serialize() { return structuredClone([...records.values()]); },
        restore(values) {
            records.clear();
            for (const value of (Array.isArray(values) ? values : []).slice(0, 32)) {
                if (!value || typeof value.belt !== 'string' || typeof value.sourceRef !== 'string' || typeof value.groupId !== 'string'
                    || !Array.isArray(value.matrix) || value.matrix.length !== 16 || !value.matrix.every(Number.isFinite)
                    || !Array.isArray(value.size) || value.size.length !== 3 || !value.size.every(n => Number.isFinite(n) && n > 0)
                    || !Number.isFinite(value.gap) || value.gap < 0 || value.gap > 1000000) continue;
                let variation;
                try { variation = normalizeConveyorFeedVariation(value); } catch { continue; }
                records.set(value.belt, { ...structuredClone(value), ...variation, enabled: value.enabled === true,
                    progress: Number.isFinite(value.progress) && value.progress >= 0 ? value.progress : 0,
                    sequence: Number.isSafeInteger(value.sequence) && value.sequence >= 0 ? value.sequence : 0 });
            }
        },
        reset() { records.clear(); dirty = false; }
    };
}
