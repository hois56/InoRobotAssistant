import { fillConveyorForm } from './wasm/forms.mjs';
import { uiText, uiFormat } from './ui-language.mjs';
import * as THREE from 'three';
import { ConveyorTracking, isConveyorSensorAddress } from './conveyor-tracking-core.mjs?v=20261118-request-capture-1';
import { conveyorLocalBounds } from './conveyor-scene.mjs?v=20261116-feed-1';
import { normalizeSensorSettings, conveyorSensorLayout, createConveyorSensorVisual, createConveyorSensorPreview } from './conveyor-sensor-preview.mjs?v=20261118-request-capture-1';

const vector = values => new THREE.Vector3(...values);
const plainBox = box => ({ min: { x: box.min.x, y: box.min.y, z: box.min.z }, max: { x: box.max.x, y: box.max.y, z: box.max.z } });

export function createConveyorTrackingApp(adapter) {
    const links = new Map();
    const suspended = new Map();
    const saved = new Map();
    const testSettings = new Map();
    let testRun = null, removeTestListeners = () => {};
    let dialog, fields, status, table, before = new Map(), timer;
    const report = text => { if (status) status.textContent = text; };
    const mappings = () => adapter.mappings().filter(mapping => mapping.action === 'CONVEYOR' && adapter.resolveBelt(mapping));
    const uniqueMappings = () => [...new Map(mappings().map(mapping => [mapping.gripObjectRef, mapping])).values()];
    function eligible(object) {
        if (!object || !object.visible || object.userData.attachmentHost || object.userData.tcpFrame
            || object.userData.equipmentOwner || object.userData.equipmentFilm
            || (object.userData.placement && object.userData.placement !== 'scene')) return false;
        return !mappings().some(mapping => {
            for (let parent = adapter.resolveBelt(mapping); parent; parent = parent.parent) if (parent === object) return true;
            return false;
        });
    }

    const preview = createConveyorSensorPreview({ ...adapter, eligible, report });
    function install() {
        if (dialog) return;
        const button = document.createElement('button'); button.type = 'button'; button.id = 'btn-conveyor-tracking';
        button.dataset.panelToggle = 'conveyor-tracking-dialog';
        button.innerHTML = '<i class="fa-solid fa-arrows-left-right" aria-hidden="true"></i> 컨베이어';
        button.title = '컨베이어 표시/숨김'; button.setAttribute('aria-label', '컨베이어 표시/숨김');
        document.getElementById('btn-vision-panel')?.after(button);
        dialog = document.createElement('aside'); dialog.id = 'conveyor-tracking-dialog';
        dialog.className = 'vision-panel conveyor-tracking-panel panel-user-hidden panel-edge-resizable';
        dialog.setAttribute('aria-labelledby', 'conveyor-tracking-title');
        fillConveyorForm(dialog);
        (document.getElementById('vision-panel')?.parentElement || document.body).append(dialog);
        const form = dialog.querySelector('form'); fields = form.elements;
        form.addEventListener('submit', event => event.preventDefault());
        status = dialog.querySelector('[data-status]'); table = dialog.querySelector('[data-links]');
        fields.belt.addEventListener('change', () => { stopTest(); loadSettings(); });
        for (const field of [fields.testSpeed, fields.testDirection]) field.addEventListener('change', () => { rememberTestSettings(); stopTest(); });
        button.addEventListener('click', () => queueMicrotask(() => { if (dialog.classList.contains('panel-user-hidden')) stopJog(); }));
        const jog = dialog.querySelector('[data-action="jog"]');
        jog.addEventListener('pointerdown', event => {
            if (event.button !== 0) return;
            event.preventDefault(); jog.focus();
            try { startTest('jog'); jog.setPointerCapture(event.pointerId); }
            catch (error) { testReport(error.message); }
        });
        for (const event of ['pointerup', 'pointercancel', 'lostpointercapture', 'blur']) jog.addEventListener(event, stopJog);
        jog.addEventListener('keydown', event => {
            if (![' ', 'Enter'].includes(event.key)) return;
            event.preventDefault(); if (event.repeat) return;
            try { startTest('jog'); } catch (error) { testReport(error.message); }
        });
        jog.addEventListener('keyup', event => { if ([' ', 'Enter'].includes(event.key)) { event.preventDefault(); stopJog(); } });
        dialog.addEventListener('click', event => {
            if (event.target.closest('[data-panel-action]')) stopJog();
            const action = event.target.closest('[data-action]')?.dataset.action;
            if (!action) return;
            if (['run', 'stop', 'jog'].includes(action)) {
                try {
                    if (action === 'run') startTest('run');
                    if (action === 'stop') { stopTest(); const mapping = selectedMapping(); if (mapping) adapter.stop(mapping); }
                } catch (error) { testReport(error.message); }
                return;
            }
            try {
                if (action === 'apply-feed') {
                    adapter.feed.configure({ belt: fields.belt.value, sourceRef: fields.feedSource.value, gap: fields.feedGap.value,
                        positionRange: fields.feedPositionRange.value, rotationRange: fields.feedRotationRange.value, enabled: fields.feedEnabled.checked });
                    feedReport();
                }
                if (action === 'apply-sensor') { configure(readSettings()); report('센서 설정을 적용했습니다.'); }
                if (action === 'connect') connect();
                if (action === 'release') releaseController(selectedController());
                if (action === 'capture') {
                    const link = links.get(fields.belt.value);
                    if (!link) throw new Error('먼저 컨베이어를 연결하세요.');
                    link.manualCapture = true;
                }
            } catch (error) { if (action === 'apply-feed') feedReport(error.message); else report(error.message); }
        });
        timer = setInterval(flush, 50);
        document.addEventListener('visibilitychange', () => { if (document.hidden) stopJog(); });
        window.addEventListener('pagehide', () => stopAll('페이지 종료'));
    }
    function selectedMapping() { return uniqueMappings().find(item => item.gripObjectRef === fields.belt.value); }
    function testReport(message) { const node = dialog?.querySelector('[data-test-status]'); if (node) node.textContent = message; }
    function rememberTestSettings() {
        const speed = Number(fields.testSpeed.value);
        if (selectedMapping() && Number.isFinite(speed) && speed > 0 && speed <= 5000)
            testSettings.set(fields.belt.value, { speed, direction: fields.testDirection.value });
    }
    function stopJog() { if (testRun?.mode === 'jog') stopTest(); }
    function stopTest() {
        const previous = testRun; testRun = null;
        removeTestListeners(); removeTestListeners = () => {};
        if (previous) adapter.stop(previous.mapping);
        dialog?.querySelector('[data-action="jog"]')?.setAttribute('aria-pressed', 'false');
        testReport('정지');
    }
    function startTest(mode) {
        stopTest();
        const mapping = selectedMapping(), speed = Number(fields.testSpeed.value);
        if (!mapping) throw new Error('동작 설정에 컨베이어를 등록하세요.');
        if (!Number.isFinite(speed) || speed <= 0 || speed > 5000) throw new Error('속도는 0보다 크고 5000mm/s 이하여야 합니다.');
        const axis = mapping.conveyorAxis;
        const reverse = fields.testDirection.value === 'reverse';
        const testAxis = reverse ? (axis.startsWith('-') ? axis.slice(1) : '-' + axis) : axis;
        const owner = dialog.ownerDocument.defaultView;
        if (!owner || owner.closed || dialog.ownerDocument.hidden || dialog.classList.contains('panel-user-hidden')) return;
        rememberTestSettings();
        testRun = { mapping, speed, axis: testAxis, originalAxis: axis, mode };
        if (mode === 'jog') {
            owner.addEventListener('blur', stopJog); owner.addEventListener('pagehide', stopJog);
            const ownerDocument = dialog.ownerDocument;
            const visibility = () => { if (ownerDocument.hidden) stopJog(); };
            ownerDocument.addEventListener('visibilitychange', visibility);
            removeTestListeners = () => { owner.removeEventListener('blur', stopJog); owner.removeEventListener('pagehide', stopJog); ownerDocument.removeEventListener('visibilitychange', visibility); };
        }
        adapter.drive(mapping);
        dialog.querySelector('[data-action="jog"]').setAttribute('aria-pressed', String(mode === 'jog'));
        renderTestRun();
    }
    function renderTestRun() {
        if (!testRun) return;
        const direction = testRun.axis === testRun.originalAxis ? '정방향' : '역방향';
        testReport([uiText(testRun.mode === 'jog' ? 'JOG' : '운전 중'), uiText(direction), testRun.speed + ' mm/s'].join(' · '));
    }
    function beltLabel(mapping) {
        const name = mapping.conveyorName || mapping.gripObjectRef;
        const prefix = '컨베이어 이송 / ';
        return !mapping.conveyorCustomName && name.startsWith(prefix)
            ? uiText('컨베이어 이송') + ' / ' + name.slice(prefix.length) : name;
    }
    function refreshOptions() {
        const old = fields.belt.value; fields.belt.replaceChildren();
        for (const mapping of uniqueMappings()) fields.belt.add(new Option(beltLabel(mapping), mapping.gripObjectRef));
        if ([...fields.belt.options].some(option => option.value === old)) fields.belt.value = old;
        fields.controller.replaceChildren();
        adapter.controllers().forEach((controller, index) => fields.controller.add(new Option(controller.ipAddress || `C${index + 1}`, String(index))));
        loadSettings();
    }
    let feedError = '';
    function feedReport(message = '') {
        feedError = message;
        const node = dialog?.querySelector('[data-feed-status]'), feed = adapter.feed.settings(fields.belt.value);
        if (node) node.textContent = message || (feed ? uiFormat('자동 공급 {state} · 최소 {gap} mm · 좌우 ±{lateral} mm · 회전 ±{rotation}° · 벨트 운전 시 적용', {
            state: uiText(feed.enabled ? '설정됨' : '중지'), gap: feed.gap, lateral: feed.positionRange, rotation: feed.rotationRange
        }) : '원본과 간격·편차를 선택한 뒤 자동 공급 적용을 누르세요.');
    }
    function loadSettings() {
        const mapping = selectedMapping();
        const feed = adapter.feed.settings(fields.belt.value), oldSource = fields.feedSource.value;
        fields.feedSource.replaceChildren();
        for (const item of adapter.feed.sources()) fields.feedSource.add(new Option(adapter.feed.label(item), item.ref));
        const sourceRef = feed?.sourceRef || oldSource;
        if ([...fields.feedSource.options].some(option => option.value === sourceRef)) fields.feedSource.value = sourceRef;
        fields.feedGap.value = feed?.gap ?? 100; fields.feedEnabled.checked = feed?.enabled ?? true; feedReport();
        fields.feedPositionRange.value = feed?.positionRange ?? 20; fields.feedRotationRange.value = feed?.rotationRange ?? 15;
        const test = testSettings.get(fields.belt.value);
        fields.testSpeed.value = test?.speed ?? mapping?.conveyorSpeed ?? 100; fields.testDirection.value = test?.direction || 'forward';
        const settings = saved.get(fields.belt.value); if (!settings) return;
        for (const key of ['channel', 'scale', 'address', 'position', 'width', 'objectType']) fields[key].value = settings[key];
        fields.height.value = settings.height ?? '';
        const index = adapter.controllers().findIndex(item => item.ipAddress === settings.controllerIp);
        if (index >= 0) fields.controller.value = String(index);
    }
    function selectedController() { return adapter.controllers()[Number(fields.controller.value)]; }
    function readSettings() {
        const mapping = selectedMapping();
        if (!mapping) throw new Error('동작 설정에 컨베이어를 등록하세요.');
        return normalizeSensorSettings({ ...saved.get(mapping.gripObjectRef), belt: mapping.gripObjectRef,
            controllerIp: selectedController()?.ipAddress || '', channel: fields.channel.value, scale: fields.scale.value,
            address: fields.address.value, position: fields.position.value, width: fields.width.value,
            height: fields.height.value === '' ? null : fields.height.value, objectType: fields.objectType.value });
    }
    function configure(value) {
        const settings = normalizeSensorSettings(value);
        if (!mappings().some(m => m.gripObjectRef === settings.belt)) throw new Error('등록된 컨베이어를 선택하세요.');
        if (links.has(settings.belt)) throw new Error('연동 해제 후 센서 설정을 변경하세요.');
        stopTest(); adapter.placeSensor?.(settings); saved.set(settings.belt, settings); adapter.save?.(); adapter.requestRender?.();
        if (fields) { refreshOptions(); fields.belt.value = settings.belt; loadSettings(); }
    }
    function connect() {
        const mapping = uniqueMappings().find(item => item.gripObjectRef === fields.belt.value), controller = selectedController();
        if (!mapping) throw new Error('동작 설정에 컨베이어를 등록하세요.');
        if (!controller || controller.controllerKind === 'real' || controller.source !== 'bridge'
            || controller.status !== 'streaming' || !/^127\./.test(controller.ipAddress || '')) throw new Error('전용 브리지로 로컬 K14 가상 컨트롤러에 먼저 연결하세요.');
        if (links.has(mapping.gripObjectRef)) throw new Error('이미 연결된 컨베이어입니다.');
        const channel = Number(fields.channel.value), address = Number(fields.address.value);
        const objectType = Number(fields.objectType.value);
        if (!Number.isInteger(objectType) || objectType < 0 || objectType > 15) throw new Error('비전 물체 종류는 0~15여야 합니다.');
        for (const other of links.values()) if (other.controller === controller && (other.tracker.conveyor === channel || other.address === address)) throw new Error('컨베이어 번호 또는 센서 입력이 이미 사용 중입니다.');
        if (!isConveyorSensorAddress(address)) throw new Error('센서 입력은 IN0~64 또는 IN512~2559를 사용하세요.');
        const settings = readSettings();
        const belt = adapter.resolveBelt(mapping), layout = conveyorSensorLayout(belt, mapping, settings, adapter.resolveSensor?.(settings));
        const { frame, scale, sensor } = layout;
        const box = conveyorLocalBounds(belt, frame);
        if (box.isEmpty()) throw new Error('컨베이어 형상을 읽을 수 없습니다.');
        const x = Number(fields.position.value), width = Number(fields.width.value);
        if (!Number.isFinite(x) || !Number.isFinite(width) || width <= 0 || width > 1000) throw new Error('센서 위치와 폭을 확인하세요.');
        const base = adapter.controllerBase(controller);
        if (!base) throw new Error('컨트롤러에 연결할 로봇 모델을 선택하세요.');
        base.updateWorldMatrix(true, false);
        const relative = base.matrixWorld.clone().invert().multiply(frame.matrixWorld);
        const position = new THREE.Vector3(), rotation = new THREE.Quaternion(), unused = new THREE.Vector3(); relative.decompose(position, rotation, unused);
        const euler = new THREE.Euler().setFromQuaternion(rotation, 'ZYX');
        const captureOffset = [...position.toArray(), euler.x, euler.y, euler.z].map((value, index) => index < 3 ? value : THREE.MathUtils.radToDeg(value));
        const signature = JSON.stringify({ controller: controller.ipAddress, channel, scale: Number(fields.scale.value),
            captureOffset, sensor: plainBox(sensor), address, objectType, axis: mapping.conveyorAxis });
        const previous = suspended.get(mapping.gripObjectRef);
        const tracker = previous?.signature === signature ? previous.tracker
            : new ConveyorTracking({ conveyor: channel, countsPerMm: Number(fields.scale.value), session: crypto.randomUUID(), captureOffset,
                sensors: [{ id: 'photo', address, bounds: sensor }] });
        const helper = createConveyorSensorVisual(layout, settings);
        (layout.mount || adapter.scene()).add(helper.group);
        const link = { mapping, controller, belt, frame, scale, tracker, signature, address, objectType, helper, lastSent: 0, pending: false, pendingAt: 0,
            sensorMount: layout.mount, sensorMatrix: layout.mount?.matrixWorld.clone(), beltMatrix: belt.matrixWorld.clone(), base, baseMatrix: base.matrixWorld.clone(), axis: mapping.conveyorAxis,
            manualCapture: false, message: '연결 확인 중', lastReply: null };
        links.set(mapping.gripObjectRef, link);
        saved.set(mapping.gripObjectRef, { ...settings, belt: mapping.gripObjectRef, controllerIp: controller.ipAddress, channel, scale: tracker.countsPerMm,
            address, position: x, width, objectType });
        adapter.save?.();
        link.latest = tracker.reconnectFrame();
        report('K14 컨트롤러의 응답을 기다립니다.'); flush(); render();
    }
    function releaseController(controller) {
        stopTest();
        if (!controller) return;
        adapter.send({ type: 'conveyorRelease' }, controller);
        for (const [key, link] of links) if (link.controller === controller) {
            suspended.set(key, { tracker: link.tracker, signature: link.signature });
            adapter.stop(link.mapping); link.helper.dispose(); links.delete(key);
        }
        render();
    }
    function stopAll(message) { stopTest(); for (const controller of new Set([...links.values()].map(link => link.controller))) releaseController(controller); report(message); }
    function fail(link, error) { releaseController(link.controller); report(error.message || String(error)); }
    function flush() {
        if (testRun && ((testRun.mode === 'jog' && (dialog.classList.contains('panel-user-hidden') || dialog.ownerDocument.hidden || dialog.ownerDocument.defaultView?.closed))
            || !uniqueMappings().some(item => item.gripObjectRef === testRun.mapping.gripObjectRef && item.conveyorAxis === testRun.originalAxis)
            || !adapter.isDriving(testRun.mapping))) stopTest();
        const now = performance.now();
        // Software rendering can delay RAF beyond the native 250ms watchdog.
        // Advance real objects, sensor crossings and captures before sending;
        // never fabricate encoder heartbeats from an unadvanced scene.
        adapter.advanceSimulation?.(now);
        for (const link of [...links.values()]) {
            if (link.controller.status !== 'streaming') { fail(link, new Error('가상 컨트롤러 연결이 끊어져 컨베이어를 정지했습니다.')); continue; }
            if (link.pending) { if (now - link.pendingAt > 1800) fail(link, new Error('K14 컨베이어 응답 시간이 초과되었습니다.')); continue; }
            if (!link.latest || link.latest.sequence <= link.lastSent) continue;
            if (link.controller.socket?.bufferedAmount > 60000) { fail(link, new Error('컨베이어 전송이 지연되어 정지했습니다.')); continue; }
            if (!adapter.send({ type: 'conveyorFrame', frame: link.latest }, link.controller)) { fail(link, new Error('전용 브리지에 연결할 수 없습니다.')); continue; }
            link.pending = true; link.pendingAt = now; link.lastSent = link.latest.sequence;
        }
        render();
    }
    function render() {
        if (!table || dialog.classList.contains('panel-user-hidden')) return;
        table.replaceChildren();
        const sensor = preview.summary(fields.belt.value), node = dialog.querySelector('[data-sensor-preview]');
        if (node) node.textContent = sensor ? uiFormat('장면 센서 IN{address}: {level}', {
            address: sensor.address, level: uiText(sensor.level ? 'ON (감지)' : 'OFF (대기)')
        }) : '센서 설정 적용 후 레이저 감지 위치를 표시합니다.';
        for (const link of links.values()) {
            const row = document.createElement('p');
            row.textContent = `${link.controller.ipAddress} / Cnv${link.tracker.conveyor}: ${link.lastReply?.encoder ?? link.latest?.encoder ?? '0'} counts · A/B ${link.latest?.quadrature.join('/') ?? '0/0'} · IN${link.address}=${link.latest?.sensors[0]?.value ?? 0} · ${uiFormat('물체 {count}', { count: link.lastReply?.objects ?? '—' })} · ${uiText(link.message)}`;
            table.append(row);
        }
    }
    function objectBounds(object, frame) { const box = conveyorLocalBounds(object, frame); return box.isEmpty() ? null : plainBox(box); }
    return {
        get active() { return links.size > 0; },
        get monitoring() { return saved.size > 0; },
        configure,
        sensorPreview: key => preview.summary(key),
        get testing() { return testRun !== null; },
        testMapping(mapping) {
            return testRun && mapping.gripObjectRef === testRun.mapping.gripObjectRef
                ? { ...mapping, conveyorAxis: testRun.axis, conveyorSpeed: testRun.speed } : mapping;
        },
        start: install,
        refreshLanguage() {
            if (!fields) return;
            const belts = new Map(uniqueMappings().map(item => [item.gripObjectRef, beltLabel(item)]));
            for (const option of fields.belt.options) {
                if (belts.has(option.value)) option.textContent = belts.get(option.value);
            }
            renderTestRun();
            feedReport(feedError);
            render();
        },
        open() { stopJog(); refreshOptions(); render(); },
        beforeStep(candidates) {
            for (const settings of saved.values()) {
                const mount = adapter.resolveSensor?.(settings), mapping = mappings().find(m => m.gripObjectRef === settings.belt);
                if (!mount || !mapping) continue;
                const layout = conveyorSensorLayout(adapter.resolveBelt(mapping), mapping, settings, mount);
                if (Math.abs(settings.position-layout.x) > .001 || Math.abs((settings.height ?? 0)-layout.height) > .001) {
                    settings.position=layout.x;settings.height=layout.height;
                    if (fields?.belt.value === settings.belt && ![fields.position,fields.height].includes(dialog.ownerDocument.activeElement)) {
                        fields.position.value=layout.x;fields.height.value=layout.height;
                    }
                    adapter.save?.();
                }
            }
            preview.before([...saved.values()], mappings(), candidates, links);
            before = new Map();
            for (const link of links.values()) before.set(link, new Map(candidates.filter(eligible).map(object => [object, objectBounds(object, link.frame)]).filter(([, box]) => box)));
        },
        afterStep(seconds, active, candidates) {
            preview.after(seconds, active, candidates);
            for (const link of [...links.values()]) try {
                link.belt.updateWorldMatrix(true, false);
                link.base.updateWorldMatrix(true, false);
                link.sensorMount?.updateWorldMatrix(true,false);
                if (link.sensorMount && !link.sensorMount.matrixWorld.equals(link.sensorMatrix)) throw new Error('센서 위치가 바뀌었습니다. 연동을 다시 설정하세요.');
                if (!link.belt.matrixWorld.equals(link.beltMatrix)) throw new Error('컨베이어 위치가 바뀌었습니다. 연동을 다시 설정하세요.');
                if (!link.base.matrixWorld.equals(link.baseMatrix)) throw new Error('로봇 베이스 위치가 바뀌었습니다. 연동을 다시 설정하세요.');
                if (!mappings().some(item => item.gripObjectRef === link.mapping.gripObjectRef && item.conveyorAxis.endsWith(link.axis.slice(-1)))) throw new Error('컨베이어 동작 설정이 바뀌었습니다. 연동을 다시 설정하세요.');
                const moving = active.find(item => item.gripObjectRef === link.mapping.gripObjectRef);
                const distance = moving && seconds ? moving.conveyorSpeed * seconds * link.scale * (moving.conveyorAxis.startsWith('-') ? -1 : 1) : 0;
                const entries = [], visible = [];
                for (const object of candidates) {
                    if (!eligible(object)) continue;
                    const old = before.get(link)?.get(object), current = objectBounds(object, link.frame);
                    if (!old || !current) continue;
                    entries.push({ before: old, after: current });
                    visible.push(object);
                }
                const captures = [];
                let captureDelaySeconds = 0;
                if (link.manualCapture || link.captureRequest) {
                    const inverse = link.frame.matrixWorld.clone().invert();
                    const vision = adapter.vision();
                    const objects = vision.captureConveyorObjects(visible, point => vector(point).applyMatrix4(inverse).toArray(),
                        undefined, link.objectType);
                    captures.push({ requestId: link.captureRequest || 0, objects });
                    captureDelaySeconds = Number(vision.config.camera.processingMs || 0) / 1000;
                }
                link.latest = link.tracker.sample({ seconds, distance, objects: entries, captures, captureDelaySeconds });
                link.manualCapture = false;
                link.captureRequest = 0;
                link.helper.setDetected(link.latest.sensors[0].value);
            } catch (error) { fail(link, error); }
        },
        message(message, controller) {
            if (message.type !== 'conveyorFrameResult') return false;
            const link = [...links.values()].find(item => item.controller === controller && item.tracker.session === message.session);
            if (!message.success) { for (const item of [...links.values()].filter(item => item.controller === controller)) fail(item, new Error(message.message || 'K14 컨베이어 입력이 거부되었습니다.')); return true; }
            if (!link) return true;
            if (message.sequence !== link.lastSent) return true;
            try {
                link.tracker.acknowledge(message); link.pending = false; link.lastReply = message; link.message = '연동 중'; report('컨베이어 엔코더·센서·비전 입력을 전송하고 있습니다.');
                if (message.flags && message.flags !== link.lastCaptureRequest) { link.lastCaptureRequest = message.flags; link.captureRequest = message.flags; }
            }
            catch (error) { fail(link, error); }
            return true;
        },
        serialize() { return structuredClone([...saved.values()]); },
        restore(settings) {
            stopAll('저장한 컨베이어 설정을 불러왔습니다. 연동 시작을 눌러 연결하세요.'); suspended.clear(); preview.clear(); saved.clear(); testSettings.clear();
            if (Array.isArray(settings)) for (const item of settings.slice(0, 32)) if (item && typeof item.belt === 'string') saved.set(item.belt, {
                belt: item.belt, controllerIp: String(item.controllerIp || ''), channel: Number(item.channel), scale: Number(item.scale),
                ...(typeof item.sensorModelId === 'string' ? { sensorModelId: item.sensorModelId } : {}),
                ...(item.presetVersion === 2 ? { presetVersion: 2 } : {}),
                ...(item.moduleModelIds && typeof item.moduleModelIds === 'object' ? { moduleModelIds: { camera: String(item.moduleModelIds.camera || ''), stand: String(item.moduleModelIds.stand || ''), arm: String(item.moduleModelIds.arm || ''), objects: Array.isArray(item.moduleModelIds.objects) ? item.moduleModelIds.objects.filter(id=>typeof id==='string') : [] } } : {}),
                height: item.height == null ? null : Number(item.height), ...(item.preset === 'tracking-test' ? { preset: item.preset } : {}),
                address: Number(item.address), position: Number(item.position), width: Number(item.width), objectType: Number(item.objectType || 0)
            });
        },
        reset() { stopAll('장면을 초기화해 컨베이어 연결을 해제했습니다.'); suspended.clear(); preview.clear(); saved.clear(); testSettings.clear(); },
        dispose() { stopAll('종료'); suspended.clear(); preview.clear(); clearInterval(timer); dialog?.remove(); }
    };
}
