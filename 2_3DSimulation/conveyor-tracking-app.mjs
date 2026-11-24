import { syncSetting, syncSettingsOptions } from './settings-controls.mjs';
import { fillConveyorForm } from './wasm/forms.mjs';
import { uiText, uiFormat } from './ui-language.mjs';
import * as THREE from 'three';
import { ConveyorTracking, isConveyorSensorAddress } from './conveyor-tracking-core.mjs?v=20261124-single-source';
import { conveyorLocalBounds } from './conveyor-scene.mjs?v=20261123-shared-bounds';
import { normalizeSensorSettings, conveyorSensorLayout, createConveyorSensorVisual, createConveyorSensorPreview } from './conveyor-sensor-preview.mjs?v=20261123-sensor-light';

// For rejected frames only. Successful replies use flags for camera request IDs.
const invalidFrameReasons = new Map([
    [1, '컨베이어 입력 시간 또는 진행 방향이 유효하지 않습니다. 가상 컨트롤러에 다시 연결하세요.'],
    [2, '연동 중인 엔코더 배율이 변경됐습니다. 기존 배율을 확인하세요.'],
    [3, '연동 중인 컨베이어 좌표계가 변경됐습니다. 벨트와 로봇 베이스 위치를 확인하세요.'],
    [4, '연동 중인 센서 입력 설정이 변경됐습니다. 기존 IN 번호를 확인하세요.'],
    [5, '대기 중인 물체 또는 추종이 있어 기존 엔코더 배율로 다시 연동해야 합니다.'],
    [6, '대기 중인 물체 또는 추종이 있어 기존 컨베이어와 로봇 베이스 위치로 다시 연동해야 합니다.'],
    [7, '재연동할 엔코더 위치가 입력 범위를 벗어났습니다.'],
    [8, '가상 컨트롤러가 엔코더 또는 비전 데이터를 처리할 수 없습니다.'],
]);

const vector = values => new THREE.Vector3(...values);
const plainBox = box => ({ min: { x: box.min.x, y: box.min.y, z: box.min.z }, max: { x: box.max.x, y: box.max.y, z: box.max.z } });

export function createConveyorTrackingApp(adapter) {
    const belts = new Map();
    const links = new Map();
    let lastPanelUpdate = -Infinity;
    const suspended = new Map();
    const saved = new Map();
    const testSettings = new Map();
    let controllerChoices = [];
    let reloadSettings = false;
    let feedSummary = '';
    let defaults;
    let activeMotion = [];
    let externalDriveShown = false;
    let testRun = null, removeTestListeners = () => {};
    let dialog, fields, status, table, timer;
    const report = text => { if (status && status.textContent !== text) status.textContent = text; };
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
        button.innerHTML = `<svg width="14" height="14" viewBox="0 0 20 20" aria-hidden="true" focusable="false">
            <g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <rect x="1.5" y="6" width="17" height="6" rx="3"/>
                <path d="m5.5 12-1 3m10-3 1 3"/>
            </g>
            <g fill="currentColor">
                <circle cx="5.4" cy="9" r="1.1"/><circle cx="10" cy="9" r="1.1"/><circle cx="14.6" cy="9" r="1.1"/>
            </g>
        </svg> 컨베이어`;
        button.title = '컨베이어 표시/숨김'; button.setAttribute('aria-label', '컨베이어 표시/숨김');
        document.getElementById('btn-vision-panel')?.after(button);
        dialog = document.createElement('aside'); dialog.id = 'conveyor-tracking-dialog';
        dialog.className = 'vision-panel conveyor-tracking-panel panel-user-hidden panel-edge-resizable';
        dialog.setAttribute('aria-labelledby', 'conveyor-tracking-title');
        fillConveyorForm(dialog);
        const title = dialog.querySelector('#conveyor-tracking-title');
        title.firstElementChild.replaceWith(button.querySelector('svg').cloneNode(true));
        (document.getElementById('vision-panel')?.parentElement || document.body).append(dialog);
        const form = dialog.querySelector('form'); fields = form.elements;
        defaults = Object.fromEntries(Array.from(fields, field => [field.name, field.value]));
        form.addEventListener('submit', event => event.preventDefault());
        status = dialog.querySelector('[data-status]'); table = dialog.querySelector('[data-links]');
        fields.belt.addEventListener('change', () => { stopTest(); loadSettings(); });
        fields.controller.addEventListener('change', () => loadTarget());
        dialog.querySelector('.vision-main > .vision-help').textContent = uiText('벨트에 연결할 컨트롤러를 선택하세요. 마스터·슬레이브 구성에서는 마스터를 선택하세요.');
        fields.autoCapture.addEventListener('change', updateCaptureFields);
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
                    const belt = belts.get(fields.belt.value);
                    if (!belt) throw new Error('먼저 컨베이어를 연결하세요.');
                    belt.manualCapture = true;
                }
            } catch (error) { if (action === 'apply-feed') feedReport(error.message); else report(error.message); }
        });
        timer = setInterval(flush, 50);
        document.addEventListener('visibilitychange', () => { if (document.hidden) stopJog(); });
        window.addEventListener('pagehide', () => stopAll('페이지 종료'));
    }
    function selectedMapping() { return uniqueMappings().find(item => item.gripObjectRef === fields.belt.value); }
    function testReport(message) { const node = dialog?.querySelector('[data-test-status]'); if (node && node.textContent !== message) node.textContent = message; }
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
    function refreshControllers(preferredIp) {
        const previous = controllerChoices[fields.controller.selectedIndex];
        const controllers = adapter.controllers();
        let index = preferredIp ? controllers.findIndex(item => item.ipAddress === preferredIp) : -1;
        if (index < 0 && previous) index = controllers.findIndex(item => item === previous
            || (previous.sessionId && item.sessionId === previous.sessionId));
        if (index < 0 && previous?.ipAddress) index = controllers.findIndex(item => item.ipAddress === previous.ipAddress);
        if (index < 0) index = 0;
        syncSettingsOptions(fields.controller, controllers.map((item, i) => ({
            value: i, label: item.ipAddress || `C${i + 1}`
        })), index);
        controllerChoices = controllers.slice();
        return previous !== selectedController();
    }
    function refreshOptions(force = false) {
        if (!fields) return;
        const old = fields.belt.value;
        const options = uniqueMappings();
        syncSettingsOptions(fields.belt, options.map(mapping => ({ value: mapping.gripObjectRef, label: beltLabel(mapping) })));
        const changed = old !== fields.belt.value;
        if (changed && testRun?.mapping.gripObjectRef === old) stopTest();
        loadSettings(force || changed || reloadSettings);
        reloadSettings = false;
    }
    let feedError = '';
    function feedReport(message = '') {
        feedError = message;
        const node = dialog?.querySelector('[data-feed-status]'), feed = adapter.feed.settings(fields.belt.value);
        const text = message || (feed ? uiFormat('자동 공급 {state} · 최소 {gap} mm · 좌우 ±{lateral} mm · 회전 ±{rotation}° · 벨트 운전 시 적용', {
            state: uiText(feed.enabled ? '설정됨' : '중지'), gap: feed.gap, lateral: feed.positionRange, rotation: feed.rotationRange
        }) : '원본과 간격·편차를 선택한 뒤 자동 공급 적용을 누르세요.');
        if (node && node.textContent !== text) node.textContent = text;
    }
    function loadSettings(force = true) {
        const belt = fields.belt.value;
        const mapping = selectedMapping(), settings = saved.get(belt);
        const controllerChanged = refreshControllers(force ? settings?.controllerIp : undefined);
        const feed = adapter.feed.settings(belt);
        const sources = adapter.feed.sources().map(item => ({ value: item.ref, label: adapter.feed.label(item) }));
        syncSettingsOptions(fields.feedSource, sources, force ? feed?.sourceRef || fields.feedSource.value : fields.feedSource.value);
        if (feed?.sourceRef && sources.some(source => source.value === feed.sourceRef)) {
            syncSetting(fields.feedSource, feed.sourceRef, force);
        }
        syncSetting(fields.feedGap, feed?.gap ?? 100, force);
        syncSetting(fields.feedEnabled, feed?.enabled ?? true, force);
        syncSetting(fields.feedPositionRange, feed?.positionRange ?? 20, force);
        syncSetting(fields.feedRotationRange, feed?.rotationRange ?? 15, force);
        const summary = JSON.stringify([belt, feed?.enabled, feed?.gap, feed?.positionRange, feed?.rotationRange]);
        if (force || feedSummary !== summary) { feedSummary = summary; feedReport(); }
        const test = testSettings.get(belt);
        syncSetting(fields.testSpeed, test?.speed ?? mapping?.conveyorSpeed ?? 100, force);
        syncSetting(fields.testDirection, test?.direction || 'forward', force);
        syncSetting(fields.autoCapture, settings?.autoCapture === true, force);
        syncSetting(fields.captureDistance, settings?.captureDistance ?? 0, force);
        for (const key of ['scale', 'position', 'width', 'height', 'objectType']) {
            syncSetting(fields[key], settings?.[key] ?? defaults[key], force);
        }
        loadTarget(force || controllerChanged);
        updateCaptureFields();
    }
    function loadTarget(force = true) {
        const settings = saved.get(fields.belt.value);
        for (const key of ['channel', 'address']) syncSetting(fields[key], settings?.[key] ?? defaults[key], force);
    }
    function updateCaptureFields() {
        const linked = belts.has(fields.belt.value);
        for (const key of ['scale', 'position', 'width', 'height', 'objectType', 'autoCapture', 'captureDistance']) {
            const disabled = linked || (key === 'captureDistance' && !fields.autoCapture.checked);
            if (fields[key].disabled !== disabled) fields[key].disabled = disabled;
        }
    }

    function selectedController() { return controllerChoices[fields.controller.selectedIndex]; }
    function readSettings() {
        const mapping = selectedMapping();
        if (!mapping) throw new Error('동작 설정에 컨베이어를 등록하세요.');
        return normalizeSensorSettings({ ...saved.get(mapping.gripObjectRef), belt: mapping.gripObjectRef,
            controllerIp: selectedController()?.ipAddress || '', channel: fields.channel.value, scale: fields.scale.value,
            address: fields.address.value, position: fields.position.value, width: fields.width.value,
            height: fields.height.value === '' ? null : fields.height.value, objectType: fields.objectType.value,
            autoCapture: fields.autoCapture.checked, captureDistance: fields.captureDistance.value });
    }
    function configure(value) {
        const settings = normalizeSensorSettings(value);
        if (!mappings().some(m => m.gripObjectRef === settings.belt)) throw new Error('등록된 컨베이어를 선택하세요.');
        if (belts.has(settings.belt)) throw new Error('연동 해제 후 센서 설정을 변경하세요.');
        stopTest(); adapter.placeSensor?.(settings); saved.set(settings.belt, settings); adapter.save?.(); adapter.requestRender?.();
        if (fields) { refreshOptions(); fields.belt.value = settings.belt; loadSettings(); }
    }
    function connect() {
        const mapping = uniqueMappings().find(item => item.gripObjectRef === fields.belt.value), controller = selectedController();
        if (!mapping) throw new Error('동작 설정에 컨베이어를 등록하세요.');
        if (!controller || controller.controllerKind === 'real' || controller.source !== 'bridge'
            || controller.status !== 'streaming' || !/^127\./.test(controller.ipAddress || '')) throw new Error('전용 브리지로 로컬 K14 가상 컨트롤러에 먼저 연결하세요.');
        const key = mapping.gripObjectRef;
        if (belts.has(key)) throw new Error(uiText('이미 연결된 컨베이어입니다.'));
        const ip = controller.ipAddress;
        const channel = Number(fields.channel.value), address = Number(fields.address.value);
        const objectType = Number(fields.objectType.value);
        if (!Number.isInteger(objectType) || objectType < 0 || objectType > 15) throw new Error('비전 물체 종류는 0~15여야 합니다.');
        for (const other of links.values()) if ((other.ip === ip || other.controller === controller) && (other.tracker.conveyor === channel || other.address === address)) throw new Error('컨베이어 번호 또는 센서 입력이 이미 사용 중입니다.');
        if (!isConveyorSensorAddress(address)) throw new Error('센서 입력은 IN0~64 또는 IN512~2559를 사용하세요.');
        const settings = readSettings();
        if (settings.autoCapture && !adapter.vision().config.enabled)
            throw new Error(uiText('비전 패널에서 카메라를 활성화하거나 자동 촬영을 해제하세요.'));
        const belt = adapter.resolveBelt(mapping), layout = conveyorSensorLayout(belt, mapping, settings, adapter.resolveSensor?.(settings));
        const { frame, scale, sensor } = layout;
        const x = Number(fields.position.value), width = Number(fields.width.value);
        if (!Number.isFinite(x) || !Number.isFinite(width) || width <= 0 || width > 1000) throw new Error('센서 위치와 폭을 확인하세요.');
        const base = adapter.controllerBase(controller);
        if (!base) throw new Error('컨트롤러에 연결할 로봇 모델을 선택하세요.');
        base.updateWorldMatrix(true, false);
        const relative = base.matrixWorld.clone().invert().multiply(frame.matrixWorld);
        const position = new THREE.Vector3(), rotation = new THREE.Quaternion(), unused = new THREE.Vector3(); relative.decompose(position, rotation, unused);
        const euler = new THREE.Euler().setFromQuaternion(rotation, 'ZYX');
        const captureOffset = [...position.toArray(), euler.x, euler.y, euler.z].map((value, index) => index < 3 ? value : THREE.MathUtils.radToDeg(value));
        const sourceSignature = JSON.stringify([settings.scale, frame.matrixWorld.elements, plainBox(sensor),
            mapping.conveyorAxis, objectType, settings.autoCapture, settings.captureDistance]);
        const signature = JSON.stringify([ip, channel, sourceSignature, captureOffset, address]);
        const previous = suspended.get(key);
        const tracker = previous?.signature === signature ? previous.tracker : new ConveyorTracking({
            conveyor: channel, countsPerMm: settings.scale, session: crypto.randomUUID(),
            captureOffset, sensors: [{ id: 'photo', address, bounds: sensor }]
        });
        const helper = createConveyorSensorVisual(layout, settings);
        (layout.mount || adapter.scene()).add(helper.group);
        const link = { mapping, belt, frame, inverseFrame: frame.matrixWorld.clone().invert(), scale, tracker, helper,
            sensorMount: layout.mount, sensorMatrix: layout.mount?.matrixWorld.clone(), beltMatrix: belt.matrixWorld.clone(),
            axis: mapping.conveyorAxis, autoCapture: settings.autoCapture, captureDistance: settings.captureDistance,
            objectType, manualCapture: false, controller, ip, key, signature, address, base, baseMatrix: base.matrixWorld.clone(),
            lastSent: 0, pending: false, pendingAt: 0, message: '연결 확인 중', lastReply: null };
        link.seen = previous?.signature === signature ? previous.seen : new WeakSet();
        link.latest = tracker.reconnectFrame();
        if (tracker === previous?.tracker) link.probe = { ...link.latest, events: [] };
        links.set(tracker.session, link);
        belts.set(key, link);
        suspended.delete(key);
        updateCaptureFields();
        saved.set(key, { ...settings, belt: key, controllerIp: ip, channel, address });
        adapter.save?.();
        helper.setDetected(link.latest.sensors[0].value);
        report('K14 컨트롤러의 응답을 기다립니다.'); flush(); render();
    }
    function releaseController(controller) {
        if (!controller || ![...links.values()].some(link => link.controller === controller)) return;
        adapter.send({ type: 'conveyorRelease' }, controller);
        for (const [session, link] of links) {
            if (link.controller !== controller) continue;
            suspended.set(link.key, { tracker: link.tracker, signature: link.signature, seen: link.seen });
            links.delete(session);
            belts.delete(link.key);
            link.row?.remove();
            if (testRun?.mapping.gripObjectRef === link.key) stopTest();
            else adapter.stop(link.mapping);
            link.helper.dispose();
        }
        if (fields) updateCaptureFields();
        render();
    }
    function stopAll(message) { stopTest(); for (const controller of new Set([...links.values()].map(link => link.controller))) releaseController(controller); report(message); }
    function fail(link, error) {
        releaseController(link.controller);
        report(link.ip + ' · ' + uiText(error.message || String(error)));
    }
    function flush() {
        if (testRun && ((testRun.mode === 'jog' && (dialog.classList.contains('panel-user-hidden') || dialog.ownerDocument.hidden || dialog.ownerDocument.defaultView?.closed))
            || !uniqueMappings().some(item => item.gripObjectRef === testRun.mapping.gripObjectRef && item.conveyorAxis === testRun.originalAxis)
            || !adapter.isDriving(testRun.mapping))) stopTest();
        const now = performance.now();
        // Software rendering can delay RAF beyond the native 250ms watchdog.
        // Advance real objects, sensor crossings and captures before sending;
        // never fabricate encoder heartbeats from an unadvanced scene.
        adapter.advanceSimulation?.(now);
        for (const link of links.values()) {
            if (link.controller.status !== 'streaming') { fail(link, new Error(uiText('가상 컨트롤러 연결이 끊어져 해당 연동을 해제했습니다.'))); continue; }
            if (link.pending) { if (now - link.pendingAt > 1800) fail(link, new Error('K14 컨베이어 응답 시간이 초과되었습니다.')); continue; }
            if (!link.probe && link.nextStep) {
                const step = link.nextStep;
                link.latest = link.tracker.frame(step.velocity, step.count, step.quadrature);
                link.nextStep = null;
            }
            const frame = link.probe || link.latest;
            if (!frame || frame.sequence <= link.lastSent) continue;
            if (link.controller.socket?.bufferedAmount > 60000) { fail(link, new Error(uiText('전송이 지연되어 해당 컨트롤러의 컨베이어 연동을 해제했습니다.'))); continue; }
            if (!adapter.send({ type: 'conveyorFrame', frame }, link.controller)) { fail(link, new Error('전용 브리지에 연결할 수 없습니다.')); continue; }
            link.pending = true; link.pendingAt = now; link.lastSent = frame.sequence;
        }
        if (now - lastPanelUpdate >= 100) {
            lastPanelUpdate = now;
            render();
        }
    }
    function sensorSummary(key) {
        const group = belts.get(key);
        if (!group) return preview.summary(key);
        return { address: group.address, level: Number(group.tracker.levels.get('photo')),
            encoder: group.step?.count ?? group.latest?.encoder ?? '0' };
    }
    function render() {
        if (!table || dialog.classList.contains('panel-user-hidden')) return;
        if (!testRun) {
            const moving = activeMotion.find(mapping => mapping.gripObjectRef === fields.belt.value);
            if (moving) testReport(uiText('운전 중') + ' · ' + moving.conveyorSpeed + ' mm/s');
            else if (externalDriveShown) testReport(uiText('정지'));
            externalDriveShown = Boolean(moving);
        } else externalDriveShown = false;
        const sensor = sensorSummary(fields.belt.value), node = dialog.querySelector('[data-sensor-preview]');
        const sensorText = sensor ? uiFormat('장면 센서 IN{address}: {level}', {
            address: sensor.address, level: uiText(sensor.level ? 'ON (감지)' : 'OFF (대기)')
        }) : '센서 설정 적용 후 레이저 감지 위치를 표시합니다.';
        if (node && node.textContent !== sensorText) node.textContent = sensorText;
        for (const link of links.values()) {
            if (!link.row) {
                link.row = document.createElement('p');
                table.append(link.row);
            }
            const text = `${link.controller.ipAddress} / Cnv${link.tracker.conveyor}: ${link.lastReply?.encoder ?? link.latest?.encoder ?? '0'} counts · A/B ${link.latest?.quadrature.join('/') ?? '0/0'} · IN${link.address}=${link.latest?.sensors[0]?.value ?? 0} · ${uiFormat('물체 {count}', { count: link.lastReply?.objects ?? '—' })} · ${uiText(link.message)}`;
            if (link.row.textContent !== text) link.row.textContent = text;
        }
    }
    function objectBounds(object, group) {
        const box = conveyorLocalBounds(object, group.frame, group.inverseFrame);
        return box.isEmpty() ? null : box;
    }
    function advanceBelt(link, seconds, active, candidates) {
        const { belt, frame, mapping, tracker } = link;
        belt.updateWorldMatrix(true, false);
        link.sensorMount?.updateWorldMatrix(true, false);
        if (link.sensorMount && !link.sensorMount.matrixWorld.equals(link.sensorMatrix))
            throw new Error('센서 위치가 바뀌었습니다. 연동을 다시 설정하세요.');
        if (!belt.matrixWorld.equals(link.beltMatrix)) throw new Error('컨베이어 위치가 바뀌었습니다. 연동을 다시 설정하세요.');
        if (!mappings().some(item => item.gripObjectRef === mapping.gripObjectRef && item.conveyorAxis.endsWith(link.axis.slice(-1))))
            throw new Error('컨베이어 동작 설정이 바뀌었습니다. 연동을 다시 설정하세요.');
        link.base.updateWorldMatrix(true, false);
        if (!link.base.matrixWorld.equals(link.baseMatrix))
            throw new Error('로봇 베이스 위치가 바뀌었습니다. 연동을 다시 설정하세요.');
        const moving = active.find(item => item.gripObjectRef === mapping.gripObjectRef);
        const distance = moving ? moving.conveyorSpeed * seconds * link.scale * (moving.conveyorAxis.startsWith('-') ? -1 : 1) : 0;
        const entries = [], visible = [];
        for (const object of candidates) {
            const old = link.before?.get(object);
            if (!old || !eligible(object)) continue;
            const current = objectBounds(object, link);
            if (current) { entries.push({ before: old, after: current }); visible.push(object); }
        }
        const step = tracker.prepareStep({ seconds, distance, objects: entries,
            sensorCapture: link.autoCapture ? { distance: link.captureDistance } : null });
        const newlyDetected = new Set();
        const capture = fraction => {
            const toConveyor = point => vector(point).applyMatrix4(link.inverseFrame).toArray();
            let offset;
            if (fraction !== 1) {
                const transform = new THREE.Matrix3().setFromMatrix4(frame.matrixWorld);
                const shifts = new Map(visible.map((object, index) => {
                    const { before, after } = entries[index];
                    const delta = new THREE.Vector3(after.min.x - before.min.x, after.min.y - before.min.y, after.min.z - before.min.z);
                    return [object, delta.applyMatrix3(transform).multiplyScalar(fraction - 1).toArray()];
                }));
                offset = object => shifts.get(object);
            }
            const candidates = link.busMaster ? visible.filter(object => !link.seen.has(object) && !newlyDetected.has(object)) : visible;
            return adapter.vision().captureConveyorObjects(candidates, toConveyor, offset, link.objectType,
                object => newlyDetected.add(object));
        };
        const shots = link.manualCapture || link.captureRequest
            ? [{ requestId: link.captureRequest || 0, objects: capture(1) }]
            : step.exposures.map(fraction => ({ fraction, objects: capture(fraction) }));
        const delay = shots.length ? Number(adapter.vision().config.camera.processingMs || 0) / 1000 : 0;
        tracker.recordStep(step, shots, delay);
        for (const object of newlyDetected) link.seen.add(object);
        link.step = link.nextStep = step;
        link.manualCapture = false;
        link.captureRequest = 0;
        link.helper.setDetected(tracker.levels.get('photo'));
    }
    return {
        get active() { return links.size > 0; },
        observeMotion(mappings) { activeMotion = mappings; },
        isTrackingController(controller) {
            for (const link of links.values()) if (link.controller === controller) return true;
            return false;
        },
        get monitoring() { return saved.size > 0; },
        configure,
        sensorPreview: sensorSummary,
        get testing() { return testRun !== null; },
        testMapping(mapping) {
            return testRun && mapping.gripObjectRef === testRun.mapping.gripObjectRef
                ? { ...mapping, conveyorAxis: testRun.axis, conveyorSpeed: testRun.speed } : mapping;
        },
        start: install,
        refreshLanguage() {
            if (!fields) return;
            dialog.querySelector('.vision-main > .vision-help').textContent = uiText('벨트에 연결할 컨트롤러를 선택하세요. 마스터·슬레이브 구성에서는 마스터를 선택하세요.');
            const belts = new Map(uniqueMappings().map(item => [item.gripObjectRef, beltLabel(item)]));
            for (const option of fields.belt.options) {
                if (belts.has(option.value)) option.textContent = belts.get(option.value);
            }
            renderTestRun();
            feedReport(feedError);
            render();
        },
        open() { stopJog(); refreshOptions(true); render(); },
        refresh(controllersOnly = false) {
            if (!dialog?.isConnected || dialog.classList.contains('panel-user-hidden')) return;
            if (controllersOnly) {
                if (refreshControllers()) loadTarget(true);
            } else refreshOptions();
        },
        beforeStep(candidates) {
            const unlinked = [...saved.values()].filter(settings => !belts.has(settings.belt));
            for (const settings of unlinked) {
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
            preview.before(unlinked, mappings(), candidates, belts);
            for (const group of belts.values()) {
                group.before = new Map();
                for (const object of candidates) if (eligible(object)) {
                    const box = objectBounds(object, group);
                    if (box) group.before.set(object, box);
                }
            }
        },
        afterStep(seconds, active, candidates) {
            preview.after(seconds, active, candidates);
            for (const group of belts.values()) {
                try { advanceBelt(group, seconds, active, candidates); }
                catch (error) { fail(group, error); }
            }
        },
        message(message, controller) {
            if (message.type !== 'conveyorFrameResult') return false;
            const link = links.get(message.session);
            if (!message.success) {
                // A delayed rejection from an old session cannot tear down its replacement.
                const active = message.session ? link : [...links.values()].find(item => item.controller === controller);
                if (active?.controller === controller) {
                    const rejection = message.status === 87 ? invalidFrameReasons.get(message.flags) : undefined;
                    const slave = message.status === 170 && message.flags === 7;
                    fail(active, new Error(slave ? uiText('컨베이어 가상 버스의 마스터를 선택하세요.')
                        : rejection ? uiText(rejection) + ' (87)' : message.message || uiText('K14 컨베이어 입력이 거부되었습니다.')));
                }
                return true;
            }
            if (!link || link.controller !== controller) return true;
            if (message.sequence !== link.lastSent) return true;
            link.busMaster = (message.flags >>> 31) === 1;
            const requestId = message.flags & 0x7fffffff;
            try {
                if (link.probe) {
                    if (link.tracker.resumeEvents({ ...message, flags: requestId })) link.lastCaptureRequest = requestId;
                    link.probe = null;
                    link.latest = link.tracker.reconnectFrame();
                } else {
                    link.tracker.acknowledge(message);
                }
                if (!link.lastReply) report('컨베이어 엔코더·센서·비전 입력을 전송하고 있습니다.');
                link.pending = false; link.lastReply = message; link.message = '연동 중';
                if (requestId && requestId !== link.lastCaptureRequest) { link.lastCaptureRequest = requestId; link.captureRequest = requestId; }
            }
            catch (error) { fail(link, error); }
            return true;
        },
        serialize() { return structuredClone([...saved.values()]); },
        restore(settings) {
            stopAll('저장한 컨베이어 설정을 불러왔습니다. 연동 시작을 눌러 연결하세요.'); suspended.clear(); preview.clear(); saved.clear(); testSettings.clear();
            if (Array.isArray(settings)) for (const item of settings.slice(0, 32)) if (item && typeof item.belt === 'string') {
                const targets = Array.isArray(item.targets) ? item.targets.filter(target => target && /^127\./.test(target.ip)
                    && Number.isInteger(target.channel) && target.channel >= 0 && target.channel < 4
                    && isConveyorSensorAddress(target.address)) : [];
                const target = targets.find(entry => entry.ip === item.controllerIp) || targets[0];
                saved.set(item.belt, {
                    belt: item.belt, controllerIp: String(target?.ip || item.controllerIp || ''), channel: Number(target?.channel ?? item.channel), scale: Number(item.scale),
                    ...(typeof item.sensorModelId === 'string' ? { sensorModelId: item.sensorModelId } : {}),
                    ...(item.presetVersion === 2 ? { presetVersion: 2 } : {}),
                    ...(item.moduleModelIds && typeof item.moduleModelIds === 'object' ? { moduleModelIds: { camera: String(item.moduleModelIds.camera || ''), stand: String(item.moduleModelIds.stand || ''), arm: String(item.moduleModelIds.arm || ''), objects: Array.isArray(item.moduleModelIds.objects) ? item.moduleModelIds.objects.filter(id=>typeof id==='string') : [] } } : {}),
                    height: item.height == null ? null : Number(item.height), ...(item.preset === 'tracking-test' ? { preset: item.preset } : {}),
                    address: Number(target?.address ?? item.address), position: Number(item.position), width: Number(item.width), objectType: Number(item.objectType || 0),
                    autoCapture: item.autoCapture === true, captureDistance: Number(item.captureDistance ?? 0)
                });
            }
            reloadSettings = true;
            adapter.settingsChanged?.();
        },
        reset() { stopAll('장면을 초기화해 컨베이어 연결을 해제했습니다.'); suspended.clear(); preview.clear(); saved.clear(); testSettings.clear(); reloadSettings = true; adapter.settingsChanged?.(); },
        dispose() { stopAll('종료'); suspended.clear(); preview.clear(); clearInterval(timer); dialog?.remove(); }
    };
}
