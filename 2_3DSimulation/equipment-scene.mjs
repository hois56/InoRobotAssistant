import * as THREE from 'three';
import { equipmentFeedback, resolveEquipmentCommand, stepEquipmentPosition, equipmentMotionGroups, equipmentReferences } from './equipment-core.mjs?v=20261007-object-reset-1';
import { createFilmState, stepFilm, getFilmGripLayout, getFilmPeelFromGrip } from './film-peeling-core.mjs';
import { conveyorLocalBounds } from './conveyor-scene.mjs';
import { MeshCollisionSystem } from './collision-system.mjs?v=20261007-vacuum-margin-1';

export function equipmentObjectRef(modelId, partIndex = -1) { return `equipment-model:${modelId}/${partIndex}`; }

export class EquipmentScene {
    constructor(adapter) {
        this.adapter = adapter;
        this.lastTime = null;
        this.accumulator = 0;
        this.paused = false;
        this.manual = new Map();
        this.status = new Map();
        this.films = new Map();
        this.contact = new MeshCollisionSystem({ persistentHitGraceMs: 0 });
        this.suspended = true;
    }

    frame(def) {
        const body = this.adapter.resolve(def.bodyRef)?.object;
        const robot = this.adapter.resolve(def.robotRef)?.object;
        if (def.bodyRef && !body) throw new Error('설비 본체를 찾을 수 없습니다.');
        if (def.type === 'GRIPPER' && def.robotRef && !robot) throw new Error('그리퍼 로봇을 찾을 수 없습니다.');
        if (def.type === 'GRIPPER' && robot) {
            const mount = this.adapter.mount(robot);
            if (!mount) throw new Error('로봇의 툴 프레임이 없습니다.');
            mount.updateWorldMatrix(true, false);
            const matrix = mount.matrixWorld.clone().multiply(new THREE.Matrix4().fromArray(def.origins.mountOffset));
            if (body) this.applyWorld(body, matrix);
            return matrix;
        }
        if (body) { body.updateWorldMatrix(true, false); return body.matrixWorld.clone(); }
        const anchor = this.adapter.resolve(def.origins.anchorRef)?.object;
        if (anchor && def.origins.anchorLocal) {
            anchor.updateWorldMatrix(true, false);
            return anchor.matrixWorld.clone().multiply(new THREE.Matrix4().fromArray(def.origins.anchorLocal));
        }
        if (def.origins.followMoving) {
            const moving = this.adapter.resolve(def.movingRef)?.object;
            if (!moving) throw new Error('이동 대상을 찾을 수 없습니다.');
            moving.updateWorldMatrix(true, false);
            return moving.matrixWorld.clone()
                .multiply(new THREE.Matrix4().fromArray(def.origins.objects[def.movingRef]).invert())
                .multiply(this.motionDelta(def, 1, def.runtime.appliedPosition ?? def.runtime.position).invert());
        }
        return new THREE.Matrix4().fromArray(def.origins.frame || new THREE.Matrix4().toArray());
    }

    capture(def) {
        const body = this.adapter.resolve(def.bodyRef)?.object;
        const resolved = this.adapter.resolve(def.movingRef);
        const moving = resolved?.object;
        if (!moving) throw new Error('가동부를 찾을 수 없습니다.');
        moving.updateWorldMatrix(true, true);
        const reference = body || resolved.model;
        reference.updateWorldMatrix(true, true);
        const frame = reference.matrixWorld.clone();
        def.origins = { frame: frame.toArray(), objects: {} };
        if (!body) {
            const controlled = equipmentMotionGroups(def).map(([ref]) => this.adapter.resolve(ref)?.object);
            if (!controlled.includes(resolved.model)) {
                def.origins.anchorRef = equipmentObjectRef(this.adapter.modelId(resolved.model));
                def.origins.anchorLocal = resolved.model.matrixWorld.clone().invert().multiply(frame).toArray();
            } else def.origins.followMoving = true;
        }
        const robot = this.adapter.resolve(def.robotRef)?.object;
        if (def.type === 'GRIPPER' && robot) {
            const mount = this.adapter.mount(robot);
            if (!mount) throw new Error('로봇의 툴 프레임이 없습니다.');
            mount.updateWorldMatrix(true, false);
            def.origins.mountOffset = mount.matrixWorld.clone().invert().multiply(frame).toArray();
        }
        const inverse = frame.clone().invert();
        for (const [ref] of equipmentMotionGroups(def)) {
            const object = this.adapter.resolve(ref)?.object;
            if (!object) throw new Error('가동부 또는 탑재물을 찾을 수 없습니다.');
            object.updateWorldMatrix(true, true);
            def.origins.objects[ref] = inverse.clone().multiply(object.matrixWorld).toArray();
        }
        def.runtime = { position: 0, appliedPosition: 0, heldRef: '', heldLocal: null, film: null };
        if (def.type === 'FILM_PEEL') {
            const filmFrame = frame.clone().multiply(new THREE.Matrix4().fromArray(def.origins.objects[def.movingRef]));
            const handles = equipmentReferences(def, 'filmGripRef').map(ref => this.adapter.resolve(ref)?.object);
            const bounds = new THREE.Box3(), inverseFilm = moving.matrixWorld.clone().invert();
            moving.traverse(mesh => {
                if (!mesh.isMesh || !mesh.geometry || mesh.name === 'equipment-film-mesh') return;
                for (let node = mesh; node; node = node.parent) if (handles.includes(node)) return;
                mesh.geometry.computeBoundingBox();
                const box = mesh.geometry.boundingBox, transform = inverseFilm.clone().multiply(mesh.matrixWorld);
                for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) bounds.expandByPoint(new THREE.Vector3(x, y, z).applyMatrix4(transform));
            });
            const offset = bounds.isEmpty() ? [0,0,0] : [bounds.min.x, (bounds.min.y + bounds.max.y) / 2, (bounds.min.z + bounds.max.z) / 2];
            def.origins.filmBaseOffset = offset;
            const baseInverse = filmFrame.clone().multiply(new THREE.Matrix4().makeTranslation(...offset)).invert();
            const tabs = equipmentReferences(def, 'filmGripRef').map(ref => {
                const tab = this.adapter.resolve(ref)?.object;
                if (!tab) throw new Error('필름 손잡이 부품을 찾을 수 없습니다.');
                if (tab === moving) throw new Error('필름 전체 대신 손잡이 부품을 선택하세요.');
                tab.updateWorldMatrix(true, true);
                const center = new THREE.Box3().setFromObject(tab).getCenter(new THREE.Vector3());
                const point = center.clone().applyMatrix4(filmFrame.clone().invert()).toArray();
                return { ref, point, local: filmFrame.clone().invert().multiply(tab.matrixWorld).toArray(), layout: getFilmGripLayout(def, center.applyMatrix4(baseInverse).toArray()) };
            });
            def.origins.filmTabs = tabs;
            const layout = tabs[0]?.layout || getFilmGripLayout(def);
            def.origins.filmLayout = layout; def.travel = layout.length;
            def.filmGripSide = layout.side; def.filmGripOffset = layout.gripOffset * 100;
        }
    }

    applyWorld(object, world) {
        const local = object.parent ? (object.parent.updateWorldMatrix(true, false), object.parent.matrixWorld.clone().invert().multiply(world)) : world;
        local.decompose(object.position, object.quaternion, object.scale);
        if (object.matrixAutoUpdate === false) { object.matrix.copy(local); object.matrixWorldNeedsUpdate = true; }
        object.updateMatrixWorld(true);
    }

    commands(def, mappings) {
        if (this.manual.has(def.id)) return resolveEquipmentCommand([this.manual.get(def.id)]);
        const commands = mappings.filter(mapping => mapping.enabled && mapping.gripObjectRef === `equipment:${def.id}`
            && this.adapter.read(mapping.direction, mapping.address) === mapping.triggerValue).map(mapping => mapping.equipmentCommand);
        if (def.type === 'VACUUM' && commands.includes('REVERSE')) return { command: 'REVERSE', error: '' };
        return resolveEquipmentCommand(commands);
    }

    start() { this.suspended = false; this.paused = false; this.lastTime = null; this.accumulator = 0; }
    pause() { this.paused = !this.paused; this.lastTime = null; this.accumulator = 0; }
    stop() { this.suspended = true; this.manual.clear(); this.lastTime = null; this.accumulator = 0; }
    clear() { this.stop(); this.status.clear(); this.films.clear(); }

    hasWork(definitions, mappings) {
        if (this.suspended || this.paused || document.hidden) return false;
        return definitions.some(def => def.enabled && def.type !== 'OBJECT' && (def.type === 'VACUUM' && def.runtime.heldRef || def.externalAxis || this.commands(def, mappings).command !== 'STOP'
            || (def.type === 'FILM_PEEL' && def.runtime.position > 0)));
    }

    captureObjectOrigins(def, previous = null) {
        const saved = previous?.origins?.objectWorld || def.origins?.objectWorld || {};
        const objectWorld = {};
        for (const ref of equipmentReferences(def)) {
            const object = this.adapter.resolve(ref)?.object;
            if (!object) continue;
            const matrix = saved[ref];
            if (Array.isArray(matrix) && matrix.length === 16 && matrix.every(Number.isFinite)) objectWorld[ref] = [...matrix];
            else {
                object.updateWorldMatrix(true, false);
                objectWorld[ref] = object.matrixWorld.toArray();
            }
        }
        def.origins = { objectWorld };
    }

    resetObjects(definitions) {
        const entries = new Map();
        for (const def of definitions.filter(item => item.type === 'OBJECT')) {
            for (const ref of equipmentReferences(def)) {
                const target = this.adapter.resolve(ref);
                const matrix = def.origins?.objectWorld?.[ref];
                if (!target || !Array.isArray(matrix) || matrix.length !== 16 || !matrix.every(Number.isFinite)) continue;
                if (target.object === target.model) this.adapter.release(target);
                delete target.object.userData.equipmentOwner;
                if (!entries.has(target.object)) entries.set(target.object, { ...target, matrix });
            }
        }
        const depth = object => { let result = 0; while (object.parent) { result++; object = object.parent; } return result; };
        for (const target of [...entries.values()].sort((a, b) => depth(a.object) - depth(b.object))) {
            this.applyWorld(target.object, new THREE.Matrix4().fromArray(target.matrix));
            this.adapter.dirty(target.model);
        }
    }

    reset(definitions) {
        for (const def of definitions) {
            this.release(def);
            def.runtime.position = 0; def.runtime.film = null; def.runtime.released = false;
            delete def.runtime.filmGripLocal; delete def.runtime.filmGripEdgeLocal; def.runtime.filmGripped = false;
            delete def.runtime.filmActiveTab;
            delete def.runtime.filmActiveTabLocal;
            this.films.delete(def.id);
        }
        for (const def of definitions) {
            this.apply(def, 0);
            this.writeFeedback(def, false);
            this.status.set(def.id, { phase: '정지', position: 0, error: '' });
        }
        this.resetObjects(definitions);
        this.stop();
    }

    update(definitions, mappings, timestamp, hidden = false) {
        const delta = this.lastTime === null ? 0 : (timestamp - this.lastTime) / 1000;
        this.lastTime = timestamp;
        if (this.suspended || this.paused || hidden || delta < 0 || delta > 0.25) { this.lastTime = null; this.accumulator = 0; return; }
        this.accumulator += delta;
        const steps = Math.floor((this.accumulator + 1e-9) * 60);
        const dt = 1 / 60;
        this.accumulator -= steps * dt;
        // A carrier must update before an actuator mounted on that carrier.
        const within = (object, root) => { while (object) { if (object === root) return true; object = object.parent; } return false; };
        const ordered = [], visiting = new Set(), done = new Set();
        const visit = def => {
            if (done.has(def) || visiting.has(def)) return;
            visiting.add(def);
            const frameObject = this.adapter.resolve(def.bodyRef || def.origins.anchorRef)?.object || this.adapter.resolve(def.movingRef)?.object;
            for (const parent of definitions) {
                if (parent !== def && equipmentMotionGroups(parent).some(([ref]) => within(frameObject, this.adapter.resolve(ref)?.object))) visit(parent);
            }
            visiting.delete(def); done.add(def); ordered.push(def);
        };
        definitions.forEach(visit);
        for (const def of ordered) {
            if (!def.enabled) continue;
            const positionBefore = def.runtime.position;
            try {
                const { command, error } = this.commands(def, mappings);
                if (error) throw new Error(error);
                if (def.type === 'OBJECT') { this.status.set(def.id, { phase: '등록됨', position: 0, error: '' }); continue; }
                if (def.type === 'VACUUM') {
                    this.applyVacuum(def, command === 'FORWARD');
                    this.writeFeedback(def, !!def.runtime.heldRef);
                    this.status.set(def.id, { phase: def.runtime.heldRef ? '흡착 중' : command === 'FORWARD' ? '흡착 대기' : '해제', position: 0, error: '', held: !!def.runtime.heldRef });
                    continue;
                }
                if (def.type === 'FILM_PEEL' && command === 'REVERSE') throw new Error('박리한 필름은 후진으로 재부착할 수 없습니다. 초기화를 사용하세요.');
                if (command === 'RELEASE') {
                    if (def.type !== 'FILM_PEEL') throw new Error('파지 해제 명령은 필름 박리 설비에서 사용합니다.');
                    if (def.runtime.position < def.travel) throw new Error('필름을 완전히 박리한 후 파지를 해제하세요.');
                    def.runtime.released = true;
                }
                if (command === 'RESET' && def.runtime.lastCommand !== 'RESET') {
                    this.release(def); def.runtime.position = 0; def.runtime.film = null; def.runtime.released = false; this.films.delete(def.id);
                    delete def.runtime.filmGripLocal; delete def.runtime.filmGripEdgeLocal; def.runtime.filmGripped = false;
                    delete def.runtime.filmActiveTab;
                    delete def.runtime.filmActiveTabLocal;
                }
                def.runtime.lastCommand = command;
                if (def.type === 'FILM_PEEL' && (def.pullerRef || def.robotRef) && command !== 'RESET' && !def.runtime.released) {
                    this.apply(def, 0);
                    if (!def.runtime.filmGripped) {
                        this.status.set(def.id, { phase: '손잡이 파지 대기', position: def.runtime.position, error: '', held: false });
                        this.writeFeedback(def, false); continue;
                    }
                }
                let target = command === 'FORWARD' ? def.travel : command === 'REVERSE' ? 0 : def.runtime.position;
                const pulledFilm = def.type === 'FILM_PEEL' && (def.pullerRef || def.robotRef) && !def.runtime.released;
                if (pulledFilm && command === 'FORWARD') target = Math.max(def.runtime.position, def.runtime.filmPullTarget ?? 0);
                if (def.type === 'GRIPPER' && def.runtime.heldRef && command === 'FORWARD') target = def.runtime.gripContactPosition ?? def.runtime.position;
                if (def.type === 'GRIPPER' && def.runtime.filmGripOwner && command === 'FORWARD') target = def.runtime.filmGripContactPosition;
                if (def.externalAxis) {
                    const robot = this.adapter.resolve(def.robotRef)?.object;
                    if (!robot) throw new Error('E축 로봇을 찾을 수 없습니다.');
                    target = this.adapter.externalAxis(robot, def.externalAxis - 1);
                    if (!Number.isFinite(target) || target < 0 || target > def.travel) throw new Error('E축 값이 설비의 허용 범위를 벗어났습니다.');
                }
                for (let step = 0; step < steps; step++) {
                    const current = def.runtime.position;
                    const actualTarget = def.type === 'GRIPPER' && def.runtime.heldRef && command === 'FORWARD' ? def.runtime.gripContactPosition : target;
                    def.runtime.position = def.externalAxis || pulledFilm ? actualTarget : stepEquipmentPosition(current, actualTarget, actualTarget >= current ? def.speed : def.reverseSpeed, dt);
                    this.apply(def, dt);
                }
                const feedback = equipmentFeedback(def.runtime.position, def.travel);
                const inMotion = def.type === 'FILM_PEEL' ? target !== def.runtime.position : Math.abs(target - def.runtime.position) > 0.01;
                const held = !!(def.runtime.heldRef || def.runtime.filmGripOwner);
                this.status.set(def.id, { phase: inMotion ? '이동 중' : command === 'STOP' ? '정지' : '완료', position: def.runtime.position, error: '', held });
                this.writeFeedback(def, def.type === 'FILM_PEEL' ? !def.runtime.released : held);
            } catch (error) {
                def.runtime.position = positionBefore;
                if (!this.adapter.resolve(def.movingRef) || (def.bodyRef && !this.adapter.resolve(def.bodyRef))) this.release(def);
                this.status.set(def.id, { phase: '오류', position: def.runtime.position, error: error.message, held: !!def.runtime.heldRef });
                this.writeFeedback(def, false, true);
            }
        }
    }

    writeFeedback(def, held, fault = false) {
        const feedback = equipmentFeedback(def.runtime.position, def.travel);
        if (def.type === 'FILM_PEEL') feedback.end = def.runtime.position >= def.travel;
        if (def.type === 'GRIPPER' && held) feedback.end = true;
        for (const [address, value] of [[def.feedbackHome, feedback.home], [def.feedbackEnd, feedback.end], [def.feedbackGrip, held]]) {
            if (address !== null) this.adapter.sensor(address, fault ? false : value);
        }
    }

    motionDelta(def, sign = 1, position = def.runtime.position) {
        const axis = new THREE.Vector3(); axis[def.axis.slice(-1).toLowerCase()] = def.axis.startsWith('-') ? -1 : 1;
        let value = position;
        if (def.type === 'GRIPPER') value = -(def.openWidth - def.closedWidth) / 2 * (value / def.travel);
        if (def.type === 'ROTARY_AXIS') {
            const pivot = new THREE.Vector3(...def.pivot);
            return new THREE.Matrix4().makeTranslation(...pivot.toArray())
                .multiply(new THREE.Matrix4().makeRotationAxis(axis, THREE.MathUtils.degToRad(value)))
                .multiply(new THREE.Matrix4().makeTranslation(...pivot.negate().toArray()));
        }
        return new THREE.Matrix4().makeTranslation(...axis.multiplyScalar(value * sign).toArray());
    }

    apply(def, seconds) {
        if (def.type === 'OBJECT') return;
        if (def.type === 'VACUUM') { this.followVacuum(def); return; }
        const moving = this.adapter.resolve(def.movingRef);
        if (!moving) throw new Error('가동부가 삭제되었거나 누락되었습니다.');
        const frame = this.frame(def);
        if (def.type === 'FILM_PEEL') { this.applyFilm(def, moving.object, frame.clone().multiply(new THREE.Matrix4().fromArray(def.origins.objects[def.movingRef])), seconds); return; }
        // Apply ancestors first, then restore each descendant's intended world pose.
        // Selecting both a model and one of its parts must not double the motion.
        const depth = object => { let value = 0; while (object?.parent) { value++; object = object.parent; } return value; };
        const groups = equipmentMotionGroups(def).map(([ref, sign]) => ({ ref, sign, resolved: this.adapter.resolve(ref) }));
        for (const { ref, resolved } of groups) {
            if (!resolved || !def.origins.objects[ref]) throw new Error('가동부 참조 또는 기준 위치가 없습니다.');
        }
        groups.sort((a, b) => depth(a.resolved.object) - depth(b.resolved.object));
        for (const { ref, sign, resolved } of groups) {
            const delta = this.motionDelta(def, sign);
            this.applyWorld(resolved.object, frame.clone().multiply(delta).multiply(new THREE.Matrix4().fromArray(def.origins.objects[ref])));
            this.adapter.dirty(resolved.model);
        }
        def.runtime.appliedPosition = def.runtime.position;
        if (def.type === 'GRIPPER') this.applyGrip(def, frame);
    }

    applyGrip(def, frame) {
        if (def.runtime.filmGripOwner) return;
        const gap = def.openWidth - (def.openWidth - def.closedWidth) * def.runtime.position / def.travel;
        const held = this.adapter.resolve(def.runtime.heldRef);
        if (held && gap >= def.openWidth * 0.85) { this.release(def); return; }
        if (held) {
            this.applyWorld(held.object, frame.clone().multiply(new THREE.Matrix4().fromArray(def.runtime.heldLocal)));
            held.object.userData.equipmentOwner = def.id;
            this.adapter.dirty(held.model); return;
        }
        if (def.runtime.heldRef) throw new Error('파지 중인 물체가 없습니다.');
        const body = this.adapter.resolve(def.bodyRef)?.object;
        if (!body) throw new Error('그리퍼 본체를 선택하세요.');
        const owned = new Set([def.bodyRef, ...equipmentMotionGroups(def).map(([ref]) => ref)]);
        for (const candidate of this.adapter.candidates()) {
            if (owned.has(candidate.ref) || candidate.object.userData.equipmentOwner || candidate.model.userData.equipmentOwner || candidate.model.userData.attachmentHost || candidate.model.userData.tcpFrame || candidate.model.visible === false) continue;
            const bounds = conveyorLocalBounds(candidate.object, body);
            const coordinate = def.axis.slice(-1).toLowerCase();
            const transverse = coordinate === 'x' ? 'y' : 'x';
            const height = coordinate === 'z' ? 'y' : 'z';
            const width = bounds.max[coordinate] - bounds.min[coordinate];
            const center = bounds.getCenter(new THREE.Vector3());
            const gripCenter = new THREE.Vector3(...def.gripCenter);
            if (width <= def.closedWidth || width >= def.openWidth || Math.abs(center[coordinate] - gripCenter[coordinate]) > 3
                || Math.abs(center[transverse] - gripCenter[transverse]) + (bounds.max[transverse] - bounds.min[transverse]) / 2 > def.gripDepth / 2
                || bounds.min[height] < gripCenter[height] - def.gripHeight / 2 || bounds.max[height] > gripCenter[height] + def.gripHeight / 2 || gap > width + 1) continue;
            const robot = this.adapter.resolve(def.robotRef)?.object;
            if (robot && candidate.object === candidate.model && !this.adapter.grab(candidate, robot)) continue;
            const object = candidate.object;
            object.updateWorldMatrix(true, false);
            def.runtime.heldRef = candidate.ref;
            def.runtime.heldLocal = frame.clone().invert().multiply(object.matrixWorld).toArray();
            candidate.object.userData.equipmentOwner = def.id;
            // Stop at contact rather than pass the fingers through the workpiece.
            def.runtime.position = def.travel * (def.openWidth - width) / (def.openWidth - def.closedWidth);
            def.runtime.gripContactPosition = def.runtime.position;
            this.apply(def, 0);
            return;
        }
    }

    followVacuum(def) {
        for (const entry of def.runtime.heldObjects || []) {
            const held = this.adapter.resolve(entry.ref), pad = this.adapter.resolve(entry.padRef);
            if (!held || !pad) { this.release(def); throw new Error('흡착 중인 물체 또는 패드가 없습니다.'); }
            pad.object.updateWorldMatrix(true, false);
            this.applyWorld(held.object, pad.object.matrixWorld.clone().multiply(new THREE.Matrix4().fromArray(entry.local)));
            held.object.userData.equipmentOwner = def.id;
            this.adapter.dirty(held.model);
        }
    }

    applyVacuum(def, powered) {
        if (!powered) { this.release(def); return; }
        const candidates = this.adapter.candidates();
        const registered = new Set(candidates.map(item => item.ref));
        if ((def.runtime.heldObjects || []).some(item => !registered.has(item.ref))) this.release(def);
        this.followVacuum(def);
        def.runtime.heldObjects ||= [];
        for (const padRef of equipmentReferences(def)) {
            const pad = this.adapter.resolve(padRef);
            if (!pad) { this.release(def); throw new Error('흡착 패드를 찾을 수 없습니다.'); }
            pad.object.updateWorldMatrix(true, true);
            for (const candidate of candidates) {
                let visible = true, owned = false;
                for (let node = candidate.object; node; node = node.parent) { if (node.visible === false) visible = false; if (node.userData.equipmentOwner || node.userData.attachmentHost) owned = true; }
                if (!visible || owned || candidate.model.userData.tcpFrame) continue;
                if (!this.contact.check([pad.object, candidate.object], { allowWarmHitReuse: false })
                    && !this.contact.isWithinDistance(pad.object, candidate.object, 0.1)) continue;
                candidate.object.updateWorldMatrix(true, false);
                const local = pad.object.matrixWorld.clone().invert().multiply(candidate.object.matrixWorld).toArray();
                // Full models use the existing robot attachment so project saves
                // retain their attachment; registered parts keep their own parent.
                let robot = pad.model;
                while (robot && !robot.userData.tcpFrame) robot = robot.userData.attachmentHost;
                if (robot && candidate.object === candidate.model && !this.adapter.grab(candidate, robot)) continue;
                candidate.object.userData.equipmentOwner = def.id;
                def.runtime.heldObjects.push({ ref: candidate.ref, padRef, local });
                this.adapter.dirty(candidate.model);
            }
        }
        def.runtime.heldRef = def.runtime.heldObjects[0]?.ref || '';
        this.followVacuum(def);
    }

    release(def) {
        if (def.type === 'FILM_PEEL') for (const gripper of this.adapter.definitions?.() || []) {
            if (gripper.runtime.filmGripOwner === def.id) {
                delete gripper.runtime.filmGripOwner; delete gripper.runtime.filmGripContactPosition;
            }
        }
        const refs = new Set([def.runtime.heldRef, ...(def.runtime.heldObjects || []).map(item => item.ref)].filter(Boolean));
        for (const ref of refs) {
            const held = this.adapter.resolve(ref);
            if (held) {
                if (held.object === held.model) this.adapter.release(held);
                delete held.object.userData.equipmentOwner;
                this.adapter.dirty(held.model);
            }
        }
        def.runtime.heldRef = ''; def.runtime.heldLocal = null; def.runtime.heldObjects = [];
        delete def.runtime.filmGripOwner; delete def.runtime.filmGripContactPosition;
        if (def.type === 'VACUUM') this.writeFeedback(def, false);
    }

    applyFilm(def, object, frame, seconds) {
        const hadState = !!def.runtime.film;
        const gripper = this.adapter.definitions?.().find(item => item.type === 'GRIPPER' && (item.bodyRef === def.pullerRef || equipmentMotionGroups(item).some(([ref]) => ref === def.pullerRef)));
        if (gripper && !def.runtime.filmGripLocal && def.runtime.position === 0) {
            const gap = gripper.openWidth - (gripper.openWidth - gripper.closedWidth) * gripper.runtime.position / gripper.travel;
            const contact = new THREE.Vector3(...gripper.gripCenter).applyMatrix4(this.frame(gripper));
            const near = (def.origins.filmTabs || []).map(tab => ({ tab, distance: contact.distanceTo(new THREE.Vector3(...tab.point).applyMatrix4(frame)) })).sort((a, b) => a.distance - b.distance)[0];
            if (near && gap <= near.tab.layout.gripWidth + 1 && near.distance <= Math.max(20, near.tab.layout.gripWidth)) {
                if (def.runtime.filmActiveTab !== near.tab.ref) { def.runtime.film = null; this.films.delete(def.id); }
                def.runtime.filmActiveTab = near.tab.ref; def.origins.filmLayout = near.tab.layout; def.travel = near.tab.layout.length;
                def.filmGripSide = near.tab.layout.side; def.filmGripOffset = near.tab.layout.gripOffset * 100;
            }
        }
        const layout = def.origins.filmLayout || getFilmGripLayout(def);
        const basis = new THREE.Matrix4().makeTranslation(...(def.origins.filmBaseOffset || [0,0,0])).multiply(new THREE.Matrix4().makeTranslation(...layout.origin)).multiply(new THREE.Matrix4().makeRotationZ(layout.angle));
        const filmFrame = frame.clone().multiply(basis);
        let entry = this.films.get(def.id);
        if (!entry || entry.object !== object) {
            const state = def.runtime.film || createFilmState(layout.length, layout.width, 40, 16, layout);
            const geometry = new THREE.BufferGeometry();
            const positions = new Float32Array(state.points.length * 3);
            geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
            const indices = [], stride = state.columns + 1;
            for (let row = 0; row < state.rows; row++) for (let column = 0; column < state.columns; column++) {
                const i = row * stride + column; indices.push(i, i + stride, i + 1, i + 1, i + stride, i + stride + 1);
            }
            geometry.setIndex(indices);
            let mesh = object.getObjectByName('equipment-film-mesh');
            if (!mesh) {
                const originals = []; object.traverse(child => { if (child.isMesh) originals.push(child); });
                def.runtime.filmVisibility ||= originals.map(child => child.visible);
                const tabs = equipmentReferences(def, 'filmGripRef').map(ref => this.adapter.resolve(ref)?.object);
                originals.forEach(child => { let inTab = false; for (let node = child; node; node = node.parent) if (tabs.includes(node)) inTab = true; child.visible = inTab; });
                mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: '#67e8f9', side: THREE.DoubleSide, roughness: 0.35, metalness: 0.2 }));
                mesh.name = 'equipment-film-mesh'; mesh.userData.collisionDisabled = true; object.add(mesh);
            } else { mesh.geometry.dispose(); mesh.geometry = geometry; }
            entry = { state, geometry, positions, object }; this.films.set(def.id, entry);
            this.applyWorld(object, frame);
            this.adapter.resolve(def.movingRef).model.userData.equipmentFilm = def.id;
        }
        let anchor = null, gripEdge = null;
        const puller = this.adapter.resolve(def.pullerRef)?.object || (def.robotRef ? this.adapter.mount(this.adapter.resolve(def.robotRef)?.object) : null);
        if (puller) {
            puller.updateWorldMatrix(true, false);
            const gap = gripper ? gripper.openWidth - (gripper.openWidth - gripper.closedWidth) * gripper.runtime.position / gripper.travel : 0;
            let closed = !gripper || gripper.enabled && gap <= layout.gripWidth + 1;
            const gripPoint = new THREE.Vector3(0, layout.width * (layout.gripOffset - 0.5), 0);
            const worldGrip = gripPoint.clone().applyMatrix4(filmFrame);
            if (gripper && !def.runtime.filmGripLocal) {
                const contact = new THREE.Vector3(...gripper.gripCenter).applyMatrix4(this.frame(gripper));
                const tab = def.origins.filmTabs?.find(tab => tab.ref === (def.runtime.filmActiveTab || def.filmGripRef));
                const handle = tab ? new THREE.Vector3(...tab.point).applyMatrix4(frame) : worldGrip;
                closed &&= contact.distanceTo(handle) <= Math.max(20, layout.gripWidth);
            }
            def.runtime.filmGripped = closed && !def.runtime.released;
            if (!closed && def.runtime.position >= def.travel) def.runtime.released = true;
            if (gripper && (!closed || def.runtime.released) && gripper.runtime.filmGripOwner === def.id) {
                delete gripper.runtime.filmGripOwner; delete gripper.runtime.filmGripContactPosition;
            }
            if (gripper && closed && !def.runtime.released) {
                gripper.runtime.filmGripOwner = def.id;
                gripper.runtime.filmGripContactPosition = gripper.travel * (gripper.openWidth - layout.gripWidth) / (gripper.openWidth - gripper.closedWidth);
                gripper.runtime.position = Math.max(0, Math.min(gripper.travel, gripper.runtime.filmGripContactPosition));
                this.apply(gripper, 0); this.writeFeedback(gripper, true);
                puller.updateWorldMatrix(true, false);
            }
            if (closed && !def.runtime.released && !def.runtime.filmGripLocal) {
                const inverse = puller.matrixWorld.clone().invert();
                def.runtime.filmGripLocal = worldGrip.applyMatrix4(inverse).toArray();
                def.runtime.filmGripEdgeLocal = Array.from({ length: entry.state.columns + 1 }, (_, column) => new THREE.Vector3(0, layout.width * (column / entry.state.columns - 0.5), 0).applyMatrix4(filmFrame).applyMatrix4(inverse).toArray());
                const tab = this.adapter.resolve(def.runtime.filmActiveTab || def.filmGripRef)?.object;
                if (tab) { tab.updateWorldMatrix(true, false); def.runtime.filmActiveTabLocal = inverse.clone().multiply(tab.matrixWorld).toArray(); }
            }
            if (def.runtime.filmGripLocal) {
                const pullFrame = filmFrame.clone().invert().multiply(puller.matrixWorld);
                anchor = new THREE.Vector3(...def.runtime.filmGripLocal).applyMatrix4(pullFrame).toArray();
                gripEdge = def.runtime.filmGripEdgeLocal.map(point => new THREE.Vector3(...point).applyMatrix4(pullFrame).toArray());
                if (!def.runtime.released && def.runtime.position < def.travel) def.runtime.filmPullTarget = getFilmPeelFromGrip(entry.state, anchor);
            }
        }
        this.applyWorld(object, frame);
        const peel = Math.min(layout.length, Math.max(0, def.runtime.position));
        const e = filmFrame.elements;
        const groundPlane = { normal: [e[2], e[6], e[10]], offset: e[14] };
        const result = seconds > 0 || !hadState ? stepFilm(entry.state, peel, seconds, { stiffness: def.filmStiffness, damping: def.filmDamping, anchor, gripEdge, released: def.runtime.released, groundPlane }) : { error: '' };
        if (result.error) throw new Error(result.error);
        entry.state.points.forEach((point, index) => entry.positions.set(new THREE.Vector3(...point).applyMatrix4(basis).toArray(), index * 3));
        entry.geometry.attributes.position.needsUpdate = true;
        entry.geometry.computeVertexNormals(); entry.geometry.computeBoundingBox(); entry.geometry.computeBoundingSphere();
        def.runtime.film = entry.state;
        for (const source of def.origins.filmTabs || []) {
            const tab = this.adapter.resolve(source.ref)?.object; if (!tab) throw new Error('필름 손잡이 부품을 찾을 수 없습니다.');
            if (puller && def.runtime.filmGripped && !def.runtime.released && source.ref === (def.runtime.filmActiveTab || def.filmGripRef) && def.runtime.filmActiveTabLocal) {
                this.applyWorld(tab, puller.matrixWorld.clone().multiply(new THREE.Matrix4().fromArray(def.runtime.filmActiveTabLocal))); continue;
            }
            const initial = new THREE.Vector3(...source.point).applyMatrix4(basis.clone().invert());
            const row = Math.round(Math.max(0, Math.min(1, initial.x / entry.state.length)) * entry.state.rows);
            const column = Math.round(Math.max(0, Math.min(1, initial.y / entry.state.width + 0.5)) * entry.state.columns);
            const index = row * (entry.state.columns + 1) + column;
            const flat = new THREE.Vector3(row * entry.state.length / entry.state.rows, entry.state.width * (column / entry.state.columns - 0.5), 0);
            const position = new THREE.Vector3(...entry.state.points[index]);
            const point = (r, c) => new THREE.Vector3(...entry.state.points[r * (entry.state.columns + 1) + c]);
            const x = row < entry.state.rows ? point(row + 1, column).sub(position) : position.clone().sub(point(row - 1, column));
            const y = column < entry.state.columns ? point(row, column + 1).sub(position) : position.clone().sub(point(row, column - 1));
            const z = x.clone().cross(y).normalize(); x.normalize(); y.copy(z).cross(x).normalize();
            const rotation = z.lengthSq() > 0.5 ? new THREE.Matrix4().makeBasis(x, y, z) : new THREE.Matrix4();
            const deformation = basis.clone().multiply(new THREE.Matrix4().makeTranslation(...position.toArray())).multiply(rotation)
                .multiply(new THREE.Matrix4().makeTranslation(...flat.negate().toArray())).multiply(basis.clone().invert());
            this.applyWorld(tab, frame.clone().multiply(deformation).multiply(new THREE.Matrix4().fromArray(source.local)));
        }
        this.adapter.dirty(this.adapter.resolve(def.movingRef).model);
    }

    restore(definitions) {
        this.clear();
        for (const def of definitions) {
            if (def.type === 'OBJECT') this.captureObjectOrigins(def);
            def.runtime.lastCommand = 'STOP';
            try {
                // Older workspaces stored only a world frame. Recover the live
                // mount frame from the persisted part pose before applying it.
                if (!def.bodyRef && !def.origins.anchorRef && !def.origins.followMoving && def.origins.objects?.[def.movingRef]) {
                    const moving = this.adapter.resolve(def.movingRef);
                    if (moving) {
                        moving.object.updateWorldMatrix(true, false);
                        const frame = moving.object.matrixWorld.clone().multiply(new THREE.Matrix4().fromArray(def.origins.objects[def.movingRef]).invert()).multiply(this.motionDelta(def, 1, def.runtime.position).invert());
                        if (moving.model !== moving.object && !equipmentMotionGroups(def).some(([ref]) => this.adapter.resolve(ref)?.object === moving.model)) {
                            moving.model.updateWorldMatrix(true, false);
                            def.origins.anchorRef = equipmentObjectRef(this.adapter.modelId(moving.model));
                            def.origins.anchorLocal = moving.model.matrixWorld.clone().invert().multiply(frame).toArray();
                        } else def.origins.followMoving = true;
                        def.runtime.appliedPosition = def.runtime.position;
                    }
                }
                this.apply(def, 0); this.writeFeedback(def, !!def.runtime.heldRef);
            }
            catch (error) { this.status.set(def.id, { phase: '오류', error: error.message, position: def.runtime.position }); }
        }
        this.suspended = true;
    }
}
