/**
 * Inovance Robot 3D Simulation
 * Enhanced to support Multiple Models & Transformation
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { buildStepSnapCandidates } from '../3_ToolSelector/snap-geometry.mjs?v=20260719-euler-321-11';
import {
    MOTION_PROJECT_SCHEMA_VERSION,
    DEFAULT_MOVJ_SPEED,
    DEFAULT_MOVL_SPEED,
    DEFAULT_DELAY_SECONDS,
    MIN_DELAY_SECONDS,
    MAX_DELAY_SECONDS,
    MOTION_SETTLING_DELAY_SECONDS,
    MIN_POINT_INDEX,
    MAX_POINT_INDEX,
    MAX_POINT_LABEL_LENGTH,
    formatMotionPointName,
    formatPositionPointRecordLine,
    isMotionPointMotion,
    isValidMotionPointLabel,
    sCurveProgress,
    interpolateLinearPosition,
    slerpQuaternion,
    calculateMovjDuration,
    calculateMovlDuration,
    calculateDelayDuration,
    calculateCycleElapsedSeconds,
    createEmptyMotionProgram,
    cloneMotionProgram,
    reorderMotionSteps,
    normalizeMotionProject
} from './motion-program-core.mjs?v=20260719-euler-321-11';
function uiText(value) {
    return window.InoRobotI18n ? window.InoRobotI18n.translate(String(value)) : String(value);
}

function uiFormat(value, replacements = {}) {
    return uiText(value).replace(/\{([A-Za-z0-9_]+)\}/g, (match, key) => (
        Object.prototype.hasOwnProperty.call(replacements, key) ? String(replacements[key]) : match
    ));
}

const state = {
    scene: null, camera: null, renderer: null,
    controls: null, transformControls: null,
    models: [], // List of loaded models { group, name, type }
    selectedModel: null,
    modelTreeIdCounter: 0,
    undoStack: [],
    redoStack: [],
    historySuspended: false,
    pendingTransformHistory: null,
    pendingNumericHistory: null,
    pendingJointHistory: null,
    pendingBaseJogHistory: null,
    programStepDragId: null,
    programContextStepId: null,
    positionDialogTarget: null,
    pendingBaseJogGizmoHistory: null,
    pendingBaseJogNumericHistory: null,
    panelWindows: new Map(),
    catalog: new Map(),
    activeArticulatedModel: null,
    baseJogHold: null,
    baseJogTransformControls: null,
    baseJogGizmoTarget: null,
    baseJogGizmoRobot: null,
    baseJogGizmoMode: 'translate',
    baseJogGizmoDragging: false,
    baseJogGizmoApplying: false,
    baseJogGizmoStartTarget: null,
    motionPrograms: new Map(),
    motionSessions: new Map(),
    activeProgramRobot: null,
    motionRepeatRobot: false,
    motionRepeat: false,
    motionHistoryBefore: null,
    motionSaveTimer: null,
    lastCycleTimeDisplayUpdate: 0,
    fullscreenUiMode: false,
    fullscreenTopbarHideTimer: null,
    fullscreenStatsBarHideTimer: null,
    viewerStatus: null,
    motionProgramStatus: null,
    virtualController: {
        core: null,
        corePromise: null,
        socket: null,
        wanted: false,
        status: 'disconnected',
        source: 'bridge',
        bridgeStopInProgress: false,
        bridgeStartInProgress: false,
        bridgeRunning: false,
        bridgeHealthDeadline: 0,
        bridgeHealthTimer: null,
        targetRobotId: null,
        samples: null,
        reconnectTimer: null,
        historyBefore: null,
        lastAppliedSampleId: 0,
        lastRateUpdateAt: 0,
        sourceConnectedAt: 0,
        lastSampleAt: 0,
        lastStreamStartAt: 0,
        streamWatchdogTimer: null
    },
    pendingImportFile: null,
    occtImporterPromise: null,
    snapMoveMode: false,
    snapCandidates: [],
    snapCandidateModelsSignature: '',
    snapHover: null,
    snapVisibilityRaycaster: new THREE.Raycaster(),
    grid: null, baseAxes: null, labels: [],
    addMode: false
};

const MODEL_ROTATION_FIX = {
    'IR-S25-100Z42S': { z: Math.PI },
    'IR-S25-120Z42S-INT': { z: Math.PI },
    'IR-S25-120Z36C-INT': { z: Math.PI },
    'IR-S35-120Z42S-INT': { z: Math.PI },
    'IR-S35-120Z35C-INT': { z: Math.PI }
};

const MODEL_UNIT_SCALE_FIX = {
    'IR-R16-210S-INT_3D.fbx': 25.4,
    'IR-R25-178S-INT_3D.fbx': 25.4
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
    btnToggleTransform: document.getElementById('btn-toggle-transform'),
    btnFullscreenMode: document.getElementById('btn-fullscreen-mode'),
    btnPositionExport: document.getElementById('btn-position-export'),
    btnSnapMove: document.getElementById('btn-snap-move'),
    btnImport3D:     document.getElementById('btn-import-3d'),
    inputImport3D:   document.getElementById('input-import-3d'),
    importDialog:    document.getElementById('import-3d-dialog'),
    importPlacement: document.getElementById('import-placement'),
    modelTree:       document.getElementById('model-tree'),
    modelTreeCount:  document.getElementById('model-tree-count'),
    modelBrowserPanel: document.getElementById('model-browser-panel'),
    jogPanel:        document.getElementById('jog-panel'),
    panelLauncher:   document.getElementById('panel-launcher'),
    modelTransformPanel: document.getElementById('model-transform-panel'),
    modelNumericTransform: document.getElementById('model-numeric-transform'),
    modelNumericTransformTitle: document.getElementById('model-numeric-transform-title'),
    modelNumericTransformUnit: document.getElementById('model-numeric-transform-unit'),
    selectedModelName: document.getElementById('selected-model-name'),
    modelPositionInputs: {
        x: document.getElementById('model-position-x'),
        y: document.getElementById('model-position-y'),
        z: document.getElementById('model-position-z')
    },
    modelRotationInputs: {
        x: document.getElementById('model-rotation-x'),
        y: document.getElementById('model-rotation-y'),
        z: document.getElementById('model-rotation-z')
    },
    transformModeButtons: [...document.querySelectorAll('[data-transform-mode]')],
    btnUndo:         document.getElementById('btn-undo'),
    btnRedo:         document.getElementById('btn-redo'),
    btnCloseImport:  document.getElementById('btn-close-import'),
    btnCancelImport: document.getElementById('btn-cancel-import'),
    btnConfirmImport: document.getElementById('btn-confirm-import'),
    jogControls:     document.getElementById('jog-controls'),
    btnResetJoints:  document.getElementById('btn-reset-joints'),
    jointJogView:    document.getElementById('joint-jog-view'),
    baseJogView:     document.getElementById('base-jog-view'),
    btnJogJointMode: document.getElementById('btn-jog-joint-mode'),
    btnJogBaseMode:  document.getElementById('btn-jog-base-mode'),
    btnBaseGizmoTranslate: document.getElementById('btn-base-gizmo-translate'),
    btnBaseGizmoRotate: document.getElementById('btn-base-gizmo-rotate'),
    baseGizmoRotateLabel: document.getElementById('base-gizmo-rotate-label'),
    baseMoveStep:    document.getElementById('base-move-step'),
    baseRotateStep:  document.getElementById('base-rotate-step'),
    baseJogStatus:   document.getElementById('base-jog-status'),
    tcpReadouts: {
        x: document.getElementById('tcp-x'),
        y: document.getElementById('tcp-y'),
        z: document.getElementById('tcp-z'),
        rx: document.getElementById('tcp-rx'),
        ry: document.getElementById('tcp-ry'),
        rz: document.getElementById('tcp-rz')
    },
    programPanel: document.getElementById('program-panel'),
    programRobotList: document.getElementById('program-robot-list'),
    programRobotName: document.getElementById('program-robot-name'),
    programStepList: document.getElementById('program-step-list'),
    programStepContextMenu: document.getElementById('program-step-context-menu'),
    btnProgramShowPositionValue: document.getElementById('program-show-position-value'),
    positionValueDialog: document.getElementById('position-value-dialog'),
    positionValuePointName: document.getElementById('position-value-point-name'),
    positionValueLabel: document.getElementById('position-value-label'),
    positionValueError: document.getElementById('position-value-error'),
    positionValueInputs: Object.fromEntries([...document.querySelectorAll('[data-position-value]')]
        .map((input) => [input.dataset.positionValue, input])),
    positionArmInputs: [...document.querySelectorAll('[data-position-arm]')],
    positionExternalInputs: [...document.querySelectorAll('[data-position-external]')],
    btnClosePositionValue: document.getElementById('btn-close-position-value'),
    btnCancelPositionValue: document.getElementById('btn-cancel-position-value'),
    btnApplyPositionValue: document.getElementById('btn-apply-position-value'),
    snapMarker: document.getElementById('simulation-snap-marker'),
    snapLabel: document.getElementById('simulation-snap-label'),
    programStatus: document.getElementById('program-status'),
    btnProgramSelectAll: document.getElementById('program-select-all'),
    btnProgramAdd: document.getElementById('program-add-step'),
    btnProgramAddDelay: document.getElementById('program-add-delay'),
    btnProgramAddTimeStart: document.getElementById('program-add-time-start'),
    btnProgramAddTimeOut: document.getElementById('program-add-time-out'),
    btnProgramUpdate: document.getElementById('program-update-step'),
    btnProgramDelete: document.getElementById('program-delete-step'),
    btnProgramStepRobot: document.getElementById('program-step-robot'),
    btnProgramRunRobot: document.getElementById('program-run-robot'),
    btnProgramPauseRobot: document.getElementById('program-pause-robot'),
    btnProgramStopRobot: document.getElementById('program-stop-robot'),
    btnProgramStepGroup: document.getElementById('program-step-group'),
    btnProgramRunGroup: document.getElementById('program-run-group'),
    btnProgramPauseGroup: document.getElementById('program-pause-group'),
    btnProgramStopGroup: document.getElementById('program-stop-group'),
    programRepeatButtons: [...document.querySelectorAll('[data-program-repeat]')],
    programCycleTime: document.getElementById('program-cycle-time'),
    btnProgramExport: document.getElementById('program-export'),
    btnProgramImport: document.getElementById('program-import'),
    inputProgramImport: document.getElementById('program-import-file'),
    virtualControllerPanel: document.getElementById('virtual-controller-panel'),
    virtualControllerSource: document.getElementById('virtual-controller-source'),
    virtualControllerEndpoint: document.getElementById('virtual-controller-endpoint'),
    virtualControllerRobot: document.getElementById('virtual-controller-robot'),
    btnVirtualControllerConnect: document.getElementById('virtual-controller-connect'),
    btnVirtualControllerBridgeStart: document.getElementById('virtual-controller-bridge-start'),
    btnVirtualControllerBridgeStop: document.getElementById('virtual-controller-bridge-stop'),
    virtualControllerStatus: document.getElementById('virtual-controller-status'),
    virtualControllerStatusDot: document.getElementById('virtual-controller-status-dot'),
    virtualControllerAntenna: document.getElementById('virtual-controller-antenna'),
    virtualControllerLauncherAntenna: document.getElementById('virtual-controller-launcher-antenna'),
    virtualControllerRate: document.getElementById('virtual-controller-rate'),
    btnAddMode:      null 
};

const IK_POSITION_SCALE = 400;
const IK_MAX_ITERATIONS = 120;
const IK_DAMPING = 0.035;
const IK_MAX_JOINT_STEP = THREE.MathUtils.degToRad(5);
const IK_MAX_PRISMATIC_STEP = 12;
const REVOLUTE_DIRECTION_NEGATIVE = -1;
const REVOLUTE_DIRECTION_POSITIVE = 1;
const CONTROLLER_PRISMATIC_DIRECTION = 1;
const ROBOT_BODY_COLOR = '#ece9dd';
const AXIS_COLORS = Object.freeze({ x: '#d32f2f', y: '#388e3c', z: '#1976d2' });
const BASE_JOG_GIZMO_SIZE = 0.82;
const BASE_JOG_GIZMO_MESH_THICKNESS = 1.55;
const BASE_JOG_GIZMO_STROKE_RADIUS = 0.014;
const BASE_JOG_GIZMO_ACTIVE_STROKE_RADIUS = 0.022;
const BASE_JOG_GIZMO_ACTIVE_COLOR_SCALE = 0.58;
const BASE_JOG_MAX_VISIBLE_LINE_SPAN = 10;
const SCARA_TOOL_AXES = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] };
const SIX_AXIS_TOOL_AXES = { x: [0, 0, 1], y: [0, -1, 0], z: [1, 0, 0] };
const SIX_AXIS_POSITION_HOME_QUATERNION = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(-Math.PI, -Math.PI / 2, 0, 'ZYX')
);
const stlGeometryCache = new Map();
const BASE_JOG_HOLD_DELAY = 250;
const BASE_JOG_REPEAT_INTERVAL = 30;
const TRACE_SOURCE_LIVENESS_TIMEOUT_MS = 2500;
const VIRTUAL_CONTROLLER_STREAM_STALL_MS = 750;
const VIRTUAL_CONTROLLER_STREAM_WATCHDOG_MS = 250;
const SUPPORTED_IMPORT_EXTENSIONS = new Set(['stl', 'fbx', 'obj', 'glb', 'gltf', 'stp', 'step']);
const Y_UP_IMPORT_EXTENSIONS = new Set(['fbx', 'glb', 'gltf']);
const IMPORT_PLACEMENT_COLORS = { tcp: 0xf97316, scene: 0x65a30d };
const OCCT_IMPORT_BASE_URL = 'https://cdn.jsdelivr.net/npm/occt-import-js@0.0.23/dist/';
const MOTION_PROJECT_STORAGE_KEY = 'inorobot.3d-simulation.motion-project.v1';
const CYCLE_TIME_DISPLAY_INTERVAL = 50;
const MAX_MOTION_TRANSITIONS_PER_FRAME = 256;
const MOTION_MOVL_SAMPLE_DISTANCE = 25;
const MOTION_MOVL_SAMPLE_ANGLE = 5;
const SNAP_RADIUS_PX = 16;
const SNAP_TYPES = Object.freeze({
    endpoint: { label: '끝점', symbol: '◇', priority: 0 },
    vertex: { label: '꼭짓점', symbol: '□', priority: 1 },
    'circle-center': { label: '원/호 중심점', symbol: '⊙', priority: 2 },
    'edge-midpoint': { label: '에지 중심점', symbol: '△', priority: 3 },
    'face-center': { label: '면 중심점', symbol: '○', priority: 4 },
    'shape-center': { label: '형상 중심점', symbol: '⌖', priority: 5 },
    'virtual-intersection': { label: '가상 교점', symbol: '×', priority: 6 }
});
const PANEL_RESIZE_EDGE_SIZE = 8;
const PANEL_MINIMUM_SIZES = Object.freeze({
    'model-browser-panel': { width: 260, height: 220 },
    'jog-panel': { width: 250, height: 300 },
    'virtual-controller-panel': { width: 250, height: 230 },
    'program-panel': { width: 300, height: 320 }
});
const PANEL_DRAG_EXCLUDED_SELECTOR = [
    'button', 'input', 'select', 'textarea', 'a', 'label', 'option',
    '[contenteditable="true"]', '[role="button"]', '[role="treeitem"]',
    '[data-panel-drag-ignore]'
].join(', ');

async function init() {
    try {
        setupUI();
        setupScene();
        setupLights();
        setupControls();
        setupEventListeners();
        animate();
        await populateModelList();
        await restoreMotionProjectFromStorage();
        setStatus('Ready', '#22c55e');
    } catch (err) {
        console.error("Initialization Failed:", err);
        setStatus('초기화 중 오류가 발생했습니다.', '#ef4444');
    }
}

function setupUI() {
    const wrapper = document.querySelector('.select-wrapper');
    if (!wrapper) return;

    const container = document.createElement('label');
    container.className = 'add-mode-toggle';
    container.innerHTML = `
        <input type="checkbox" id="chk-add-mode">
        <span><i class="fa-solid fa-plus-circle"></i> ${uiText('모델 추가 모드')}</span>
    `;
    wrapper.after(container);
    el.btnAddMode = document.getElementById('chk-add-mode');

    if (el.panelLauncher && !el.panelLauncher.querySelector('[data-panel-toggle="program-panel"]')) {
        const programButton = document.createElement('button');
        programButton.type = 'button';
        programButton.dataset.panelToggle = 'program-panel';
        programButton.disabled = true;
        programButton.title = uiText('모션 프로그램 표시/숨김');
        programButton.innerHTML = `<i class="fa-solid fa-list-check"></i> ${uiText('Program')}`;
        const virtualButton = el.panelLauncher.querySelector('[data-panel-toggle="virtual-controller-panel"]');
        const divider = el.panelLauncher.querySelector('.viewer-control-divider');
        el.panelLauncher.insertBefore(programButton, virtualButton || divider);
    }
    
    // Update CAD download button title
    const btnDown = document.getElementById('btn-download-cad');
    if(btnDown) btnDown.title = uiText('현재 열린 모든 모델 CAD 다운로드');
}

function refreshLocalizedControls() {
    const addModeLabel = document.querySelector('.add-mode-toggle span');
    if (addModeLabel) {
        addModeLabel.innerHTML = `<i class="fa-solid fa-plus-circle"></i> ${uiText('모델 추가 모드')}`;
    }
    const btnDown = document.getElementById('btn-download-cad');
    if (btnDown) btnDown.title = uiText('현재 열린 모든 모델 CAD 다운로드');
    const placeholder = el.modelSelect?.querySelector('option[value=""]');
    if (placeholder) placeholder.textContent = uiText('-- 로봇 모델을 선택하세요 --');
    const programButton = el.panelLauncher?.querySelector('[data-panel-toggle="program-panel"]');
    if (programButton) {
        programButton.title = uiText('모션 프로그램 표시/숨김');
        programButton.innerHTML = `<i class="fa-solid fa-list-check"></i> ${uiText('Program')}`;
    }
    refreshImportPlacementOptions();
    updateFullscreenModeButton();
    state.panelWindows.forEach((record, panelId) => {
        window.InoRobotI18n?.refresh?.(record.panel);
        record.popup.document.title = getPanelWindowTitle(panelId);
    });
    renderModelTree();
    refreshJointControlLabels();
    renderMotionProgramPanel();
    refreshVirtualControllerUi();
    refreshViewerStatus();
    refreshMotionProgramStatus();
    if (el.baseJogStatus?.dataset.sourceMessage) {
        el.baseJogStatus.textContent = uiText(el.baseJogStatus.dataset.sourceMessage);
    }
}

function setupScene() {
    state.scene = new THREE.Scene();
    state.scene.background = new THREE.Color(0x0b0e14);
    state.camera = new THREE.PerspectiveCamera(45, el.canvasContainer.clientWidth / el.canvasContainer.clientHeight, 0.1, 1e7);
    state.camera.up.set(0, 0, 1);
    state.camera.position.set(1400, -1400, 1000);
    state.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    state.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    state.renderer.setSize(el.canvasContainer.clientWidth, el.canvasContainer.clientHeight);
    state.renderer.shadowMap.enabled = true;
    state.renderer.toneMapping = THREE.ReinhardToneMapping;
    state.renderer.toneMappingExposure = 2.3;
    el.canvasContainer.appendChild(state.renderer.domElement);
    state.renderer.domElement.addEventListener('mousedown', preventMiddleButtonAutoscroll, { capture: true });
    
    state.grid = new THREE.GridHelper(10000, 100, 0x475569, 0x1e293b);
    state.grid.rotateX(Math.PI / 2);
    state.grid.position.z = -0.1;
    state.scene.add(state.grid);

    state.baseAxes = new THREE.AxesHelper(280);
    state.baseAxes.name = 'Viewer Base Coordinate';
    applyAxesHelperColors(state.baseAxes);
    const baseAxisMaterials = Array.isArray(state.baseAxes.material) ? state.baseAxes.material : [state.baseAxes.material];
    baseAxisMaterials.forEach((material) => {
        material.depthTest = false;
        material.transparent = true;
    });
    state.baseAxes.renderOrder = 20;
    state.scene.add(state.baseAxes);
    addGridLabels();
}

function preventMiddleButtonAutoscroll(event) {
    if (event.button === 1) event.preventDefault();
}

function getSimulationSnapModels() {
    return state.models.filter((model) => model.userData.uploaded
        && model.userData.placement === 'scene'
        && model.visible !== false);
}

function getSimulationSnapMeshes() {
    const meshes = [];
    getSimulationSnapModels().forEach((model) => model.traverse((child) => {
        if (child.isMesh && child.visible !== false && child.geometry?.getAttribute('position')) meshes.push(child);
    }));
    return meshes;
}

function buildSimulationSnapCandidates() {
    const meshes = getSimulationSnapMeshes();
    const signature = meshes.map((mesh) => `${mesh.uuid}:${mesh.geometry.uuid}`).join('|');
    if (signature === state.snapCandidateModelsSignature && state.snapCandidates.length) return meshes;
    state.snapCandidateModelsSignature = signature;
    state.snapCandidates = [];
    meshes.forEach((mesh) => {
        try {
            const result = buildStepSnapCandidates(mesh.geometry, {
                maxVirtualPairs: 6000,
                maxVirtualCandidates: 160,
                maxPerType: {
                    endpoint: 2500,
                    vertex: 4000,
                    'edge-midpoint': 4000,
                    'face-center': 1200,
                    'circle-center': 1000,
                    'shape-center': 10,
                    'virtual-intersection': 160
                }
            });
            result.candidates.forEach((candidate) => state.snapCandidates.push({
                type: candidate.type,
                mesh,
                localPoint: new THREE.Vector3().fromArray(candidate.point)
            }));
        } catch (error) {
            console.warn('Snap candidate generation failed:', mesh.name, error);
        }
    });
    return meshes;
}

function snapTypeInfo(type) {
    return SNAP_TYPES[type] || SNAP_TYPES.vertex;
}

function hideSimulationSnapMarker() {
    state.snapHover = null;
    el.snapMarker?.classList.add('hidden');
}

function isSimulationSnapCandidateVisible(candidate, projected, meshes) {
    state.snapVisibilityRaycaster.setFromCamera(new THREE.Vector2(projected.x, projected.y), state.camera);
    const frontHit = state.snapVisibilityRaycaster.intersectObjects(meshes, false)[0] || null;
    if (!frontHit) return true;
    const candidateDistance = state.camera.position.distanceTo(candidate.worldPoint);
    const viewportHeight = Math.max(state.renderer.domElement.clientHeight, 1);
    const worldUnitsPerPixel = (
        2 * candidateDistance * Math.tan(THREE.MathUtils.degToRad(state.camera.fov * 0.5))
    ) / viewportHeight;
    return candidateDistance <= frontHit.distance + Math.max(worldUnitsPerPixel * 2.5, 0.001);
}

function findSimulationSnapAtPointer(pointerEvent) {
    const meshes = buildSimulationSnapCandidates();
    if (!meshes.length || !state.snapCandidates.length) return null;
    state.scene.updateMatrixWorld(true);
    const bounds = state.renderer.domElement.getBoundingClientRect();
    const pointerX = pointerEvent.clientX - bounds.left;
    const pointerY = pointerEvent.clientY - bounds.top;
    const nearby = [];
    state.snapCandidates.forEach((candidate) => {
        if (!candidate.mesh.visible) return;
        const worldPoint = candidate.localPoint.clone().applyMatrix4(candidate.mesh.matrixWorld);
        const projected = worldPoint.clone().project(state.camera);
        if (projected.z < -1 || projected.z > 1) return;
        const screenX = (projected.x * 0.5 + 0.5) * bounds.width;
        const screenY = (-projected.y * 0.5 + 0.5) * bounds.height;
        const pixelDistance = Math.hypot(screenX - pointerX, screenY - pointerY);
        if (pixelDistance > SNAP_RADIUS_PX) return;
        nearby.push({
            ...candidate,
            worldPoint,
            projected,
            screenX,
            screenY,
            pixelDistance,
            cameraDistance: state.camera.position.distanceTo(worldPoint),
            score: pixelDistance + snapTypeInfo(candidate.type).priority * 0.08
        });
    });
    nearby.sort((left, right) => left.score - right.score || left.cameraDistance - right.cameraDistance);
    return nearby.find((candidate) => isSimulationSnapCandidateVisible(candidate, candidate.projected, meshes)) || null;
}

function showSimulationSnapMarker(snap) {
    if (!snap || !el.snapMarker) {
        hideSimulationSnapMarker();
        return;
    }
    state.snapHover = snap;
    const info = snapTypeInfo(snap.type);
    el.snapMarker.style.left = `${snap.screenX}px`;
    el.snapMarker.style.top = `${snap.screenY}px`;
    el.snapMarker.classList.toggle('label-left', snap.screenX > el.canvasContainer.clientWidth - 190);
    const symbol = el.snapMarker.querySelector('span');
    if (symbol) symbol.textContent = info.symbol;
    if (el.snapLabel) {
        el.snapLabel.textContent = `${uiText(info.label)} · X ${snap.worldPoint.x.toFixed(3)}, Y ${snap.worldPoint.y.toFixed(3)}, Z ${snap.worldPoint.z.toFixed(3)}`;
    }
    el.snapMarker.classList.remove('hidden');
}

function handleSimulationSnapPointerMove(event) {
    if (!state.snapMoveMode) return;
    showSimulationSnapMarker(findSimulationSnapAtPointer(event));
}

function moveRobotTcpToSimulationSnap(snap) {
    const robot = state.activeArticulatedModel;
    if (isMotionActive()) return false;
    if (!robot?.userData.tcpFrame) {
        setStatus('스냅 이동할 로봇을 먼저 선택하세요.', '#ef4444');
        return false;
    }
    const currentPose = getCurrentTcpPoseBase(robot);
    if (!currentPose) return false;
    robot.updateMatrixWorld(true);
    const target = {
        position: robot.worldToLocal(snap.worldPoint.clone()),
        quaternion: currentPose.quaternion.clone()
    };
    const previousAngles = robot.userData.joints.map((joint) => joint.angle);
    const previousTarget = robot.userData.baseJogTarget
        ? {
            position: robot.userData.baseJogTarget.position.clone(),
            quaternion: robot.userData.baseJogTarget.quaternion.clone()
        }
        : currentPose;
    const before = captureSceneSnapshot();
    const result = solveRobotIK(robot, target, {
        positionTolerance: 0.001,
        rotationTolerance: THREE.MathUtils.degToRad(0.001)
    });
    if (!result.success) {
        previousAngles.forEach((angle, index) => setJointAngle(robot.userData.joints[index], angle, false));
        robot.userData.baseJogTarget = previousTarget;
        robot.updateMatrixWorld(true);
        syncJointControls(robot);
        updateTcpPresentation(robot);
        setStatus('선택한 스냅 위치에 도달할 수 없습니다.', '#ef4444');
        return false;
    }
    robot.userData.baseJogTarget = target;
    syncJointControls(robot);
    updateTcpPresentation(robot, target);
    syncBaseJogGizmoFromRobot(robot, target);
    recordHistory('스냅 위치 이동', before, captureSceneSnapshot());
    setStatus('선택한 스냅 위치로 이동했습니다.', '#22c55e');
    return true;
}

function handleSimulationSnapClick(event) {
    if (!state.snapMoveMode || event.button !== 0) return;
    const snap = findSimulationSnapAtPointer(event);
    if (!snap) {
        setStatus('선택 가능한 스냅 지점을 가리켜 주세요.', '#f59e0b');
        return;
    }
    event.preventDefault();
    event.stopPropagation();
    if (moveRobotTcpToSimulationSnap(snap)) showSimulationSnapMarker(snap);
}

function updateSimulationSnapButton() {
    if (!el.btnSnapMove) return;
    const available = !isMotionActive();
    if (!available && state.snapMoveMode) {
        state.snapMoveMode = false;
        hideSimulationSnapMarker();
    }
    el.btnSnapMove.disabled = !available;
    el.btnSnapMove.classList.toggle('active', state.snapMoveMode);
    el.btnSnapMove.setAttribute('aria-pressed', String(state.snapMoveMode));
    el.btnSnapMove.title = uiText(state.snapMoveMode ? '스냅 이동 종료' : '스냅 이동');
}

function toggleSimulationSnapMoveMode() {
    if (isMotionActive()) return;
    state.snapMoveMode = !state.snapMoveMode;
    if (state.snapMoveMode) {
        clearJogModeSelectionForSnap();
        buildSimulationSnapCandidates();
        setStatus('3D 모델링의 스냅 지점을 클릭하세요.', '#60a5fa');
    } else {
        hideSimulationSnapMarker();
        setStatus('스냅 이동을 종료했습니다.', '#22c55e');
    }
    updateSimulationSnapButton();
}

function addGridLabels() {
    const intervals = [500, 1000, 1500, 2000, 3000, 4000, 5000];
    const labelColor = '#94a3b8';
    intervals.forEach(val => {
        state.labels.push(createLabel(`${val}mm`, val, 0, 5, labelColor));
        state.labels.push(createLabel(`-${val}mm`, -val, 0, 5, labelColor));
        state.labels.push(createLabel(`${val}mm`, 0, val, 5, labelColor));
        state.labels.push(createLabel(`-${val}mm`, 0, -val, 5, labelColor));
    });
    state.labels.push(createLabel('X+', 335, 0, 28, AXIS_COLORS.x, 82, 41));
    state.labels.push(createLabel('Y+', 0, 335, 28, AXIS_COLORS.y, 82, 41));
    state.labels.push(createLabel('Z+', 0, 0, 335, AXIS_COLORS.z, 82, 41));
    state.labels.forEach(l => state.scene.add(l));
}

function createLabel(text, x, y, z, color, width = 160, height = 80) {
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
    sprite.scale.set(width, height, 1);
    return sprite;
}

function setupLights() {
    state.scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    const dir = new THREE.DirectionalLight(0xffffff, 1.25);
    dir.position.set(1500, -1000, 2500);
    dir.castShadow = true;
    state.scene.add(dir);
    const dir2 = new THREE.DirectionalLight(0xffffff, 0.5);
    dir2.position.set(-1500, 1200, 1000);
    state.scene.add(dir2);
}

function setupControls() {
    state.controls = new OrbitControls(state.camera, state.renderer.domElement);
    state.controls.enableDamping = false;

    state.transformControls = new TransformControls(state.camera, state.renderer.domElement);
    state.transformControls.addEventListener('dragging-changed', (event) => {
        state.controls.enabled = !event.value;
    });
    state.transformControls.addEventListener('mouseDown', () => {
        if (!state.historySuspended && state.selectedModel) {
            state.pendingTransformHistory = captureSceneSnapshot();
        }
    });
    state.transformControls.addEventListener('mouseUp', () => {
        commitPendingHistory('모델 변환', 'pendingTransformHistory');
    });
    state.transformControls.addEventListener('objectChange', updateSelectedModelTransformInputs);
    removeRotationScreenHandle(state.transformControls);
    applyTransformControlColors(state.transformControls);
    state.transformControls.visible = false;
    state.transformControls.enabled = false;
    state.scene.add(state.transformControls);

    setupBaseJogTransformControls();
}

function setupBaseJogTransformControls() {
    const target = new THREE.Object3D();
    target.name = 'Base JOG TCP Target';
    state.baseJogGizmoTarget = target;

    const controls = new TransformControls(state.camera, state.renderer.domElement);
    controls.setMode(state.baseJogGizmoMode);
    controls.setSpace('local');
    controls.visible = false;
    controls.enabled = false;
    controls.userData.baseJogActiveAxis = null;
    controls.addEventListener('dragging-changed', (event) => {
        state.controls.enabled = !event.value;
        if (!event.value) controls.userData.baseJogActiveAxis = null;
    });
    controls.addEventListener('mouseDown', () => {
        controls.userData.baseJogActiveAxis = controls.axis;
    });
    controls.addEventListener('mouseDown', beginBaseJogGizmoDrag);
    controls.addEventListener('objectChange', applyBaseJogGizmoTarget);
    controls.addEventListener('mouseUp', endBaseJogGizmoDrag);
    controls.addEventListener('mouseUp', () => {
        controls.userData.baseJogActiveAxis = null;
    });
    removeRotationScreenHandle(controls);
    emphasizeBaseJogTransformControls(controls);
    applyTransformControlColors(controls);
    state.baseJogTransformControls = controls;
    state.scene.add(controls);
}

const wheelStepTimers = new WeakMap();

function enableHalfStepWheel(input, onStart = null, onEnd = null) {
    if (!input) return;
    input.step = '0.5';
    input.addEventListener('wheel', (event) => {
        event.preventDefault();
        input.focus({ preventScroll: true });
        onStart?.();
        const current = Number.isFinite(input.valueAsNumber) ? input.valueAsNumber : 0;
        const minimum = input.min === '' ? -Infinity : Number(input.min);
        const maximum = input.max === '' ? Infinity : Number(input.max);
        const next = THREE.MathUtils.clamp(current + (event.deltaY < 0 ? 0.5 : -0.5), minimum, maximum);
        input.value = String(Number(next.toFixed(6)));
        input.dispatchEvent(new Event('input', { bubbles: true }));
        window.clearTimeout(wheelStepTimers.get(input));
        wheelStepTimers.set(input, window.setTimeout(() => {
            wheelStepTimers.delete(input);
            onEnd?.();
        }, 180));
    }, { passive: false });
}

function setupEventListeners() {
    window.addEventListener('resize', onResize);
    document.addEventListener('pointermove', handleFullscreenUiPointerMove);
    document.addEventListener('inorobot:i18nready', refreshLocalizedControls);
    document.addEventListener('inorobot:languagechange', refreshLocalizedControls);
    el.modelSelect.addEventListener('change', async (e) => {
        const file = e.target.value;
        if (!file) return;
        const model = state.catalog.get(file);
        if (model) await loadModelFromServer(model);
    });

    el.btnFullscreenMode?.addEventListener('click', () => setFullscreenUiMode(!state.fullscreenUiMode));
    el.btnPositionExport?.addEventListener('click', exportPositionPoints);
    el.btnSnapMove?.addEventListener('click', toggleSimulationSnapMoveMode);
    state.renderer.domElement.addEventListener('pointermove', handleSimulationSnapPointerMove);
    state.renderer.domElement.addEventListener('pointerleave', hideSimulationSnapMarker);
    state.renderer.domElement.addEventListener('click', handleSimulationSnapClick);
    el.btnImport3D?.addEventListener('click', () => el.inputImport3D?.click());
    el.inputImport3D?.addEventListener('change', () => {
        const file = el.inputImport3D.files?.[0];
        el.inputImport3D.value = '';
        if (file) openImportDialog(file);
    });
    el.btnCloseImport?.addEventListener('click', closeImportDialog);
    el.btnCancelImport?.addEventListener('click', closeImportDialog);
    el.btnConfirmImport?.addEventListener('click', handle3DImport);
    el.importDialog?.addEventListener('cancel', (event) => {
        event.preventDefault();
        closeImportDialog();
    });

    el.modelTree?.addEventListener('click', (event) => {
        const button = event.target.closest('[data-model-tree-id]');
        if (!button) return;
        commitPendingHistory('수치 모델 변환', 'pendingNumericHistory');
        const model = state.models.find((candidate) => candidate.userData.modelTreeId === button.dataset.modelTreeId);
        if (model) selectSceneModel(model);
    });
    el.transformModeButtons.forEach((button) => {
        button.addEventListener('click', () => toggleSelectedTransformMode(button.dataset.transformMode));
    });
    const numericInputs = [...Object.values(el.modelPositionInputs), ...Object.values(el.modelRotationInputs)];
    numericInputs.forEach((input) => {
        input?.addEventListener('focus', beginNumericTransformHistory);
        input?.addEventListener('input', applySelectedModelNumericTransform);
        input?.addEventListener('keydown', (event) => {
            if (event.key !== 'Enter') return;
            event.preventDefault();
            event.currentTarget.blur();
        });
        enableHalfStepWheel(
            input,
            beginNumericTransformHistory,
            () => commitPendingHistory('수치 모델 변환', 'pendingNumericHistory')
        );
    });
    el.modelNumericTransform?.addEventListener('focusout', (event) => {
        if (event.relatedTarget && el.modelNumericTransform.contains(event.relatedTarget)) return;
        commitPendingHistory('수치 모델 변환', 'pendingNumericHistory');
        updateSelectedModelTransformInputs();
    });

    document.querySelectorAll('[data-panel-action]').forEach((button) => {
        button.addEventListener('click', () => handlePanelAction(button.dataset.panelAction, button.dataset.panelId));
    });
    document.querySelectorAll('[data-panel-toggle]').forEach((button) => {
        button.addEventListener('click', () => togglePanelVisibility(button.dataset.panelToggle));
    });
    el.btnUndo?.addEventListener('click', undoLastAction);
    el.btnRedo?.addEventListener('click', redoLastAction);
    [el.modelBrowserPanel, el.jogPanel, el.virtualControllerPanel, el.programPanel].forEach(makePanelDraggable);
    [el.modelBrowserPanel, el.jogPanel, el.virtualControllerPanel, el.programPanel].forEach(makePanelEdgeResizable);

    el.virtualControllerRobot?.addEventListener('change', () => {
        if (isVirtualControllerActive()) return;
        state.virtualController.targetRobotId = el.virtualControllerRobot.value || null;
        state.virtualController.samples?.clear();
        refreshVirtualControllerUi();
    });
    el.virtualControllerSource?.addEventListener('change', () => {
        if (isVirtualControllerActive()) return;
        state.virtualController.source = el.virtualControllerSource.value === 'trace' ? 'trace' : 'bridge';
        state.virtualController.samples?.clear();
        refreshVirtualControllerUi();
    });
    el.btnVirtualControllerConnect?.addEventListener('click', () => {
        if (state.virtualController.wanted) disconnectVirtualController();
        else void connectVirtualController();
    });
    el.btnVirtualControllerBridgeStart?.addEventListener('click', launchVirtualControllerBridge);
    el.btnVirtualControllerBridgeStop?.addEventListener('click', () => void stopVirtualControllerBridge());

    el.programRobotList?.addEventListener('click', handleProgramRobotListClick);
    el.programRobotList?.addEventListener('change', handleProgramRobotListChange);
    el.programStepList?.addEventListener('click', handleProgramStepListClick);
    el.programStepList?.addEventListener('change', handleProgramStepListChange);
    el.programStepList?.addEventListener('contextmenu', handleProgramStepContextMenu);
    el.programStepList?.addEventListener('dragstart', handleProgramStepDragStart);
    el.programStepList?.addEventListener('dragover', handleProgramStepDragOver);
    el.programStepList?.addEventListener('drop', handleProgramStepDrop);
    el.programStepList?.addEventListener('dragend', handleProgramStepDragEnd);
    el.btnProgramSelectAll?.addEventListener('click', toggleAllProgramRobots);
    el.btnProgramAdd?.addEventListener('click', addCurrentMotionStep);
    el.btnProgramAddDelay?.addEventListener('click', addDelayMotionStep);
    el.btnProgramAddTimeStart?.addEventListener('click', () => addTimerMotionStep('TIME_START'));
    el.btnProgramAddTimeOut?.addEventListener('click', () => addTimerMotionStep('TIME_OUT'));
    el.btnProgramUpdate?.addEventListener('click', updateSelectedMotionStep);
    el.btnProgramDelete?.addEventListener('click', deleteSelectedMotionStep);
    el.btnProgramStepRobot?.addEventListener('click', stepIntoActiveRobot);
    el.btnProgramRunRobot?.addEventListener('click', runActiveRobotProgram);
    el.btnProgramPauseRobot?.addEventListener('click', pauseActiveRobotMotion);
    el.btnProgramStopRobot?.addEventListener('click', stopActiveRobotMotion);
    el.btnProgramStepGroup?.addEventListener('click', stepIntoCheckedRobots);
    el.btnProgramRunGroup?.addEventListener('click', runCheckedRobotPrograms);
    el.btnProgramPauseGroup?.addEventListener('click', pauseCheckedRobotMotions);
    el.btnProgramStopGroup?.addEventListener('click', stopCheckedRobotMotions);
    el.programRepeatButtons.forEach((button) => button.addEventListener('click', updateMotionRepeat));
    el.btnProgramExport?.addEventListener('click', exportMotionProject);
    el.btnProgramImport?.addEventListener('click', () => el.inputProgramImport?.click());
    el.inputProgramImport?.addEventListener('change', handleMotionProjectImport);
    el.btnProgramShowPositionValue?.addEventListener('click', openContextProgramPointPosition);
    el.btnClosePositionValue?.addEventListener('click', closePositionValueDialog);
    el.btnCancelPositionValue?.addEventListener('click', closePositionValueDialog);
    el.btnApplyPositionValue?.addEventListener('click', applyPositionValueDialog);
    el.positionValueDialog?.addEventListener('cancel', (event) => {
        event.preventDefault();
        closePositionValueDialog();
    });
    document.addEventListener('pointerdown', (event) => {
        if (!el.programStepContextMenu || el.programStepContextMenu.classList.contains('hidden')) return;
        if (!el.programStepContextMenu.contains(event.target)) closeProgramStepContextMenu();
    });

    el.btnResetJoints?.addEventListener('click', () => {
        stopBaseJogHold();
        if (state.activeArticulatedModel) {
            const before = captureSceneSnapshot();
            resetArticulatedJoints(state.activeArticulatedModel);
            recordHistory('관절 원점 복귀', before, captureSceneSnapshot());
        }
    });

    el.btnJogJointMode?.addEventListener('click', () => {
        stopBaseJogHold();
        setJogMode('joint');
    });
    el.btnJogBaseMode?.addEventListener('click', () => {
        setJogMode('base');
    });
    el.btnBaseGizmoTranslate?.addEventListener('click', () => setBaseJogGizmoMode('translate'));
    el.btnBaseGizmoRotate?.addEventListener('click', () => setBaseJogGizmoMode('rotate'));
    enableHalfStepWheel(el.baseMoveStep);
    enableHalfStepWheel(el.baseRotateStep);
    Object.values(el.tcpReadouts).forEach((input) => {
        input?.addEventListener('focus', beginBaseJogNumericHistory);
        input?.addEventListener('input', applyBaseJogNumericTarget);
        input?.addEventListener('keydown', (event) => {
            if (event.key !== 'Enter') return;
            event.preventDefault();
            event.currentTarget.blur();
        });
        input?.addEventListener('blur', finishBaseJogNumericHistory);
        enableHalfStepWheel(input, beginBaseJogNumericHistory, finishBaseJogNumericHistory);
    });
    document.querySelectorAll('[data-base-jog]').forEach((button) => {
        button.addEventListener('pointerdown', (event) => {
            if (event.pointerType === 'mouse' && event.button !== 0) return;
            event.preventDefault();
            startBaseJogHold(button, event.pointerId);
        });
        button.addEventListener('pointermove', (event) => {
            const hold = state.baseJogHold;
            if (!hold || hold.button !== button || hold.pointerId !== event.pointerId) return;
            const rect = button.getBoundingClientRect();
            const outside = event.clientX < rect.left || event.clientX > rect.right
                || event.clientY < rect.top || event.clientY > rect.bottom;
            if (outside) stopBaseJogHold(event.pointerId);
        });
        button.addEventListener('pointercancel', (event) => stopBaseJogHold(event.pointerId));
        button.addEventListener('lostpointercapture', (event) => stopBaseJogHold(event.pointerId));
        button.addEventListener('click', (event) => {
            if (event.detail === 0) runBaseJogButton(button);
        });
    });
    window.addEventListener('pointerup', (event) => stopBaseJogHold(event.pointerId));
    window.addEventListener('blur', () => stopBaseJogHold());
    
    el.btnResetView.addEventListener('click', fitCamera);
    el.btnToggleGrid.addEventListener('click', () => {
        state.grid.visible = !state.grid.visible;
        state.baseAxes.visible = state.grid.visible;
        state.labels.forEach(l => l.visible = state.grid.visible);
        el.btnToggleGrid.classList.toggle('active', state.grid.visible);
    });

    el.btnToggleTransform?.addEventListener('click', () => {
        if (isMotionActive()) return;
        setTransformHandlesEnabled(!state.transformControls.enabled);
    });

    window.addEventListener('keydown', handleGlobalKeyDown);

    const btnDown = document.getElementById('btn-download-cad');
    if (btnDown) {
        btnDown.addEventListener('click', handleCADDownload);
    }

    window.addEventListener('beforeunload', () => {
        closeVirtualControllerSocket(false);
        saveMotionProjectNow();
        [...state.panelWindows.keys()].forEach((panelId) => restorePanelFromWindow(panelId, true));
    });
}

function setFullscreenUiMode(enabled) {
    state.fullscreenUiMode = enabled;
    ['fullscreenTopbarHideTimer', 'fullscreenStatsBarHideTimer'].forEach((key) => {
        window.clearTimeout(state[key]);
        state[key] = null;
    });
    document.body.classList.toggle('fullscreen-ui-mode', enabled);
    document.body.classList.remove('fullscreen-topbar-revealed', 'fullscreen-statsbar-revealed');
    updateFullscreenModeButton();
    requestAnimationFrame(() => requestAnimationFrame(onResize));
    if (enabled) revealFullscreenBar('top');
}

function updateFullscreenModeButton() {
    if (!el.btnFullscreenMode) return;
    const label = uiText(state.fullscreenUiMode ? '전체 화면 모드 종료' : '전체 화면 모드');
    el.btnFullscreenMode.title = label;
    el.btnFullscreenMode.setAttribute('aria-label', label);
    el.btnFullscreenMode.setAttribute('aria-pressed', String(state.fullscreenUiMode));
    el.btnFullscreenMode.innerHTML = `<i class="fa-solid fa-${state.fullscreenUiMode ? 'compress' : 'expand'}"></i>`;
}

function revealFullscreenBar(edge) {
    if (!state.fullscreenUiMode) return;
    const isTop = edge === 'top';
    const timerKey = isTop ? 'fullscreenTopbarHideTimer' : 'fullscreenStatsBarHideTimer';
    const className = isTop ? 'fullscreen-topbar-revealed' : 'fullscreen-statsbar-revealed';
    window.clearTimeout(state[timerKey]);
    state[timerKey] = null;
    document.body.classList.add(className);
}

function scheduleFullscreenBarHide(edge) {
    if (!state.fullscreenUiMode) return;
    const isTop = edge === 'top';
    const timerKey = isTop ? 'fullscreenTopbarHideTimer' : 'fullscreenStatsBarHideTimer';
    const className = isTop ? 'fullscreen-topbar-revealed' : 'fullscreen-statsbar-revealed';
    window.clearTimeout(state[timerKey]);
    state[timerKey] = window.setTimeout(() => {
        document.body.classList.remove(className);
        state[timerKey] = null;
    }, 250);
}

function handleFullscreenUiPointerMove(event) {
    if (!state.fullscreenUiMode) return;
    const topbar = document.getElementById('topbar');
    const statsBar = document.getElementById('stats-bar');
    const nearTop = event.clientY <= (topbar?.offsetHeight || 0) + 16;
    const nearBottom = event.clientY >= window.innerHeight - (statsBar?.offsetHeight || 0) - 16;
    if (nearTop) revealFullscreenBar('top');
    else scheduleFullscreenBarHide('top');
    if (nearBottom) revealFullscreenBar('bottom');
    else scheduleFullscreenBarHide('bottom');
}

function handleGlobalKeyDown(event) {
    const shortcut = event.ctrlKey || event.metaKey;
    const key = event.key.toLowerCase();
    if (event.key === 'Escape' && state.fullscreenUiMode) {
        setFullscreenUiMode(false);
        return;
    }
    if (shortcut && !event.altKey && (key === 'z' || key === 'y')) {
        event.preventDefault();
        if (key === 'y' || (key === 'z' && event.shiftKey)) redoLastAction();
        else undoLastAction();
        return;
    }

    const target = event.target;
    const isEditing = target?.isContentEditable || ['INPUT', 'SELECT', 'TEXTAREA'].includes(target?.tagName);
    if (isEditing || el.importDialog?.open) return;
    if (isMotionActive()) return;

    const mode = { w: 'translate', e: 'rotate', r: 'scale' }[key];
    if (mode && state.selectedModel) {
        event.preventDefault();
        toggleSelectedTransformMode(mode);
        return;
    }
    if ((event.key === 'Delete' || event.key === 'Backspace') && state.selectedModel) {
        event.preventDefault();
        deleteSelectedModel();
    }
}

function removeRotationScreenHandle(transformControls) {
    const nonAxisRotationHandleNames = new Set(['E', 'XYZE']);
    const handles = [];
    transformControls.traverse((object) => {
        if (nonAxisRotationHandleNames.has(object.name)) handles.push(object);
    });
    handles.forEach((handle) => handle.removeFromParent());
    transformControls.userData.removedScreenRotationHandles = handles.length;
}

function createPolylineCurve(points, closed) {
    const pathPoints = points.reduce((result, point) => {
        if (!result.length || result.at(-1).distanceTo(point) > 1e-8) result.push(point.clone());
        return result;
    }, []);
    if (closed && pathPoints.length > 2 && pathPoints[0].distanceTo(pathPoints.at(-1)) < 1e-8) {
        pathPoints.pop();
    }
    if (closed && pathPoints.length > 2) pathPoints.push(pathPoints[0].clone());

    const cumulativeLengths = [0];
    for (let index = 1; index < pathPoints.length; index += 1) {
        cumulativeLengths.push(
            cumulativeLengths[index - 1] + pathPoints[index - 1].distanceTo(pathPoints[index])
        );
    }
    const totalLength = cumulativeLengths.at(-1);
    if (!Number.isFinite(totalLength) || totalLength <= Number.EPSILON) return null;

    const curve = new THREE.Curve();
    curve.getPoint = (t, target = new THREE.Vector3()) => {
        const distance = THREE.MathUtils.clamp(t, 0, 1) * totalLength;
        let segment = 1;
        while (segment < cumulativeLengths.length - 1 && cumulativeLengths[segment] < distance) {
            segment += 1;
        }
        const startDistance = cumulativeLengths[segment - 1];
        const segmentLength = cumulativeLengths[segment] - startDistance;
        const ratio = segmentLength > Number.EPSILON ? (distance - startDistance) / segmentLength : 0;
        return target.copy(pathPoints[segment - 1]).lerp(pathPoints[segment], ratio);
    };
    return curve;
}

function createBaseJogHandleStroke(lineHandle, radius = BASE_JOG_GIZMO_STROKE_RADIUS) {
    const position = lineHandle.geometry?.getAttribute('position');
    if (!position || position.count < 2 || lineHandle.isLineSegments) return null;

    let points = Array.from({ length: position.count }, (_, index) => (
        new THREE.Vector3(position.getX(index), position.getY(index), position.getZ(index))
    ));
    let geometry;

    if (points.length === 2) {
        const direction = points[1].clone().sub(points[0]);
        const length = direction.length();
        if (length <= Number.EPSILON) return null;
        const midpoint = points[0].clone().add(points[1]).multiplyScalar(0.5);
        const orientation = new THREE.Quaternion().setFromUnitVectors(
            new THREE.Vector3(0, 1, 0),
            direction.normalize()
        );
        geometry = new THREE.CylinderGeometry(
            radius,
            radius,
            length,
            10
        );
        geometry.applyMatrix4(new THREE.Matrix4().compose(
            midpoint,
            orientation,
            new THREE.Vector3(1, 1, 1)
        ));
    } else {
        const closed = lineHandle.isLineLoop || points[0].distanceTo(points.at(-1)) < 1e-5;
        if (closed && points.length > 3 && points[0].distanceTo(points.at(-1)) < 1e-5) {
            points = points.slice(0, -1);
        }
        const curve = createPolylineCurve(points, closed);
        if (!curve) return null;
        geometry = new THREE.TubeGeometry(
            curve,
            Math.max(24, points.length * 2),
            radius,
            8,
            closed
        );
    }

    const sourceMaterial = Array.isArray(lineHandle.material)
        ? lineHandle.material[0]
        : lineHandle.material;
    const stroke = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({
        color: sourceMaterial?.color?.clone() || 0xffffff,
        opacity: sourceMaterial?.opacity ?? 1,
        transparent: true,
        depthTest: sourceMaterial?.depthTest ?? false,
        depthWrite: false,
        toneMapped: false
    }));
    stroke.name = lineHandle.name;
    stroke.renderOrder = lineHandle.renderOrder;
    stroke.userData.baseJogHandleStroke = true;
    stroke.userData.baseJogVisibleOpacity = sourceMaterial?.opacity ?? 1;
    return stroke;
}

function configureBaseJogActiveStroke(stroke, transformControls) {
    stroke.userData.baseJogActiveStroke = true;
    stroke.renderOrder += 1;
    stroke.onBeforeRender = function () {
        const activeAxis = transformControls.userData.baseJogActiveAxis;
        this.material.opacity = activeAxis === this.name
            ? this.userData.baseJogVisibleOpacity
            : 0;
    };
}

function isNegativeBaseJogArrow(object) {
    if (!object.isMesh || !['X', 'Y', 'Z'].includes(object.name) || !object.geometry) return false;
    if (object.tag === 'bwd') return true;
    if (!['CylinderGeometry', 'ConeGeometry'].includes(object.geometry.type)) return false;

    object.geometry.computeBoundingBox();
    const bounds = object.geometry.boundingBox;
    if (!bounds) return false;
    const size = bounds.getSize(new THREE.Vector3());
    if (Math.max(size.x, size.y, size.z) > 0.35) return false;
    object.updateMatrix();
    const center = bounds.getCenter(new THREE.Vector3()).applyMatrix4(object.matrix);
    const axisCenter = object.name === 'X' ? center.x : object.name === 'Y' ? center.y : center.z;
    return axisCenter < 0.5;
}

function emphasizeBaseJogTransformControls(transformControls) {
    const axisNames = new Set(['X', 'Y', 'Z']);
    const lineHandles = [];
    const infiniteGuideHandles = [];
    const negativeArrowHandles = [];
    transformControls.setSize(BASE_JOG_GIZMO_SIZE);

    transformControls.traverse((object) => {
        if (!axisNames.has(object.name)) return;

        const materials = Array.isArray(object.material) ? object.material : [object.material];
        materials.forEach((material) => {
            if (material && 'linewidth' in material) material.linewidth = 3;
        });

        if (isNegativeBaseJogArrow(object)) {
            negativeArrowHandles.push(object);
            return;
        }
        if (object.isLine) {
            object.geometry?.computeBoundingBox();
            const lineSize = object.geometry?.boundingBox?.getSize(new THREE.Vector3());
            const scaledSpan = lineSize
                ? Math.max(
                    lineSize.x * Math.abs(object.scale.x),
                    lineSize.y * Math.abs(object.scale.y),
                    lineSize.z * Math.abs(object.scale.z)
                )
                : 0;
            if (object.tag === 'helper' || scaledSpan > BASE_JOG_MAX_VISIBLE_LINE_SPAN) {
                infiniteGuideHandles.push(object);
                return;
            }
            lineHandles.push(object);
            return;
        }
        if (!object.isMesh
            || !object.geometry
            || object.geometry.type === 'TorusGeometry'
            || object.userData.baseJogHandleThickened) return;

        object.geometry.computeBoundingBox();
        const size = object.geometry.boundingBox?.getSize(new THREE.Vector3());
        if (!size) return;
        const dimensions = [size.x, size.y, size.z];
        const longestAxis = dimensions.indexOf(Math.max(...dimensions));
        const sortedDimensions = [...dimensions].sort((left, right) => right - left);
        if (sortedDimensions[0] <= Number.EPSILON
            || sortedDimensions[0] < sortedDimensions[1] * 1.35) return;

        const scale = [
            BASE_JOG_GIZMO_MESH_THICKNESS,
            BASE_JOG_GIZMO_MESH_THICKNESS,
            BASE_JOG_GIZMO_MESH_THICKNESS
        ];
        scale[longestAxis] = 1;
        const thickenedGeometry = object.geometry.clone();
        thickenedGeometry.scale(scale[0], scale[1], scale[2]);
        object.geometry = thickenedGeometry;
        object.userData.baseJogHandleThickened = true;
    });

    infiniteGuideHandles.forEach((guideHandle) => guideHandle.removeFromParent());
    transformControls.userData.removedBaseJogInfiniteGuides = infiniteGuideHandles.length;
    negativeArrowHandles.forEach((arrowHandle) => arrowHandle.removeFromParent());
    transformControls.userData.removedBaseJogNegativeArrows = negativeArrowHandles.length;
    lineHandles.forEach((lineHandle) => {
        const stroke = createBaseJogHandleStroke(lineHandle);
        if (stroke) lineHandle.parent?.add(stroke);
        const activeStroke = createBaseJogHandleStroke(lineHandle, BASE_JOG_GIZMO_ACTIVE_STROKE_RADIUS);
        if (activeStroke) {
            configureBaseJogActiveStroke(activeStroke, transformControls);
            lineHandle.parent?.add(activeStroke);
        }
    });
}

function applyAxesHelperColors(helper) {
    helper.setColors(
        new THREE.Color(AXIS_COLORS.x),
        new THREE.Color(AXIS_COLORS.y),
        new THREE.Color(AXIS_COLORS.z)
    );
}

function getTransformHandleColorKey(handleName, activeAxis = '') {
    const fixedColors = {
        X: 'x', Y: 'y', Z: 'z',
        YZ: 'x', XZ: 'y', XY: 'z',
        XYZ: 'z'
    };
    if (fixedColors[handleName]) return fixedColors[handleName];
    if (['AXIS', 'START', 'END', 'DELTA'].includes(handleName)) {
        const active = String(activeAxis).toUpperCase();
        return fixedColors[active] || (active.includes('X') ? 'x' : active.includes('Y') ? 'y' : 'z');
    }
    return null;
}

function applyTransformControlColors(transformControls) {
    transformControls.traverse((object) => {
        const initialColorKey = getTransformHandleColorKey(object.name, transformControls.axis);
        if (!initialColorKey) return;
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        const colorize = () => {
            const colorKey = getTransformHandleColorKey(object.name, transformControls.axis) || initialColorKey;
            const color = new THREE.Color(AXIS_COLORS[colorKey]);
            if (transformControls.userData.baseJogActiveAxis === object.name) {
                color.multiplyScalar(BASE_JOG_GIZMO_ACTIVE_COLOR_SCALE);
            }
            materials.forEach((material) => material?.color?.copy(color));
        };
        colorize();
        const previousBeforeRender = object.onBeforeRender;
        object.onBeforeRender = function (...args) {
            previousBeforeRender?.apply(this, args);
            colorize();
        };
    });
}

function captureSceneSnapshot() {
    const currentModels = new Set(state.models);
    return {
        models: state.models.map((model) => ({
            model,
            host: currentModels.has(model.userData.attachmentHost) ? model.userData.attachmentHost : null,
            position: model.position.toArray(),
            quaternion: model.quaternion.toArray(),
            scale: model.scale.toArray()
        })),
        joints: state.models
            .filter((model) => model.userData.joints)
            .map((robot) => ({
                robot,
                angles: robot.userData.joints.map((joint) => joint.angle)
            })),
        selectedModel: currentModels.has(state.selectedModel) ? state.selectedModel : null,
        activeArticulatedModel: currentModels.has(state.activeArticulatedModel) ? state.activeArticulatedModel : null,
        activeProgramRobot: currentModels.has(state.activeProgramRobot) ? state.activeProgramRobot : null,
        motionRepeatRobot: state.motionRepeatRobot,
        motionRepeat: state.motionRepeat,
        motionPrograms: getArticulatedRobots().map((robot) => ({
            robot,
            program: cloneMotionProgram(ensureMotionProgram(robot))
        }))
    };
}

function numberArraysEqual(a, b, epsilon = 1e-7) {
    return a.length === b.length && a.every((value, index) => Math.abs(value - b[index]) <= epsilon);
}

function sceneSnapshotsEqual(a, b) {
    if (!a || !b || a.models.length !== b.models.length || a.joints.length !== b.joints.length) return false;
    for (let index = 0; index < a.models.length; index += 1) {
        const left = a.models[index];
        const right = b.models[index];
        if (left.model !== right.model || left.host !== right.host) return false;
        if (!numberArraysEqual(left.position, right.position)
            || !numberArraysEqual(left.quaternion, right.quaternion)
            || !numberArraysEqual(left.scale, right.scale)) return false;
    }
    for (let index = 0; index < a.joints.length; index += 1) {
        if (a.joints[index].robot !== b.joints[index].robot
            || !numberArraysEqual(a.joints[index].angles, b.joints[index].angles)) return false;
    }
    if (a.selectedModel !== b.selectedModel
        || a.activeArticulatedModel !== b.activeArticulatedModel
        || a.activeProgramRobot !== b.activeProgramRobot
        || Boolean(a.motionRepeatRobot) !== Boolean(b.motionRepeatRobot)
        || Boolean(a.motionRepeat) !== Boolean(b.motionRepeat)) return false;
    const leftPrograms = (a.motionPrograms || []).map(({ robot, program }) => ({
        instanceId: robot.userData.motionInstanceId,
        program
    }));
    const rightPrograms = (b.motionPrograms || []).map(({ robot, program }) => ({
        instanceId: robot.userData.motionInstanceId,
        program
    }));
    return JSON.stringify(leftPrograms) === JSON.stringify(rightPrograms);
}

function applySceneSnapshot(snapshot) {
    if (!snapshot) return;
    state.historySuspended = true;
    setTransformHandlesEnabled(false);
    setBaseJogGizmoEnabled(false);

    const allModels = new Set([
        ...state.models,
        ...snapshot.models.map((entry) => entry.model)
    ]);
    allModels.forEach((model) => model.removeFromParent());

    state.models = snapshot.models.map((entry) => entry.model);
    snapshot.models.forEach((entry) => {
        entry.model.position.fromArray(entry.position);
        entry.model.quaternion.fromArray(entry.quaternion);
        entry.model.scale.fromArray(entry.scale);
        if (entry.host?.userData.tcpFrame && state.models.includes(entry.host)) {
            entry.host.userData.tcpFrame.add(entry.model);
            entry.model.userData.attachmentHost = entry.host;
        } else {
            state.scene.add(entry.model);
        }
    });

    snapshot.joints.forEach(({ robot, angles }) => {
        angles.forEach((angle, index) => setJointAngle(robot.userData.joints[index], angle, false));
        syncJointControls(robot);
        robot.updateMatrixWorld(true);
        captureCurrentTcpTarget(robot);
    });

    state.activeArticulatedModel = state.models.includes(snapshot.activeArticulatedModel)
        ? snapshot.activeArticulatedModel
        : [...state.models].reverse().find((model) => model.userData.tcpFrame) || null;
    state.motionPrograms = new Map((snapshot.motionPrograms || [])
        .filter(({ robot }) => state.models.includes(robot))
        .map(({ robot, program }) => [robot.userData.motionInstanceId, cloneMotionProgram(program)]));
    getArticulatedRobots().forEach((robot) => ensureMotionProgram(robot));
    state.motionRepeatRobot = Boolean(snapshot.motionRepeatRobot);
    state.motionRepeat = Boolean(snapshot.motionRepeat);
    state.activeProgramRobot = state.models.includes(snapshot.activeProgramRobot)
        ? snapshot.activeProgramRobot
        : state.activeArticulatedModel;
    syncMotionRepeatControl();
    if (state.activeArticulatedModel) renderJogControls(state.activeArticulatedModel);
    else hideJogPanel();

    updateUIStatus();
    selectSceneModel(state.models.includes(snapshot.selectedModel) ? snapshot.selectedModel : null);
    renderMotionProgramPanel();
    scheduleMotionProjectSave();
    state.historySuspended = false;
}

function updateHistoryButtons() {
    const locked = isMotionActive();
    if (el.btnUndo) {
        el.btnUndo.disabled = locked || state.undoStack.length === 0;
        el.btnUndo.title = state.undoStack.length
            ? uiFormat('되돌리기: {action} (Ctrl+Z)', {
                action: uiText(state.undoStack[state.undoStack.length - 1].label)
            })
            : uiText('되돌리기 (Ctrl+Z)');
    }
    if (el.btnRedo) {
        el.btnRedo.disabled = locked || state.redoStack.length === 0;
        el.btnRedo.title = state.redoStack.length
            ? uiFormat('다시 실행: {action} (Ctrl+Y)', {
                action: uiText(state.redoStack[state.redoStack.length - 1].label)
            })
            : uiText('다시 실행 (Ctrl+Y)');
    }
}

function recordHistory(label, before, after) {
    if (state.historySuspended || !before || !after || sceneSnapshotsEqual(before, after)) return;
    state.undoStack.push({ label, before, after });
    if (state.undoStack.length > 100) state.undoStack.shift();
    state.redoStack = [];
    updateHistoryButtons();
    scheduleMotionProjectSave();
}

function commitPendingHistory(label, stateKey) {
    const before = state[stateKey];
    state[stateKey] = null;
    if (before) recordHistory(label, before, captureSceneSnapshot());
}

function commitAllPendingHistories() {
    stopBaseJogHold();
    endBaseJogGizmoDrag();
    commitPendingHistory('수치 모델 변환', 'pendingNumericHistory');
    commitPendingHistory('모델 변환', 'pendingTransformHistory');
    commitPendingHistory('관절 JOG', 'pendingJointHistory');
    commitPendingHistory('Base JOG', 'pendingBaseJogHistory');
    commitPendingHistory('Base 3D JOG', 'pendingBaseJogGizmoHistory');
    commitPendingHistory('Base 좌표 입력', 'pendingBaseJogNumericHistory');
}

function undoLastAction() {
    if (isMotionActive()) return;
    commitAllPendingHistories();
    const entry = state.undoStack.pop();
    if (!entry) return;
    applySceneSnapshot(entry.before);
    state.redoStack.push(entry);
    updateHistoryButtons();
    setStatus('되돌리기: {action}', '#60a5fa', { action: uiText(entry.label) });
}

function redoLastAction() {
    if (isMotionActive()) return;
    commitAllPendingHistories();
    const entry = state.redoStack.pop();
    if (!entry) return;
    applySceneSnapshot(entry.after);
    state.undoStack.push(entry);
    updateHistoryButtons();
    setStatus('다시 실행: {action}', '#60a5fa', { action: uiText(entry.label) });
}

function getPanelElement(panelId) {
    return {
        'model-browser-panel': el.modelBrowserPanel,
        'jog-panel': el.jogPanel,
        'virtual-controller-panel': el.virtualControllerPanel,
        'program-panel': el.programPanel
    }[panelId] || null;
}

function updatePanelLauncher(panelId) {
    const panel = getPanelElement(panelId);
    const button = document.querySelector(`[data-panel-toggle="${panelId}"]`);
    if (!panel || !button) return;
    const unavailable = (panelId === 'jog-panel' && !state.activeArticulatedModel)
        || (panelId === 'virtual-controller-panel' && getArticulatedRobots().length === 0)
        || (panelId === 'program-panel' && getArticulatedRobots().length === 0);
    button.disabled = unavailable;
    button.classList.toggle('active', !unavailable && !panel.classList.contains('panel-user-hidden'));
}

function togglePanelVisibility(panelId) {
    const panel = getPanelElement(panelId);
    if (!panel) return;
    const popupRecord = state.panelWindows.get(panelId);
    if (popupRecord && !popupRecord.popup.closed) {
        popupRecord.popup.focus();
        return;
    }
    panel.classList.toggle('panel-user-hidden');
    if (panelId === 'model-browser-panel' && panel.classList.contains('panel-user-hidden')) {
        setTransformHandlesEnabled(false);
    }
    if (panelId === 'jog-panel') {
        const isHidden = panel.classList.contains('panel-user-hidden');
        setBaseJogGizmoEnabled(!isHidden && !el.baseJogView?.classList.contains('hidden'));
    }
    updatePanelLauncher(panelId);
    if (panelId === 'virtual-controller-panel' && !panel.classList.contains('panel-user-hidden')) {
        monitorVirtualControllerBridgeHealth(true);
    }
}

function handlePanelAction(action, panelId) {
    const panel = getPanelElement(panelId);
    if (!panel) return;
    if (action === 'popout') {
        popOutPanel(panelId);
    } else if (action === 'hide') {
        if (state.panelWindows.has(panelId)) restorePanelFromWindow(panelId, true);
        panel.classList.add('panel-user-hidden');
        if (panelId === 'model-browser-panel') setTransformHandlesEnabled(false);
        if (panelId === 'jog-panel') setBaseJogGizmoEnabled(false);
        updatePanelLauncher(panelId);
    }
}

function popOutPanel(panelId) {
    const panel = getPanelElement(panelId);
    if (!panel) return;
    const existing = state.panelWindows.get(panelId);
    if (existing && !existing.popup.closed) {
        existing.popup.focus();
        return;
    }

    const popup = window.open('', `InoRobot-${panelId}`, 'popup=yes,width=380,height=760,resizable=yes');
    if (!popup) {
        setStatus('팝업이 차단되었습니다. 패널 분리를 위해 팝업을 허용하세요.', '#ef4444');
        return;
    }

    popup.document.open();
    popup.document.write(`<!doctype html><html><head><meta charset="UTF-8"><title>${getPanelWindowTitle(panelId)}</title></head><body></body></html>`);
    popup.document.close();
    document.querySelectorAll('link[rel="stylesheet"]').forEach((source) => {
        const link = popup.document.createElement('link');
        link.rel = 'stylesheet';
        link.href = source.href;
        popup.document.head.appendChild(link);
    });
    popup.document.body.className = 'panel-popout-body';
    popup.addEventListener('keydown', handleGlobalKeyDown);

    const placeholder = document.createComment(`${panelId} placeholder`);
    panel.parentNode.insertBefore(placeholder, panel);
    const savedStyle = panel.getAttribute('style') || '';
    panel.removeAttribute('style');
    panel.removeAttribute('data-resize-edge');
    panel.classList.remove('panel-user-hidden');
    panel.classList.add('panel-popout');
    popup.document.body.appendChild(panel);

    const record = { popup, panel, placeholder, savedStyle, restoring: false };
    state.panelWindows.set(panelId, record);
    popup.addEventListener('beforeunload', () => restorePanelFromWindow(panelId, false));
    updatePanelLauncher(panelId);
}

function getPanelWindowTitle(panelId) {
    const panelName = panelId === 'program-panel'
        ? uiText('Program Panel')
        : panelId === 'virtual-controller-panel'
            ? uiText('가상 컨트롤러')
        : panelId === 'model-browser-panel'
            ? uiText('모델 트리')
            : uiText('JOG Panel');
    return `3D Simulation - ${panelName}`;
}

function restorePanelFromWindow(panelId, closePopup = false) {
    const record = state.panelWindows.get(panelId);
    if (!record || record.restoring) return;
    record.restoring = true;
    state.panelWindows.delete(panelId);

    if (record.placeholder.parentNode) {
        record.placeholder.parentNode.insertBefore(record.panel, record.placeholder);
        record.placeholder.remove();
    }
    record.panel.classList.remove('panel-popout');
    if (record.savedStyle) record.panel.setAttribute('style', record.savedStyle);
    else record.panel.removeAttribute('style');

    if (closePopup && !record.popup.closed) record.popup.close();
    updatePanelLauncher(panelId);
}

function makePanelDraggable(panel) {
    if (!panel) return;
    let drag = null;
    panel.classList.add('panel-drag-anywhere');
    panel.addEventListener('pointerdown', (event) => {
        if (panel.ownerDocument !== document || event.button !== 0
            || getPanelResizeEdge(panel, event.clientX, event.clientY)
            || event.target.closest(PANEL_DRAG_EXCLUDED_SELECTOR)) return;
        const canvasRect = el.canvasContainer.getBoundingClientRect();
        const panelRect = panel.getBoundingClientRect();
        drag = {
            pointerId: event.pointerId,
            offsetX: event.clientX - panelRect.left,
            offsetY: event.clientY - panelRect.top,
            canvasRect
        };
        panel.classList.add('panel-is-dragging');
        panel.setPointerCapture(event.pointerId);
        event.preventDefault();
    });
    panel.addEventListener('pointermove', (event) => {
        if (!drag || drag.pointerId !== event.pointerId) return;
        const maxLeft = Math.max(0, drag.canvasRect.width - panel.offsetWidth);
        const maxTop = Math.max(0, drag.canvasRect.height - panel.offsetHeight);
        const left = THREE.MathUtils.clamp(event.clientX - drag.canvasRect.left - drag.offsetX, 0, maxLeft);
        const top = THREE.MathUtils.clamp(event.clientY - drag.canvasRect.top - drag.offsetY, 0, maxTop);
        panel.style.left = `${left}px`;
        panel.style.top = `${top}px`;
        panel.style.right = 'auto';
        panel.style.bottom = 'auto';
        panel.style.transform = 'none';
    });
    const stopDrag = (event) => {
        if (!drag || (event.pointerId !== undefined && drag.pointerId !== event.pointerId)) return;
        drag = null;
        panel.classList.remove('panel-is-dragging');
    };
    panel.addEventListener('pointerup', stopDrag);
    panel.addEventListener('pointercancel', stopDrag);
    panel.addEventListener('lostpointercapture', stopDrag);
}

function getPanelResizeEdge(panel, clientX, clientY) {
    const rect = panel.getBoundingClientRect();
    const horizontal = clientX - rect.left <= PANEL_RESIZE_EDGE_SIZE
        ? 'w'
        : rect.right - clientX <= PANEL_RESIZE_EDGE_SIZE
            ? 'e'
            : '';
    const vertical = clientY - rect.top <= PANEL_RESIZE_EDGE_SIZE
        ? 'n'
        : rect.bottom - clientY <= PANEL_RESIZE_EDGE_SIZE
            ? 's'
            : '';
    return `${vertical}${horizontal}`;
}

function normalizePanelResizeBox(panel) {
    if (!panel || panel.ownerDocument !== document) return null;
    const canvasRect = el.canvasContainer.getBoundingClientRect();
    const panelRect = panel.getBoundingClientRect();
    const minimum = PANEL_MINIMUM_SIZES[panel.id] || { width: 220, height: 180 };
    const maxWidth = Math.max(1, canvasRect.width);
    const maxHeight = Math.max(1, canvasRect.height);
    const minWidth = Math.min(minimum.width, maxWidth);
    const minHeight = Math.min(minimum.height, maxHeight);
    const width = THREE.MathUtils.clamp(panelRect.width, minWidth, maxWidth);
    const height = THREE.MathUtils.clamp(panelRect.height, minHeight, maxHeight);
    const left = THREE.MathUtils.clamp(panelRect.left - canvasRect.left, 0, Math.max(0, canvasRect.width - width));
    const top = THREE.MathUtils.clamp(panelRect.top - canvasRect.top, 0, Math.max(0, canvasRect.height - height));

    panel.style.left = `${left}px`;
    panel.style.top = `${top}px`;
    panel.style.right = 'auto';
    panel.style.bottom = 'auto';
    panel.style.width = `${width}px`;
    panel.style.height = `${height}px`;
    panel.style.maxHeight = 'none';
    panel.style.transform = 'none';
    panel.classList.add('panel-edge-resized');
    if (panel === el.programPanel) panel.classList.add('program-panel-resized');
    panel.dataset.userResized = 'true';
    return {
        left,
        top,
        width,
        height,
        minWidth,
        minHeight,
        canvasWidth: canvasRect.width,
        canvasHeight: canvasRect.height
    };
}

function makePanelEdgeResizable(panel) {
    if (!panel) return;
    let resize = null;
    panel.classList.add('panel-edge-resizable');

    panel.addEventListener('pointerdown', (event) => {
        if (panel.ownerDocument !== document || event.button !== 0) return;
        const edge = getPanelResizeEdge(panel, event.clientX, event.clientY);
        if (!edge) return;
        const box = normalizePanelResizeBox(panel);
        if (!box) return;
        resize = {
            pointerId: event.pointerId,
            edge,
            startX: event.clientX,
            startY: event.clientY,
            startRight: box.left + box.width,
            startBottom: box.top + box.height,
            ...box
        };
        panel.dataset.resizeEdge = edge;
        panel.setPointerCapture(event.pointerId);
        event.preventDefault();
        event.stopPropagation();
    }, { capture: true });

    panel.addEventListener('pointermove', (event) => {
        if (!resize || resize.pointerId !== event.pointerId) {
            if (panel.ownerDocument === document) {
                const edge = getPanelResizeEdge(panel, event.clientX, event.clientY);
                if (edge) panel.dataset.resizeEdge = edge;
                else panel.removeAttribute('data-resize-edge');
            }
            return;
        }
        const deltaX = event.clientX - resize.startX;
        const deltaY = event.clientY - resize.startY;
        let { left, top, width, height } = resize;
        if (resize.edge.includes('w')) {
            left = THREE.MathUtils.clamp(resize.left + deltaX, 0, resize.startRight - resize.minWidth);
            width = resize.startRight - left;
        } else if (resize.edge.includes('e')) {
            width = THREE.MathUtils.clamp(resize.width + deltaX, resize.minWidth, resize.canvasWidth - resize.left);
        }
        if (resize.edge.includes('n')) {
            top = THREE.MathUtils.clamp(resize.top + deltaY, 0, resize.startBottom - resize.minHeight);
            height = resize.startBottom - top;
        } else if (resize.edge.includes('s')) {
            height = THREE.MathUtils.clamp(resize.height + deltaY, resize.minHeight, resize.canvasHeight - resize.top);
        }
        panel.style.left = `${left}px`;
        panel.style.top = `${top}px`;
        panel.style.width = `${width}px`;
        panel.style.height = `${height}px`;
    });

    const stopResize = (event) => {
        if (!resize || (event.pointerId !== undefined && resize.pointerId !== event.pointerId)) return;
        resize = null;
        panel.removeAttribute('data-resize-edge');
    };
    panel.addEventListener('pointerup', stopResize);
    panel.addEventListener('pointercancel', stopResize);
    panel.addEventListener('lostpointercapture', stopResize);
    panel.addEventListener('pointerleave', () => {
        if (!resize) panel.removeAttribute('data-resize-edge');
    });
}

function ensureModelTreeId(model) {
    if (!model.userData.modelTreeId) {
        state.modelTreeIdCounter += 1;
        model.userData.modelTreeId = `scene-model-${state.modelTreeIdCounter}`;
    }
    return model.userData.modelTreeId;
}

function getModelTreeMeta(model) {
    if (model.userData.placement === 'tcp') {
        return { kind: 'TOOL', className: 'tool', icon: 'fa-screwdriver-wrench' };
    }
    if (model.userData.uploaded) {
        return { kind: '3D 모델링', className: '3d-model', icon: 'fa-cubes-stacked' };
    }
    if (model.userData.tcpFrame) {
        return { kind: 'ROBOT', className: 'robot', icon: 'fa-robot' };
    }
    return { kind: 'MODEL', className: 'model', icon: 'fa-cube' };
}

function formatRobotPanelName(name) {
    const value = String(name || '').trim();
    const match = value.match(/^(.*?)\s*#(\d+)\s*$/);
    return match ? `#${match[2]} ${match[1].trim()}` : value;
}

function createModelTreeNode(model) {
    const treeId = ensureModelTreeId(model);
    const meta = getModelTreeMeta(model);
    const item = document.createElement('li');
    item.className = 'model-tree-node';
    item.setAttribute('role', 'treeitem');
    item.setAttribute('aria-selected', String(model === state.selectedModel));

    const button = document.createElement('button');
    button.type = 'button';
    button.className = `model-tree-button${model === state.selectedModel ? ' active' : ''}`;
    button.classList.add(`model-tree-button-${meta.className}`);
    button.dataset.modelTreeId = treeId;
    const displayName = formatRobotPanelName(model.userData.motionDisplayName || model.userData.modelName || model.name || uiText('MODEL'));
    button.title = `${displayName} ${uiText('선택')}`;

    const icon = document.createElement('span');
    icon.className = 'model-tree-icon';
    icon.innerHTML = `<i class="fa-solid ${meta.icon}"></i>`;

    const name = document.createElement('span');
    name.className = 'model-tree-name';
    name.textContent = displayName;

    const kind = document.createElement('span');
    kind.className = 'model-tree-kind';
    kind.textContent = uiText(meta.kind);

    button.append(icon, name, kind);
    item.appendChild(button);

    const children = state.models.filter((candidate) => candidate.userData.attachmentHost === model);
    if (children.length > 0) {
        const childList = document.createElement('ul');
        childList.className = 'model-tree-children';
        childList.setAttribute('role', 'group');
        children.forEach((child) => childList.appendChild(createModelTreeNode(child)));
        item.appendChild(childList);
    }
    return item;
}

function renderModelTree() {
    if (!el.modelTree) return;
    el.modelTree.replaceChildren();
    el.modelTreeCount.textContent = String(state.models.length);

    if (state.models.length === 0) {
        const empty = document.createElement('p');
        empty.className = 'model-tree-empty';
        empty.textContent = uiText('불러온 모델이 없습니다.');
        el.modelTree.appendChild(empty);
        return;
    }

    const topLevelModels = state.models.filter((model) => {
        const host = model.userData.attachmentHost;
        return !host || !state.models.includes(host);
    });
    const list = document.createElement('ul');
    list.className = 'model-tree-list';
    list.setAttribute('role', 'group');
    topLevelModels.forEach((model) => list.appendChild(createModelTreeNode(model)));
    el.modelTree.appendChild(list);
}

function formatTransformNumber(value) {
    if (Math.abs(value) < 0.0005) return '0';
    return String(Number(value.toFixed(3)));
}

function updateSelectedModelTransformInputs() {
    const model = state.selectedModel;
    if (!model) return;
    const isScaleMode = state.transformControls?.mode === 'scale';
    if (el.modelNumericTransformTitle) el.modelNumericTransformTitle.textContent = uiText(isScaleMode ? 'SCALE' : 'POSITION');
    if (el.modelNumericTransformUnit) el.modelNumericTransformUnit.textContent = isScaleMode ? '×' : 'mm';
    ['x', 'y', 'z'].forEach((axis) => {
        const input = el.modelPositionInputs[axis];
        input.value = formatTransformNumber(isScaleMode ? model.scale[axis] : model.position[axis]);
        input.min = isScaleMode ? '0.001' : '';
        input.step = isScaleMode ? '0.01' : '0.5';
        el.modelRotationInputs[axis].value = formatTransformNumber(
            normalizeDegrees(THREE.MathUtils.radToDeg(model.rotation[axis]))
        );
    });
}

function updateTransformModeButtons(mode = state.transformControls?.mode || 'translate') {
    const activeMode = state.transformControls?.enabled ? mode : null;
    el.transformModeButtons.forEach((button) => {
        const isActive = button.dataset.transformMode === activeMode;
        button.classList.toggle('active', isActive);
        button.setAttribute('aria-pressed', String(isActive));
    });
}

function attachTransformControlsToSelectedModel() {
    const model = state.selectedModel;
    if (!model) {
        state.transformControls.detach();
        return;
    }
    state.transformControls.setSpace(model.userData.placement === 'tcp' ? 'local' : 'world');
    state.transformControls.attach(model);
}

function setTransformHandlesEnabled(enabled) {
    const shouldEnable = Boolean(enabled && state.selectedModel);
    if (shouldEnable) setBaseJogGizmoEnabled(false);
    state.transformControls.visible = shouldEnable;
    state.transformControls.enabled = shouldEnable;
    if (shouldEnable) attachTransformControlsToSelectedModel();
    else state.transformControls.detach();
    el.btnToggleTransform?.classList.toggle('active', shouldEnable);
    el.btnToggleTransform?.setAttribute('aria-pressed', String(shouldEnable));
    updateTransformModeButtons();
}

function setSelectedTransformMode(mode, refreshNumeric = true) {
    if (!['translate', 'rotate', 'scale'].includes(mode) || !state.selectedModel) return;
    state.transformControls.setMode(mode);
    if (state.transformControls.enabled) attachTransformControlsToSelectedModel();
    updateTransformModeButtons(mode);
    if (refreshNumeric) updateSelectedModelTransformInputs();
}

function toggleSelectedTransformMode(mode) {
    if (!['translate', 'rotate', 'scale'].includes(mode) || !state.selectedModel || isMotionActive()) return;
    if (state.transformControls.enabled && state.transformControls.mode === mode) {
        setTransformHandlesEnabled(false);
        return;
    }
    setSelectedTransformMode(mode);
    setTransformHandlesEnabled(true);
}

function selectSceneModel(model) {
    if (isMotionActive()) return;
    if (model && !state.models.includes(model)) return;
    state.selectedModel = model || null;
    renderModelTree();

    if (!state.selectedModel) {
        setTransformHandlesEnabled(false);
        el.modelTransformPanel.classList.add('hidden');
        return;
    }

    el.modelTransformPanel.classList.remove('hidden');
    setTransformHandlesEnabled(false);
    el.selectedModelName.textContent = model.userData.motionDisplayName || model.userData.modelName || model.name || uiText('Unnamed model');
    if (model.userData.tcpFrame && state.activeArticulatedModel !== model) {
        state.activeArticulatedModel = model;
        renderJogControls(model);
    }
    if (model.userData.tcpFrame) {
        state.activeProgramRobot = model;
        state.virtualController.targetRobotId = model.userData.motionInstanceId;
        refreshVirtualControllerUi();
        renderMotionProgramPanel();
    }
    setSelectedTransformMode('translate');
}

function beginNumericTransformHistory() {
    if (!state.historySuspended && !state.pendingNumericHistory && state.selectedModel) {
        state.pendingNumericHistory = captureSceneSnapshot();
    }
}

function applySelectedModelNumericTransform(event) {
    if (isMotionActive()) return;
    const model = state.selectedModel;
    if (!model) return;
    beginNumericTransformHistory();

    const positionEntry = Object.entries(el.modelPositionInputs)
        .find(([, input]) => input === event?.currentTarget);
    const rotationEntry = Object.entries(el.modelRotationInputs)
        .find(([, input]) => input === event?.currentTarget);
    const entry = positionEntry || rotationEntry;
    if (!entry) return;
    const [axis, input] = entry;
    const rawValue = input.value.trim();
    if (!rawValue || ['-', '.', '-.'].includes(rawValue)) return;
    const value = Number(rawValue);
    if (!Number.isFinite(value)) return;

    const isScaleMode = state.transformControls?.mode === 'scale';
    if (positionEntry && isScaleMode) {
        if (value <= 0) return;
        model.scale[axis] = value;
    } else if (positionEntry) {
        model.position[axis] = value;
    } else {
        model.rotation[axis] = THREE.MathUtils.degToRad(value);
    }
    model.updateMatrixWorld(true);
    setSelectedTransformMode(rotationEntry ? 'rotate' : isScaleMode ? 'scale' : 'translate', false);
    setStatus('모델 변환이 적용되었습니다.', '#22c55e');
}

async function loadModelFromServer(modelDefinition) {
    if (isMotionActive()) return;
    const { file, folder, name, type = 'fbx' } = modelDefinition;
    setTransformHandlesEnabled(false);
    setBaseJogGizmoEnabled(false);
    commitAllPendingHistories();
    const historyBefore = captureSceneSnapshot();
    showLoading(true, uiFormat('{name} 불러오는 중...', { name }));
    setStatus('불러오는 중', '#f59e0b');
    const isAddMode = el.btnAddMode && el.btnAddMode.checked;

    // If not in Add Mode, clean up previous models
    if (!isAddMode) {
        cleanupScene();
    }

    try {
        const model = type === 'articulated-stl'
            ? await loadArticulatedRobot(modelDefinition, (p) => showLoading(true, uiFormat('로봇 링크: {progress}%', { progress: p })))
            : await loadFBX(`./models/${file}`, (p) => showLoading(true, uiFormat('모델: {progress}%', { progress: p })));

        if (type !== 'articulated-stl') {
            const rotFix = MODEL_ROTATION_FIX[name];
            if (rotFix && rotFix.z) model.rotateZ(rotFix.z);

            applyFBXMaterial(model);

        // Highpower FBX has wrong UnitScaleFactor (2.54/inches) → scale up to match Standard (360/16.10)
        if (file.includes('Highpower')) {
            model.scale.multiplyScalar(360 / 16.10);
        }

        // R16/R25 FBX files are authored in inches (UnitScaleFactor 2.54); convert to mm.
        const unitScaleFix = MODEL_UNIT_SCALE_FIX[file];
        if (unitScaleFix) {
            model.scale.multiplyScalar(unitScaleFix);
        }

        // Auto-scale (skip for IRCB501 controllers — natural scale is correct after correction)
        const box = new THREE.Box3().setFromObject(model);
        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);
        if (!file.includes('IRCB501')) {
            if (maxDim > 0 && maxDim < 15) model.scale.multiplyScalar(1000);
            else if (maxDim >= 15 && maxDim < 500) model.scale.multiplyScalar(10);
        }
        }

        // Name it for CAD download mapping later
        model.userData.modelName = model.userData.robotName || name;

        // Spread models a bit if adding
        if (isAddMode && state.models.length > 0) {
            model.position.y += (state.models.length * 600);
        }

        if (type === 'articulated-stl') {
            assignRobotInstanceMetadata(model, modelDefinition);
            ensureMotionProgram(model);
        }

        state.models.push(model);
        state.scene.add(model);
        if (type === 'articulated-stl') attachPendingToolModels(model);
        ensureModelTreeId(model);

        if (type === 'articulated-stl') {
            state.activeArticulatedModel = model;
            state.activeProgramRobot = model;
            renderJogControls(model);
            showMotionProgramPanel();
        } else {
            state.activeArticulatedModel = null;
            hideJogPanel();
        }

        updateUIStatus();
        selectSceneModel(model);
        renderMotionProgramPanel();
        recordHistory('모델 불러오기', historyBefore, captureSceneSnapshot());
        showLoading(false);
        if(!isAddMode) fitCamera();
    } catch (err) {
        console.error('Load failed:', err);
        applySceneSnapshot(historyBefore);
        setStatus('오류', '#ef4444');
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

async function loadArticulatedRobot(modelDefinition, onProgress) {
    const manifest = createRobotManifest(modelDefinition);
    const baseUrl = `./models/${modelDefinition.folder}/`;
    const meshDefinitions = [manifest.base, ...manifest.joints, ...(manifest.tube ? [manifest.tube] : [])];
    let loadedCount = 0;

    const geometries = await Promise.all(meshDefinitions.map(async (definition) => {
        const geometry = definition.mesh ? await loadSTL(`${baseUrl}${definition.mesh}`) : null;
        loadedCount += 1;
        if (onProgress) onProgress(Math.round((loadedCount / meshDefinitions.length) * 100));
        return geometry;
    }));

    const robot = new THREE.Group();
    robot.name = manifest.name;
    robot.userData.robotName = manifest.name;
    robot.userData.manifest = manifest;
    robot.userData.joints = [];

    const baseMesh = createSTLMesh(geometries[0], manifest.base);
    robot.add(baseMesh);
    if (manifest.tube) {
        const tubeGeometry = geometries[manifest.joints.length + 1];
        const tubeMesh = createScaraTubeMesh(tubeGeometry, manifest.tube);
        robot.add(tubeMesh);
        robot.userData.scaraTube = tubeMesh;
    }
    if (manifest.robotType === 'scara' && manifest.kinematicVariant !== 'ceiling-scara') {
        geometries[0].computeBoundingBox();
        const mountingSurfaceOffset = Math.max(0, -(geometries[0].boundingBox?.min.z || 0));
        robot.position.z = mountingSurfaceOffset;
        robot.userData.baseElevation = mountingSurfaceOffset;
    }

    let parent = robot;
    let parentPivot = new THREE.Vector3();

    manifest.joints.forEach((jointDefinition, index) => {
        const pivot = new THREE.Vector3().fromArray(jointDefinition.pivot);
        const direction = Math.sign(jointDefinition.direction ?? manifest.jointDirection ?? 1) || 1;
        const jointGroup = new THREE.Group();
        jointGroup.name = jointDefinition.name;
        jointGroup.position.copy(pivot).sub(parentPivot);
        parent.add(jointGroup);

        const geometry = geometries[index + 1];
        if (geometry) {
            const linkMesh = createSTLMesh(geometry, jointDefinition);
            linkMesh.position.copy(pivot).multiplyScalar(-1);
            jointGroup.add(linkMesh);
        }

        const joint = {
            definition: jointDefinition,
            group: jointGroup,
            axis: new THREE.Vector3().fromArray(jointDefinition.axis).normalize().multiplyScalar(direction),
            basePosition: jointGroup.position.clone(),
            angle: 0,
            control: null,
            robot
        };
        robot.userData.joints.push(joint);

        parent = jointGroup;
        parentPivot = pivot;
    });

    const tcpPosition = new THREE.Vector3().fromArray(manifest.tcp || parentPivot.toArray());
    const tcpFrame = new THREE.Group();
    tcpFrame.name = 'TCP';
    tcpFrame.position.copy(tcpPosition).sub(parentPivot);

    if (manifest.toolAxes) {
        const toolX = new THREE.Vector3().fromArray(manifest.toolAxes.x).normalize();
        const toolY = new THREE.Vector3().fromArray(manifest.toolAxes.y).normalize();
        const toolZ = new THREE.Vector3().fromArray(manifest.toolAxes.z).normalize();
        const orthogonality = Math.max(
            Math.abs(toolX.dot(toolY)),
            Math.abs(toolY.dot(toolZ)),
            Math.abs(toolZ.dot(toolX))
        );
        const handedness = toolX.clone().cross(toolY).dot(toolZ);
        if (orthogonality > 1e-5 || handedness < 0.99999) {
            throw new Error('Robot toolAxes must define an orthogonal right-handed coordinate system.');
        }
        tcpFrame.quaternion.setFromRotationMatrix(
            new THREE.Matrix4().makeBasis(toolX, toolY, toolZ)
        );
    }
    robot.userData.toolHomeQuaternion = tcpFrame.quaternion.clone();

    parent.add(tcpFrame);
    robot.userData.tcpFrame = tcpFrame;

    const toolAxesAtTcp = new THREE.AxesHelper(110);
    toolAxesAtTcp.name = 'Tool axes at TCP';
    applyAxesHelperColors(toolAxesAtTcp);
    const axesMaterials = Array.isArray(toolAxesAtTcp.material) ? toolAxesAtTcp.material : [toolAxesAtTcp.material];
    axesMaterials.forEach((material) => {
        material.depthTest = false;
        material.transparent = true;
    });
    toolAxesAtTcp.renderOrder = 20;
    tcpFrame.add(toolAxesAtTcp);
    robot.userData.toolAxesAtTcp = toolAxesAtTcp;

    return robot;
}

function createRobotManifest(modelDefinition) {
    const {
        name,
        robotType,
        kinematicVariant = 'standard',
        structure,
        limits,
        jointSpeeds,
        jointAccelerations,
        jointDecelerations,
        cartesianMotion,
        j3Mesh = false
    } = modelDefinition;
    if (!Array.isArray(structure) || !Array.isArray(limits) || !Array.isArray(jointSpeeds)) {
        throw new Error(`Robot kinematics are missing for ${name}.`);
    }
    if (jointSpeeds.length !== limits.length || jointSpeeds.some((speed) => !Number.isFinite(speed) || speed <= 0)) {
        throw new Error(`Robot joint speeds are invalid for ${name}.`);
    }
    if (!Array.isArray(jointAccelerations)
        || jointAccelerations.length !== limits.length
        || jointAccelerations.some((acceleration) => !Number.isFinite(acceleration) || acceleration <= 0)) {
        throw new Error(`Robot joint accelerations are invalid for ${name}.`);
    }
    if (!Array.isArray(jointDecelerations)
        || jointDecelerations.length !== limits.length
        || jointDecelerations.some((deceleration) => !Number.isFinite(deceleration) || deceleration <= 0)) {
        throw new Error(`Robot joint decelerations are invalid for ${name}.`);
    }
    const cartesianFields = [
        'maxSpeed',
        'maxAcceleration',
        'maxRotationSpeed',
        'maxRotationAcceleration',
        'stopDeceleration',
        'rotationStopDeceleration'
    ];
    if (!cartesianMotion || cartesianFields.some((field) => (
        !Number.isFinite(cartesianMotion[field]) || cartesianMotion[field] <= 0
    ))) {
        throw new Error(`Robot Cartesian motion limits are invalid for ${name}.`);
    }
    const normalizedCartesianMotion = Object.fromEntries(
        cartesianFields.map((field) => [field, Number(cartesianMotion[field])])
    );

    const joint = (index, mesh, pivot, axis, extra = {}) => ({
        name: `J${index + 1}`,
        mesh,
        pivot,
        axis,
        min: limits[index][0],
        max: limits[index][1],
        maxSpeed: jointSpeeds[index],
        maxAcceleration: jointAccelerations[index],
        maxDeceleration: jointDecelerations[index],
        color: ROBOT_BODY_COLOR,
        ...extra
    });

    if (robotType === 'scara') {
        const [arm1, arm2] = structure;
        // TS4/TS5 are authored at a folded ceiling-mount zero pose. Their second
        // arm points back toward the base, placing J3/J4 at L1 - L2 instead of L1 + L2.
        const secondArmDirection = kinematicVariant === 'ceiling-scara' ? -1 : 1;
        const wrist = [arm1 + secondArmDirection * arm2, 0, 0];
        return {
            name,
            robotType,
            kinematicVariant,
            structure: [...structure],
            secondArmDirection,
            jointDirection: REVOLUTE_DIRECTION_POSITIVE,
            cartesianMotion: normalizedCartesianMotion,
            tcp: wrist,
            ikRotationAxes: ['z'],
            toolAxes: SCARA_TOOL_AXES,
            base: { name: 'P0', mesh: 'P0.stl', color: ROBOT_BODY_COLOR },
            tube: kinematicVariant === 'ceiling-scara'
                ? null
                : { name: 'CD conduit', mesh: 'TUBE.stl', color: '#292c2f' },
            joints: [
                joint(0, 'P1.stl', [0, 0, 0], [0, 0, 1]),
                joint(1, 'P2.stl', [arm1, 0, 0], [0, 0, 1]),
                joint(2, j3Mesh ? 'P3.stl' : null, wrist, [0, 0, 1], { type: 'prismatic', direction: CONTROLLER_PRISMATIC_DIRECTION }),
                joint(3, 'P4.stl', wrist, [0, 0, 1])
            ]
        };
    }

    const [shoulderOffset, upperArm, elbowOffset, forearm, wristLength, shoulderHeight] = structure;
    const elbowHeight = shoulderHeight + upperArm;
    const wristHeight = elbowHeight + elbowOffset;
    const tcp = [shoulderOffset + forearm + wristLength, 0, wristHeight];
    return {
        name,
        robotType,
        structure: [...structure],
        jointDirection: REVOLUTE_DIRECTION_NEGATIVE,
        cartesianMotion: normalizedCartesianMotion,
        tcp,
        ikRotationAxes: ['x', 'y', 'z'],
        toolAxes: SIX_AXIS_TOOL_AXES,
        base: { name: 'P0', mesh: 'P0.stl', color: ROBOT_BODY_COLOR },
        joints: [
            joint(0, 'P1.stl', [0, 0, 0], [0, 0, 1], { direction: REVOLUTE_DIRECTION_POSITIVE }),
            joint(1, 'P2.stl', [shoulderOffset, 0, shoulderHeight], [0, 1, 0]),
            joint(2, 'P3.stl', [shoulderOffset, 0, elbowHeight], [0, 1, 0]),
            joint(3, 'P4.stl', [shoulderOffset, 0, wristHeight], [1, 0, 0], { direction: REVOLUTE_DIRECTION_POSITIVE }),
            joint(4, 'P5.stl', [shoulderOffset + forearm, 0, wristHeight], [0, 1, 0]),
            joint(5, 'P6.stl', tcp, [1, 0, 0], { direction: REVOLUTE_DIRECTION_POSITIVE })
        ]
    };
}

function loadSTL(url) {
    if (!stlGeometryCache.has(url)) {
        const request = new Promise((resolve, reject) => {
            new STLLoader().load(url, resolve, undefined, reject);
        }).catch((error) => {
            stlGeometryCache.delete(url);
            throw error;
        });
        stlGeometryCache.set(url, request);
    }
    return stlGeometryCache.get(url);
}

function getFileExtension(fileName) {
    return fileName.split('.').pop()?.toLowerCase() || '';
}

function getArticulatedRobotForAttachment() {
    if (state.activeArticulatedModel?.userData.tcpFrame) return state.activeArticulatedModel;
    return [...state.models].reverse().find((model) => model.userData.tcpFrame) || null;
}

function openImportDialog(file) {
    const extension = getFileExtension(file.name);
    if (!SUPPORTED_IMPORT_EXTENSIONS.has(extension)) {
        alert(uiText('지원하지 않는 형식입니다. STL, FBX, OBJ, GLB, GLTF, STP, STEP 파일을 선택해 주세요.'));
        return;
    }

    state.pendingImportFile = file;
    el.importPlacement.value = 'scene';
    refreshImportPlacementOptions();

    if (el.importDialog.open) el.importDialog.close();
    el.importDialog.showModal();
}

function closeImportDialog() {
    if (el.importDialog?.open) el.importDialog.close();
    state.pendingImportFile = null;
}

function refreshImportPlacementOptions() {
    if (!el.importPlacement) return;
    const sceneOption = el.importPlacement.querySelector('option[value="scene"]');
    const tcpOption = el.importPlacement.querySelector('option[value="tcp"]');
    if (sceneOption) sceneOption.textContent = uiText('3D 모델링');
    if (tcpOption) {
        tcpOption.textContent = uiText('Tool');
        tcpOption.disabled = !getArticulatedRobotForAttachment();
        if (tcpOption.disabled && el.importPlacement.value === 'tcp') {
            el.importPlacement.value = 'scene';
        }
    }
}

function getAutomaticSourceUpAxis(extension) {
    return Y_UP_IMPORT_EXTENSIONS.has(extension) ? 'y' : 'z';
}

async function getOcctImporter() {
    if (typeof window.occtimportjs !== 'function') {
        throw new Error('OpenCascade STEP converter is not loaded.');
    }
    if (!state.occtImporterPromise) {
        state.occtImporterPromise = window.occtimportjs({
            locateFile: (fileName) => `${OCCT_IMPORT_BASE_URL}${fileName}`
        }).catch((error) => {
            state.occtImporterPromise = null;
            throw error;
        });
    }
    return state.occtImporterPromise;
}

function flattenOcctArray(array) {
    if (!array) return [];
    return Array.isArray(array[0]) ? array.flat() : array;
}

function occtColorToThree(color) {
    if (!Array.isArray(color) || color.length < 3) return new THREE.Color(0xbfc7d5);
    const divisor = Math.max(color[0], color[1], color[2]) > 1 ? 255 : 1;
    return new THREE.Color(color[0] / divisor, color[1] / divisor, color[2] / divisor);
}

function createObjectFromOcctResult(result) {
    if (!result?.success || !Array.isArray(result.meshes)) {
        throw new Error('OpenCascade could not convert this STEP file.');
    }

    const group = new THREE.Group();
    group.name = result.root?.name || 'STEP Assembly';
    const geometryBuckets = new Map();
    result.meshes.forEach((meshDefinition) => {
        const positions = flattenOcctArray(meshDefinition.attributes?.position?.array);
        const indices = flattenOcctArray(meshDefinition.index?.array);
        if (positions.length < 9 || indices.length < 3) return;

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geometry.setIndex(indices);
        const normals = flattenOcctArray(meshDefinition.attributes?.normal?.array);
        if (normals.length === positions.length) {
            geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
        } else {
            geometry.computeVertexNormals();
        }
        const color = occtColorToThree(meshDefinition.color);
        const colorKey = `${color.r.toFixed(5)},${color.g.toFixed(5)},${color.b.toFixed(5)}`;
        if (!geometryBuckets.has(colorKey)) geometryBuckets.set(colorKey, { color, geometries: [] });
        geometryBuckets.get(colorKey).geometries.push(geometry);
    });

    [...geometryBuckets.values()].forEach((bucket, index) => {
        const geometry = bucket.geometries.length === 1
            ? bucket.geometries[0]
            : mergeGeometries(bucket.geometries, false);
        if (!geometry) throw new Error('Failed to merge STEP mesh geometry.');
        if (bucket.geometries.length > 1) bucket.geometries.forEach((source) => source.dispose());
        geometry.computeBoundingBox();
        geometry.computeBoundingSphere();

        const material = new THREE.MeshStandardMaterial({
            color: bucket.color,
            roughness: 0.58,
            metalness: 0.16
        });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.name = `STEP Surface ${index + 1}`;
        group.add(mesh);
    });

    if (group.children.length === 0) throw new Error('The STEP file contains no triangulated mesh.');
    return group;
}

async function parseStepFile(file) {
    const occt = await getOcctImporter();
    const fileBuffer = new Uint8Array(await file.arrayBuffer());
    const result = occt.ReadStepFile(fileBuffer, {
        linearUnit: 'millimeter',
        linearDeflectionType: 'bounding_box_ratio',
        linearDeflection: 0.001,
        angularDeflection: 0.5
    });
    return createObjectFromOcctResult(result);
}

async function parseUploaded3DFile(file, extension) {
    if (extension === 'stl') {
        const geometry = new STLLoader().parse(await file.arrayBuffer());
        if (!geometry.getAttribute('normal')) geometry.computeVertexNormals();
        return new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({
            color: 0xbfc7d5,
            roughness: 0.6,
            metalness: 0.15
        }));
    }
    if (extension === 'fbx') {
        return new FBXLoader().parse(await file.arrayBuffer(), '');
    }
    if (extension === 'obj') {
        return new OBJLoader().parse(await file.text());
    }
    if (extension === 'glb' || extension === 'gltf') {
        const data = extension === 'glb' ? await file.arrayBuffer() : await file.text();
        return new Promise((resolve, reject) => {
            new GLTFLoader().parse(data, '', (gltf) => resolve(gltf.scene), reject);
        });
    }
    if (extension === 'stp' || extension === 'step') {
        return parseStepFile(file);
    }
    throw new Error(`Unsupported file extension: ${extension}`);
}

function prepareImportedObject(object) {
    let meshCount = 0;
    object.traverse((child) => {
        if (!child.isMesh) return;
        meshCount += 1;
        if (!child.geometry.getAttribute('normal')) child.geometry.computeVertexNormals();
        if (!child.material) {
            child.material = new THREE.MeshStandardMaterial({
                color: 0xbfc7d5,
                roughness: 0.6,
                metalness: 0.15
            });
        }
        child.castShadow = true;
        child.receiveShadow = true;
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        materials.forEach((material) => {
            if (material) material.needsUpdate = true;
        });
    });
    return meshCount;
}

function applyImportedPlacementColor(object, placement) {
    const color = IMPORT_PLACEMENT_COLORS[placement] ?? IMPORT_PLACEMENT_COLORS.scene;
    object.traverse((child) => {
        if (!child.isMesh) return;
        const sourceMaterials = Array.isArray(child.material) ? child.material : [child.material];
        const materials = sourceMaterials.map((source) => new THREE.MeshStandardMaterial({
            color,
            roughness: placement === 'tcp' ? 0.48 : 0.64,
            metalness: placement === 'tcp' ? 0.18 : 0.06,
            side: source?.side ?? THREE.FrontSide,
            transparent: Boolean(source?.transparent || (source?.opacity ?? 1) < 1),
            opacity: source?.opacity ?? 1,
            depthTest: source?.depthTest ?? true,
            depthWrite: source?.depthWrite ?? true
        }));
        child.material = Array.isArray(child.material) ? materials : materials[0];
        child.userData.importColorRole = placement;
    });
}

async function handle3DImport() {
    const file = state.pendingImportFile;
    if (!file) return;
    setTransformHandlesEnabled(false);
    setBaseJogGizmoEnabled(false);
    commitAllPendingHistories();
    const historyBefore = captureSceneSnapshot();

    const extension = getFileExtension(file.name);
    const placement = el.importPlacement.value;
    const robot = placement === 'tcp' ? getArticulatedRobotForAttachment() : null;
    if (placement === 'tcp' && !robot) {
        alert(uiText('TCP에 장착할 로봇을 먼저 불러와 주세요.'));
        return;
    }

    const upAxis = getAutomaticSourceUpAxis(extension);
    el.btnConfirmImport.disabled = true;
    if (el.importDialog.open) el.importDialog.close();
    showLoading(true, uiFormat('{name} 가져오는 중...', { name: file.name }));
    setStatus('가져오는 중', '#f59e0b');

    let importedModel = null;
    try {
        const content = await parseUploaded3DFile(file, extension);
        if (extension === 'fbx') applyFBXMaterial(content);
        const meshCount = prepareImportedObject(content);
        if (meshCount === 0) throw new Error('The file contains no renderable mesh.');
        applyImportedPlacementColor(content, placement);

        importedModel = new THREE.Group();
        importedModel.name = `Imported: ${file.name}`;
        importedModel.add(content);
        importedModel.userData.modelName = file.name;
        importedModel.userData.uploaded = true;
        importedModel.userData.sourceExtension = extension;
        importedModel.userData.sourceUnit = 'mm';
        importedModel.userData.sourceUpAxis = placement === 'tcp' ? 'tool' : upAxis;
        importedModel.userData.placement = placement;

        // Only free-standing 3D models are normalized into the viewer's Z-Up axes.
        // TCP tools preserve file XYZ and inherit the robot's Tool XYZ frame 1:1.
        if (placement === 'scene' && upAxis === 'y') importedModel.rotateX(Math.PI / 2);

        if (placement === 'tcp') {
            robot.userData.tcpFrame.add(importedModel);
            importedModel.userData.attachmentHost = robot;
            if (state.activeArticulatedModel !== robot) {
                state.activeArticulatedModel = robot;
                renderJogControls(robot);
            }
        } else {
            // Preserve the source file origin: the 3D model (0, 0, 0) matches the scene Base origin.
            importedModel.position.set(0, 0, 0);
            importedModel.userData.sceneModelAnchor = 'source-origin';
            state.scene.add(importedModel);
        }

        importedModel.updateMatrixWorld(true);
        const bounds = new THREE.Box3().setFromObject(importedModel);
        if (bounds.isEmpty()) throw new Error('The imported mesh has invalid bounds.');

        state.models.push(importedModel);
        ensureModelTreeId(importedModel);

        updateUIStatus();
        selectSceneModel(importedModel);
        recordHistory(placement === 'tcp' ? 'TCP 툴 불러오기' : '3D 모델링 불러오기', historyBefore, captureSceneSnapshot());
        fitCamera();
        setStatus(placement === 'tcp' ? 'Tool이 TCP에 부착되었습니다.' : '3D 모델링 불러오기 완료', '#22c55e');
    } catch (error) {
        console.error('3D import failed:', error);
        importedModel?.removeFromParent();
        if (importedModel) disposeObjectResources(importedModel);
        applySceneSnapshot(historyBefore);
        setStatus('가져오기 오류', '#ef4444');
        alert(uiText('3D 파일을 불러오지 못했습니다.\n외부 파일을 참조하는 GLTF는 GLB로 변환해서 사용해 주세요.'));
    } finally {
        state.pendingImportFile = null;
        el.btnConfirmImport.disabled = false;
        showLoading(false);
    }
}

function createSTLMesh(geometry, definition) {
    if (!geometry.getAttribute('normal')) geometry.computeVertexNormals();
    const material = new THREE.MeshStandardMaterial({
        color: definition.color || 0xd7dce3,
        roughness: 0.66,
        metalness: 0.06
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = definition.name;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
}

function createScaraTubeMesh(sourceGeometry, definition) {
    const geometry = sourceGeometry.clone();
    if (!geometry.getAttribute('normal')) geometry.computeVertexNormals();

    const position = geometry.getAttribute('position');
    const normal = geometry.getAttribute('normal');
    const originalPositions = Float32Array.from(position.array);
    const originalNormals = Float32Array.from(normal.array);
    let minX = Infinity;
    let maxX = -Infinity;
    for (let index = 0; index < originalPositions.length; index += 3) {
        minX = Math.min(minX, originalPositions[index]);
        maxX = Math.max(maxX, originalPositions[index]);
    }

    const span = Math.max(maxX - minX, 1);
    const fixedEnd = minX + span * 0.07;
    const movingEnd = maxX - span * 0.07;
    const weightBuckets = new Uint8Array(position.count);
    for (let vertex = 0; vertex < position.count; vertex += 1) {
        const x = originalPositions[vertex * 3];
        const linearWeight = THREE.MathUtils.clamp((x - fixedEnd) / (movingEnd - fixedEnd), 0, 1);
        const smoothWeight = linearWeight * linearWeight * (3 - 2 * linearWeight);
        weightBuckets[vertex] = Math.round(smoothWeight * 255);
    }

    position.setUsage(THREE.DynamicDrawUsage);
    normal.setUsage(THREE.DynamicDrawUsage);
    const mesh = createSTLMesh(geometry, definition);
    mesh.frustumCulled = false;
    mesh.userData.originalPositions = originalPositions;
    mesh.userData.originalNormals = originalNormals;
    mesh.userData.weightBuckets = weightBuckets;
    return mesh;
}

function updateScaraTube(robot) {
    const tube = robot?.userData.scaraTube;
    const j1 = robot?.userData.joints?.[0];
    if (!tube || !j1) return;

    const physicalAngle = THREE.MathUtils.degToRad(j1.angle) * Math.sign(j1.axis.z || 1);
    const cosines = new Float32Array(256);
    const sines = new Float32Array(256);
    for (let bucket = 0; bucket < 256; bucket += 1) {
        const angle = physicalAngle * bucket / 255;
        cosines[bucket] = Math.cos(angle);
        sines[bucket] = Math.sin(angle);
    }

    const position = tube.geometry.getAttribute('position');
    const normal = tube.geometry.getAttribute('normal');
    const positions = position.array;
    const normals = normal.array;
    const originalPositions = tube.userData.originalPositions;
    const originalNormals = tube.userData.originalNormals;
    const weightBuckets = tube.userData.weightBuckets;

    for (let vertex = 0; vertex < position.count; vertex += 1) {
        const offset = vertex * 3;
        const bucket = weightBuckets[vertex];
        const cosine = cosines[bucket];
        const sine = sines[bucket];
        const x = originalPositions[offset];
        const y = originalPositions[offset + 1];
        const nx = originalNormals[offset];
        const ny = originalNormals[offset + 1];
        positions[offset] = x * cosine - y * sine;
        positions[offset + 1] = x * sine + y * cosine;
        positions[offset + 2] = originalPositions[offset + 2];
        normals[offset] = nx * cosine - ny * sine;
        normals[offset + 1] = nx * sine + ny * cosine;
        normals[offset + 2] = originalNormals[offset + 2];
    }
    position.needsUpdate = true;
    normal.needsUpdate = true;
}

function renderJogControls(robot) {
    const joints = robot.userData.joints || [];
    el.jogControls.replaceChildren();

    joints.forEach((joint) => {
        const { name, min, max } = joint.definition;
        const isPrismatic = joint.definition.type === 'prismatic';
        const unit = isPrismatic ? 'mm' : '°';
        const row = document.createElement('div');
        row.className = 'jog-row';

        const heading = document.createElement('div');
        heading.className = 'jog-row-heading';
        heading.innerHTML = `<strong>${name}</strong><span>${min}${unit} / ${max}${unit}</span>`;

        const range = document.createElement('input');
        range.type = 'range';
        range.min = min;
        range.max = max;
        range.step = '0.1';
        range.value = '0';
        range.setAttribute('aria-label', `${name} ${uiText(isPrismatic ? '관절 위치' : '관절 각도')}`);

        const valueWrap = document.createElement('label');
        valueWrap.className = 'jog-value';
        const number = document.createElement('input');
        number.type = 'number';
        number.min = min;
        number.max = max;
        number.step = '0.5';
        number.value = '0';
        number.setAttribute('aria-label', `${name} ${uiText(isPrismatic ? '관절 위치(mm)' : '관절 각도(도)')}`);
        valueWrap.append(number, document.createTextNode(unit));

        const applyFromControl = (rawValue) => {
            setJointAngle(joint, rawValue);
            captureCurrentTcpTarget(robot);
        };

        const beginJointHistory = () => {
            if (!state.historySuspended && !state.pendingJointHistory) {
                state.pendingJointHistory = captureSceneSnapshot();
            }
        };
        const finishJointHistory = () => commitPendingHistory('관절 JOG', 'pendingJointHistory');
        range.addEventListener('pointerdown', beginJointHistory);
        range.addEventListener('focus', beginJointHistory);
        range.addEventListener('input', () => applyFromControl(range.value));
        range.addEventListener('change', finishJointHistory);
        range.addEventListener('pointerup', finishJointHistory);
        range.addEventListener('blur', finishJointHistory);
        number.addEventListener('focus', beginJointHistory);
        number.addEventListener('input', () => {
            if (number.value === '' || number.value === '-') return;
            beginJointHistory();
            applyFromControl(number.value);
        });
        number.addEventListener('change', () => {
            applyFromControl(number.value);
            finishJointHistory();
        });
        number.addEventListener('blur', finishJointHistory);
        enableHalfStepWheel(number, beginJointHistory, finishJointHistory);
        joint.control = { range, number };

        row.append(heading, range, valueWrap);
        el.jogControls.appendChild(row);
    });

    el.jogPanel.classList.remove('hidden');
    updatePanelLauncher('jog-panel');
    updateBaseJogCapabilities(robot);
    setJogMode('joint');
    captureCurrentTcpTarget(robot);
}

function refreshJointControlLabels() {
    const robot = state.activeArticulatedModel;
    if (!robot) return;
    (robot.userData.joints || []).forEach((joint) => {
        const name = joint.definition.name;
        const isPrismatic = joint.definition.type === 'prismatic';
        joint.control?.range?.setAttribute('aria-label', `${name} ${uiText(isPrismatic ? '관절 위치' : '관절 각도')}`);
        joint.control?.number?.setAttribute('aria-label', `${name} ${uiText(isPrismatic ? '관절 위치(mm)' : '관절 각도(도)')}`);
    });
}

function resetArticulatedJoints(robot) {
    (robot.userData.joints || []).forEach((joint) => {
        setJointAngle(joint, 0, false);
    });
    syncJointControls(robot);
    captureCurrentTcpTarget(robot);
    setBaseJogStatus('Ready');
}

function hideJogPanel() {
    stopBaseJogHold();
    setBaseJogGizmoEnabled(false);
    el.jogPanel.classList.add('hidden');
    el.jogControls.replaceChildren();
    updatePanelLauncher('jog-panel');
}

function setJointAngle(joint, rawValue, syncControl = true) {
    const { min, max } = joint.definition;
    const parsed = Number(rawValue);
    const value = THREE.MathUtils.clamp(Number.isFinite(parsed) ? parsed : 0, min, max);
    joint.angle = value;
    if (joint.definition.type === 'prismatic') {
        joint.group.quaternion.identity();
        joint.group.position.copy(joint.basePosition).addScaledVector(joint.axis, value);
    } else {
        joint.group.position.copy(joint.basePosition);
        joint.group.quaternion.setFromAxisAngle(joint.axis, THREE.MathUtils.degToRad(value));
    }
    if (joint.definition.name === 'J1') updateScaraTube(joint.robot);
    if (syncControl && joint.control) {
        joint.control.range.value = String(value);
        joint.control.number.value = String(Number(value.toFixed(3)));
    }
    return value;
}

function syncJointControls(robot) {
    (robot.userData.joints || []).forEach((joint) => {
        if (!joint.control) return;
        joint.control.range.value = String(joint.angle);
        joint.control.number.value = String(Number(joint.angle.toFixed(3)));
    });
}

function setJogMode(mode) {
    if (state.snapMoveMode) {
        state.snapMoveMode = false;
        hideSimulationSnapMarker();
        updateSimulationSnapButton();
    }
    const isBase = mode === 'base';
    if (!isBase) {
        stopBaseJogHold();
        setBaseJogGizmoEnabled(false);
    }
    el.jointJogView?.classList.toggle('hidden', isBase);
    el.baseJogView?.classList.toggle('hidden', !isBase);
    el.btnJogJointMode?.classList.toggle('active', !isBase);
    el.btnJogBaseMode?.classList.toggle('active', isBase);
    el.btnJogJointMode?.setAttribute('aria-pressed', String(!isBase));
    el.btnJogBaseMode?.setAttribute('aria-pressed', String(isBase));
    if (isBase && state.activeArticulatedModel) {
        setTransformHandlesEnabled(false);
        captureCurrentTcpTarget(state.activeArticulatedModel);
        setBaseJogGizmoEnabled(true);
    }
}

function setBaseJogGizmoMode(mode) {
    if (!['translate', 'rotate'].includes(mode)) return;
    if (state.baseJogGizmoDragging) endBaseJogGizmoDrag();
    state.baseJogGizmoMode = mode;
    state.baseJogTransformControls?.setMode(mode);
    state.baseJogTransformControls?.setSpace('local');
    updateBaseJogTransformAxes();
    el.btnBaseGizmoTranslate?.classList.toggle('active', mode === 'translate');
    el.btnBaseGizmoRotate?.classList.toggle('active', mode === 'rotate');
    if (el.baseJogView && !el.baseJogView.classList.contains('hidden')) {
        setBaseJogGizmoEnabled(true);
    } else if (state.baseJogGizmoRobot) {
        syncBaseJogGizmoFromRobot(state.baseJogGizmoRobot);
    }
}

function setBaseJogGizmoEnabled(enabled) {
    const controls = state.baseJogTransformControls;
    const target = state.baseJogGizmoTarget;
    const robot = state.activeArticulatedModel;
    if (!controls || !target) return;

    const panelVisible = el.jogPanel
        && !el.jogPanel.classList.contains('hidden')
        && !el.jogPanel.classList.contains('panel-user-hidden');
    const baseModeVisible = el.baseJogView && !el.baseJogView.classList.contains('hidden');
    const shouldEnable = Boolean(enabled && panelVisible && baseModeVisible && robot?.userData.tcpFrame);

    if (!shouldEnable) {
        if (state.baseJogGizmoDragging) endBaseJogGizmoDrag();
        controls.detach();
        controls.visible = false;
        controls.enabled = false;
        if (state.controls) state.controls.enabled = true;
        target.removeFromParent();
        state.baseJogGizmoRobot = null;
        return;
    }

    setTransformHandlesEnabled(false);
    target.removeFromParent();
    robot.add(target);
    state.baseJogGizmoRobot = robot;

    const pose = getCurrentTcpPoseBase(robot);
    if (!pose) return;
    robot.userData.baseJogTarget = {
        position: pose.position.clone(),
        quaternion: pose.quaternion.clone()
    };
    syncBaseJogGizmoFromRobot(robot, pose);
    controls.setMode(state.baseJogGizmoMode);
    controls.setSpace('local');
    updateBaseJogTransformAxes(robot);
    controls.attach(target);
    controls.visible = true;
    controls.enabled = true;
}

function getBaseJogRotationAxes(robot = state.activeArticulatedModel) {
    return robot?.userData.manifest?.ikRotationAxes || ['x', 'y', 'z'];
}

function updateBaseJogCapabilities(robot = state.activeArticulatedModel) {
    const rotationAxes = new Set(getBaseJogRotationAxes(robot));
    document.querySelectorAll('[data-base-jog="rotate"]').forEach((button) => {
        button.disabled = !rotationAxes.has(button.dataset.axis);
    });
    document.querySelectorAll('[data-base-rotation-row]').forEach((row) => {
        row.classList.toggle('hidden', !rotationAxes.has(row.dataset.baseRotationRow));
    });
    if (el.baseGizmoRotateLabel) {
        el.baseGizmoRotateLabel.textContent = [...rotationAxes].map((axis) => `R${axis.toUpperCase()}`).join(' · ');
    }
    updateBaseJogTransformAxes(robot);
}

function updateBaseJogTransformAxes(robot = state.activeArticulatedModel) {
    const controls = state.baseJogTransformControls;
    if (!controls) return;
    if (state.baseJogGizmoMode === 'translate') {
        controls.showX = true;
        controls.showY = true;
        controls.showZ = true;
        return;
    }
    const rotationAxes = new Set(getBaseJogRotationAxes(robot));
    controls.showX = rotationAxes.has('x');
    controls.showY = rotationAxes.has('y');
    controls.showZ = rotationAxes.has('z');
}

function syncBaseJogGizmoFromRobot(robot, pose = null) {
    if (state.baseJogGizmoDragging || robot !== state.baseJogGizmoRobot) return;
    const target = state.baseJogGizmoTarget;
    if (!target || target.parent !== robot) return;
    const resolvedPose = pose || getCurrentTcpPoseBase(robot);
    if (!resolvedPose) return;
    target.position.copy(resolvedPose.position);
    target.quaternion.identity();
    target.scale.set(1, 1, 1);
    target.updateMatrixWorld(true);
}

function beginBaseJogGizmoDrag() {
    const robot = state.baseJogGizmoRobot;
    if (!robot || !state.baseJogTransformControls?.enabled) return;
    stopBaseJogHold();

    const pose = getCurrentTcpPoseBase(robot);
    if (!pose) return;
    robot.userData.baseJogTarget = {
        position: pose.position.clone(),
        quaternion: pose.quaternion.clone()
    };
    syncBaseJogGizmoFromRobot(robot, pose);
    state.baseJogGizmoStartTarget = {
        position: pose.position.clone(),
        quaternion: pose.quaternion.clone()
    };
    state.baseJogGizmoDragging = true;
    if (!state.historySuspended && !state.pendingBaseJogGizmoHistory) {
        state.pendingBaseJogGizmoHistory = captureSceneSnapshot();
    }
    setBaseJogStatus('');
}

function applyBaseJogGizmoTarget() {
    if (!state.baseJogGizmoDragging || state.baseJogGizmoApplying) return;
    const robot = state.baseJogGizmoRobot;
    const proxy = state.baseJogGizmoTarget;
    const start = state.baseJogGizmoStartTarget;
    if (!robot || !proxy || !start) return;

    const desired = {
        position: state.baseJogGizmoMode === 'translate'
            ? proxy.position.clone()
            : start.position.clone(),
        quaternion: state.baseJogGizmoMode === 'rotate'
            ? proxy.quaternion.clone().normalize().multiply(start.quaternion.clone()).normalize()
            : start.quaternion.clone()
    };
    const previousTarget = robot.userData.baseJogTarget
        ? {
            position: robot.userData.baseJogTarget.position.clone(),
            quaternion: robot.userData.baseJogTarget.quaternion.clone()
        }
        : start;
    const previousAngles = (robot.userData.joints || []).map((joint) => joint.angle);

    state.baseJogGizmoApplying = true;
    try {
        const result = solveRobotIK(robot, desired);
        if (!result.success) {
            previousAngles.forEach((angle, index) => setJointAngle(robot.userData.joints[index], angle, false));
            robot.userData.baseJogTarget = previousTarget;
            robot.updateMatrixWorld(true);
            syncJointControls(robot);
            updateTcpPresentation(robot);
            setBaseJogStatus('Target is unreachable or near a singularity.', 'error');
        } else {
            robot.userData.baseJogTarget = desired;
            syncJointControls(robot);
            updateTcpPresentation(robot);
            setBaseJogStatus('');
        }
    } finally {
        state.baseJogGizmoApplying = false;
    }
}

function endBaseJogGizmoDrag() {
    if (!state.baseJogGizmoDragging) return;
    const robot = state.baseJogGizmoRobot;
    state.baseJogGizmoDragging = false;
    state.baseJogGizmoStartTarget = null;
    if (robot) captureCurrentTcpTarget(robot);
    commitPendingHistory('Base 3D JOG', 'pendingBaseJogGizmoHistory');
}

function getCurrentTcpPoseBase(robot) {
    const tcpFrame = robot.userData.tcpFrame;
    if (!tcpFrame) return null;

    robot.updateMatrixWorld(true);
    const worldPosition = tcpFrame.getWorldPosition(new THREE.Vector3());
    const worldQuaternion = tcpFrame.getWorldQuaternion(new THREE.Quaternion());
    const baseWorldQuaternion = robot.getWorldQuaternion(new THREE.Quaternion());
    return {
        position: robot.worldToLocal(worldPosition.clone()),
        quaternion: baseWorldQuaternion.clone().invert().multiply(worldQuaternion).normalize()
    };
}

function captureCurrentTcpTarget(robot) {
    const pose = getCurrentTcpPoseBase(robot);
    if (!pose) return;
    robot.userData.baseJogTarget = {
        position: pose.position.clone(),
        quaternion: pose.quaternion.clone()
    };
    updateTcpPresentation(robot, pose);
    syncBaseJogGizmoFromRobot(robot, pose);
}

function getTcpRotationDegrees(robot, pose) {
    if (robot.userData.manifest?.robotType === 'scara' && robot.userData.toolHomeQuaternion) {
        const relativeRotation = quaternionErrorVector(pose.quaternion, robot.userData.toolHomeQuaternion);
        return {
            rx: 0,
            ry: 0,
            rz: normalizeDegrees(THREE.MathUtils.radToDeg(relativeRotation.z))
        };
    }
    const homeQuaternion = robot.userData.toolHomeQuaternion;
    const relativeRotation = homeQuaternion
        ? homeQuaternion.clone().invert().multiply(pose.quaternion.clone()).normalize()
        : pose.quaternion;
    const positionRotation = SIX_AXIS_POSITION_HOME_QUATERNION.clone()
        .multiply(relativeRotation)
        .normalize();
    const euler = new THREE.Euler().setFromQuaternion(positionRotation, 'ZYX');
    return {
        rx: normalizeDegrees(THREE.MathUtils.radToDeg(euler.x)),
        ry: normalizeDegrees(THREE.MathUtils.radToDeg(euler.y)),
        rz: normalizeDegrees(THREE.MathUtils.radToDeg(euler.z))
    };
}

function syncTcpVisualAtPose(robot, pose) {
    const axes = robot.userData.toolAxesAtTcp;
    if (!axes || !pose) return;
    axes.position.set(0, 0, 0);
    axes.quaternion.identity();
    axes.updateMatrix();
    axes.matrixWorldNeedsUpdate = true;
}

function updateTcpPresentation(robot, pose = getCurrentTcpPoseBase(robot)) {
    if (!pose) return;
    syncTcpVisualAtPose(robot, pose);
    if (robot !== state.activeArticulatedModel) return;

    const rotation = getTcpRotationDegrees(robot, pose);
    const values = {
        x: pose.position.x.toFixed(2),
        y: pose.position.y.toFixed(2),
        z: pose.position.z.toFixed(2),
        rx: rotation.rx.toFixed(2),
        ry: rotation.ry.toFixed(2),
        rz: rotation.rz.toFixed(2)
    };
    Object.entries(values).forEach(([key, value]) => {
        if (el.tcpReadouts[key] && el.tcpReadouts[key] !== document.activeElement) {
            el.tcpReadouts[key].value = value;
        }
    });
}

function beginBaseJogNumericHistory() {
    if (!state.historySuspended && !state.pendingBaseJogNumericHistory && state.activeArticulatedModel) {
        state.pendingBaseJogNumericHistory = captureSceneSnapshot();
    }
}

function applyBaseJogNumericTarget(event) {
    const robot = state.activeArticulatedModel;
    if (!robot?.userData.tcpFrame) return;
    beginBaseJogNumericHistory();
    const editedEntry = Object.entries(el.tcpReadouts)
        .find(([, input]) => input === event?.currentTarget);
    if (!editedEntry) return;
    const [editedKey, editedInput] = editedEntry;
    const editedRawValue = editedInput.value.trim();
    if (!editedRawValue || ['-', '.', '-.'].includes(editedRawValue)) return;
    const editedValue = Number(editedRawValue);
    if (!Number.isFinite(editedValue)) return;

    const previousAngles = (robot.userData.joints || []).map((joint) => joint.angle);
    const previousTarget = robot.userData.baseJogTarget
        ? {
            position: robot.userData.baseJogTarget.position.clone(),
            quaternion: robot.userData.baseJogTarget.quaternion.clone()
        }
        : getCurrentTcpPoseBase(robot);
    const target = {
        position: previousTarget.position.clone(),
        quaternion: previousTarget.quaternion.clone()
    };

    if (['x', 'y', 'z'].includes(editedKey)) {
        target.position[editedKey] = editedValue;
    } else {
        const rotationValues = Object.fromEntries(['rx', 'ry', 'rz'].map((key) => [
            key,
            Number(el.tcpReadouts[key]?.value.trim())
        ]));
        if (!Object.values(rotationValues).every(Number.isFinite)) return;
        target.quaternion.copy(quaternionFromTcpRotationDegrees(
            robot,
            rotationValues.rx,
            rotationValues.ry,
            rotationValues.rz
        ));
    }

    const result = solveRobotIK(robot, target, {
        positionTolerance: 0.001,
        rotationTolerance: THREE.MathUtils.degToRad(0.001)
    });
    if (!result.success) {
        previousAngles.forEach((angle, index) => setJointAngle(robot.userData.joints[index], angle, false));
        robot.userData.baseJogTarget = previousTarget;
        robot.updateMatrixWorld(true);
        syncJointControls(robot);
        updateTcpPresentation(robot);
        setBaseJogStatus('Target is unreachable or near a singularity.', 'error');
        return;
    }

    robot.userData.baseJogTarget = target;
    syncJointControls(robot);
    updateTcpPresentation(robot, target);
    syncBaseJogGizmoFromRobot(robot);
    setBaseJogStatus('');
}

function finishBaseJogNumericHistory() {
    commitPendingHistory('Base 좌표 입력', 'pendingBaseJogNumericHistory');
}

function clearJogModeSelectionForSnap() {
    stopBaseJogHold();
    setBaseJogGizmoEnabled(false);
    el.btnJogJointMode?.classList.remove('active');
    el.btnJogBaseMode?.classList.remove('active');
    el.btnJogJointMode?.setAttribute('aria-pressed', 'false');
    el.btnJogBaseMode?.setAttribute('aria-pressed', 'false');
}

function normalizeDegrees(value) {
    return ((value + 180) % 360 + 360) % 360 - 180;
}

function setBaseJogStatus(message, type = '') {
    if (!el.baseJogStatus) return;
    const visible = type === 'error' || type === 'working';
    el.baseJogStatus.dataset.sourceMessage = visible ? message : '';
    el.baseJogStatus.textContent = visible ? uiText(message) : '';
    el.baseJogStatus.classList.toggle('hidden', !visible);
    el.baseJogStatus.classList.toggle('error', type === 'error');
    el.baseJogStatus.classList.toggle('working', type === 'working');
}

function runBaseJogButton(button) {
    if (!state.activeArticulatedModel) return false;
    if (button.dataset.baseJog === 'rotate'
        && !getBaseJogRotationAxes(state.activeArticulatedModel).includes(button.dataset.axis)) return false;
    const ownsHistory = !state.historySuspended && !state.pendingBaseJogHistory;
    const before = ownsHistory ? captureSceneSnapshot() : null;
    const result = jogTcpInBase(
        state.activeArticulatedModel,
        button.dataset.baseJog,
        button.dataset.axis,
        Number(button.dataset.direction)
    );
    if (ownsHistory && result) recordHistory('Base JOG', before, captureSceneSnapshot());
    return result;
}

function startBaseJogHold(button, pointerId) {
    stopBaseJogHold();
    if (!state.historySuspended) state.pendingBaseJogHistory = captureSceneSnapshot();
    if (!runBaseJogButton(button)) {
        state.pendingBaseJogHistory = null;
        return;
    }

    const hold = {
        button,
        pointerId,
        delayTimer: null,
        repeatTimer: null
    };
    state.baseJogHold = hold;
    button.classList.add('is-held');
    button.focus({ preventScroll: true });
    try {
        button.setPointerCapture(pointerId);
    } catch (_) {
        // Pointer capture is optional; the window-level pointerup still stops JOG.
    }

    hold.delayTimer = window.setTimeout(() => repeatBaseJogHold(hold), BASE_JOG_HOLD_DELAY);
}

function repeatBaseJogHold(hold) {
    if (state.baseJogHold !== hold) return;
    if (!runBaseJogButton(hold.button)) {
        stopBaseJogHold(hold.pointerId);
        return;
    }
    hold.repeatTimer = window.setTimeout(() => repeatBaseJogHold(hold), BASE_JOG_REPEAT_INTERVAL);
}

function stopBaseJogHold(pointerId = null) {
    const hold = state.baseJogHold;
    if (!hold || (pointerId !== null && hold.pointerId !== pointerId)) return;

    state.baseJogHold = null;
    window.clearTimeout(hold.delayTimer);
    window.clearTimeout(hold.repeatTimer);
    hold.button.classList.remove('is-held');
    try {
        if (hold.button.hasPointerCapture(hold.pointerId)) hold.button.releasePointerCapture(hold.pointerId);
    } catch (_) {
        // The browser may already have released capture on pointerup/cancel.
    }
    commitPendingHistory('Base JOG', 'pendingBaseJogHistory');
}

function jogTcpInBase(robot, kind, axisName, direction) {
    const currentTarget = robot.userData.baseJogTarget;
    if (!currentTarget || !['x', 'y', 'z'].includes(axisName)) return false;
    if (kind === 'rotate' && !getBaseJogRotationAxes(robot).includes(axisName)) return false;

    const stepInput = kind === 'rotate' ? el.baseRotateStep : el.baseMoveStep;
    const fallback = kind === 'rotate' ? 5 : 10;
    const max = kind === 'rotate' ? 30 : 100;
    const parsedStep = Number(stepInput?.value);
    const step = THREE.MathUtils.clamp(Number.isFinite(parsedStep) ? Math.abs(parsedStep) : fallback, 0.1, max);
    if (stepInput) stepInput.value = String(step);

    const previousTarget = {
        position: currentTarget.position.clone(),
        quaternion: currentTarget.quaternion.clone()
    };
    const target = {
        position: previousTarget.position.clone(),
        quaternion: previousTarget.quaternion.clone()
    };
    const previousAngles = (robot.userData.joints || []).map((joint) => joint.angle);

    if (kind === 'rotate') {
        const axis = new THREE.Vector3(
            axisName === 'x' ? 1 : 0,
            axisName === 'y' ? 1 : 0,
            axisName === 'z' ? 1 : 0
        );
        const delta = new THREE.Quaternion().setFromAxisAngle(axis, THREE.MathUtils.degToRad(step * direction));
        target.quaternion.premultiply(delta).normalize();
    } else {
        target.position[axisName] += step * direction;
    }

    setBaseJogStatus('Solving IK...', 'working');
    const result = solveRobotIK(robot, target, {
        positionTolerance: 0.001,
        rotationTolerance: THREE.MathUtils.degToRad(0.001)
    });
    if (!result.success) {
        previousAngles.forEach((angle, index) => setJointAngle(robot.userData.joints[index], angle, false));
        robot.userData.baseJogTarget = previousTarget;
        robot.updateMatrixWorld(true);
        syncJointControls(robot);
        updateTcpPresentation(robot, previousTarget);
        syncBaseJogGizmoFromRobot(robot);
        setBaseJogStatus('Target is unreachable or near a singularity.', 'error');
        return false;
    }

    robot.userData.baseJogTarget = target;
    syncJointControls(robot);
    updateTcpPresentation(robot, target);
    syncBaseJogGizmoFromRobot(robot);
    setBaseJogStatus('');
    return true;
}

function equivalentJointAngles(angle, joint) {
    const values = [];
    for (let turns = -3; turns <= 3; turns += 1) {
        const candidate = angle + turns * 360;
        if (candidate >= joint.definition.min - 1e-7 && candidate <= joint.definition.max + 1e-7) {
            values.push(THREE.MathUtils.clamp(candidate, joint.definition.min, joint.definition.max));
        }
    }
    return values;
}

function solveScaraIK(robot, target) {
    const joints = robot.userData.joints || [];
    const manifest = robot.userData.manifest;
    const homeQuaternion = robot.userData.toolHomeQuaternion;
    if (joints.length !== 4 || !homeQuaternion || !Array.isArray(manifest?.structure)) {
        return { success: false, positionError: Infinity, rotationError: Infinity };
    }

    const currentPose = getCurrentTcpPoseBase(robot);
    const rzOnlyError = quaternionErrorVector(target.quaternion, currentPose.quaternion);
    if (currentPose.position.distanceTo(target.position) < 0.01
        && Math.hypot(rzOnlyError.x, rzOnlyError.y) < THREE.MathUtils.degToRad(0.01)) {
        const requestedJ4 = joints[3].angle + THREE.MathUtils.radToDeg(rzOnlyError.z);
        if (requestedJ4 >= joints[3].definition.min - 1e-7
            && requestedJ4 <= joints[3].definition.max + 1e-7) {
            setJointAngle(joints[3], requestedJ4, false);
            robot.updateMatrixWorld(true);
            const solvedPose = getCurrentTcpPoseBase(robot);
            const positionError = solvedPose.position.distanceTo(target.position);
            const rotationError = quaternionErrorVector(target.quaternion, solvedPose.quaternion).length();
            return {
                success: positionError < 0.01 && rotationError < THREE.MathUtils.degToRad(0.01),
                positionError,
                rotationError,
                analytic: true,
                rzOnly: true
            };
        }
    }

    const [arm1, arm2] = manifest.structure;
    const signedArm2 = (manifest.secondArmDirection || 1) * arm2;
    const radiusSquared = target.position.x ** 2 + target.position.y ** 2;
    const denominator = 2 * arm1 * signedArm2;
    const rawCosine = (radiusSquared - arm1 ** 2 - signedArm2 ** 2) / denominator;
    const prismaticTarget = target.position.z - (manifest.tcp?.[2] || 0);
    const targetRotation = quaternionErrorVector(target.quaternion, homeQuaternion);
    const orientationIsRzOnly = Math.hypot(targetRotation.x, targetRotation.y) < THREE.MathUtils.degToRad(0.01);

    if (!Number.isFinite(rawCosine)
        || rawCosine < -1 - 1e-7
        || rawCosine > 1 + 1e-7
        || !orientationIsRzOnly
        || prismaticTarget < joints[2].definition.min - 1e-7
        || prismaticTarget > joints[2].definition.max + 1e-7) {
        return { success: false, positionError: Infinity, rotationError: Infinity };
    }

    const elbowMagnitude = Math.acos(THREE.MathUtils.clamp(rawCosine, -1, 1));
    const elbowSolutions = elbowMagnitude < 1e-9 ? [0] : [elbowMagnitude, -elbowMagnitude];
    const desiredYawDegrees = THREE.MathUtils.radToDeg(targetRotation.z);
    let best = null;

    elbowSolutions.forEach((physicalJ2) => {
        const physicalJ1 = Math.atan2(target.position.y, target.position.x)
            - Math.atan2(
                signedArm2 * Math.sin(physicalJ2),
                arm1 + signedArm2 * Math.cos(physicalJ2)
            );
        const baseJ1 = THREE.MathUtils.radToDeg(physicalJ1);
        const baseJ2 = THREE.MathUtils.radToDeg(physicalJ2);
        equivalentJointAngles(baseJ1, joints[0]).forEach((j1) => {
            equivalentJointAngles(baseJ2, joints[1]).forEach((j2) => {
                const baseJ4 = desiredYawDegrees - j1 - j2;
                equivalentJointAngles(baseJ4, joints[3]).forEach((j4) => {
                    const candidate = [j1, j2, prismaticTarget, j4];
                    const score = candidate.reduce((sum, value, index) => sum + (value - joints[index].angle) ** 2, 0);
                    if (!best || score < best.score) best = { angles: candidate, score };
                });
            });
        });
    });

    if (!best) return { success: false, positionError: Infinity, rotationError: Infinity };
    const previousAngles = joints.map((joint) => joint.angle);
    best.angles.forEach((angle, index) => setJointAngle(joints[index], angle, false));
    robot.updateMatrixWorld(true);
    const solvedPose = getCurrentTcpPoseBase(robot);
    const positionError = solvedPose.position.distanceTo(target.position);
    const rotationError = quaternionErrorVector(target.quaternion, solvedPose.quaternion).length();
    const success = positionError < 0.01 && rotationError < THREE.MathUtils.degToRad(0.01);
    if (!success) {
        previousAngles.forEach((angle, index) => setJointAngle(joints[index], angle, false));
        robot.updateMatrixWorld(true);
    }
    return { success, positionError, rotationError, analytic: true };
}

function solveRobotIK(robot, target, precision = {}) {
    const joints = robot.userData.joints || [];
    if (robot.userData.manifest?.robotType === 'scara') return solveScaraIK(robot, target);
    const tolerance = {
        position: precision.positionTolerance ?? 0.45,
        rotation: precision.rotationTolerance ?? THREE.MathUtils.degToRad(0.2),
        finalPosition: precision.positionTolerance ?? 0.8,
        finalRotation: precision.rotationTolerance ?? THREE.MathUtils.degToRad(0.35)
    };
    const startingAngles = joints.map((joint) => joint.angle);
    const makeSeed = (index = -1, offset = 0) => joints.map((_, jointIndex) => (
        jointIndex === index && joints[jointIndex].definition.type !== 'prismatic' ? offset : 0
    ));
    const seedOffsets = [makeSeed()];
    const addSeed = (entries) => {
        const seed = makeSeed();
        entries.forEach(([index, offset]) => {
            if (joints[index]?.definition.type !== 'prismatic') seed[index] = offset;
        });
        if (!seedOffsets.some((candidate) => candidate.every((value, index) => Math.abs(value - seed[index]) < 1e-6))) {
            seedOffsets.push(seed);
        }
    };
    const currentPose = getCurrentTcpPoseBase(robot);
    const baseJoint = joints[0];
    if (baseJoint?.definition.type !== 'prismatic'
        && Math.abs(baseJoint.axis.z) > 0.8
        && currentPose?.position.lengthSq() > 1e-6
        && target.position.lengthSq() > 1e-6) {
        const currentYaw = Math.atan2(currentPose.position.y, currentPose.position.x);
        const targetYaw = Math.atan2(target.position.y, target.position.x);
        const polarDelta = THREE.MathUtils.euclideanModulo(
            THREE.MathUtils.radToDeg(targetYaw - currentYaw) + 180,
            360
        ) - 180;
        const jointDirection = Math.sign(baseJoint.axis.z) || 1;
        const baseSeedOffset = polarDelta * jointDirection;
        const baseSeedOffsets = [
            baseSeedOffset,
            -baseSeedOffset,
            baseSeedOffset - 90,
            baseSeedOffset + 90
        ];
        baseSeedOffsets.forEach((offset) => {
            if (Math.abs(offset) <= 1e-6) return;
            addSeed([[0, offset]]);
            if (joints.length >= 6 && joints[1]?.definition.type !== 'prismatic') {
                addSeed([[0, offset], [1, 35]]);
                addSeed([[0, offset], [1, -35]]);
            }
        });
    }
    const escapeJointIndices = joints.length >= 6 ? [3, 4] : [1, 0];
    escapeJointIndices.forEach((index) => {
        seedOffsets.push(makeSeed(index, 5), makeSeed(index, -5));
    });
    let lastResult = { success: false, positionError: Infinity, rotationError: Infinity };

    for (let attempt = 0; attempt < seedOffsets.length; attempt += 1) {
        joints.forEach((joint, index) => {
            setJointAngle(joint, startingAngles[index] + seedOffsets[attempt][index], false);
        });
        robot.updateMatrixWorld(true);
        lastResult = solveRobotIKAttempt(robot, target, tolerance);
        if (lastResult.success) {
            lastResult.usedSingularityEscape = attempt > 0;
            return lastResult;
        }
    }
    return lastResult;
}

function solveRobotIKAttempt(robot, target, tolerance) {
    const joints = robot.userData.joints || [];
    const tcpFrame = robot.userData.tcpFrame;
    if (joints.length === 0 || !tcpFrame) return { success: false };

    robot.updateMatrixWorld(true);
    const targetWorldPosition = target.position.clone().applyMatrix4(robot.matrixWorld);
    const baseWorldQuaternion = robot.getWorldQuaternion(new THREE.Quaternion());
    const targetWorldQuaternion = baseWorldQuaternion.clone().multiply(target.quaternion.clone()).normalize();
    const rotationTasks = getBaseJogRotationAxes(robot).map((axisName) => {
        const axis = new THREE.Vector3(
            axisName === 'x' ? 1 : 0,
            axisName === 'y' ? 1 : 0,
            axisName === 'z' ? 1 : 0
        ).applyQuaternion(baseWorldQuaternion).normalize();
        return { axisName, axis };
    });
    const taskRows = [
        { type: 'position', component: 'x' },
        { type: 'position', component: 'y' },
        { type: 'position', component: 'z' },
        ...rotationTasks.map((task) => ({ type: 'rotation', ...task }))
    ];
    const selectedRotationError = (error) => Math.sqrt(rotationTasks.reduce(
        (sum, task) => sum + task.axis.dot(error) ** 2,
        0
    ));
    let positionErrorLength = Infinity;
    let rotationErrorLength = Infinity;

    for (let iteration = 0; iteration < IK_MAX_ITERATIONS; iteration += 1) {
        robot.updateMatrixWorld(true);
        const tcpPosition = tcpFrame.getWorldPosition(new THREE.Vector3());
        const tcpQuaternion = tcpFrame.getWorldQuaternion(new THREE.Quaternion());
        const positionError = targetWorldPosition.clone().sub(tcpPosition);
        const rotationError = quaternionErrorVector(targetWorldQuaternion, tcpQuaternion);
        positionErrorLength = positionError.length();
        rotationErrorLength = selectedRotationError(rotationError);

        if (positionErrorLength < tolerance.position && rotationErrorLength < tolerance.rotation) {
            return { success: true, positionError: positionErrorLength, rotationError: rotationErrorLength };
        }

        const jacobian = Array.from({ length: taskRows.length }, () => Array(joints.length).fill(0));
        joints.forEach((joint, column) => {
            const parentWorldQuaternion = joint.group.parent.getWorldQuaternion(new THREE.Quaternion());
            const worldAxis = joint.axis.clone().applyQuaternion(parentWorldQuaternion).normalize();
            const isPrismatic = joint.definition.type === 'prismatic';
            const jointPosition = joint.group.getWorldPosition(new THREE.Vector3());
            const linear = isPrismatic
                ? worldAxis.clone().multiplyScalar(IK_POSITION_SCALE)
                : worldAxis.clone().cross(tcpPosition.clone().sub(jointPosition));
            const angular = isPrismatic ? new THREE.Vector3() : worldAxis;
            taskRows.forEach((task, row) => {
                jacobian[row][column] = task.type === 'position'
                    ? linear[task.component] / IK_POSITION_SCALE
                    : angular.dot(task.axis);
            });
        });

        const error = [
            positionError.x / IK_POSITION_SCALE,
            positionError.y / IK_POSITION_SCALE,
            positionError.z / IK_POSITION_SCALE,
            ...rotationTasks.map((task) => task.axis.dot(rotationError))
        ];
        const normal = Array.from({ length: joints.length }, () => Array(joints.length).fill(0));
        const rhs = Array(joints.length).fill(0);
        for (let row = 0; row < taskRows.length; row += 1) {
            for (let column = 0; column < joints.length; column += 1) {
                rhs[column] += jacobian[row][column] * error[row];
                for (let other = 0; other < joints.length; other += 1) {
                    normal[column][other] += jacobian[row][column] * jacobian[row][other];
                }
            }
        }
        for (let index = 0; index < joints.length; index += 1) {
            normal[index][index] += IK_DAMPING * IK_DAMPING;
        }

        const deltas = solveLinearSystem(normal, rhs);
        if (!deltas || deltas.some((value) => !Number.isFinite(value))) break;

        let moved = false;
        joints.forEach((joint, index) => {
            const previousAngle = joint.angle;
            const delta = joint.definition.type === 'prismatic'
                ? THREE.MathUtils.clamp(deltas[index] * IK_POSITION_SCALE, -IK_MAX_PRISMATIC_STEP, IK_MAX_PRISMATIC_STEP)
                : THREE.MathUtils.radToDeg(THREE.MathUtils.clamp(deltas[index], -IK_MAX_JOINT_STEP, IK_MAX_JOINT_STEP));
            const nextAngle = setJointAngle(joint, previousAngle + delta, false);
            if (Math.abs(nextAngle - previousAngle) > 1e-9) moved = true;
        });
        if (!moved) break;
    }

    robot.updateMatrixWorld(true);
    const finalPosition = tcpFrame.getWorldPosition(new THREE.Vector3());
    const finalQuaternion = tcpFrame.getWorldQuaternion(new THREE.Quaternion());
    positionErrorLength = targetWorldPosition.distanceTo(finalPosition);
    rotationErrorLength = selectedRotationError(quaternionErrorVector(targetWorldQuaternion, finalQuaternion));
    return {
        success: positionErrorLength < tolerance.finalPosition && rotationErrorLength < tolerance.finalRotation,
        positionError: positionErrorLength,
        rotationError: rotationErrorLength
    };
}

function quaternionErrorVector(target, current) {
    const error = target.clone().multiply(current.clone().invert()).normalize();
    if (error.w < 0) {
        error.x *= -1;
        error.y *= -1;
        error.z *= -1;
        error.w *= -1;
    }
    const halfSine = Math.sqrt(Math.max(0, 1 - error.w * error.w));
    if (halfSine < 1e-8) return new THREE.Vector3(error.x, error.y, error.z).multiplyScalar(2);
    const angle = 2 * Math.acos(THREE.MathUtils.clamp(error.w, -1, 1));
    return new THREE.Vector3(error.x, error.y, error.z).multiplyScalar(angle / halfSine);
}

function solveLinearSystem(matrix, vector) {
    const size = vector.length;
    const augmented = matrix.map((row, index) => [...row, vector[index]]);
    for (let pivot = 0; pivot < size; pivot += 1) {
        let bestRow = pivot;
        for (let row = pivot + 1; row < size; row += 1) {
            if (Math.abs(augmented[row][pivot]) > Math.abs(augmented[bestRow][pivot])) bestRow = row;
        }
        if (Math.abs(augmented[bestRow][pivot]) < 1e-12) return null;
        [augmented[pivot], augmented[bestRow]] = [augmented[bestRow], augmented[pivot]];

        const divisor = augmented[pivot][pivot];
        for (let column = pivot; column <= size; column += 1) augmented[pivot][column] /= divisor;
        for (let row = 0; row < size; row += 1) {
            if (row === pivot) continue;
            const factor = augmented[row][pivot];
            for (let column = pivot; column <= size; column += 1) {
                augmented[row][column] -= factor * augmented[pivot][column];
            }
        }
    }
    return augmented.map((row) => row[size]);
}

function getVirtualControllerTargetRobot() {
    return findProgramRobot(state.virtualController.targetRobotId);
}

async function ensureVirtualControllerCore() {
    const controller = state.virtualController;
    if (controller.core) return controller.core;
    if (!controller.corePromise) {
        controller.corePromise = import('./virtual-controller-core.mjs?v=20260718-trace-joint-required1')
            .then((core) => {
                controller.core = core;
                controller.samples = new core.VirtualControllerSampleBuffer();
                return core;
            })
            .catch((error) => {
                controller.corePromise = null;
                throw error;
            });
    }
    return controller.corePromise;
}

function getVirtualControllerSourceConfig() {
    const controller = state.virtualController;
    if (controller.core?.getVirtualControllerSource) {
        return controller.core.getVirtualControllerSource(controller.source);
    }
    return controller.source === 'trace'
        ? { id: 'trace', label: 'Trace 도구', socketUrl: 'ws://127.0.0.1:5000/ws', startCommand: 'startTrace', stopCommand: 'stopTrace' }
        : {
            id: 'bridge',
            label: '전용 브리지',
            socketUrl: 'ws://127.0.0.1:5055/ws',
            healthUrl: 'http://127.0.0.1:5055/api/health',
            startCommand: 'startStream',
            stopCommand: 'stopStream'
        };
}

function getVirtualControllerUnavailableMessage() {
    return getVirtualControllerSourceConfig().id === 'trace'
        ? 'Trace 도구를 실행한 뒤 연결해 주세요.'
        : '전용 브리지를 실행해 주세요.';
}

function isVirtualControllerActive() {
    return Boolean(state.virtualController.wanted);
}

function refreshVirtualControllerRobotOptions() {
    if (!el.virtualControllerRobot) return;
    const robots = getArticulatedRobots();
    const availableIds = new Set(robots.map((robot) => robot.userData.motionInstanceId));
    if (!availableIds.has(state.virtualController.targetRobotId)) {
        const preferred = robots.includes(state.activeProgramRobot)
            ? state.activeProgramRobot
            : robots.includes(state.activeArticulatedModel)
                ? state.activeArticulatedModel
                : robots[0] || null;
        state.virtualController.targetRobotId = preferred?.userData.motionInstanceId || null;
    }

    const signature = robots
        .map((robot) => `${robot.userData.motionInstanceId}:${robot.userData.motionDisplayName}`)
        .join('|');
    if (el.virtualControllerRobot.dataset.robotSignature !== signature) {
        el.virtualControllerRobot.replaceChildren();
        const placeholder = document.createElement('option');
        placeholder.value = '';
        placeholder.textContent = uiText('로봇을 선택하세요');
        el.virtualControllerRobot.appendChild(placeholder);
        robots.forEach((robot) => {
            const option = document.createElement('option');
            option.value = robot.userData.motionInstanceId;
            option.textContent = robot.userData.motionDisplayName;
            el.virtualControllerRobot.appendChild(option);
        });
        el.virtualControllerRobot.dataset.robotSignature = signature;
    } else if (el.virtualControllerRobot.options[0]) {
        el.virtualControllerRobot.options[0].textContent = uiText('로봇을 선택하세요');
    }
    el.virtualControllerRobot.value = state.virtualController.targetRobotId || '';
    updatePanelLauncher('virtual-controller-panel');
}

function refreshVirtualControllerUi() {
    const controller = state.virtualController;
    refreshVirtualControllerRobotOptions();
    const source = getVirtualControllerSourceConfig();
    if (el.virtualControllerSource) {
        el.virtualControllerSource.value = source.id;
        el.virtualControllerSource.disabled = controller.wanted;
    }
    document.querySelectorAll('[data-virtual-controller-source]').forEach((element) => {
        element.hidden = element.dataset.virtualControllerSource !== source.id;
    });
    if (el.virtualControllerEndpoint) {
        el.virtualControllerEndpoint.innerHTML = `<i class="fa-solid fa-network-wired"></i> ${uiText(source.label)} · ${source.socketUrl.replace(/^ws:\/\//, '')}`;
    }
    const statusLabels = {
        disconnected: '연결 안 됨',
        connecting: '연결 중',
        connected: '연결됨',
        streaming: '위치 동기화 중',
        reconnecting: '재연결 중',
        error: '가상 컨트롤러 연결 실패'
    };
    if (el.virtualControllerStatus) {
        el.virtualControllerStatus.textContent = uiText(controller.statusMessage || statusLabels[controller.status] || '연결 안 됨');
    }
    const antennaState = controller.status === 'connecting' || controller.status === 'reconnecting'
        ? 'connecting'
        : controller.status === 'connected' || controller.status === 'streaming'
            ? 'connected'
            : controller.status === 'error'
                ? 'error'
                : 'disconnected';
    [el.virtualControllerStatusDot, el.virtualControllerAntenna, el.virtualControllerLauncherAntenna]
        .filter(Boolean)
        .forEach((indicator) => {
            indicator.classList.remove('connecting', 'connected', 'disconnected', 'error');
            indicator.classList.add(antennaState);
        });
    if (el.btnVirtualControllerConnect) {
        el.btnVirtualControllerConnect.classList.toggle('active', controller.wanted);
        el.btnVirtualControllerConnect.disabled = !controller.wanted && !controller.targetRobotId;
        el.btnVirtualControllerConnect.innerHTML = controller.wanted
            ? `<i class="fa-solid fa-link-slash"></i><span>${uiText('연결 해제')}</span>`
            : `<i class="fa-solid fa-plug"></i><span>${uiText('연결')}</span>`;
    }
    if (el.virtualControllerRobot) el.virtualControllerRobot.disabled = controller.wanted;
    if (el.btnVirtualControllerBridgeStart) {
        el.btnVirtualControllerBridgeStart.disabled = source.id !== 'bridge'
            || controller.bridgeStopInProgress
            || controller.bridgeStartInProgress
            || controller.bridgeRunning;
    }
    if (el.btnVirtualControllerBridgeStop) {
        el.btnVirtualControllerBridgeStop.disabled = source.id !== 'bridge'
            || controller.bridgeStopInProgress
            || !controller.bridgeRunning;
    }
    if (el.virtualControllerRate) {
        const rate = controller.samples?.getRateHz(performance.now()) || 0;
        el.virtualControllerRate.textContent = rate > 0 ? `${Math.round(rate)} Hz` : '-- Hz';
    }
}

function setVirtualControllerStatus(status, message = '') {
    state.virtualController.status = status;
    state.virtualController.statusMessage = message;
    refreshVirtualControllerUi();
    updateMotionUiLock();
    renderMotionProgramPanel();
}

function sendVirtualControllerCommand(command) {
    const socket = state.virtualController.socket;
    if (!socket || socket.readyState !== WebSocket.OPEN) return false;
    socket.send(JSON.stringify(command));
    return true;
}

function startVirtualControllerStream() {
    const core = state.virtualController.core;
    if (!core) return;
    const source = getVirtualControllerSourceConfig();
    const sent = sendVirtualControllerCommand({
        type: source.startCommand,
        interval: core.VIRTUAL_CONTROLLER_SAMPLE_INTERVAL_MS
    });
    if (sent) state.virtualController.lastStreamStartAt = performance.now();
}

function clearVirtualControllerStreamWatchdog() {
    const controller = state.virtualController;
    if (!controller.streamWatchdogTimer) return;
    clearTimeout(controller.streamWatchdogTimer);
    controller.streamWatchdogTimer = null;
}

function monitorVirtualControllerStream() {
    const controller = state.virtualController;
    clearVirtualControllerStreamWatchdog();
    if (!controller.wanted) return;
    const now = performance.now();
    const socketOpen = controller.socket?.readyState === WebSocket.OPEN;
    const lastFlowAt = Math.max(
        controller.sourceConnectedAt || 0,
        controller.lastSampleAt || 0,
        controller.lastStreamStartAt || 0
    );
    if (socketOpen && lastFlowAt > 0
        && now - lastFlowAt >= VIRTUAL_CONTROLLER_STREAM_STALL_MS) {
        startVirtualControllerStream();
        sendVirtualControllerCommand({ type: 'status' });
    }
    controller.streamWatchdogTimer = window.setTimeout(
        monitorVirtualControllerStream,
        VIRTUAL_CONTROLLER_STREAM_WATCHDOG_MS
    );
}

function handleVirtualControllerMessage(raw) {
    const controller = state.virtualController;
    if (!controller.wanted) return;
    if (!controller.core || !controller.samples) return;
    const parsed = controller.core.parseVirtualControllerMessage(raw, performance.now());
    if (parsed.kind === 'state') {
        controller.samples.push(parsed);
        controller.lastSampleAt = parsed.receivedAt;
        if (controller.status !== 'streaming') {
            setVirtualControllerStatus('streaming');
        } else if (controller.statusMessage) {
            controller.statusMessage = '';
            refreshVirtualControllerUi();
        }
        if (!controller.streamWatchdogTimer) monitorVirtualControllerStream();
        return;
    }
    if (parsed.kind === 'invalid' && controller.source === 'trace' && parsed.reason === 'trace-joints') {
        controller.lastSampleAt = performance.now();
        setVirtualControllerStatus('error', 'Trace에서 관절 위치(J1~J6)를 가져올 수 없습니다.');
        return;
    }
    if (parsed.kind !== 'event') return;
    const message = parsed.message;
    if (parsed.type === 'connectResult') {
        if (message.success) {
            controller.sourceConnectedAt = performance.now();
            setVirtualControllerStatus('connected');
            startVirtualControllerStream();
            monitorVirtualControllerStream();
        } else {
            setVirtualControllerStatus('error');
            controller.socket?.close();
        }
    } else if (parsed.type === 'streamStartResult' || parsed.type === 'traceStartResult') {
        if (message.success && controller.status !== 'streaming') setVirtualControllerStatus('connected');
        if (!message.success) setVirtualControllerStatus('error', '가상 컨트롤러 연결 실패');
    } else if (parsed.type === 'disconnectResult' && controller.wanted) {
        endVirtualControllerSessionForSourceExit(getVirtualControllerSourceConfig());
    } else if (parsed.type === 'status' && message.robotConnected && message.streamRunning) {
        if (controller.status !== 'streaming') setVirtualControllerStatus('connected');
    } else if (parsed.type === 'error') {
        setVirtualControllerStatus('error');
    }
}

function openVirtualControllerSocket(isReconnect = false) {
    const controller = state.virtualController;
    if (!controller.wanted) return;
    if (controller.reconnectTimer) {
        clearTimeout(controller.reconnectTimer);
        controller.reconnectTimer = null;
    }
    if (controller.socket && [WebSocket.CONNECTING, WebSocket.OPEN].includes(controller.socket.readyState)) return;

    setVirtualControllerStatus(isReconnect ? 'reconnecting' : 'connecting');
    const core = controller.core;
    if (!core) return;
    const source = getVirtualControllerSourceConfig();
    let socket;
    try {
        socket = new WebSocket(source.socketUrl);
    } catch (error) {
        console.error('Virtual controller socket initialization failed:', error);
        setVirtualControllerStatus('error', getVirtualControllerUnavailableMessage());
        return;
    }
    controller.socket = socket;
    socket.addEventListener('open', () => {
        if (controller.socket !== socket || !controller.wanted) return;
        if (source.id === 'bridge') {
            controller.bridgeRunning = true;
            refreshVirtualControllerUi();
        }
        controller.sourceConnectedAt = performance.now();
        sendVirtualControllerCommand({ type: 'connect', ip: core.VIRTUAL_CONTROLLER_HOST });
    });
    socket.addEventListener('message', (event) => {
        if (controller.socket === socket) handleVirtualControllerMessage(event.data);
    });
    socket.addEventListener('close', () => {
        if (controller.socket === socket) controller.socket = null;
        if (source.id === 'bridge') controller.bridgeRunning = false;
        controller.samples?.clear();
        controller.lastAppliedSampleId = 0;
        clearVirtualControllerStreamWatchdog();
        if (!controller.wanted) {
            if (!controller.statusMessage) setVirtualControllerStatus('disconnected');
            return;
        }
        endVirtualControllerSessionForSourceExit(source);
    });
    socket.addEventListener('error', () => {
        if (controller.socket === socket && controller.wanted) {
            setVirtualControllerStatus('error', getVirtualControllerUnavailableMessage());
        }
    });
}

function endVirtualControllerSessionForSourceExit(source) {
    const controller = state.virtualController;
    if (!controller.wanted) return;
    const historyBefore = controller.historyBefore;
    controller.historyBefore = null;
    controller.wanted = false;
    controller.socket = null;
    controller.samples?.clear();
    controller.lastAppliedSampleId = 0;
    controller.sourceConnectedAt = 0;
    controller.lastSampleAt = 0;
    controller.lastStreamStartAt = 0;
    clearVirtualControllerStreamWatchdog();
    const message = source.id === 'trace'
        ? 'Trace 도구 연결이 종료되어 3D 동기화를 해제했습니다.'
        : '전용 브리지가 종료되어 3D 동기화를 해제했습니다.';
    setVirtualControllerStatus('disconnected', message);
    if (historyBefore) recordHistory('가상 컨트롤러 동기화', historyBefore, captureSceneSnapshot());
}

async function connectVirtualController() {
    const controller = state.virtualController;
    if (isMotionActive()) return;
    refreshVirtualControllerRobotOptions();
    if (!getVirtualControllerTargetRobot()) {
        setVirtualControllerStatus('error', '로봇을 선택하세요');
        return;
    }
    try {
        await ensureVirtualControllerCore();
    } catch (error) {
        console.error('Virtual controller support failed to load:', error);
        setVirtualControllerStatus('error', '가상 컨트롤러 기능을 불러올 수 없습니다.');
        return;
    }
    commitAllPendingHistories();
    controller.historyBefore = captureSceneSnapshot();
    controller.wanted = true;
    controller.samples?.clear();
    controller.lastAppliedSampleId = 0;
    controller.lastRateUpdateAt = 0;
    controller.sourceConnectedAt = 0;
    controller.lastSampleAt = 0;
    controller.lastStreamStartAt = 0;
    openVirtualControllerSocket(false);
}

function clearVirtualControllerBridgeHealthMonitor() {
    const controller = state.virtualController;
    if (controller.bridgeHealthTimer) {
        clearTimeout(controller.bridgeHealthTimer);
        controller.bridgeHealthTimer = null;
    }
}

async function isVirtualControllerBridgeRunning() {
    const controller = state.virtualController;
    const bridge = controller.core?.getVirtualControllerSource?.('bridge') || {
        socketUrl: 'ws://127.0.0.1:5055/ws'
    };
    if (!bridge.socketUrl) return false;
    return new Promise((resolve) => {
        let settled = false;
        const finish = (running) => {
            if (settled) return;
            settled = true;
            clearTimeout(timeout);
            try { socket.close(); } catch { /* Ignore close errors. */ }
            resolve(running);
        };
        const timeout = window.setTimeout(() => finish(false), 1200);
        let socket;
        try {
            socket = new WebSocket(bridge.socketUrl);
        } catch {
            finish(false);
            return;
        }
        socket.addEventListener('message', (event) => {
            try {
                const message = JSON.parse(String(event.data));
                if (message?.type === 'bridgeReady') finish(true);
            } catch {
                // Wait for a valid bridgeReady message or timeout.
            }
        });
        socket.addEventListener('error', () => finish(false));
        socket.addEventListener('close', () => finish(false));
    });
}

function monitorVirtualControllerBridgeHealth(silent = false) {
    const controller = state.virtualController;
    clearVirtualControllerBridgeHealthMonitor();
    void (async () => {
        const wasRunning = controller.bridgeRunning;
        const running = await isVirtualControllerBridgeRunning();
        controller.bridgeRunning = running;
        const bridgeIsActiveSource = getVirtualControllerSourceConfig().id === 'bridge';

        if (running) {
            const wasStarting = controller.bridgeStartInProgress;
            controller.bridgeStartInProgress = false;
            controller.bridgeHealthDeadline = 0;
            if (wasStarting && !controller.wanted && bridgeIsActiveSource) {
                setVirtualControllerStatus('disconnected', '전용 브리지가 실행 중입니다.');
            } else {
                refreshVirtualControllerUi();
            }
            if (bridgeIsActiveSource || controller.wanted) {
                controller.bridgeHealthTimer = window.setTimeout(
                    () => monitorVirtualControllerBridgeHealth(true),
                    1000
                );
            }
            return;
        }

        const stillStarting = controller.bridgeStartInProgress
            && performance.now() < controller.bridgeHealthDeadline;
        if (stillStarting) {
            controller.bridgeHealthTimer = window.setTimeout(monitorVirtualControllerBridgeHealth, 250);
            return;
        }

        controller.bridgeStartInProgress = false;
        controller.bridgeHealthDeadline = 0;
        if (controller.wanted && bridgeIsActiveSource) {
            endVirtualControllerSessionForSourceExit(getVirtualControllerSourceConfig());
        } else if (bridgeIsActiveSource && wasRunning) {
            setVirtualControllerStatus('disconnected', '전용 브리지가 종료되었습니다.');
        } else if (bridgeIsActiveSource && !silent) {
            setVirtualControllerStatus('error', '전용 브리지를 시작하지 못했습니다. 먼저 다운로드한 브리지를 한 번 실행해 주세요.');
        } else {
            refreshVirtualControllerUi();
        }
        if (bridgeIsActiveSource && !controller.wanted && !controller.bridgeStartInProgress
            && !el.virtualControllerPanel?.classList.contains('panel-user-hidden')) {
            controller.bridgeHealthTimer = window.setTimeout(
                () => monitorVirtualControllerBridgeHealth(true),
                1500
            );
        }
    })();
}

function launchVirtualControllerBridge() {
    const controller = state.virtualController;
    if (getVirtualControllerSourceConfig().id !== 'bridge') return;
    try {
        window.location.href = 'inorobot-vc-bridge://start';
        controller.bridgeStartInProgress = true;
        controller.bridgeHealthDeadline = performance.now() + 6000;
        setVirtualControllerStatus('disconnected', '전용 브리지를 시작하는 중...');
        monitorVirtualControllerBridgeHealth();
    } catch (error) {
        console.error('Virtual controller bridge launch failed:', error);
        setVirtualControllerStatus('error', '브리지를 먼저 다운로드하여 한 번 실행해 주세요.');
    }
}

async function stopVirtualControllerBridge() {
    const controller = state.virtualController;
    if (getVirtualControllerSourceConfig().id !== 'bridge' || controller.bridgeStopInProgress) return;
    if (controller.wanted) disconnectVirtualController();

    try {
        await ensureVirtualControllerCore();
    } catch (error) {
        console.error('Virtual controller bridge support failed to load:', error);
        setVirtualControllerStatus('error', '가상 컨트롤러 기능을 불러올 수 없습니다.');
        return;
    }

    controller.bridgeStopInProgress = true;
    refreshVirtualControllerUi();
    const bridgeUrl = controller.core.getVirtualControllerSource('bridge').socketUrl;
    try {
        await new Promise((resolve, reject) => {
            const socket = new WebSocket(bridgeUrl);
            const timeout = window.setTimeout(() => {
                try { socket.close(); } catch { /* Ignore close errors. */ }
                reject(new Error('Bridge shutdown timed out.'));
            }, 2500);
            const finish = (error = null) => {
                clearTimeout(timeout);
                try { socket.close(); } catch { /* Ignore close errors. */ }
                if (error) reject(error);
                else resolve();
            };
            socket.addEventListener('open', () => {
                socket.send(JSON.stringify({ type: 'shutdown' }));
            });
            socket.addEventListener('message', (event) => {
                const parsed = controller.core.parseVirtualControllerMessage(event.data, performance.now());
                if (parsed.kind === 'event' && parsed.type === 'shutdownResult') {
                    finish(parsed.message.success ? null : new Error('Bridge rejected shutdown.'));
                }
            });
            socket.addEventListener('error', () => finish(new Error('Bridge is not running.')));
        });
        setVirtualControllerStatus('disconnected', '전용 브리지가 종료되었습니다.');
    } catch (error) {
        console.error('Virtual controller bridge shutdown failed:', error);
        setVirtualControllerStatus('error', '실행 중인 전용 브리지를 찾을 수 없습니다.');
    } finally {
        controller.bridgeStopInProgress = false;
        controller.bridgeRunning = false;
        clearVirtualControllerBridgeHealthMonitor();
        refreshVirtualControllerUi();
    }
}

function closeVirtualControllerSocket(notifyBridge = true) {
    const controller = state.virtualController;
    if (controller.reconnectTimer) {
        clearTimeout(controller.reconnectTimer);
        controller.reconnectTimer = null;
    }
    const socket = controller.socket;
    controller.socket = null;
    if (!socket) return;
    if (notifyBridge && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: getVirtualControllerSourceConfig().stopCommand }));
        socket.send(JSON.stringify({ type: 'disconnect' }));
    }
    try { socket.close(1000, '3D simulation disconnected'); } catch { /* Already closed. */ }
}

function disconnectVirtualController() {
    const controller = state.virtualController;
    const historyBefore = controller.historyBefore;
    controller.historyBefore = null;
    controller.wanted = false;
    closeVirtualControllerSocket(true);
    controller.samples?.clear();
    controller.lastAppliedSampleId = 0;
    controller.sourceConnectedAt = 0;
    controller.lastSampleAt = 0;
    controller.lastStreamStartAt = 0;
    clearVirtualControllerStreamWatchdog();
    setVirtualControllerStatus('disconnected');
    if (historyBefore) recordHistory('가상 컨트롤러 동기화', historyBefore, captureSceneSnapshot());
}

function isVirtualControllerSourceLive(timestamp) {
    const controller = state.virtualController;
    const source = getVirtualControllerSourceConfig();
    if (source.id !== 'trace') return true;
    const lastActivityAt = Math.max(controller.sourceConnectedAt || 0, controller.lastSampleAt || 0);
    if (!lastActivityAt || timestamp - lastActivityAt <= TRACE_SOURCE_LIVENESS_TIMEOUT_MS) return true;
    endVirtualControllerSessionForSourceExit(source);
    return false;
}

function applyVirtualControllerFrame(timestamp) {
    const controller = state.virtualController;
    if (!controller.wanted || !controller.samples || !controller.core) return;
    if (!isVirtualControllerSourceLive(timestamp)) return;
    const robot = getVirtualControllerTargetRobot();
    const sample = controller.samples.getLatest();
    if (!robot || !sample || sample.sampleId <= controller.lastAppliedSampleId) return;
    if (timestamp - controller.lastRateUpdateAt >= 250) {
        controller.lastRateUpdateAt = timestamp;
        refreshVirtualControllerUi();
    }
    controller.lastAppliedSampleId = sample.sampleId;
    const joints = robot.userData.joints || [];
    if (!Array.isArray(sample.joints) || sample.joints.length < joints.length) {
        setVirtualControllerStatus('error', '가상 컨트롤러의 관절 위치를 가져올 수 없습니다.');
        return;
    }
    joints.forEach((joint, index) => setJointAngle(joint, sample.joints[index], false));
    robot.updateMatrixWorld(true);
    controller.statusMessage = '';
    const pose = getCurrentTcpPoseBase(robot);
    if (pose) {
        robot.userData.baseJogTarget = {
            position: pose.position.clone(),
            quaternion: pose.quaternion.clone()
        };
        if (robot === state.activeArticulatedModel) {
            syncJointControls(robot);
            updateTcpPresentation(robot, pose);
            if (!el.baseJogView?.classList.contains('hidden')) {
                syncBaseJogGizmoFromRobot(robot, pose);
            }
        }
    }

}

function getArticulatedRobots() {
    return state.models.filter((model) => Array.isArray(model.userData.joints) && model.userData.tcpFrame);
}

function createMotionId(prefix = 'motion') {
    if (globalThis.crypto?.randomUUID) return `${prefix}-${globalThis.crypto.randomUUID()}`;
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function assignRobotInstanceMetadata(robot, modelDefinition, preferred = {}) {
    const modelName = preferred.modelName || modelDefinition?.name || robot.userData.robotName || robot.name || 'Robot';
    const matchingRobots = getArticulatedRobots().filter((candidate) => (
        (candidate.userData.motionModelName || candidate.userData.robotName) === modelName
    ));
    const nextSequence = Math.max(
        matchingRobots.length,
        ...matchingRobots.map((candidate) => {
            const match = candidate.userData.motionDisplayName?.match(/#(\d+)$/);
            return match ? Number(match[1]) : 0;
        })
    ) + 1;
    robot.userData.motionInstanceId = preferred.instanceId || robot.userData.motionInstanceId || createMotionId('robot');
    robot.userData.motionModelName = modelName;
    robot.userData.motionDisplayName = preferred.displayName || `${modelName} #${nextSequence}`;
    robot.userData.motionModelFolder = preferred.modelFolder || modelDefinition?.folder || '';
    robot.userData.motionRobotType = preferred.robotType || modelDefinition?.robotType || robot.userData.manifest?.robotType || '';
    robot.userData.motionModelDefinition = modelDefinition || robot.userData.motionModelDefinition || null;
    return robot.userData.motionInstanceId;
}

function ensureMotionProgram(robot) {
    if (!robot?.userData.tcpFrame) return null;
    if (!robot.userData.motionInstanceId) {
        assignRobotInstanceMetadata(robot, robot.userData.motionModelDefinition || {
            name: robot.userData.robotName,
            folder: robot.userData.motionModelFolder,
            robotType: robot.userData.manifest?.robotType
        });
    }
    const id = robot.userData.motionInstanceId;
    if (!state.motionPrograms.has(id)) state.motionPrograms.set(id, createEmptyMotionProgram(true));
    return state.motionPrograms.get(id);
}

function getMotionSession(robot) {
    return robot ? state.motionSessions.get(robot.userData.motionInstanceId) || null : null;
}

function isMotionActive() {
    return state.motionSessions.size > 0 || isVirtualControllerActive();
}

function getMotionStatus(robot) {
    return getMotionSession(robot)?.status || ensureMotionProgram(robot)?.status || 'idle';
}

function motionStatusLabel(status) {
    return uiText(({
        idle: '대기',
        running: '실행 중',
        paused: '일시정지',
        completed: '완료',
        error: '오류',
        stopped: '정지됨'
    })[status] || status);
}

function showMotionProgramPanel() {
    if (!el.programPanel) return;
    el.programPanel.classList.remove('hidden');
    if (!el.programPanel.dataset.motionPanelInitialized) {
        el.programPanel.classList.remove('panel-user-hidden');
        el.programPanel.dataset.motionPanelInitialized = 'true';
    }
    updatePanelLauncher('program-panel');
}

function refreshMotionProgramStatus() {
    if (!el.programStatus || !state.motionProgramStatus) return;
    const { message, type, replacements } = state.motionProgramStatus;
    el.programStatus.textContent = uiFormat(message, replacements);
    el.programStatus.classList.toggle('error', type === 'error');
    el.programStatus.classList.toggle('working', type === 'working');
}

function setMotionProgramStatus(message, type = '', replacements = {}) {
    if (!el.programStatus) return;
    state.motionProgramStatus = { message, type, replacements };
    refreshMotionProgramStatus();
}

function programCommandName(step) {
    if (isMotionPointMotion(step.motion)) return formatMotionPointName(step.pointIndex);
    return ({ DELAY: 'Delay', TIME_START: 'Time Start', TIME_OUT: 'Time Out' })[step.motion] || step.motion;
}

function nextAvailablePointIndex(program, excludedStep = null) {
    const used = new Set((program?.steps || [])
        .filter((step) => step !== excludedStep && isMotionPointMotion(step.motion))
        .map((step) => Number(step.pointIndex))
        .filter((value) => Number.isInteger(value) && value >= MIN_POINT_INDEX && value <= MAX_POINT_INDEX));
    for (let pointIndex = MIN_POINT_INDEX; pointIndex <= MAX_POINT_INDEX; pointIndex += 1) {
        if (!used.has(pointIndex)) return pointIndex;
    }
    return null;
}

function updateCycleTimeReadout(timestamp = performance.now(), force = false) {
    if (!el.programCycleTime) return;
    if (!force && timestamp - state.lastCycleTimeDisplayUpdate < CYCLE_TIME_DISPLAY_INTERVAL) return;
    state.lastCycleTimeDisplayUpdate = timestamp;
    const robot = state.activeProgramRobot;
    const program = robot ? ensureMotionProgram(robot) : null;
    const session = robot ? getMotionSession(robot) : null;
    const timerNow = session?.status === 'paused' && Number.isFinite(session.pauseStarted)
        ? session.pauseStarted
        : timestamp;
    const elapsed = calculateCycleElapsedSeconds(program?.cycleTimerStartedAt, timerNow);
    const measuring = elapsed !== null;
    el.programCycleTime.textContent = measuring
        ? `${elapsed.toFixed(3)} s`
        : Number.isFinite(program?.lastCycleTimeSeconds)
            ? `${program.lastCycleTimeSeconds.toFixed(3)} s`
            : '-- s';
    el.programCycleTime.classList.toggle('measuring', measuring);
    el.programCycleTime.setAttribute('aria-label', uiText(measuring ? '사이클 타임 측정 중' : '사이클 타임'));
}

function renderMotionProgramPanel() {
    if (!el.programRobotList || !el.programStepList) return;
    const robots = getArticulatedRobots();
    const allRobotsIncluded = robots.length > 0
        && robots.every((robot) => ensureMotionProgram(robot).included);
    if (el.btnProgramSelectAll) {
        el.btnProgramSelectAll.textContent = uiText(allRobotsIncluded ? '전체 해제' : '전체 선택');
        el.btnProgramSelectAll.setAttribute('aria-pressed', String(allRobotsIncluded));
    }
    refreshVirtualControllerRobotOptions();
    if (!robots.includes(state.activeProgramRobot)) {
        state.activeProgramRobot = robots.includes(state.activeArticulatedModel)
            ? state.activeArticulatedModel
            : robots[0] || null;
    }
    el.programRobotList.replaceChildren();
    robots.forEach((robot) => {
        const program = ensureMotionProgram(robot);
        const status = getMotionStatus(robot);
        const row = document.createElement('div');
        row.className = `program-robot-row${robot === state.activeProgramRobot ? ' active' : ''}`;
        row.dataset.robotInstanceId = robot.userData.motionInstanceId;

        const included = document.createElement('input');
        included.type = 'checkbox';
        included.checked = program.included;
        included.dataset.programRobotInclude = robot.userData.motionInstanceId;
        included.setAttribute('aria-label', uiFormat('{name} 동시 실행 대상', {
            name: robot.userData.motionDisplayName
        }));

        const select = document.createElement('button');
        select.type = 'button';
        select.className = 'program-robot-select';
        select.dataset.programRobotSelect = robot.userData.motionInstanceId;
        select.textContent = formatRobotPanelName(robot.userData.motionDisplayName);

        const statusText = document.createElement('span');
        statusText.className = `program-robot-status ${status}`;
        statusText.textContent = motionStatusLabel(status);
        row.append(included, select, statusText);
        el.programRobotList.appendChild(row);
    });

    const robot = state.activeProgramRobot;
    const program = robot ? ensureMotionProgram(robot) : null;
    el.programRobotName.textContent = robot
        ? formatRobotPanelName(robot.userData.motionDisplayName)
        : uiText('로봇을 선택하세요');
    updateCycleTimeReadout(performance.now(), true);
    el.programStepList.replaceChildren();
    if (!program || program.steps.length === 0) {
        const empty = document.createElement('p');
        empty.className = 'program-step-empty';
        empty.textContent = uiText(robot
            ? '자세, DELAY 또는 타이머 명령을 추가하세요.'
            : '프로그램 가능한 로봇이 없습니다.');
        el.programStepList.appendChild(empty);
    } else {
        program.steps.forEach((step, index) => {
            const row = document.createElement('div');
            const isSelected = step.id === program.selectedStepId;
            const session = getMotionSession(robot);
            const isRunning = session?.currentStepId === step.id && session.status === 'running';
            const isTimer = step.motion === 'TIME_START' || step.motion === 'TIME_OUT';
            row.className = `program-step-row${isSelected ? ' active' : ''}${isRunning ? ' running' : ''}${step.motion === 'DELAY' ? ' delay' : ''}${isTimer ? ' timer' : ''}`;
            row.dataset.programStepId = step.id;

            const dragHandle = document.createElement('button');
            dragHandle.type = 'button';
            dragHandle.className = 'program-step-drag-handle';
            dragHandle.draggable = true;
            dragHandle.dataset.programStepDrag = step.id;
            dragHandle.dataset.programEdit = '';
            dragHandle.title = uiText('드래그하여 순서 변경');
            dragHandle.setAttribute('aria-label', `${programCommandName(step)} ${uiText('드래그하여 순서 변경')}`);
            dragHandle.innerHTML = '<i class="fa-solid fa-grip-vertical"></i>';

            let pointControl;
            let labelControl = null;
            if (isMotionPointMotion(step.motion)) {
                pointControl = document.createElement('label');
                pointControl.className = 'program-step-select program-point-index';
                const prefix = document.createElement('span');
                prefix.textContent = 'P[';
                const pointIndexInput = document.createElement('input');
                pointIndexInput.type = 'number';
                pointIndexInput.min = String(MIN_POINT_INDEX);
                pointIndexInput.max = String(MAX_POINT_INDEX);
                pointIndexInput.step = '1';
                pointIndexInput.value = String(step.pointIndex);
                pointIndexInput.dataset.programStepPointIndex = step.id;
                pointIndexInput.dataset.programEdit = '';
                pointIndexInput.title = uiText('포인트 번호');
                pointIndexInput.setAttribute('aria-label', uiText('포인트 번호'));
                const suffix = document.createElement('span');
                suffix.textContent = ']';
                pointControl.append(prefix, pointIndexInput, suffix);

                labelControl = document.createElement('input');
                labelControl.type = 'text';
                labelControl.className = 'program-step-label';
                labelControl.value = step.label || '';
                labelControl.maxLength = MAX_POINT_LABEL_LENGTH;
                labelControl.placeholder = uiText('라벨');
                labelControl.dataset.programStepLabel = step.id;
                labelControl.dataset.programEdit = '';
                labelControl.title = uiText('포인트 라벨');
                labelControl.setAttribute('aria-label', uiText('포인트 라벨'));
            } else {
                pointControl = document.createElement('span');
                pointControl.className = 'program-step-select program-command-name';
                pointControl.textContent = programCommandName(step);
            }

            const motion = document.createElement('select');
            motion.dataset.programStepMotion = step.id;
            motion.dataset.programEdit = '';
            [
                ['MOVJ', 'MovJ'],
                ['MOVL', 'MovL'],
                ['DELAY', 'Delay'],
                ['TIME_START', 'T.Start'],
                ['TIME_OUT', 'T.Out']
            ].forEach(([value, label]) => {
                const option = document.createElement('option');
                option.value = value;
                option.textContent = label;
                motion.appendChild(option);
            });
            motion.value = step.motion;
            motion.title = step.motion.replace('_', ' ');

            const speed = document.createElement('input');
            const isDelay = step.motion === 'DELAY';
            speed.type = 'number';
            speed.className = 'program-step-speed';
            speed.disabled = isTimer;
            speed.placeholder = isTimer ? '—' : '';
            speed.min = String(isDelay ? MIN_DELAY_SECONDS : 1);
            speed.max = String(isDelay
                ? MAX_DELAY_SECONDS
                : step.motion === 'MOVJ'
                    ? 100
                    : robot.userData.manifest.cartesianMotion.maxSpeed);
            speed.step = isDelay ? '0.1' : '1';
            speed.value = isTimer ? '' : String(isDelay ? step.delaySeconds : step.speed);
            if (!isTimer) speed.dataset.programStepSpeed = step.id;
            speed.dataset.programEdit = '';

            const unit = document.createElement('span');
            unit.className = 'program-step-unit';
            unit.textContent = isTimer ? '' : isDelay ? 's' : step.motion === 'MOVJ' ? '%' : 'mm/s';
            row.append(dragHandle, pointControl, motion, speed, unit);
            if (labelControl) row.appendChild(labelControl);
            el.programStepList.appendChild(row);
        });
    }
    syncMotionRepeatControl();
    const selected = program?.steps.find((step) => step.id === program.selectedStepId) || null;
    if (el.btnProgramUpdate) el.btnProgramUpdate.disabled = !selected
        || !['MOVJ', 'MOVL'].includes(selected.motion)
        || isMotionActive();
    if (el.btnProgramDelete) el.btnProgramDelete.disabled = !selected || isMotionActive();
    if (el.btnProgramStepRobot) el.btnProgramStepRobot.disabled = !program?.steps.length || isMotionActive();
    if (el.btnProgramRunRobot) el.btnProgramRunRobot.disabled = !program?.steps.length || isVirtualControllerActive();
    if (el.btnProgramStepGroup) el.btnProgramStepGroup.disabled = isMotionActive() || !robots.some((candidate) => {
        const candidateProgram = ensureMotionProgram(candidate);
        return candidateProgram.included && candidateProgram.steps.length;
    });
    if (el.btnProgramRunGroup) el.btnProgramRunGroup.disabled = isVirtualControllerActive() || !robots.some((candidate) => {
        const candidateProgram = ensureMotionProgram(candidate);
        return candidateProgram.included && candidateProgram.steps.length;
    });
    if (el.btnPositionExport) {
        el.btnPositionExport.disabled = !robot
            || !program?.steps.some((step) => isMotionPointMotion(step.motion));
    }
    updateMotionUiLock();
    updatePanelLauncher('program-panel');
}

function findProgramRobot(instanceId) {
    return getArticulatedRobots().find((robot) => robot.userData.motionInstanceId === instanceId) || null;
}

function handleProgramRobotListClick(event) {
    const button = event.target.closest('[data-program-robot-select]');
    if (!button || isMotionActive()) return;
    const robot = findProgramRobot(button.dataset.programRobotSelect);
    if (!robot) return;
    state.activeProgramRobot = robot;
    selectSceneModel(robot);
    renderMotionProgramPanel();
}

function handleProgramRobotListChange(event) {
    const checkbox = event.target.closest('[data-program-robot-include]');
    if (!checkbox || isMotionActive()) return;
    const robot = findProgramRobot(checkbox.dataset.programRobotInclude);
    if (!robot) return;
    const before = captureSceneSnapshot();
    ensureMotionProgram(robot).included = checkbox.checked;
    recordHistory('동시 실행 대상 변경', before, captureSceneSnapshot());
    renderMotionProgramPanel();
}

function handleProgramStepListClick(event) {
    const row = event.target.closest('[data-program-step-id]');
    if (!row || !el.programStepList.contains(row) || isMotionActive()) return;
    if (event.target.closest('select, input')) return;
    const program = ensureMotionProgram(state.activeProgramRobot);
    if (!program) return;
    program.selectedStepId = row.dataset.programStepId;
    renderMotionProgramPanel();
}

function closeProgramStepContextMenu() {
    state.programContextStepId = null;
    el.programStepContextMenu?.classList.add('hidden');
}

function handleProgramStepContextMenu(event) {
    if (isMotionActive()) return;
    const row = event.target.closest('[data-program-step-id]');
    const program = ensureMotionProgram(state.activeProgramRobot);
    const step = program?.steps.find((candidate) => candidate.id === row?.dataset.programStepId);
    if (!row || !isMotionPointMotion(step?.motion)) return;
    event.preventDefault();
    program.selectedStepId = step.id;
    state.programContextStepId = step.id;
    renderMotionProgramPanel();
    const menu = el.programStepContextMenu;
    if (!menu) return;
    menu.classList.remove('hidden');
    menu.style.left = '0px';
    menu.style.top = '0px';
    const bounds = menu.getBoundingClientRect();
    menu.style.left = `${Math.max(8, Math.min(event.clientX, window.innerWidth - bounds.width - 8))}px`;
    menu.style.top = `${Math.max(8, Math.min(event.clientY, window.innerHeight - bounds.height - 8))}px`;
}

function showPositionValueError(message = '') {
    if (!el.positionValueError) return;
    el.positionValueError.textContent = message ? uiText(message) : '';
    el.positionValueError.classList.toggle('visible', Boolean(message));
}

function openContextProgramPointPosition() {
    const robot = state.activeProgramRobot;
    const program = ensureMotionProgram(robot);
    const step = program?.steps.find((candidate) => candidate.id === state.programContextStepId);
    closeProgramStepContextMenu();
    if (!robot || !step || !isMotionPointMotion(step.motion)) return;
    const pose = motionStepTargetPose(step);
    const rotation = getTcpRotationDegrees(robot, pose);
    const positionValues = {
        x: pose.position.x,
        y: pose.position.y,
        z: pose.position.z,
        a: rotation.rz,
        b: rotation.ry,
        c: rotation.rx
    };
    Object.entries(positionValues).forEach(([key, value]) => {
        if (el.positionValueInputs[key]) el.positionValueInputs[key].value = Number(value).toFixed(6);
    });
    const armParameters = step.armParameters || calculatePointArmParameters(robot, step.joints);
    el.positionArmInputs.forEach((input, index) => { input.value = String(armParameters[index] ?? 0); });
    const externalAxes = step.externalAxes || [0, 0, 0, 0, 0, 0];
    el.positionExternalInputs.forEach((input, index) => {
        input.value = Number(externalAxes[index] || 0).toFixed(6);
    });
    if (el.positionValueLabel) el.positionValueLabel.value = step.label || '';
    if (el.positionValuePointName) el.positionValuePointName.textContent = formatMotionPointName(step.pointIndex);
    state.positionDialogTarget = {
        robotInstanceId: robot.userData.motionInstanceId,
        stepId: step.id
    };
    showPositionValueError();
    el.positionValueDialog?.showModal();
}

function closePositionValueDialog() {
    state.positionDialogTarget = null;
    showPositionValueError();
    if (el.positionValueDialog?.open) el.positionValueDialog.close();
}

function quaternionFromPointRotation(robot, rx, ry, rz) {
    return quaternionFromTcpRotationDegrees(robot, rx, ry, rz);
}

function applyPositionValueDialog() {
    const targetRecord = state.positionDialogTarget;
    const robot = findProgramRobot(targetRecord?.robotInstanceId);
    const program = ensureMotionProgram(robot);
    const step = program?.steps.find((candidate) => candidate.id === targetRecord?.stepId);
    if (!robot || !step || !isMotionPointMotion(step.motion)) {
        showPositionValueError('수정할 위치 포인트를 찾을 수 없습니다.');
        return;
    }
    const values = Object.fromEntries(Object.entries(el.positionValueInputs)
        .map(([key, input]) => [key, Number(input.value)]));
    const armParameters = el.positionArmInputs.map((input) => Number(input.value));
    const externalAxes = el.positionExternalInputs.map((input) => Number(input.value));
    const label = el.positionValueLabel?.value.trim() || '';
    if (!Object.values(values).every(Number.isFinite)
        || !armParameters.every(Number.isInteger)
        || !externalAxes.every(Number.isFinite)) {
        showPositionValueError('위치 값, Arm 파라미터 및 외부 축 값을 올바르게 입력하세요.');
        return;
    }
    if (!isValidMotionPointLabel(label)) {
        showPositionValueError('라벨은 영문자로 시작하고 영문, 숫자, 밑줄만 사용하여 19자 이하로 입력하세요.');
        return;
    }

    const targetPose = {
        position: new THREE.Vector3(values.x, values.y, values.z),
        quaternion: quaternionFromPointRotation(robot, values.c, values.b, values.a)
    };
    const originalAngles = robot.userData.joints.map((joint) => joint.angle);
    const seedAngles = Array.isArray(step.joints) ? step.joints : originalAngles;
    seedAngles.forEach((angle, index) => setJointAngle(robot.userData.joints[index], angle, false));
    robot.updateMatrixWorld(true);
    const result = solveRobotIK(robot, targetPose, {
        positionTolerance: 0.001,
        rotationTolerance: THREE.MathUtils.degToRad(0.001)
    });
    if (!result.success) {
        restoreRobotJointAngles(robot, originalAngles);
        showPositionValueError('입력한 위치가 도달 범위를 벗어나거나 특이점에 가깝습니다.');
        return;
    }
    const solvedAngles = robot.userData.joints.map((joint) => joint.angle);
    restoreRobotJointAngles(robot, originalAngles);

    const before = captureSceneSnapshot();
    step.joints = solvedAngles;
    step.tcp = {
        position: targetPose.position.toArray(),
        quaternion: targetPose.quaternion.toArray()
    };
    step.armParameters = armParameters;
    step.externalAxes = externalAxes;
    step.label = label;
    step.name = formatMotionPointName(step.pointIndex);
    recordHistory('프로그램 포인트 위치 값 변경', before, captureSceneSnapshot());
    closePositionValueDialog();
    renderMotionProgramPanel();
    setMotionProgramStatus('{name} 위치 값을 수정했습니다.', '', { name: step.name });
}

function handleProgramStepListChange(event) {
    if (isMotionActive()) return;
    const pointIndexControl = event.target.closest('[data-program-step-point-index]');
    const labelControl = event.target.closest('[data-program-step-label]');
    const motionControl = event.target.closest('[data-program-step-motion]');
    const speedControl = event.target.closest('[data-program-step-speed]');
    const stepId = pointIndexControl?.dataset.programStepPointIndex
        || labelControl?.dataset.programStepLabel
        || motionControl?.dataset.programStepMotion
        || speedControl?.dataset.programStepSpeed;
    const robot = state.activeProgramRobot;
    const program = ensureMotionProgram(robot);
    const step = program?.steps.find((candidate) => candidate.id === stepId);
    if (!step) return;
    if (pointIndexControl) {
        const pointIndex = Number(pointIndexControl.value);
        const duplicate = program.steps.some((candidate) => candidate !== step
            && isMotionPointMotion(candidate.motion)
            && candidate.pointIndex === pointIndex);
        if (!Number.isInteger(pointIndex)
            || pointIndex < MIN_POINT_INDEX
            || pointIndex > MAX_POINT_INDEX
            || duplicate) {
            setMotionProgramStatus(duplicate
                ? '이미 사용 중인 포인트 번호입니다.'
                : '포인트 번호는 0부터 9999 사이의 정수여야 합니다.', 'error');
            renderMotionProgramPanel();
            return;
        }
        if (step.pointIndex === pointIndex) return;
        const before = captureSceneSnapshot();
        step.pointIndex = pointIndex;
        step.name = formatMotionPointName(pointIndex);
        recordHistory('프로그램 포인트 번호 변경', before, captureSceneSnapshot());
        renderMotionProgramPanel();
        return;
    }
    if (labelControl) {
        const label = labelControl.value.trim();
        if (!isValidMotionPointLabel(label)) {
            setMotionProgramStatus('라벨은 영문자로 시작하고 영문, 숫자, 밑줄만 사용하여 19자 이하로 입력하세요.', 'error');
            renderMotionProgramPanel();
            return;
        }
        if ((step.label || '') === label) return;
        const before = captureSceneSnapshot();
        step.label = label;
        recordHistory('프로그램 포인트 라벨 변경', before, captureSceneSnapshot());
        renderMotionProgramPanel();
        return;
    }
    const before = captureSceneSnapshot();
    if (motionControl) {
        const wasPoint = isMotionPointMotion(step.motion);
        const nextMotion = ['MOVJ', 'MOVL', 'DELAY', 'TIME_START', 'TIME_OUT'].includes(motionControl.value)
            ? motionControl.value
            : 'MOVJ';
        const isPoint = isMotionPointMotion(nextMotion);
        const allocatedPointIndex = isPoint && !wasPoint
            ? nextAvailablePointIndex(program, step)
            : null;
        if (isPoint && !wasPoint && allocatedPointIndex === null) {
            setMotionProgramStatus('사용 가능한 포인트 번호가 없습니다.', 'error');
            renderMotionProgramPanel();
            return;
        }
        step.motion = nextMotion;
        if (isPoint && !wasPoint) {
            step.pointIndex = allocatedPointIndex;
            step.name = formatMotionPointName(allocatedPointIndex);
            step.label = '';
            step.armParameters = calculatePointArmParameters(robot, step.joints);
            step.externalAxes = [0, 0, 0, 0, 0, 0];
        } else if (!isPoint) {
            delete step.pointIndex;
            delete step.label;
            delete step.armParameters;
            delete step.externalAxes;
            step.name = step.motion === 'DELAY' ? 'Delay' : step.motion === 'TIME_START' ? 'Time Start' : 'Time Out';
        }
        if (step.motion === 'DELAY') {
            delete step.speed;
            step.delaySeconds = DEFAULT_DELAY_SECONDS;
        } else if (step.motion === 'MOVJ' || step.motion === 'MOVL') {
            delete step.delaySeconds;
            step.speed = step.motion === 'MOVJ' ? DEFAULT_MOVJ_SPEED : DEFAULT_MOVL_SPEED;
        } else {
            delete step.speed;
            delete step.delaySeconds;
        }
    } else if (step.motion === 'DELAY') {
        step.delaySeconds = THREE.MathUtils.clamp(
            Number(speedControl.value) || DEFAULT_DELAY_SECONDS,
            MIN_DELAY_SECONDS,
            MAX_DELAY_SECONDS
        );
    } else {
        const maximum = step.motion === 'MOVJ'
            ? 100
            : robot.userData.manifest.cartesianMotion.maxSpeed;
        step.speed = THREE.MathUtils.clamp(Number(speedControl.value) || 1, 1, maximum);
    }
    recordHistory('모션 명령 편집', before, captureSceneSnapshot());
    renderMotionProgramPanel();
}

function clearProgramStepDropIndicators() {
    el.programStepList?.querySelectorAll('.dragging, .drag-over-before, .drag-over-after')
        .forEach((row) => row.classList.remove('dragging', 'drag-over-before', 'drag-over-after'));
}

function getProgramStepDropTarget(event) {
    const rows = [...(el.programStepList?.querySelectorAll('[data-program-step-id]') || [])];
    if (!rows.length) return null;
    const directRow = event.target.closest?.('[data-program-step-id]');
    if (directRow && el.programStepList.contains(directRow)) {
        const bounds = directRow.getBoundingClientRect();
        return {
            row: directRow,
            stepId: directRow.dataset.programStepId,
            placeAfter: event.clientY >= bounds.top + bounds.height / 2
        };
    }
    const nextRow = rows.find((row) => {
        const bounds = row.getBoundingClientRect();
        return event.clientY < bounds.top + bounds.height / 2;
    });
    const row = nextRow || rows.at(-1);
    return {
        row,
        stepId: row.dataset.programStepId,
        placeAfter: !nextRow
    };
}

function quaternionFromTcpRotationDegrees(robot, rx, ry, rz) {
    if (robot.userData.manifest?.robotType === 'scara' && robot.userData.toolHomeQuaternion) {
        const yaw = new THREE.Quaternion().setFromAxisAngle(
            new THREE.Vector3(0, 0, 1),
            THREE.MathUtils.degToRad(rz)
        );
        return yaw.multiply(robot.userData.toolHomeQuaternion.clone()).normalize();
    }
    const positionRotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(
        THREE.MathUtils.degToRad(rx),
        THREE.MathUtils.degToRad(ry),
        THREE.MathUtils.degToRad(rz),
        'ZYX'
    ));
    const homeQuaternion = robot.userData.toolHomeQuaternion;
    if (!homeQuaternion) return positionRotation;
    return homeQuaternion.clone()
        .multiply(SIX_AXIS_POSITION_HOME_QUATERNION.clone().invert())
        .multiply(positionRotation)
        .normalize();
}

function handleProgramStepDragStart(event) {
    const handle = event.target.closest?.('[data-program-step-drag]');
    const row = handle?.closest('[data-program-step-id]');
    if (!handle || !row || isMotionActive()) {
        event.preventDefault();
        return;
    }
    state.programStepDragId = handle.dataset.programStepDrag;
    row.classList.add('dragging');
    if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', state.programStepDragId);
    }
}

function handleProgramStepDragOver(event) {
    if (!state.programStepDragId || isMotionActive()) return;
    const target = getProgramStepDropTarget(event);
    if (!target) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    el.programStepList.querySelectorAll('.drag-over-before, .drag-over-after').forEach((row) => {
        row.classList.remove('drag-over-before', 'drag-over-after');
    });
    target.row.classList.add(target.placeAfter ? 'drag-over-after' : 'drag-over-before');
}

function handleProgramStepDrop(event) {
    if (!state.programStepDragId || isMotionActive()) return;
    const target = getProgramStepDropTarget(event);
    if (!target) return;
    event.preventDefault();
    const sourceStepId = state.programStepDragId;
    const program = ensureMotionProgram(state.activeProgramRobot);
    const before = captureSceneSnapshot();
    const changed = reorderMotionSteps(program?.steps, sourceStepId, target.stepId, target.placeAfter);
    state.programStepDragId = null;
    clearProgramStepDropIndicators();
    if (!changed) return;
    program.selectedStepId = sourceStepId;
    recordHistory('모션 포인트 순서 변경', before, captureSceneSnapshot());
    renderMotionProgramPanel();
}

function handleProgramStepDragEnd() {
    state.programStepDragId = null;
    clearProgramStepDropIndicators();
}

function toggleAllProgramRobots() {
    if (isMotionActive()) return;
    const robots = getArticulatedRobots();
    if (!robots.length) return;
    const before = captureSceneSnapshot();
    const shouldSelect = robots.some((robot) => !ensureMotionProgram(robot).included);
    robots.forEach((robot) => { ensureMotionProgram(robot).included = shouldSelect; });
    recordHistory(
        shouldSelect ? '동시 실행 로봇 전체 선택' : '동시 실행 로봇 전체 해제',
        before,
        captureSceneSnapshot()
    );
    renderMotionProgramPanel();
}

function pointQuadrantIndex(angleDegrees) {
    const angle = Number(angleDegrees) || 0;
    return Math.floor((angle + 1e-9) / 90);
}

function calculatePointArmParameters(robot, jointAngles, preservedConfiguration = null) {
    const angles = Array.isArray(jointAngles)
        ? jointAngles.map((value) => Number(value) || 0)
        : (robot?.userData.joints || []).map((joint) => joint.angle);
    if (robot?.userData.manifest?.robotType === 'scara') {
        const elbowAngle = angles[1] || 0;
        return [elbowAngle < 0 ? -1 : 1, 0, 0, pointQuadrantIndex(angles[3] || 0)];
    }
    return [
        pointQuadrantIndex(angles[0] || 0),
        pointQuadrantIndex(angles[3] || 0),
        pointQuadrantIndex(angles[5] || 0),
        Number.isInteger(preservedConfiguration) ? preservedConfiguration : 1
    ];
}

function captureRobotMotionStep(robot, existing = null) {
    const pose = getCurrentTcpPoseBase(robot);
    if (!pose) return null;
    const program = ensureMotionProgram(robot);
    const motion = existing?.motion || 'MOVJ';
    const joints = robot.userData.joints.map((joint) => joint.angle);
    const isPoint = isMotionPointMotion(motion);
    const pointIndex = isPoint
        ? (Number.isInteger(existing?.pointIndex) ? existing.pointIndex : nextAvailablePointIndex(program, existing))
        : null;
    if (isPoint && pointIndex === null) {
        setMotionProgramStatus('사용 가능한 포인트 번호가 없습니다.', 'error');
        return null;
    }
    return {
        id: existing?.id || createMotionId('point'),
        name: isPoint
            ? formatMotionPointName(pointIndex)
            : motion === 'DELAY'
                ? 'Delay'
                : motion === 'TIME_START'
                    ? 'Time Start'
                    : 'Time Out',
        motion,
        ...(isPoint ? {
            pointIndex,
            label: existing?.label || '',
            armParameters: calculatePointArmParameters(robot, joints, existing?.armParameters?.[3]),
            externalAxes: Array.isArray(existing?.externalAxes)
                ? [...existing.externalAxes]
                : [0, 0, 0, 0, 0, 0]
        } : {}),
        ...(motion === 'DELAY'
            ? { delaySeconds: existing?.delaySeconds ?? DEFAULT_DELAY_SECONDS }
            : motion === 'MOVJ' || motion === 'MOVL'
                ? { speed: existing?.speed ?? DEFAULT_MOVJ_SPEED }
                : {}),
        joints,
        tcp: {
            position: pose.position.toArray(),
            quaternion: pose.quaternion.toArray()
        }
    };
}

function addCurrentMotionStep() {
    if (isMotionActive() || !state.activeProgramRobot) return;
    const before = captureSceneSnapshot();
    const program = ensureMotionProgram(state.activeProgramRobot);
    const step = captureRobotMotionStep(state.activeProgramRobot);
    if (!step) return;
    insertMotionStepAfterSelected(program, step);
    program.selectedStepId = step.id;
    recordHistory('모션 포인트 추가', before, captureSceneSnapshot());
    renderMotionProgramPanel();
}

function addDelayMotionStep() {
    if (isMotionActive() || !state.activeProgramRobot) return;
    const before = captureSceneSnapshot();
    const program = ensureMotionProgram(state.activeProgramRobot);
    const step = captureRobotMotionStep(state.activeProgramRobot);
    if (!step) return;
    step.name = 'Delay';
    step.motion = 'DELAY';
    delete step.pointIndex;
    delete step.label;
    delete step.armParameters;
    delete step.externalAxes;
    delete step.speed;
    step.delaySeconds = DEFAULT_DELAY_SECONDS;
    insertMotionStepAfterSelected(program, step);
    program.selectedStepId = step.id;
    recordHistory('딜레이 명령 추가', before, captureSceneSnapshot());
    renderMotionProgramPanel();
}

function addTimerMotionStep(motion) {
    if (isMotionActive() || !state.activeProgramRobot || !['TIME_START', 'TIME_OUT'].includes(motion)) return;
    const before = captureSceneSnapshot();
    const program = ensureMotionProgram(state.activeProgramRobot);
    const step = captureRobotMotionStep(state.activeProgramRobot);
    if (!step) return;
    step.name = motion === 'TIME_START' ? 'Time Start' : 'Time Out';
    step.motion = motion;
    delete step.pointIndex;
    delete step.label;
    delete step.armParameters;
    delete step.externalAxes;
    delete step.speed;
    delete step.delaySeconds;
    insertMotionStepAfterSelected(program, step);
    program.selectedStepId = step.id;
    recordHistory(motion === 'TIME_START' ? 'TIME START 명령 추가' : 'TIME OUT 명령 추가', before, captureSceneSnapshot());
    renderMotionProgramPanel();
}

function insertMotionStepAfterSelected(program, step) {
    const selectedIndex = program.steps.findIndex((candidate) => candidate.id === program.selectedStepId);
    program.steps.splice(selectedIndex >= 0 ? selectedIndex + 1 : program.steps.length, 0, step);
}

function updateSelectedMotionStep() {
    if (isMotionActive() || !state.activeProgramRobot) return;
    const program = ensureMotionProgram(state.activeProgramRobot);
    const index = program.steps.findIndex((step) => step.id === program.selectedStepId);
    if (index < 0) return;
    const before = captureSceneSnapshot();
    program.steps[index] = captureRobotMotionStep(state.activeProgramRobot, program.steps[index]);
    recordHistory('모션 포인트 덮어쓰기', before, captureSceneSnapshot());
    renderMotionProgramPanel();
    showProgramPointOverwriteFeedback(program.steps[index]);
}

function showProgramPointOverwriteFeedback(step) {
    const button = el.btnProgramUpdate;
    if (!button) return;
    const icon = button.querySelector('i');
    button.classList.add('success');
    icon?.classList.replace('fa-rotate', 'fa-check');
    setMotionProgramStatus('{name} 위치 값을 수정했습니다.', '', { name: formatMotionPointName(step.pointIndex) });
    window.clearTimeout(button._feedbackTimer);
    button._feedbackTimer = window.setTimeout(() => {
        button.classList.remove('success');
        icon?.classList.replace('fa-check', 'fa-rotate');
    }, 700);
}

function deleteSelectedMotionStep() {
    if (isMotionActive()) return;
    const program = ensureMotionProgram(state.activeProgramRobot);
    const index = program?.steps.findIndex((step) => step.id === program.selectedStepId) ?? -1;
    if (index < 0) return;
    const before = captureSceneSnapshot();
    program.steps.splice(index, 1);
    program.selectedStepId = program.steps[Math.min(index, program.steps.length - 1)]?.id || null;
    recordHistory('모션 포인트 삭제', before, captureSceneSnapshot());
    renderMotionProgramPanel();
}

function updateMotionRepeat(event) {
    const scope = event.currentTarget?.dataset.programRepeatScope === 'robot' ? 'robot' : 'group';
    const stateKey = scope === 'robot' ? 'motionRepeatRobot' : 'motionRepeat';
    const before = isMotionActive() ? null : captureSceneSnapshot();
    state[stateKey] = !state[stateKey];
    state.motionSessions.forEach((session) => {
        if (!session.stepIntoStepId && session.controlScope === scope) session.repeat = state[stateKey];
    });
    syncMotionRepeatControl();
    if (before) recordHistory('반복 실행 변경', before, captureSceneSnapshot());
    else scheduleMotionProjectSave();
    renderMotionProgramPanel();
}

function syncMotionRepeatControl() {
    el.programRepeatButtons.forEach((button) => {
        const enabled = button.dataset.programRepeatScope === 'robot'
            ? state.motionRepeatRobot
            : state.motionRepeat;
        button.classList.toggle('active', enabled);
        button.setAttribute('aria-pressed', String(enabled));
        button.title = uiText(enabled ? '반복 실행 켜짐' : '반복 실행 꺼짐');
    });
}

function updateMotionUiLock() {
    const locked = isMotionActive();
    if (el.modelSelect) el.modelSelect.disabled = locked;
    if (el.btnImport3D) el.btnImport3D.disabled = locked;
    if (el.btnToggleTransform) el.btnToggleTransform.disabled = locked;
    if (el.btnAddMode) el.btnAddMode.disabled = locked;
    if (el.modelTree) el.modelTree.classList.toggle('motion-locked', locked);
    el.jogPanel?.querySelectorAll('button:not([data-panel-action]), input')
        .forEach((control) => { control.disabled = locked; });
    el.jogPanel?.querySelectorAll('[data-panel-action]')
        .forEach((control) => { control.disabled = false; });
    el.modelTransformPanel?.querySelectorAll('button, input').forEach((control) => { control.disabled = locked; });
    el.programPanel?.querySelectorAll('[data-program-edit], [data-program-robot-include], [data-program-step-select], [data-program-robot-select]')
        .forEach((control) => { control.disabled = locked; });
    el.programRepeatButtons.forEach((button) => { button.disabled = false; });
    if (locked) {
        setTransformHandlesEnabled(false);
        setBaseJogGizmoEnabled(false);
    }
    updateSimulationSnapButton();
    updateHistoryButtons();
}

function serializeMotionProject() {
    return {
        schemaVersion: MOTION_PROJECT_SCHEMA_VERSION,
        repeatCurrentRobot: state.motionRepeatRobot,
        repeat: state.motionRepeat,
        robots: getArticulatedRobots().map((robot) => {
            const program = ensureMotionProgram(robot);
            return {
                instanceId: robot.userData.motionInstanceId,
                modelFolder: robot.userData.motionModelFolder,
                displayName: robot.userData.motionDisplayName,
                robotType: robot.userData.motionRobotType || robot.userData.manifest?.robotType,
                jointCount: robot.userData.joints.length,
                included: program.included,
                baseTransform: {
                    position: robot.position.toArray(),
                    quaternion: robot.quaternion.toArray(),
                    scale: robot.scale.toArray()
                },
                steps: program.steps.map((step) => ({
                    id: step.id,
                    name: step.name,
                    motion: step.motion,
                    ...(isMotionPointMotion(step.motion) ? {
                        pointIndex: step.pointIndex,
                        label: step.label || '',
                        armParameters: [...(step.armParameters || calculatePointArmParameters(robot, step.joints))],
                        externalAxes: [...(step.externalAxes || [0, 0, 0, 0, 0, 0])]
                    } : {}),
                    ...(step.motion === 'DELAY'
                        ? { delaySeconds: step.delaySeconds }
                        : step.motion === 'MOVJ' || step.motion === 'MOVL'
                            ? { speed: step.speed }
                            : {}),
                    joints: [...step.joints],
                    tcp: {
                        position: [...step.tcp.position],
                        quaternion: [...step.tcp.quaternion]
                    }
                }))
            };
        })
    };
}

function saveMotionProjectNow() {
    window.clearTimeout(state.motionSaveTimer);
    state.motionSaveTimer = null;
    try {
        localStorage.setItem(MOTION_PROJECT_STORAGE_KEY, JSON.stringify(serializeMotionProject()));
    } catch (error) {
        console.warn('Motion project autosave failed:', error);
    }
}

function scheduleMotionProjectSave() {
    window.clearTimeout(state.motionSaveTimer);
    state.motionSaveTimer = window.setTimeout(saveMotionProjectNow, 180);
}

function findMotionModelDefinition(robotProject) {
    return [...state.catalog.values()].find((definition) => (
        definition.type === 'articulated-stl'
        && definition.folder === robotProject.modelFolder
        && (!robotProject.robotType || definition.robotType === robotProject.robotType)
    )) || null;
}

async function restoreMotionProjectData(input) {
    if (isMotionActive()) throw new Error('Stop all robot motions before loading a project.');
    const project = normalizeMotionProject(input);
    const definitions = project.robots.map((robotProject) => {
        const definition = findMotionModelDefinition(robotProject);
        if (!definition) throw new Error(`Robot model is unavailable: ${robotProject.modelFolder}`);
        if ((definition.limits || []).length !== robotProject.jointCount) {
            throw new Error(`Joint count does not match the current catalog: ${robotProject.displayName}`);
        }
        return definition;
    });

    setTransformHandlesEnabled(false);
    setBaseJogGizmoEnabled(false);
    const replacedRobots = new Set(getArticulatedRobots());
    const removedModels = new Set([
        ...replacedRobots,
        ...state.models.filter((model) => replacedRobots.has(model.userData.attachmentHost))
    ]);
    removedModels.forEach((model) => model.removeFromParent());
    state.models = state.models.filter((model) => !removedModels.has(model));
    state.motionPrograms.clear();
    state.activeArticulatedModel = null;
    state.activeProgramRobot = null;

    for (let index = 0; index < project.robots.length; index += 1) {
        const robotProject = project.robots[index];
        const definition = definitions[index];
        showLoading(true, uiFormat('{name} 불러오는 중...', { name: robotProject.displayName }));
        const robot = await loadArticulatedRobot(definition, (progress) => {
            showLoading(true, uiFormat('{name}: {progress}%', {
                name: robotProject.displayName,
                progress
            }));
        });
        robot.userData.modelName = definition.name;
        assignRobotInstanceMetadata(robot, definition, {
            instanceId: robotProject.instanceId,
            displayName: robotProject.displayName,
            modelFolder: robotProject.modelFolder,
            robotType: robotProject.robotType
        });
        robot.position.fromArray(robotProject.baseTransform.position);
        robot.quaternion.fromArray(robotProject.baseTransform.quaternion);
        robot.scale.fromArray(robotProject.baseTransform.scale);
        robot.updateMatrixWorld(true);
        state.models.push(robot);
        state.scene.add(robot);
        ensureModelTreeId(robot);
        const program = cloneMotionProgram({
            included: robotProject.included,
            selectedStepId: robotProject.steps[0]?.id || null,
            steps: robotProject.steps
        });
        state.motionPrograms.set(robotProject.instanceId, program);
        captureCurrentTcpTarget(robot);
    }

    state.motionRepeatRobot = project.repeatCurrentRobot;
    state.motionRepeat = project.repeat;
    syncMotionRepeatControl();
    state.activeArticulatedModel = getArticulatedRobots()[0] || null;
    state.activeProgramRobot = state.activeArticulatedModel;
    if (state.activeArticulatedModel) {
        renderJogControls(state.activeArticulatedModel);
        showMotionProgramPanel();
    } else {
        hideJogPanel();
    }
    updateUIStatus();
    selectSceneModel(state.activeArticulatedModel || state.models.at(-1) || null);
    renderMotionProgramPanel();
    showLoading(false);
    if (state.models.length) fitCamera();
    scheduleMotionProjectSave();
    return project;
}

async function restoreMotionProjectFromStorage() {
    let raw = null;
    try {
        raw = localStorage.getItem(MOTION_PROJECT_STORAGE_KEY);
    } catch (error) {
        console.warn('Motion project autosave is unavailable:', error);
    }
    if (!raw) {
        renderMotionProgramPanel();
        return;
    }
    try {
        await restoreMotionProjectData(JSON.parse(raw));
        setMotionProgramStatus('자동 저장된 프로젝트를 복원했습니다.');
    } catch (error) {
        console.error('Motion project restore failed:', error);
        showLoading(false);
        setMotionProgramStatus('프로젝트 복원에 실패했습니다.', 'error');
    }
}

function formatPositionPointRecord(robot, step) {
    const pose = motionStepTargetPose(step);
    const rotation = getTcpRotationDegrees(robot, pose);
    return formatPositionPointRecordLine({
        pointIndex: step.pointIndex,
        coordinates: [
            pose.position.x,
            pose.position.y,
            pose.position.z,
            rotation.rz,
            rotation.ry,
            rotation.rx
        ],
        armParameters: step.armParameters || calculatePointArmParameters(robot, step.joints),
        externalAxes: step.externalAxes || [0, 0, 0, 0, 0, 0],
        label: step.label
    });
}

async function exportPositionPoints() {
    const robot = state.activeProgramRobot;
    const program = ensureMotionProgram(robot);
    const points = (program?.steps || [])
        .filter((step) => isMotionPointMotion(step.motion))
        .sort((left, right) => left.pointIndex - right.pointIndex);
    if (!robot || points.length === 0) {
        setMotionProgramStatus('내보낼 위치 포인트가 없습니다.', 'error');
        setStatus('내보낼 위치 포인트가 없습니다.', '#ef4444');
        return;
    }
    const used = new Set();
    for (const step of points) {
        if (!Number.isInteger(step.pointIndex)
            || step.pointIndex < MIN_POINT_INDEX
            || step.pointIndex > MAX_POINT_INDEX
            || used.has(step.pointIndex)) {
            setMotionProgramStatus('포인트 번호를 확인하세요. 중복되거나 범위를 벗어난 번호가 있습니다.', 'error');
            return;
        }
        if (!isValidMotionPointLabel(step.label || '')) {
            setMotionProgramStatus('{name} 라벨 형식이 올바르지 않습니다.', 'error', {
                name: formatMotionPointName(step.pointIndex)
            });
            return;
        }
        used.add(step.pointIndex);
    }

    const content = `${points.map((step) => formatPositionPointRecord(robot, step)).join('\r\n')}\r\n`;
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    try {
        if (typeof window.showSaveFilePicker === 'function') {
            const fileHandle = await window.showSaveFilePicker({
                id: 'inorobot-position-points',
                suggestedName: 'Point_export.txt',
                startIn: 'documents',
                excludeAcceptAllOption: true,
                types: [{
                    description: 'InoRobotLab Position Points',
                    accept: { 'text/plain': ['.txt'] }
                }]
            });
            const writable = await fileHandle.createWritable();
            await writable.write(blob);
            await writable.close();
            setMotionProgramStatus('위치 값 내보내기 완료: {name}', '', { name: fileHandle.name });
        } else {
            saveAs(blob, 'Point_export.txt');
            setMotionProgramStatus('위치 값 내보내기 완료: {name}', '', { name: 'Point_export.txt' });
        }
        setStatus('위치 값 내보내기 완료', '#22c55e');
    } catch (error) {
        if (error?.name === 'AbortError') {
            setMotionProgramStatus('위치 값 내보내기를 취소했습니다.');
            return;
        }
        console.error('Position point export failed:', error);
        setMotionProgramStatus('위치 값 내보내기에 실패했습니다.', 'error');
        setStatus('위치 값 내보내기에 실패했습니다.', '#ef4444');
    }
}

async function exportMotionProject() {
    const suggestedName = `3D-Simulation-Motion-Project-${new Date().toISOString().slice(0, 10)}.json`;
    try {
        const project = normalizeMotionProject(serializeMotionProject());
        const blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json;charset=utf-8' });
        if (typeof window.showSaveFilePicker === 'function') {
            const fileHandle = await window.showSaveFilePicker({
                id: 'inorobot-motion-project',
                suggestedName,
                startIn: 'documents',
                excludeAcceptAllOption: true,
                types: [{
                    description: '3D Simulation Motion Project',
                    accept: { 'application/json': ['.json'] }
                }]
            });
            const writable = await fileHandle.createWritable();
            await writable.write(blob);
            await writable.close();
            setMotionProgramStatus('프로젝트 저장됨: {name}', '', { name: fileHandle.name });
        } else {
            saveAs(blob, suggestedName);
            setMotionProgramStatus('프로젝트를 다운로드했습니다. 이 브라우저에서는 폴더를 선택할 수 없습니다.');
        }
    } catch (error) {
        if (error?.name === 'AbortError') {
            setMotionProgramStatus('프로젝트 저장을 취소했습니다.');
            return;
        }
        setMotionProgramStatus('프로젝트 내보내기에 실패했습니다.', 'error');
    }
}

async function handleMotionProjectImport() {
    const file = el.inputProgramImport?.files?.[0];
    if (el.inputProgramImport) el.inputProgramImport.value = '';
    if (!file || isMotionActive()) return;
    const before = captureSceneSnapshot();
    try {
        const project = JSON.parse(await file.text());
        await restoreMotionProjectData(project);
        recordHistory('모션 프로젝트 불러오기', before, captureSceneSnapshot());
        setMotionProgramStatus('{name}을(를) 불러왔습니다.', '', { name: file.name });
    } catch (error) {
        applySceneSnapshot(before);
        showLoading(false);
        setMotionProgramStatus('프로젝트 불러오기에 실패했습니다.', 'error');
    }
}

function restoreRobotJointAngles(robot, angles) {
    angles.forEach((angle, index) => setJointAngle(robot.userData.joints[index], angle, false));
    robot.updateMatrixWorld(true);
    syncJointControls(robot);
    if (robot === state.activeArticulatedModel) captureCurrentTcpTarget(robot);
}

function motionStepTargetPose(step) {
    return {
        position: new THREE.Vector3().fromArray(step.tcp.position),
        quaternion: new THREE.Quaternion().fromArray(step.tcp.quaternion).normalize()
    };
}

function validateMovjTarget(robot, step) {
    const joints = robot.userData.joints;
    if (!Array.isArray(step.joints) || step.joints.length !== joints.length) {
        throw new Error(`${step.name}: joint count mismatch.`);
    }
    step.joints.forEach((value, index) => {
        const joint = joints[index];
        if (!Number.isFinite(value) || value < joint.definition.min - 1e-7 || value > joint.definition.max + 1e-7) {
            throw new Error(`${step.name}: ${joint.definition.name} is outside its joint limit.`);
        }
    });
}

function solveMovlSamples(robot, target, label) {
    const start = getCurrentTcpPoseBase(robot);
    const distance = start.position.distanceTo(target.position);
    const rotation = THREE.MathUtils.radToDeg(start.quaternion.angleTo(target.quaternion));
    const samples = Math.max(1, Math.min(240, Math.ceil(Math.max(
        distance / MOTION_MOVL_SAMPLE_DISTANCE,
        rotation / MOTION_MOVL_SAMPLE_ANGLE
    ))));
    for (let sample = 1; sample <= samples; sample += 1) {
        const alpha = sample / samples;
        const pose = {
            position: new THREE.Vector3().fromArray(interpolateLinearPosition(
                start.position.toArray(),
                target.position.toArray(),
                alpha
            )),
            quaternion: new THREE.Quaternion().fromArray(slerpQuaternion(
                start.quaternion.toArray(),
                target.quaternion.toArray(),
                alpha
            ))
        };
        const previousAngles = robot.userData.joints.map((joint) => joint.angle);
        const result = solveRobotIK(robot, pose);
        if (!result.success) {
            restoreRobotJointAngles(robot, previousAngles);
            throw new Error(`${label}: unreachable, singular, or outside joint limits.`);
        }
    }
}

function preflightRobotMotion(robot, steps) {
    if (!robot?.userData.joints?.length || !robot.userData.tcpFrame) {
        throw new Error('This model does not provide articulated kinematics.');
    }
    if (!steps.length) throw new Error(`${robot.userData.motionDisplayName}: no motion points.`);
    const originalAngles = robot.userData.joints.map((joint) => joint.angle);
    let timerAvailable = Number.isFinite(ensureMotionProgram(robot).cycleTimerStartedAt);
    try {
        steps.forEach((step) => {
            if (step.motion === 'TIME_START') {
                timerAvailable = true;
                return;
            }
            if (step.motion === 'TIME_OUT') {
                if (!timerAvailable) throw new Error(`${step.name}: TIME START must run before TIME OUT.`);
                timerAvailable = false;
                return;
            }
            if (step.motion === 'DELAY') {
                if (!Number.isFinite(step.delaySeconds)
                    || step.delaySeconds < MIN_DELAY_SECONDS
                    || step.delaySeconds > MAX_DELAY_SECONDS) {
                    throw new Error(`${step.name}: delay must be ${MIN_DELAY_SECONDS} to ${MAX_DELAY_SECONDS} seconds.`);
                }
                return;
            }
            if (step.motion === 'MOVJ') {
                validateMovjTarget(robot, step);
                step.joints.forEach((angle, index) => setJointAngle(robot.userData.joints[index], angle, false));
                robot.updateMatrixWorld(true);
            } else if (step.motion === 'MOVL') {
                const maximumSpeed = robot.userData.manifest.cartesianMotion.maxSpeed;
                if (!Number.isFinite(step.speed) || step.speed < 1 || step.speed > maximumSpeed) {
                    throw new Error(`${step.name}: MOVL speed must be 1 to ${maximumSpeed} mm/s.`);
                }
                validateMovjTarget(robot, step);
                solveMovlSamples(robot, motionStepTargetPose(step), step.name);
                step.joints.forEach((angle, index) => setJointAngle(robot.userData.joints[index], angle, false));
                robot.updateMatrixWorld(true);
                const settled = getCurrentTcpPoseBase(robot);
                const target = motionStepTargetPose(step);
                if (settled.position.distanceTo(target.position) > 0.8
                    || THREE.MathUtils.radToDeg(settled.quaternion.angleTo(target.quaternion)) > 0.35) {
                    throw new Error(`${step.name}: stored TCP and joint targets are inconsistent.`);
                }
            } else {
                throw new Error(`${step.name}: unsupported program command.`);
            }
        });
    } finally {
        restoreRobotJointAngles(robot, originalAngles);
    }
}

function createMotionSession(robot, steps, startAt, options = {}) {
    const controlScope = options.controlScope === 'robot' ? 'robot' : 'group';
    return {
        robot,
        steps,
        cursor: 0,
        currentStepId: null,
        segment: null,
        startAt,
        nextSegmentStartAt: startAt,
        repeat: options.repeat ?? (controlScope === 'robot' ? state.motionRepeatRobot : state.motionRepeat),
        controlScope,
        stepIntoStepId: typeof options.stepIntoStepId === 'string' ? options.stepIntoStepId : null,
        status: 'running',
        pauseStarted: 0
    };
}

function startRobotMotionPlans(plans) {
    if (isMotionActive() || plans.length === 0) return;
    try {
        plans.forEach(({ robot, steps }) => preflightRobotMotion(robot, steps));
    } catch (error) {
        setMotionProgramStatus('모션 경로 검증에 실패했습니다.', 'error');
        return;
    }
    commitAllPendingHistories();
    state.motionHistoryBefore = captureSceneSnapshot();
    const startAt = performance.now() + 40;
    plans.forEach(({ robot, steps, repeat, controlScope, stepIntoStepId }) => {
        const program = ensureMotionProgram(robot);
        program.status = 'running';
        program.progress = 0;
        state.motionSessions.set(robot.userData.motionInstanceId, createMotionSession(robot, steps, startAt, {
            repeat,
            controlScope,
            stepIntoStepId
        }));
    });
    setMotionProgramStatus('{count}대의 로봇 모션을 시작했습니다.', 'working', { count: plans.length });
    updateMotionUiLock();
    renderMotionProgramPanel();
}

function createStepIntoPlan(robot) {
    if (!robot) return null;
    const program = ensureMotionProgram(robot);
    if (!program?.steps.length) return null;
    const selectedIndex = program.steps.findIndex((step) => step.id === program.selectedStepId);
    const step = program.steps[selectedIndex >= 0 ? selectedIndex : 0];
    return {
        robot,
        steps: [step],
        repeat: false,
        stepIntoStepId: step.id
    };
}

function stepIntoActiveRobot() {
    const plan = createStepIntoPlan(state.activeProgramRobot);
    if (plan) startRobotMotionPlans([{ ...plan, controlScope: 'robot' }]);
}

function stepIntoCheckedRobots() {
    const plans = getArticulatedRobots()
        .filter((robot) => ensureMotionProgram(robot).included)
        .map(createStepIntoPlan)
        .filter(Boolean)
        .map((plan) => ({ ...plan, controlScope: 'group' }));
    startRobotMotionPlans(plans);
}

function runActiveRobotProgram() {
    const robot = state.activeProgramRobot;
    if (robot && resumePausedRobotMotions([robot])) return;
    const program = ensureMotionProgram(robot);
    if (robot && program?.steps.length) startRobotMotionPlans([{
        robot,
        steps: program.steps,
        repeat: state.motionRepeatRobot,
        controlScope: 'robot'
    }]);
}

function runCheckedRobotPrograms() {
    const robots = getArticulatedRobots()
        .filter((robot) => ensureMotionProgram(robot).included);
    if (resumePausedRobotMotions(robots)) return;
    const plans = robots
        .map((robot) => ({ robot, program: ensureMotionProgram(robot) }))
        .filter(({ program }) => program.steps.length)
        .map(({ robot, program }) => ({
            robot,
            steps: program.steps,
            repeat: state.motionRepeat,
            controlScope: 'group'
        }));
    startRobotMotionPlans(plans);
}

function setMotionSessionPaused(session, paused, now = performance.now()) {
    if (!session || (paused && session.status !== 'running') || (!paused && session.status !== 'paused')) return;
    if (paused) {
        session.status = 'paused';
        session.pauseStarted = now;
    } else {
        const delay = Math.max(0, now - session.pauseStarted);
        session.startAt += delay;
        session.nextSegmentStartAt += delay;
        if (session.segment) session.segment.startTime += delay;
        const program = ensureMotionProgram(session.robot);
        if (Number.isFinite(program.cycleTimerStartedAt)) program.cycleTimerStartedAt += delay;
        session.status = 'running';
        session.pauseStarted = 0;
    }
    ensureMotionProgram(session.robot).status = session.status;
}

function pauseRobotMotions(robots) {
    const sessions = robots.map(getMotionSession).filter((session) => session?.status === 'running');
    if (!sessions.length) return false;
    const now = performance.now();
    sessions.forEach((session) => setMotionSessionPaused(session, true, now));
    setMotionProgramStatus('모션이 일시정지되었습니다.', 'working');
    renderMotionProgramPanel();
    return true;
}

function resumePausedRobotMotions(robots) {
    const sessions = robots.map(getMotionSession).filter((session) => session?.status === 'paused');
    if (!sessions.length) return false;
    const now = performance.now();
    sessions.forEach((session) => setMotionSessionPaused(session, false, now));
    setMotionProgramStatus('모션을 재개했습니다.', 'working');
    renderMotionProgramPanel();
    return true;
}

function pauseActiveRobotMotion() {
    if (state.activeProgramRobot) pauseRobotMotions([state.activeProgramRobot]);
}

function pauseCheckedRobotMotions() {
    pauseRobotMotions(getArticulatedRobots().filter((robot) => ensureMotionProgram(robot).included));
}

function finalizeMotionHistoryIfIdle() {
    if (isMotionActive()) return;
    const before = state.motionHistoryBefore;
    state.motionHistoryBefore = null;
    if (before) recordHistory('멀티 로봇 모션', before, captureSceneSnapshot());
    updateMotionUiLock();
    renderMotionProgramPanel();
    scheduleMotionProjectSave();
}

function finishRobotMotionSession(session, status, message = '', replacements = {}) {
    const robot = session.robot;
    state.motionSessions.delete(robot.userData.motionInstanceId);
    const program = ensureMotionProgram(robot);
    program.status = status;
    if (status === 'error' || (status === 'completed' && !session.stepIntoStepId)) {
        program.cycleTimerStartedAt = null;
    }
    if (status === 'completed' && session.stepIntoStepId && program.steps.length) {
        const completedIndex = program.steps.findIndex((step) => step.id === session.stepIntoStepId);
        const nextIndex = completedIndex >= 0 ? (completedIndex + 1) % program.steps.length : 0;
        program.selectedStepId = program.steps[nextIndex].id;
        program.progress = nextIndex / program.steps.length;
    } else if (status === 'completed') {
        program.progress = 1;
    }
    syncJointControls(robot);
    if (robot === state.activeArticulatedModel) captureCurrentTcpTarget(robot);
    if (message) setMotionProgramStatus(message, status === 'error' ? 'error' : '', replacements);
    renderMotionProgramPanel();
    finalizeMotionHistoryIfIdle();
}

function stopRobotMotions(robots) {
    let stopped = 0;
    robots.forEach((robot) => {
        const session = getMotionSession(robot);
        if (!session) return;
        state.motionSessions.delete(robot.userData.motionInstanceId);
        const program = ensureMotionProgram(robot);
        program.status = 'stopped';
        program.cycleTimerStartedAt = null;
        stopped += 1;
    });
    if (stopped) setMotionProgramStatus('{count}대의 로봇 모션을 정지했습니다.', '', { count: stopped });
    finalizeMotionHistoryIfIdle();
    renderMotionProgramPanel();
}

function stopActiveRobotMotion() {
    if (state.activeProgramRobot) stopRobotMotions([state.activeProgramRobot]);
}

function stopCheckedRobotMotions() {
    stopRobotMotions(getArticulatedRobots().filter((robot) => ensureMotionProgram(robot).included));
}

function createMotionSegment(session, timestamp) {
    const { robot } = session;
    const step = session.steps[session.cursor];
    if (!step) return null;
    session.currentStepId = step.id;
    if (step.motion === 'TIME_START' || step.motion === 'TIME_OUT') {
        return {
            type: step.motion,
            step,
            startTime: timestamp
        };
    }
    if (step.motion === 'DELAY') {
        return {
            type: 'DELAY',
            step,
            startTime: timestamp,
            duration: calculateDelayDuration(step.delaySeconds) * 1000
        };
    }
    if (step.motion === 'MOVJ') {
        validateMovjTarget(robot, step);
        const startAngles = robot.userData.joints.map((joint) => joint.angle);
        const motionDuration = calculateMovjDuration(
            startAngles,
            step.joints,
            robot.userData.joints,
            step.speed
        ) * 1000;
        return {
            type: 'MOVJ',
            step,
            startAngles,
            targetAngles: [...step.joints],
            startTime: timestamp,
            motionDuration,
            duration: motionDuration + MOTION_SETTLING_DELAY_SECONDS * 1000
        };
    }
    const startPose = getCurrentTcpPoseBase(robot);
    const targetPose = motionStepTargetPose(step);
    const motionDuration = calculateMovlDuration(
        startPose.position.distanceTo(targetPose.position),
        THREE.MathUtils.radToDeg(startPose.quaternion.angleTo(targetPose.quaternion)),
        step.speed,
        robot.userData.manifest.cartesianMotion
    ) * 1000;
    return {
        type: 'MOVL',
        step,
        startPose,
        targetPose,
        startTime: timestamp,
        motionDuration,
        duration: motionDuration + MOTION_SETTLING_DELAY_SECONDS * 1000
    };
}

function advanceMotionSegment(session, timestamp) {
    const { robot, segment } = session;
    if (segment.type === 'TIME_START' || segment.type === 'TIME_OUT') {
        const program = ensureMotionProgram(robot);
        const markerTime = segment.startTime;
        if (segment.type === 'TIME_START') {
            program.cycleTimerStartedAt = markerTime;
            program.lastCycleTimeSeconds = null;
        } else {
            if (!Number.isFinite(program.cycleTimerStartedAt)) {
                throw new Error(`${segment.step.name}: TIME START must run before TIME OUT.`);
            }
            program.lastCycleTimeSeconds = calculateCycleElapsedSeconds(program.cycleTimerStartedAt, markerTime);
            program.cycleTimerStartedAt = null;
            setMotionProgramStatus(
                '{name} 사이클 타임: {seconds} s',
                '',
                {
                    name: robot.userData.motionDisplayName,
                    seconds: program.lastCycleTimeSeconds.toFixed(3)
                }
            );
        }
        program.progress = (session.cursor + 1) / session.steps.length;
        return true;
    }
    const elapsed = timestamp - segment.startTime;
    const motionDuration = Number.isFinite(segment.motionDuration)
        ? segment.motionDuration
        : segment.duration;
    const linearProgress = THREE.MathUtils.clamp(elapsed / motionDuration, 0, 1);
    const progress = sCurveProgress(linearProgress);
    if (segment.type === 'MOVJ') {
        segment.targetAngles.forEach((target, index) => {
            const value = THREE.MathUtils.lerp(segment.startAngles[index], target, progress);
            setJointAngle(robot.userData.joints[index], value, false);
        });
        robot.updateMatrixWorld(true);
    } else if (segment.type === 'MOVL') {
        const target = {
            position: new THREE.Vector3().fromArray(interpolateLinearPosition(
                segment.startPose.position.toArray(),
                segment.targetPose.position.toArray(),
                progress
            )),
            quaternion: new THREE.Quaternion().fromArray(slerpQuaternion(
                segment.startPose.quaternion.toArray(),
                segment.targetPose.quaternion.toArray(),
                progress
            ))
        };
        const previousAngles = robot.userData.joints.map((joint) => joint.angle);
        const result = solveRobotIK(robot, target);
        if (!result.success) {
            restoreRobotJointAngles(robot, previousAngles);
            throw new Error(`${segment.step.name}: runtime IK failed.`);
        }
        if (linearProgress >= 1) {
            segment.step.joints.forEach((angle, index) => setJointAngle(robot.userData.joints[index], angle, false));
            robot.updateMatrixWorld(true);
        }
    }
    const program = ensureMotionProgram(robot);
    program.progress = (session.cursor + linearProgress) / session.steps.length;
    if (robot === state.activeArticulatedModel) syncJointControls(robot);
    updateTcpPresentation(robot);
    return elapsed >= segment.duration;
}

function updateMotionSessions(timestamp) {
    if (!isMotionActive()) return;
    [...state.motionSessions.values()].forEach((session) => {
        if (session.status !== 'running' || timestamp < session.startAt) return;
        try {
            let renderNeeded = false;
            for (let transition = 0; transition < MAX_MOTION_TRANSITIONS_PER_FRAME; transition += 1) {
                if (!session.segment) {
                    session.segment = createMotionSegment(session, session.nextSegmentStartAt);
                    renderNeeded = true;
                }
                if (!session.segment) {
                    finishRobotMotionSession(session, 'completed');
                    return;
                }
                const completedSegment = session.segment;
                if (!advanceMotionSegment(session, timestamp)) break;
                session.nextSegmentStartAt = Number.isFinite(completedSegment.duration)
                    ? completedSegment.startTime + completedSegment.duration
                    : completedSegment.startTime;
                session.cursor += 1;
                session.segment = null;
                session.currentStepId = null;
                renderNeeded = true;
                if (session.cursor >= session.steps.length) {
                    if (session.repeat) {
                        session.cursor = 0;
                        ensureMotionProgram(session.robot).progress = 0;
                        break;
                    }
                    finishRobotMotionSession(session, 'completed', '{name} 완료.', {
                        name: session.robot.userData.motionDisplayName
                    });
                    return;
                }
            }
            if (renderNeeded) renderMotionProgramPanel();
        } catch (error) {
            finishRobotMotionSession(
                session,
                'error',
                '{name}: {message}',
                {
                    name: session.robot.userData.motionDisplayName,
                    message: uiText('모션 실행에 실패했습니다.')
                }
            );
        }
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

function disposeObjectResources(object, disposed = null) {
    const cache = disposed || {
        geometries: new Set(),
        materials: new Set(),
        textures: new Set()
    };
    object.traverse((child) => {
        if (child.geometry && !cache.geometries.has(child.geometry)) {
            cache.geometries.add(child.geometry);
            child.geometry.dispose();
        }
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        materials.forEach((material) => {
            if (!material || cache.materials.has(material)) return;
            cache.materials.add(material);
            Object.values(material).forEach((value) => {
                if (value?.isTexture && !cache.textures.has(value)) {
                    cache.textures.add(value);
                    value.dispose();
                }
            });
            material.dispose();
        });
    });
    return cache;
}

function attachPendingToolModels(robot) {
    const tcpFrame = robot?.userData.tcpFrame;
    if (!tcpFrame) return;
    state.models.forEach((model) => {
        const transform = model.userData.pendingToolAttachment;
        if (!transform) return;
        tcpFrame.add(model);
        model.position.fromArray(transform.position);
        model.quaternion.fromArray(transform.quaternion);
        model.scale.fromArray(transform.scale);
        model.userData.attachmentHost = robot;
        model.userData.placement = 'tcp';
        delete model.userData.pendingToolAttachment;
        model.updateMatrixWorld(true);
    });
}

function cleanupScene() {
    setBaseJogGizmoEnabled(false);
    state.transformControls.detach();
    const models = [...state.models];
    const preservedImportedModels = models.filter((model) => model.userData.uploaded);
    preservedImportedModels.forEach((model) => {
        const toolHost = model.userData.placement === 'tcp' && model.userData.attachmentHost?.userData.tcpFrame;
        if (toolHost) {
            model.userData.pendingToolAttachment = {
                position: model.position.toArray(),
                quaternion: model.quaternion.toArray(),
                scale: model.scale.toArray()
            };
        }
        model.updateMatrixWorld(true);
        state.scene.attach(model);
        model.userData.attachmentHost = null;
        model.userData.placement = 'scene';
    });
    models.filter((model) => !preservedImportedModels.includes(model)).forEach((model) => {
        if (model.userData.motionInstanceId) state.motionPrograms.delete(model.userData.motionInstanceId);
        model.removeFromParent();
    });
    state.models = preservedImportedModels;
    state.selectedModel = preservedImportedModels.includes(state.selectedModel) ? state.selectedModel : null;
    state.activeArticulatedModel = null;
    state.activeProgramRobot = null;
    hideJogPanel();
    renderModelTree();
    el.modelTransformPanel.classList.add('hidden');
    renderMotionProgramPanel();
}

function deleteSelectedModel() {
    if (isMotionActive()) return;
    const model = state.selectedModel;
    if (!model) return;
    commitAllPendingHistories();
    setBaseJogGizmoEnabled(false);
    const historyBefore = captureSceneSnapshot();

    const attachments = state.models.filter((candidate) => candidate.userData.attachmentHost === model);
    const modelsToDelete = [model, ...attachments];
    state.transformControls.detach();
    modelsToDelete.forEach((item) => {
        if (item.userData.motionInstanceId) state.motionPrograms.delete(item.userData.motionInstanceId);
        item.removeFromParent();
        const index = state.models.indexOf(item);
        if (index > -1) state.models.splice(index, 1);
    });

    if (state.activeArticulatedModel === model) {
        state.activeArticulatedModel = [...state.models].reverse().find((item) => item.userData.tcpFrame) || null;
        if (state.activeArticulatedModel) renderJogControls(state.activeArticulatedModel);
        else hideJogPanel();
    }
    if (state.activeProgramRobot === model) state.activeProgramRobot = state.activeArticulatedModel;

    const formerHost = model.userData.attachmentHost;
    const nextSelection = formerHost && state.models.includes(formerHost)
        ? formerHost
        : state.models[state.models.length - 1] || null;
    updateUIStatus();
    selectSceneModel(nextSelection);
    renderMotionProgramPanel();
    recordHistory('모델 삭제', historyBefore, captureSceneSnapshot());
}

function updateUIStatus() {
    const names = state.models.map(m => m.userData.modelName);
    el.statName.textContent = names.length > 1 ? `${names[0]} (+${names.length-1})` : (names[0] || '-');
    el.emptyState.classList.toggle('hidden', state.models.length > 0);
    renderModelTree();
    setStatus('Ready', '#22c55e');
}

/**
 * Multi-Model CAD Download
 */
function getCadPathVariants(path) {
    const variants = [];
    const add = (value) => {
        if (!variants.includes(value)) variants.push(value);
    };
    const withCnSuffix = (value) => value.replace(/(\.[^/.]+)$/i, '_CN$1');
    const withDwg3dCnSuffix = (value) => value.replace(/_2D\.dwg$/i, '_3D_CN.dwg');

    add(path);
    add(withCnSuffix(path));

    if (/_2D\.dwg$/i.test(path)) {
        add(withDwg3dCnSuffix(path));
    }

    if (/[SPC]-K-INT/i.test(path)) {
        const noKPath = path.replace(/([SPC])-K-INT/ig, '$1-INT');
        add(noKPath);
        add(withCnSuffix(noKPath));

        if (/_2D\.dwg$/i.test(noKPath)) {
            add(withDwg3dCnSuffix(noKPath));
        }
    }

    if (path.includes('-INT')) {
        const noIntPath = path.replace('-INT', '');
        add(noIntPath);
        add(withCnSuffix(noIntPath));

        if (/_2D\.dwg$/i.test(noIntPath)) {
            add(withDwg3dCnSuffix(noIntPath));
        }
    }

    return variants;
}

async function handleCADDownload() {
    const cadModels = state.models.filter((model) => !model.userData.uploaded);
    if (cadModels.length === 0) {
        alert(uiText("다운로드할 기본 로봇 CAD 모델이 없습니다. 업로드한 파일은 원본 파일을 사용해주세요."));
        return;
    }

    const btnDown = document.getElementById('btn-download-cad');
    const oldHtml = btnDown.innerHTML;
    btnDown.disabled = true;
    btnDown.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';

    const zip = new JSZip();
    const downloadQueue = [];

    cadModels.forEach(model => {
        const name = model.userData.modelName;
        // Controller files
        if (name.includes('IRCB501')) {
            downloadQueue.push({ path: `../1_RobotModelSelect/Robot_CAD/Controller/${name}/${name}.dwg`, name: `${name}_2D.dwg` });
            downloadQueue.push({ path: `../1_RobotModelSelect/Robot_CAD/Controller/${name}/${name}.stp`, name: `${name}_3D.stp` });
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

            downloadQueue.push({ path: `../1_RobotModelSelect/Robot_CAD/${typeDir}/${folderBase}/${modelId}_2D.dwg`, name: `${modelId}_2D.dwg` });
            downloadQueue.push({ path: `../1_RobotModelSelect/Robot_CAD/${typeDir}/${folderBase}/${modelId}_3D.stp`, name: `${modelId}_3D.stp` });
        }
    });

    try {
        await Promise.all(downloadQueue.map(async (file) => {
            for (const path of getCadPathVariants(file.path)) {
                const r = await fetch(path);
                if (r.ok) {
                    zip.file(file.name, await r.blob());
                    return;
                }
            }
        }));

        if (cadModels.length > 0) {
            const content = await zip.generateAsync({ type: "blob", compression: "STORE" });
            saveAs(content, `Inovance_Total_CAD.zip`);
        }
    } catch (e) { console.error("CAD download failed:", e); }

    btnDown.disabled = false;
    btnDown.innerHTML = oldHtml;
}

function animate() {
    requestAnimationFrame(animate);
    const timestamp = performance.now();
    applyVirtualControllerFrame(timestamp);
    updateMotionSessions(timestamp);
    updateCycleTimeReadout(timestamp);
    state.controls.update();
    state.renderer.render(state.scene, state.camera);
}

function onResize() {
    const w = el.canvasContainer.clientWidth, h = el.canvasContainer.clientHeight;
    state.camera.aspect = w / h;
    state.camera.updateProjectionMatrix();
    state.renderer.setSize(w, h);
    [el.modelBrowserPanel, el.jogPanel, el.virtualControllerPanel, el.programPanel].forEach((panel) => {
        if (panel?.dataset.userResized === 'true') normalizePanelResizeBox(panel);
    });
}

function fitCamera() {
    if (state.models.length === 0) return;
    const box = new THREE.Box3();
    state.models.forEach(m => box.expandByObject(m));
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const dist = size.length() * 1.5;
    state.camera.up.set(0, 0, 1);
    state.camera.position.set(center.x + dist * 0.8, center.y - dist * 0.8, center.z + dist * 0.5);
    state.camera.lookAt(center.x, center.y, center.z);
    state.controls.target.set(center.x, center.y, center.z);
}

async function populateModelList() {
    try {
        const res = await fetch('./models/models.json?v=20260718-model-motion2');
        const list = await res.json();
        state.catalog.clear();
        el.modelSelect.innerHTML = `<option value="" disabled selected>${uiText('-- 로봇 모델을 선택하세요 --')}</option>`;
        let currentGroup = null;
        list.forEach(m => {
            if (m.group) {
                currentGroup = document.createElement('optgroup');
                currentGroup.label = m.group;
                el.modelSelect.appendChild(currentGroup);
            } else {
                const catalogKey = m.file || `robot:${m.folder}`;
                state.catalog.set(catalogKey, m);
                const opt = document.createElement('option');
                opt.value = catalogKey;
                opt.textContent = m.name;
                (currentGroup || el.modelSelect).appendChild(opt);
            }
        });
    } catch (e) { console.error('Failed to load model list:', e); }
}

function showLoading(show, text = uiText('불러오는 중...')) {
    el.loadingOverlay.classList.toggle('hidden', !show);
    el.loadingText.textContent = text;
}

function refreshViewerStatus() {
    if (!el.statStatus || !state.viewerStatus) return;
    el.statStatus.textContent = uiFormat(state.viewerStatus.text, state.viewerStatus.replacements);
    el.statusDot.style.color = state.viewerStatus.color;
}

function setStatus(text, color, replacements = {}) {
    state.viewerStatus = { text, color, replacements };
    refreshViewerStatus();
}

init();
