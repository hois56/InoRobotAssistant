/**
 * InoRobot 3D Viewer — Online Ready Version (Static)
 * ▶ 온라인 배포(GitHub, Vercel 등)와 로컬 서버 모두에서 동작합니다.
 */

import * as THREE from 'https://esm.sh/three@0.156.1';
import { OrbitControls } from 'https://esm.sh/three@0.156.1/examples/jsm/controls/OrbitControls.js';

// ── State ───────────────────────────────────────────
const state = {
    scene: null,
    camera: null,
    renderer: null,
    controls: null,
    model: null,
    grid: null,
    isWireframe: false,
    occt: null,
    isOcctLoading: false
};

// ── DOM Elements ────────────────────────────────────
const el = {
    modelSelect:     document.getElementById('model-select'),
    fileInput:       document.getElementById('file-input'),
    loadingOverlay:  document.getElementById('loading-overlay'),
    loadingText:     document.getElementById('loading-text'),
    emptyState:      document.getElementById('empty-state'),
    statName:        document.getElementById('stat-name'),
    statTriangles:   document.getElementById('stat-triangles'),
    statStatus:      document.getElementById('stat-status'),
    statusDot:       document.getElementById('status-dot'),
    canvasContainer: document.getElementById('canvas-container'),
    importBtn:       document.getElementById('import-btn'),
    btnResetView:    document.getElementById('btn-reset-view'),
    btnToggleWireframe: document.getElementById('btn-toggle-wireframe'),
    btnToggleGrid:   document.getElementById('btn-toggle-grid')
};

// ── Initialization ─────────────────────────────────
async function init() {
    setupScene();
    setupLights();
    setupControls();
    setupEventListeners();
    animate();
    
    // 정적 models.json에서 목록 가져오기 (온라인 대응)
    await populateModelList();
    
    // OCCT 엔진 로드
    initEngine();
}

async function initEngine() {
    state.isOcctLoading = true;
    setStatus('Engine Init', '#94a3b8');
    
    try {
        if (typeof window.occtimportjs === 'undefined') {
            throw new Error('OCCT Loader script not found');
        }
        state.occt = await window.occtimportjs({
            locateFile: (name) => `https://cdn.jsdelivr.net/npm/occt-import-js@0.0.12/dist/${name}`
        });
        state.isOcctLoading = false;
        setStatus('Ready', '#22c55e');
        console.log('[InoRobot] Engine Ready (Online Mode)');
    } catch (e) {
        console.error('[Engine Init Error]', e);
        setStatus('Engine Error', '#ef4444');
    }
}

function setupScene() {
    state.scene = new THREE.Scene();
    state.scene.background = new THREE.Color(0x0b0e14);

    state.camera = new THREE.PerspectiveCamera(45, el.canvasContainer.clientWidth / el.canvasContainer.clientHeight, 0.1, 1e7);
    state.camera.position.set(1200, 900, 1200);

    state.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    state.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    state.renderer.setSize(el.canvasContainer.clientWidth, el.canvasContainer.clientHeight);
    state.renderer.shadowMap.enabled = true;
    state.renderer.toneMapping = THREE.ReinhardToneMapping;
    state.renderer.toneMappingExposure = 2.3;
    el.canvasContainer.appendChild(state.renderer.domElement);

    state.grid = new THREE.GridHelper(10000, 200, 0x333333, 0x1a1a1a);
    state.grid.position.y = -0.5;
    state.scene.add(state.grid);
}

function setupLights() {
    state.scene.add(new THREE.AmbientLight(0xffffff, 0.45));
    const dir = new THREE.DirectionalLight(0xffffff, 1.2);
    dir.position.set(1500, 2500, 1000);
    dir.castShadow = true;
    state.scene.add(dir);
    const fill = new THREE.DirectionalLight(0xaaccff, 0.5);
    fill.position.set(-1500, 400, -1000);
    state.scene.add(fill);
}

function setupControls() {
    state.controls = new OrbitControls(state.camera, state.renderer.domElement);
    state.controls.enableDamping = true;
    state.controls.dampingFactor = 0.08;
}

function setupEventListeners() {
    window.addEventListener('resize', onResize);
    
    el.modelSelect.addEventListener('change', async (e) => {
        const file = e.target.value;
        if (!file) return;
        const name = e.target.options[e.target.selectedIndex].text;
        await loadModelFromServer(file, name);
    });

    el.importBtn.addEventListener('click', () => el.fileInput.click());
    el.fileInput.addEventListener('change', (e) => {
        const f = e.target.files[0];
        if (f) readLocalFile(f);
    });

    el.btnResetView.addEventListener('click', fitCamera);
    el.btnToggleWireframe.addEventListener('click', toggleWireframe);
    el.btnToggleGrid.addEventListener('click', toggleGrid);
}

function animate() {
    requestAnimationFrame(animate);
    state.controls.update();
    state.renderer.render(state.scene, state.camera);
}

function onResize() {
    const w = el.canvasContainer.clientWidth;
    const h = el.canvasContainer.clientHeight;
    state.camera.aspect = w / h;
    state.camera.updateProjectionMatrix();
    state.renderer.setSize(w, h);
}

// ── Model Database (Static JSON) ───────────────────
async function populateModelList() {
    try {
        // 온라인 배포를 위해 정적 JSON 파일을 읽습니다.
        const res = await fetch('./models/models.json'); 
        if (!res.ok) throw new Error('Models list fallback needed');
        const list = await res.json();
        
        el.modelSelect.innerHTML = '<option value="" disabled selected>-- 로봇 모델을 선택하세요 --</option>';
        list.forEach(m => {
            const opt = document.createElement('option');
            opt.value = m.file;
            opt.textContent = m.name;
            el.modelSelect.appendChild(opt);
        });
        console.log('[InoRobot] Database Loaded:', list.length, 'models');
    } catch (e) {
        console.warn('[InoRobot] 정적 models.json 로드 실패, 하드코딩된 목록을 사용합니다.');
        // 만약 JSON 파일 로드 실패시 하드코딩된 폰백 사용
        const fallback = [{ name: "IR-R4-56S", file: "IR-R4-56S.stp" }];
        fallback.forEach(m => {
            const opt = document.createElement('option');
            opt.value = m.file;
            opt.textContent = m.name;
            el.modelSelect.appendChild(opt);
        });
    }
}

async function loadModelFromServer(file, name) {
    showLoading(true, `모델 데이터를 온라인에서 읽어오는 중: ${name}`);
    setStatus('Loading', '#f59e0b');

    try {
        // 상대 경로 적용 (online 배포 시 중요)
        const res = await fetch(`./models/${file}`);
        if (!res.ok) throw new Error('파일을 서버에서 찾을 수 없습니다.');
        const buffer = await res.arrayBuffer();
        await parseAndRender(buffer, name);
    } catch (err) {
        console.error('[Online Load Error]', err);
        alert(`로드 실패: ${err.message}`);
        setStatus('Error', '#ef4444');
        showLoading(false);
    }
}

function readLocalFile(file) {
    const reader = new FileReader();
    reader.onload = (e) => parseAndRender(e.target.result, file.name);
    reader.readAsArrayBuffer(file);
}

// ── 3D Parsing & Rendering ──────────────────────────
async function parseAndRender(buffer, name) {
    if (!state.occt) {
        showLoading(true, '엔진 초기화 중...');
        const wait = setInterval(() => {
            if (state.occt) {
                clearInterval(wait);
                parseAndRender(buffer, name);
            }
        }, 300);
        return;
    }

    showLoading(true, `3D 데이터 변환 중: ${name}`);
    setStatus('Processing', '#f59e0b');
    await new Promise(r => setTimeout(r, 50));

    // Cleanup
    if (state.model) {
        state.scene.remove(state.model);
        state.model.traverse(c => {
            if (c.isMesh) {
                c.geometry.dispose();
                if (Array.isArray(c.material)) c.material.forEach(m => m.dispose());
                else c.material.dispose();
            }
        });
    }

    try {
        // linearDeflection: 1.0 (세밀도를 낮춰 속도 중심 설정)
        const result = state.occt.ReadStepFile(new Uint8Array(buffer), {
            linearDeflection: 1.0,
            angularDeflection: 0.5
        });
        const group = new THREE.Group();
        let triCount = 0;

        result.meshes.forEach(mesh => {
            const geo = new THREE.BufferGeometry();
            geo.setAttribute('position', new THREE.Float32BufferAttribute(mesh.attributes.position.array, 3));
            if (mesh.attributes.normal) geo.setAttribute('normal', new THREE.Float32BufferAttribute(mesh.attributes.normal.array, 3));
            geo.setIndex(new THREE.Uint32BufferAttribute(mesh.index.array, 1));
            geo.computeVertexNormals();

            const mat = new THREE.MeshStandardMaterial({
                color: mesh.color ? new THREE.Color(mesh.color[0], mesh.color[1], mesh.color[2]) : 0xcccccc,
                metalness: 0.6,
                roughness: 0.35,
                wireframe: state.isWireframe
            });

            const m = new THREE.Mesh(geo, mat);
            m.castShadow = m.receiveShadow = true;
            group.add(m);
            triCount += mesh.index.array.length / 3;
        });

        state.model = group;
        state.scene.add(state.model);
        el.statName.textContent = name;
        el.statTriangles.textContent = Math.round(triCount).toLocaleString();
        el.emptyState.classList.add('hidden');
        setStatus('Ready', '#22c55e');
        fitCamera();
    } catch (err) {
        console.error('[Render Error]', err);
        alert(`변환 오류: ${err.message}`);
        setStatus('Error', '#ef4444');
    }
    showLoading(false);
}

function fitCamera() {
    if (!state.model) return;
    const box = new THREE.Box3().setFromObject(state.model);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3()).length();
    state.model.position.sub(center);
    const dist = size * 1.8;
    state.camera.position.set(dist, dist * 0.6, dist);
    state.camera.lookAt(0, 0, 0);
    state.controls.target.set(0, 0, 0);
    state.camera.updateProjectionMatrix();
}

function toggleWireframe() {
    state.isWireframe = !state.isWireframe;
    if (state.model) state.model.traverse(c => { if (c.isMesh) c.material.wireframe = state.isWireframe; });
    el.btnToggleWireframe.classList.toggle('active', state.isWireframe);
}

function toggleGrid() {
    state.grid.visible = !state.grid.visible;
    el.btnToggleGrid.classList.toggle('active', !state.grid.visible);
}

function showLoading(show, text = 'Loading...') {
    el.loadingOverlay.classList.toggle('hidden', !show);
    el.loadingText.textContent = text;
}

function setStatus(text, color) {
    el.statStatus.textContent = text;
    el.statusDot.style.color = color;
}

init();
