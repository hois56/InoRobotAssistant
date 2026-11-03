import * as THREE from 'three';
import { EquipmentScene, equipmentObjectRef } from './equipment-scene.mjs?v=20261103-vacuum-signals-1';
import { createEquipmentUi } from './equipment-ui.mjs?v=20261102-vacuum-range-2';
import { EQUIPMENT_LABELS, normalizeEquipmentDefinition, validateEquipmentDefinitions, equipmentMotionGroups, equipmentReferences, normalizeEquipmentBindings } from './equipment-core.mjs?v=20261101-vacuum-surface-1';

export function createEquipmentApp(adapter) {
    const resolve = ref => {
        const match = String(ref || '').match(/^equipment-model:(.+)\/(-?\d+)$/);
        if (!match) return null;
        const model = adapter.models().find(model => adapter.modelId(model) === match[1]);
        if (!model) return null;
        const index = Number(match[2]);
        const object = index < 0 ? model : adapter.parts(model)[index];
        return object ? { model, object, ref } : null;
    };
    function references(robotsOnly = false) {
        const result = [];
        for (const model of adapter.models()) {
            if (robotsOnly && !model.userData.tcpFrame) continue;
            const id = adapter.modelId(model), label = adapter.modelLabel?.(model) || model.userData.modelTreeName || model.userData.modelName || model.name;
            const rootRef = equipmentObjectRef(id);
            const tool = model.userData.placement === 'tcp' && !!model.userData.attachmentHost?.userData.tcpFrame;
            const toolRobotLabel = tool ? adapter.modelLabel?.(model.userData.attachmentHost) || model.userData.attachmentHost.name : '';
            result.push({ value: rootRef, label, modelLabel: label, tool, toolRobotLabel, parentValue: model.userData.attachmentHost ? equipmentObjectRef(adapter.modelId(model.userData.attachmentHost)) : '' });
            if (!robotsOnly && !model.userData.tcpFrame) adapter.parts(model).forEach((part, index) => {
                const groupIndex = model.userData.modelPartGroups?.findIndex(group => group.parts.includes(index)) ?? -1;
                const partLabel = adapter.partLabel?.(part) || part.userData.modelTreeName || part.userData.modelPartName || part.name || String(index + 1);
                result.push({ value: equipmentObjectRef(id, index), label: `${label} / ${partLabel}`, modelLabel: label, tool, toolRobotLabel, partLabel, parentValue: rootRef, group: model.userData.modelPartGroups?.[groupIndex]?.name || '', groupKey: groupIndex });
            });
        }
        return result;
    }
    function definitionLabel(def) {
        if (def.customName) return def.name;
        const label = references().find(ref => ref.value === def.movingRef)?.label;
        return label ? `${EQUIPMENT_LABELS[def.type] || '컨베이어 이송'} / ${label}` : def.name;
    }
    const within = (object, root) => { while (object) { if (object === root) return true; object = object.parent; } return false; };
    function ioRobot(def, strict = false) {
        if (!def) return null;
        if (def.type === 'OBJECT') {
            def.ioRobotRef = ''; return null;
        }
        const robots = new Set();
        const refs = new Set([...(def.type === 'VACUUM' ? equipmentReferences(def) : equipmentMotionGroups(def).map(([ref]) => ref)), def.bodyRef].filter(Boolean));
        for (const ref of refs) {
            let model = resolve(ref)?.model;
            if (!model || model.userData.tcpFrame) continue;
            const visited = new Set();
            while (model && !visited.has(model)) {
                visited.add(model);
                if (model.userData.tcpFrame) { robots.add(model); break; }
                model = model.userData.attachmentHost || model.parent;
            }
        }
        if (!robots.size && def.type === 'GRIPPER' && def.robotRef) {
            const robot = resolve(def.robotRef)?.object;
            if (robot?.userData.tcpFrame) robots.add(robot);
        }
        if (robots.size > 1) {
            if (strict) throw new Error('서로 다른 로봇의 Tool 모델은 동작을 따로 설정하세요.');
            def.enabled = false; def.ioRobotRef = ''; return null;
        }
        const robot = [...robots][0] || null;
        def.ioRobotRef = robot ? equipmentObjectRef(adapter.modelId(robot)) : '';
        return robot;
    }
    function objects() {
        const structural = adapter.definitions().filter(def => !['OBJECT', 'VACUUM'].includes(def.type)).flatMap(def => [def.bodyRef, ...equipmentReferences(def), ...equipmentMotionGroups(def).map(([ref]) => ref), ...(def.type === 'FILM_PEEL' ? equipmentReferences(def, 'filmGripRef') : [])]).map(resolve).filter(Boolean);
        const registered = adapter.definitions().filter(def => def.type === 'OBJECT' && def.enabled).flatMap(def => equipmentReferences(def)).map(resolve).filter(item => item && !item.model.userData.tcpFrame && !item.model.userData.equipmentFilm);
        return registered.filter((candidate, index) => !registered.some((other, j) => j !== index && (other.object === candidate.object ? j < index : within(candidate.object, other.object)))
            && !structural.some(item => within(item.object, candidate.object) || within(candidate.object, item.object)));
    }
    function releaseUnregistered() {
        const refs = new Set(objects().map(item => item.ref));
        for (const def of adapter.definitions()) if (def.runtime.heldRef && (!refs.has(def.runtime.heldRef) || def.runtime.heldObjects?.some(item => !refs.has(item.ref)))) {
            const active = def.type === 'VACUUM' && def.runtime.vacuumActive;
            runtime.release(def);
            if (active) { def.runtime.vacuumActive = true; def.runtime.acquisitionDone = true; }
        }
    }
    const runtime = new EquipmentScene({ ...adapter, resolve, candidates: objects,
        read: (direction, address, def) => {
            const robot = ioRobot(def);
            return robot && adapter.robotRead ? adapter.robotRead(robot, direction, address) : adapter.read(direction, address);
        }
    });
    function save(def, bindings = null) {
        def = normalizeEquipmentDefinition(def);
        if (bindings) bindings = normalizeEquipmentBindings(bindings);
        ioRobot(def, true);
        adapter.definitions().forEach(item => ioRobot(item));
        if (def.type === 'VACUUM') {
            if (!runtime.objectAttachment(def)) throw new Error('로봇에 설치한 Tool에서 진공을 설정하세요.');
            runtime.contact.sources(def, resolve);
        }
        for (const ref of equipmentReferences(def)) {
            const item = resolve(ref);
            if (!item) throw new Error('선택한 모델 또는 부품을 찾을 수 없습니다.');
            if (['OBJECT', 'VACUUM'].includes(def.type) && item.model.userData.tcpFrame) throw new Error('로봇 대신 대상 모델 또는 부품을 선택하세요.');
            if (def.type === 'OBJECT' && !adapter.isWorkpiece(item.model) && !objects().some(old => old.ref === ref)) throw new Error('장면의 공작물을 오브젝트로 등록하세요.');
        }
        def.name = definitionLabel(def);
        runtime.stop();
        const before = adapter.snapshot();
        const previous = adapter.definitions().find(item => item.id === def.id);
        const sameStructure = previous && ['type', 'bodyRef', 'robotRef', 'axis'].every(key => def[key] === previous[key])
            && (def.type !== 'FILM_PEEL' || ['movingRef', 'pullerRef', 'filmGripRef', 'filmGripSide', 'filmGripOffset', 'filmGripWidth', 'filmLength', 'filmWidth'].every(key => def[key] === previous[key]) && JSON.stringify(def.filmGripRefs) === JSON.stringify(previous.filmGripRefs));
        const simple = ['OBJECT', 'VACUUM'].includes(def.type);
        if (simple) {
            if (def.type === 'OBJECT') runtime.captureObjectOrigins(def, previous?.type === 'OBJECT' ? previous : null);
            if (previous && previous.type === def.type && JSON.stringify(equipmentReferences(previous)) === JSON.stringify(equipmentReferences(def))) {
                if (def.type === 'OBJECT' || previous.vacuumMode !== def.vacuumMode || JSON.stringify(previous.vacuumFace) !== JSON.stringify(def.vacuumFace)) { runtime.release(previous); def.runtime = { position: 0, heldRef: '', heldObjects: [], vacuumActive: false }; }
                else def.runtime = JSON.parse(JSON.stringify(previous.runtime));
            }
        } else if (sameStructure) {
            def.origins = JSON.parse(JSON.stringify(previous.origins)); def.runtime = JSON.parse(JSON.stringify(previous.runtime));
            if (def.type === 'FILM_PEEL' && (def.filmLength !== previous.filmLength || def.filmWidth !== previous.filmWidth)) { def.runtime.position = 0; def.runtime.film = null; def.runtime.released = false; runtime.films.delete(def.id); }
            def.runtime.position = Math.min(def.travel, def.runtime.position);
            const frame = runtime.frame(previous);
            const inverse = frame.clone().invert();
            for (const [ref, sign] of equipmentMotionGroups(def)) {
                const oldSign = equipmentMotionGroups(previous).find(([oldRef]) => oldRef === ref)?.[1];
                if (def.origins.objects[ref] && oldSign === sign) continue;
                const object = resolve(ref)?.object;
                if (!object) throw new Error('가동부 또는 탑재물을 찾을 수 없습니다.');
                object.updateWorldMatrix(true, true);
                def.origins.objects[ref] = runtime.motionDelta(def, sign).invert().multiply(inverse).multiply(object.matrixWorld).toArray();
            }
            if (!def.bodyRef) {
                const model = resolve(def.movingRef)?.model;
                if (model && !equipmentMotionGroups(def).some(([ref]) => resolve(ref)?.object === model)) {
                    model.updateWorldMatrix(true, false);
                    def.origins.anchorRef = equipmentObjectRef(adapter.modelId(model));
                    def.origins.anchorLocal = model.matrixWorld.clone().invert().multiply(frame).toArray();
                    delete def.origins.followMoving;
                } else {
                    def.origins.followMoving = true;
                    delete def.origins.anchorRef; delete def.origins.anchorLocal;
                }
            }
        }
        else {
            if (previous?.type === 'FILM_PEEL' && def.type === 'FILM_PEEL') runtime.reset([previous]);
            runtime.capture(def);
        }
        const next = [...adapter.definitions().filter(item => item.id !== def.id), def];
        validateEquipmentDefinitions(next);
        // A model cannot be both a fixed parent and a descendant of its mover.
        const body = resolve(def.bodyRef)?.object;
        for (const [ref] of equipmentMotionGroups(def)) {
            let object = body;
            while (object) { if (object === resolve(ref)?.object) throw new Error('고정부는 가동부의 하위 부품일 수 없습니다.'); object = object.parent; }
        }
        const controlled = next.flatMap(item => equipmentMotionGroups(item).map(([ref, sign]) => ({ id: item.id, sign, object: resolve(ref)?.object })));
        for (let i = 0; i < controlled.length; i++) for (let j = i + 1; j < controlled.length; j++) {
            const a = controlled[i], b = controlled[j];
            if (a.object && b.object && (a.object === b.object && a.id !== b.id || a.id === b.id && a.sign !== b.sign && (within(a.object, b.object) || within(b.object, a.object)))) throw new Error('동일한 부품을 서로 다른 동작에 지정하거나 상위·하위 부품을 반대 방향에 지정할 수 없습니다.');
        }
        if (previous && (!sameStructure || simple && JSON.stringify(equipmentReferences(previous)) !== JSON.stringify(equipmentReferences(def)))) runtime.release(previous);
        adapter.setDefinitions(next);
        releaseUnregistered();
        runtime.restore(next);
        if (def.type === 'OBJECT') adapter.removeBindings?.(def.id);
        else if (bindings) adapter.updateBindings(def, bindings);
        adapter.history('설비 동작 설정', before);
        adapter.changed(); return def;
    }
    function remove(id) {
        runtime.stop();
        const before = adapter.snapshot(); const def = adapter.definitions().find(item => item.id === id);
        if (def) {
            runtime.release(def);
            if (def.type === 'FILM_PEEL') {
                const frame = runtime.frame(def).multiply(new THREE.Matrix4().fromArray(def.origins.objects[def.movingRef]));
                for (const source of def.origins.filmTabs || []) {
                    const tab = resolve(source.ref);
                    if (tab) runtime.applyWorld(tab.object, frame.clone().multiply(new THREE.Matrix4().fromArray(source.local)));
                }
            }
            for (const address of [def.feedbackHome, def.feedbackEnd, def.feedbackGrip]) if (address !== null) adapter.sensor(address, false, def);
            const film = runtime.films.get(id);
            if (film) {
                const mesh = film.object.getObjectByName('equipment-film-mesh');
                if (mesh) { film.object.remove(mesh); mesh.geometry.dispose(); mesh.material.dispose(); }
                let index = 0; film.object.traverse(child => { if (child.isMesh) child.visible = def.runtime.filmVisibility?.[index++] ?? true; });
                const root = resolve(def.movingRef)?.model; if (root) delete root.userData.equipmentFilm;
            }
        }
        adapter.setDefinitions(adapter.definitions().filter(item => item.id !== id));
        releaseUnregistered();
        adapter.removeBindings?.(id);
        runtime.films.delete(id); runtime.status.delete(id);
        adapter.history('설비 삭제', before); adapter.changed();
    }
    function resetObjects(target = 'all') {
            let selected = resolve(target);
            const source = selected?.model.userData.gripObjectSource;
            if (source?.mode === 'part-copy') selected = resolve(equipmentObjectRef(source.sourceModelId, source.sourcePartIndex)) || selected;
            const definitions = adapter.definitions().filter(def => def.type === 'OBJECT'
                && (selected || target === 'all' || target === `equipment:${def.id}`)).map(def => {
                    if (!selected) return def;
                    const movingRefs = equipmentReferences(def).filter(ref => {
                        const item = resolve(ref);
                        return item && (within(item.object, selected.object) || within(selected.object, item.object));
                    });
                    return movingRefs.length ? { ...def, movingRef: movingRefs[0], movingRefs } : null;
                }).filter(Boolean);
            if (!definitions.length) throw new Error('원위치로 되돌릴 등록 오브젝트가 없습니다.');
            const before = adapter.snapshot();
            const targets = definitions.flatMap(def => equipmentReferences(def)).map(resolve).filter(Boolean);
            for (const def of adapter.definitions()) {
                const held = [def.runtime.heldRef, ...(def.runtime.heldObjects || []).map(item => item.ref)].map(resolve).filter(Boolean);
                if (held.some(item => targets.some(target => within(item.object, target.object) || within(target.object, item.object)))) {
                    runtime.release(def);
                    if (def.type === 'OBJECT') runtime.manual.delete(def.id);
                    else if (def.type === 'VACUUM') runtime.manual.set(def.id, 'REVERSE');
                }
            }
            runtime.resetObjects(definitions);
            adapter.history('오브젝트 원위치', before);
            adapter.changed({ runtimeOnly: true });
    }
    function command(id, command) {
        if (command === 'RESET' && adapter.definitions().some(def => def.id === id && def.type === 'OBJECT')) { resetObjects('equipment:' + id); return; }
        if (adapter.definitions().some(def => def.id === id && def.type === 'VACUUM' && !def.enabled)) throw new Error('진공 동작을 편집하여 흡착 면을 선택하세요.');
        runtime.manual.set(id, command); runtime.start();
        runtime.signalVacuum(adapter.definitions().find(def => def.id === id), adapter.mappings?.() || []);
        adapter.changed({ runtimeOnly: true });
    }
    const ui = createEquipmentUi({
        definitions: adapter.definitions, references, label: definitionLabel, save, remove, select: adapter.select, selectedReferences: adapter.selectedReferences, popout: adapter.popout, hide: adapter.hide, front: adapter.front,
        pickFace: (ref, done) => adapter.pickVacuumFace?.(ref, done),
        bindings: (def, ref) => adapter.bindings?.(def, ref),
        conveyorDefinition: adapter.conveyorDefinition,
        conveyorCommand: adapter.conveyorCommand,
        saveConveyor: (def, bindings) => adapter.saveConveyor(def, normalizeEquipmentBindings(bindings)),
        status: id => runtime.status.get(id), changed: adapter.changed,
        global(command) {
            const before = command === 'reset' ? adapter.snapshot() : null;
            if (command === 'start') { runtime.manual.clear(); runtime.start(); }
            else if (command === 'pause') runtime.pause();
            else if (command === 'reset') {
                runtime.stop();
                adapter.conveyorControl?.(command, runtime.paused);
                runtime.reset(adapter.definitions());
                adapter.conveyorControl?.('stop', runtime.paused);
                adapter.history('모두 원위치', before);
            }
            else runtime.stop();
            if (command !== 'reset') adapter.conveyorControl?.(command, runtime.paused);
            adapter.changed({ runtimeOnly: true });
        },
        command
    });
    let lastStatusAt = 0;
    let lastErrors = '';
    let lastSaveAt = 0, savedPositions = '';
    function expectedContact(hit) {
        const a = hit.meshA || hit.objectA, b = hit.meshB || hit.objectB;
        return adapter.definitions().some(def => {
            const moving = equipmentMotionGroups(def).map(([ref]) => ref);
            const pairs = moving.map(ref => [def.bodyRef, ref]);
            for (let i = 0; i < moving.length; i++) for (let j = i + 1; j < moving.length; j++) pairs.push([moving[i], moving[j]]);
            if (def.type === 'GRIPPER') pairs.push(...moving.map(ref => [ref, def.runtime.heldRef]));
            if (def.type === 'VACUUM' && def.runtime.heldRef) {
                if ((def.runtime.heldObjects || []).some(item => {
                    const mount = runtime.contact.atPath(resolve(item.anchorRef || def.movingRef)?.model, item.meshPath), held = resolve(item.ref)?.object;
                    if (!mount) return false;
                    return held && (within(a, mount) && within(b, held) || within(b, mount) && within(a, held));
                })) return true;
            }
            if (def.type === 'FILM_PEEL') {
                const gripper = adapter.definitions().find(item => item.type === 'GRIPPER' && (item.bodyRef === def.pullerRef || equipmentMotionGroups(item).some(([ref]) => ref === def.pullerRef)));
                const gripperParts = gripper ? [gripper.bodyRef, ...equipmentMotionGroups(gripper).map(([ref]) => ref)] : [def.pullerRef];
                pairs.push(...equipmentReferences(def, 'filmGripRef').flatMap(ref => gripperParts.map(part => [ref, part])));
            }
            return pairs.some(([left, right]) => {
                const l = resolve(left)?.object, r = resolve(right)?.object;
                return l && r && (within(a, l) && within(b, r) || within(a, r) && within(b, l));
            });
        });
    }
    return {
        runtime, ui, resolve, references, save, remove, objects, ioRobot, command,
        needsVacuumIoPose(robot, direction, values) {
            return (adapter.mappings?.() || []).some(mapping => {
                if (!mapping.enabled || mapping.direction !== direction || values?.[mapping.address] !== mapping.triggerValue) return false;
                const def = adapter.definitions().find(item => mapping.gripObjectRef === 'equipment:' + item.id);
                if (!def?.enabled || def.type !== 'VACUUM' || ioRobot(def) !== robot) return false;
                return mapping.equipmentCommand === 'FORWARD' ? !def.runtime.vacuumActive
                    : ['REVERSE', 'RESET'].includes(mapping.equipmentCommand) && !!(def.runtime.vacuumActive || def.runtime.heldRef);
            });
        },
        signalRobotIo(robot, direction, addresses) {
            const changed = new Set(addresses.map(Number));
            for (const mapping of adapter.mappings?.() || []) {
                if (!mapping.enabled || mapping.direction !== direction || !changed.has(Number(mapping.address))) continue;
                const def = adapter.definitions().find(item => mapping.gripObjectRef === 'equipment:' + item.id);
                if (ioRobot(def) !== robot) continue;
                runtime.manual.delete(def.id); runtime.start();
                runtime.signalVacuum(def, adapter.mappings?.() || []);
            }
        },
        resetObjects,
        isRegistered(model, part = null) {
            const source = model.userData.gripObjectSource;
            const original = source?.mode === 'part-copy' ? resolve(equipmentObjectRef(source.sourceModelId, source.sourcePartIndex)) : null;
            return objects().some(item => item.model === model && within(part || model, item.object) || original && item.model === original.model && within(original.object, item.object));
        },
        update(timestamp, mappings) {
            runtime.update(adapter.definitions(), mappings, timestamp, document.hidden);
            const errors = JSON.stringify([...runtime.status.values()].map(status => status.error));
            if (timestamp - lastStatusAt > 150 || errors !== lastErrors) { lastStatusAt = timestamp; lastErrors = errors; ui.updateStatus(); }
            const positions = JSON.stringify(adapter.definitions().map(def => [def.runtime.position, def.runtime.heldRef, def.runtime.released, def.runtime.vacuumActive, def.runtime.motionCommand]));
            if (positions !== savedPositions && timestamp - lastSaveAt > 1000) { savedPositions = positions; lastSaveAt = timestamp; adapter.saveProgress?.(); }
        },
        targets(type) { return adapter.definitions().filter(def => def.type === type).map(def => {
            const robot = ioRobot(def), robotLabel = robot && (adapter.modelLabel?.(robot) || robot.userData.motionDisplayName || robot.name);
            const label = definitionLabel(def);
            return { value: `equipment:${def.id}`, label: robotLabel ? `${robotLabel} / ${label}` : label };
        }); },
        label: definitionLabel,
        restore() {
            for (const def of adapter.definitions()) {
                if (def.type === 'OBJECT') {
                    def.runtime.legacyIoMappings ||= JSON.parse(JSON.stringify((adapter.mappings?.() || []).filter(mapping => mapping.gripObjectRef === 'equipment:' + def.id)));
                    def.runtime.legacyFeedbackGrip ??= def.feedbackGrip;
                    runtime.release(def); def.feedbackGrip = null;
                    adapter.removeBindings?.(def.id);
                    continue;
                }
                if (def.type === 'VACUUM' && !def.enabled) runtime.release(def);
                ioRobot(def);
                def.name = definitionLabel(def);
            }
            releaseUnregistered(); runtime.restore(adapter.definitions()); ui.render();
        },
        signal(mapping) {
            const id = mapping.gripObjectRef.replace('equipment:', '');
            runtime.manual.delete(id); runtime.start();
            runtime.signalVacuum(adapter.definitions().find(def => def.id === id), adapter.mappings?.() || []);
        },
        active(mappings) { return runtime.hasWork(adapter.definitions(), mappings); },
        expectedContact,
        collision(hits, stop) {
            if (!stop || runtime.suspended || runtime.paused) return false;
            for (const def of adapter.definitions()) {
                if (def.robotRef && adapter.externalDriven?.(def)) continue;
                const roots = [...equipmentMotionGroups(def).map(([ref]) => ref), def.runtime.heldRef, ...(def.runtime.heldObjects || []).map(item => item.ref)].map(resolve).filter(Boolean).map(resolved => resolved.object);
                if (hits.some(hit => !expectedContact(hit) && roots.some(root => within(hit.meshA || hit.objectA, root) || within(hit.meshB || hit.objectB, root)))) {
                    runtime.stop(); runtime.status.set(def.id, { phase: '충돌 정지', position: def.runtime.position, error: '주변 장애물과 충돌하여 설비를 정지했습니다.' });
                    ui.updateStatus(); return true;
                }
            }
            return false;
        }
    };
}
