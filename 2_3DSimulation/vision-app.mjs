import { cameraPixelSize, fillVisionForm, updateVisionForm, visionFormConditions } from './wasm/forms.mjs';
import * as THREE from 'three';
import {
    VISION_DEFAULT_PORTS, VISION_RESULT_CODES, VisionController,
    buildVisionLinkConfig, buildVisionSamplePrograms, buildLabVisionCalibration, createSeededRandom, createVisionCameraModel,
    decodeVisionValue, describeVisionFov, gaussianNoise, normalizeVisionConfig, projectWorldPoint, randomWorkPose,
    readVisionCommandWords, robotToPixel, validateVisionAddresses, visionBlockLengths, visionSignalAddresses
} from './vision-core.mjs?v=20261109-vision-lab-2';
import { CalibrationMark, VisionImageRenderer, VisionRig, objectFeaturePoints } from './vision-scene.mjs?v=20261109-vision-lab-2';

const DEG = Math.PI / 180;
const MAX_LOG_LINES = 300;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const fixed = (value, digits = 3) => Number.isFinite(Number(value)) ? (Number(Number(value).toFixed(digits)) || 0).toFixed(digits) : '—';
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const round3 = value => Math.round(Number(value) * 1000) / 1000;

function getPath(object, path) {
    return path.split('.').reduce((value, key) => value?.[key], object);
}
function setPath(object, path, value) {
    const keys = path.split('.');
    const last = keys.pop();
    const target = keys.reduce((value, key) => value[key], object);
    target[last] = value;
}

const LINK_STATES = { stopped: '정지', listening: '접속 대기', connecting: '연결 중', connected: '연결됨', error: '오류' };
const RESULT_NAMES = ['상태', '결과 코드', '값1 (dX)', '', '값2 (dY)', '', '값3 (dθ)', '', '값4 (점수)', '', '카운터', ''];
const COMMAND_NAMES = ['제어 비트', '작업 번호', '로봇 X', '', '로봇 Y', '', '로봇 R', ''];
const CODE_LABELS = {
    [VISION_RESULT_CODES.none]: '—', [VISION_RESULT_CODES.ok]: 'OK', [VISION_RESULT_CODES.notFound]: '대상 없음',
    [VISION_RESULT_CODES.outOfRange]: '보정 한계 초과', [VISION_RESULT_CODES.notCalibrated]: '캘리브레이션 필요',
    [VISION_RESULT_CODES.noMaster]: '기준 위치 미등록', [VISION_RESULT_CODES.error]: '오류'
};
function poseMatrix(camera) {
    const quaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(camera.rx * DEG, camera.ry * DEG, camera.rz * DEG, 'ZYX'));
    return new THREE.Matrix4().compose(new THREE.Vector3(camera.x, camera.y, camera.z), quaternion, new THREE.Vector3(1, 1, 1));
}

function poseFromMatrix(matrix) {
    const position = new THREE.Vector3(), quaternion = new THREE.Quaternion(), scale = new THREE.Vector3();
    matrix.decompose(position, quaternion, scale);
    const euler = new THREE.Euler().setFromQuaternion(quaternion, 'ZYX');
    return { x: round3(position.x), y: round3(position.y), z: round3(position.z), rx: round3(euler.x / DEG), ry: round3(euler.y / DEG), rz: round3(euler.z / DEG) };
}

/** Copy text with the Clipboard API, falling back to a selected textarea. */
async function copyText(value, documentRef) {
    const windowRef = documentRef.defaultView || window;
    try {
        if (windowRef.isSecureContext && windowRef.navigator.clipboard?.writeText) {
            await windowRef.navigator.clipboard.writeText(value);
            return true;
        }
    } catch { /* Fall back below, for example when the window is not focused. */ }
    const area = documentRef.createElement('textarea');
    area.value = value;
    area.setAttribute('readonly', '');
    area.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
    documentRef.body.append(area);
    area.focus();
    area.select();
    let copied = false;
    try { copied = documentRef.execCommand('copy'); } catch { copied = false; }
    area.remove();
    return copied;
}

/**
 * Virtual vision panel and runtime. The adapter isolates main.js state:
 * scene/renderer access, robot poses and IK, model creation and transforms,
 * OLP IO and persistence callbacks.
 */
export function createVisionApp(adapter) {
    const text = value => adapter.text?.(value) ?? value;
    const format = (value, replacements) => adapter.format?.(value, replacements)
        ?? String(value).replace(/\{(\w+)\}/g, (match, key) => replacements?.[key] ?? match);
    const rig = new VisionRig();
    const mark = new CalibrationMark();
    const imageRenderer = new VisionImageRenderer(640);
    const state = {
        tab: 'camera', liveTimer: null, tickTimer: null, ioTimer: null,
        lastObservation: null, lastResult: null, log: [],
        link: { mode: 'off', state: 'stopped', message: '', peers: [] },
        socket: null, socketReady: false, connectTimer: null, connecting: false, connectionAttempt: 0, attemptConfig: '', lastSentResults: '', commandWords: [],
        lastWrittenInputs: [], previousTriggerBit: 0, supplyPendingSince: 0, random: null, randomSeed: null,
        generatedCount: 0, autoCalibrating: false, lastSpawn: null, lastExternalConfig: ''
    };
    const controller = new VisionController({
        config: {},
        capture,
        onChange: () => { pushExternalResults(); schedulePanelRender(); },
        onLog: message => log('vision', message)
    });
    const config = () => controller.config;

    // ------------------------------------------------------------ helpers

    function log(direction, message) {
        const time = new Date();
        state.log.push({ time: `${String(time.getHours()).padStart(2, '0')}:${String(time.getMinutes()).padStart(2, '0')}:${String(time.getSeconds()).padStart(2, '0')}.${String(time.getMilliseconds()).padStart(3, '0')}`, direction, message: String(message) });
        if (state.log.length > MAX_LOG_LINES) state.log.splice(0, state.log.length - MAX_LOG_LINES);
        schedulePanelRender();
    }

    function calibrationRobot() {
        const robots = adapter.robots();
        return robots.find(robot => adapter.robotId(robot) === config().robotId) || robots[0] || null;
    }

    function panel() { return adapter.panel(); }
    function panelVisible() {
        const element = panel();
        return Boolean(element && !element.classList.contains('panel-user-hidden') && !element.classList.contains('hidden'));
    }

    // A timer (not requestAnimationFrame) keeps protocol status current while
    // the page or a detached panel window is not being painted.
    let renderQueued = false;
    function schedulePanelRender() {
        if (renderQueued) return;
        renderQueued = true;
        setTimeout(() => { renderQueued = false; renderPanel(); }, 40);
    }

    function save() { adapter.saveProgress?.(); }

    // ------------------------------------------------------------ camera model

    function mountModel() {
        const id = config().camera.mountId;
        return id ? adapter.models().find(model => adapter.modelId(model) === id) || null : null;
    }

    function isCameraModel(model) {
        return Boolean(model) && config().enabled && Boolean(config().camera.mountId) && adapter.modelId(model) === config().camera.mountId;
    }

    function lensLocal() {
        const elements = config().camera.mountLocal;
        return elements ? new THREE.Matrix4().fromArray(elements) : new THREE.Matrix4();
    }

    function mountFrame(model = mountModel()) {
        const index = config().camera.mountPartIndex;
        return model && index >= 0 ? adapter.modelParts?.(model)?.[index] || model : model;
    }

    function ensureCameraWorkPlane() {
        const camera = config().camera;
        if (describeVisionFov(camera, camera.workPlaneZ).center) return;
        const axis = createVisionCameraModel(camera).axes.z;
        const distance = Math.abs(camera.workPlaneZ - camera.z) || 700;
        camera.workPlaneZ = camera.z + (axis[2] >= 0 ? distance : -distance);
    }

    function resetCameraCalibration() {
        config().calibration.result = null;
        config().detection.master = null;
        controller.reset();
        state.lastResult = null; state.lastObservation = null;
    }

    /** Copy the mounted model's lens pose into the camera settings. */
    function syncCameraFromModel() {
        const model = mountModel();
        if (!model) return false;
        const pose = poseFromMatrix(new THREE.Matrix4().multiplyMatrices(adapter.modelWorldMatrix(mountFrame(model)), lensLocal()));
        const camera = config().camera;
        const changed = ['x', 'y', 'z', 'rx', 'ry', 'rz'].some(key => Math.abs(pose[key] - camera[key]) > 1e-3);
        if (!changed) return false;
        Object.assign(camera, pose);
        rig.update(config());
        schedulePanelRender();
        save();
        return true;
    }

    /** Apply camera coordinates to the mounted model, preserving its lens offset. */
    function applyCameraPoseToModel() {
        const model = mountModel();
        if (!model) return;
        const lens = poseMatrix(config().camera);
        const frameInModel = adapter.modelWorldMatrix(model).invert().multiply(adapter.modelWorldMatrix(mountFrame(model)));
        adapter.setModelWorldMatrix(model, lens.multiply(lensLocal().invert()).multiply(frameInModel.invert()).toArray());
    }

    function createCameraModel() {
        const model = adapter.createCameraModel({ name: config().name });
        if (!model) return;
        Object.assign(config().camera, { mountId: adapter.modelId(model), mountPartIndex: -1, mountLocal: null, builtIn: true });
        adapter.setModelWorldMatrix(model, poseMatrix(config().camera).toArray());
        applyConfig({ links: false });
        adapter.refreshModelTree?.();
    }

    /** Register an existing scene model (or one of its parts) as the camera. */
    function registerCameraModel(model, part = null, { direction = config().camera.direction } = {}) {
        if (!model) return;
        const previous = mountModel();
        const parts = Array.isArray(part) ? part : [part || model];
        const box = new THREE.Box3();
        for (const item of parts) {
            const bounds = adapter.worldBounds(item);
            if (bounds) box.union(bounds);
        }
        const camera = config().camera;
        camera.direction = direction === 'up' ? 'up' : 'down';
        if (!box.isEmpty()) Object.assign(camera, { x: round3((box.min.x + box.max.x) / 2), y: round3((box.min.y + box.max.y) / 2), z: round3(camera.direction === 'up' ? box.max.z : box.min.z), rx: 0, ry: 0 });
        camera.mountPartIndex = adapter.modelParts?.(model)?.indexOf(parts[0]) ?? -1;
        const world = adapter.modelWorldMatrix(parts[0]);
        camera.mountLocal = new THREE.Matrix4().multiplyMatrices(world.clone().invert(), poseMatrix(camera)).toArray();
        camera.mountId = adapter.modelId(model);
        const wasBuiltIn = camera.builtIn && previous && previous !== model;
        camera.builtIn = false;
        config().enabled = true;
        if (wasBuiltIn) adapter.removeModel(previous);
        ensureCameraWorkPlane();
        resetCameraCalibration();
        applyConfig();
        adapter.refreshModelTree?.();
        adapter.status?.(format('{model}을(를) 비전 카메라로 등록했습니다.', { model: adapter.modelLabel(model) }), '#22c55e');
    }

    function unregisterCameraModel() {
        Object.assign(config().camera, { mountId: '', mountPartIndex: -1, mountLocal: null, builtIn: false });
        applyConfig({ links: false });
        adapter.refreshModelTree?.();
    }

    // ------------------------------------------------------------ scene

    function syncScene() {
        const scene = adapter.scene();
        const enabled = config().enabled;
        if (enabled && scene && rig.group.parent !== scene) scene.add(rig.group);
        if (!enabled) rig.group.removeFromParent();
        if (enabled && scene && mark.mesh.parent !== scene) scene.add(mark.mesh);
        if (!enabled) mark.mesh.removeFromParent();
        const model = enabled ? mountModel() : null;
        if (model && config().camera.builtIn) adapter.decorateCameraModel?.(model);
        if (model) syncCameraFromModel();
        if (enabled) rig.update(config());
        // The camera model itself is the body; the rig keeps only the FOV.
        rig.body.visible = enabled && !model;
        updateMark();
        adapter.requestRender();
    }

    function updateMark() {
        const robot = calibrationRobot();
        const cal = config().calibration;
        return mark.update({
            tcpFrame: robot ? adapter.tcpFrame(robot) : null,
            offsetX: cal.markOffsetX, offsetY: cal.markOffsetY, size: cal.markSize,
            visible: config().enabled && cal.showMark
        });
    }

    function noise(value) {
        const sigma = config().camera.noisePx;
        if (!sigma) return value;
        state.random ||= createSeededRandom(Date.now());
        return value + gaussianNoise(state.random) * sigma;
    }

    function robotFramePose(robot, worldPoint, worldAxisPoint) {
        const center = adapter.worldToBase(robot, worldPoint);
        const axis = adapter.worldToBase(robot, worldAxisPoint);
        if (!center || !axis) return null;
        return { x: center[0], y: center[1], z: center[2], theta: Math.atan2(axis[1] - center[1], axis[0] - center[0]) / DEG };
    }

    function observeMark(model) {
        const world = updateMark();
        if (!world) return { found: false, reason: 'no-robot' };
        const pixel = projectWorldPoint(model, world.toArray());
        if (!pixel?.inImage) return { found: false, reason: 'outside', kind: 'mark' };
        return { found: true, kind: 'mark', u: noise(pixel.u), v: noise(pixel.v), score: 100 };
    }

    function candidateObjects() {
        const targetId = config().detection.targetId;
        const camera = mountModel();
        const models = adapter.models().filter(model => model !== camera);
        if (targetId) return models.filter(model => adapter.modelId(model) === targetId);
        return models.filter(model => adapter.isWorkpiece(model) && !adapter.isHeld(model) && model.visible !== false);
    }

    function observeObject(model) {
        const robot = calibrationRobot();
        const candidates = [];
        for (const object of candidateObjects()) {
            const features = objectFeaturePoints(object, model.axes.z);
            if (!features) continue;
            const center = projectWorldPoint(model, features.center);
            if (!center?.inImage) continue;
            const symmetric = ['cylinder', 'sphere', 'cone'].includes(object.userData?.primitiveShapeType);
            const axisWorld = symmetric ? [features.center[0] + 20 * model.axes.x[0], features.center[1] + 20 * model.axes.x[1], features.center[2]] : features.axis;
            const axis = projectWorldPoint(model, axisWorld);
            const corners = features.corners.map(point => projectWorldPoint(model, point));
            const inside = corners.filter(point => point?.inImage).length;
            candidates.push({ object, features, center, axis, corners, score: 100 * inside / corners.length, axisWorld });
        }
        if (!candidates.length) return { found: false, kind: 'object', score: 0, reason: 'none' };
        // Generated work objects take priority over fixtures such as tables.
        if (candidates.some(item => item.object.userData?.visionWork)) {
            for (let i = candidates.length - 1; i >= 0; i--) if (!candidates[i].object.userData?.visionWork) candidates.splice(i, 1);
        }
        const master = config().detection.master;
        const reference = master ? [master.u, master.v] : [model.cx, model.cy];
        candidates.sort((a, b) => Math.hypot(a.center.u - reference[0], a.center.v - reference[1]) - Math.hypot(b.center.u - reference[0], b.center.v - reference[1]));
        const best = candidates[0];
        const truth = robot ? robotFramePose(robot, best.features.center, best.axisWorld) : null;
        return {
            found: true, kind: 'object', score: best.score,
            u: noise(best.center.u), v: noise(best.center.v), axisU: noise(best.axis.u), axisV: noise(best.axis.v),
            corners: best.corners.map(point => point ? [point.u, point.v] : null),
            modelId: adapter.modelId(best.object), label: adapter.modelLabel(best.object),
            truth: truth ? { x: truth.x, y: truth.y, theta: truth.theta } : null,
            heightDelta: truth ? truth.z - config().calibration.z : null,
            count: candidates.length
        };
    }

    /** VisionController capture hook: snapshot now, then emulate processing time. */
    async function capture(kind) {
        syncCameraFromModel();
        const model = createVisionCameraModel(config().camera);
        const observation = kind === 'mark' ? observeMark(model) : observeObject(model);
        state.lastObservation = { ...observation, time: Date.now() };
        drawImage();
        const delay = config().camera.processingMs;
        if (delay) await sleep(delay);
        return observation;
    }

    // ------------------------------------------------------------ image

    function drawImage() {
        if (!panelVisible() || !config().enabled) return;
        const canvas = panel()?.querySelector('[data-vision-canvas]');
        const renderer = adapter.renderer(), scene = adapter.scene();
        if (!canvas || !renderer || !scene) return;
        updateMark();
        let frame;
        try {
            frame = imageRenderer.render(renderer, scene, config(), [rig.group, mountModel(), ...adapter.captureHidden()]);
        } catch (error) {
            log('error', error.message);
            return;
        }
        if (canvas.width !== frame.width || canvas.height !== frame.height) { canvas.width = frame.width; canvas.height = frame.height; }
        const context = canvas.getContext('2d');
        context.putImageData(frame.image, 0, 0);
        drawOverlay(context, frame.scale);
        adapter.requestRender();
    }

    function drawOverlay(context, scale) {
        const cfg = config();
        const model = createVisionCameraModel(cfg.camera);
        const px = value => value * scale;
        context.save();
        context.lineWidth = 1;
        context.strokeStyle = 'rgba(34, 211, 238, 0.55)';
        context.setLineDash([4, 4]);
        context.beginPath();
        context.moveTo(px(model.cx), 0); context.lineTo(px(model.cx), px(model.height));
        context.moveTo(0, px(model.cy)); context.lineTo(px(model.width), px(model.cy));
        context.stroke();
        context.setLineDash([]);
        const calibration = cfg.calibration.result;
        if (calibration) {
            const origin = { x: cfg.calibration.centerX, y: cfg.calibration.centerY };
            const o = robotToPixel(calibration, origin.x, origin.y);
            const arrow = (to, color, label) => {
                if (!o || !to) return;
                context.strokeStyle = context.fillStyle = color;
                context.lineWidth = 2;
                context.beginPath(); context.moveTo(px(o.u), px(o.v)); context.lineTo(px(to.u), px(to.v)); context.stroke();
                context.font = '600 12px Inter, sans-serif';
                context.fillText(label, px(to.u) + 4, px(to.v) - 4);
            };
            arrow(robotToPixel(calibration, origin.x + 40, origin.y), '#ef4444', 'X+');
            arrow(robotToPixel(calibration, origin.x, origin.y + 40), '#22c55e', 'Y+');
            if (state.tab === 'calibration') {
                context.font = '600 10px Inter, sans-serif';
                [...(calibration.points || []), ...(calibration.rotationPoints || [])].forEach(point => {
                    context.strokeStyle = context.fillStyle = point.index > 9 ? '#f59e0b' : '#38bdf8';
                    context.beginPath(); context.arc(px(point.u), px(point.v), 4, 0, Math.PI * 2); context.stroke();
                    context.fillText(String(point.index), px(point.u) + 5, px(point.v) - 5);
                });
            }
        }
        const master = cfg.detection.master;
        if (master) {
            context.strokeStyle = '#a78bfa';
            context.lineWidth = 1.5;
            context.beginPath();
            context.moveTo(px(master.u) - 8, px(master.v)); context.lineTo(px(master.u) + 8, px(master.v));
            context.moveTo(px(master.u), px(master.v) - 8); context.lineTo(px(master.u), px(master.v) + 8);
            context.stroke();
        }
        const observation = state.lastObservation;
        if (observation?.found) {
            const ok = observation.kind === 'mark' || (state.lastResult?.ok ?? true);
            context.strokeStyle = ok ? '#4ade80' : '#f87171';
            context.lineWidth = 2;
            if (observation.corners?.every(Boolean)) {
                context.beginPath();
                observation.corners.forEach(([u, v], index) => index ? context.lineTo(px(u), px(v)) : context.moveTo(px(u), px(v)));
                context.closePath(); context.stroke();
            }
            if (observation.kind === 'mark') {
                context.beginPath(); context.arc(px(observation.u), px(observation.v), 9, 0, Math.PI * 2); context.stroke();
            }
            context.beginPath();
            context.moveTo(px(observation.u) - 10, px(observation.v)); context.lineTo(px(observation.u) + 10, px(observation.v));
            context.moveTo(px(observation.u), px(observation.v) - 10); context.lineTo(px(observation.u), px(observation.v) + 10);
            context.stroke();
            if (Number.isFinite(observation.axisU)) {
                context.beginPath(); context.moveTo(px(observation.u), px(observation.v)); context.lineTo(px(observation.axisU), px(observation.axisV)); context.stroke();
            }
        }
        const result = state.lastResult;
        if (result && observation?.kind === 'object') {
            context.font = '600 12px Inter, sans-serif';
            const line = result.ok
                ? `OK  dX ${fixed(result.dx)}  dY ${fixed(result.dy)}  dθ ${fixed(result.dtheta)}°`
                : `NG  ${text(CODE_LABELS[result.code] || result.message || '')}`;
            context.fillStyle = 'rgba(0, 0, 0, 0.6)';
            context.fillRect(6, 6, Math.min(context.canvas.width - 12, 330), 22);
            context.fillStyle = result.ok ? '#4ade80' : '#f87171';
            context.fillText(line, 12, 22);
        }
        context.restore();
    }

    // ------------------------------------------------------------ actions

    async function runTrigger(source = 'manual') {
        if (!config().enabled) return null;
        const result = await controller.trigger();
        if (result?.observation === undefined && result?.message === 'busy') return result;
        state.lastResult = result;
        drawImage();
        if (source !== 'remote') adapter.status?.(result.ok
            ? format('비전 검사 OK: dX {dx}, dY {dy}, dθ {dt}', { dx: fixed(result.dx), dy: fixed(result.dy), dt: fixed(result.dtheta) })
            : format('비전 검사 NG: {reason}', { reason: text(CODE_LABELS[result.code] || result.message) }), result.ok ? '#22c55e' : '#f59e0b');
        save();
        schedulePanelRender();
        return result;
    }

    async function registerMaster() {
        const cfg = config().detection;
        const pose = cfg.rotationCenter === 'pick' ? { x: cfg.pickX, y: cfg.pickY } : {};
        const result = await controller.registerMaster(pose);
        if (!result.ok) adapter.status?.(format('기준 위치 등록 실패: {reason}', { reason: text(CODE_LABELS[result.code] || result.message) }), '#ef4444');
        else {
            setWorkReference(selectedWorkModel());
            adapter.status?.(text('기준 위치를 등록했습니다.'), '#22c55e');
        }
        save();
        schedulePanelRender();
    }

    async function runAutoCalibration() {
        const robot = calibrationRobot();
        if (!robot) { adapter.status?.(text('캘리브레이션할 로봇을 먼저 배치하세요.'), '#ef4444'); return; }
        if (adapter.isExternallyDriven(robot) || adapter.isBusy(robot)) {
            adapter.status?.(text('로봇이 프로그램 또는 컨트롤러로 구동 중일 때는 로봇 프로그램으로 캘리브레이션하세요.'), '#f59e0b');
            return;
        }
        if (state.autoCalibrating) return;
        state.autoCalibrating = true;
        const restore = adapter.saveRobotState(robot);
        schedulePanelRender();
        try {
            let step = await controller.calibrationStep(null);
            while (step.ok && step.next) {
                const target = step.next;
                if (!adapter.moveTcp(robot, { x: target.x, y: target.y, z: target.z, r: target.r })) {
                    throw new Error(format('로봇이 캘리브레이션 {index}번 위치에 도달할 수 없습니다.', { index: target.index }));
                }
                await sleep(220);
                const pose = adapter.tcpPose(robot);
                step = await controller.calibrationStep({ x: pose.x, y: pose.y, r: pose.r });
            }
            if (!step.ok) throw new Error(step.error || text('캘리브레이션 실패'));
            adapter.status?.(format('캘리브레이션 완료: RMS {rms} mm, 최대 {max} mm', { rms: fixed(step.result.rms, 4), max: fixed(step.result.max, 4) }), '#22c55e');
        } catch (error) {
            controller.reset();
            adapter.status?.(error.message, '#ef4444');
            log('error', error.message);
        } finally {
            restore?.();
            state.autoCalibrating = false;
            syncScene();
            drawImage();
            save();
            schedulePanelRender();
        }
    }

    function exportLabCalibration() {
        try {
            const data = buildLabVisionCalibration(config());
            const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2) + '\n'], { type: 'application/json' }));
            const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'AssistantVisionCalibration.json';
            anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
            adapter.status?.(text('K12 보정값을 내보냈습니다. 가상컨트롤러의 media/sdcard1/TecParameter 폴더에 넣으면 적용됩니다.'), '#22c55e');
        } catch (error) { adapter.status?.(error.message, '#ef4444'); }
    }

    function placeAroundRobot() {
        const robot = calibrationRobot();
        if (!robot) { adapter.status?.(text('가상 비전을 배치할 로봇을 먼저 추가하세요.'), '#ef4444'); return; }
        const cfg = config();
        const tcp = adapter.tcpPose(robot);
        const tcpWorld = adapter.baseToWorld(robot, [tcp.x, tcp.y, tcp.z]);
        const r = tcp.vertical ? Math.round(tcp.r) : 0;
        let centerX = Math.round(tcp.x), centerY = Math.round(tcp.y), reachableGrid = true;
        // Work surface: the robot floor when the tool can reach it, otherwise
        // a table just below the current TCP (for example SCARA strokes). The
        // center moves toward the base until the whole 3×3 grid and the
        // rotation points are reachable.
        let plane = Math.round(adapter.worldToBase(robot, [tcpWorld[0], tcpWorld[1], adapter.baseToWorld(robot, [0, 0, 0])[2]])[2] + cfg.generator.sizeZ);
        if (!adapter.isExternallyDriven(robot) && !adapter.isBusy(robot)) {
            const restore = adapter.saveRobotState(robot);
            const cal = cfg.calibration;
            const reach = Math.hypot(tcp.x, tcp.y) > 100 ? [tcp.x, tcp.y] : [400, 0];
            const centers = [1, 0.85, 0.7, 0.55, 0.4].map(factor => [Math.round(reach[0] * factor), Math.round(reach[1] * factor)]);
            const reachable = (cx, cy, z) => [-1, 0, 1].every(i => [-1, 0, 1].every(j => adapter.moveTcp(robot, { x: cx + i * cal.pitchX, y: cy + j * cal.pitchY, z, r })))
                && [-cal.rotationAngle, cal.rotationAngle].every(angle => adapter.moveTcp(robot, { x: cx, y: cy, z, r: r + angle }));
            const found = [plane, Math.round(tcp.z - 50), Math.round(tcp.z)]
                .flatMap(z => centers.map(([cx, cy]) => ({ cx, cy, z })))
                .find(({ cx, cy, z }) => reachable(cx, cy, z));
            restore?.();
            if (found) ({ cx: centerX, cy: centerY, z: plane } = found);
            reachableGrid = Boolean(found);
        }
        const nominal = adapter.baseToWorld(robot, [centerX, centerY, plane]);
        const top = nominal[2];
        cfg.robotId = adapter.robotId(robot);
        const upward = cfg.camera.direction === 'up';
        Object.assign(cfg.generator, { nominalX: Math.round(nominal[0]), nominalY: Math.round(nominal[1]), nominalZ: Math.round(upward ? top : top - cfg.generator.sizeZ), nominalRz: 0 });
        Object.assign(cfg.camera, { x: cfg.generator.nominalX, y: cfg.generator.nominalY, z: Math.round(top + (upward ? -700 : 700)), rx: 0, ry: 0, rz: 0, workPlaneZ: Math.round(top) });
        Object.assign(cfg.calibration, { centerX, centerY, z: plane, r });
        Object.assign(cfg.detection, { pickX: centerX, pickY: centerY });
        if (mountModel()) applyCameraPoseToModel();
        else createCameraModel();
        applyConfig();
        if (reachableGrid) adapter.status?.(text('로봇 작업 영역에 비전과 작업물 기준 위치를 배치했습니다.'), '#22c55e');
        else adapter.status?.(text('캘리브레이션 격자 전체에 도달할 수 있는 위치를 찾지 못했습니다. 간격을 줄이거나 위치를 직접 입력하세요.'), '#f59e0b');
    }

    function useTcpForCalibration() {
        const robot = calibrationRobot();
        if (!robot) return;
        const pose = adapter.tcpPose(robot);
        Object.assign(config().calibration, { centerX: round3(pose.x), centerY: round3(pose.y), z: round3(pose.z), r: round3(pose.r) });
        applyConfig({ links: false });
    }

    function useTcpForPick() {
        const robot = calibrationRobot();
        if (!robot) return;
        const pose = adapter.tcpPose(robot);
        Object.assign(config().detection, { pickX: round3(pose.x), pickY: round3(pose.y), rotationCenter: 'pick' });
        applyConfig({ links: false });
    }

    // ------------------------------------------------------------ generator

    function selectedWorkModel() {
        const id = config().detection.targetId;
        return id ? adapter.models().find(model => model !== mountModel() && adapter.modelId(model) === id) || null : null;
    }

    /** Retain the selected object's exact origin, orientation and scale. */
    function setWorkReference(model) {
        if (!model) return;
        const matrix = adapter.modelWorldMatrix(model);
        Object.assign(config().generator, {
            nominalX: matrix.elements[12], nominalY: matrix.elements[13], nominalZ: matrix.elements[14],
            nominalRz: poseFromMatrix(matrix).rz, referenceMatrix: matrix.toArray()
        });
    }

    function generatedModels() {
        return adapter.models().filter(model => model.userData?.visionWork && adapter.modelId(model) !== config().detection.targetId);
    }

    function nearSupply(model) {
        const g = config().generator;
        const position = adapter.worldPosition(model);
        if (!position) return false;
        const radius = Math.hypot(g.rangeX, g.rangeY) + Math.max(g.sizeX, g.sizeY);
        return Math.hypot(position[0] - g.nominalX, position[1] - g.nominalY) <= radius && Math.abs(position[2] - g.nominalZ) <= g.sizeZ + 5;
    }

    function generatorRandom() {
        const seed = config().generator.seed;
        if (state.randomSeed !== seed || !state.generatorRandom) {
            state.randomSeed = seed;
            state.generatorRandom = seed ? createSeededRandom(seed) : Math.random;
        }
        return state.generatorRandom;
    }

    function spawnWork({ randomize = true, capture: captureAfter = config().generator.captureOnSpawn } = {}) {
        const g = config().generator;
        const selected = selectedWorkModel();
        if (config().detection.targetId && (!selected || adapter.isHeld(selected))) {
            adapter.status?.(text('선택한 작업물 오브젝트를 사용할 수 없습니다.'), '#f59e0b');
            return null;
        }
        if (selected && !g.referenceMatrix) setWorkReference(selected);
        if (!selected) for (const model of generatedModels()) if (!adapter.isHeld(model) && nearSupply(model)) adapter.removeModel(model);
        const pose = randomize
            ? randomWorkPose(g, generatorRandom())
            : { x: g.nominalX, y: g.nominalY, z: g.nominalZ, rz: g.nominalRz, deviation: { x: 0, y: 0, rz: 0 } };
        let model = selected;
        if (selected) {
            const reference = new THREE.Matrix4().fromArray(g.referenceMatrix);
            const rotation = new THREE.Matrix4().makeRotationZ((pose.rz - poseFromMatrix(reference).rz) * DEG);
            const matrix = rotation.multiply(reference).setPosition(pose.x, pose.y, pose.z);
            adapter.setModelWorldMatrix(model, matrix.toArray());
        } else {
            state.generatedCount += 1;
            model = adapter.createWorkObject({ shape: g.shape, sizeX: g.sizeX, sizeY: g.sizeY, sizeZ: g.sizeZ, color: g.color, name: `VISION WORK ${state.generatedCount}` });
            if (!model) return null;
            model.userData.visionWork = { deviation: pose.deviation, nominal: { x: g.nominalX, y: g.nominalY, rz: g.nominalRz } };
            adapter.setWorldPose(model, pose);
        }
        state.lastSpawn = { ...pose, time: Date.now() };
        state.supplyPendingSince = 0;
        log('vision', format(selected ? '작업물 이동: 편차 X {x}, Y {y}, Rz {rz}°' : '작업물 생성: 편차 X {x}, Y {y}, Rz {rz}°', { x: fixed(pose.deviation.x, 2), y: fixed(pose.deviation.y, 2), rz: fixed(pose.deviation.rz, 2) }));
        if (captureAfter) setTimeout(() => void runTrigger('auto'), 30);
        drawImage();
        schedulePanelRender();
        return model;
    }

    function clearGenerated() {
        for (const model of generatedModels()) if (!adapter.isHeld(model)) adapter.removeModel(model);
        state.lastSpawn = null;
        schedulePanelRender();
    }

    function tick() {
        const cfg = config();
        if (!cfg.enabled) return;
        syncCameraFromModel();
        // The camera model can be deleted from the model tree at any time.
        const mounted = Boolean(mountModel());
        if (mounted !== state.mounted) { state.mounted = mounted; rig.body.visible = !mounted; adapter.requestRender(); schedulePanelRender(); }
        const g = cfg.generator;
        const robot = calibrationRobot();
        if (g.triggerBit >= 0 && robot) {
            const value = adapter.readRobotOutput(robot, g.triggerBit) ? 1 : 0;
            if (value && !state.previousTriggerBit) spawnWork();
            state.previousTriggerBit = value;
        }
        if (g.autoSupply) {
            const selected = selectedWorkModel();
            const sources = cfg.detection.targetId ? selected ? [selected] : [] : generatedModels();
            const present = sources.some(model => !adapter.isHeld(model) && nearSupply(model));
            if (present) state.supplyPendingSince = 0;
            else if (!state.supplyPendingSince) state.supplyPendingSince = performance.now();
            else if (performance.now() - state.supplyPendingSince >= g.supplyDelayMs) spawnWork();
        }
        if (cfg.calibration.showMark && rig.group.parent) updateMark();
    }

    // ------------------------------------------------------------ links

    function linkMode() {
        const link = config().link;
        if (!config().enabled || !link.active) return 'off';
        if (link.target === 'external') return 'external';
        return link.olpMode === 'io' ? 'olp-io' : 'olp-socket';
    }

    function updateLinks() {
        const mode = linkMode();
        if (mode !== 'olp-io') { clearInterval(state.ioTimer); state.ioTimer = null; }
        if (mode !== 'external') disconnectExternal();
        if (mode === 'olp-io') startOlpIo();
        if (mode === 'external' && state.attemptConfig && state.attemptConfig !== JSON.stringify(buildVisionLinkConfig(config()))) disconnectExternal();
        if (mode === 'olp-socket') setLinkStatus('listening', format('OLP Socket: {ip}:{port} 대기', { ip: config().ip, port: config().link.port }));
        if (mode === 'off') setLinkStatus('stopped', '');
        state.link.mode = mode;
    }

    function setLinkStatus(linkState, message, peers = []) {
        state.link.state = linkState;
        state.link.message = message;
        state.link.peers = peers;
        schedulePanelRender();
    }

    /** OLP Socket peer for Open Socket / GetPortState in the browser runtime. */
    function resolveOlpSocketPeer(robot, request) {
        if (linkMode() !== 'olp-socket') return null;
        const link = config().link;
        const matches = link.role === 'server'
            ? !request.server && request.host === config().ip && request.port === link.port
            : request.server && request.channel === link.olpChannel;
        if (!matches) return null;
        setLinkStatus('connected', format('OLP Socket Port[{channel}] 연결', { channel: request.channel }), [adapter.robotLabel(robot)]);
        return {
            label: config().name,
            receive(textValue, reply) {
                log('rx', textValue);
                controller.handleText(textValue).then(answer => {
                    if (answer === null || answer === undefined) return;
                    log('tx', JSON.stringify(answer));
                    state.lastResult = controller.lastResult || state.lastResult;
                    reply(answer);
                    schedulePanelRender();
                }).catch(error => log('error', error.message));
            }
        };
    }

    function startOlpIo() {
        if (state.ioTimer) return;
        state.lastWrittenInputs = [];
        setLinkStatus('connected', format('OLP IO: 결과 InW[{result}], 명령 OutW[{command}]', { result: config().output.resultWord, command: config().output.commandWord }));
        const poll = () => {
            const cfg = config();
            const errors = validateVisionAddresses(cfg);
            if (errors.length) { setLinkStatus('error', errors.join(' / ')); return; }
            const lengths = visionBlockLengths(cfg.output);
            if (lengths.command) {
                const words = Array.from({ length: lengths.command }, (_, i) => adapter.olp.readOutputWord(cfg.output.commandWord + i));
                if (JSON.stringify(words) !== JSON.stringify(state.commandWords)) {
                    state.commandWords = words;
                    const command = readVisionCommandWords(words, cfg.output);
                    if (command.control) log('rx', format('OutW[{word}] 제어 = {value}', { word: cfg.output.commandWord, value: `0x${command.control.toString(16).padStart(4, '0')}` }));
                }
                void controller.handleControlWords(words);
            }
            const result = controller.resultWords();
            result.forEach((word, i) => {
                if (state.lastWrittenInputs[i] === word) return;
                state.lastWrittenInputs[i] = word;
                adapter.olp.writeInputWord(cfg.output.resultWord + i, word);
            });
        };
        state.ioTimer = setInterval(poll, Math.max(10, config().link.pollMs));
        poll();
    }

    function linkMessage(message) {
        if (/ownership conflict|0x106/i.test(message || '')) return `${message} – ${text('다른 장치(통신 테스터 등)가 이미 로봇 입력을 사용 중입니다.')}`;
        if (/EADDRNOTAVAIL/.test(message || '')) return `${message} – ${text('이 PC에서 사용할 수 없는 비전 IP입니다. 127.0.0.x 주소를 사용하세요.')}`;
        if (/EADDRINUSE/.test(message || '')) return `${message} – ${text('같은 IP와 포트를 다른 프로그램이 사용 중입니다.')}`;
        return message;
    }

    function connectionActive() {
        return state.connecting || Boolean(state.socket && !['error', 'stopped'].includes(state.link.state));
    }

    async function connectExternal() {
        if (linkMode() !== 'external') return;
        disconnectExternal();
        const attempt = state.connectionAttempt;
        state.connecting = true;
        state.attemptConfig = JSON.stringify(buildVisionLinkConfig(config()));
        setLinkStatus('connecting', text('로컬 통신 서버에 연결 중'));
        state.connectTimer = setTimeout(() => {
            if (attempt !== state.connectionAttempt) return;
            disconnectExternal();
            setLinkStatus('error', text('로컬 통신 서버에 연결할 수 없습니다.'));
        }, 5000);
        let token;
        try { token = await adapter.serverToken?.(); } catch { token = null; }
        if (attempt !== state.connectionAttempt || linkMode() !== 'external') return;
        if (!token) {
            disconnectExternal();
            setLinkStatus('error', text('외부 통신은 가상환경_시작.bat로 실행한 로컬 서버에서만 사용할 수 있습니다.'));
            return;
        }
        let socket;
        try { socket = new WebSocket(adapter.serverUrl()); }
        catch (error) { disconnectExternal(); setLinkStatus('error', error.message); return; }
        state.socket = socket;
        state.socketReady = false;
        socket.addEventListener('open', () => { if (state.socket === socket) socket.send(JSON.stringify({ type: 'hello', token })); });
        socket.addEventListener('message', event => {
            if (state.socket !== socket) return;
            let message;
            try { message = JSON.parse(event.data); } catch { return; }
            if (message.type === 'ready') {
                clearTimeout(state.connectTimer); state.connectTimer = null;
                state.connecting = false; state.socketReady = true; sendExternalConfig();
            }
            else if (message.type === 'status') {
                const status = message.status || {};
                const endpoint = status.protocol ? `${status.protocol.toUpperCase()} ${status.role === 'server' ? `${status.bindIp}:${status.port}` : `${status.bindIp} → ${status.targetIp}:${status.targetPort}`}` : '';
                setLinkStatus(status.state || 'stopped', [endpoint, linkMessage(status.message)].filter(Boolean).join(' · '), status.peers || []);
                if (status.state === 'connected' || status.state === 'listening') pushExternalResults(true);
            } else if (message.type === 'text') {
                log('rx', message.text);
                controller.handleText(message.text).then(answer => {
                    if (answer === null || answer === undefined || state.socket !== socket) return;
                    state.lastResult = controller.lastResult || state.lastResult;
                    log('tx', JSON.stringify(answer));
                    socket.send(JSON.stringify({ type: 'text', text: answer, peer: message.peer }));
                }).catch(error => log('error', error.message));
            } else if (message.type === 'commands') {
                state.commandWords = message.words;
                const command = readVisionCommandWords(message.words, config().output);
                log('rx', format('명령 영역 제어 = {value}', { value: `0x${command.control.toString(16).padStart(4, '0')}` }));
                void controller.handleControlWords(message.words).then(() => { state.lastResult = controller.lastResult || state.lastResult; pushExternalResults(); });
            } else if (message.type === 'frame') {
                const frame = message.frame;
                log(frame.direction, `${frame.kind} ${frame.summary || ''} [${frame.bytes}B] ${frame.hex}`);
            }
        });
        socket.addEventListener('close', () => {
            if (state.socket !== socket) return;
            disconnectExternal();
        });
        socket.addEventListener('error', () => {
            if (state.socket !== socket) return;
            disconnectExternal();
            setLinkStatus('error', text('로컬 통신 서버에 연결할 수 없습니다.'));
        });
    }

    function sendExternalConfig() {
        if (!state.socketReady) return;
        const errors = config().link.protocol === 'socket' ? [] : validateVisionAddresses(config());
        if (errors.length) { setLinkStatus('error', errors.join(' / ')); return; }
        const linkConfig = buildVisionLinkConfig(config());
        state.lastExternalConfig = JSON.stringify(linkConfig);
        state.lastSentResults = '';
        state.socket.send(JSON.stringify({ type: 'configure', config: linkConfig }));
        log('vision', format('외부 통신 시작: {protocol} {role}', { protocol: linkConfig.protocol.toUpperCase(), role: linkConfig.role === 'server' ? text('서버') : text('클라이언트') }));
    }

    function pushExternalResults(force = false) {
        if (!state.socketReady || !state.socket || config().link.protocol === 'socket') return;
        const words = controller.resultWords();
        const signature = words.join(',');
        if (!force && signature === state.lastSentResults) return;
        state.lastSentResults = signature;
        state.socket.send(JSON.stringify({ type: 'results', words }));
    }

    function disconnectExternal() {
        clearTimeout(state.connectTimer); state.connectTimer = null;
        state.connectionAttempt += 1; state.connecting = false; state.attemptConfig = '';
        const socket = state.socket;
        state.socket = null; state.socketReady = false; state.lastExternalConfig = '';
        if (socket) { try { socket.send(JSON.stringify({ type: 'goodbye' })); } catch { } socket.close(); }
        setLinkStatus('stopped', '');
    }

    // ------------------------------------------------------------ config

    function applyConfig({ links = true } = {}) {
        controller.setConfig(controller.config);
        syncScene();
        if (links) updateLinks();
        drawImage();
        save();
        schedulePanelRender();
    }

    function handleFieldChange(input) {
        const path = input.dataset.visionField;
        const cfg = config();
        const previous = getPath(cfg, path);
        let value;
        if (input.type === 'checkbox') value = input.checked;
        else if (input.dataset.type === 'number' || input.type === 'number' || input.dataset.numericInputType === 'number') value = Number(input.value);
        else value = input.value;
        if (input.type !== 'checkbox' && input.dataset.type !== 'text' && typeof previous === 'number' && !Number.isFinite(value)) { renderPanel(); return; }
        setPath(cfg, path, value);
        if (path === 'link.protocol') {
            if (cfg.link.port === VISION_DEFAULT_PORTS[previous] || !cfg.link.port) cfg.link.port = VISION_DEFAULT_PORTS[value];
            if (cfg.link.targetPort === VISION_DEFAULT_PORTS[previous] || !cfg.link.targetPort) cfg.link.targetPort = VISION_DEFAULT_PORTS[value];
            if (value === 'mc' && previous !== 'mc') cfg.link.role = 'server';
            if ((value === 'modbus' || value === 'eip') && previous !== value) cfg.link.role = 'client';
        }
        if (path === 'output.layout' && value === 'values') Object.assign(cfg.output, { commandWord: -1 });
        if (path === 'output.layout' && value === 'standard' && cfg.output.commandWord < 0) cfg.output.commandWord = cfg.output.resultWord;
        if (path === 'robotId') state.previousTriggerBit = 0;
        if (path === 'camera.direction' && value !== previous) {
            ensureCameraWorkPlane();
            resetCameraCalibration();
        }
        if (path === 'detection.targetId' && value !== previous) {
            cfg.generator.referenceMatrix = null;
            setWorkReference(selectedWorkModel());
            cfg.detection.master = null;
            state.lastResult = null; state.lastObservation = null; state.lastSpawn = null;
            state.supplyPendingSince = 0;
        }
        if (/^camera\.(x|y|z|rx|ry|rz)$/.test(path)) { controller.setConfig(cfg); applyCameraPoseToModel(); }
        applyConfig({ links: path.startsWith('link.') || path.startsWith('output.') || path === 'ip' || path === 'enabled' });
    }

    function applyResolution(id) {
        const [width, height] = id.split('x').map(Number);
        const pixel = cameraPixelSize(width, height);
        if (!Number.isFinite(pixel) || id !== width + 'x' + height) return;
        Object.assign(config().camera, { resolutionWidth: width, resolutionHeight: height, pixelSizeUm: pixel });
        applyConfig({ links: false });
    }

    // ------------------------------------------------------------ panel

    const b = (action, label, icon, kind = '') => `<button type="button" class="vision-button ${kind}" data-vision-action="${action}"><i class="fa-solid ${icon}" aria-hidden="true"></i> ${label}</button>`;

    function conditionFlags() { return visionFormConditions(config()); }

    function buildPanel() {
        const element = panel();
        const content = element?.querySelector('[data-vision-content]');
        if (!content || content.dataset.built) return;
        content.dataset.built = 'true';
        fillVisionForm(content, text);
        content.addEventListener('change', event => {
            const resolution = event.target.closest('[data-vision-resolution]');
            if (resolution) { applyResolution(resolution.value); return; }
            const input = event.target.closest('[data-vision-field]');
            if (!input) return;
            handleFieldChange(input);
        });
        content.addEventListener('toggle', event => {
            if (event.target.matches?.('[data-vision-guide]') && event.target.open) renderPanel();
        }, true);
        content.addEventListener('click', event => {
            const tab = event.target.closest('[data-vision-tab]');
            if (tab) { state.tab = tab.dataset.visionTab; renderPanel(); drawImage(); return; }
            const copy = event.target.closest('[data-vision-copy]');
            if (copy) { void copySample(copy); return; }
            const button = event.target.closest('[data-vision-action]');
            if (!button) return;
            const action = button.dataset.visionAction;
            if (action === 'enable') {
                config().enabled = true;
                placeAroundRobot();
                // Without a robot the camera still appears in the model tree
                // at its default pose.
                if (!mountModel()) createCameraModel();
            }
            else if (action === 'connect') { if (connectionActive()) disconnectExternal(); else void connectExternal(); }
            else if (action === 'capture') void runTrigger();
            else if (action === 'place') placeAroundRobot();
            else if (action === 'create-camera') createCameraModel();
            else if (action === 'use-selected') registerCameraModel(adapter.selectedModel?.());
            else if (action === 'select-camera') adapter.selectModel?.(mountModel());
            else if (action === 'unmount') unregisterCameraModel();
            else if (action === 'cal-center') useTcpForCalibration();
            else if (action === 'cal-auto') void runAutoCalibration();
            else if (action === 'cal-export-lab') exportLabCalibration();
            else if (action === 'cal-clear') { config().calibration.result = null; config().detection.master = null; controller.reset(); applyConfig({ links: false }); }
            else if (action === 'pick-tcp') useTcpForPick();
            else if (action === 'master') void registerMaster();
            else if (action === 'master-clear') { config().detection.master = null; applyConfig({ links: false }); }
            else if (action === 'spawn') spawnWork();
            else if (action === 'spawn-nominal') spawnWork({ randomize: false });
            else if (action === 'spawn-clear') clearGenerated();
            else if (action === 'log-clear') { state.log = []; schedulePanelRender(); }
        });
    }

    async function copySample(button) {
        const documentRef = button.ownerDocument;
        const source = documentRef.querySelector(`[data-vision-sample="${button.dataset.visionCopy}"]`);
        // Robot editors on Windows expect CR+LF line endings.
        const value = String(source?.value || '').replace(/\r?\n/g, '\r\n');
        const copied = value ? await copyText(value, documentRef) : false;
        const label = button.querySelector('span');
        if (label) label.textContent = text(copied ? '복사됨' : '복사 실패');
        button.classList.toggle('copied', copied);
        if (!copied && source) { source.focus(); source.select(); }
        adapter.status?.(text(copied ? '예제 프로그램을 복사했습니다.' : '자동 복사에 실패했습니다. 선택된 내용을 Ctrl+C로 복사하세요.'), copied ? '#22c55e' : '#f59e0b');
        setTimeout(() => {
            if (label) label.textContent = text('복사');
            button.classList.remove('copied');
        }, 1500);
    }

    function setValue(element, value) {
        if (!element || element === element.ownerDocument.activeElement) return;
        if (element.type === 'checkbox') element.checked = Boolean(value);
        else element.value = value === undefined || value === null ? '' : String(value);
    }

    function setHtml(root, name, html) {
        const element = root.querySelector(`[data-vision-out="${name}"]`);
        if (element && element.dataset.html !== html) { element.innerHTML = html; element.dataset.html = html; }
        return element;
    }

    function setOptions(select, html) {
        if (select && select.dataset.options !== html) { select.innerHTML = html; select.dataset.options = html; }
    }

    function renderPanel() {
        const element = panel();
        if (!element) return;
        buildPanel();
        const root = element.querySelector('[data-vision-content]');
        if (!root) return;
        const cfg = config();
        updateVisionForm(root, cfg, state.tab, controller.busy, state.autoCalibrating);
        if (!cfg.enabled) return;
        setOptions(root.querySelector('[data-vision-robots]'), adapter.robots().map(robot => `<option value="${escapeHtml(adapter.robotId(robot))}">${escapeHtml(adapter.robotLabel(robot))}</option>`).join('') || `<option value="">${escapeHtml(text('로봇 없음'))}</option>`);
        const camera = mountModel();
        setOptions(root.querySelector('[data-vision-targets]'), `<option value="">${escapeHtml(text('기본 형상 생성'))}</option>` + adapter.models()
            .filter(model => model !== camera && (adapter.isWorkpiece(model) || adapter.modelId(model) === cfg.detection.targetId))
            .map(model => `<option value="${escapeHtml(adapter.modelId(model))}">${escapeHtml(adapter.modelLabel(model))}</option>`).join(''));
        root.querySelectorAll('[data-vision-field]').forEach(input => {
            const path = input.dataset.visionField;
            let value = getPath(cfg, path);
            if (path === 'robotId' && !value) value = calibrationRobot() ? adapter.robotId(calibrationRobot()) : '';
            setValue(input, value);
        });
        const { resolutionWidth, resolutionHeight } = cfg.camera;
        const resolution = Number.isFinite(cameraPixelSize(resolutionWidth, resolutionHeight))
            ? resolutionWidth + 'x' + resolutionHeight : 'custom';
        setValue(root.querySelector('[data-vision-resolution]'), resolution);
        renderOutputs(root);
    }

    function renderOutputs(root) {
        const cfg = config();
        const camera = mountModel();
        setHtml(root, 'mount', camera
            ? `<i class="fa-solid fa-camera-retro" aria-hidden="true"></i><span>${text('카메라 모델')}</span><b>${escapeHtml(adapter.modelLabel(camera))}</b>${b('select-camera', '선택', 'fa-arrow-pointer')}${b('unmount', '해제', 'fa-link-slash')}`
            : `<i class="fa-solid fa-camera-retro" aria-hidden="true"></i><span>${text('카메라 모델이 없습니다.')}</span>${b('create-camera', '카메라 모델 생성', 'fa-plus', 'primary')}${b('use-selected', '선택한 모델로 등록', 'fa-link')}`);
        const fov = describeVisionFov(cfg.camera, cfg.camera.workPlaneZ);
        setHtml(root, 'fov', fov.corners
            ? `FOV ${fixed(fov.width, 1)} × ${fixed(fov.height, 1)} mm · ${fixed(fov.mmPerPixel, 3)} mm/px · ${text('작업 거리')} ${fixed(fov.workingDistance, 0)} mm`
            : `<span class="vision-warning">${text('카메라가 FOV 표시 높이를 바라보지 않습니다.')}</span>`);
        const linkLabel = { off: '통신 꺼짐', 'olp-socket': 'OLP Socket', 'olp-io': 'OLP IO', external: cfg.link.protocol.toUpperCase() }[linkMode()];
        setHtml(root, 'link-badge', `<i class="fa-solid fa-circle ${escapeHtml(state.link.state)}"></i> ${escapeHtml(text(linkLabel))} · ${escapeHtml(text(LINK_STATES[state.link.state] || ''))}`);
        renderResult(root);
        renderCalibration(root);
        renderWorkpiece(root);
        renderLink(root);
        renderGuide(root);
    }

    function renderResult(root) {
        const result = state.lastResult;
        if (!result) { setHtml(root, 'result', ''); return; }
        const rows = result.ok || result.code === VISION_RESULT_CODES.outOfRange
            ? `<span>dX <b>${fixed(result.dx)}</b></span><span>dY <b>${fixed(result.dy)}</b></span><span>dθ <b>${fixed(result.dtheta)}°</b></span>`
            : `<span>${escapeHtml(text(CODE_LABELS[result.code] || ''))}</span>`;
        setHtml(root, 'result', `<div class="vision-result-line ${result.ok ? 'ok' : 'ng'}"><strong>${result.ok ? 'OK' : 'NG'}</strong>${rows}</div>`);
    }

    function renderCalibration(root) {
        const cal = config().calibration.result;
        const session = controller.session;
        if (!cal) {
            setHtml(root, 'calibration', session
                ? `<p>${format('캘리브레이션 진행 중: {done} / {total}', { done: session.translation.length + session.rotation.length, total: session.plan.length || '?' })}</p>`
                : `<p class="vision-muted">${text('캘리브레이션 결과가 없습니다.')}</p>`);
            setHtml(root, 'calibration-table', '');
            return;
        }
        const rotation = cal.rotation
            ? `<dt>${text('회전 중심 보정')}</dt><dd>ΔX ${fixed(cal.correction.x)} · ΔY ${fixed(cal.correction.y)} mm (${text('반경')} ${fixed(cal.rotation.radius, 2)})</dd>`
            : `<dt>${text('회전 중심 보정')}</dt><dd class="vision-warning">${text('미실시 – 마크가 TCP 축에서 벗어난 만큼 절대 좌표가 치우칩니다.')}</dd>`;
        setHtml(root, 'calibration', `<dl>
            <dt>RMS / ${text('최대')}</dt><dd>${fixed(cal.rms, 4)} / ${fixed(cal.max, 4)} mm</dd>
            <dt>${text('화소 크기')}</dt><dd>${fixed(cal.scaleU, 4)} × ${fixed(cal.scaleV, 4)} mm/px</dd>
            ${rotation}</dl>`);
        const residuals = new Map(cal.residuals.map(item => [item.index, item]));
        const table = cal.points.map(point => `<tr><td>${point.index}</td><td>${fixed(point.u, 2)}</td><td>${fixed(point.v, 2)}</td><td>${fixed(point.x, 2)}</td><td>${fixed(point.y, 2)}</td><td>${fixed(residuals.get(point.index)?.error, 4)}</td></tr>`).join('');
        setHtml(root, 'calibration-table', `<p class="vision-help">${cal.method === 'homography' ? text('호모그래피') : text('어파인')} · ${text('영상 X축 방향')} ${fixed(cal.imageAngle, 2)}° · ${text('직교 오차')} ${fixed(cal.skew, 3)}°${cal.rotation ? ` · ${text('회전 각도 오차')} ${fixed(cal.rotation.angleErrorMax, 3)}°` : ''}</p>
            <table class="vision-table"><thead><tr><th>#</th><th>u</th><th>v</th><th>X</th><th>Y</th><th>${text('잔차')}</th></tr></thead><tbody>${table}</tbody></table>`);
    }

    function renderWorkpiece(root) {
        const nominalLabel = root.querySelector('[data-vision-action="spawn-nominal"] span');
        if (nominalLabel) nominalLabel.textContent = text(config().detection.targetId ? '기준 위치로 이동' : '기준 위치에 생성');
        const master = config().detection.master;
        const spawn = state.lastSpawn;
        setHtml(root, 'workpiece', `<dl>
            <dt>${text('기준 위치')}</dt><dd>${master ? `X ${fixed(master.x)} · Y ${fixed(master.y)} · θ ${fixed(master.theta)}°` : `<span class="vision-muted">${text('미등록')}</span>`}</dd>
            <dt>${text('마지막 편차 (정답)')}</dt><dd>${spawn ? `X ${fixed(spawn.deviation.x, 2)} · Y ${fixed(spawn.deviation.y, 2)} · Rz ${fixed(spawn.deviation.rz, 2)}°` : '—'}</dd></dl>`);
    }

    function addressRows() {
        const cfg = config();
        const lengths = visionBlockLengths(cfg.output);
        const link = cfg.link;
        const external = link.target === 'external';
        const protocolAddress = (word, result) => {
            if (!external) return '';
            const index = word - 32;
            if (link.protocol === 'modbus') return String((result ? (link.role === 'client' ? link.modbusInputBase : link.modbusOutputBase) : (link.role === 'client' ? link.modbusOutputBase : link.modbusInputBase)) + index);
            if (link.protocol === 'mc') return `${link.mcDevice}${(result ? link.mcInputBase : link.mcOutputBase) + index}`;
            if (link.protocol === 'eip') return `${result === (link.role === 'client') ? 'O→T' : 'T→O'} +${index * 2}B`;
            return '';
        };
        const words = controller.resultWords();
        const resultRows = Array.from({ length: lengths.result }, (_, i) => {
            const standard = cfg.output.layout === 'standard';
            const name = standard ? RESULT_NAMES[i] : ['X', '', 'Y', '', 'θ', ''][i];
            if (!name) return '';
            const isValue = standard ? [2, 4, 6, 8].includes(i) : i % 2 === 0;
            const shown = isValue ? fixed(decodeVisionValue(words.slice(i, i + 2), cfg.output), 4) : standard && i === 10 ? String(words[10] + words[11] * 65536) : `0x${words[i].toString(16).padStart(4, '0')}`;
            return `<tr><td>InW[${cfg.output.resultWord + i}]</td><td>${protocolAddress(cfg.output.resultWord + i, true)}</td><td>${text(name)}</td><td>${shown}</td></tr>`;
        }).join('');
        const commands = state.commandWords || [];
        const commandRows = Array.from({ length: lengths.command }, (_, i) => {
            const name = COMMAND_NAMES[i];
            if (!name) return '';
            const shown = [2, 4, 6].includes(i) ? fixed(decodeVisionValue(commands.slice(i, i + 2), cfg.output), 4) : `0x${(commands[i] || 0).toString(16).padStart(4, '0')}`;
            return `<tr><td>OutW[${cfg.output.commandWord + i}]</td><td>${protocolAddress(cfg.output.commandWord + i, false)}</td><td>${text(name)}</td><td>${shown}</td></tr>`;
        }).join('');
        return { resultRows, commandRows };
    }

    function renderLink(root) {
        const cfg = config();
        const connectButton = root.querySelector('[data-vision-action="connect"] span');
        if (connectButton) connectButton.textContent = text(connectionActive() ? '연결 해제' : '연결');
        const flags = conditionFlags();
        const errors = flags.words ? validateVisionAddresses(cfg) : [];
        const peers = state.link.peers?.length ? ` · ${state.link.peers.map(escapeHtml).join(', ')}` : '';
        setHtml(root, 'link', `<p class="vision-summary"><i class="fa-solid fa-circle vision-dot ${escapeHtml(state.link.state)}"></i> ${escapeHtml(text(LINK_STATES[state.link.state] || state.link.state))}${peers}${state.link.message ? `<br><span class="vision-muted">${escapeHtml(state.link.message)}</span>` : ''}</p>
            ${errors.length ? `<p class="vision-warning">${escapeHtml(errors.join(' / '))}</p>` : ''}`);
        if (flags.words) {
            const signals = visionSignalAddresses(cfg);
            const { resultRows, commandRows } = addressRows();
            const bits = cfg.output.layout === 'standard'
                ? `<p class="vision-help">${format('상태 비트: Ready IN[{ready}], Busy IN[{busy}], Done IN[{done}], OK IN[{ok}], NG IN[{ng}]', signals.status)}${signals.control ? `<br>${format('제어 비트: Trigger OUT[{trigger}], CalStart OUT[{calStart}], CalPoint OUT[{calPoint}], Master OUT[{master}], Reset OUT[{reset}]', signals.control)}` : ''}</p>`
                : '';
            setHtml(root, 'map', `${bits}<table class="vision-table"><thead><tr><th>${text('로봇')}</th><th>${text('통신 주소')}</th><th>${text('내용')}</th><th>${text('값')}</th></tr></thead><tbody>${resultRows}${commandRows}</tbody></table>`);
        }
        const logElement = root.querySelector('[data-vision-out="log"]');
        const signature = String(state.log.length) + (state.log.at(-1)?.time || '');
        if (logElement && logElement.dataset.count !== signature) {
            logElement.dataset.count = signature;
            const atBottom = logElement.scrollTop + logElement.clientHeight >= logElement.scrollHeight - 4;
            logElement.innerHTML = state.log.map(entry => `<div class="vision-log-line ${escapeHtml(entry.direction)}"><time>${entry.time}</time><b>${escapeHtml(entry.direction.toUpperCase())}</b><span>${escapeHtml(entry.message)}</span></div>`).join('');
            if (atBottom) logElement.scrollTop = logElement.scrollHeight;
        }
    }

    function renderGuide(root) {
        if (state.tab !== 'link' || !root.querySelector('[data-vision-guide]')?.open) return;
        const samples = buildVisionSamplePrograms(config());
        const flags = conditionFlags();
        const block = (key, title) => samples[key] ? `<section class="vision-sample"><header><strong>${text(title)}</strong><button type="button" class="vision-button" data-vision-copy="${key}"><i class="fa-solid fa-copy" aria-hidden="true"></i> <span>${text('복사')}</span></button></header><textarea readonly spellcheck="false" data-vision-sample="${key}" data-i18n-skip>${escapeHtml(samples[key])}</textarea></section>` : '';
        const blocks = flags.socket
            ? `${block('socketCalibration', '9점 + 회전 캘리브레이션')}${block('socketMaster', '기준 위치 등록')}${block('socketPick', '검사 후 보정 픽업')}${block('socketLabPixel', 'K12 영상 좌표 보정')}`
            : `${block('fieldbusCalibration', '9점 + 회전 캘리브레이션')}${block('fieldbusPick', '검사 후 보정 픽업')}`;
        setHtml(root, 'guide', `<p class="vision-help">${text('P[200] 캘리브레이션 시작 위치, P[100] 기준 픽업 위치, P[101] 접근 위치를 먼저 티칭하세요.')}</p>
            ${flags.socket ? `<table class="vision-table"><thead><tr><th>${text('명령')}</th><th>${text('응답')}</th></tr></thead><tbody>
                <tr><td>${escapeHtml(config().output.triggerCommands)}</td><td>${escapeHtml(config().output.template)}</td></tr>
                <tr><td>CALSTART / CALPOS,X,Y,R</td><td>n,X,Y,R · 0,RMS,MAX,R</td></tr>
                <tr><td>CALRAW</td><td>u,v (${text('Lab 보정용 영상 좌표')})</td></tr>
                <tr><td>PIXEL</td><td>CVXYA,u,v,θ (${text('보정 전 영상 좌표')})</td></tr>
                <tr><td>MST,X,Y,R</td><td>1,X,Y,θ</td></tr>
            </tbody></table>` : ''}${blocks}`);
    }

    // ------------------------------------------------------------ API

    return {
        get config() { return config(); },
        controller,
        resolveOlpSocketPeer,
        isCameraModel,
        registerCameraModel,
        unregisterCameraModel,
        open() { buildPanel(); renderPanel(); drawImage(); },
        refresh() { renderPanel(); },
        update() {
            if (!config().enabled) return;
            syncCameraFromModel();
            if (config().calibration.showMark) updateMark();
        },
        tick,
        start() {
            buildPanel();
            clearInterval(state.tickTimer);
            state.tickTimer = setInterval(tick, 100);
            clearInterval(state.liveTimer);
            state.liveTimer = setInterval(drawImage, 250);
            syncScene();
            updateLinks();
            renderPanel();
        },
        serialize() { return JSON.parse(JSON.stringify(normalizeVisionConfig(config()))); },
        restore(data) {
            disconnectExternal();
            const restored = normalizeVisionConfig(data || {});
            controller.setConfig(restored);
            controller.reset();
            state.lastResult = null;
            state.lastObservation = null;
            state.commandWords = [];
            state.lastWrittenInputs = [];
            state.lastExternalConfig = '';
            syncScene();
            updateLinks();
            renderPanel();
        },
        sceneChanged() { syncScene(); schedulePanelRender(); },
        trigger: runTrigger,
        captureConveyorObjects(objects, toConveyor, shiftAtExposure = () => [0, 0, 0], defaultType = 0) {
            if (!config().enabled) throw new Error('가상 비전 패널에서 카메라를 활성화하세요.');
            syncCameraFromModel();
            const camera = createVisionCameraModel(config().camera);
            const found = [];
            for (const object of objects) {
                if (!object || object.visible === false || object.userData?.attachmentHost) continue;
                const features = objectFeaturePoints(object, camera.axes.z);
                if (!features) continue;
                const shift = shiftAtExposure(object);
                const atExposure = point => point.map((value, index) => value + shift[index]);
                const center = atExposure(features.center), axisPoint = atExposure(features.axis);
                const image = projectWorldPoint(camera, center);
                if (!image?.inImage) continue;
                const corners = features.corners.map(point => projectWorldPoint(camera, atExposure(point)));
                const score = 100 * corners.filter(point => point?.inImage).length / corners.length;
                if (score < (config().detection.minScore ?? 0)) continue;
                const position = toConveyor(center), direction = toConveyor(axisPoint);
                const type = Number(object.userData?.conveyorObjectType ?? defaultType);
                if (!Number.isInteger(type) || type < 0 || type > 15) throw new Error('컨베이어 물체 종류는 0~15여야 합니다.');
                // K14's detected object pose is XYZABC, with A rotating about Z.
                const theta = Math.atan2(direction[1] - position[1], direction[0] - position[0]) / DEG;
                found.push({ id: adapter.modelId(object), type, pose: [...position, theta, 0, 0] });
            }
            return found;
        },
        registerMaster,
        autoCalibrate: runAutoCalibration,
        spawnWork,
        drawImage,
        get state() { return state; },
        dispose() {
            clearInterval(state.tickTimer); clearInterval(state.ioTimer); clearInterval(state.liveTimer);
            disconnectExternal();
            rig.dispose(); mark.dispose(); imageRenderer.dispose();
        }
    };
}
