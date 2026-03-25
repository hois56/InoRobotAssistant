/**
 * Inovance Robot 3D Viewer — Simulation Edition
 * ▶ JOG 제어 및 고속 FBX 로딩 지원
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
    isOcctLoading: false,
    
    // 시뮬레이션 관련
    joints: [],       // 로봇 관절 노드 저장
    jointAngles: [0, 0, 0, 0, 0, 0] // 현재 각도 저장
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
    btnToggleGrid:   document.getElementById('btn-toggle-grid'),
    
    // JOG 패널
    jogPanel:        document.getElementById('jog-panel'),
    btnHome:         document.getElementById('btn-home-pos')
};

// ── Initialization ─────────────────────────────────
async function init() {
    setupScene();
    setupLights();
    setupControls();
    setupEventListeners();
    animate();
    
    await Promise.all([
        initEngine(),
        populateModelList()
    ]);
}

async function initEngine() {
    state.isOcctLoading = true;
    setStatus('Engine Init', '#94a3b8');
    
    try {
        if (typeof window.occtimportjs === 'undefined') return;
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
    state.controls.enableDamping = false; 
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
    
    // JOG 버튼 이벤트
    document.querySelectorAll('.jog-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const axis = parseInt(btn.dataset.axis);
            const dir = parseInt(btn.dataset.dir);
            jogJoint(axis, dir);
        });
    });
    
    el.btnHome.addEventListener('click', resetJoints);
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
    } catch (e) { console.error(e); }
}

async function loadModelFromServer(file, name) {
    const ext = file.split('.').pop().toLowerCase();
    showLoading(true, `Loading ${name}...`);
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
                    showLoading(true, `Downloading: ${percent}%`);
                }
            }, (err) => { throw err; });
            return;
        }

        const res = await fetch(url);
        const buffer = await res.arrayBuffer();
        await parseAndRenderSTEP(buffer, name);

    } catch (err) {
        setStatus('Error', '#ef4444');
        showLoading(false);
    }
}

// ── Rendering & Simulation ────────────────────────────

function renderFBXModel(fbx, name) {
    cleanupScene();
    fbx.rotateX(-Math.PI / 2); 

    state.joints = [];
    state.jointAngles = [0, 0, 0, 0, 0, 0];

    /** 
     * [축 탐색 로직]
     * FBX 내부에서 Axis, Link, Joint 등의 키워드를 포함한 노드를 찾습니다.
     * IR-R4 모델의 내부 구조에 따라 최적화가 필요할 수 있습니다.
     */
    fbx.traverse(c => {
        if (c.isMesh) {
            c.castShadow = c.receiveShadow = true;
        }
        // 계층 구조에서 관절 후보군을 수집 (이름 기반)
        if (c.name.toLowerCase().includes('axis') || c.name.toLowerCase().includes('link') || c.name.toLowerCase().includes('joint')) {
            // 중복 방지 및 정렬을 위해 리스트업
            if (!state.joints.find(j => j.name === c.name)) {
                state.joints.push(c);
            }
        }
    });

    // 축 이름을 기준으로 정렬 (J1, J2... 순서가 보장되도록)
    state.joints.sort((a, b) => a.name.localeCompare(b.name, undefined, {numeric: true}));

    state.model = fbx;
    state.scene.add(state.model);
    updateUIStatus(name);
    
    // IR-R4 모델일 경우에만 JOG 패널 표시
    el.jogPanel.classList.toggle('hidden', !name.includes('IR-R4'));
    
    showLoading(false);
    fitCamera();
}

async function parseAndRenderSTEP(buffer, name) {
    if (!state.occt) return;
    cleanupScene();
    el.jogPanel.classList.add('hidden'); // STEP 파일은 시뮬레이션 지원 안 함

    try {
        const result = state.occt.ReadStepFile(new Uint8Array(buffer));
        const group = new THREE.Group();
        result.meshes.forEach(mesh => {
            const geo = new THREE.BufferGeometry();
            geo.setAttribute('position', new THREE.Float32BufferAttribute(mesh.attributes.position.array, 3));
            geo.setIndex(new THREE.Uint32BufferAttribute(mesh.index.array, 1));
            geo.computeVertexNormals();
            const mat = new THREE.MeshStandardMaterial({
                color: mesh.color ? new THREE.Color(mesh.color[0], mesh.color[1], mesh.color[2]) : 0xcccccc,
                metalness: 0.6, roughness: 0.35
            });
            group.add(new THREE.Mesh(geo, mat));
        });
        group.rotateX(-Math.PI / 2); 
        state.model = group;
        state.scene.add(state.model);
        updateUIStatus(name);
        fitCamera();
    } catch (e) { console.error(e); }
    showLoading(false);
}

// ── Simulation Logic ───────────────────────────────
function jogJoint(axisIdx, direction) {
    if (!state.joints[axisIdx]) return;
    
    const step = 0.087; // 약 5도
    const targetJoint = state.joints[axisIdx];
    
    // 축별 회전 방향 설정 (모델 구조에 따라 다를 수 있음)
    // 보통 J1, J4, J6는 Y축(Up), J2, J3, J5는 X/Z축 회전인 경우가 많음
    if (axisIdx === 0 || axisIdx === 3 || axisIdx === 5) {
        targetJoint.rotation.y += step * direction;
    } else {
        targetJoint.rotation.z += step * direction;
    }
    
    state.jointAngles[axisIdx] += (direction * 5);
    setStatus(`J${axisIdx+1}: ${state.jointAngles[axisIdx]}°`, '#38bdf8');
}

function resetJoints() {
    state.joints.forEach((j, i) => {
        j.rotation.set(0, 0, 0);
        state.jointAngles[i] = 0;
    });
    setStatus('Home Position', '#22c55e');
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
    const dist = size.length() * 1.5;
    state.camera.position.set(dist * 0.8, dist * 0.5, dist * 0.8);
    state.camera.lookAt(0, size.y / 2, 0);
    state.controls.target.set(0, size.y / 2, 0);
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
