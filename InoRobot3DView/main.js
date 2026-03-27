/**
 * Inovance Robot 3D Viewer
 */

import * as THREE from 'https://esm.sh/three@0.156.1';
import { OrbitControls } from 'https://esm.sh/three@0.156.1/examples/jsm/controls/OrbitControls.js';
import { FBXLoader } from 'https://esm.sh/three@0.156.1/examples/jsm/loaders/FBXLoader.js';

const state = {
    scene: null, camera: null, renderer: null,
    controls: null, model: null, grid: null, occt: null
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
    await Promise.all([initEngine(), populateModelList()]);
}

async function initEngine() {
    setStatus('Engine Init', '#94a3b8');
    try {
        if (typeof window.occtimportjs === 'undefined') return;
        state.occt = await window.occtimportjs({
            locateFile: (name) => `https://cdn.jsdelivr.net/npm/occt-import-js@0.0.12/dist/${name}`
        });
        setStatus('Ready', '#22c55e');
    } catch (e) { console.error(e); }
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
            new FBXLoader().load(url, (fbx) => renderFBXModel(fbx, name),
                (xhr) => { if (xhr.total > 0) showLoading(true, `Downloading: ${Math.round(xhr.loaded/xhr.total*100)}%`); },
                () => { setStatus('Error', '#ef4444'); showLoading(false); });
            return;
        }
        const res = await fetch(url);
        await parseAndRenderSTEP(await res.arrayBuffer(), name);
    } catch (err) {
        setStatus('Error', '#ef4444');
        showLoading(false);
    }
}

function renderFBXModel(fbx, name) {
    cleanupScene();
    fbx.rotateX(-Math.PI / 2);
    fbx.traverse(c => { if (c.isMesh) c.castShadow = c.receiveShadow = true; });
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

function cleanupScene() {
    if (!state.model) return;
    state.scene.remove(state.model);
    state.model.traverse(c => {
        if (c.isMesh) {
            c.geometry.dispose();
            (Array.isArray(c.material) ? c.material : [c.material]).forEach(m => m.dispose());
        }
    });
    state.model = null;
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
