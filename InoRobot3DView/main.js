/**
 * Inovance Robot 3D Viewer
 */

import * as THREE from 'https://esm.sh/three@0.156.1';
import { OrbitControls } from 'https://esm.sh/three@0.156.1/examples/jsm/controls/OrbitControls.js';
import { FBXLoader } from 'https://esm.sh/three@0.156.1/examples/jsm/loaders/FBXLoader.js';

const state = {
    scene: null, camera: null, renderer: null,
    controls: null, model: null, controller: null, grid: null, occt: null
};

// Controller mapping per robot model name
function getControllerName(name) {
    if (/^IR-S[47]-|^IR-S10-|^IR-TS[45]-/.test(name))            return 'IRCB501-SCARA-Standard';
    if (/^IR-(S25|S35|S60|GS60)-/.test(name))                     return 'IRCB501-SCARA-Highpower';
    if (/^IR-R[47]H?-/.test(name))                                return 'IRCB501-6-axis-Standard';
    if (/^IR-R(10-110|10H|11|15H|20H)-/.test(name))               return 'IRCB501-6-axis-Highpower';
    if (/^IR-R(10-140|16-|16$|25-|25$)/.test(name))               return 'IRCB501-6-axis-Highprotection';
    return null;
}

// Models that need special rotation fix
const MODEL_ROTATION_FIX = {
    'IR-S25-100Z42S': { z: Math.PI }
};

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

async function init() {
    setupScene();
    setupLights();
    setupControls();
    setupEventListeners();
    animate();
    await populateModelList();
    setStatus('Ready', '#22c55e');
}

function setupScene() {
    state.scene = new THREE.Scene();
    state.scene.background = new THREE.Color(0x0b0e14);
    state.camera = new THREE.PerspectiveCamera(45, el.canvasContainer.clientWidth / el.canvasContainer.clientHeight, 0.1, 1e7);
    state.camera.position.set(1200, 900, 1200);
    state.renderer = new THREE.WebGLRenderer({ antialias: true });
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
    
    const btnDown = document.getElementById('btn-download-cad');
    if (btnDown) {
        btnDown.addEventListener('click', async () => {
            const name = el.statName.textContent;
            if (!name || name === '-') {
                alert("모델이 선택되지 않았습니다.");
                return;
            }

            const modelId = name.includes('-INT') ? name : name + '-INT';
            const isScara = name.includes('-S') || name.includes('-TS') || name.includes('-GS');
            const typeDir = isScara ? 'SCARA' : '6-axis';
            
            let folderBase = name.split('Z')[0];
            if (!isScara) {
                const parts = name.split('-');
                if (parts[2].endsWith('S') && !name.includes('R11-90S')) {
                    folderBase = parts.slice(0, 2).join('-') + '-' + parts[2].slice(0, -1);
                } else if (parts[2].endsWith('S5')) {
                    folderBase = parts.slice(0, 2).join('-') + '-' + parts[2].slice(0, -2);
                } else {
                    folderBase = parts.slice(0, 3).join('-');
                }
            }
            
            const overrides = {
                "IR-R11-90S": "IR-R11-90S",
                "IR-R15H-145S5": "IR-R15H-145",
                "IR-R16-210S5": "IR-R16-210",
                "IR-R20H-120S5": "IR-R20H-120",
                "IR-R25-178S5": "IR-R25-178"
            };
            if (overrides[name]) folderBase = overrides[name];

            const zip = new JSZip();
            const files = [
                { path: `../InoRobotSelect/Robot_CAD/${typeDir}/${folderBase}/${modelId}_2D.dwg`, name: `${modelId}_2D.dwg` },
                { path: `../InoRobotSelect/Robot_CAD/${typeDir}/${folderBase}/${modelId}_3D.stp`, name: `${modelId}_3D.stp` }
            ];

            // Add controller CAD files
            const ctrl = getControllerName(name);
            if (ctrl) {
                files.push(
                    { path: `../InoRobotSelect/Robot_CAD/Controller/${ctrl}/${ctrl}.dwg`, name: `${ctrl}.dwg` },
                    { path: `../InoRobotSelect/Robot_CAD/Controller/${ctrl}/${ctrl}.stp`, name: `${ctrl}.stp` }
                );
            }

            btnDown.disabled = true;
            const oldHtml = btnDown.innerHTML;
            btnDown.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';

            try {
                for (const f of files) {
                    const r = await fetch(f.path);
                    if (r.ok) {
                        zip.file(f.name, await r.blob());
                    }
                }
                const content = await zip.generateAsync({ type: "blob", compression: "STORE" });
                saveAs(content, `Inovance_CAD_${modelId}.zip`);
            } catch (e) { console.error(e); }

            btnDown.disabled = false;
            btnDown.innerHTML = oldHtml;
        });
    }
}

function animate() {
    requestAnimationFrame(animate);
    state.controls.update();
    state.renderer.render(state.scene, state.camera);
}

function onResize() {
    const w = el.canvasContainer.clientWidth, h = el.canvasContainer.clientHeight;
    state.camera.aspect = w / h;
    state.camera.updateProjectionMatrix();
    state.renderer.setSize(w, h);
}

async function populateModelList() {
    try {
        const res = await fetch(`./models/models.json?v=${Date.now()}`);
        const list = await res.json();
        el.modelSelect.innerHTML = '<option value="" disabled selected>-- 로봇 모델을 선택하세요 --</option>';
        let currentGroup = null;
        list.forEach(m => {
            if (m.group) {
                currentGroup = document.createElement('optgroup');
                currentGroup.label = m.group;
                el.modelSelect.appendChild(currentGroup);
            } else {
                const opt = document.createElement('option');
                opt.value = m.file;
                opt.textContent = m.name;
                (currentGroup || el.modelSelect).appendChild(opt);
            }
        });
    } catch (e) { console.error(e); }
}

function applyFBXMaterial(fbx) {
    fbx.traverse(c => {
        if (!c.isMesh) return;
        c.castShadow = c.receiveShadow = true;
        // Force visible material in case FBX has transparent/black material
        const mats = Array.isArray(c.material) ? c.material : [c.material];
        mats.forEach(m => {
            if (!m) return;
            m.transparent = false;
            m.opacity = 1;
            if (m.color && m.color.r === 0 && m.color.g === 0 && m.color.b === 0) {
                m.color.set(0xcccccc);
            }
            m.needsUpdate = true;
        });
    });
}

async function loadModelFromServer(file, name) {
    showLoading(true, `Loading ${name}...`);
    setStatus('Loading', '#f59e0b');
    cleanupScene();

    const ctrlName = getControllerName(name);
    const ctrlFile = ctrlName ? `${ctrlName}.fbx` : null;

    try {
        // Load robot body
        const robotFbx = await loadFBX(`./models/${file}`,
            (p) => showLoading(true, `Robot: ${p}%`));
        robotFbx.rotateX(-Math.PI / 2);

        // Apply special rotation fix per model
        const rotFix = MODEL_ROTATION_FIX[name];
        if (rotFix && rotFix.z) robotFbx.rotateZ(rotFix.z);

        applyFBXMaterial(robotFbx);
        state.model = robotFbx;
        state.scene.add(state.model);

        // Load controller (failure doesn't block robot display)
        if (ctrlFile) {
            showLoading(true, `Loading controller...`);
            try {
                const ctrlFbx = await loadFBX(`./models/${ctrlFile}`,
                    (p) => showLoading(true, `Controller: ${p}%`));
                ctrlFbx.rotateX(-Math.PI / 2);
                applyFBXMaterial(ctrlFbx);

                // Position controller 500mm in Z+ direction from robot
                const robotBox = new THREE.Box3().setFromObject(robotFbx);
                const robotSize = robotBox.getSize(new THREE.Vector3());
                ctrlFbx.position.z = robotSize.z / 2 + 500;
                state.controller = ctrlFbx;
                state.scene.add(state.controller);
            } catch (ctrlErr) {
                console.warn('Controller load failed:', ctrlErr);
            }
        }

        updateUIStatus(name);
        showLoading(false);
        fitCamera();
    } catch (err) {
        console.error('Robot load failed:', err);
        setStatus('Error', '#ef4444');
        showLoading(false);
    }
}

function loadFBX(url, onProgress) {
    return new Promise((resolve, reject) => {
        new FBXLoader().load(url, resolve,
            (xhr) => { if (xhr.total > 0 && onProgress) onProgress(Math.round(xhr.loaded / xhr.total * 100)); },
            reject);
    });
}


function cleanupScene() {
    for (const key of ['model', 'controller']) {
        if (!state[key]) continue;
        state.scene.remove(state[key]);
        state[key].traverse(c => {
            if (c.isMesh) {
                c.geometry.dispose();
                (Array.isArray(c.material) ? c.material : [c.material]).forEach(m => m.dispose());
            }
        });
        state[key] = null;
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
    if (state.controller) box.expandByObject(state.controller);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const dist = size.length() * 1.5;
    state.camera.position.set(center.x + dist * 0.8, dist * 0.5, center.z + dist * 0.8);
    state.camera.lookAt(center.x, center.y, center.z);
    state.controls.target.set(center.x, center.y, center.z);
}

function toggleGrid() {
    state.grid.visible = !state.grid.visible;
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
