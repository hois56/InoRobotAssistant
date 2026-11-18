import * as THREE from 'three';
import { ConveyorTracking, isConveyorSensorAddress } from './conveyor-tracking-core.mjs?v=20261114-sensor-input-0';
import { conveyorLocalBounds } from './conveyor-scene.mjs?v=20261116-feed-1';
import { normalizeSensorSettings, conveyorSensorLayout, createConveyorSensorVisual, createConveyorSensorPreview } from './conveyor-sensor-preview.mjs?v=20261114-sensor-input-0';

const vector = values => new THREE.Vector3(...values);
const plainBox = box => ({ min: { x: box.min.x, y: box.min.y, z: box.min.z }, max: { x: box.max.x, y: box.max.y, z: box.max.z } });

export function createConveyorTrackingApp(adapter) {
    const links = new Map();
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
        dialog.innerHTML = `<div class="vision-header">
          <h2 id="conveyor-tracking-title"><i class="fa-solid fa-arrows-left-right" aria-hidden="true"></i> 컨베이어</h2>
          <div class="panel-header-actions">
            <button type="button" data-panel-action="popout" data-panel-id="conveyor-tracking-dialog" title="별도 창으로 분리" aria-label="컨베이어를 별도 창으로 분리"><i class="fa-solid fa-up-right-from-square" aria-hidden="true"></i></button>
            <button type="button" data-panel-action="hide" data-panel-id="conveyor-tracking-dialog" title="숨기기" aria-label="컨베이어 숨기기"><i class="fa-solid fa-eye-slash" aria-hidden="true"></i></button>
          </div></div>
          <form class="vision-content"><div class="vision-main">
          <p class="vision-help">컨베이어의 이동을 가상 컨트롤러의 엔코더·센서·비전 입력으로 연결합니다.</p>
          <section class="vision-page" aria-labelledby="conveyor-connection-title">
          <h3 id="conveyor-connection-title">연결 대상</h3><div class="vision-grid">
          <label class="vision-field wide"><span>컨베이어</span><select name="belt"></select></label>
          <label class="vision-field"><span>가상 컨트롤러</span><select name="controller"></select></label>
          <label class="vision-field"><span>컨베이어 번호</span><input name="channel" type="number" min="0" max="3" value="0"></label>
          </div></section>
          <section class="vision-page" aria-labelledby="conveyor-test-title">
          <h3 id="conveyor-test-title">테스트 운전</h3><div class="vision-grid">
          <label class="vision-field"><span>속도 (mm/s)</span><input name="testSpeed" type="number" min="0.01" max="5000" step="any" value="100"></label>
          <label class="vision-field"><span>운전 방향</span><select name="testDirection"><option value="forward">정방향 (설정 방향)</option><option value="reverse">역방향 (반대 방향)</option></select></label>
          </div><div class="vision-actions">
          <button type="button" class="vision-button primary" data-action="run">운전 시작</button>
          <button type="button" class="vision-button" data-action="jog" aria-pressed="false">JOG (누르는 동안)</button>
          <button type="button" class="vision-button danger" data-action="stop">정지</button>
          </div><p class="vision-summary" data-test-status role="status" aria-live="polite">정지</p>
          <p class="vision-help">운전 시작은 정지를 누를 때까지 유지되며, 다른 프로그램으로 이동하거나 이 창을 숨기고 닫아도 계속 운전합니다. JOG는 누르는 동안만 움직이며 포커스가 벗어나거나 창을 숨기면 정지합니다. 테스트 속도와 방향은 동작 설정을 바꾸지 않습니다.</p>
          </section>
          <section class="vision-page" aria-labelledby="conveyor-feed-title">
          <h3 id="conveyor-feed-title">오브젝트 자동 공급</h3><div class="vision-grid">
          <label class="vision-field wide"><span>등록 오브젝트</span><select name="feedSource"></select></label>
          <label class="vision-field"><span>물체 사이 최소 간격 (mm)</span><input name="feedGap" type="number" min="0" max="1000000" step="any" value="100"></label>
          <label class="vision-field"><span>좌우 위치 편차 (±mm)</span><input name="feedPositionRange" type="number" min="0" max="1000000" step="any" value="20"></label>
          <label class="vision-field"><span>회전 편차 (±°)</span><input name="feedRotationRange" type="number" min="0" max="180" step="any" value="15"></label>
          </div><label class="vision-check"><input name="feedEnabled" type="checkbox" checked> 컨베이어 운전 중 자동 공급</label>
          <button type="button" class="vision-button" data-action="apply-feed">자동 공급 적용</button>
          <p class="vision-summary" data-feed-status role="status" aria-live="polite"></p>
          <p class="vision-help">운전 방향의 입구에서 좌우 위치와 회전을 무작위로 바꿔 공급하므로 비전 위치·각도 보정을 시험할 수 있습니다. 편차를 0으로 설정하면 해당 변화를 끕니다. 벨트 안에 들어가도록 편차를 제한하고 회전해도 최소 간격을 유지합니다. 생성 물체는 접힌 자동 공급 그룹에 모이며 끝단을 지나면 정리됩니다. 집은 물체는 유지합니다.</p>
          </section>
          <section class="vision-page" aria-labelledby="conveyor-input-title">
          <h3 id="conveyor-input-title">엔코더 · 센서</h3><div class="vision-grid">
          <label class="vision-field"><span>엔코더 (counts/mm)</span><input name="scale" type="number" min="0.00001" max="1000000000" value="1000"></label>
          <label class="vision-field"><span>센서 입력 (IN)</span><input name="address" type="number" min="0" max="2559" value="512"></label>
          <label class="vision-field"><span>센서 위치 X (mm)</span><input name="position" type="number" step="any" value="0"></label>
          <label class="vision-field"><span>센서 폭 (mm)</span><input name="width" type="number" min="0.1" max="1000" value="2"></label>
          <label class="vision-field"><span>센서 높이 (벨트 위 mm)</span><input name="height" type="number" min="0.1" max="500" step="any" value="20"></label>
          </div><p class="vision-help">센서는 이동 좌표계의 X 위치에서 벨트를 가로지릅니다. 빨간 레이저는 대기, 초록색은 감지입니다. 높이가 비어 있으면 기존 전체 높이 감지 영역을 유지합니다.</p>
          <button type="button" class="vision-button" data-action="apply-sensor">센서 설정 적용</button>
          <p class="vision-summary" data-sensor-preview role="status" aria-live="polite"></p></section>
          <section class="vision-page" aria-labelledby="conveyor-vision-title">
          <h3 id="conveyor-vision-title">비전</h3><div class="vision-grid">
          <label class="vision-field"><span>비전 물체 종류</span><input name="objectType" type="number" min="0" max="15" value="0"></label>
          </div><label class="vision-check"><input name="capture" type="checkbox" checked> 센서 감지 시 자동 촬영</label>
          <p class="vision-help">비전 패널의 카메라 시야로 장면의 물체 좌표를 검출합니다.</p></section>
          <div class="vision-actions">
            <button type="button" class="vision-button primary" data-action="connect">연동 시작</button>
            <button type="button" class="vision-button" data-action="capture">현재 화면 촬영</button>
            <button type="button" class="vision-button danger" data-action="release">연동 해제</button>
          </div>
          <p class="vision-summary" role="status" aria-live="polite" data-status></p>
          <div class="conveyor-tracking-links" data-links></div>
          <p class="vision-help">연동 해제 전 벨트를 정지하세요. 연결이 끊기면 가상 엔코더는 최대 250ms 안에 정지합니다.</p>
          </div></form>`;
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
                if (action === 'apply-sensor') { configure(readSettings()); report('센서 설정을 적용했습니다. 레이저와 촬영 결과를 장면에서 확인하세요.'); }
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
        testReport(`${mode === 'jog' ? 'JOG' : '운전 중'} · ${reverse ? '역방향' : '정방향'} · ${speed} mm/s`);
    }
    function refreshOptions() {
        const old = fields.belt.value; fields.belt.replaceChildren();
        for (const mapping of uniqueMappings()) fields.belt.add(new Option(mapping.conveyorName || mapping.gripObjectRef, mapping.gripObjectRef));
        if ([...fields.belt.options].some(option => option.value === old)) fields.belt.value = old;
        fields.controller.replaceChildren();
        adapter.controllers().forEach((controller, index) => fields.controller.add(new Option(controller.ipAddress || `C${index + 1}`, String(index))));
        loadSettings();
    }
    function feedReport(message) {
        const node = dialog?.querySelector('[data-feed-status]'), feed = adapter.feed.settings(fields.belt.value);
        if (node) node.textContent = message || (feed ? `자동 공급 ${feed.enabled ? '설정됨' : '중지'} · 최소 ${feed.gap} mm · 좌우 ±${feed.positionRange} mm · 회전 ±${feed.rotationRange}° · 벨트 운전 시 적용` : '원본과 간격·편차를 선택한 뒤 자동 공급 적용을 누르세요.');
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
        fields.capture.checked = settings.capture;
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
            height: fields.height.value === '' ? null : fields.height.value, capture: fields.capture.checked, objectType: fields.objectType.value });
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
        if (fields.capture.checked && !adapter.vision().config.enabled) throw new Error('비전 패널에서 카메라를 활성화하거나 자동 촬영을 해제하세요.');
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
        const tracker = new ConveyorTracking({ conveyor: channel, countsPerMm: Number(fields.scale.value), session: crypto.randomUUID(), captureOffset,
            sensors: [{ id: 'photo', address, bounds: sensor, capture: fields.capture.checked }] });
        const helper = createConveyorSensorVisual(layout, settings);
        (layout.mount || adapter.scene()).add(helper.group);
        const link = { mapping, controller, belt, frame, scale, tracker, address, objectType, helper, lastSent: 0, pending: false, pendingAt: 0,
            sensorMount: layout.mount, sensorMatrix: layout.mount?.matrixWorld.clone(), beltMatrix: belt.matrixWorld.clone(), base, baseMatrix: base.matrixWorld.clone(), axis: mapping.conveyorAxis,
            manualCapture: false, message: '연결 확인 중', lastReply: null };
        links.set(mapping.gripObjectRef, link);
        saved.set(mapping.gripObjectRef, { ...settings, belt: mapping.gripObjectRef, controllerIp: controller.ipAddress, channel, scale: tracker.countsPerMm,
            address, position: x, width, capture: fields.capture.checked, objectType });
        adapter.save?.();
        link.latest = tracker.sample({ seconds: 0, distance: 0 });
        report('K14 컨트롤러의 응답을 기다립니다.'); flush(); render();
    }
    function releaseController(controller) {
        stopTest();
        if (!controller) return;
        adapter.send({ type: 'conveyorRelease' }, controller);
        for (const [key, link] of links) if (link.controller === controller) {
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
        if (node) node.textContent = sensor ? `장면 센서 IN${sensor.address}: ${sensor.level ? 'ON (감지)' : 'OFF (대기)'} · 촬영 ${sensor.shots}회 · 검출 ${sensor.detected.length}개` : '센서 설정 적용 후 레이저 감지 위치를 표시합니다.';
        for (const link of links.values()) {
            const row = document.createElement('p');
            row.textContent = `${link.controller.ipAddress} / Cnv${link.tracker.conveyor}: ${link.latest?.encoder ?? '0'} counts · A/B ${link.latest?.quadrature.join('/') ?? '0/0'} · IN${link.address}=${link.latest?.sensors[0]?.value ?? 0} · 물체 ${link.lastReply?.objects ?? '—'} · ${link.message}`;
            table.append(row);
        }
    }
    function objectBounds(object, frame) { const box = conveyorLocalBounds(object, frame); return box.isEmpty() ? null : plainBox(box); }
    return {
        get active() { return links.size > 0; },
        get monitoring() { return saved.size > 0; },
        get previewPending() { return preview.pending; },
        configure,
        sensorPreview: key => preview.summary(key),
        get testing() { return testRun !== null; },
        testMapping(mapping) {
            return testRun && mapping.gripObjectRef === testRun.mapping.gripObjectRef
                ? { ...mapping, conveyorAxis: testRun.axis, conveyorSpeed: testRun.speed } : mapping;
        },
        start: install,
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
                const entries = [], displacement = new Map();
                for (const object of candidates) {
                    if (!eligible(object)) continue;
                    const old = before.get(link)?.get(object), current = objectBounds(object, link.frame);
                    if (!old || !current) continue;
                    entries.push({ before: old, after: current });
                    displacement.set(object, new THREE.Vector3(current.min.x - old.min.x, current.min.y - old.min.y, current.min.z - old.min.z).transformDirection(link.frame.matrixWorld)
                        .multiplyScalar(Math.hypot(current.min.x - old.min.x, current.min.y - old.min.y, current.min.z - old.min.z)));
                }
                const inverse = link.frame.matrixWorld.clone().invert();
                const capture = fraction => adapter.vision().captureConveyorObjects([...displacement.keys()], point => vector(point).applyMatrix4(inverse).toArray(),
                    object => displacement.get(object).clone().multiplyScalar(fraction - 1).toArray(), link.objectType);
                const captures = link.manualCapture || link.captureRequest ? [{ fraction: 1, requestId: link.captureRequest || 0, objects: capture(1) }] : [];
                link.latest = link.tracker.sample({ seconds, distance, objects: entries, captures, captureAt: capture,
                    captureDelaySeconds: Number(adapter.vision().config.camera.processingMs || 0) / 1000 }); link.manualCapture = false;
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
            stopAll('저장한 컨베이어 설정을 불러왔습니다. 연동 시작을 눌러 연결하세요.'); preview.clear(); saved.clear(); testSettings.clear();
            if (Array.isArray(settings)) for (const item of settings.slice(0, 32)) if (item && typeof item.belt === 'string') saved.set(item.belt, {
                belt: item.belt, controllerIp: String(item.controllerIp || ''), channel: Number(item.channel), scale: Number(item.scale),
                ...(typeof item.sensorModelId === 'string' ? { sensorModelId: item.sensorModelId } : {}),
                ...(item.presetVersion === 2 ? { presetVersion: 2 } : {}),
                ...(item.moduleModelIds && typeof item.moduleModelIds === 'object' ? { moduleModelIds: { camera: String(item.moduleModelIds.camera || ''), stand: String(item.moduleModelIds.stand || ''), arm: String(item.moduleModelIds.arm || ''), objects: Array.isArray(item.moduleModelIds.objects) ? item.moduleModelIds.objects.filter(id=>typeof id==='string') : [] } } : {}),
                height: item.height == null ? null : Number(item.height), ...(item.preset === 'tracking-test' ? { preset: item.preset } : {}),
                address: Number(item.address), position: Number(item.position), width: Number(item.width), capture: Boolean(item.capture), objectType: Number(item.objectType || 0)
            });
        },
        reset() { stopAll('장면을 초기화해 컨베이어 연결을 해제했습니다.'); preview.clear(); saved.clear(); testSettings.clear(); },
        dispose() { stopAll('종료'); preview.clear(); clearInterval(timer); dialog?.remove(); }
    };
}
