import { syncSetting } from './settings-controls.mjs';
import * as THREE from 'three';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { generateCurveTrajectory, curveLength } from './curve-trajectory-core.mjs';
import { orderConnectedCurves } from './curve-trajectory-selection.mjs?v=20261117-selection-1';

export function createCurveTrajectoryApp(api) {
    let panel, selected = [], hovered = [], group, preview, cursorCanvas, busy = false;
    const cache = new Map(), canvases = new WeakSet(), documents = new WeakSet();
    const isPicking = () => Boolean(panel?.getClientRects().length && !busy && !api.isBusy());
    const sameCurve = (a, b) => a?.model === b?.model && a?.index === b?.index;
    const text = key => api.text(key);
    const field = id => panel.querySelector(`#trajectory-${id}`);
    const status = (message, error = false) => {
        field('status').textContent = text(message);
        field('status').classList.toggle('error', error);
    };
    const clearVisual = () => {
        if (group) {
            group.traverse(object => { object.geometry?.dispose(); object.material?.map?.dispose(); object.material?.dispose(); });
            group.removeFromParent(); group = null;
            api.requestRender();
        }
    };
    function draw(points = null) {
        clearVisual();
        group = new THREE.Group();
        group.userData.curveTrajectoryPreview = true;
        const visible = [...selected, ...hovered.filter(curve => !selected.some(entry => sameCurve(entry, curve)))];
        for (const curve of visible) {
            const positions = curve.points.map(p => new THREE.Vector3(...p));
            if (curve.closed && positions[0].distanceToSquared(positions.at(-1)) > 1e-12) positions.push(positions[0].clone());
            const order = selected.findIndex(entry => sameCurve(entry, curve));
            // WebGL LineBasicMaterial is one pixel wide on most GPUs. Use
            // screen-space ribbons with a dark border so selection stays clear.
            for (const [width, color, renderOrder] of [[7, 0x17212c, 1001], [3, order >= 0 ? 0xffa63d : 0xffff66, 1002]]) {
                const geometry = new LineGeometry(); geometry.setPositions(positions.flatMap(point => point.toArray()));
                const line = new Line2(geometry, new LineMaterial({ color, linewidth: width, depthTest: false, depthWrite: false }));
                const viewport = new THREE.Vector4();
                line.onBeforeRender = renderer => {
                    renderer.getViewport(viewport);
                    line.material.resolution.set(viewport.z, viewport.w);
                };
                line.renderOrder = renderOrder;
                line.userData.trajectoryHighlight = order >= 0 ? 'selected' : 'hover';
                group.add(line);
            }
            if (order >= 0) {
                const canvas = document.createElement('canvas'); canvas.width = 64; canvas.height = 64;
                const context = canvas.getContext('2d');
                context.fillStyle = '#c45d0b'; context.beginPath(); context.arc(32,32,27,0,Math.PI*2); context.fill();
                context.fillStyle = '#fff'; context.font = 'bold 32px sans-serif'; context.textAlign = 'center'; context.textBaseline = 'middle';
                context.fillText(String(order + 1),32,33);
                const marker = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), depthTest: false, sizeAttenuation: false }));
                marker.position.copy(positions[Math.floor((positions.length - 1) / 2)]).lerp(positions[Math.ceil((positions.length - 1) / 2)], 0.5);
                marker.onBeforeRender = (renderer, scene, camera) => {
                    const height = renderer.getViewport(new THREE.Vector4()).w;
                    const scale = 40 / (height * camera.projectionMatrix.elements[5]);
                    marker.scale.set(scale, scale, 1);
                    marker.updateMatrixWorld(true);
                };
                marker.renderOrder = 1003;
                group.add(marker);
            }
        }
        if (points) {
            const geometry = new THREE.BufferGeometry().setFromPoints(points.map(p => new THREE.Vector3(...p)));
            const line = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: 0x32e6bc, depthTest: false }));
            line.renderOrder = 1000;
            group.add(line);
            group.add(new THREE.Points(geometry.clone(), new THREE.PointsMaterial({ color: 0xffffff, size: 5, sizeAttenuation: false, depthTest: false })));
        }
        api.scene().add(group); api.requestRender();
    }
    function invalidate() {
        preview = null; field('apply').disabled = true; field('preview').classList.add('hidden'); draw();
        status('모서리·곡선 또는 면을 클릭하세요. 면을 선택하면 외곽선이 선택됩니다. 다시 클릭하면 해제됩니다.');
    }
    function renderSelection() {
        field('curves').replaceChildren();
        if (!selected.length) field('curves').textContent = text('3D 화면에서 선택한 곡선이 여기에 표시됩니다.');
        selected.forEach((curve, index) => {
            const row = document.createElement('div'), remove = document.createElement('button'), caption = document.createElement('span');
            row.dataset.selectedCurve = String(index + 1);
            caption.textContent = `${index + 1}. ${api.modelLabel(curve.model)} · ${curveLength(curve.points).toFixed(1)} mm`;
            remove.type = 'button'; remove.textContent = '×'; remove.setAttribute('aria-label', `${index + 1}. ${text('선택 해제')}`);
            remove.addEventListener('click', () => { selected.splice(index, 1); selected = orderConnectedCurves(selected); renderSelection(); invalidate(); });
            row.append(caption, remove); field('curves').append(row);
        });
    }
    function modelCurves(model) {
        model.updateWorldMatrix(true, true);
        const transforms = [];
        model.traverse(object => { transforms.push(object.uuid, object.visible, ...object.matrixWorld.elements, object.geometry?.uuid, object.geometry?.attributes?.position?.version); });
        const stamp = transforms.join(',');
        if (cache.get(model)?.stamp !== stamp) {
            cache.set(model, { stamp, curves: api.curves(model).map((curve, index) => ({ ...curve, model, index })), faces: new Map() });
        }
        return cache.get(model).curves;
    }
    function modelFaceCurves(model, hit) {
        const curves = modelCurves(model), faces = cache.get(model).faces;
        const key = api.faceKey(hit);
        if (!faces.has(key)) faces.set(key, api.faceCurves(model, hit, curves).map(curve => ({ ...curve, model })));
        return faces.get(key);
    }
    function pick(event, canvas, camera) {
        const rect = canvas.getBoundingClientRect();
        if (!rect.width || !rect.height) return [];
        camera.updateMatrixWorld(true);
        const candidates = [], raycaster = new THREE.Raycaster();
        const pointer = new THREE.Vector2((event.clientX - rect.left) / rect.width * 2 - 1,
            1 - (event.clientY - rect.top) / rect.height * 2);
        raycaster.setFromCamera(pointer, camera);
        for (const model of api.models()) {
            const curves = new Map(modelCurves(model).map(curve => [curve.index, curve]));
            for (const face of cache.get(model).faces.values()) for (const curve of face) curves.set(curve.index, curve);
            for (const curve of curves.values()) {
                const points = curve.closed ? [...curve.points, curve.points[0]] : curve.points;
                let best = null;
                for (let i = 1; i < points.length; i++) {
                    const start = new THREE.Vector3(...points[i - 1]), end = new THREE.Vector3(...points[i]);
                    const a = start.clone().project(camera), b = end.clone().project(camera);
                    if ([a, b].some(p => p.z < -1 || p.z > 1)) continue;
                    const x = rect.left + (a.x + 1) * rect.width / 2, y = rect.top + (1 - a.y) * rect.height / 2;
                    const dx = (b.x - a.x) * rect.width / 2, dy = (a.y - b.y) * rect.height / 2;
                    const length2 = dx * dx + dy * dy;
                    const t = length2 ? Math.max(0, Math.min(1, ((event.clientX - x) * dx + (event.clientY - y) * dy) / length2)) : 0;
                    const distance = Math.hypot(event.clientX - x - t * dx, event.clientY - y - t * dy);
                    if (distance > 10 || (best && distance >= best.distance)) continue;
                    const worldPoint = new THREE.Vector3();
                    raycaster.ray.distanceSqToSegment(start, end, new THREE.Vector3(), worldPoint);
                    best = { curve, distance, worldPoint };
                }
                if (best) candidates.push(best);
            }
        }
        candidates.sort((a, b) => a.distance - b.distance);
        const occluders = api.occluders();
        for (const candidate of candidates) {
            const projected = candidate.worldPoint.clone().project(camera);
            raycaster.setFromCamera(new THREE.Vector2(projected.x, projected.y), camera);
            const distance = raycaster.ray.origin.distanceTo(candidate.worldPoint);
            const blocked = raycaster.intersectObjects(occluders, true).some(hit => {
                if (!hit.object.isMesh || hit.distance >= distance - Math.max(0.05, distance * 1e-5)) return false;
                for (let object = hit.object; object; object = object.parent) if (!object.visible) return false;
                return true;
            });
            if (!blocked) return [candidate.curve];
        }
        // Edges take priority within the click tolerance. Otherwise select the
        // boundary of the nearest visible face, respecting foreground models.
        raycaster.setFromCamera(pointer, camera);
        const hit = raycaster.intersectObjects(occluders, true).find(hit => {
            if (!hit.object.isMesh || !Number.isInteger(hit.faceIndex)) return false;
            for (let object = hit.object; object; object = object.parent) if (!object.visible) return false;
            return true;
        });
        const model = hit && api.models().find(model => {
            for (let object = hit.object; object; object = object.parent) if (object === model) return true;
            return false;
        });
        return model ? modelFaceCurves(model, hit) : [];
    }
    function setHover(curves, canvas) {
        if (cursorCanvas && cursorCanvas !== canvas) cursorCanvas.style.cursor = '';
        cursorCanvas = canvas;
        canvas.style.cursor = curves.length ? 'crosshair' : '';
        if (curves.length === hovered.length && curves.every((curve, index) => sameCurve(curve, hovered[index]))) return;
        hovered = curves; draw(preview?.points);
    }
    function bindEscape(ownerDocument) {
        if (documents.has(ownerDocument)) return;
        documents.add(ownerDocument);
        ownerDocument.addEventListener('keydown', e => {
            if (e.key === 'Escape' && panel?.getClientRects().length) { e.preventDefault(); close(); }
        });
    }
    function bindCanvas(canvas, getCamera) {
        if (canvases.has(canvas)) return;
        canvases.add(canvas);
        bindEscape(canvas.ownerDocument);
        let down = null;
        canvas.addEventListener('pointerdown', e => {
            // A fixed view canvas can be moved into a separate window after binding.
            bindEscape(canvas.ownerDocument);
            if (e.button !== 0 || !isPicking()) return;
            down = { x: e.clientX, y: e.clientY, moved: false, curves: pick(e, canvas, getCamera()) };
        }, true);
        canvas.addEventListener('pointermove', e => {
            if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 4) down.moved = true;
            if (!isPicking()) { canvas.style.cursor = ''; return; }
            if (e.buttons) return;
            setHover(pick(e, canvas, getCamera()), canvas);
        }, true);
        canvas.addEventListener('pointerleave', () => { if (isPicking()) setHover([], canvas); });
        canvas.addEventListener('pointercancel', () => { down = null; });
        canvas.addEventListener('click', e => {
            const gesture = down; down = null;
            if (!isPicking() || e.button !== 0) return;
            // Capture before model/CAD/snap selection, but leave pointer drag and wheel events to OrbitControls.
            e.preventDefault(); e.stopImmediatePropagation();
            if (!gesture || gesture.moved) return;
            const curves = gesture.curves;
            if (!curves.length) return;
            if (curves.every(curve => selected.some(entry => sameCurve(entry, curve)))) {
                selected = orderConnectedCurves(selected.filter(entry => !curves.some(curve => sameCurve(entry, curve))));
            } else {
                selected.push(...curves.filter(curve => !selected.some(entry => sameCurve(entry, curve))));
                if (curves.length > 1) selected = orderConnectedCurves(selected);
            }
            renderSelection(); invalidate();
        }, true);
    }
    function settings() {
        const number = id => {
            const input = field(id);
            if (!input.checkValidity() || input.value.trim() === '') throw new Error('궤적 설정값을 확인하세요.');
            return Number(input.value);
        };
        return { step: number('step'), tolerance: number('tolerance'), mode: field('mode').value,
            joinTolerance: number('join'), startOffset: number('start'), endOffset: number('end'),
            reverse: field('reverse').checked, offset: ['x', 'y', 'z'].map(number),
            rotation: ['rx', 'ry', 'rz'].map(number), firstIndex: number('first') };
    }
    function generate() {
        preview = null; field('apply').disabled = true; field('preview').classList.add('hidden');
        try {
            if (api.isBusy()) throw new Error('로봇 정지 후 위치를 수정하세요.');
            const models = api.models();
            selected = selected.map(curve => {
                if (!models.includes(curve.model)) throw new Error('대상 모델을 다시 선택하세요.');
                const fresh = curve.face
                    ? modelFaceCurves(curve.model, curve.face).find(entry => entry.index === curve.index)
                    : modelCurves(curve.model)[curve.index];
                if (!fresh) throw new Error('대상 모델을 다시 선택하세요.');
                return fresh;
            });
            const options = settings();
            const robot = api.robot();
            if (!robot) throw new Error('활성 로봇을 선택하세요.');
            const result = generateCurveTrajectory(selected, options);
            const points = api.offsetPoints(robot, result.points, options.offset);
            preview = { robot, points, options };
            const { records } = api.positionData(preview);
            field('values').replaceChildren();
            for (const record of records.slice(0, 10)) {
                const row = document.createElement('tr');
                for (const value of [`P[${record.index}]`, ...record.values.map(value => value.toFixed(3))]) {
                    const cell = document.createElement('td'); cell.textContent = value; row.append(cell);
                }
                field('values').append(row);
            }
            field('context').textContent = api.context();
            field('preview').classList.remove('hidden');
            draw(points);
            field('apply').disabled = false;
            field('status').textContent = `P[${records[0].index}] ~ P[${records.at(-1).index}] · ${text('{count}개 포인트').replace('{count}', points.length)} · ${result.length.toFixed(1)} mm`;
            field('status').classList.remove('error');
            field('preview').scrollIntoView({ block: 'nearest' });
            return preview;
        } catch (error) { preview = null; draw(); status(error.message, true); return null; }
    }
    async function apply() {
        if (busy || api.isBusy()) return;
        const route = generate();
        if (!route) return;
        busy = true;
        panel.querySelectorAll('input,select,button').forEach(control => { control.disabled = control !== field('close'); });
        try {
            await api.apply(route);
            close();
        } catch (error) { status(error.message, true); }
        finally {
            busy = false;
            panel.querySelectorAll('input,select,button').forEach(control => { control.disabled = false; });
            field('apply').disabled = !preview;
        }
    }
    function close() {
        preview = null; hovered = []; clearVisual(); cache.clear(); panel?.classList.add('hidden');
        if (cursorCanvas) cursorCanvas.style.cursor = '';
        cursorCanvas = null;
        api.onClose?.();
    }
    function refreshLabels() {
        panel.querySelectorAll('[data-trajectory-text]').forEach(node => { node.textContent = text(node.dataset.trajectoryText); });
        field('close').setAttribute('aria-label', text('닫기'));
    }
    function refresh() {
        if (!panel || panel.classList.contains('hidden') || busy) return;
        const context = api.context();
        const changed = field('context').textContent !== context;
        if (changed) field('context').textContent = context;
        syncSetting(field('first'), api.nextIndex());
        const models = api.models();
        const retained = selected.filter(curve => models.includes(curve.model));
        if (retained.length !== selected.length) {
            selected = retained; hovered = []; cache.clear(); renderSelection(); invalidate();
        } else {
            selected.forEach((curve,i) => {
                const caption = field('curves').children[i]?.querySelector('span');
                const label = `${i + 1}. ${api.modelLabel(curve.model)} · ${curveLength(curve.points).toFixed(1)} mm`;
                if (caption && caption.textContent !== label) caption.textContent = label;
            });
            if (changed && preview) invalidate();
        }
    }
    function open() {
        if (busy || api.isBusy()) return;
        panel = api.panel();
        if (!panel.dataset.initialized) init();
        panel.classList.remove('hidden');
        bindEscape(panel.ownerDocument);
        syncSetting(field('first'), api.nextIndex(), true);
        field('context').textContent = api.context();
        refreshLabels();
        selected = []; hovered = []; cache.clear(); renderSelection(); invalidate();
        panel.scrollTop = 0;
        api.bringToFront();
    }
    function init() {
        panel.dataset.initialized = 'true';
        const label = value => `<span data-trajectory-text="${value}">${text(value)}</span>`;
        const number = (id, name, value, min, max, step = 'any') => `<label>${label(name)}<input id="trajectory-${id}" type="number" value="${value}" min="${min}" max="${max}" step="${step}"></label>`;
        panel.innerHTML = `<div class="auto-path-heading"><strong>${label('자동 궤적 생성')}</strong><button id="trajectory-close" type="button" aria-label="${text('닫기')}">×</button></div>
            <p>${label('곡선을 따라 X/Y/Z/A/B/C 위치값을 만듭니다. 생성한 위치는 P.pts에서 확인하고 내보낼 수 있습니다.')}</p>
            <p id="trajectory-context"></p>
            <h3>${label('1. 곡선 선택')}</h3>
            <p>${label('모서리·곡선 또는 면을 클릭하세요. 면을 선택하면 외곽선이 선택됩니다. 다시 클릭하면 해제됩니다.')}</p>
            <div class="trajectory-selection-actions"><button id="trajectory-clear" type="button">${label('선택 해제')}</button></div>
            <div id="trajectory-curves" class="trajectory-curves"></div>
            <h3>${label('2. 위치 생성 설정')}</h3>
            <div class="trajectory-settings">${number('step', '포인트 간격 (mm)', 10, 0.01, 1000)}${number('first', '시작 포인트 번호', 0, 0, 9999, 1)}</div>
            <p>${label('10 mm로 설정하면 곡선을 따라 10 mm 이하 간격으로 위치를 만듭니다. 모서리의 꺾임점도 포함됩니다.')}</p>
            <details data-panel-drag-ignore><summary>${label('고급 설정')}</summary><div class="trajectory-settings"><label>${label('포인트 생성 방식')}<select id="trajectory-mode"><option value="uniform" data-trajectory-text="간격 기준">${text('간격 기준')}</option><option value="chord" data-trajectory-text="현 높이 오차 기준">${text('현 높이 오차 기준')}</option></select></label>
            ${number('tolerance', '허용 오차 (mm)', 0.1, 0.001, 100)}${number('join', '연결 허용 거리 (mm)', 0.1, 0, 10)}
            ${number('start', '시작 잘라내기 (mm)', 0, 0, 100000)}${number('end', '끝 잘라내기 (mm)', 0, 0, 100000)}
            ${['x', 'y', 'z'].map(id => number(id, `BASE ${id.toUpperCase()} (mm)`, 0, -100000, 100000)).join('')}
            ${['rx', 'ry', 'rz'].map(id => number(id, `TCP Δ${id.toUpperCase()} (°)`, 0, -180, 180)).join('')}
            <label><input id="trajectory-reverse" type="checkbox">${label('방향 반전')}</label></div></details>
            <p>${label('좌표는 선택한 Wobj 기준이며, 자세는 현재 TCP 자세를 사용합니다.')}</p>
            <section id="trajectory-preview" class="hidden"><h3>${label('3. 위치값 확인')}</h3>
                <div class="trajectory-values" data-panel-drag-ignore><table><thead><tr>${['P', 'X', 'Y', 'Z', 'A', 'B', 'C'].map(value => `<th>${value}</th>`).join('')}</tr></thead><tbody id="trajectory-values"></tbody></table></div>
                <p>${label('앞 10개 위치를 표시합니다. 전체 위치는 P.pts에 추가한 뒤 확인할 수 있습니다.')}</p></section>
            <p>${label('위치 데이터만 저장합니다. 이동은 P.pts의 위치로 이동에서 별도로 실행합니다.')}</p>
            <p id="trajectory-status" class="auto-path-status" role="status" aria-live="polite"></p>
            <div class="auto-path-actions"><button id="trajectory-generate" type="button" class="primary">${label('위치 미리보기')}</button><button id="trajectory-apply" type="button" disabled>${label('P.pts에 추가')}</button></div>`;
        field('close').addEventListener('click', close);
        field('clear').addEventListener('click', () => { selected = []; renderSelection(); invalidate(); });
        panel.addEventListener('input', invalidate);
        field('generate').addEventListener('click', generate);
        field('apply').addEventListener('click', () => void apply());
        document.addEventListener('inorobot:languagechange', refreshLabels);
        bindCanvas(api.canvas(), api.camera);
    }
    return { open, close, refresh, generate, apply, bindCanvas, isPicking, get busy() { return busy; } };
}
