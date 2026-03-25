/**
 * InoRobot 3D Viewer — Hybrid Optimization (STEP + FBX)
 * ▶ FBX 파일이 감지되면 초고속(1초 이내) 로딩을 수행합니다.
 */

import * as THREE from 'https://esm.sh/three@0.156.1';
import { OrbitControls } from 'https://esm.sh/three@0.156.1/examples/jsm/controls/OrbitControls.js';
import { FBXLoader } from 'https://esm.sh/three@0.156.1/examples/jsm/loaders/FBXLoader.js';

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
    
    // 병렬 초기화
    await Promise.all([
        initEngine(),
        populateModelList()
    ]);
}

async function initEngine() {
    state.isOcctLoading = true;
    setStatus('Engine Ready', '#94a3b8');
    
    try {
        if (typeof window.occtimportjs === 'undefined') {
            console.warn('OCCT fallback needed for STEP files');
            return;
        }
        state.occt = await window.occtimportjs({
            locateFile: (name) => `https://cdn.jsdelivr.net/npm/occt-import-js@0.0.12/dist/${name}`
        });
        state.isOcctLoading = false;
        setStatus('Ready', '#22c55e');
    } catch (e) {
        console.error('[Engine Init Error]', e);
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
    state.grid.position.y = -0.1;
    state.scene.add(state.grid);
}

function setupLights() {
    state.scene.add(new THREE.AmbientLight(0xffffff, 0.45));
    const dir = new THREE.DirectionalLight(0xffffff, 1.25);
    dir.position.set(1500, 2500, 1000);
    dir.castShadow = true;
    state.scene.add(dir);
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

// ── Model Management ───────────────────────────────
async function populateModelList() {
    try {
        // 캐시 방지를 위해 타임스탬프 파라미터를 추가하여 항상 최신 목록을 가져옵니다.
        const res = await fetch(`./models/models.json?v=${Date.now()}`);
        const list = await res.json();
        el.modelSelect.innerHTML = '<option value="" disabled selected>-- 로봇 모델을 선택하세요 --</option>';
        list.forEach(m => {
            const opt = document.createElement('option');
            opt.value = m.file;
            opt.textContent = m.name;
            el.modelSelect.appendChild(opt);
        });
        console.log('[InoRobot] Final Database Loaded:', list.length, 'models');
    } catch (e) {
        console.error('[Load List Error]', e);
    }
}

async function loadModelFromServer(file, name) {
    const ext = file.split('.').pop().toLowerCase();
    
    // 로딩 방식을 명확히 표시
    const modeText = ext === 'fbx' ? 'FBX 초고속 모드' : 'STEP 변환 모드';
    showLoading(true, `${modeText}: ${name} 파일을 읽는 중...`);
    setStatus('Loading', '#f59e0b');


    try {
        const url = `./models/${file}`;
        
        // FBX 고속 로딩 로직
        if (ext === 'fbx') {
            const loader = new FBXLoader();
            loader.load(url, (fbx) => {
                renderFBXModel(fbx, name);
            }, (xhr) => {
                const percent = Math.round((xhr.loaded / xhr.total) * 100);
                showLoading(true, `다운로드 중: ${percent}%`);
            }, (err) => {
                throw err;
            });
            return;
        }

        // 기존 STEP 로딩 로직
        const res = await fetch(url);
        if (!res.ok) throw new Error('파일을 서버에서 찾을 수 없습니다.');
        const buffer = await res.arrayBuffer();
        await parseAndRenderSTEP(buffer, name);

    } catch (err) {
        console.error('[Load Error]', err);
        alert(`로드 실패: ${err.message}`);
        setStatus('Error', '#ef4444');
        showLoading(false);
    }
}

function readLocalFile(file) {
    const ext = file.name.split('.').pop().toLowerCase();
    if (ext === 'fbx') {
        const reader = new FileReader();
        reader.onload = (e) => {
            const loader = new FBXLoader();
            const fbx = loader.parse(e.target.result);
            renderFBXModel(fbx, file.name);
        };
        reader.readAsArrayBuffer(file);
    } else {
        const reader = new FileReader();
        reader.onload = (e) => parseAndRenderSTEP(e.target.result, file.name);
        reader.readAsArrayBuffer(file);
    }
}

// ── Rendering Functions ────────────────────────────

/** 1. FBX 고속 렌더러 (즉시 출력) */
function renderFBXModel(fbx, name) {
    showLoading(true, 'FBX 처리 중...');
    cleanupScene();

    // FBX 방향성 수정 (Fusion FBX는 종종 Y-up이므로 필요 시 조정)
    fbx.rotateX(-Math.PI / 2); // STEP과 동일한 방향 규칙 적용

    let tris = 0;
    fbx.traverse(c => {
        if (c.isMesh) {
            c.castShadow = c.receiveShadow = true;
            if (c.geometry.index) tris += c.geometry.index.count / 3;
            else tris += c.geometry.attributes.position.count / 3;
            
            // 와이어프레임 상태 적용
            if (state.isWireframe) c.material.wireframe = true;
        }
    });

    state.model = fbx;
    state.scene.add(state.model);
    updateUIStatus(name, tris);
    showLoading(false);
    fitCamera();
}

/** 2. STEP 원본 렌더러 (OCCT 엔진 필요) */
async function parseAndRenderSTEP(buffer, name) {
    if (!state.occt) {
        showLoading(true, '엔진 초기화 대기 중...');
        const wait = setInterval(() => {
            if (state.occt) { clearInterval(wait); parseAndRenderSTEP(buffer, name); }
        }, 300);
        return;
    }

    showLoading(true, `3D 데이터 변환 중 (STEP): ${name}`);
    setStatus('Processing', '#f59e0b');
    await new Promise(r => setTimeout(r, 50));

    cleanupScene();

    try {
        const result = state.occt.ReadStepFile(new Uint8Array(buffer));
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
                metalness: 0.6, roughness: 0.35, wireframe: state.isWireframe
            });

            const m = new THREE.Mesh(geo, mat);
            m.castShadow = m.receiveShadow = true;
            group.add(m);
            triCount += mesh.index.array.length / 3;
        });

        group.rotateX(-Math.PI / 2); // 바르게 세우기
        state.model = group;
        state.scene.add(state.model);
        updateUIStatus(name, triCount);
        fitCamera();
    } catch (err) {
        console.error('[STEP Error]', err);
        alert(`변환 오류: ${err.message}`);
        setStatus('Error', '#ef4444');
    }
    showLoading(false);
}

// ── Helpers ──────────────────────────────────────────
function cleanupScene() {
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
}

function updateUIStatus(name, tris) {
    el.statName.textContent = name;
    el.statTriangles.textContent = Math.round(tris).toLocaleString();
    el.emptyState.classList.add('hidden');
    setStatus('Ready', '#22c55e');
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
