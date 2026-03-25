/**
 * Inovance Robot 3D Viewer — Minimalist Version
 * ▶ 깔끔한 UI와 고속 로딩 기능을 제공합니다.
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
    loadingOverlay:  document.getElementById('loading-overlay'),
    loadingText:     document.getElementById('loading-text'),
    emptyState:      document.getElementById('empty-state'),
    statName:        document.getElementById('stat-name'),
    statStatus:      document.getElementById('stat-status'),
    statusDot:       document.getElementById('status-dot'),
    canvasContainer: document.getElementById('canvas-container'),
    btnResetView:    document.getElementById('btn-reset-view'),
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
    setStatus('Engine Init', '#94a3b8');
    
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
    el.btnResetView.addEventListener('click', fitCamera);
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
        const res = await fetch(`./models/models.json?v=${Date.now()}`);
        const list = await res.json();
        el.modelSelect.innerHTML = '<option value="" disabled selected>-- 로봇 모델을 선택하세요 --</option>';
        list.forEach(m => {
            const opt = document.createElement('option');
            opt.value = m.file;
            opt.textContent = m.name;
            el.modelSelect.appendChild(opt);
        });
    } catch (e) {
        console.error('[Load List Error]', e);
    }
}

async function loadModelFromServer(file, name) {
    const ext = file.split('.').pop().toLowerCase();
    const modeText = ext === 'fbx' ? 'FBX' : 'STEP';
    showLoading(true, `${modeText} 데이터 로드 중: ${name}`);
    setStatus('Loading', '#f59e0b');

    try {
        const url = `./models/${file}`;
        
        if (ext === 'fbx') {
            const loader = new FBXLoader();
            loader.load(url, (fbx) => {
                renderFBXModel(fbx, name);
            }, (xhr) => {
                if (xhr.total > 0) {
                    const percent = Math.round((xhr.loaded / xhr.total) * 100);
                    showLoading(true, `다운로드 중: ${percent}%`);
                }
            }, (err) => { throw err; });
            return;
        }

        const res = await fetch(url);
        if (!res.ok) throw new Error('File not found');
        const buffer = await res.arrayBuffer();
        await parseAndRenderSTEP(buffer, name);

    } catch (err) {
        console.error('[Load Error]', err);
        alert(`로드 실패: ${err.message}`);
        setStatus('Error', '#ef4444');
        showLoading(false);
    }
}

// ── Rendering Functions ────────────────────────────

function renderFBXModel(fbx, name) {
    cleanupScene();
    fbx.rotateX(-Math.PI / 2); // 바닥 안착 방향

    fbx.traverse(c => {
        if (c.isMesh) {
            c.castShadow = c.receiveShadow = true;
            if (state.isWireframe) c.material.wireframe = true;
        }
    });

    state.model = fbx;
    state.scene.add(state.model);
    updateUIStatus(name);
    showLoading(false);
    fitCamera();
}

async function parseAndRenderSTEP(buffer, name) {
    if (!state.occt) return;
    cleanupScene();

    try {
        const result = state.occt.ReadStepFile(new Uint8Array(buffer));
        const group = new THREE.Group();

        result.meshes.forEach(mesh => {
            const geo = new THREE.BufferGeometry();
            geo.setAttribute('position', new THREE.Float32BufferAttribute(mesh.attributes.position.array, 3));
            if (mesh.attributes.normal) geo.setAttribute('normal', new THREE.Float32BufferAttribute(mesh.attributes.normal.array, 3));
            geo.setIndex(new THREE.Uint32BufferAttribute(mesh.index.array, 1));
            geo.computeVertexNormals();

            const mat = new THREE.MeshStandardMaterial({
                color: mesh.color ? new THREE.Color(mesh.color[0], mesh.color[1], mesh.color[2]) : 0xcccccc,
                metalness: 0.6, roughness: 0.35
            });

            const m = new THREE.Mesh(geo, mat);
            m.castShadow = m.receiveShadow = true;
            group.add(m);
        });

        group.rotateX(-Math.PI / 2); 
        state.model = group;
        state.scene.add(state.model);
        updateUIStatus(name);
        fitCamera();
    } catch (err) {
        console.error('[STEP Error]', err);
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

function updateUIStatus(name) {
    el.statName.textContent = name;
    el.emptyState.classList.add('hidden');
    setStatus('Ready', '#22c55e');
}

function fitCamera() {
    if (!state.model) return;
    const box = new THREE.Box3().setFromObject(state.model);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());

    state.model.position.x -= center.x;
    state.model.position.z -= center.z;
    state.model.position.y -= box.min.y;

    const sphereSize = size.length();
    const dist = sphereSize * 1.5;
    state.camera.position.set(dist * 0.8, dist * 0.5, dist * 0.8);
    state.camera.lookAt(0, size.y / 2, 0);
    state.controls.target.set(0, size.y / 2, 0);
    state.camera.updateProjectionMatrix();
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
