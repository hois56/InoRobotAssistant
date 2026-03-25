/**
 * Inovance Robot 3D Viewer — Simulation Edition (Fixed)
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
    joints: [],       
    jointAngles: [0, 0, 0, 0, 0, 0] 
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
    } catch (e) { console.error(e); }
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
    
    document.querySelectorAll('.jog-btn').forEach(btn => {
        btn.addEventListener('click', () => {
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
            new FBXLoader().load(url, (fbx) => renderFBXModel(fbx, name), null, (err) => { throw err; });
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
    console.log(`[FBX Load Success] Model: ${name}`);
    cleanupScene();
    fbx.rotateX(-Math.PI / 2); 

    state.joints = [];
    state.jointAngles = [0, 0, 0, 0, 0, 0];

    fbx.traverse(c => {
        if (c.isMesh) c.castShadow = c.receiveShadow = true;
    });

    /**
     * [핵심 수정]
     * - Mesh(껍데기)가 아닌 Group/Object3D (실제 회전축 역할을 하는 부모 노드)를 탐색
     * - 이름이 J+숫자 패턴에 정확히 맞는 것만 수집 (J1, J2 ... j10, J11 등 중복 제거)
     * - 정렬 후 앞 6개만 사용
     */
    const jointPattern = /j[1-6]$/i; // 이름이 J1~J6로 끝나는 노드만
    fbx.traverse(c => {
        if (!c.isMesh && jointPattern.test(c.name.trim())) {
            if (!state.joints.find(j => j.name === c.name)) {
                state.joints.push(c);
                console.log(`[Joint Captured] Name: ${c.name}, Type: ${c.type}`);
            }
        }
    });

    // 만약 정규식 매칭이 실패했다면 폴백: 직계 자식 노드 사용
    if (state.joints.length === 0) {
        fbx.children.forEach(child => state.joints.push(child));
        console.warn('[Joint Fallback] Using direct children.');
    }

    // J1~J6 순서로 정렬 후 6개 확보
    state.joints.sort((a, b) => a.name.localeCompare(b.name, undefined, {numeric: true}));
    state.joints = state.joints.slice(0, 6);
    console.log(`[Joints Final 6]`, state.joints.map(j => `${j.name} (${j.type})`));

    state.model = fbx;
    state.scene.add(state.model);
    updateUIStatus(name);
    
    const isR4 = name.toUpperCase().replace(/\s/g, '').includes('IR-R4');
    el.jogPanel.classList.toggle('hidden', !isR4);
    
    showLoading(false);
    fitCamera();
}


async function parseAndRenderSTEP(buffer, name) {
    if (!state.occt) return;
    cleanupScene();
    el.jogPanel.classList.add('hidden'); 
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

function jogJoint(axisIdx, direction) {
    console.log(`[JOG Action] J${axisIdx+1} | Dir: ${direction}`);
    const targetJoint = state.joints[axisIdx];
    if (!targetJoint) {
        console.error(`[JOG Error] No joint at index ${axisIdx}`);
        return;
    }
    
    const step = 0.087; 
    if (axisIdx === 0 || axisIdx === 3 || axisIdx === 5) targetJoint.rotation.y += step * direction;
    else targetJoint.rotation.z += step * direction;
    
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
