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
import { OBB } from 'three/addons/math/OBB.js';
import {
    MOTION_PROJECT_SCHEMA_VERSION,
    DEFAULT_MOVJ_SPEED,
    DEFAULT_MOVL_SPEED,
    smoothstep,
    interpolateLinearPosition,
    slerpQuaternion,
    calculateMovjDuration,
    calculateMovlDuration,
    createEmptyMotionProgram,
    cloneMotionProgram,
    normalizeMotionProject
} from './motion-program-core.mjs?v=20260717-step-into-controls1';

function uiText(value) {
    return window.InoRobotI18n ? window.InoRobotI18n.translate(String(value)) : String(value);
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
    collisionRobotIds: new Set(),
    collisionHelpers: new Map(),
    lastCollisionCheck: 0,
    pendingImportFile: null,
    occtImporterPromise: null,
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
    selectedModelName: document.getElementById('selected-model-name'),
    selectedCoordinateLabel: document.getElementById('selected-coordinate-label'),
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
    programPanelResize: document.getElementById('program-panel-resize'),
    programRobotList: document.getElementById('program-robot-list'),
    programRobotName: document.getElementById('program-robot-name'),
    programStepList: document.getElementById('program-step-list'),
    programStatus: document.getElementById('program-status'),
    btnProgramSelectAll: document.getElementById('program-select-all'),
    btnProgramAdd: document.getElementById('program-add-step'),
    btnProgramUpdate: document.getElementById('program-update-step'),
    btnProgramUp: document.getElementById('program-step-up'),
    btnProgramDown: document.getElementById('program-step-down'),
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
    btnProgramExport: document.getElementById('program-export'),
    btnProgramImport: document.getElementById('program-import'),
    inputProgramImport: document.getElementById('program-import-file'),
    btnAddMode:      null 
};

const IK_POSITION_SCALE = 400;
const IK_MAX_ITERATIONS = 120;
const IK_DAMPING = 0.035;
const IK_MAX_JOINT_STEP = THREE.MathUtils.degToRad(5);
const IK_MAX_PRISMATIC_STEP = 12;
const CONTROLLER_REVOLUTE_DIRECTION = -1;
const CONTROLLER_PRISMATIC_DIRECTION = 1;
const ROBOT_BODY_COLOR = '#ece9dd';
const AXIS_COLORS = Object.freeze({ x: '#d32f2f', y: '#388e3c', z: '#1976d2' });
const SCARA_TOOL_AXES = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] };
const SIX_AXIS_TOOL_AXES = { x: [0, 0, 1], y: [0, -1, 0], z: [1, 0, 0] };
const stlGeometryCache = new Map();
const BASE_JOG_HOLD_DELAY = 250;
const BASE_JOG_REPEAT_INTERVAL = 30;
const SUPPORTED_IMPORT_EXTENSIONS = new Set(['stl', 'fbx', 'obj', 'glb', 'gltf', 'stp', 'step']);
const Y_UP_IMPORT_EXTENSIONS = new Set(['fbx', 'glb', 'gltf']);
const IMPORT_PLACEMENT_COLORS = { tcp: 0xf97316, scene: 0x65a30d };
const OCCT_IMPORT_BASE_URL = 'https://cdn.jsdelivr.net/npm/occt-import-js@0.0.23/dist/';
const MOTION_PROJECT_STORAGE_KEY = 'inorobot.3d-simulation.motion-project.v1';
const MOTION_COLLISION_INTERVAL = 100;
const MOTION_MOVL_SAMPLE_DISTANCE = 25;
const MOTION_MOVL_SAMPLE_ANGLE = 5;
const PROGRAM_PANEL_MIN_WIDTH = 300;
const PROGRAM_PANEL_MIN_HEIGHT = 320;

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
        <span><i class="fa-solid fa-plus-circle"></i> ${uiText('모델 추가 모드')}</span>
    `;
    wrapper.after(container);
    el.btnAddMode = document.getElementById('chk-add-mode');

    if (el.panelLauncher && !el.panelLauncher.querySelector('[data-panel-toggle="program-panel"]')) {
        const programButton = document.createElement('button');
        programButton.type = 'button';
        programButton.dataset.panelToggle = 'program-panel';
        programButton.disabled = true;
        programButton.title = '모션 프로그램 표시/숨김';
        programButton.innerHTML = '<i class="fa-solid fa-list-check"></i> Program';
        const divider = el.panelLauncher.querySelector('.viewer-control-divider');
        el.panelLauncher.insertBefore(programButton, divider);
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
    refreshImportPlacementOptions();
    state.panelWindows.forEach((record, panelId) => {
        window.InoRobotI18n?.refresh?.(record.panel);
        record.popup.document.title = getPanelWindowTitle(panelId);
    });
    renderModelTree();
    refreshJointControlLabels();
    renderMotionProgramPanel();
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
    controls.setSize(0.82);
    controls.visible = false;
    controls.enabled = false;
    controls.addEventListener('dragging-changed', (event) => {
        state.controls.enabled = !event.value;
    });
    controls.addEventListener('mouseDown', beginBaseJogGizmoDrag);
    controls.addEventListener('objectChange', applyBaseJogGizmoTarget);
    controls.addEventListener('mouseUp', endBaseJogGizmoDrag);
    removeRotationScreenHandle(controls);
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
    document.addEventListener('inorobot:i18nready', refreshLocalizedControls);
    document.addEventListener('inorobot:languagechange', refreshLocalizedControls);
    el.modelSelect.addEventListener('change', async (e) => {
        const file = e.target.value;
        if (!file) return;
        const model = state.catalog.get(file);
        if (model) await loadModelFromServer(model);
    });

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
        button.addEventListener('click', () => setSelectedTransformMode(button.dataset.transformMode));
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
    makePanelDraggable(el.modelBrowserPanel, el.modelBrowserPanel.querySelector('.model-browser-header'));
    makePanelDraggable(el.jogPanel, el.jogPanel.querySelector('.jog-panel-header'));
    makePanelDraggable(el.programPanel, el.programPanel?.querySelector('.program-panel-header'));
    makeProgramPanelResizable(el.programPanel, el.programPanelResize);

    el.programRobotList?.addEventListener('click', handleProgramRobotListClick);
    el.programRobotList?.addEventListener('change', handleProgramRobotListChange);
    el.programStepList?.addEventListener('click', handleProgramStepListClick);
    el.programStepList?.addEventListener('change', handleProgramStepListChange);
    el.btnProgramSelectAll?.addEventListener('click', selectAllProgramRobots);
    el.btnProgramAdd?.addEventListener('click', addCurrentMotionStep);
    el.btnProgramUpdate?.addEventListener('click', updateSelectedMotionStep);
    el.btnProgramUp?.addEventListener('click', () => moveSelectedMotionStep(-1));
    el.btnProgramDown?.addEventListener('click', () => moveSelectedMotionStep(1));
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

    el.btnToggleTransform.addEventListener('click', () => {
        if (isMotionActive()) return;
        setTransformHandlesEnabled(!state.transformControls.enabled);
    });

    window.addEventListener('keydown', handleGlobalKeyDown);

    const btnDown = document.getElementById('btn-download-cad');
    if (btnDown) {
        btnDown.addEventListener('click', handleCADDownload);
    }

    window.addEventListener('beforeunload', () => {
        saveMotionProjectNow();
        [...state.panelWindows.keys()].forEach((panelId) => restorePanelFromWindow(panelId, true));
    });
}

function handleGlobalKeyDown(event) {
    const shortcut = event.ctrlKey || event.metaKey;
    const key = event.key.toLowerCase();
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
        setSelectedTransformMode(mode);
        return;
    }
    if ((event.key === 'Delete' || event.key === 'Backspace') && state.selectedModel) {
        event.preventDefault();
        deleteSelectedModel();
    }
}

function removeRotationScreenHandle(transformControls) {
    const handles = [];
    transformControls.traverse((object) => {
        if (object.name === 'E') handles.push(object);
    });
    handles.forEach((handle) => handle.removeFromParent());
    transformControls.userData.removedScreenRotationHandles = handles.length;
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
            materials.forEach((material) => material?.color?.set(AXIS_COLORS[colorKey]));
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
    clearCollisionWarnings();
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
            ? `되돌리기: ${state.undoStack[state.undoStack.length - 1].label} (Ctrl+Z)`
            : '되돌리기 (Ctrl+Z)';
    }
    if (el.btnRedo) {
        el.btnRedo.disabled = locked || state.redoStack.length === 0;
        el.btnRedo.title = state.redoStack.length
            ? `다시 실행: ${state.redoStack[state.redoStack.length - 1].label} (Ctrl+Y)`
            : '다시 실행 (Ctrl+Y)';
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
    setStatus(`Undo: ${entry.label}`, '#60a5fa');
}

function redoLastAction() {
    if (isMotionActive()) return;
    commitAllPendingHistories();
    const entry = state.redoStack.pop();
    if (!entry) return;
    applySceneSnapshot(entry.after);
    state.undoStack.push(entry);
    updateHistoryButtons();
    setStatus(`Redo: ${entry.label}`, '#60a5fa');
}

function getPanelElement(panelId) {
    return {
        'model-browser-panel': el.modelBrowserPanel,
        'jog-panel': el.jogPanel,
        'program-panel': el.programPanel
    }[panelId] || null;
}

function updatePanelLauncher(panelId) {
    const panel = getPanelElement(panelId);
    const button = document.querySelector(`[data-panel-toggle="${panelId}"]`);
    if (!panel || !button) return;
    const unavailable = (panelId === 'jog-panel' && !state.activeArticulatedModel)
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
        setStatus('Popup blocked: allow popups to detach panels', '#ef4444');
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
    panel.classList.remove('panel-user-hidden');
    panel.classList.add('panel-popout');
    popup.document.body.appendChild(panel);

    const record = { popup, panel, placeholder, savedStyle, restoring: false };
    state.panelWindows.set(panelId, record);
    popup.addEventListener('beforeunload', () => restorePanelFromWindow(panelId, false));
    updatePanelLauncher(panelId);
}

function getPanelWindowTitle(panelId) {
    if (panelId === 'program-panel') return '3D Simulation - Program Panel';
    const panelName = panelId === 'model-browser-panel' ? uiText('모델 트리') : uiText('JOG Panel');
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

function makePanelDraggable(panel, handle) {
    if (!panel || !handle) return;
    let drag = null;
    handle.addEventListener('pointerdown', (event) => {
        if (panel.ownerDocument !== document || event.button !== 0
            || event.target.closest('button, input, select, a')) return;
        const canvasRect = el.canvasContainer.getBoundingClientRect();
        const panelRect = panel.getBoundingClientRect();
        drag = {
            pointerId: event.pointerId,
            offsetX: event.clientX - panelRect.left,
            offsetY: event.clientY - panelRect.top,
            canvasRect
        };
        handle.setPointerCapture(event.pointerId);
        event.preventDefault();
    });
    handle.addEventListener('pointermove', (event) => {
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
    };
    handle.addEventListener('pointerup', stopDrag);
    handle.addEventListener('pointercancel', stopDrag);
    handle.addEventListener('lostpointercapture', stopDrag);
}

function normalizeProgramPanelResizeBox(panel) {
    if (!panel || panel.ownerDocument !== document) return null;
    const canvasRect = el.canvasContainer.getBoundingClientRect();
    const panelRect = panel.getBoundingClientRect();
    const left = THREE.MathUtils.clamp(panelRect.left - canvasRect.left, 0, Math.max(0, canvasRect.width - 1));
    const bottom = THREE.MathUtils.clamp(canvasRect.bottom - panelRect.bottom, 0, Math.max(0, canvasRect.height - 1));
    const maxWidth = Math.max(1, canvasRect.width - left);
    const maxHeight = Math.max(1, canvasRect.height - bottom);
    const minWidth = Math.min(PROGRAM_PANEL_MIN_WIDTH, maxWidth);
    const minHeight = Math.min(PROGRAM_PANEL_MIN_HEIGHT, maxHeight);
    const width = THREE.MathUtils.clamp(panelRect.width, minWidth, maxWidth);
    const height = THREE.MathUtils.clamp(panelRect.height, minHeight, maxHeight);

    panel.style.left = `${left}px`;
    panel.style.right = 'auto';
    panel.style.top = 'auto';
    panel.style.bottom = `${bottom}px`;
    panel.style.width = `${width}px`;
    panel.style.height = `${height}px`;
    panel.style.maxHeight = '100%';
    panel.style.transform = 'none';
    panel.classList.add('program-panel-resized');
    panel.dataset.userResized = 'true';
    return { width, height, minWidth, minHeight, maxWidth, maxHeight };
}

function makeProgramPanelResizable(panel, handle) {
    if (!panel || !handle) return;
    let resize = null;

    handle.addEventListener('pointerdown', (event) => {
        if (panel.ownerDocument !== document || event.button !== 0) return;
        const box = normalizeProgramPanelResizeBox(panel);
        if (!box) return;
        resize = {
            pointerId: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
            ...box
        };
        handle.setPointerCapture(event.pointerId);
        event.preventDefault();
        event.stopPropagation();
    });

    handle.addEventListener('pointermove', (event) => {
        if (!resize || resize.pointerId !== event.pointerId) return;
        const width = THREE.MathUtils.clamp(
            resize.width + event.clientX - resize.startX,
            resize.minWidth,
            resize.maxWidth
        );
        const height = THREE.MathUtils.clamp(
            resize.height - (event.clientY - resize.startY),
            resize.minHeight,
            resize.maxHeight
        );
        panel.style.width = `${width}px`;
        panel.style.height = `${height}px`;
    });

    const stopResize = (event) => {
        if (!resize || (event.pointerId !== undefined && resize.pointerId !== event.pointerId)) return;
        resize = null;
    };
    handle.addEventListener('pointerup', stopResize);
    handle.addEventListener('pointercancel', stopResize);
    handle.addEventListener('lostpointercapture', stopResize);
    handle.addEventListener('keydown', (event) => {
        if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
        const box = normalizeProgramPanelResizeBox(panel);
        if (!box) return;
        const step = event.shiftKey ? 48 : 16;
        const widthDelta = event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0;
        const heightDelta = event.key === 'ArrowUp' ? step : event.key === 'ArrowDown' ? -step : 0;
        panel.style.width = `${THREE.MathUtils.clamp(box.width + widthDelta, box.minWidth, box.maxWidth)}px`;
        panel.style.height = `${THREE.MathUtils.clamp(box.height + heightDelta, box.minHeight, box.maxHeight)}px`;
        event.preventDefault();
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
        return { kind: 'TOOL', icon: 'fa-screwdriver-wrench' };
    }
    if (model.userData.uploaded) {
        return { kind: 'EQUIPMENT', icon: 'fa-cubes-stacked' };
    }
    if (model.userData.tcpFrame) {
        return { kind: 'ROBOT', icon: 'fa-robot' };
    }
    return { kind: 'MODEL', icon: 'fa-cube' };
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
    button.classList.add(`model-tree-button-${meta.kind.toLowerCase()}`);
    button.dataset.modelTreeId = treeId;
    const displayName = model.userData.motionDisplayName || model.userData.modelName || model.name || uiText('MODEL');
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
    ['x', 'y', 'z'].forEach((axis) => {
        el.modelPositionInputs[axis].value = formatTransformNumber(model.position[axis]);
        el.modelRotationInputs[axis].value = formatTransformNumber(
            normalizeDegrees(THREE.MathUtils.radToDeg(model.rotation[axis]))
        );
    });
}

function updateTransformModeButtons(mode = state.transformControls?.mode || 'translate') {
    el.transformModeButtons.forEach((button) => {
        button.classList.toggle('active', button.dataset.transformMode === mode);
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
}

function setSelectedTransformMode(mode) {
    if (!['translate', 'rotate', 'scale'].includes(mode) || !state.selectedModel) return;
    state.transformControls.setMode(mode);
    if (state.transformControls.enabled) attachTransformControlsToSelectedModel();
    updateTransformModeButtons(mode);
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
    el.selectedModelName.textContent = model.userData.motionDisplayName || model.userData.modelName || model.name || uiText('Unnamed model');
    el.selectedCoordinateLabel.textContent = model.userData.placement === 'tcp' ? 'TOOL' : 'BASE';
    if (model.userData.tcpFrame && state.activeArticulatedModel !== model) {
        state.activeArticulatedModel = model;
        renderJogControls(model);
    }
    if (model.userData.tcpFrame) {
        state.activeProgramRobot = model;
        renderMotionProgramPanel();
    }
    updateSelectedModelTransformInputs();
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

    const positionValues = ['x', 'y', 'z'].map((axis) => el.modelPositionInputs[axis].value.trim());
    const rotationValues = ['x', 'y', 'z'].map((axis) => el.modelRotationInputs[axis].value.trim());
    const rawValues = [...positionValues, ...rotationValues];
    if (rawValues.some((value) => value === '' || value === '-' || value === '.' || value === '-.')) return;
    const values = rawValues.map(Number);
    if (!values.every(Number.isFinite)) return;

    model.position.set(values[0], values[1], values[2]);
    model.rotation.set(
        THREE.MathUtils.degToRad(values[3]),
        THREE.MathUtils.degToRad(values[4]),
        THREE.MathUtils.degToRad(values[5]),
        model.rotation.order
    );
    model.updateMatrixWorld(true);
    setSelectedTransformMode(event?.currentTarget?.id.includes('rotation') ? 'rotate' : 'translate');
    setStatus('Model transform updated', '#22c55e');
}

async function loadModelFromServer(modelDefinition) {
    if (isMotionActive()) return;
    const { file, folder, name, type = 'fbx' } = modelDefinition;
    setTransformHandlesEnabled(false);
    setBaseJogGizmoEnabled(false);
    commitAllPendingHistories();
    const historyBefore = captureSceneSnapshot();
    showLoading(true, `Loading ${name}...`);
    setStatus('Loading', '#f59e0b');
    const isAddMode = el.btnAddMode && el.btnAddMode.checked;

    // If not in Add Mode, clean up previous models
    if (!isAddMode) {
        cleanupScene();
    }

    try {
        const model = type === 'articulated-stl'
            ? await loadArticulatedRobot(modelDefinition, (p) => showLoading(true, `Robot links: ${p}%`))
            : await loadFBX(`./models/${file}`, (p) => showLoading(true, `Model: ${p}%`));

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
    prepareRobotCollisionParts(robot);

    return robot;
}

function createRobotManifest(modelDefinition) {
    const { name, robotType, kinematicVariant = 'standard', structure, limits, jointSpeeds, j3Mesh = false } = modelDefinition;
    if (!Array.isArray(structure) || !Array.isArray(limits) || !Array.isArray(jointSpeeds)) {
        throw new Error(`Robot kinematics are missing for ${name}.`);
    }
    if (jointSpeeds.length !== limits.length || jointSpeeds.some((speed) => !Number.isFinite(speed) || speed <= 0)) {
        throw new Error(`Robot joint speeds are invalid for ${name}.`);
    }

    const joint = (index, mesh, pivot, axis, extra = {}) => ({
        name: `J${index + 1}`,
        mesh,
        pivot,
        axis,
        min: limits[index][0],
        max: limits[index][1],
        maxSpeed: jointSpeeds[index],
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
            jointDirection: CONTROLLER_REVOLUTE_DIRECTION,
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
        jointDirection: CONTROLLER_REVOLUTE_DIRECTION,
        tcp,
        ikRotationAxes: ['x', 'y', 'z'],
        toolAxes: SIX_AXIS_TOOL_AXES,
        base: { name: 'P0', mesh: 'P0.stl', color: ROBOT_BODY_COLOR },
        joints: [
            joint(0, 'P1.stl', [0, 0, 0], [0, 0, 1]),
            joint(1, 'P2.stl', [shoulderOffset, 0, shoulderHeight], [0, 1, 0]),
            joint(2, 'P3.stl', [shoulderOffset, 0, elbowHeight], [0, 1, 0]),
            joint(3, 'P4.stl', [shoulderOffset, 0, wristHeight], [1, 0, 0]),
            joint(4, 'P5.stl', [shoulderOffset + forearm, 0, wristHeight], [0, 1, 0]),
            joint(5, 'P6.stl', tcp, [1, 0, 0])
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
        alert('지원하지 않는 형식입니다. STL, FBX, OBJ, GLB, GLTF, STP, STEP 파일을 선택해주세요.');
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
    if (sceneOption) sceneOption.textContent = uiText('로봇 외부에 설치');
    if (tcpOption) {
        tcpOption.textContent = uiText('Tool에 부착');
        tcpOption.disabled = !getArticulatedRobotForAttachment();
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

function rebaseEquipmentToFloorCenter(importedModel, content) {
    importedModel.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(importedModel);
    if (bounds.isEmpty()) return;

    const floorCenterWorld = new THREE.Vector3(
        (bounds.min.x + bounds.max.x) * 0.5,
        (bounds.min.y + bounds.max.y) * 0.5,
        bounds.min.z
    );
    const floorCenterLocal = importedModel.worldToLocal(floorCenterWorld.clone());
    content.position.sub(floorCenterLocal);
    importedModel.userData.equipmentAnchor = 'floor-center';
    importedModel.updateMatrixWorld(true);
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
        alert('TCP에 장착할 로봇을 먼저 불러와주세요.');
        return;
    }

    const upAxis = getAutomaticSourceUpAxis(extension);
    el.btnConfirmImport.disabled = true;
    if (el.importDialog.open) el.importDialog.close();
    showLoading(true, `Importing ${file.name}...`);
    setStatus('Importing', '#f59e0b');

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

        // Only free-standing equipment is normalized into the viewer's Z-Up axes.
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
            rebaseEquipmentToFloorCenter(importedModel, content);
            state.scene.add(importedModel);
        }

        importedModel.updateMatrixWorld(true);
        const bounds = new THREE.Box3().setFromObject(importedModel);
        if (bounds.isEmpty()) throw new Error('The imported mesh has invalid bounds.');

        state.models.push(importedModel);
        ensureModelTreeId(importedModel);

        updateUIStatus();
        selectSceneModel(importedModel);
        recordHistory(placement === 'tcp' ? 'TCP 툴 불러오기' : '설비 불러오기', historyBefore, captureSceneSnapshot());
        fitCamera();
        setStatus(placement === 'tcp' ? 'Tool attached to TCP' : 'Equipment imported', '#22c55e');
    } catch (error) {
        console.error('3D import failed:', error);
        importedModel?.removeFromParent();
        if (importedModel) disposeObjectResources(importedModel);
        applySceneSnapshot(historyBefore);
        setStatus('Import Error', '#ef4444');
        alert(`3D 파일을 불러오지 못했습니다.\n${error.message}\n\n외부 파일을 참조하는 GLTF는 GLB로 변환해서 사용해주세요.`);
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
    const isBase = mode === 'base';
    if (!isBase) {
        stopBaseJogHold();
        setBaseJogGizmoEnabled(false);
    }
    el.jointJogView?.classList.toggle('hidden', isBase);
    el.baseJogView?.classList.toggle('hidden', !isBase);
    el.btnJogJointMode?.classList.toggle('active', !isBase);
    el.btnJogBaseMode?.classList.toggle('active', isBase);
    el.btnJogJointMode?.setAttribute('aria-selected', String(!isBase));
    el.btnJogBaseMode?.setAttribute('aria-selected', String(isBase));
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
    const euler = new THREE.Euler().setFromQuaternion(pose.quaternion, 'XYZ');
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

function applyBaseJogNumericTarget() {
    const robot = state.activeArticulatedModel;
    if (!robot?.userData.tcpFrame) return;
    beginBaseJogNumericHistory();
    const rawValues = Object.fromEntries(Object.entries(el.tcpReadouts).map(([key, input]) => [key, input?.value.trim()]));
    if (Object.values(rawValues).some((value) => !value || ['-', '.', '-.'].includes(value))) return;
    const values = Object.fromEntries(Object.entries(rawValues).map(([key, value]) => [key, Number(value)]));
    if (!Object.values(values).every(Number.isFinite)) return;

    const previousAngles = (robot.userData.joints || []).map((joint) => joint.angle);
    const previousTarget = robot.userData.baseJogTarget
        ? {
            position: robot.userData.baseJogTarget.position.clone(),
            quaternion: robot.userData.baseJogTarget.quaternion.clone()
        }
        : getCurrentTcpPoseBase(robot);
    const target = {
        position: new THREE.Vector3(values.x, values.y, values.z),
        quaternion: new THREE.Quaternion()
    };

    if (robot.userData.manifest?.robotType === 'scara') {
        const yaw = new THREE.Quaternion().setFromAxisAngle(
            new THREE.Vector3(0, 0, 1),
            THREE.MathUtils.degToRad(values.rz)
        );
        target.quaternion.copy(yaw.multiply(robot.userData.toolHomeQuaternion.clone())).normalize();
    } else {
        target.quaternion.setFromEuler(new THREE.Euler(
            THREE.MathUtils.degToRad(values.rx),
            THREE.MathUtils.degToRad(values.ry),
            THREE.MathUtils.degToRad(values.rz),
            'XYZ'
        ));
    }

    const result = solveRobotIK(robot, target);
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
    updateTcpPresentation(robot);
    syncBaseJogGizmoFromRobot(robot);
    setBaseJogStatus('');
}

function finishBaseJogNumericHistory() {
    if (state.activeArticulatedModel) captureCurrentTcpTarget(state.activeArticulatedModel);
    commitPendingHistory('Base 좌표 입력', 'pendingBaseJogNumericHistory');
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
    const target = robot.userData.baseJogTarget;
    if (!target || !['x', 'y', 'z'].includes(axisName)) return false;
    if (kind === 'rotate' && !getBaseJogRotationAxes(robot).includes(axisName)) return false;

    const stepInput = kind === 'rotate' ? el.baseRotateStep : el.baseMoveStep;
    const fallback = kind === 'rotate' ? 5 : 10;
    const max = kind === 'rotate' ? 30 : 100;
    const parsedStep = Number(stepInput?.value);
    const step = THREE.MathUtils.clamp(Number.isFinite(parsedStep) ? Math.abs(parsedStep) : fallback, 0.1, max);
    if (stepInput) stepInput.value = String(step);

    const previousTarget = {
        position: target.position.clone(),
        quaternion: target.quaternion.clone()
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
    const result = solveRobotIK(robot, target);
    if (!result.success) {
        previousAngles.forEach((angle, index) => setJointAngle(robot.userData.joints[index], angle, false));
        robot.userData.baseJogTarget = previousTarget;
        robot.updateMatrixWorld(true);
        syncJointControls(robot);
        captureCurrentTcpTarget(robot);
        setBaseJogStatus('Target is unreachable or near a singularity.', 'error');
        return false;
    }

    syncJointControls(robot);
    captureCurrentTcpTarget(robot);
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
        const requestedJ4 = joints[3].angle - THREE.MathUtils.radToDeg(rzOnlyError.z);
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
        const baseJ1 = -THREE.MathUtils.radToDeg(physicalJ1);
        const baseJ2 = -THREE.MathUtils.radToDeg(physicalJ2);
        equivalentJointAngles(baseJ1, joints[0]).forEach((j1) => {
            equivalentJointAngles(baseJ2, joints[1]).forEach((j2) => {
                const baseJ4 = -desiredYawDegrees - j1 - j2;
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

function solveRobotIK(robot, target) {
    const joints = robot.userData.joints || [];
    if (robot.userData.manifest?.robotType === 'scara') return solveScaraIK(robot, target);
    const startingAngles = joints.map((joint) => joint.angle);
    const makeSeed = (index = -1, offset = 0) => joints.map((_, jointIndex) => (
        jointIndex === index && joints[jointIndex].definition.type !== 'prismatic' ? offset : 0
    ));
    const seedOffsets = [makeSeed()];
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
        lastResult = solveRobotIKAttempt(robot, target);
        if (lastResult.success) {
            lastResult.usedSingularityEscape = attempt > 0;
            return lastResult;
        }
    }
    return lastResult;
}

function solveRobotIKAttempt(robot, target) {
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

        if (positionErrorLength < 0.45 && rotationErrorLength < THREE.MathUtils.degToRad(0.2)) {
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
        success: positionErrorLength < 0.8 && rotationErrorLength < THREE.MathUtils.degToRad(0.35),
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
    return state.motionSessions.size > 0;
}

function getMotionStatus(robot) {
    const id = robot.userData.motionInstanceId;
    if (state.collisionRobotIds.has(id)) return 'collision';
    return getMotionSession(robot)?.status || ensureMotionProgram(robot)?.status || 'idle';
}

function motionStatusLabel(status) {
    return ({
        idle: 'Waiting',
        running: 'Running',
        paused: 'Paused',
        completed: 'Completed',
        error: 'Error',
        collision: 'Collision',
        stopped: 'Stopped'
    })[status] || status;
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

function setMotionProgramStatus(message, type = '') {
    if (!el.programStatus) return;
    el.programStatus.textContent = message;
    el.programStatus.classList.toggle('error', type === 'error');
    el.programStatus.classList.toggle('working', type === 'working');
}

function formatMotionStepPose(step) {
    const p = step.tcp.position.map((value) => Number(value).toFixed(1)).join(', ');
    return `TCP ${p}`;
}

function renderMotionProgramPanel() {
    if (!el.programRobotList || !el.programStepList) return;
    const robots = getArticulatedRobots();
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
        row.className = `program-robot-row${robot === state.activeProgramRobot ? ' active' : ''}${status === 'collision' ? ' collision' : ''}`;
        row.dataset.robotInstanceId = robot.userData.motionInstanceId;

        const included = document.createElement('input');
        included.type = 'checkbox';
        included.checked = program.included;
        included.dataset.programRobotInclude = robot.userData.motionInstanceId;
        included.setAttribute('aria-label', `${robot.userData.motionDisplayName} simultaneous run`);

        const select = document.createElement('button');
        select.type = 'button';
        select.className = 'program-robot-select';
        select.dataset.programRobotSelect = robot.userData.motionInstanceId;
        select.textContent = robot.userData.motionDisplayName;

        const statusText = document.createElement('span');
        statusText.className = `program-robot-status ${status}`;
        statusText.textContent = motionStatusLabel(status);
        row.append(included, select, statusText);
        el.programRobotList.appendChild(row);
    });

    const robot = state.activeProgramRobot;
    const program = robot ? ensureMotionProgram(robot) : null;
    el.programRobotName.textContent = robot?.userData.motionDisplayName || 'Select a robot';
    el.programStepList.replaceChildren();
    if (!program || program.steps.length === 0) {
        const empty = document.createElement('p');
        empty.className = 'program-step-empty';
        empty.textContent = robot ? 'Add the current robot pose.' : 'No programmable robot is loaded.';
        el.programStepList.appendChild(empty);
    } else {
        program.steps.forEach((step, index) => {
            const row = document.createElement('div');
            const isSelected = step.id === program.selectedStepId;
            const session = getMotionSession(robot);
            const isRunning = session?.currentStepId === step.id && session.status === 'running';
            row.className = `program-step-row${isSelected ? ' active' : ''}${isRunning ? ' running' : ''}`;
            row.dataset.programStepId = step.id;

            const select = document.createElement('button');
            select.type = 'button';
            select.className = 'program-step-select';
            select.dataset.programStepSelect = step.id;
            select.textContent = step.name || `P${String(index + 1).padStart(3, '0')}`;

            const motion = document.createElement('select');
            motion.dataset.programStepMotion = step.id;
            motion.dataset.programEdit = '';
            ['MOVJ', 'MOVL'].forEach((value) => {
                const option = document.createElement('option');
                option.value = value;
                option.textContent = value;
                motion.appendChild(option);
            });
            motion.value = step.motion;

            const speed = document.createElement('input');
            speed.type = 'number';
            speed.className = 'program-step-speed';
            speed.min = '1';
            speed.max = step.motion === 'MOVJ' ? '100' : '1000';
            speed.step = '1';
            speed.value = String(step.speed);
            speed.dataset.programStepSpeed = step.id;
            speed.dataset.programEdit = '';

            const unit = document.createElement('span');
            unit.className = 'program-step-unit';
            unit.textContent = step.motion === 'MOVJ' ? '%' : 'mm/s';
            const pose = document.createElement('span');
            pose.className = 'program-step-pose';
            pose.textContent = formatMotionStepPose(step);
            row.append(select, motion, speed, unit, pose);
            el.programStepList.appendChild(row);
        });
    }
    syncMotionRepeatControl();
    const selected = program?.steps.find((step) => step.id === program.selectedStepId) || null;
    if (el.btnProgramUpdate) el.btnProgramUpdate.disabled = !selected || isMotionActive();
    if (el.btnProgramUp) el.btnProgramUp.disabled = !selected || program.steps[0] === selected || isMotionActive();
    if (el.btnProgramDown) el.btnProgramDown.disabled = !selected || program.steps.at(-1) === selected || isMotionActive();
    if (el.btnProgramDelete) el.btnProgramDelete.disabled = !selected || isMotionActive();
    if (el.btnProgramStepRobot) el.btnProgramStepRobot.disabled = !program?.steps.length || isMotionActive();
    if (el.btnProgramRunRobot) el.btnProgramRunRobot.disabled = !program?.steps.length;
    if (el.btnProgramStepGroup) el.btnProgramStepGroup.disabled = isMotionActive() || !robots.some((candidate) => {
        const candidateProgram = ensureMotionProgram(candidate);
        return candidateProgram.included && candidateProgram.steps.length;
    });
    if (el.btnProgramRunGroup) el.btnProgramRunGroup.disabled = !robots.some((candidate) => {
        const candidateProgram = ensureMotionProgram(candidate);
        return candidateProgram.included && candidateProgram.steps.length;
    });
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
    recordHistory('Change simultaneous run selection', before, captureSceneSnapshot());
    renderMotionProgramPanel();
}

function handleProgramStepListClick(event) {
    const button = event.target.closest('[data-program-step-select]');
    if (!button || isMotionActive()) return;
    const program = ensureMotionProgram(state.activeProgramRobot);
    if (!program) return;
    program.selectedStepId = button.dataset.programStepSelect;
    renderMotionProgramPanel();
}

function handleProgramStepListChange(event) {
    if (isMotionActive()) return;
    const motionControl = event.target.closest('[data-program-step-motion]');
    const speedControl = event.target.closest('[data-program-step-speed]');
    const stepId = motionControl?.dataset.programStepMotion || speedControl?.dataset.programStepSpeed;
    const program = ensureMotionProgram(state.activeProgramRobot);
    const step = program?.steps.find((candidate) => candidate.id === stepId);
    if (!step) return;
    const before = captureSceneSnapshot();
    if (motionControl) {
        step.motion = motionControl.value === 'MOVL' ? 'MOVL' : 'MOVJ';
        step.speed = step.motion === 'MOVJ' ? DEFAULT_MOVJ_SPEED : DEFAULT_MOVL_SPEED;
    } else {
        const maximum = step.motion === 'MOVJ' ? 100 : 1000;
        step.speed = THREE.MathUtils.clamp(Number(speedControl.value) || 1, 1, maximum);
    }
    recordHistory('Edit motion point', before, captureSceneSnapshot());
    renderMotionProgramPanel();
}

function selectAllProgramRobots() {
    if (isMotionActive()) return;
    const robots = getArticulatedRobots();
    if (!robots.length) return;
    const before = captureSceneSnapshot();
    const shouldSelect = robots.some((robot) => !ensureMotionProgram(robot).included);
    robots.forEach((robot) => { ensureMotionProgram(robot).included = shouldSelect; });
    recordHistory('Select all simultaneous robots', before, captureSceneSnapshot());
    renderMotionProgramPanel();
}

function captureRobotMotionStep(robot, existing = null) {
    const pose = getCurrentTcpPoseBase(robot);
    if (!pose) return null;
    const program = ensureMotionProgram(robot);
    const number = existing ? program.steps.indexOf(existing) + 1 : program.steps.length + 1;
    return {
        id: existing?.id || createMotionId('point'),
        name: existing?.name || `P${String(number).padStart(3, '0')}`,
        motion: existing?.motion || 'MOVJ',
        speed: existing?.speed || DEFAULT_MOVJ_SPEED,
        joints: robot.userData.joints.map((joint) => joint.angle),
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
    program.steps.push(step);
    program.selectedStepId = step.id;
    recordHistory('Add motion point', before, captureSceneSnapshot());
    renderMotionProgramPanel();
}

function updateSelectedMotionStep() {
    if (isMotionActive() || !state.activeProgramRobot) return;
    const program = ensureMotionProgram(state.activeProgramRobot);
    const index = program.steps.findIndex((step) => step.id === program.selectedStepId);
    if (index < 0) return;
    const before = captureSceneSnapshot();
    program.steps[index] = captureRobotMotionStep(state.activeProgramRobot, program.steps[index]);
    recordHistory('Overwrite motion point', before, captureSceneSnapshot());
    renderMotionProgramPanel();
}

function moveSelectedMotionStep(direction) {
    if (isMotionActive()) return;
    const program = ensureMotionProgram(state.activeProgramRobot);
    const index = program?.steps.findIndex((step) => step.id === program.selectedStepId) ?? -1;
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= program.steps.length) return;
    const before = captureSceneSnapshot();
    [program.steps[index], program.steps[nextIndex]] = [program.steps[nextIndex], program.steps[index]];
    recordHistory('Reorder motion point', before, captureSceneSnapshot());
    renderMotionProgramPanel();
}

function deleteSelectedMotionStep() {
    if (isMotionActive()) return;
    const program = ensureMotionProgram(state.activeProgramRobot);
    const index = program?.steps.findIndex((step) => step.id === program.selectedStepId) ?? -1;
    if (index < 0) return;
    const before = captureSceneSnapshot();
    program.steps.splice(index, 1);
    program.selectedStepId = program.steps[Math.min(index, program.steps.length - 1)]?.id || null;
    recordHistory('Delete motion point', before, captureSceneSnapshot());
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
    if (before) recordHistory('Change motion repeat', before, captureSceneSnapshot());
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
        button.title = enabled ? '반복 실행 켜짐' : '반복 실행 꺼짐';
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
                    speed: step.speed,
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

function clearCollisionWarnings() {
    state.collisionHelpers.forEach((helper) => {
        helper.removeFromParent();
        helper.geometry?.dispose();
        helper.material?.dispose();
    });
    state.collisionHelpers.clear();
    state.collisionRobotIds.clear();
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
    clearCollisionWarnings();
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
        showLoading(true, `Loading ${robotProject.displayName}...`);
        const robot = await loadArticulatedRobot(definition, (progress) => {
            showLoading(true, `${robotProject.displayName}: ${progress}%`);
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
        setMotionProgramStatus('Autosaved project restored.');
    } catch (error) {
        console.error('Motion project restore failed:', error);
        showLoading(false);
        setMotionProgramStatus(error.message || 'Project restore failed.', 'error');
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
            setMotionProgramStatus(`Project saved: ${fileHandle.name}`);
        } else {
            saveAs(blob, suggestedName);
            setMotionProgramStatus('Project downloaded. Folder selection is unavailable in this browser.');
        }
    } catch (error) {
        if (error?.name === 'AbortError') {
            setMotionProgramStatus('Project save canceled.');
            return;
        }
        setMotionProgramStatus(error.message || 'Project export failed.', 'error');
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
        recordHistory('Load motion project', before, captureSceneSnapshot());
        setMotionProgramStatus(`Loaded ${file.name}.`);
    } catch (error) {
        applySceneSnapshot(before);
        showLoading(false);
        setMotionProgramStatus(error.message || 'Project import failed.', 'error');
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
    try {
        steps.forEach((step) => {
            if (step.motion === 'MOVJ') {
                validateMovjTarget(robot, step);
                step.joints.forEach((angle, index) => setJointAngle(robot.userData.joints[index], angle, false));
                robot.updateMatrixWorld(true);
            } else {
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
        setMotionProgramStatus(error.message || 'Motion path validation failed.', 'error');
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
    setMotionProgramStatus(`${plans.length} robot motion${plans.length === 1 ? '' : 's'} started.`, 'working');
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
        if (session.segment) session.segment.startTime += delay;
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
    setMotionProgramStatus('Motion paused.', 'working');
    renderMotionProgramPanel();
    return true;
}

function resumePausedRobotMotions(robots) {
    const sessions = robots.map(getMotionSession).filter((session) => session?.status === 'paused');
    if (!sessions.length) return false;
    const now = performance.now();
    sessions.forEach((session) => setMotionSessionPaused(session, false, now));
    setMotionProgramStatus('Motion resumed.', 'working');
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
    if (before) recordHistory('Multi-robot motion', before, captureSceneSnapshot());
    updateMotionUiLock();
    renderMotionProgramPanel();
    scheduleMotionProjectSave();
}

function finishRobotMotionSession(session, status, message = '') {
    const robot = session.robot;
    state.motionSessions.delete(robot.userData.motionInstanceId);
    const program = ensureMotionProgram(robot);
    program.status = status;
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
    if (message) setMotionProgramStatus(message, status === 'error' ? 'error' : '');
    renderMotionProgramPanel();
    finalizeMotionHistoryIfIdle();
}

function stopRobotMotions(robots) {
    let stopped = 0;
    robots.forEach((robot) => {
        const session = getMotionSession(robot);
        if (!session) return;
        state.motionSessions.delete(robot.userData.motionInstanceId);
        ensureMotionProgram(robot).status = 'stopped';
        stopped += 1;
    });
    if (stopped) setMotionProgramStatus(`${stopped} robot motion${stopped === 1 ? '' : 's'} stopped.`);
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
    if (step.motion === 'MOVJ') {
        validateMovjTarget(robot, step);
        const startAngles = robot.userData.joints.map((joint) => joint.angle);
        return {
            type: 'MOVJ',
            step,
            startAngles,
            targetAngles: [...step.joints],
            startTime: timestamp,
            duration: calculateMovjDuration(startAngles, step.joints, robot.userData.joints, step.speed) * 1000
        };
    }
    const startPose = getCurrentTcpPoseBase(robot);
    const targetPose = motionStepTargetPose(step);
    return {
        type: 'MOVL',
        step,
        startPose,
        targetPose,
        startTime: timestamp,
        duration: calculateMovlDuration(
            startPose.position.distanceTo(targetPose.position),
            THREE.MathUtils.radToDeg(startPose.quaternion.angleTo(targetPose.quaternion)),
            step.speed
        ) * 1000
    };
}

function advanceMotionSegment(session, timestamp) {
    const { robot, segment } = session;
    const linearProgress = THREE.MathUtils.clamp((timestamp - segment.startTime) / segment.duration, 0, 1);
    const progress = smoothstep(linearProgress);
    if (segment.type === 'MOVJ') {
        segment.targetAngles.forEach((target, index) => {
            const value = THREE.MathUtils.lerp(segment.startAngles[index], target, progress);
            setJointAngle(robot.userData.joints[index], value, false);
        });
        robot.updateMatrixWorld(true);
    } else {
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
    return linearProgress >= 1;
}

function updateMotionSessions(timestamp) {
    if (!isMotionActive()) return;
    [...state.motionSessions.values()].forEach((session) => {
        if (session.status !== 'running' || timestamp < session.startAt) return;
        try {
            if (!session.segment) {
                session.segment = createMotionSegment(session, timestamp);
                renderMotionProgramPanel();
            }
            if (!session.segment) {
                finishRobotMotionSession(session, 'completed');
                return;
            }
            if (!advanceMotionSegment(session, timestamp)) return;
            session.cursor += 1;
            session.segment = null;
            session.currentStepId = null;
            if (session.cursor >= session.steps.length) {
                if (session.repeat) {
                    session.cursor = 0;
                    ensureMotionProgram(session.robot).progress = 0;
                } else {
                    finishRobotMotionSession(session, 'completed', `${session.robot.userData.motionDisplayName} completed.`);
                }
            }
        } catch (error) {
            finishRobotMotionSession(
                session,
                'error',
                `${session.robot.userData.motionDisplayName}: ${error.message || 'motion failed.'}`
            );
        }
    });
}

function prepareRobotCollisionParts(robot) {
    const parts = [];
    robot.traverse((object) => {
        if (!object.isMesh || object.name === 'CD conduit' || !object.geometry) return;
        object.geometry.computeBoundingBox();
        const box = object.geometry.boundingBox;
        if (!box || box.isEmpty()) return;
        const center = box.getCenter(new THREE.Vector3());
        const halfSize = box.getSize(new THREE.Vector3()).multiplyScalar(0.5);
        parts.push({
            mesh: object,
            localObb: new OBB(center, halfSize, new THREE.Matrix3())
        });
    });
    robot.userData.collisionParts = parts;
}

function addCollisionWarningBox(mesh) {
    if (state.collisionHelpers.has(mesh)) {
        state.collisionHelpers.get(mesh).update();
        return;
    }
    const helper = new THREE.BoxHelper(mesh, 0xef4444);
    helper.name = 'Robot collision warning';
    helper.material.depthTest = false;
    helper.material.transparent = true;
    helper.material.opacity = 0.95;
    helper.renderOrder = 100;
    state.scene.add(helper);
    state.collisionHelpers.set(mesh, helper);
}

function removeCollisionWarningBox(mesh) {
    const helper = state.collisionHelpers.get(mesh);
    if (!helper) return;
    helper.removeFromParent();
    helper.geometry?.dispose();
    helper.material?.dispose();
    state.collisionHelpers.delete(mesh);
}

function collisionSetsEqual(left, right) {
    return left.size === right.size && [...left].every((value) => right.has(value));
}

function updateRobotCollisions(timestamp) {
    if (timestamp - state.lastCollisionCheck < MOTION_COLLISION_INTERVAL) return;
    state.lastCollisionCheck = timestamp;
    const previous = new Set(state.collisionRobotIds);
    const nextCollisionRobotIds = new Set();
    const robots = getArticulatedRobots();
    const collisionMeshes = new Set();
    robots.forEach((robot) => robot.updateMatrixWorld(true));
    const worldParts = new Map(robots.map((robot) => [
        robot,
        (robot.userData.collisionParts || []).map((part) => ({
            mesh: part.mesh,
            obb: part.localObb.clone().applyMatrix4(part.mesh.matrixWorld)
        }))
    ]));
    for (let leftIndex = 0; leftIndex < robots.length; leftIndex += 1) {
        const leftRobot = robots[leftIndex];
        const leftParts = worldParts.get(leftRobot);
        for (let rightIndex = leftIndex + 1; rightIndex < robots.length; rightIndex += 1) {
            const rightRobot = robots[rightIndex];
            const rightParts = worldParts.get(rightRobot);
            let pairCollision = false;
            for (const leftPart of leftParts) {
                for (const rightPart of rightParts) {
                    if (!leftPart.obb.intersectsOBB(rightPart.obb)) continue;
                    pairCollision = true;
                    collisionMeshes.add(leftPart.mesh);
                    collisionMeshes.add(rightPart.mesh);
                }
            }
            if (pairCollision) {
                nextCollisionRobotIds.add(leftRobot.userData.motionInstanceId);
                nextCollisionRobotIds.add(rightRobot.userData.motionInstanceId);
            }
        }
    }
    [...state.collisionHelpers.keys()].forEach((mesh) => {
        if (!collisionMeshes.has(mesh)) removeCollisionWarningBox(mesh);
    });
    collisionMeshes.forEach(addCollisionWarningBox);
    state.collisionRobotIds = nextCollisionRobotIds;
    if (!collisionSetsEqual(previous, state.collisionRobotIds)) renderMotionProgramPanel();
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

function cleanupScene() {
    setBaseJogGizmoEnabled(false);
    state.transformControls.detach();
    const models = [...state.models];
    models.forEach((model) => {
        if (model.userData.motionInstanceId) state.motionPrograms.delete(model.userData.motionInstanceId);
    });
    models.forEach((model) => model.removeFromParent());
    state.models = [];
    state.selectedModel = null;
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
    updateMotionSessions(timestamp);
    updateRobotCollisions(timestamp);
    state.controls.update();
    state.renderer.render(state.scene, state.camera);
}

function onResize() {
    const w = el.canvasContainer.clientWidth, h = el.canvasContainer.clientHeight;
    state.camera.aspect = w / h;
    state.camera.updateProjectionMatrix();
    state.renderer.setSize(w, h);
    if (el.programPanel?.dataset.userResized === 'true') normalizeProgramPanelResizeBox(el.programPanel);
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
        const res = await fetch('./models/models.json?v=20260717-model-joint-speeds1');
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

function showLoading(show, text = 'Loading...') {
    el.loadingOverlay.classList.toggle('hidden', !show);
    el.loadingText.textContent = text;
}

function setStatus(text, color) {
    el.statStatus.textContent = text;
    el.statusDot.style.color = color;
}

init();
