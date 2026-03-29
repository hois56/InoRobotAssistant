/**
 * Inovance Robot 3D Viewer
 * Enhanced to support Multiple Models & Transformation
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';

const state = {
    scene: null, camera: null, renderer: null,
    controls: null, transformControls: null,
    models: [], // List of loaded models { group, name, type }
    grid: null, labels: [],
    addMode: false
};

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
    btnToggleGrid:   document.getElementById('btn-toggle-grid'),
    btnAddMode:      null 
};

async function init() {
    try {
        setupUI();
        setupScene();
        setupLights();
        setupControls();
        setupEventListeners();
        animate();
        await populateModelList();
        setStatus('Ready', '#22c55e');
    } catch (err) {
        console.error("Initialization Failed:", err);
        setStatus(`Init Error: ${err.message}`, '#ef4444');
    }
}

function setupUI() {
    const wrapper = document.querySelector('.select-wrapper');
    if (!wrapper) return;

    const container = document.createElement('label');
    container.className = 'add-mode-toggle';
    container.innerHTML = `
        <input type="checkbox" id="chk-add-mode">
        <span><i class="fa-solid fa-plus-circle"></i> 모델 추가 모드</span>
    `;
    wrapper.after(container);
    el.btnAddMode = document.getElementById('chk-add-mode');
    
    // Update CAD download button title
    const btnDown = document.getElementById('btn-download-cad');
    if(btnDown) btnDown.title = "현재 열린 모든 모델 CAD 다운로드";
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
    
    state.grid = new THREE.GridHelper(10000, 100, 0x475569, 0x1e293b);
    state.grid.position.y = -0.1;
    state.scene.add(state.grid);
    addGridLabels();
}

function addGridLabels() {
    const intervals = [500, 1000, 1500, 2000, 3000, 4000, 5000];
    const labelColor = '#94a3b8';
    intervals.forEach(val => {
        state.labels.push(createLabel(`${val}mm`, val, 5, 0, labelColor));
        state.labels.push(createLabel(`-${val}mm`, -val, 5, 0, labelColor));
        state.labels.push(createLabel(`${val}mm`, 0, 5, val, labelColor));
        state.labels.push(createLabel(`-${val}mm`, 0, 5, -val, labelColor));
    });
    state.labels.forEach(l => state.scene.add(l));
}

function createLabel(text, x, y, z, color) {
    const canvas = document.createElement('canvas');
    canvas.width = 256; canvas.height = 128;
    const ctx = canvas.getContext('2d');
    ctx.font = 'bold 32px Outfit, Inter, Arial';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = color; ctx.fillText(text, 128, 64);
    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.SpriteMaterial({ map: texture, transparent: true });
    const sprite = new THREE.Sprite(material);
    sprite.position.set(x, y, z);
    sprite.scale.set(160, 80, 1);
    return sprite;
}

function setupLights() {
    state.scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    const dir = new THREE.DirectionalLight(0xffffff, 1.25);
    dir.position.set(1500, 2500, 1000);
    dir.castShadow = true;
    state.scene.add(dir);
    const dir2 = new THREE.DirectionalLight(0xffffff, 0.5);
    dir2.position.set(-1500, 1000, -1000);
    state.scene.add(dir2);
}

function setupControls() {
    state.controls = new OrbitControls(state.camera, state.renderer.domElement);
    state.controls.enableDamping = false;

    state.transformControls = new TransformControls(state.camera, state.renderer.domElement);
    state.transformControls.addEventListener('dragging-changed', (event) => {
        state.controls.enabled = !event.value;
    });
    state.scene.add(state.transformControls);
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
    el.btnToggleGrid.addEventListener('click', () => {
        state.grid.visible = !state.grid.visible;
        state.labels.forEach(l => l.visible = state.grid.visible);
    });

    const btnDown = document.getElementById('btn-download-cad');
    if (btnDown) {
        btnDown.addEventListener('click', handleCADDownload);
    }
}

async function loadModelFromServer(file, name) {
    showLoading(true, `Loading ${name}...`);
    setStatus('Loading', '#f59e0b');
    const isAddMode = el.btnAddMode && el.btnAddMode.checked;

    // If not in Add Mode, clean up previous models
    if (!isAddMode) {
        cleanupScene();
    }

    try {
        const fbx = await loadFBX(`./models/${file}`, (p) => showLoading(true, `Model: ${p}%`));
        fbx.rotateX(-Math.PI / 2);
        const rotFix = MODEL_ROTATION_FIX[name];
        if (rotFix && rotFix.z) fbx.rotateZ(rotFix.z);

        applyFBXMaterial(fbx);

        // Auto-scale detection (skip for controllers — handled separately)
        const box = new THREE.Box3().setFromObject(fbx);
        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);
        if (file.includes('IRCB501')) {
            // Standard/Highprotection: UnitScaleFactor=0.1 (mm), no extra scale needed
            // Highpower: UnitScaleFactor=2.54 (inches) → normalize to mm scale
            if (file.includes('Highpower')) {
                fbx.scale.multiplyScalar(0.1 / 2.54); // ~0.0394: normalize inches→mm
            }
        } else if (maxDim > 0 && maxDim < 15) {
            fbx.scale.multiplyScalar(1000);
        } else if (maxDim >= 15 && maxDim < 500) {
            fbx.scale.multiplyScalar(10);
        }

        // Name it for CAD download mapping later
        fbx.userData.modelName = name;

        // Spread models a bit if adding
        if (isAddMode && state.models.length > 0) {
            fbx.position.z += (state.models.length * 600);
        }

        state.models.push(fbx);
        state.scene.add(fbx);
        
        // Attach transform controls to the newest model
        state.transformControls.attach(fbx);

        updateUIStatus();
        showLoading(false);
        if(!isAddMode) fitCamera();
    } catch (err) {
        console.error('Load failed:', err);
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

function applyFBXMaterial(fbx) {
    fbx.traverse(c => {
        if (!c.isMesh) return;
        c.castShadow = c.receiveShadow = true;
        const mats = Array.isArray(c.material) ? c.material : [c.material];
        mats.forEach(m => {
            if (!m) return;
            m.vertexColors = false; // Fix generic FBX dark colors
            if (m.color && m.color.r === 0 && m.color.g === 0 && m.color.b === 0) {
                m.color.set(0xcccccc);
            }
            m.needsUpdate = true;
        });
    });
}

function cleanupScene() {
    state.transformControls.detach();
    state.models.forEach(model => {
        state.scene.remove(model);
        model.traverse(c => {
            if (c.isMesh) {
                c.geometry.dispose();
                (Array.isArray(c.material) ? c.material : [c.material]).forEach(m => m.dispose());
            }
        });
    });
    state.models = [];
}

function updateUIStatus() {
    const names = state.models.map(m => m.userData.modelName);
    el.statName.textContent = names.length > 1 ? `${names[0]} (+${names.length-1})` : (names[0] || '-');
    el.emptyState.classList.add('hidden');
    setStatus('Ready', '#22c55e');
}

/**
 * Multi-Model CAD Download
 */
async function handleCADDownload() {
    if (state.models.length === 0) {
        alert("다운로드할 모델이 없습니다.");
        return;
    }

    const btnDown = document.getElementById('btn-download-cad');
    const oldHtml = btnDown.innerHTML;
    btnDown.disabled = true;
    btnDown.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';

    const zip = new JSZip();
    const downloadQueue = [];

    state.models.forEach(model => {
        const name = model.userData.modelName;
        // Controller files
        if (name.includes('IRCB501')) {
            downloadQueue.push({ path: `../InoRobotSelect/Robot_CAD/Controller/${name}/${name}.dwg`, name: `${name}_2D.dwg` });
            downloadQueue.push({ path: `../InoRobotSelect/Robot_CAD/Controller/${name}/${name}.stp`, name: `${name}_3D.stp` });
        } 
        // Robot files
        else {
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
                } else if (parts.length >= 3) {
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

            downloadQueue.push({ path: `../InoRobotSelect/Robot_CAD/${typeDir}/${folderBase}/${modelId}_2D.dwg`, name: `${modelId}_2D.dwg` });
            downloadQueue.push({ path: `../InoRobotSelect/Robot_CAD/${typeDir}/${folderBase}/${modelId}_3D.stp`, name: `${modelId}_3D.stp` });
        }
    });

    try {
        await Promise.all(downloadQueue.map(async (file) => {
            const r = await fetch(file.path);
            if (r.ok) {
                zip.file(file.name, await r.blob());
            } else {
                // Fallback for non-INT filenames
                if (file.path.includes('-INT')) {
                    const fallbackPath = file.path.replace('-INT', '');
                    const r2 = await fetch(fallbackPath);
                    if (r2.ok) zip.file(file.name, await r2.blob());
                }
            }
        }));

        if (state.models.length > 0) {
            const content = await zip.generateAsync({ type: "blob", compression: "STORE" });
            saveAs(content, `Inovance_Total_CAD.zip`);
        }
    } catch (e) { console.error("CAD download failed:", e); }

    btnDown.disabled = false;
    btnDown.innerHTML = oldHtml;
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

function fitCamera() {
    if (state.models.length === 0) return;
    const box = new THREE.Box3();
    state.models.forEach(m => box.expandByObject(m));
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const dist = size.length() * 1.5;
    state.camera.position.set(center.x + dist * 0.8, dist * 0.5, center.z + dist * 0.8);
    state.camera.lookAt(center.x, center.y, center.z);
    state.controls.target.set(center.x, center.y, center.z);
}

async function populateModelList() {
    try {
        const res = await fetch('./models/models.json');
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
    } catch (e) { console.error('Failed to load model list:', e); }
}

function showLoading(show, text = 'Loading...') {
    el.loadingOverlay.classList.toggle('hidden', !show);
    el.loadingText.textContent = text;
}

function setStatus(text, color) {
    el.statStatus.textContent = text;
    el.statusDot.style.color = color;
}

/**
 * Handle object selection for TransformControls
 */
window.addEventListener('mousedown', (e) => {
    if (state.models.length <= 1) return;
    
    const mouse = new THREE.Vector2();
    mouse.x = ( (e.clientX - el.canvasContainer.getBoundingClientRect().left) / el.canvasContainer.clientWidth ) * 2 - 1;
    mouse.y = - ( (e.clientY - el.canvasContainer.getBoundingClientRect().top) / el.canvasContainer.clientHeight ) * 2 + 1;

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, state.camera);
    
    const intersects = raycaster.intersectObjects(state.models, true);
    if (intersects.length > 0) {
        let object = intersects[0].object;
        while (object.parent && !state.models.includes(object)) {
            object = object.parent;
        }
        if (state.models.includes(object)) {
            state.transformControls.attach(object);
        }
    }
});

init();
