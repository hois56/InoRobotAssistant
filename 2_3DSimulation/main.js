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
import { enableContinuousTransformRotation } from '../3_ToolSelector/continuous-transform-rotation.mjs?v=20260720-rx-continuous-1';
import { buildStepSnapCandidates } from '../3_ToolSelector/snap-geometry.mjs?v=20260721-face-filter-1';
import { MeshCollisionSystem } from './collision-system.mjs?v=20260724-mesh-collision-12';
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
} from './motion-program-core.mjs?v=20260719-tcp-profiles-1';
import {
    INTERFERENCE_ZONE_COUNT,
    INTERFERENCE_COORDINATE_MIN,
    INTERFERENCE_COORDINATE_MAX,
    INTERFERENCE_SAFETY_DISTANCE_MAX,
    cloneInterferenceZones,
    normalizeInterferenceZones,
    getInterferenceZoneBounds,
    pointInsideBounds,
    segmentIntersectsInterferenceRegion,
    validateInterferenceZone
} from './interference-zone-core.mjs?v=20260723-interference-zone-2';
import {
    END_MONITORING_OBJECT_COUNT,
    END_MONITORING_COORDINATE_MIN,
    END_MONITORING_COORDINATE_MAX,
    END_MONITORING_RADIUS_MAX,
    END_MONITORING_HEIGHT_MAX,
    END_MONITORING_MTPC_TOOL_IDS,
    cloneEndMonitoringObjects,
    normalizeEndMonitoringObjects,
    getEndMonitoringCuboidTransform,
    validateEndMonitoringObject
} from './end-monitoring-core.mjs?v=20260724-end-monitoring-1';
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
    selectedModelPart: null,
    zeroPointEdit: {
        active: false,
        model: null,
        origin: new THREE.Vector3(),
        rotationDegrees: new THREE.Vector3(),
        baseWorldQuaternion: new THREE.Quaternion(),
        snapMode: false,
        snapType: 'auto',
        snapRadiusPx: 16,
        snapPoints: [],
        frame: null,
        axes: null,
        transformControls: null,
        marker: null,
        baseModelState: null,
        historyBefore: null,
        handlerVisible: false,
        snapReadoutMessage: '스냅 위치 선택을 누른 뒤 모델 형상 위로 포인터를 이동하세요.'
    },
    modelTreeIdCounter: 0,
    modelPartIdCounter: 0,
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
    panelOpenOrder: [],
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
    interferenceZones: normalizeInterferenceZones(),
    endMonitoringObjects: normalizeEndMonitoringObjects(),
    interferenceRuntime: Array.from({ length: INTERFERENCE_ZONE_COUNT }, () => ({
        status: 'inactive',
        alarmLatched: false,
        lastViolationByRobot: new Map(),
        lastProbeByRobot: new Map(),
        lastMessage: ''
    })),
    interferenceVisuals: [],
    endMonitoringVisuals: [],
    interferenceEditor: {
        zoneId: -1,
        draft: null,
        step: 'basic'
    },
    endMonitoringEditor: {
        objectId: -1,
        draft: null
    },
    simulationIo: {
        inputs: Array.from({ length: 16 }, () => false),
        outputs: Array.from({ length: 16 }, () => false)
    },
    viewPresets: Array.from({ length: 4 }, () => null),
    activeViewSlot: null,
    viewWindow: null,
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
        controllerKind: 'virtual',
        ipAddress: '127.0.0.1',
        bridgeStopInProgress: false,
        bridgeStartInProgress: false,
        bridgeRunning: false,
        bridgeHealthDeadline: 0,
        bridgeHealthTimer: null,
        targetRobotId: null,
        pendingInterferenceReads: new Set(),
        pendingInterferenceToolReads: new Set(),
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
    resetInProgress: false,
    testModelConfirmationResolver: null,
    stepImportWorkerSession: null,
    stepImportRequestId: 0,
    modelImportWorkerSession: null,
    modelImportRequestId: 0,
    backgroundModelLoads: new Map(),
    modelLoadRequestId: 0,
    stepImportCacheDbPromise: null,
    snapMoveMode: false,
    tcpSnapMode: false,
    tcpSnapType: 'auto',
    tcpSnapRadiusPx: 16,
    tcpSnapPoints: [],
    tcpSnapReadoutMessage: '3D 모델링의 스냅 지점을 클릭하세요.',
    snapCandidates: [],
    snapCandidateModelsSignature: '',
    snapCandidateBuildSignature: '',
    snapCandidateBuildPromise: null,
    snapCandidatesReady: false,
    snapWorldIndex: null,
    snapWorldIndexSignature: '',
    snapLazyReadyMeshes: new Set(),
    snapLazyBuildPromises: new Map(),
    snapHover: null,
    snapFaceSelections: [],
    snapFaceSelection: null,
    snapFaceOverlays: [],
    snapFaceOverlay: null,
    snapCandidateMarkers: [],
    snapDisplayedCandidates: [],
    snapMarkerReferenceDistance: null,
    snapPointerMoveFrame: null,
    snapLastPointerEvent: null,
    viewNavigationActive: false,
    snapVisibilityRaycaster: new THREE.Raycaster(),
    collision: {
        // Collision detection is enabled by default for every new simulation session.
        enabled: true,
        debugVisible: false,
        system: null,
        minCheckIntervalMs: 80,
        lastCheckAt: 0,
        lastCheckSkipped: false,
        dirty: true,
        dirtyRoots: new Set(),
        lastResult: null,
        lastStatusKey: '',
        stopNotice: null,
        ignoredMotionCollisionKeys: new Set(),
        jogRefreshTimer: null,
        highlightedMaterials: new Map(),
        debugLines: new Map(),
        safeRobotAngles: new Map(),
        checking: false
    },
    largeModelPerformanceMode: false,
    renderFramePending: false,
    outlineMode: false,
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
    btnResetSimulation: document.getElementById('btn-reset-simulation'),
    simulationResetDialog: document.getElementById('simulation-reset-dialog'),
    btnCancelSimulationReset: document.getElementById('btn-cancel-simulation-reset'),
    btnConfirmSimulationReset: document.getElementById('btn-confirm-simulation-reset'),
    testModelDialog: document.getElementById('test-model-dialog'),
    btnCancelTestModel: document.getElementById('btn-cancel-test-model'),
    btnConfirmTestModel: document.getElementById('btn-confirm-test-model'),
    loadingOverlay:  document.getElementById('loading-overlay'),
    loadingText:     document.getElementById('loading-text'),
    emptyState:      document.getElementById('empty-state'),
    statName:        document.getElementById('stat-name'),
    statStatus:      document.getElementById('stat-status'),
    statusDot:       document.getElementById('status-dot'),
    canvasContainer: document.getElementById('canvas-container'),
    btnResetView:    document.getElementById('btn-reset-view'),
    btnToggleOutline: document.getElementById('btn-toggle-outline'),
    btnToggleGrid:   document.getElementById('btn-toggle-grid'),
    btnFullscreenMode: document.getElementById('btn-fullscreen-mode'),
    btnTestModel:    document.getElementById('btn-test-model'),
    btnToggleCollision: document.getElementById('btn-toggle-collision'),
    btnPositionExport: document.getElementById('btn-position-export'),
    btnSnapMove: document.getElementById('btn-snap-move'),
    btnImport3D:     document.getElementById('btn-import-3d'),
    inputImport3D:   document.getElementById('input-import-3d'),
    importDialog:    document.getElementById('import-3d-dialog'),
    importPlacement: document.getElementById('import-placement'),
    importQuality:   document.getElementById('import-quality'),
    importQualityNote: document.getElementById('import-quality-note'),
    modelTree:       document.getElementById('model-tree'),
    modelTreeCount:  document.getElementById('model-tree-count'),
    modelBrowserPanel: document.getElementById('model-browser-panel'),
    modelContextMenu: document.getElementById('model-context-menu'),
    modelChangeZeroPoint: document.getElementById('model-change-zero-point'),
    modelColorPicker: document.getElementById('model-color-picker'),
    jogPanel:        document.getElementById('jog-panel'),
    tcpProfilePanel: document.getElementById('tcp-profile-panel'),
    tcpLauncherLabel: document.getElementById('tcp-launcher-label'),
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
    zeroPointEditor: document.getElementById('model-zero-point-editor'),
    btnCloseZeroPointEditor: document.getElementById('btn-close-zero-point-editor'),
    btnCancelZeroPoint: document.getElementById('btn-cancel-zero-point'),
    btnApplyZeroPoint: document.getElementById('btn-apply-zero-point'),
    btnZeroPointSnap: document.getElementById('btn-model-zero-snap'),
    zeroPointSnapType: document.getElementById('model-zero-snap-type'),
    zeroPointSnapRadius: document.getElementById('model-zero-snap-radius'),
    zeroPointSnapRadiusValue: document.getElementById('model-zero-snap-radius-value'),
    zeroPointSnapReadout: document.getElementById('model-zero-snap-readout'),
    zeroPointMultiCenterControls: document.getElementById('model-zero-multi-center-controls'),
    zeroPointMultiCenterCount: document.getElementById('model-zero-multi-center-count'),
    btnZeroPointMultiCenterApply: document.getElementById('model-zero-multi-center-apply'),
    btnZeroPointMultiCenterReset: document.getElementById('model-zero-multi-center-reset'),
    zeroPointOriginInputs: Object.fromEntries([...document.querySelectorAll('[data-zero-origin-axis]')]
        .map((input) => [input.dataset.zeroOriginAxis, input])),
    zeroPointRotationInputs: Object.fromEntries([...document.querySelectorAll('[data-zero-rotation-axis]')]
        .map((input) => [input.dataset.zeroRotationAxis, input])),
    zeroPointAxisDirections: document.getElementById('model-zero-axis-directions'),
    transformModeButtons: [...document.querySelectorAll('[data-transform-mode]')],
    btnUndo:         document.getElementById('btn-undo'),
    btnRedo:         document.getElementById('btn-redo'),
    btnCloseImport:  document.getElementById('btn-close-import'),
    btnCancelImport: document.getElementById('btn-cancel-import'),
    btnConfirmImport: document.getElementById('btn-confirm-import'),
    jogControls:     document.getElementById('jog-controls'),
    btnResetJoints:  document.getElementById('btn-reset-joints'),
    tcpProfileManager: document.getElementById('tcp-profile-manager'),
    tcpProfileEditor: document.getElementById('tcp-profile-editor'),
    activeTcpProfileLabel: document.getElementById('active-tcp-profile-label'),
    btnApplyTcpProfile: document.getElementById('btn-apply-tcp-profile'),
    btnResetTcpProfile: document.getElementById('btn-reset-tcp-profile'),
    tcpProfileStatus: document.getElementById('tcp-profile-status'),
    btnTcpSnap: document.getElementById('btn-tcp-snap'),
    tcpSnapType: document.getElementById('tcp-snap-type'),
    tcpSnapRadius: document.getElementById('tcp-snap-radius'),
    tcpSnapRadiusValue: document.getElementById('tcp-snap-radius-value'),
    tcpSnapReadout: document.getElementById('tcp-snap-readout'),
    tcpMultiCenterControls: document.getElementById('tcp-multi-center-controls'),
    tcpMultiCenterCount: document.getElementById('tcp-multi-center-count'),
    btnTcpMultiCenterApply: document.getElementById('tcp-multi-center-apply'),
    btnTcpMultiCenterReset: document.getElementById('tcp-multi-center-reset'),
    tcpProfileButtons: [...document.querySelectorAll('[data-tcp-profile]')],
    tcpOffsetInputs: Object.fromEntries([...document.querySelectorAll('[data-tcp-offset]')]
        .map((input) => [input.dataset.tcpOffset, input])),
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
    collisionStatus: document.getElementById('collision-status'),
    programStatus: document.getElementById('program-status'),
    btnProgramSelectAll: document.getElementById('program-select-all'),
    btnProgramAdd: document.getElementById('program-add-step'),
    btnProgramAddDelay: document.getElementById('program-add-delay'),
    btnProgramAddTimeStart: document.getElementById('program-add-time-start'),
    btnProgramAddTimeOut: document.getElementById('program-add-time-out'),
    btnProgramAddView: document.getElementById('program-add-view'),
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
    interferenceZonePanel: document.getElementById('interference-zone-panel'),
    interferenceZoneList: document.getElementById('interference-zone-list'),
    interferenceZoneActiveCount: document.getElementById('interference-zone-active-count'),
    endMonitoringList: document.getElementById('end-monitoring-list'),
    interferenceInputList: document.getElementById('interference-input-list'),
    interferenceOutputList: document.getElementById('interference-output-list'),
    interferenceZoneDialog: document.getElementById('interference-zone-dialog'),
    interferenceZoneDialogTitle: document.getElementById('interference-zone-dialog-title'),
    interferenceZoneClose: document.getElementById('interference-zone-close'),
    interferenceZoneRemarks: document.getElementById('interference-zone-remarks'),
    interferenceZoneTargetRobot: document.getElementById('interference-zone-target-robot'),
    interferenceZoneMonitoringObject: document.getElementById('interference-zone-monitoring-object'),
    interferenceZoneInsideOutside: document.getElementById('interference-zone-inside-outside'),
    interferenceZoneTrigger: document.getElementById('interference-zone-trigger'),
    interferenceZoneSafety: document.getElementById('interference-zone-safety'),
    interferenceZoneInEnabled: document.getElementById('interference-zone-in-enabled'),
    interferenceZoneInSignal: document.getElementById('interference-zone-in-signal'),
    interferenceZoneOutEnabled: document.getElementById('interference-zone-out-enabled'),
    interferenceZoneOutSignal: document.getElementById('interference-zone-out-signal'),
    interferenceZoneMethod: document.getElementById('interference-zone-method'),
    interferenceZoneDiagonalFields: document.getElementById('interference-zone-diagonal-fields'),
    interferenceZoneDatumFields: document.getElementById('interference-zone-datum-fields'),
    interferenceZoneValidation: document.getElementById('interference-zone-validation'),
    interferenceZonePrevious: document.getElementById('interference-zone-previous'),
    interferenceZoneNext: document.getElementById('interference-zone-next'),
    interferenceZoneDone: document.getElementById('interference-zone-done'),
    endMonitoringDialog: document.getElementById('end-monitoring-dialog'),
    endMonitoringDialogTitle: document.getElementById('end-monitoring-dialog-title'),
    endMonitoringClose: document.getElementById('end-monitoring-close'),
    endMonitoringRemarks: document.getElementById('end-monitoring-remarks'),
    endMonitoringType: document.getElementById('end-monitoring-type'),
    endMonitoringMtcpFields: document.getElementById('end-monitoring-mtcp-fields'),
    endMonitoringSphereFields: document.getElementById('end-monitoring-sphere-fields'),
    endMonitoringCuboidFields: document.getElementById('end-monitoring-cuboid-fields'),
    endMonitoringSphereCenterZ: document.getElementById('end-monitoring-sphere-center-z'),
    endMonitoringSphereRadius: document.getElementById('end-monitoring-sphere-radius'),
    endMonitoringCuboidMethod: document.getElementById('end-monitoring-cuboid-method'),
    endMonitoringCuboidDiagonal: document.getElementById('end-monitoring-cuboid-diagonal'),
    endMonitoringCuboidDatum: document.getElementById('end-monitoring-cuboid-datum'),
    endMonitoringCuboidFourPoint: document.getElementById('end-monitoring-cuboid-four-point'),
    endMonitoringValidation: document.getElementById('end-monitoring-validation'),
    endMonitoringDone: document.getElementById('end-monitoring-done'),
    viewPresetsPanel: document.getElementById('view-presets-panel'),
    viewPresetsList: document.getElementById('view-presets-list'),
    virtualControllerSource: document.getElementById('virtual-controller-source'),
    virtualControllerKind: document.getElementById('virtual-controller-kind'),
    virtualControllerIp: document.getElementById('virtual-controller-ip'),
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

const MODEL_PART_SELECTION_COLOR = 0x22d3ee;

const IK_POSITION_SCALE = 400;
const IK_MAX_ITERATIONS = 320;
const IK_DAMPING = 0.035;
const IK_MIN_DAMPING = 0.00001;
const IK_DAMPING_TRANSITION_ERROR = 0.08;
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
const TCP_PROFILE_COUNT = 3;
const TRACE_SOURCE_LIVENESS_TIMEOUT_MS = 2500;
const VIRTUAL_CONTROLLER_STREAM_STALL_MS = 750;
const VIRTUAL_CONTROLLER_STREAM_WATCHDOG_MS = 250;
const SUPPORTED_IMPORT_EXTENSIONS = new Set(['stl', 'fbx', 'obj', 'glb', 'gltf', 'stp', 'step']);
const Y_UP_IMPORT_EXTENSIONS = new Set(['fbx', 'glb', 'gltf']);
const TEST_MODEL_ASSET_PATHS = Object.freeze({
    scene: './test-assets/Test_Equipment_CAD.step',
    tcp: './test-assets/Vacuum_Tool_X200mm.stl'
});
const TEST_MODEL_FILE_NAMES = new Set([
    'Test_Equipment_CAD.step',
    'Vacuum_Tool_X200mm.stl'
]);
const IMPORT_PLACEMENT_COLORS = { tcp: 0xf97316, scene: 0x65a30d };
const MOTION_PROJECT_STORAGE_KEY = 'inorobot.3d-simulation.motion-project.v1';
const VIEW_PRESETS_STORAGE_KEY = 'inorobot.3d-simulation.view-presets.v1';
const SIMULATION_STORAGE_KEY_PREFIX = 'inorobot.3d-simulation.';
const VIEW_PRESET_COUNT = 4;
const CYCLE_TIME_DISPLAY_INTERVAL = 50;
const MAX_MOTION_TRANSITIONS_PER_FRAME = 256;
const MOTION_MOVL_SAMPLE_DISTANCE = 25;
const MOTION_MOVL_SAMPLE_ANGLE = 5;
const SNAP_RADIUS_PX = 16;
const SNAP_WORLD_INDEX_LEAF_SIZE = 48;
const SNAP_WORLD_INDEX_MAX_DEPTH = 14;
const SNAP_MARKER_CAMERA_SCALE = Object.freeze({ min: 0.55, max: 1.25 });
const MAX_VISIBLE_SIMULATION_SNAP_MARKERS = 256;
const MAX_VISIBLE_SIMULATION_SNAP_CENTER_MARKERS = 96;
const SIMULATION_SNAP_CENTER_MARKER_TYPES = new Set([
    'multi-point-center',
    'rectangle-center',
    'circle-center'
]);
const SIMULATION_SNAP_MARKER_TYPE_ORDER = Object.freeze([
    'multi-point-center',
    'rectangle-center',
    'circle-center',
    'endpoint',
    'vertex',
    'edge-midpoint'
]);
const MEBIBYTE = 1024 * 1024;
const MAX_MODEL_IMPORT_SIZE_BYTES = 500 * MEBIBYTE;
const STEP_IMPORT_CACHE_DB_NAME = 'inorobot-3d-step-cache';
const STEP_IMPORT_CACHE_STORE_NAME = 'models';
const STEP_IMPORT_CACHE_VERSION = 3;
const STEP_IMPORT_CACHE_MAX_ENTRIES = 4;
const STEP_IMPORT_CACHE_MAX_SOURCE_BYTES = 32 * MEBIBYTE;
const STEP_LARGE_FILE_ENGINE_MIN_BYTES = 64 * MEBIBYTE;
const LARGE_MODEL_PERFORMANCE_MIN_BYTES = 100 * MEBIBYTE;
const STEP_IMPORT_QUALITY_PRESETS = Object.freeze({
    auto: Object.freeze({ key: 'auto', label: '자동 (권장)' }),
    lightweight: Object.freeze({ key: 'lightweight', label: '경량 (빠른 가져오기)' }),
    standard: Object.freeze({ key: 'standard', label: '표준' }),
    high: Object.freeze({ key: 'high', label: '고품질 (느림)' })
});
// Motion rendering stays on the display-refresh path; never throttle large models to 30 Hz.
const LARGE_MODEL_RENDER_FPS = 60;
const LARGE_MODEL_PERFORMANCE_MIN_TRIANGLES = 200000;
const SIMULATION_SNAP_OVERLAP_TOLERANCE_PX = 7;
// Endpoints stay exhaustive; pointer lookup is bounded by the screen-space index below.
const SIMULATION_SNAP_MAX_PER_TYPE = Object.freeze({
    endpoint: Infinity,
    vertex: 12000,
    'edge-midpoint': 12000,
    'circle-center': 4000,
    'rectangle-center': 2000,
    'multi-point-center': 2000
});
const SIMULATION_SNAP_DISABLED_TYPES = Object.freeze([
    'face-center',
    'shape-center',
    'virtual-intersection'
]);
const TCP_AXES_LOCAL_SIZE = 110;
const TCP_AXES_SCREEN_PIXELS = 40;
const tcpAxesWorldPosition = new THREE.Vector3();
const tcpAxesCameraPosition = new THREE.Vector3();
const tcpAxesParentScale = new THREE.Vector3();
const SNAP_TYPES = Object.freeze({
    // Specific geometric centers must win when they overlap generic topology snaps.
    'circle-center': { label: '원/호 중심점', symbol: '⊙', priority: 0 },
    'rectangle-center': { label: '사각형 중심점', symbol: '▣', priority: 0 },
    endpoint: { label: '끝점', symbol: '◇', priority: 2 },
    vertex: { label: '꼭짓점', symbol: '□', priority: 2 },
    'edge-midpoint': { label: '에지 중심점', symbol: '△', priority: 3 },
    'multi-point-center': { label: '다중 점 중심점', symbol: '⊕', priority: 1 }
});
const PANEL_RESIZE_EDGE_SIZE = 8;
const PANEL_MINIMUM_SIZES = Object.freeze({
    'model-browser-panel': { width: 260, height: 220 },
    'jog-panel': { width: 250, height: 300 },
    'tcp-profile-panel': { width: 280, height: 360 },
    'virtual-controller-panel': { width: 250, height: 230 },
    'view-presets-panel': { width: 280, height: 260 },
    'program-panel': { width: 300, height: 320 },
    'interference-zone-panel': { width: 350, height: 420 }
});
const PANEL_STACK_BASE_Z_INDEX = 70;
const PANEL_IDS = Object.freeze(Object.keys(PANEL_MINIMUM_SIZES));
const PANEL_STACK_IDS = Object.freeze([...PANEL_IDS, 'interference-zone-dialog']);
const PANEL_DRAG_EXCLUDED_SELECTOR = [
    'button', 'input', 'select', 'textarea', 'a', 'label', 'option',
    '[contenteditable="true"]', '[role="button"]', '[role="treeitem"]',
    '[data-panel-drag-ignore]'
].join(', ');

function endMonitoringCoordinateInputs(pointKey) {
    return ['X', 'Y', 'Z'].map((axis, index) => (
        `<label>${axis}<input data-end-monitoring-point="${pointKey}" data-axis="${index}" type="number" min="-10000" max="10000" step="0.001"></label>`
    )).join('');
}

function ensureEndMonitoringUi() {
    if (!el.interferenceZoneMonitoringObject && el.interferenceZoneTargetRobot) {
        const field = document.createElement('label');
        field.innerHTML = `<span>${uiText('감지 대상')}</span><select id="interference-zone-monitoring-object"></select>`;
        el.interferenceZoneTargetRobot.closest('label')?.insertAdjacentElement('afterend', field);
        el.interferenceZoneMonitoringObject = field.querySelector('select');
    }
    if (el.endMonitoringDialog) return;

    const diagonal = `
        <div id="end-monitoring-cuboid-diagonal" class="end-monitoring-cuboid-method">
            <div class="interference-point-block">
                <div class="interference-point-heading"><strong>${uiText('Point 1 (mm)')}</strong><button type="button" data-end-monitoring-get-point="p1">${uiText('Get point')}</button></div>
                <div class="interference-coordinate-grid">${endMonitoringCoordinateInputs('p1')}</div>
                <div class="interference-point-heading"><strong>${uiText('Point 2 (mm)')}</strong><button type="button" data-end-monitoring-get-point="p2">${uiText('Get point')}</button></div>
                <div class="interference-coordinate-grid">${endMonitoringCoordinateInputs('p2')}</div>
            </div>
        </div>`;
    const datum = `
        <div id="end-monitoring-cuboid-datum" class="end-monitoring-cuboid-method hidden">
            <div class="interference-point-block">
                <div class="interference-point-heading"><strong>${uiText('Datum point (mm)')}</strong><button type="button" data-end-monitoring-get-point="datum">${uiText('Get datum point')}</button></div>
                <div class="interference-coordinate-grid">${endMonitoringCoordinateInputs('datum')}</div>
                <div class="interference-point-heading"><strong>${uiText('Offset (mm)')}</strong></div>
                <div class="interference-coordinate-grid">${endMonitoringCoordinateInputs('offset')}</div>
            </div>
        </div>`;
    const fourPoints = Array.from({ length: 4 }, (_, index) => `
        <div><strong>P${index + 1}</strong><button type="button" data-end-monitoring-get-point="point${index}">${uiText('Get')}</button>
            <div class="interference-coordinate-grid">${endMonitoringCoordinateInputs(`point${index}`)}</div>
        </div>`).join('');
    const dialog = document.createElement('dialog');
    dialog.id = 'end-monitoring-dialog';
    dialog.className = 'interference-zone-dialog end-monitoring-dialog';
    dialog.setAttribute('aria-labelledby', 'end-monitoring-dialog-title');
    dialog.innerHTML = `
        <form method="dialog">
            <div class="interference-zone-dialog-header">
                <div><span>${uiText('END MONITORING OBJECT')}</span><h2 id="end-monitoring-dialog-title">${uiText('TCP 감지 범위 설정')}</h2></div>
                <button id="end-monitoring-close" type="button" aria-label="${uiText('닫기')}"><i class="fa-solid fa-xmark"></i></button>
            </div>
            <section class="interference-zone-step">
                <div class="interference-zone-field-grid">
                    <label class="wide"><span>${uiText('Remarks')}</span><input id="end-monitoring-remarks" type="text" maxlength="120" autocomplete="off"></label>
                    <label class="wide"><span>${uiText('감지 타입')}</span><select id="end-monitoring-type"><option value="mtcp">MTCP</option><option value="sphere">${uiText('Sphere')}</option><option value="cuboid">${uiText('Cuboid bounding box')}</option></select></label>
                </div>
                <div id="end-monitoring-mtcp-fields" class="end-monitoring-type-fields">
                    <p class="interference-zone-note">${uiText('선택한 TCP 중 하나라도 간섭영역 조건에 도달하면 감지합니다.')}</p>
                    <div class="end-monitoring-tcp-grid">
                        <label><input type="checkbox" data-end-monitoring-mtcp="tool0"> Tool0</label>
                        <label><input type="checkbox" data-end-monitoring-mtcp="tcp0"> ${uiText('TCP 1')}</label>
                        <label><input type="checkbox" data-end-monitoring-mtcp="tcp1"> ${uiText('TCP 2')}</label>
                        <label><input type="checkbox" data-end-monitoring-mtcp="tcp2"> ${uiText('TCP 3')}</label>
                    </div>
                </div>
                <div id="end-monitoring-sphere-fields" class="end-monitoring-type-fields hidden">
                    <div class="interference-zone-field-grid">
                        <label><span>${uiText('Center Z')}</span><input id="end-monitoring-sphere-center-z" type="number" min="-10000" max="10000" step="0.001"><small>mm</small></label>
                        <label><span>${uiText('Radius R')}</span><input id="end-monitoring-sphere-radius" type="number" min="0" max="10000" step="0.001"><small>mm</small></label>
                    </div>
                    <p class="interference-zone-note">${uiText('구 중심은 Tool0의 로컬 Z 방향으로 오프셋됩니다.')}</p>
                </div>
                <div id="end-monitoring-cuboid-fields" class="end-monitoring-type-fields hidden">
                    <label class="interference-zone-method"><span>${uiText('Type')}</span><select id="end-monitoring-cuboid-method"><option value="diagonal">${uiText('Diagonal point')}</option><option value="datumOffset">${uiText('Datum point + offset')}</option><option value="fourPointsHeight">${uiText('Four points + height')}</option></select></label>
                    ${diagonal}
                    ${datum}
                    <div id="end-monitoring-cuboid-four-point" class="end-monitoring-cuboid-method hidden"><div class="interference-point-block">
                        <div class="interference-point-heading"><strong>${uiText('Bottom points (mm)')}</strong><span>${uiText('Tool0 기준')}</span></div>
                        <div class="end-monitoring-four-point-grid">${fourPoints}</div>
                        <label class="end-monitoring-height"><span>${uiText('Height (Tool0 Z)')}</span><input data-end-monitoring-height type="number" min="0.001" max="10000" step="0.001"><small>mm</small></label>
                    </div></div>
                </div>
                <p id="end-monitoring-validation" class="interference-zone-validation" role="alert"></p>
            </section>
            <div class="interference-zone-dialog-actions"><button id="end-monitoring-done" type="button" class="primary">${uiText('Done')}</button></div>
        </form>`;
    document.body.append(dialog);
    window.InoRobotI18n?.apply(dialog);
    Object.assign(el, {
        endMonitoringDialog: dialog,
        endMonitoringDialogTitle: dialog.querySelector('#end-monitoring-dialog-title'),
        endMonitoringClose: dialog.querySelector('#end-monitoring-close'),
        endMonitoringRemarks: dialog.querySelector('#end-monitoring-remarks'),
        endMonitoringType: dialog.querySelector('#end-monitoring-type'),
        endMonitoringMtcpFields: dialog.querySelector('#end-monitoring-mtcp-fields'),
        endMonitoringSphereFields: dialog.querySelector('#end-monitoring-sphere-fields'),
        endMonitoringCuboidFields: dialog.querySelector('#end-monitoring-cuboid-fields'),
        endMonitoringSphereCenterZ: dialog.querySelector('#end-monitoring-sphere-center-z'),
        endMonitoringSphereRadius: dialog.querySelector('#end-monitoring-sphere-radius'),
        endMonitoringCuboidMethod: dialog.querySelector('#end-monitoring-cuboid-method'),
        endMonitoringCuboidDiagonal: dialog.querySelector('#end-monitoring-cuboid-diagonal'),
        endMonitoringCuboidDatum: dialog.querySelector('#end-monitoring-cuboid-datum'),
        endMonitoringCuboidFourPoint: dialog.querySelector('#end-monitoring-cuboid-four-point'),
        endMonitoringValidation: dialog.querySelector('#end-monitoring-validation'),
        endMonitoringDone: dialog.querySelector('#end-monitoring-done')
    });
}

async function init() {
    try {
        setupUI();
        setupScene();
        setupLights();
        setupControls();
        setupEventListeners();
        animate();
        scheduleStepImportWorkerWarmup();
        await populateModelList();
        await restoreMotionProjectFromStorage();
        setStatus('Ready', '#22c55e');
    } catch (err) {
        console.error("Initialization Failed:", err);
        setStatus('초기화 중 오류가 발생했습니다.', '#ef4444');
    }
}

function setupUI() {
    ensureEndMonitoringUi();
    loadViewConfiguration();
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
        const tcpButton = el.panelLauncher.querySelector('[data-panel-toggle="tcp-profile-panel"]');
        const virtualButton = el.panelLauncher.querySelector('[data-panel-toggle="virtual-controller-panel"]');
        const divider = el.panelLauncher.querySelector('.viewer-control-divider');
        el.panelLauncher.insertBefore(programButton, tcpButton || virtualButton || divider);
    }
    if (el.panelLauncher && !el.panelLauncher.querySelector('[data-panel-toggle="interference-zone-panel"]')) {
        const zoneButton = document.createElement('button');
        zoneButton.type = 'button';
        zoneButton.dataset.panelToggle = 'interference-zone-panel';
        zoneButton.title = uiText('간섭영역 설정 표시/숨기기');
        zoneButton.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> ${uiText('간섭영역')}`;
        const viewButton = el.panelLauncher.querySelector('[data-panel-toggle="view-presets-panel"]');
        el.panelLauncher.insertBefore(zoneButton, viewButton || divider);
    }
    renderInterferenceZonePanel();
    refreshInterferenceZoneDialogRobotOptions();
    updateInterferenceZoneVisuals();
    
    // Update CAD download button title
    const btnDown = document.getElementById('btn-download-cad');
    if(btnDown) btnDown.title = uiText('현재 열린 모든 모델 CAD 다운로드');
    updateCollisionUi();
}

const SIMULATION_RESET_MESSAGE = '모든 설정 및 모델이 초기화됩니다. 정말로 진행하시겠습니까?';
const TEST_MODEL_CONFIRMATION_MESSAGE = '테스트용 모델링을 적용하시겠습니까?\nTCP 1번은 Test 값으로 덮어쓰기됩니다.';

function closeSimulationResetDialog() {
    if (el.simulationResetDialog?.open) el.simulationResetDialog.close();
}

function openSimulationResetDialog() {
    if (state.resetInProgress) return;
    if (typeof el.simulationResetDialog?.showModal === 'function') {
        el.simulationResetDialog.showModal();
        return;
    }
    if (window.confirm(uiText(SIMULATION_RESET_MESSAGE))) void resetSimulation();
}

function resolveTestModelConfirmation(confirmed) {
    const resolve = state.testModelConfirmationResolver;
    state.testModelConfirmationResolver = null;
    if (el.testModelDialog?.open) el.testModelDialog.close();
    resolve?.(Boolean(confirmed));
}

function requestTestModelConfirmation() {
    if (typeof el.testModelDialog?.showModal !== 'function') {
        return Promise.resolve(window.confirm(uiText(TEST_MODEL_CONFIRMATION_MESSAGE)));
    }
    return new Promise((resolve) => {
        state.testModelConfirmationResolver = resolve;
        el.testModelDialog.showModal();
    });
}

function clearSimulationStorage() {
    try {
        const keys = [];
        for (let index = 0; index < localStorage.length; index += 1) {
            const key = localStorage.key(index);
            if (key?.startsWith(SIMULATION_STORAGE_KEY_PREFIX)) keys.push(key);
        }
        keys.forEach((key) => localStorage.removeItem(key));
    } catch (error) {
        console.warn('Unable to clear simulation storage:', error);
    }
}

async function deleteStepImportCacheDatabase() {
    if (!('indexedDB' in window)) return;
    try {
        const db = await state.stepImportCacheDbPromise;
        db?.close();
    } catch (error) {
        console.warn('Unable to close STEP import cache:', error);
    }
    state.stepImportCacheDbPromise = null;
    await new Promise((resolve) => {
        let settled = false;
        const finish = () => {
            if (settled) return;
            settled = true;
            resolve();
        };
        try {
            const request = window.indexedDB.deleteDatabase(STEP_IMPORT_CACHE_DB_NAME);
            request.addEventListener('success', finish, { once: true });
            request.addEventListener('error', finish, { once: true });
            request.addEventListener('blocked', () => {
                console.warn('STEP import cache deletion was blocked by another tab.');
                finish();
            }, { once: true });
        } catch (error) {
            console.warn('Unable to delete STEP import cache:', error);
            finish();
        }
    });
}

async function resetSimulation() {
    if (state.resetInProgress) return;
    state.resetInProgress = true;
    closeSimulationResetDialog();
    if (el.btnResetSimulation) el.btnResetSimulation.disabled = true;
    if (el.btnConfirmSimulationReset) el.btnConfirmSimulationReset.disabled = true;
    window.clearTimeout(state.motionSaveTimer);
    state.motionSaveTimer = null;

    try {
        clearSimulationStorage();
        await deleteStepImportCacheDatabase();
    } finally {
        // beforeunload must not recreate the project that was just deleted.
        window.location.reload();
    }
}

function getInterferenceZoneRuntime(zoneId) {
    return state.interferenceRuntime[zoneId] || null;
}

function getInterferenceZoneTargets(zone) {
    const robots = getArticulatedRobots();
    if (!zone || zone.targetRobotId === 'all') return robots;
    return robots.filter((robot) => robot.userData.motionInstanceId === zone.targetRobotId);
}

function getInterferenceZoneRobotLabel(robotId) {
    if (robotId === 'all') return uiText('전체 로봇');
    const robot = getArticulatedRobots().find((candidate) => candidate.userData.motionInstanceId === robotId);
    return robot?.userData.motionDisplayName || robot?.userData.modelName || robotId || uiText('알 수 없음');
}

function isInterferenceZoneInputDisabled(zone) {
    return Number.isInteger(zone?.inSignal)
        && zone.inSignal >= 0
        && state.simulationIo.inputs[zone.inSignal] === true;
}

function isInterferenceZoneEnabled(zone) {
    return Boolean(zone?.activate) && !isInterferenceZoneInputDisabled(zone);
}

function getInterferenceZoneStatus(zoneId) {
    const zone = state.interferenceZones[zoneId];
    const runtime = getInterferenceZoneRuntime(zoneId);
    if (!zone?.activate || isInterferenceZoneInputDisabled(zone)) return 'inactive';
    if (runtime?.alarmLatched) return 'stopped';
    if (runtime?.status === 'danger') return 'danger';
    return 'active';
}

function interferenceZoneStatusLabel(status) {
    return uiText(({ inactive: '비활성화', active: '활성화', danger: '간섭', stopped: '정지' })[status] || status);
}

function refreshInterferenceZoneDialogRobotOptions() {
    if (!el.interferenceZoneTargetRobot) return;
    const selected = state.interferenceEditor.draft?.targetRobotId
        || el.interferenceZoneTargetRobot.value || 'all';
    const options = [
        { value: 'all', label: uiText('전체 로봇') },
        ...getArticulatedRobots().map((robot) => ({
            value: robot.userData.motionInstanceId,
            label: robot.userData.motionDisplayName || robot.userData.modelName || uiText('ROBOT')
        }))
    ];
    el.interferenceZoneTargetRobot.replaceChildren(...options.map(({ value, label }) => {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = label;
        return option;
    }));
    el.interferenceZoneTargetRobot.value = options.some(({ value }) => value === selected) ? selected : 'all';
    refreshInterferenceZoneMonitoringObjectOptions();
}

function endMonitoringObjectLabel(object) {
    const type = object.type === 'sphere' ? 'Sphere' : object.type === 'cuboid' ? 'Cuboid' : 'MTCP';
    return `#${object.id} ${object.remarks || type}`;
}

function refreshInterferenceZoneMonitoringObjectOptions() {
    if (!el.interferenceZoneMonitoringObject) return;
    const selected = state.interferenceEditor.draft?.monitoringObjectId
        ?? el.interferenceZoneMonitoringObject.value
        ?? 'currentTcp';
    const options = [
        { value: 'currentTcp', label: uiText('현재 TCP (점)') },
        ...state.endMonitoringObjects.map((object) => ({
            value: String(object.id),
            label: endMonitoringObjectLabel(object)
        }))
    ];
    el.interferenceZoneMonitoringObject.replaceChildren(...options.map(({ value, label }) => {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = label;
        return option;
    }));
    el.interferenceZoneMonitoringObject.value = options.some(({ value }) => value === String(selected))
        ? String(selected)
        : 'currentTcp';
}

function renderEndMonitoringList() {
    if (!el.endMonitoringList) return;
    el.endMonitoringList.replaceChildren(...state.endMonitoringObjects.map((object) => {
        const row = document.createElement('div');
        row.className = 'end-monitoring-row';
        row.dataset.endMonitoringRow = String(object.id);
        const type = object.type === 'sphere' ? 'Sphere' : object.type === 'cuboid' ? 'Cuboid' : 'MTCP';
        row.innerHTML = `<strong>${object.id}</strong><span></span><em>${uiText(type)}</em><button type="button" class="end-monitoring-read" data-end-monitoring-read title="실제 컨트롤러에서 Tool 설정 가져오기">가져오기</button><button type="button" data-end-monitoring-edit>${uiText('Edit')}</button>`;
        row.querySelector('span').textContent = object.remarks || '-';
        return row;
    }));
}

function updateEndMonitoringTypeFields() {
    const type = el.endMonitoringType?.value || 'mtcp';
    el.endMonitoringMtcpFields?.classList.toggle('hidden', type !== 'mtcp');
    el.endMonitoringSphereFields?.classList.toggle('hidden', type !== 'sphere');
    el.endMonitoringCuboidFields?.classList.toggle('hidden', type !== 'cuboid');
    const method = el.endMonitoringCuboidMethod?.value || 'diagonal';
    el.endMonitoringCuboidDiagonal?.classList.toggle('hidden', method !== 'diagonal');
    el.endMonitoringCuboidDatum?.classList.toggle('hidden', method !== 'datumOffset');
    el.endMonitoringCuboidFourPoint?.classList.toggle('hidden', method !== 'fourPointsHeight');
}

function readEndMonitoringDraft() {
    const draft = state.endMonitoringEditor.draft;
    if (!draft) return null;
    draft.remarks = el.endMonitoringRemarks?.value || '';
    draft.type = el.endMonitoringType?.value === 'sphere'
        ? 'sphere'
        : el.endMonitoringType?.value === 'cuboid' ? 'cuboid' : 'mtcp';
    draft.mtcpToolIds = [...el.endMonitoringDialog.querySelectorAll('[data-end-monitoring-mtcp]:checked')]
        .map((input) => input.dataset.endMonitoringMtcp);
    draft.sphere.centerZ = Number(el.endMonitoringSphereCenterZ?.value);
    draft.sphere.radius = Number(el.endMonitoringSphereRadius?.value);
    draft.cuboid.method = el.endMonitoringCuboidMethod?.value === 'datumOffset'
        ? 'datumOffset'
        : el.endMonitoringCuboidMethod?.value === 'fourPointsHeight' ? 'fourPointsHeight' : 'diagonal';
    el.endMonitoringDialog.querySelectorAll('[data-end-monitoring-point]').forEach((input) => {
        const key = input.dataset.endMonitoringPoint;
        const axis = Number(input.dataset.axis);
        const pointIndex = /^point(\d)$/.exec(key || '');
        if (pointIndex) draft.cuboid.points[Number(pointIndex[1])][axis] = Number(input.value);
        else if (draft.cuboid[key] && Number.isInteger(axis)) draft.cuboid[key][axis] = Number(input.value);
    });
    const height = el.endMonitoringDialog.querySelector('[data-end-monitoring-height]');
    draft.cuboid.height = Number(height?.value);
    return draft;
}

function writeEndMonitoringDraft() {
    const draft = state.endMonitoringEditor.draft;
    if (!draft || !el.endMonitoringDialog) return;
    if (el.endMonitoringDialogTitle) el.endMonitoringDialogTitle.textContent = uiFormat('TCP 감지 범위 {id} 설정', { id: draft.id });
    if (el.endMonitoringRemarks) el.endMonitoringRemarks.value = draft.remarks;
    if (el.endMonitoringType) el.endMonitoringType.value = draft.type;
    if (el.endMonitoringSphereCenterZ) el.endMonitoringSphereCenterZ.value = String(draft.sphere.centerZ);
    if (el.endMonitoringSphereRadius) el.endMonitoringSphereRadius.value = String(draft.sphere.radius);
    if (el.endMonitoringCuboidMethod) el.endMonitoringCuboidMethod.value = draft.cuboid.method;
    el.endMonitoringDialog.querySelectorAll('[data-end-monitoring-mtcp]').forEach((input) => {
        input.checked = draft.mtcpToolIds.includes(input.dataset.endMonitoringMtcp);
    });
    el.endMonitoringDialog.querySelectorAll('[data-end-monitoring-point]').forEach((input) => {
        const key = input.dataset.endMonitoringPoint;
        const axis = Number(input.dataset.axis);
        const pointIndex = /^point(\d)$/.exec(key || '');
        const values = pointIndex ? draft.cuboid.points[Number(pointIndex[1])] : draft.cuboid[key];
        if (values && Number.isInteger(axis)) input.value = String(values[axis]);
    });
    const height = el.endMonitoringDialog.querySelector('[data-end-monitoring-height]');
    if (height) height.value = String(draft.cuboid.height);
    if (el.endMonitoringValidation) {
        el.endMonitoringValidation.textContent = '';
        el.endMonitoringValidation.classList.remove('visible');
    }
    updateEndMonitoringTypeFields();
}

function openEndMonitoringEditor(objectId) {
    if (isMotionActive() || !el.endMonitoringDialog) return;
    const source = state.endMonitoringObjects[objectId];
    if (!source) return;
    state.endMonitoringEditor.objectId = objectId;
    state.endMonitoringEditor.draft = cloneEndMonitoringObjects([source])[0];
    writeEndMonitoringDraft();
    if (!el.endMonitoringDialog.open) el.endMonitoringDialog.showModal();
}

function closeEndMonitoringEditor() {
    state.endMonitoringEditor.objectId = -1;
    state.endMonitoringEditor.draft = null;
    if (el.endMonitoringDialog?.open) el.endMonitoringDialog.close();
}

function validateEndMonitoringDraft() {
    const draft = readEndMonitoringDraft();
    if (!draft) return { valid: false, errors: ['설정값이 없습니다.'] };
    const result = validateEndMonitoringObject(draft);
    const allCoordinates = [
        draft.cuboid.p1, draft.cuboid.p2, draft.cuboid.datum, draft.cuboid.offset,
        ...draft.cuboid.points
    ];
    if (!allCoordinates.every((point) => point.every((value) => Number.isFinite(value)
        && value >= END_MONITORING_COORDINATE_MIN && value <= END_MONITORING_COORDINATE_MAX))) {
        result.errors.push(uiFormat('좌표는 {min}~{max} mm 범위여야 합니다.', {
            min: END_MONITORING_COORDINATE_MIN,
            max: END_MONITORING_COORDINATE_MAX
        }));
    }
    if (!Number.isFinite(draft.sphere.centerZ)
        || draft.sphere.centerZ < END_MONITORING_COORDINATE_MIN
        || draft.sphere.centerZ > END_MONITORING_COORDINATE_MAX) {
        result.errors.push(uiText('Sphere center Z 범위가 올바르지 않습니다.'));
    }
    if (!Number.isFinite(draft.sphere.radius) || draft.sphere.radius < 0 || draft.sphere.radius > END_MONITORING_RADIUS_MAX) {
        result.errors.push(uiFormat('Sphere radius는 0~{max} mm 범위여야 합니다.', { max: END_MONITORING_RADIUS_MAX }));
    }
    if (!Number.isFinite(draft.cuboid.height) || draft.cuboid.height < 0 || draft.cuboid.height > END_MONITORING_HEIGHT_MAX) {
        result.errors.push(uiFormat('Height는 0~{max} mm 범위여야 합니다.', { max: END_MONITORING_HEIGHT_MAX }));
    }
    if (el.endMonitoringValidation) {
        el.endMonitoringValidation.textContent = result.errors.join(' ');
        el.endMonitoringValidation.classList.toggle('visible', result.errors.length > 0);
    }
    return result;
}

function commitEndMonitoringDraft() {
    if (isMotionActive()) return;
    const result = validateEndMonitoringDraft();
    if (!result.valid) return;
    const objectId = state.endMonitoringEditor.objectId;
    const before = captureSceneSnapshot();
    state.endMonitoringObjects[objectId] = normalizeEndMonitoringObjects([result.object])[0];
    resetAllInterferenceZoneRuntime();
    refreshInterferenceZoneMonitoringObjectOptions();
    renderInterferenceZonePanel();
    updateEndMonitoringVisuals();
    closeEndMonitoringEditor();
    recordHistory('TCP 감지 범위 설정', before, captureSceneSnapshot());
    setStatus('TCP 감지 범위 {id} 설정을 저장했습니다.', '#22c55e', { id: objectId });
}

function getActiveRobotToolLocalPoint() {
    const robot = state.activeArticulatedModel;
    const toolFrame = getRobotToolMountFrame(robot);
    const tcpFrame = robot?.userData?.tcpFrame;
    if (!robot || !toolFrame || !tcpFrame) return null;
    robot.updateMatrixWorld(true);
    return toolFrame.worldToLocal(tcpFrame.getWorldPosition(new THREE.Vector3())).toArray();
}

function setEndMonitoringDialogPoint(key) {
    const point = getActiveRobotToolLocalPoint();
    const draft = state.endMonitoringEditor.draft;
    if (!point || !draft) {
        setStatus('현재 TCP를 가진 로봇을 선택하세요.', '#f59e0b');
        return;
    }
    const rounded = point.map((value) => Number(value.toFixed(3)));
    const match = /^point(\d)$/.exec(key || '');
    if (match) draft.cuboid.points[Number(match[1])] = rounded;
    else if (draft.cuboid[key]) draft.cuboid[key] = rounded;
    writeEndMonitoringDraft();
}

function renderInterferenceZoneIo() {
    if (el.interferenceInputList) {
        const inputNodes = [...el.interferenceInputList.querySelectorAll('[data-interference-input]')];
        if (inputNodes.length !== state.simulationIo.inputs.length) {
            el.interferenceInputList.replaceChildren(...state.simulationIo.inputs.map((value, index) => {
                const label = document.createElement('label');
                label.className = 'interference-io-chip';
                label.innerHTML = `<input type="checkbox" data-interference-input="${index}"><span>IN${index}</span>`;
                label.querySelector('input').checked = value === true;
                return label;
            }));
        } else {
            inputNodes.forEach((input) => {
                input.checked = state.simulationIo.inputs[Number(input.dataset.interferenceInput)] === true;
            });
        }
    }
    if (el.interferenceOutputList) {
        const outputNodes = [...el.interferenceOutputList.querySelectorAll('[data-interference-output]')];
        if (outputNodes.length !== state.simulationIo.outputs.length) {
            el.interferenceOutputList.replaceChildren(...state.simulationIo.outputs.map((value, index) => {
                const label = document.createElement('span');
                label.dataset.interferenceOutput = String(index);
                label.dataset.interferenceOutputValue = value ? '1' : '0';
                label.className = `interference-io-chip output ${value ? 'on' : 'off'}`;
                label.innerHTML = `<span>OUT${index}</span><strong>${value ? 'ON' : 'OFF'}</strong>`;
                return label;
            }));
        } else {
            outputNodes.forEach((node) => {
                const index = Number(node.dataset.interferenceOutput);
                const value = state.simulationIo.outputs[index] === true;
                if (node.dataset.interferenceOutputValue === (value ? '1' : '0')) return;
                node.dataset.interferenceOutputValue = value ? '1' : '0';
                node.className = `interference-io-chip output ${value ? 'on' : 'off'}`;
                const label = node.querySelector('strong');
                if (label) label.textContent = value ? 'ON' : 'OFF';
            });
        }
    }
}

function renderInterferenceZonePanel() {
    if (!el.interferenceZoneList) return;
    if (el.interferenceZoneActiveCount) {
        el.interferenceZoneActiveCount.textContent = uiFormat('{count} / {total} 활성', {
            count: state.interferenceZones.filter((zone) => zone.activate).length,
            total: INTERFERENCE_ZONE_COUNT
        });
    }
    el.interferenceZoneList.replaceChildren(...state.interferenceZones.map((zone) => {
        const status = getInterferenceZoneStatus(zone.id);
        const row = document.createElement('div');
        row.className = `interference-zone-row status-${status}`;
        row.dataset.interferenceZoneRow = String(zone.id);
        row.innerHTML = `
            <label class="interference-zone-activate"><input type="checkbox" data-interference-zone-activate ${zone.activate ? 'checked' : ''}><span></span></label>
            <strong class="interference-zone-number">${zone.id}</strong>
            <span class="interference-zone-remarks"></span>
            <span class="interference-zone-state">${interferenceZoneStatusLabel(status)}</span>
            <button type="button" class="interference-zone-read" data-interference-zone-read title="실제 컨트롤러에서 설정 가져오기">가져오기</button>
            <button type="button" class="interference-zone-edit" data-interference-zone-edit>Edit</button>
        `;
        row.querySelector('.interference-zone-remarks').textContent = zone.remarks || '-';
        return row;
    }));
    renderEndMonitoringList();
    renderInterferenceZoneIo();
    updateInterferenceZoneLauncherState();
}

function canReadInterferenceZoneFromController() {
    const controller = state.virtualController;
    return controller.controllerKind === 'real'
        && controller.wanted
        && ['connected', 'streaming'].includes(controller.status)
        && controller.socket?.readyState === WebSocket.OPEN;
}

function readInterferenceZoneFromController(zoneId) {
    const controller = state.virtualController;
    if (!Number.isInteger(zoneId) || zoneId < 0 || zoneId >= INTERFERENCE_ZONE_COUNT) return;
    if (!canReadInterferenceZoneFromController()) {
        setStatus('실제 컨트롤러에 연결한 후 간섭영역 설정을 가져올 수 있습니다.', '#f59e0b');
        return;
    }
    if (controller.pendingInterferenceReads.has(zoneId)) return;
    controller.pendingInterferenceReads.add(zoneId);
    refreshVirtualControllerUi();
    if (sendVirtualControllerCommand({ type: 'readInterferenceZone', zoneNumber: zoneId })) return;
    controller.pendingInterferenceReads.delete(zoneId);
    refreshVirtualControllerUi();
    setStatus('간섭영역 설정 요청을 전송하지 못했습니다.', '#ef4444');
}

function applyInterferenceZoneControllerResult(result) {
    const controller = state.virtualController;
    const zoneId = Number(result?.zoneNumber);
    if (Number.isInteger(zoneId)) controller.pendingInterferenceReads.delete(zoneId);
    refreshVirtualControllerUi();
    if (!result?.success) {
        setStatus(result?.message || '간섭영역 설정을 가져오지 못했습니다.', '#f59e0b');
        return;
    }
    if (!Number.isInteger(zoneId) || zoneId < 0 || zoneId >= INTERFERENCE_ZONE_COUNT || !result.zone) {
        setStatus('컨트롤러 간섭영역 응답 형식이 올바르지 않습니다.', '#ef4444');
        return;
    }

    const source = result.zone;
    const current = state.interferenceZones[zoneId];
    if (!current) return;
    const before = captureSceneSnapshot();
    const diagonal = Array.isArray(source.diagonal) ? source.diagonal.map(Number) : [];
    const pointL = Array.isArray(source.pointL) ? source.pointL.map(Number) : [];
    const geometry = { ...current.geometry };
    if (Number(source.setType) === 1) {
        geometry.method = 'datumOffset';
        if (pointL.length >= 6) {
            geometry.datum = pointL.slice(0, 3);
            geometry.offset = pointL.slice(3, 6);
        }
    } else {
        geometry.method = 'diagonal';
        if (diagonal.length >= 6) {
            geometry.p1 = diagonal.slice(0, 3);
            geometry.p2 = diagonal.slice(3, 6);
        }
    }
    state.interferenceZones[zoneId] = normalizeInterferenceZones([{
        ...current,
        inSignal: Number(source.input),
        outSignal: Number(source.output),
        insideOutside: Number(source.scope) === 0 ? 'inside' : 'outside',
        triggerAlarmAndStop: Number(source.isAlert) !== 0,
        safetyDistance: Number(source.safeL),
        geometry
    }])[0];
    resetInterferenceZoneRuntime(zoneId);
    updateInterferenceZoneVisuals();
    renderInterferenceZonePanel();
    recordHistory('컨트롤러 간섭영역 설정 가져오기', before, captureSceneSnapshot());
    setStatus('간섭영역 {id} 설정을 컨트롤러에서 가져왔습니다.', '#22c55e', { id: zoneId });
}

function readInterferenceToolFromController(toolId) {
    const controller = state.virtualController;
    if (!Number.isInteger(toolId) || toolId < 0 || toolId >= END_MONITORING_OBJECT_COUNT) return;
    if (!canReadInterferenceZoneFromController()) {
        setStatus('실제 컨트롤러에 연결된 경우에만 TCP 감지 범위 설정을 가져올 수 있습니다.', '#f59e0b');
        return;
    }
    if (controller.pendingInterferenceToolReads.has(toolId)) return;
    controller.pendingInterferenceToolReads.add(toolId);
    refreshVirtualControllerUi();
    if (sendVirtualControllerCommand({ type: 'readInterferenceTool', toolNumber: toolId })) return;
    controller.pendingInterferenceToolReads.delete(toolId);
    refreshVirtualControllerUi();
    setStatus('TCP 감지 범위 설정 요청을 전송하지 못했습니다.', '#ef4444');
}

function getInterferenceToolObjectType(typeValue) {
    // The controller's Tool type follows the native Tool enum ordering:
    // 0 = MTCP, 1 = sphere, 2 = square/cuboid.
    const type = Number(typeValue);
    if (type === 0) return 'mtcp';
    if (type === 1) return 'sphere';
    if (type === 2) return 'cuboid';
    return null;
}

function applyInterferenceToolControllerResult(result) {
    const controller = state.virtualController;
    const toolId = Number(result?.toolNumber);
    if (Number.isInteger(toolId)) controller.pendingInterferenceToolReads.delete(toolId);
    refreshVirtualControllerUi();
    if (!result?.success) {
        setStatus(result?.message || 'TCP 감지 범위 설정을 가져오지 못했습니다.', '#f59e0b');
        return;
    }
    if (!Number.isInteger(toolId) || toolId < 0 || toolId >= END_MONITORING_OBJECT_COUNT || !result.tool) {
        setStatus('컨트롤러 TCP 감지 범위 응답 형식이 올바르지 않습니다.', '#ef4444');
        return;
    }

    const source = result.tool;
    const objectType = getInterferenceToolObjectType(source.type);
    const current = state.endMonitoringObjects[toolId];
    if (!objectType || !current) {
        setStatus(`지원하지 않는 컨트롤러 Tool 형식입니다 (type=${source.type}).`, '#ef4444');
        return;
    }

    const before = captureSceneSnapshot();
    const diagonal = Array.isArray(source.diagonal) ? source.diagonal.map(Number) : [];
    const pointL = Array.isArray(source.pointL) ? source.pointL.map(Number) : [];
    const pointH = Array.isArray(source.pointH) ? source.pointH.map(Number) : [];
    const isUse = Array.isArray(source.isUse) ? source.isUse.map(Number) : [];
    const cuboid = { ...current.cuboid };
    const squareSetType = Number(source.setType);
    if (squareSetType === 1) {
        cuboid.method = 'datumOffset';
        if (pointL.length >= 6) {
            cuboid.datum = pointL.slice(0, 3);
            cuboid.offset = pointL.slice(3, 6);
        }
    } else if (squareSetType === 2) {
        cuboid.method = 'fourPointsHeight';
        if (pointH.length >= 13) {
            cuboid.points = Array.from({ length: 4 }, (_, index) => pointH.slice(index * 3, index * 3 + 3));
            cuboid.height = pointH[12];
        }
    } else {
        cuboid.method = 'diagonal';
        if (diagonal.length >= 6) {
            cuboid.p1 = diagonal.slice(0, 3);
            cuboid.p2 = diagonal.slice(3, 6);
        }
    }

    state.endMonitoringObjects[toolId] = normalizeEndMonitoringObjects([{
        ...current,
        type: objectType,
        mtcpToolIds: END_MONITORING_MTPC_TOOL_IDS.filter((_, index) => Number(isUse[index]) !== 0),
        sphere: {
            ...current.sphere,
            centerZ: Number(source.zPos),
            radius: Number(source.ballR)
        },
        cuboid
    }])[0];
    resetAllInterferenceZoneRuntime();
    refreshInterferenceZoneMonitoringObjectOptions();
    renderInterferenceZonePanel();
    updateEndMonitoringVisuals();
    recordHistory('컨트롤러 TCP 감지 범위 설정 가져오기', before, captureSceneSnapshot());
    setStatus('TCP 감지 범위 {id} 설정을 컨트롤러에서 가져왔습니다.', '#22c55e', { id: toolId });
}

function updateInterferenceZoneStatusUi() {
    if (!el.interferenceZoneList) return;
    state.interferenceZones.forEach((zone) => {
        const row = el.interferenceZoneList.querySelector(`[data-interference-zone-row="${zone.id}"]`);
        if (!row) return;
        const status = getInterferenceZoneStatus(zone.id);
        row.className = `interference-zone-row status-${status}`;
        const stateLabel = row.querySelector('.interference-zone-state');
        if (stateLabel) stateLabel.textContent = interferenceZoneStatusLabel(status);
    });
    if (el.interferenceZoneActiveCount) {
        el.interferenceZoneActiveCount.textContent = uiFormat('{count} / {total} 활성', {
            count: state.interferenceZones.filter((zone) => zone.activate).length,
            total: INTERFERENCE_ZONE_COUNT
        });
    }
    updateInterferenceZoneLauncherState();
}

function updateInterferenceZoneLauncherState() {
    const button = el.panelLauncher?.querySelector('[data-panel-toggle="interference-zone-panel"]');
    if (!button) return;
    const hasActivatedZone = state.interferenceZones.some((zone) => zone.activate);
    const hasInterference = state.interferenceZones.some((zone) => {
        if (!zone.activate) return false;
        const runtime = getInterferenceZoneRuntime(zone.id);
        return runtime?.status === 'danger' || runtime?.alarmLatched === true;
    });
    button.classList.toggle('interference-zone-launcher-active', hasActivatedZone && !hasInterference);
    button.classList.toggle('interference-zone-launcher-alert', hasInterference);
    button.dataset.interferenceZoneState = hasInterference
        ? 'alert'
        : hasActivatedZone
            ? 'active'
            : 'inactive';
}

function readInterferenceZoneDialogDraft() {
    const draft = state.interferenceEditor.draft;
    if (!draft) return null;
    draft.remarks = el.interferenceZoneRemarks?.value || '';
    draft.targetRobotId = el.interferenceZoneTargetRobot?.value || 'all';
    draft.monitoringObjectId = el.interferenceZoneMonitoringObject?.value === 'currentTcp'
        ? 'currentTcp'
        : Number(el.interferenceZoneMonitoringObject?.value);
    draft.insideOutside = el.interferenceZoneInsideOutside?.value === 'outside' ? 'outside' : 'inside';
    draft.triggerAlarmAndStop = el.interferenceZoneTrigger?.value !== 'no';
    draft.safetyDistance = Number(el.interferenceZoneSafety?.value);
    draft.inSignal = el.interferenceZoneInEnabled?.checked ? Number(el.interferenceZoneInSignal?.value) : -1;
    draft.outSignal = el.interferenceZoneOutEnabled?.checked ? Number(el.interferenceZoneOutSignal?.value) : -1;
    draft.geometry.method = el.interferenceZoneMethod?.value === 'datumOffset' ? 'datumOffset' : 'diagonal';
    el.interferenceZoneDialog?.querySelectorAll('[data-interference-point]').forEach((input) => {
        const key = input.dataset.interferencePoint;
        const axis = Number(input.dataset.axis);
        if (draft.geometry[key] && Number.isInteger(axis)) draft.geometry[key][axis] = Number(input.value);
    });
    return draft;
}

function writeInterferenceZoneDialogDraft() {
    const draft = state.interferenceEditor.draft;
    if (!draft) return;
    if (el.interferenceZoneDialogTitle) {
        el.interferenceZoneDialogTitle.textContent = uiFormat('간섭영역 {id} 설정', { id: draft.id });
    }
    if (el.interferenceZoneRemarks) el.interferenceZoneRemarks.value = draft.remarks;
    refreshInterferenceZoneDialogRobotOptions();
    if (el.interferenceZoneTargetRobot) el.interferenceZoneTargetRobot.value = draft.targetRobotId;
    if (el.interferenceZoneMonitoringObject) {
        el.interferenceZoneMonitoringObject.value = draft.monitoringObjectId === 'currentTcp'
            ? 'currentTcp'
            : String(draft.monitoringObjectId);
    }
    if (el.interferenceZoneInsideOutside) el.interferenceZoneInsideOutside.value = draft.insideOutside;
    if (el.interferenceZoneTrigger) el.interferenceZoneTrigger.value = draft.triggerAlarmAndStop ? 'yes' : 'no';
    if (el.interferenceZoneSafety) el.interferenceZoneSafety.value = String(draft.safetyDistance);
    if (el.interferenceZoneInEnabled) el.interferenceZoneInEnabled.checked = draft.inSignal >= 0;
    if (el.interferenceZoneInSignal) el.interferenceZoneInSignal.value = String(Math.max(0, draft.inSignal));
    if (el.interferenceZoneOutEnabled) el.interferenceZoneOutEnabled.checked = draft.outSignal >= 0;
    if (el.interferenceZoneOutSignal) el.interferenceZoneOutSignal.value = String(Math.max(0, draft.outSignal));
    if (el.interferenceZoneMethod) el.interferenceZoneMethod.value = draft.geometry.method;
    el.interferenceZoneDialog?.querySelectorAll('[data-interference-point]').forEach((input) => {
        const values = draft.geometry[input.dataset.interferencePoint];
        const axis = Number(input.dataset.axis);
        if (values && Number.isInteger(axis)) input.value = String(values[axis]);
    });
    updateInterferenceZoneGeometryFields();
}

function updateInterferenceZoneGeometryFields() {
    const datum = el.interferenceZoneMethod?.value === 'datumOffset';
    el.interferenceZoneDiagonalFields?.classList.toggle('hidden', datum);
    el.interferenceZoneDatumFields?.classList.toggle('hidden', !datum);
}

function setInterferenceZoneDialogStep(step) {
    state.interferenceEditor.step = step === 'geometry' ? 'geometry' : 'basic';
    el.interferenceZoneDialog?.querySelectorAll('[data-interference-step]').forEach((section) => {
        section.classList.toggle('hidden', section.dataset.interferenceStep !== state.interferenceEditor.step);
    });
    el.interferenceZoneDialog?.querySelectorAll('[data-interference-step-indicator]').forEach((indicator) => {
        indicator.classList.toggle('active', indicator.dataset.interferenceStepIndicator === state.interferenceEditor.step);
    });
    el.interferenceZonePrevious?.classList.toggle('hidden', state.interferenceEditor.step !== 'geometry');
    el.interferenceZoneNext?.classList.toggle('hidden', state.interferenceEditor.step !== 'basic');
    el.interferenceZoneDone?.classList.toggle('hidden', state.interferenceEditor.step !== 'geometry');
}

function openInterferenceZoneEditor(zoneId) {
    if (isMotionActive()) return;
    const zone = state.interferenceZones[zoneId];
    if (!zone) return;
    state.interferenceEditor.zoneId = zoneId;
    state.interferenceEditor.draft = cloneInterferenceZones([zone])[0];
    writeInterferenceZoneDialogDraft();
    setInterferenceZoneDialogStep('basic');
    // This editor must stay non-modal: the user needs to operate JOG/VC and
    // move the robot while collecting P1/P2 or datum coordinates.
    if (el.interferenceZoneDialog?.show) {
        el.interferenceZoneDialog.show();
        bringPanelToFront('interference-zone-dialog');
    }
}

function closeInterferenceZoneEditor() {
    state.interferenceEditor.zoneId = -1;
    state.interferenceEditor.draft = null;
    if (el.interferenceZoneDialog?.open) el.interferenceZoneDialog.close();
    updatePanelStack();
}

function getActiveRobotWorldTcpPoint() {
    const robot = state.activeArticulatedModel;
    const tcpFrame = robot?.userData?.tcpFrame;
    if (!robot || !tcpFrame) return null;
    robot.updateMatrixWorld(true);
    return tcpFrame.getWorldPosition(new THREE.Vector3()).toArray();
}

function setInterferenceDialogPoint(pointKey) {
    const point = getActiveRobotWorldTcpPoint();
    if (!point || !state.interferenceEditor.draft) {
        setStatus('현재 TCP를 읽을 로봇을 선택하세요.', '#f59e0b');
        return;
    }
    state.interferenceEditor.draft.geometry[pointKey] = point.map((value) => Number(value.toFixed(3)));
    writeInterferenceZoneDialogDraft();
}

function validateInterferenceZoneDraft() {
    const draft = readInterferenceZoneDialogDraft();
    if (!draft) return { valid: false, errors: [uiText('설정값이 없습니다.')] };
    const result = validateInterferenceZone(draft);
    const geometryKeys = draft.geometry.method === 'datumOffset' ? ['datum', 'offset'] : ['p1', 'p2'];
    const geometryInputsValid = geometryKeys.every((key) => (
        draft.geometry[key].every((value) => Number.isFinite(value)
            && value >= INTERFERENCE_COORDINATE_MIN
            && value <= INTERFERENCE_COORDINATE_MAX)
    ));
    if (!geometryInputsValid) {
        result.errors.push(uiFormat('좌표는 {min}~{max} mm 범위의 숫자여야 합니다.', {
            min: INTERFERENCE_COORDINATE_MIN,
            max: INTERFERENCE_COORDINATE_MAX
        }));
    }
    const signalsValid = [draft.inSignal, draft.outSignal].every((value) => Number.isInteger(value) && value >= -1 && value <= 255);
    if (!signalsValid) result.errors.push(uiText('I/O 신호 번호는 -1 또는 0~255여야 합니다.'));
    if (!Number.isFinite(draft.safetyDistance) || draft.safetyDistance < 0 || draft.safetyDistance > INTERFERENCE_SAFETY_DISTANCE_MAX) {
        result.errors.push(uiFormat('Safety distance는 0~{max} mm여야 합니다.', { max: INTERFERENCE_SAFETY_DISTANCE_MAX }));
    }
    if (el.interferenceZoneValidation) {
        el.interferenceZoneValidation.textContent = result.errors.join(' ');
        el.interferenceZoneValidation.classList.toggle('visible', result.errors.length > 0);
    }
    return result;
}

function commitInterferenceZoneDraft() {
    if (isMotionActive()) return;
    const result = validateInterferenceZoneDraft();
    if (!result.valid) return;
    const zoneId = state.interferenceEditor.zoneId;
    const before = captureSceneSnapshot();
    state.interferenceZones[zoneId] = normalizeInterferenceZones([result.zone])[0];
    resetInterferenceZoneRuntime(zoneId);
    updateInterferenceZoneVisuals();
    renderInterferenceZonePanel();
    scheduleMotionProjectSave();
    closeInterferenceZoneEditor();
    recordHistory('간섭영역 설정', before, captureSceneSnapshot());
    setStatus('간섭영역 {id} 설정을 저장했습니다.', '#22c55e', { id: zoneId });
}

function setInterferenceZoneActivate(zoneId, activate) {
    if (isMotionActive()) return;
    const zone = state.interferenceZones[zoneId];
    if (!zone) return;
    const before = captureSceneSnapshot();
    zone.activate = Boolean(activate);
    resetInterferenceZoneRuntime(zoneId);
    updateInterferenceZoneVisuals();
    renderInterferenceZonePanel();
    recordHistory('간섭영역 활성화 변경', before, captureSceneSnapshot());
    scheduleMotionProjectSave();
}

function clearInterferenceRobotStopLatch(robot, zoneId) {
    if (!robot?.userData) return;
    const stopZones = robot.userData.interferenceStopZones;
    if (stopZones instanceof Set) {
        stopZones.delete(zoneId);
        if (stopZones.size > 0) return;
        delete robot.userData.interferenceStopZones;
    }
    delete robot.userData.interferenceStopLatched;
}

function resetInterferenceZoneRuntime(zoneId) {
    const runtime = state.interferenceRuntime[zoneId];
    if (!runtime) return;
    runtime.status = 'inactive';
    runtime.alarmLatched = false;
    runtime.lastViolationByRobot.clear();
    runtime.lastProbeByRobot.clear();
    runtime.lastMessage = '';
    getArticulatedRobots().forEach((robot) => clearInterferenceRobotStopLatch(robot, zoneId));
}

function resetAllInterferenceZoneRuntime() {
    state.interferenceRuntime.forEach((runtime, index) => {
        if (runtime) resetInterferenceZoneRuntime(index);
    });
}

function getRobotWorldTcpPoint(robot) {
    const tcpFrame = robot?.userData?.tcpFrame;
    if (!tcpFrame) return null;
    robot.updateMatrixWorld(true);
    return tcpFrame.getWorldPosition(new THREE.Vector3()).toArray();
}

function getRobotToolWorldTransform(robot) {
    const toolFrame = getRobotToolMountFrame(robot);
    if (!toolFrame) return null;
    robot.updateMatrixWorld(true);
    return {
        position: toolFrame.getWorldPosition(new THREE.Vector3()),
        quaternion: toolFrame.getWorldQuaternion(new THREE.Quaternion())
    };
}

function createPointProbe(point) {
    return { kind: 'point', center: point.clone(), radius: 0 };
}

function getMtcpProfileWorldPoint(robot, toolTransform, profileIndex) {
    const profiles = ensureRobotTcpProfiles(robot);
    const profile = profileIndex === robot.userData.activeTcpProfileIndex && robot.userData.tcpLiveProfile
        ? robot.userData.tcpLiveProfile
        : profiles[profileIndex];
    if (!profile) return null;
    return profile.position.clone().applyQuaternion(toolTransform.quaternion).add(toolTransform.position);
}

function getInterferenceZoneProbes(zone, robot) {
    const currentTcp = getRobotWorldTcpPoint(robot);
    if (!currentTcp) return [];
    const objectId = zone?.monitoringObjectId;
    if (objectId === 'currentTcp' || !Number.isInteger(objectId)) {
        return [createPointProbe(new THREE.Vector3().fromArray(currentTcp))];
    }
    const monitoring = state.endMonitoringObjects[objectId];
    const toolTransform = getRobotToolWorldTransform(robot);
    if (!monitoring || !toolTransform) return [createPointProbe(new THREE.Vector3().fromArray(currentTcp))];
    if (monitoring.type === 'mtcp') {
        return monitoring.mtcpToolIds.map((toolId) => {
            if (toolId === 'tool0') return createPointProbe(toolTransform.position);
            const profileIndex = Number(toolId.slice(3));
            const point = Number.isInteger(profileIndex)
                ? getMtcpProfileWorldPoint(robot, toolTransform, profileIndex)
                : null;
            return point ? createPointProbe(point) : null;
        }).filter(Boolean);
    }
    if (monitoring.type === 'sphere') {
        const center = new THREE.Vector3(0, 0, monitoring.sphere.centerZ)
            .applyQuaternion(toolTransform.quaternion)
            .add(toolTransform.position);
        return [{ kind: 'sphere', center, radius: monitoring.sphere.radius }];
    }
    const cuboid = getEndMonitoringCuboidTransform(monitoring);
    const center = new THREE.Vector3().fromArray(cuboid.center)
        .applyQuaternion(toolTransform.quaternion).add(toolTransform.position);
    const halfSizes = cuboid.halfSizes;
    return [{
        kind: 'box',
        center,
        halfSizes,
        axes: cuboid.axes.map((axis) => new THREE.Vector3().fromArray(axis).applyQuaternion(toolTransform.quaternion)),
        radius: Math.hypot(...halfSizes)
    }];
}

function sphereIntersectsBounds(center, radius, bounds) {
    const distanceSquared = bounds.min.reduce((sum, minimum, index) => {
        const value = center.getComponent(index);
        const maximum = bounds.max[index];
        const delta = value < minimum ? minimum - value : value > maximum ? value - maximum : 0;
        return sum + delta * delta;
    }, 0);
    return distanceSquared <= radius * radius + 1e-9;
}

function obbIntersectsBounds(probe, bounds) {
    const aHalf = bounds.max.map((value, index) => (value - bounds.min[index]) / 2);
    if (aHalf.some((value) => value < 0)) return false;
    const aCenter = bounds.min.map((value, index) => (value + bounds.max[index]) / 2);
    const t = probe.center.toArray().map((value, index) => value - aCenter[index]);
    const rotation = Array.from({ length: 3 }, (_, row) => probe.axes.map((axis) => axis.getComponent(row)));
    const absRotation = rotation.map((row) => row.map((value) => Math.abs(value) + 1e-9));

    for (let axis = 0; axis < 3; axis += 1) {
        const radiusB = probe.halfSizes.reduce((sum, value, index) => sum + value * absRotation[axis][index], 0);
        if (Math.abs(t[axis]) > aHalf[axis] + radiusB) return false;
    }
    for (let axis = 0; axis < 3; axis += 1) {
        const radiusA = aHalf.reduce((sum, value, index) => sum + value * absRotation[index][axis], 0);
        const projection = t.reduce((sum, value, index) => sum + value * rotation[index][axis], 0);
        if (Math.abs(projection) > radiusA + probe.halfSizes[axis]) return false;
    }
    for (let axisA = 0; axisA < 3; axisA += 1) {
        const nextA = (axisA + 1) % 3;
        const lastA = (axisA + 2) % 3;
        for (let axisB = 0; axisB < 3; axisB += 1) {
            const nextB = (axisB + 1) % 3;
            const lastB = (axisB + 2) % 3;
            const radiusA = aHalf[nextA] * absRotation[lastA][axisB]
                + aHalf[lastA] * absRotation[nextA][axisB];
            const radiusB = probe.halfSizes[nextB] * absRotation[axisA][lastB]
                + probe.halfSizes[lastB] * absRotation[axisA][nextB];
            const projection = Math.abs(t[lastA] * rotation[nextA][axisB]
                - t[nextA] * rotation[lastA][axisB]);
            if (projection > radiusA + radiusB) return false;
        }
    }
    return true;
}

function boxContainedInBounds(probe, bounds) {
    for (const sx of [-1, 1]) {
        for (const sy of [-1, 1]) {
            for (const sz of [-1, 1]) {
                const corner = probe.center.clone()
                    .addScaledVector(probe.axes[0], probe.halfSizes[0] * sx)
                    .addScaledVector(probe.axes[1], probe.halfSizes[1] * sy)
                    .addScaledVector(probe.axes[2], probe.halfSizes[2] * sz);
                if (!pointInsideBounds(corner.toArray(), bounds)) return false;
            }
        }
    }
    return true;
}

function probeIntersectsBounds(probe, bounds) {
    if (probe.kind === 'sphere') return sphereIntersectsBounds(probe.center, probe.radius, bounds);
    if (probe.kind === 'box') return obbIntersectsBounds(probe, bounds);
    return pointInsideBounds(probe.center.toArray(), bounds);
}

function probeInsideBounds(probe, bounds) {
    if (probe.kind === 'sphere') {
        return bounds.min.every((minimum, index) => probe.center.getComponent(index) - probe.radius >= minimum - 1e-9
            && probe.center.getComponent(index) + probe.radius <= bounds.max[index] + 1e-9);
    }
    if (probe.kind === 'box') return boxContainedInBounds(probe, bounds);
    return pointInsideBounds(probe.center.toArray(), bounds);
}

function probeInInterferenceRegion(probe, zone) {
    const bounds = getInterferenceZoneBounds(zone, true);
    if (bounds.min.some((value, index) => value > bounds.max[index])) return zone.insideOutside === 'outside';
    return zone.insideOutside === 'outside'
        ? !probeInsideBounds(probe, bounds)
        : probeIntersectsBounds(probe, bounds);
}

function serializeInterferenceProbe(probe) {
    return { kind: probe.kind, center: probe.center.toArray(), radius: Number(probe.radius) || 0 };
}

function pointDistanceSquaredToBounds(point, bounds) {
    return bounds.min.reduce((sum, minimum, index) => {
        const maximum = bounds.max[index];
        const value = point[index];
        const delta = value < minimum ? minimum - value : value > maximum ? value - maximum : 0;
        return sum + delta * delta;
    }, 0);
}

function segmentDistanceSquaredToBounds(start, end, bounds) {
    const delta = end.map((value, index) => value - start[index]);
    const distanceAt = (t) => pointDistanceSquaredToBounds(
        start.map((value, index) => value + delta[index] * t),
        bounds
    );
    let low = 0;
    let high = 1;
    // The squared distance between a segment and a convex AABB is convex.
    // Ternary minimisation avoids replacing a sphere with a square during a sweep.
    for (let index = 0; index < 48; index += 1) {
        const left = (low * 2 + high) / 3;
        const right = (low + high * 2) / 3;
        if (distanceAt(left) <= distanceAt(right)) high = right;
        else low = left;
    }
    return Math.min(distanceAt(0), distanceAt(1), distanceAt((low + high) / 2));
}

function sweptProbeInInterferenceRegion(previous, current, zone) {
    if (!previous || !current) return false;
    if (current.kind === 'sphere' && previous.kind === 'sphere') {
        // Outside mode is a containment requirement. If both endpoints are
        // contained, the straight centre path is contained as well because an
        // AABB is convex; endpoint evaluation already handles violations.
        if (zone.insideOutside === 'outside') return false;
        const bounds = getInterferenceZoneBounds(zone, true);
        if (bounds.min.some((value, index) => value > bounds.max[index])) return false;
        const radius = Math.max(Number(previous.radius) || 0, Number(current.radius) || 0);
        return segmentDistanceSquaredToBounds(previous.center, current.center.toArray(), bounds)
            <= radius * radius + 1e-9;
    }
    const sweepZone = {
        ...zone,
        safetyDistance: Math.min(INTERFERENCE_SAFETY_DISTANCE_MAX,
            Number(zone.safetyDistance || 0) + Math.max(Number(previous.radius) || 0, Number(current.radius) || 0))
    };
    return segmentIntersectsInterferenceRegion(previous.center, current.center.toArray(), sweepZone);
}

function recomputeInterferenceOutputs() {
    const nextOutputs = Array.from({ length: state.simulationIo.outputs.length }, () => true);
    state.interferenceZones.forEach((zone) => {
        if (zone.outSignal < 0 || zone.outSignal >= nextOutputs.length || !isInterferenceZoneEnabled(zone)) return;
        const hasViolation = getInterferenceZoneTargets(zone).some((robot) => (
            getInterferenceZoneProbes(zone, robot).some((probe) => probeInInterferenceRegion(probe, zone))
        ));
        if (hasViolation) nextOutputs[zone.outSignal] = false;
    });
    state.simulationIo.outputs = nextOutputs;
    renderInterferenceZoneIo();
}

function triggerInterferenceZoneAlarm(zone, robot) {
    const runtime = getInterferenceZoneRuntime(zone.id);
    if (!runtime || runtime.alarmLatched) return;
    runtime.alarmLatched = true;
    runtime.status = 'stopped';
    runtime.lastMessage = `${zone.id}:${robot.userData.motionInstanceId}`;
    if (!(robot.userData.interferenceStopZones instanceof Set)) {
        robot.userData.interferenceStopZones = new Set();
    }
    robot.userData.interferenceStopZones.add(zone.id);
    robot.userData.interferenceStopLatched = true;
    stopRobotMotions([robot]);
    const robotLabel = getInterferenceZoneRobotLabel(robot.userData.motionInstanceId);
    setMotionProgramStatus('간섭영역 {id} 진입으로 {robot}를 정지했습니다.', 'error', {
        id: zone.id,
        robot: robotLabel
    });
    setStatus('간섭영역 {id} 알람: {robot}', '#ef4444', { id: zone.id, robot: robotLabel });
}

function evaluateInterferenceZones() {
    state.interferenceZones.forEach((zone) => {
        const runtime = getInterferenceZoneRuntime(zone.id);
        if (!runtime) return;
        if (!isInterferenceZoneEnabled(zone)) {
            runtime.status = 'inactive';
            runtime.lastViolationByRobot.clear();
            runtime.lastProbeByRobot.clear();
            getArticulatedRobots().forEach((robot) => clearInterferenceRobotStopLatch(robot, zone.id));
            runtime.alarmLatched = false;
            runtime.lastMessage = '';
            return;
        }
        let anyViolation = false;
        getInterferenceZoneTargets(zone).forEach((robot) => {
            const robotId = robot.userData.motionInstanceId;
            const probes = getInterferenceZoneProbes(zone, robot);
            if (!probes.length) return;
            const previous = runtime.lastProbeByRobot.get(robotId) || [];
            const currentViolation = probes.some((probe) => probeInInterferenceRegion(probe, zone));
            const sweptViolation = probes.some((probe, index) => sweptProbeInInterferenceRegion(previous[index], probe, zone));
            const violation = Boolean(currentViolation || sweptViolation);
            const wasViolation = runtime.lastViolationByRobot.get(robotId) === true;
            runtime.lastProbeByRobot.set(robotId, probes.map(serializeInterferenceProbe));
            runtime.lastViolationByRobot.set(robotId, violation);
            if (!violation) {
                // Leaving the monitored condition automatically clears this
                // zone's stop latch. Other zones remain latched independently.
                clearInterferenceRobotStopLatch(robot, zone.id);
                return;
            }
            anyViolation = true;
            if (zone.triggerAlarmAndStop && !wasViolation) triggerInterferenceZoneAlarm(zone, robot);
        });
        if (!anyViolation && runtime.alarmLatched) {
            runtime.alarmLatched = false;
            runtime.lastMessage = '';
        }
        runtime.status = runtime.alarmLatched ? 'stopped' : anyViolation ? 'danger' : 'active';
    });
    recomputeInterferenceOutputs();
    updateInterferenceZoneStatusUi();
    updateInterferenceZoneVisualState();
}

function updateInterferenceZoneVisualState() {
    state.interferenceVisuals.forEach(({ zoneId, fill, outline, safetyOutline }) => {
        const status = getInterferenceZoneStatus(zoneId);
        const color = status === 'stopped' || status === 'danger' ? 0xef4444 : status === 'active' ? 0x2563eb : 0x64748b;
        fill.material.color.setHex(color);
        outline.material.color.setHex(color);
        if (safetyOutline) safetyOutline.material.color.setHex(color);
        fill.material.opacity = status === 'inactive' ? 0.04 : status === 'danger' || status === 'stopped' ? 0.18 : 0.08;
    });
    updateEndMonitoringVisualState();
}

function disposeEndMonitoringVisuals() {
    state.endMonitoringVisuals.forEach(({ group }) => {
        group.traverse((item) => {
            item.geometry?.dispose?.();
            const materials = Array.isArray(item.material) ? item.material : [item.material];
            materials.forEach((material) => material?.dispose?.());
        });
        group.removeFromParent();
    });
    state.endMonitoringVisuals = [];
}

function createEndMonitoringWireframe(geometry) {
    const fill = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({
        color: 0x14b8a6, transparent: true, opacity: 0.12, depthWrite: false
    }));
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geometry), new THREE.LineBasicMaterial({
        color: 0x14b8a6, transparent: true, opacity: 0.9, depthTest: false
    }));
    edges.renderOrder = 31;
    return { fill, edges };
}

function createSphereSilhouette(radius) {
    const points = Array.from({ length: 128 }, (_, index) => {
        const angle = (Math.PI * 2 * index) / 128;
        return new THREE.Vector3(Math.cos(angle) * radius, Math.sin(angle) * radius, 0);
    });
    const outline = new THREE.LineLoop(
        new THREE.BufferGeometry().setFromPoints(points),
        new THREE.LineBasicMaterial({ color: 0x5eead4, transparent: true, opacity: 1, depthTest: false })
    );
    outline.renderOrder = 32;
    return outline;
}

function updateEndMonitoringVisuals() {
    disposeEndMonitoringVisuals();
    const visualGroups = new Map();
    state.interferenceZones.forEach((zone) => {
        if (!zone.activate || !Number.isInteger(zone.monitoringObjectId)) return;
        const monitoring = state.endMonitoringObjects[zone.monitoringObjectId];
        if (!monitoring) return;
        getInterferenceZoneTargets(zone).forEach((robot) => {
            const toolFrame = getRobotToolMountFrame(robot);
            if (!toolFrame) return;
            const key = `${zone.monitoringObjectId}:${robot.userData.motionInstanceId}`;
            if (visualGroups.has(key)) {
                visualGroups.get(key).zoneIds.add(zone.id);
                return;
            }
            const group = new THREE.Group();
            group.name = `End monitoring ${monitoring.id}`;
            group.renderOrder = 31;
            const materials = [];
            const cameraFacingOutlines = [];
            if (monitoring.type === 'sphere') {
                const sphere = new THREE.Mesh(
                    new THREE.SphereGeometry(Math.max(0.001, monitoring.sphere.radius), 64, 48),
                    new THREE.MeshPhongMaterial({
                        color: 0x14b8a6,
                        emissive: 0x0f766e,
                        emissiveIntensity: 0.22,
                        transparent: true,
                        opacity: 0.24,
                        shininess: 72,
                        side: THREE.DoubleSide,
                        depthWrite: false,
                        depthTest: false
                    })
                );
                sphere.position.z = monitoring.sphere.centerZ;
                sphere.renderOrder = 31;
                const silhouette = createSphereSilhouette(Math.max(0.001, monitoring.sphere.radius) * 1.002);
                silhouette.position.z = monitoring.sphere.centerZ;
                group.add(sphere, silhouette);
                materials.push(sphere.material, silhouette.material);
                cameraFacingOutlines.push(silhouette);
            } else if (monitoring.type === 'cuboid') {
                const cuboid = getEndMonitoringCuboidTransform(monitoring);
                const size = cuboid.halfSizes.map((value) => value * 2);
                if (size.every((value) => value > 0)) {
                    const visual = createEndMonitoringWireframe(new THREE.BoxGeometry(size[0], size[1], size[2]));
                    const center = new THREE.Vector3().fromArray(cuboid.center);
                    const rotation = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(
                        new THREE.Vector3().fromArray(cuboid.axes[0]),
                        new THREE.Vector3().fromArray(cuboid.axes[1]),
                        new THREE.Vector3().fromArray(cuboid.axes[2])
                    ));
                    visual.fill.position.copy(center);
                    visual.edges.position.copy(center);
                    visual.fill.quaternion.copy(rotation);
                    visual.edges.quaternion.copy(rotation);
                    group.add(visual.fill, visual.edges);
                    materials.push(visual.fill.material, visual.edges.material);
                }
            } else {
                const profiles = ensureRobotTcpProfiles(robot);
                monitoring.mtcpToolIds.forEach((toolId) => {
                    const marker = new THREE.Mesh(new THREE.SphereGeometry(10, 12, 8), new THREE.MeshBasicMaterial({
                        color: 0x14b8a6, transparent: true, opacity: 0.78, depthTest: false
                    }));
                    if (toolId !== 'tool0') {
                        const index = Number(toolId.slice(3));
                        if (profiles[index]) marker.position.copy(profiles[index].position);
                    }
                    marker.renderOrder = 31;
                    group.add(marker);
                    materials.push(marker.material);
                });
            }
            if (!group.children.length) return;
            toolFrame.add(group);
            const entry = { group, materials, cameraFacingOutlines, zoneIds: new Set([zone.id]) };
            visualGroups.set(key, entry);
            state.endMonitoringVisuals.push(entry);
        });
    });
    updateEndMonitoringVisualState();
}

function updateEndMonitoringVisualState() {
    state.endMonitoringVisuals.forEach(({ materials, zoneIds }) => {
        const hasDanger = [...zoneIds].some((zoneId) => {
            const status = getInterferenceZoneStatus(zoneId);
            return status === 'danger' || status === 'stopped';
        });
        materials.forEach((material) => {
            material.color.setHex(hasDanger ? 0xef4444 : 0x14b8a6);
            material.emissive?.setHex(hasDanger ? 0x7f1d1d : 0x0f766e);
        });
    });
    orientEndMonitoringOutlinesToCamera(state.camera);
}

function orientEndMonitoringOutlinesToCamera(camera) {
    if (!camera) return;
    camera.updateWorldMatrix(true, false);
    const cameraQuaternion = camera.getWorldQuaternion(new THREE.Quaternion());
    const groupQuaternion = new THREE.Quaternion();
    const localCameraQuaternion = new THREE.Quaternion();
    state.endMonitoringVisuals.forEach(({ group, cameraFacingOutlines }) => {
        if (!cameraFacingOutlines?.length) return;
        group.updateWorldMatrix(true, false);
        group.getWorldQuaternion(groupQuaternion);
        localCameraQuaternion.copy(groupQuaternion).invert().multiply(cameraQuaternion);
        cameraFacingOutlines.forEach((outline) => outline.quaternion.copy(localCameraQuaternion));
    });
}

function disposeInterferenceZoneVisuals() {
    state.interferenceVisuals.forEach(({ group, fill, outline, safetyOutline }) => {
        group.removeFromParent();
        fill.geometry.dispose();
        fill.material.dispose();
        outline.geometry.dispose();
        outline.material.dispose();
        if (safetyOutline) {
            safetyOutline.geometry.dispose();
            safetyOutline.material.dispose();
        }
    });
    state.interferenceVisuals = [];
}

function updateInterferenceZoneVisuals() {
    if (!state.scene) return;
    disposeInterferenceZoneVisuals();
    state.interferenceZones.forEach((zone) => {
        if (!zone.activate) return;
        const rawBounds = getInterferenceZoneBounds(zone, false);
        const safetyBounds = getInterferenceZoneBounds(zone, true);
        const rawSize = rawBounds.max.map((value, index) => value - rawBounds.min[index]);
        const safetySize = safetyBounds.max.map((value, index) => value - safetyBounds.min[index]);
        if (rawSize.some((value) => !(value > 0)) || safetySize.some((value) => !(value > 0))) return;
        const group = new THREE.Group();
        group.name = `Interference Zone ${zone.id}`;
        const fill = new THREE.Mesh(new THREE.BoxGeometry(safetySize[0], safetySize[1], safetySize[2]), new THREE.MeshBasicMaterial({
            color: 0x2563eb, transparent: true, opacity: 0.08, depthWrite: false
        }));
        fill.position.set(
            (safetyBounds.min[0] + safetyBounds.max[0]) / 2,
            (safetyBounds.min[1] + safetyBounds.max[1]) / 2,
            (safetyBounds.min[2] + safetyBounds.max[2]) / 2
        );
        const createBoxOutline = (bounds, size, material) => {
            const boxGeometry = new THREE.BoxGeometry(size[0], size[1], size[2]);
            const edges = new THREE.EdgesGeometry(boxGeometry);
            boxGeometry.dispose();
            const lines = new THREE.LineSegments(edges, material);
            lines.position.set(
                (bounds.min[0] + bounds.max[0]) / 2,
                (bounds.min[1] + bounds.max[1]) / 2,
                (bounds.min[2] + bounds.max[2]) / 2
            );
            lines.renderOrder = 30;
            if (material.isLineDashedMaterial) lines.computeLineDistances();
            return lines;
        };
        const outline = createBoxOutline(rawBounds, rawSize, new THREE.LineBasicMaterial({
            color: 0x2563eb, transparent: true, opacity: 0.9, depthTest: false
        }));
        const hasSafetyOffset = zone.safetyDistance > 0
            && rawSize.some((value, index) => Math.abs(value - safetySize[index]) > 1e-6);
        const safetyOutline = hasSafetyOffset
            ? createBoxOutline(safetyBounds, safetySize, new THREE.LineDashedMaterial({
                color: 0x2563eb,
                transparent: true,
                opacity: 0.92,
                depthTest: false,
                dashSize: 8,
                gapSize: 5
            }))
            : null;
        group.add(fill, outline);
        if (safetyOutline) group.add(safetyOutline);
        state.scene.add(group);
        state.interferenceVisuals.push({ zoneId: zone.id, group, fill, outline, safetyOutline });
    });
    updateInterferenceZoneVisualState();
    updateEndMonitoringVisuals();
}

function getDefaultViewPresetName(slot) {
    return `View ${slot + 1}`;
}

function isValidViewPreset(value) {
    return Boolean(value?.camera
        && Array.isArray(value.camera.position) && value.camera.position.length === 3
        && value.camera.position.every(Number.isFinite)
        && Array.isArray(value.camera.target) && value.camera.target.length === 3
        && value.camera.target.every(Number.isFinite)
        && Array.isArray(value.camera.up) && value.camera.up.length === 3
        && value.camera.up.every(Number.isFinite));
}

function serializeViewConfiguration() {
    return {
        viewPresets: state.viewPresets.map((preset) => preset && {
            name: preset.name,
            camera: {
                position: [...preset.camera.position],
                target: [...preset.camera.target],
                up: [...preset.camera.up],
                zoom: Number.isFinite(preset.camera.zoom) ? preset.camera.zoom : 1
            }
        })
    };
}

function saveViewConfiguration() {
    try {
        localStorage.setItem(VIEW_PRESETS_STORAGE_KEY, JSON.stringify(serializeViewConfiguration()));
    } catch (error) {
        console.warn('Unable to save view presets:', error);
    }
}

function loadViewConfiguration() {
    state.viewPresets = Array.from({ length: VIEW_PRESET_COUNT }, () => null);
    try {
        const raw = JSON.parse(localStorage.getItem(VIEW_PRESETS_STORAGE_KEY) || 'null');
        const presets = Array.isArray(raw) ? raw : raw?.viewPresets;
        if (Array.isArray(presets)) {
            presets.slice(0, VIEW_PRESET_COUNT).forEach((preset, slot) => {
                if (!isValidViewPreset(preset)) return;
                state.viewPresets[slot] = {
                    name: String(preset.name || getDefaultViewPresetName(slot)).slice(0, 24),
                    camera: {
                        position: preset.camera.position.map(Number),
                        target: preset.camera.target.map(Number),
                        up: preset.camera.up.map(Number),
                        zoom: Number.isFinite(Number(preset.camera.zoom)) ? Number(preset.camera.zoom) : 1
                    }
                };
            });
        }
    } catch (error) {
        console.warn('Unable to load view presets:', error);
    }
    refreshViewPresetsUi();
}

function captureViewPreset(slot, name = '') {
    if (!state.camera || !state.controls) return null;
    return {
        name: String(name || getDefaultViewPresetName(slot)).trim().slice(0, 24) || getDefaultViewPresetName(slot),
        camera: {
            position: state.camera.position.toArray(),
            target: state.controls.target.toArray(),
            up: state.camera.up.toArray(),
            zoom: Number.isFinite(state.camera.zoom) ? state.camera.zoom : 1
        }
    };
}

function getViewPreset(slot) {
    const index = Number(slot);
    return Number.isInteger(index) && index >= 0 && index < VIEW_PRESET_COUNT
        ? state.viewPresets[index]
        : null;
}

function setCameraUpFromPreset(camera, up) {
    camera.up.fromArray(up);
    if (camera.up.lengthSq() <= Number.EPSILON) camera.up.set(0, 0, 1);
    else camera.up.normalize();
}

function isViewWindowOpen() {
    if (getOpenViewWindow()) return true;
    return false;
}

function getOpenViewWindow() {
    const viewWindow = state.viewWindow;
    if (!viewWindow) return null;
    if (viewWindow.popup && !viewWindow.popup.closed) return viewWindow;
    closeViewWindow(false);
    return null;
}

function updateViewWindowHeader() {
    const viewWindow = state.viewWindow;
    if (!viewWindow?.popup || viewWindow.popup.closed) return;
    const count = viewWindow.cells.size;
    if (viewWindow.grid) viewWindow.grid.dataset.count = String(count);
}

function applyViewWindowPreset(slot) {
    const viewWindow = state.viewWindow;
    const preset = getViewPreset(slot);
    const cell = viewWindow?.cells?.get(Number(slot));
    if (!cell?.camera || !cell.controls || !preset || !isValidViewPreset(preset)) return false;
    cell.camera.position.fromArray(preset.camera.position);
    setCameraUpFromPreset(cell.camera, preset.camera.up);
    cell.camera.zoom = Number.isFinite(preset.camera.zoom) && preset.camera.zoom > 0
        ? preset.camera.zoom
        : 1;
    cell.camera.updateProjectionMatrix();
    cell.controls.target.fromArray(preset.camera.target);
    cell.camera.lookAt(cell.controls.target);
    cell.controls.update();
    if (cell.canvas) cell.canvas.setAttribute('aria-label', preset.name);
    requestRender();
    return true;
}

function resizeViewWindow() {
    const viewWindow = getOpenViewWindow();
    if (!viewWindow?.popup || !viewWindow.grid) return;
    const pixelRatio = Math.min(viewWindow.popup.devicePixelRatio || window.devicePixelRatio || 1, 2);
    viewWindow.cells.forEach((cell) => {
        const width = Math.max(1, cell.element.clientWidth);
        const height = Math.max(1, cell.element.clientHeight);
        cell.renderer.setPixelRatio(pixelRatio);
        cell.renderer.setSize(width, height, false);
        cell.camera.aspect = width / height;
        cell.camera.updateProjectionMatrix();
    });
    requestRender();
}

function renderViewWindow() {
    const viewWindow = getOpenViewWindow();
    if (!state.scene || !viewWindow) return;
    viewWindow.cells.forEach((cell) => {
        orientEndMonitoringOutlinesToCamera(cell.camera);
        cell.renderer.render(state.scene, cell.camera);
    });
    orientEndMonitoringOutlinesToCamera(state.camera);
}

function createViewWindowCell(slot) {
    const viewWindow = state.viewWindow;
    const preset = getViewPreset(slot);
    if (!viewWindow?.popup || !viewWindow.grid || !preset || !isValidViewPreset(preset)) return null;
    const element = viewWindow.popup.document.createElement('article');
    element.className = 'view-window-cell';
    element.dataset.slot = String(slot);

    const label = viewWindow.popup.document.createElement('span');
    label.className = 'view-window-label';
    label.textContent = String(Number(slot) + 1);
    label.setAttribute('aria-hidden', 'true');
    element.append(label);

    const canvas = viewWindow.popup.document.createElement('canvas');
    canvas.className = 'view-window-canvas';
    canvas.setAttribute('aria-label', preset.name);
    element.append(canvas);
    viewWindow.grid.appendChild(element);

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.shadowMap.enabled = state.renderer?.shadowMap.enabled ?? true;
    renderer.toneMapping = state.renderer?.toneMapping ?? THREE.NoToneMapping;
    renderer.toneMappingExposure = state.renderer?.toneMappingExposure ?? 1;
    if ('outputColorSpace' in renderer && state.renderer?.outputColorSpace) {
        renderer.outputColorSpace = state.renderer.outputColorSpace;
    }
    const camera = new THREE.PerspectiveCamera(state.camera.fov, 1, state.camera.near, state.camera.far);
    // OrbitControls captures object.up when it is constructed. The simulation is
    // Z-up, so the saved up axis must be applied before creating the controls.
    setCameraUpFromPreset(camera, preset.camera.up);
    const controls = new OrbitControls(camera, canvas);
    controls.enableDamping = false;
    controls.enablePan = true;
    controls.screenSpacePanning = true;
    controls.rotateSpeed = 1;
    if ('zoomToCursor' in controls) controls.zoomToCursor = false;
    controls.addEventListener('change', requestRender);
    controls.addEventListener('start', requestRender);
    controls.addEventListener('end', requestRender);
    const cell = { slot: Number(slot), element, canvas, renderer, camera, controls };
    viewWindow.cells.set(Number(slot), cell);
    viewWindow.resizeObserver?.observe(element);
    return cell;
}

function closeViewWindow(closePopup = true) {
    const viewWindow = state.viewWindow;
    if (!viewWindow) return;
    state.viewWindow = null;
    viewWindow.resizeObserver?.disconnect();
    viewWindow.cells.forEach((cell) => {
        cell.controls.dispose();
        cell.renderer.dispose();
    });
    viewWindow.popup?.removeEventListener('resize', viewWindow.handleResize);
    if (closePopup && viewWindow.popup && !viewWindow.popup.closed) viewWindow.popup.close();
}

function openViewWindow(slot) {
    const index = Number(slot);
    const preset = getViewPreset(index);
    if (!preset || !isValidViewPreset(preset) || !state.camera || !state.scene) return;

    if (isViewWindowOpen()) {
        const viewWindow = state.viewWindow;
        if (!viewWindow.cells.has(index)) createViewWindowCell(index);
        updateViewWindowHeader();
        resizeViewWindow();
        applyViewWindowPreset(index);
        viewWindow.popup.focus();
        return;
    }

    const popup = window.open('', 'InoRobot-fixed-view-camera', 'popup=yes,width=1100,height=780,resizable=yes');
    if (!popup) {
        setStatus('팝업이 차단되었습니다. 고정 뷰 창을 열려면 팝업을 허용하세요.', '#ef4444');
        return;
    }

    popup.document.open();
    popup.document.write(`<!doctype html><html lang="ko"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>3D Simulation</title><style>
        :root { color-scheme: dark; }
        * { box-sizing: border-box; }
        html, body { width: 100%; height: 100%; margin: 0; overflow: hidden; background: #080b12; }
        body { display: flex; color: #dbeafe; font-family: Inter, "Noto Sans KR", sans-serif; }
        #view-window-grid { width: 100%; height: 100%; display: grid; gap: 0; padding: 0; }
        #view-window-grid[data-count="1"] { grid-template-columns: minmax(0, 1fr); grid-template-rows: minmax(0, 1fr); }
        #view-window-grid[data-count="2"] { grid-template-columns: repeat(2, minmax(0, 1fr)); grid-template-rows: minmax(0, 1fr); }
        #view-window-grid[data-count="3"], #view-window-grid[data-count="4"] { grid-template-columns: repeat(2, minmax(0, 1fr)); grid-template-rows: repeat(2, minmax(0, 1fr)); }
        #view-window-grid[data-count="3"] .view-window-cell:last-child { grid-column: 1 / -1; }
        .view-window-cell { position: relative; min-width: 0; min-height: 0; overflow: hidden; border-right: 1px solid rgba(148,163,184,.7); border-bottom: 1px solid rgba(148,163,184,.7); background: #0b0e14; }
        #view-window-grid[data-count="1"] .view-window-cell,
        #view-window-grid[data-count="2"] .view-window-cell:last-child,
        #view-window-grid[data-count="3"] .view-window-cell:last-child,
        #view-window-grid[data-count="4"] .view-window-cell:nth-child(2n) { border-right: 0; }
        #view-window-grid[data-count="1"] .view-window-cell,
        #view-window-grid[data-count="2"] .view-window-cell,
        #view-window-grid[data-count="3"] .view-window-cell:last-child,
        #view-window-grid[data-count="4"] .view-window-cell:nth-child(n + 3) { border-bottom: 0; }
        .view-window-label { position: absolute; top: 8px; left: 10px; z-index: 2; color: rgba(226,232,240,.9); font: 600 14px/1 Inter, "Noto Sans KR", sans-serif; pointer-events: none; text-shadow: 0 1px 3px rgba(0,0,0,.85); }
        .view-window-canvas { display: block; width: 100%; height: 100%; cursor: grab; touch-action: none; }
        .view-window-canvas:active { cursor: grabbing; }
    </style></head><body><main id="view-window-grid" data-count="0"></main></body></html>`);
    popup.document.close();

    const grid = popup.document.getElementById('view-window-grid');
    state.viewWindow = {
        popup,
        grid,
        cells: new Map(),
        handleResize: null,
        resizeObserver: null
    };
    const handleResize = () => resizeViewWindow();
    state.viewWindow.handleResize = handleResize;
    popup.addEventListener('resize', handleResize);
    popup.addEventListener('beforeunload', () => closeViewWindow(false), { once: true });
    if (typeof popup.ResizeObserver === 'function') {
        state.viewWindow.resizeObserver = new popup.ResizeObserver(handleResize);
        state.viewWindow.resizeObserver.observe(grid);
    }
    createViewWindowCell(index);
    updateViewWindowHeader();
    resizeViewWindow();
    applyViewWindowPreset(index);
    // The parent simulation loop renders every popup cell while the window is open.
    // A second popup RAF loop would render the shared scene concurrently and make
    // layout changes and camera switching visibly unstable.
    popup.focus();
}

function applyViewPreset(slot, { announce = true } = {}) {
    const index = Number(slot);
    const preset = getViewPreset(index);
    if (!preset || !isValidViewPreset(preset) || !state.camera || !state.controls) return false;
    state.camera.position.fromArray(preset.camera.position);
    setCameraUpFromPreset(state.camera, preset.camera.up);
    state.camera.zoom = Number.isFinite(preset.camera.zoom) && preset.camera.zoom > 0
        ? preset.camera.zoom
        : 1;
    state.camera.updateProjectionMatrix();
    state.controls.target.fromArray(preset.camera.target);
    state.camera.lookAt(state.controls.target);
    state.controls.update();
    state.activeViewSlot = index;
    if (state.snapMoveMode) captureSimulationSnapMarkerReferenceDistance();
    refreshViewPresetsUi();
    requestRender();
    if (announce) setStatus('뷰 {number}: {name}', '#60a5fa', {
        number: index + 1,
        name: preset.name
    });
    return true;
}

function saveViewPreset(slot) {
    const row = el.viewPresetsList?.querySelector(`[data-view-slot="${slot}"]`);
    if (!row) return;
    const name = row.querySelector('[data-view-name]')?.value || getDefaultViewPresetName(slot);
    const preset = captureViewPreset(slot, name);
    if (!preset) return;
    state.viewPresets[slot] = preset;
    state.activeViewSlot = slot;
    saveViewConfiguration();
    if (state.viewWindow?.cells.has(slot)) applyViewWindowPreset(slot);
    refreshViewPresetsUi();
    setStatus('뷰 {number}을 저장했습니다.', '#22c55e', { number: slot + 1 });
}

function refreshViewPresetsUi() {
    if (!el.viewPresetsList) return;
    el.viewPresetsList.querySelectorAll('[data-view-slot]').forEach((row) => {
        const slot = Number(row.dataset.viewSlot);
        const preset = getViewPreset(slot);
        const nameInput = row.querySelector('[data-view-name]');
        const applyButton = row.querySelector('[data-view-apply]');
        const monitorButton = row.querySelector('[data-view-monitor]');
        if (nameInput && document.activeElement !== nameInput) {
            nameInput.value = preset?.name || nameInput.value || getDefaultViewPresetName(slot);
        }
        if (applyButton) {
            applyButton.disabled = !preset;
            applyButton.setAttribute('aria-label', uiFormat('{name} 적용', {
                name: preset?.name || getDefaultViewPresetName(slot)
            }));
        }
        if (monitorButton) {
            monitorButton.disabled = !preset;
            monitorButton.title = uiText('고정 뷰 창에 보기');
            monitorButton.setAttribute('aria-label', uiFormat('{name}을 고정 뷰 창에 보기', {
                name: preset?.name || getDefaultViewPresetName(slot)
            }));
        }
        row.classList.toggle('active', state.activeViewSlot === slot && Boolean(preset));
    });
}

function handleViewPresetListClick(event) {
    const row = event.target.closest('[data-view-slot]');
    if (!row || !el.viewPresetsList.contains(row)) return;
    const slot = Number(row.dataset.viewSlot);
    if (event.target.closest('[data-view-save]')) saveViewPreset(slot);
    else if (event.target.closest('[data-view-apply]')) applyViewPreset(slot);
    else if (event.target.closest('[data-view-monitor]')) openViewWindow(slot);
}

function handleViewPresetListInput(event) {
    const nameInput = event.target.closest('[data-view-name]');
    if (!nameInput) return;
    const row = nameInput.closest('[data-view-slot]');
    const preset = getViewPreset(Number(row?.dataset.viewSlot));
    if (!preset) return;
    preset.name = nameInput.value.trim().slice(0, 24) || getDefaultViewPresetName(Number(row.dataset.viewSlot));
    saveViewConfiguration();
    if (state.viewWindow?.cells.has(Number(row.dataset.viewSlot))) {
        applyViewWindowPreset(Number(row.dataset.viewSlot));
    }
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
    const interferenceButton = el.panelLauncher?.querySelector('[data-panel-toggle="interference-zone-panel"]');
    if (interferenceButton) {
        interferenceButton.title = uiText('간섭영역 설정 표시/숨기기');
        interferenceButton.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> ${uiText('간섭영역')}`;
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
    refreshViewPresetsUi();
    renderInterferenceZonePanel();
    if (state.collision.lastResult) updateCollisionStatus(state.collision.lastResult);
    refreshViewerStatus();
    refreshMotionProgramStatus();
    if (el.baseJogStatus?.dataset.sourceMessage) {
        el.baseJogStatus.textContent = uiText(el.baseJogStatus.dataset.sourceMessage);
    }
    if (el.tcpProfileStatus?.dataset.sourceMessage) {
        el.tcpProfileStatus.textContent = uiText(el.tcpProfileStatus.dataset.sourceMessage);
    }
    if (el.tcpSnapReadout?.dataset.sourceMessage) {
        el.tcpSnapReadout.textContent = uiText(el.tcpSnapReadout.dataset.sourceMessage);
    }
    if (el.zeroPointSnapReadout?.dataset.sourceMessage) {
        el.zeroPointSnapReadout.textContent = uiText(el.zeroPointSnapReadout.dataset.sourceMessage);
    }
    if (state.zeroPointEdit.active) updateZeroPointCurrentMarker();
    updateTcpMultiCenterControls();
    updateZeroPointMultiCenterControls();
    refreshTcpProfileUi();
    updateOutlineToggleUi();
    updateCollisionUi();
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
    state.collision.system = new MeshCollisionSystem({
        // The imported coordinates are millimetres.  This tolerance is small
        // enough for STL contact while avoiding floating point chatter.
        epsilon: 1e-4,
        leafSize: 16
    });
    updateInterferenceZoneVisuals();
}

function preventMiddleButtonAutoscroll(event) {
    if (event.button === 1) event.preventDefault();
}

function updateModelRenderComplexity(model) {
    let triangleCount = 0;
    model.traverse((child) => {
        if (!child.isMesh) return;
        const position = child.geometry?.getAttribute('position');
        const elementCount = child.geometry?.index?.count ?? position?.count ?? 0;
        triangleCount += Math.floor(elementCount / 3);
    });

    model.userData.renderTriangleCount = triangleCount;
    model.userData.largeModelMode = Boolean(
        model.userData.largeModelMode
        || Number(model.userData.sourceFileSize) >= LARGE_MODEL_PERFORMANCE_MIN_BYTES
        || triangleCount >= LARGE_MODEL_PERFORMANCE_MIN_TRIANGLES
    );
}

function updateLargeModelPerformanceMode() {
    const enabled = state.models.some((model) => (
        model.userData.largeModelMode && model.visible !== false
    ));
    if (state.largeModelPerformanceMode === enabled || !state.renderer) return;
    state.largeModelPerformanceMode = enabled;
    state.renderer.shadowMap.enabled = !enabled;
    state.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, enabled ? 1 : 2));
    state.renderer.setSize(el.canvasContainer.clientWidth, el.canvasContainer.clientHeight);
}

function collisionModelLabel(model) {
    return model?.userData?.motionDisplayName
        || model?.userData?.modelName
        || model?.name
        || '3D Model';
}

function getCollisionMaterials(mesh) {
    if (!mesh?.isMesh) return [];
    return Array.isArray(mesh.material) ? mesh.material.filter(Boolean) : mesh.material ? [mesh.material] : [];
}

function setCollisionMeshHighlight(mesh, enabled) {
    getCollisionMaterials(mesh).forEach((material) => {
        if (!state.collision.highlightedMaterials.has(material)) {
            state.collision.highlightedMaterials.set(material, {
                color: material.color?.clone?.() || null,
                emissive: material.emissive?.clone?.() || null,
                emissiveIntensity: Number.isFinite(material.emissiveIntensity)
                    ? material.emissiveIntensity
                    : null
            });
        }
        const snapshot = state.collision.highlightedMaterials.get(material);
        if (enabled) {
            material.color?.setHex(0xef4444);
            material.emissive?.setHex(0x7f1d1d);
            if ('emissiveIntensity' in material) material.emissiveIntensity = 0.9;
        } else {
            if (snapshot.color && material.color) material.color.copy(snapshot.color);
            if (snapshot.emissive && material.emissive) material.emissive.copy(snapshot.emissive);
            if (snapshot.emissiveIntensity !== null && 'emissiveIntensity' in material) {
                material.emissiveIntensity = snapshot.emissiveIntensity;
            }
            state.collision.highlightedMaterials.delete(material);
        }
        material.needsUpdate = true;
    });
}

function setAttachedToolCollisionHighlight(model, enabled) {
    // A Tool import often contains several independently coloured meshes.
    // checkAll() intentionally retains one precise contact per robot link for
    // motion performance, so colouring only that representative mesh can
    // leave another visibly colliding Tool part green. Once a Tool is part of
    // a collision pair, show the complete Tool assembly in red without adding
    // another expensive mesh-pair scan.
    if (!model?.userData?.attachmentHost) return;
    model.traverse((child) => {
        if (child.isMesh && !child.userData?.collisionDisabled) {
            setCollisionMeshHighlight(child, enabled);
        }
    });
}

function clearCollisionHighlight() {
    [...state.collision.highlightedMaterials.keys()].forEach((material) => {
        const snapshot = state.collision.highlightedMaterials.get(material);
        if (snapshot?.color && material.color) material.color.copy(snapshot.color);
        if (snapshot?.emissive && material.emissive) material.emissive.copy(snapshot.emissive);
        if (snapshot?.emissiveIntensity !== null && snapshot?.emissiveIntensity !== undefined
            && 'emissiveIntensity' in material) {
            material.emissiveIntensity = snapshot.emissiveIntensity;
        }
        material.needsUpdate = true;
    });
    state.collision.highlightedMaterials.clear();
}

function setCollisionDebugForModel(model, enabled) {
    if (!model) return;
    const meshes = [];
    model.traverse((child) => {
        if (child.isMesh && !child.userData.collisionDebugMesh && !child.userData.collisionDisabled) {
            meshes.push(child);
        }
    });
    meshes.forEach((mesh) => {
        const existing = state.collision.debugLines.get(mesh);
        if (enabled) {
            if (existing || !mesh.geometry) return;
            const material = new THREE.LineBasicMaterial({
                color: 0x38bdf8,
                transparent: true,
                opacity: 0.28,
                depthTest: false,
                depthWrite: false
            });
            const line = new THREE.LineSegments(new THREE.WireframeGeometry(mesh.geometry), material);
            line.name = `${mesh.name || 'Mesh'} collision wireframe`;
            line.userData.collisionDebugMesh = true;
            line.renderOrder = 19;
            line.frustumCulled = false;
            // Parent the visualizer to the actual mesh so all local transforms,
            // joint rotations and TCP attachment transforms are inherited.
            mesh.add(line);
            state.collision.debugLines.set(mesh, line);
        } else if (existing) {
            existing.removeFromParent();
            existing.geometry?.dispose?.();
            existing.material?.dispose?.();
            state.collision.debugLines.delete(mesh);
        }
    });
}

function refreshCollisionDebugOverlays() {
    state.models.forEach((model) => setCollisionDebugForModel(model, state.collision.debugVisible));
}

function disposeCollisionDebugForModel(model) {
    state.collision.safeRobotAngles.delete(model);
    model?.traverse?.((child) => {
        const line = state.collision.debugLines.get(child);
        if (!line) return;
        line.removeFromParent();
        line.geometry?.dispose?.();
        line.material?.dispose?.();
        state.collision.debugLines.delete(child);
    });
}

function updateCollisionUi() {
    const enabledButton = el.btnToggleCollision;
    if (enabledButton) {
        enabledButton.classList.toggle('active', state.collision.enabled);
        enabledButton.setAttribute('aria-pressed', String(state.collision.enabled));
        enabledButton.title = uiText(state.collision.enabled ? '충돌 감지 끄기' : '충돌 감지 켜기');
    }
}

function collisionResultKey(result) {
    if (!result?.meshA?.uuid || !result?.meshB?.uuid) return '';
    return [result.meshA.uuid, result.meshB.uuid].sort().join(':');
}

function asCollisionResults(result) {
    if (Array.isArray(result)) return result.filter(Boolean);
    return result ? [result] : [];
}

function collisionResultsKey(result) {
    return asCollisionResults(result)
        .map(collisionResultKey)
        .filter(Boolean)
        .sort()
        .join('|');
}

function updateCollisionStatus(result = null) {
    const results = asCollisionResults(result);
    const status = el.collisionStatus;
    if (!results.length) {
        // A stopped program remains at its collision pose. Keep every active
        // collision highlighted until the user moves away or restarts motion
        // from that breakpoint.
        const stopResults = asCollisionResults(state.collision.stopNotice?.result);
        if (stopResults.length) {
            if (collisionResultsKey(state.collision.lastResult) !== collisionResultsKey(stopResults)) {
                updateCollisionStatus(stopResults);
            }
            return;
        }
        if (status) {
            status.classList.add('hidden');
            const label = status.querySelector('span');
            if (label) label.textContent = '';
        }
        clearCollisionHighlight();
        const currentText = String(state.viewerStatus?.text || '');
        if (state.viewerStatus?.color === '#ef4444' && currentText.includes('충돌')) {
            setStatus('Ready', '#22c55e');
        }
        state.collision.lastResult = null;
        state.collision.lastStatusKey = '';
        return;
    }

    const primary = results[0];
    const leftName = collisionModelLabel(primary.objectA);
    const rightName = collisionModelLabel(primary.objectB);
    const statusKey = collisionResultsKey(results);
    const sameCollision = state.collision.lastStatusKey === statusKey;
    if (!sameCollision) {
        clearCollisionHighlight();
        results.forEach((hit) => {
            setCollisionMeshHighlight(hit.meshA, true);
            setCollisionMeshHighlight(hit.meshB, true);
            setAttachedToolCollisionHighlight(hit.objectA, true);
            setAttachedToolCollisionHighlight(hit.objectB, true);
        });
    }
    state.collision.lastResult = results;
    const collisionMessage = '충돌 감지: {left} ↔ {right}';
    const collisionReplacements = {
        left: leftName,
        right: rightName
    };
    if (status) {
        status.classList.remove('hidden');
        const label = status.querySelector('span');
        if (label) label.textContent = uiFormat(collisionMessage, collisionReplacements);
    }
    const viewerAlreadyShowsCollision = state.viewerStatus?.color === '#ef4444'
        && String(state.viewerStatus.text || '').includes('충돌');
    // Import/model-load success messages can arrive after the collision pair
    // was already cached. Restore the red viewer state even for the same pair.
    // A latched stop uses its more specific "motion stopped" message below.
    if (state.collision.lastStatusKey !== statusKey
        || (!viewerAlreadyShowsCollision && !state.collision.stopNotice)) {
        state.collision.lastStatusKey = statusKey;
        setStatus(collisionMessage, '#ef4444', collisionReplacements);
    }
}

function latchCollisionStopNotice(result, message) {
    const results = asCollisionResults(result);
    if (!results.length) return;
    state.collision.stopNotice = { result: results, message };
    updateCollisionStatus(results);
    setStatus(message, '#ef4444');
}

function clearCollisionStopNotice({ resetViewerStatus = true } = {}) {
    state.collision.stopNotice = null;
    state.collision.ignoredMotionCollisionKeys.clear();
    const currentText = String(state.viewerStatus?.text || '');
    if (resetViewerStatus && state.viewerStatus?.color === '#ef4444' && currentText.includes('충돌')) {
        setStatus('Ready', '#22c55e');
    }
}

function clearJogCollisionLock() {
    // JOG is an interactive simulation control. It may enter a collision pose,
    // but collision detection must never reject or roll back that pose.
    // Release a previous program-stop latch without clearing the visible
    // collision state. The next fresh scan decides whether the collision is
    // gone; if it is still present, the same red alert remains latched.
    clearCollisionStopNotice({ resetViewerStatus: false });

    // Queue a normal pass immediately, then guarantee one fresh pass after the
    // throttling window. Do not force a triangle scan for every slider/pointer
    // event; the trailing pass coalesces rapid input without reintroducing the
    // JOG lag.
    requestRender();
    if (state.collision.jogRefreshTimer !== null) {
        clearTimeout(state.collision.jogRefreshTimer);
    }
    const refreshDelay = Math.max(16, Number(state.collision.minCheckIntervalMs) + 16);
    state.collision.jogRefreshTimer = setTimeout(() => {
        state.collision.jogRefreshTimer = null;
        requestRender();
    }, refreshDelay);
}

function getCollisionModels() {
    // MeshCollisionSystem records one representative collision per left mesh
    // and model pair. Put articulated links and their Tool first so every
    // colliding robot part retains red feedback without repeatedly testing
    // against each CAD sub-mesh of the same obstacle.
    const priority = (model) => {
        if (model?.userData?.tcpFrame) return 0;
        if (model?.userData?.attachmentHost) return 1;
        return 2;
    };
    return state.models
        .filter((model) => model.visible !== false && model.userData?.collisionEnabled !== false)
        .sort((left, right) => priority(left) - priority(right));
}

function markSceneCollisionDirty(model = null) {
    const collision = state.collision;
    collision.dirty = true;
    if (!model) {
        // No root was supplied when the scene structure changed. The next
        // pass must therefore refresh every model pair.
        collision.dirtyRoots.clear();
        return;
    }

    collision.dirtyRoots.add(model);
    const hostRobot = model.userData?.attachmentHost || (model.userData?.tcpFrame ? model : null);
    if (!hostRobot) return;
    collision.dirtyRoots.add(hostRobot);
    // TCP-mounted Tools have their own collision roots but inherit every
    // joint pose from the robot. Mark them with the robot so their cached
    // root-pair results cannot survive a JOG or program move.
    state.models.forEach((candidate) => {
        if (candidate.userData?.attachmentHost === hostRobot) collision.dirtyRoots.add(candidate);
    });
}

function collisionInvolvesRobot(result, robot) {
    if (!robot) return false;
    return asCollisionResults(result).some((hit) => (
        [hit.objectA, hit.objectB].some((object) => (
            object === robot || object?.userData?.attachmentHost === robot
        ))
    ));
}

function releaseClearedMotionCollisionIgnores(result) {
    const activeKeys = new Set(asCollisionResults(result).map(collisionResultKey).filter(Boolean));
    state.collision.ignoredMotionCollisionKeys.forEach((key) => {
        if (!activeKeys.has(key)) state.collision.ignoredMotionCollisionKeys.delete(key);
    });
}

function getBlockingMotionCollision(result) {
    return asCollisionResults(result).find((hit) => (
        !state.collision.ignoredMotionCollisionKeys.has(collisionResultKey(hit))
    )) || null;
}

function checkSceneCollisions({ force = false } = {}) {
    if (!state.collision.enabled || !state.collision.system || state.collision.checking) {
        if (!state.collision.enabled) {
            state.collision.lastCheckSkipped = true;
            updateCollisionStatus(null);
        }
        return null;
    }
    if (!force && !state.collision.dirty) {
        state.collision.lastCheckSkipped = true;
        return state.collision.lastResult;
    }
    const now = performance.now();
    if (!force
        && state.collision.lastCheckAt > 0
        && now - state.collision.lastCheckAt < state.collision.minCheckIntervalMs) {
        state.collision.lastCheckSkipped = true;
        return state.collision.lastResult;
    }
    state.collision.checking = true;
    state.collision.lastCheckSkipped = false;
    state.collision.lastCheckAt = now;
    try {
        state.scene?.updateMatrixWorld(true);
        const collisionModels = getCollisionModels();
        const changedRoots = new Set(
            [...state.collision.dirtyRoots].filter((root) => collisionModels.includes(root))
        );
        const result = force || changedRoots.size === 0
            ? state.collision.system.checkAll(getCollisionModels(), { allowWarmHitReuse: false })
            : state.collision.system.checkAll(collisionModels, { changedRoots, allowWarmHitReuse: true });
        state.collision.dirty = false;
        state.collision.dirtyRoots.clear();
        updateCollisionStatus(result);
        return result;
    } catch (error) {
        console.warn('Mesh collision check failed:', error);
        state.collision.dirty = false;
        state.collision.dirtyRoots.clear();
        const wasReported = state.collision.lastStatusKey === 'error';
        updateCollisionStatus(null);
        if (!wasReported) {
            state.collision.lastStatusKey = 'error';
            setStatus('충돌 검사 오류', '#f59e0b');
        }
        return null;
    } finally {
        state.collision.checking = false;
    }
}

function captureCollisionSafeRobotPoses() {
    if (!state.collision.enabled) return;
    getArticulatedRobots().forEach((robot) => {
        state.collision.safeRobotAngles.set(robot, robot.userData.joints.map((joint) => joint.angle));
    });
}

function restoreCollisionSafeRobotPoses(robots = getArticulatedRobots()) {
    robots.forEach((robot) => {
        const safeAngles = state.collision.safeRobotAngles.get(robot);
        if (!safeAngles || !robot.userData?.joints) return;
        safeAngles.forEach((angle, index) => setJointAngle(robot.userData.joints[index], angle, false));
        robot.updateMatrixWorld(true);
        if (robot === state.activeArticulatedModel) {
            syncJointControls(robot);
            captureCurrentTcpTarget(robot);
            updateTcpPresentation(robot);
        }
    });
}

function isLazySimulationSnapMesh(mesh) {
    return Boolean(mesh?.userData.largeModelMode && mesh.userData.largeModelChunk);
}

function getSimulationSnapModels(scope = 'scene') {
    if (scope === 'zero') {
        const model = state.zeroPointEdit.model;
        return model?.userData.uploaded && model.visible !== false ? [model] : [];
    }
    const placement = scope === 'tool' ? 'tcp' : 'scene';
    return state.models.filter((model) => model.userData.uploaded
        && model.userData.placement === placement
        && model.visible !== false);
}

function isLargeModelSnapPerformanceMode(scope = 'scene') {
    return getSimulationSnapModels(scope).some((model) => (
        model.userData.largeModelMode
        || Number(model.userData.sourceFileSize) >= STEP_LARGE_FILE_ENGINE_MIN_BYTES
    ));
}

function getAllSimulationSnapMeshes(scope = 'scene', { includeHidden = false } = {}) {
    const meshes = [];
    getSimulationSnapModels(scope).forEach((model) => model.traverse((child) => {
        if (child.isMesh && !child.userData.simulationSnapFaceOverlay
            && (includeHidden || child.visible !== false)
            && child.geometry?.getAttribute('position')) meshes.push(child);
    }));
    return meshes;
}

function getSimulationSnapFaceSelections() {
    return Array.isArray(state.snapFaceSelections) && state.snapFaceSelections.length
        ? state.snapFaceSelections
        : (state.snapFaceSelection ? [state.snapFaceSelection] : []);
}

function getSimulationSnapFaceSelectionSignature(selections = getSimulationSnapFaceSelections()) {
    return selections.map((selection) => (
        `${selection.key}:${selection.triangleRanges.map((range) => `${range.first}-${range.last}`).join(',')}`
    )).join('|');
}

function getSimulationSnapMeshes(scope = 'scene') {
    const selections = getSimulationSnapFaceSelections();
    if (scope === 'scene' && state.snapMoveMode && selections.length) {
        const selectedMeshes = [...new Set(selections.map((selection) => selection.mesh))];
        // A selected mesh can be temporarily hidden while a large-model chunk
        // or a render update is being applied. Membership must be checked
        // without visibility filtering; otherwise the selection is cleared
        // and this function falls back to every scene mesh.
        const loadedMeshes = getAllSimulationSnapMeshes(scope, { includeHidden: true });
        if (selectedMeshes.every((mesh) => loadedMeshes.includes(mesh))) return selectedMeshes;
        // Never fall back to the complete scene while face picking is active.
        // An unavailable selected mesh means there are no valid snap targets,
        // not that all other faces should become eligible.
        return [];
    }
    return getAllSimulationSnapMeshes(scope);
}

function cloneSimulationSnapFaceSelection(selection) {
    if (!selection?.mesh || !Array.isArray(selection.triangleRanges)) return null;
    return {
        ...selection,
        point: selection.point?.clone ? selection.point.clone() : selection.point,
        triangleRanges: selection.triangleRanges.map((range) => ({
            first: Number(range.first),
            last: Number(range.last)
        }))
    };
}

function cloneSimulationSnapFaceSelections(selections = getSimulationSnapFaceSelections()) {
    return selections.map(cloneSimulationSnapFaceSelection).filter(Boolean);
}

function getSimulationSnapScope() {
    if (state.zeroPointEdit.active && state.zeroPointEdit.snapMode) return 'zero';
    return state.tcpSnapMode ? 'tool' : 'scene';
}

function yieldToAnimationFrame() {
    return new Promise((resolve) => requestAnimationFrame(resolve));
}

function getValidatedStepBrepFaces(mesh) {
    const rawFaces = mesh?.userData?.stepBrepFaces;
    const triangleCount = Math.floor((mesh?.geometry?.index?.count
        ?? mesh?.geometry?.getAttribute?.('position')?.count
        ?? 0) / 3);
    if (!Array.isArray(rawFaces) || !rawFaces.length || triangleCount <= 0) return null;

    const faces = [];
    let expectedFirst = 0;
    for (const rawFace of rawFaces) {
        const first = Number(rawFace?.first);
        const last = Number(rawFace?.last);
        if (!Number.isInteger(first) || !Number.isInteger(last)
            || first !== expectedFirst || first < 0 || last < first || last >= triangleCount) {
            return null;
        }
        faces.push({ first, last });
        expectedFirst = last + 1;
    }
    return expectedFirst === triangleCount ? faces : null;
}

function buildSimulationSnapResultForMesh(mesh, lazyChunk = false, faceSelection = null) {
    const stepBrepFaces = getValidatedStepBrepFaces(mesh);
    const snapGeometry = stepBrepFaces
        ? {
            attributes: mesh.geometry.attributes,
            index: mesh.geometry.index,
            brep_faces: stepBrepFaces
        }
        : mesh.geometry;
    const selectedFaceGeometry = faceSelection?.triangleRanges?.length
        ? { ...snapGeometry, brep_faces: faceSelection.triangleRanges }
        : snapGeometry;
    return buildStepSnapCandidates(selectedFaceGeometry, {
        maxVirtualPairs: lazyChunk ? 2000 : 6000,
        maxVirtualCandidates: lazyChunk ? 80 : 160,
        maxPerType: {
            endpoint: Infinity,
            vertex: lazyChunk ? 2500 : 4000,
            'edge-midpoint': lazyChunk ? 2500 : 4000,
            'circle-center': lazyChunk ? 600 : 1000,
            'rectangle-center': lazyChunk ? 600 : 1000
        },
        triangleRanges: faceSelection?.triangleRanges,
        disabledTypes: SIMULATION_SNAP_DISABLED_TYPES
    });
}

function buildSimulationCombinedSnapCandidates(candidateGroups, selections = getSimulationSnapFaceSelections()) {
    const groups = Array.isArray(candidateGroups)
        ? candidateGroups.filter((group) => Array.isArray(group?.candidates) && group.candidates.length)
        : [];
    if (selections.length < 2 || groups.length < 2) return [];

    const result = [];
    const seen = new Set();
    const toWorldPoint = (candidate) => {
        if (!candidate?.localPoint?.clone || !candidate.mesh?.matrixWorld) return null;
        candidate.mesh.updateWorldMatrix?.(true, false);
        const point = candidate.localPoint.clone().applyMatrix4(candidate.mesh.matrixWorld);
        return point.isVector3 && Number.isFinite(point.x) && Number.isFinite(point.y)
            && Number.isFinite(point.z) ? point : null;
    };
    const addCandidate = (worldPoint, sourceKind, anchorCandidate) => {
        if (!worldPoint || !worldPoint.isVector3
            || !Number.isFinite(worldPoint.x) || !Number.isFinite(worldPoint.y)
            || !Number.isFinite(worldPoint.z)) return;
        const key = `${sourceKind}:${worldPoint.x.toFixed(5)},${worldPoint.y.toFixed(5)},${worldPoint.z.toFixed(5)}`;
        if (seen.has(key)) return;
        seen.add(key);
        const mesh = anchorCandidate?.mesh || groups[0]?.candidates?.[0]?.mesh;
        if (!mesh?.matrixWorld) return;
        mesh.updateWorldMatrix?.(true, false);
        const localPoint = worldPoint.clone().applyMatrix4(mesh.matrixWorld.clone().invert());
        if (!Number.isFinite(localPoint.x) || !Number.isFinite(localPoint.y)
            || !Number.isFinite(localPoint.z)) return;
        // Keep the combined point ready for the persistent marker layer. The
        // pointer picker can derive this from localPoint, but the settled
        // marker pass must not depend on a hover event to create worldPoint.
        result.push({
            type: 'multi-point-center',
            mesh,
            localPoint,
            snapWorldPoint: worldPoint.clone(),
            sourceKind
        });
    };

    const centerGroups = groups.map((group) => group.candidates.filter((candidate) => (
        candidate.type === 'rectangle-center' || candidate.type === 'circle-center'
    )));
    let centerPairCount = 0;
    for (let leftGroupIndex = 0; leftGroupIndex < centerGroups.length; leftGroupIndex += 1) {
        for (let rightGroupIndex = leftGroupIndex + 1; rightGroupIndex < centerGroups.length; rightGroupIndex += 1) {
            for (const leftCandidate of centerGroups[leftGroupIndex]) {
                for (const rightCandidate of centerGroups[rightGroupIndex]) {
                    centerPairCount += 1;
                    if (centerPairCount > 4000) break;
                    const left = toWorldPoint(leftCandidate);
                    const right = toWorldPoint(rightCandidate);
                    if (!left || !right) continue;
                    addCandidate(
                        left.clone().add(right).multiplyScalar(0.5),
                        'center-midpoint',
                        leftCandidate
                    );
                }
                if (centerPairCount > 4000) break;
            }
        }
    }

    for (let leftGroupIndex = 0; leftGroupIndex < groups.length; leftGroupIndex += 1) {
        for (let rightGroupIndex = leftGroupIndex + 1; rightGroupIndex < groups.length; rightGroupIndex += 1) {
            const boundaryCandidates = [
                ...groups[leftGroupIndex].candidates,
                ...groups[rightGroupIndex].candidates
            ].filter((candidate) => candidate.type === 'vertex' || candidate.type === 'endpoint');
            const uniqueBoundaryPoints = [];
            const boundaryKeys = new Set();
            let anchorCandidate = null;
            boundaryCandidates.forEach((candidate) => {
                const point = toWorldPoint(candidate);
                if (!point) return;
                const key = `${point.x.toFixed(5)},${point.y.toFixed(5)},${point.z.toFixed(5)}`;
                if (boundaryKeys.has(key)) return;
                boundaryKeys.add(key);
                uniqueBoundaryPoints.push(point);
                anchorCandidate ||= candidate;
            });
            if (uniqueBoundaryPoints.length >= 4) {
                const bounds = new THREE.Box3();
                uniqueBoundaryPoints.forEach((point) => bounds.expandByPoint(point));
                addCandidate(bounds.getCenter(new THREE.Vector3()), 'boundary-center', anchorCandidate);
            }
        }
    }
    return result;
}

async function buildSimulationSnapCandidates(scope = getSimulationSnapScope()) {
    if (!isSimulationSnapInteractionActive()) return [];
    const faceSelections = scope === 'scene' && state.snapMoveMode
        ? cloneSimulationSnapFaceSelections() : [];
    if (scope === 'scene' && state.snapMoveMode && !faceSelections.length) {
        state.snapCandidates = [];
        state.snapCandidatesReady = false;
        return [];
    }
    const meshes = getSimulationSnapMeshes(scope);
    const faceSelectionsByMesh = new Map();
    faceSelections.forEach((selection) => {
        const selectionsForMesh = faceSelectionsByMesh.get(selection.mesh.uuid) || [];
        selectionsForMesh.push(selection);
        faceSelectionsByMesh.set(selection.mesh.uuid, selectionsForMesh);
    });
    const faceSignature = getSimulationSnapFaceSelectionSignature(faceSelections);
    const signature = `${scope}:${meshes.map((mesh) => `${mesh.uuid}:${mesh.geometry.uuid}`).join('|')}:${faceSignature}`;
    if (signature === state.snapCandidateModelsSignature && state.snapCandidatesReady) return meshes;
    if (signature === state.snapCandidateBuildSignature && state.snapCandidateBuildPromise) {
        await state.snapCandidateBuildPromise;
        return getSimulationSnapMeshes(scope);
    }

    state.snapCandidateBuildSignature = signature;
    state.snapCandidatesReady = false;
    state.snapWorldIndex = null;
    state.snapWorldIndexSignature = '';
    state.snapLazyReadyMeshes.clear();
    state.snapLazyBuildPromises.clear();
    const nextCandidates = [];
    const nextCandidateCounts = {};
    const candidateGroups = faceSelections.map((selection) => ({
        selectionKey: selection.key,
        candidates: []
    }));
    const candidateGroupsByKey = new Map(
        candidateGroups.map((group) => [group.selectionKey, group])
    );
    const appendMeshCandidates = (result, mesh, candidateGroup = null) => {
        result.candidates.forEach((candidate) => {
            const count = nextCandidateCounts[candidate.type] || 0;
            const limit = SIMULATION_SNAP_MAX_PER_TYPE[candidate.type] || Infinity;
            if (count >= limit) return;
            const localPoint = new THREE.Vector3().fromArray(candidate.point);
            if (!Number.isFinite(localPoint.x) || !Number.isFinite(localPoint.y)
                || !Number.isFinite(localPoint.z)) return;
            nextCandidateCounts[candidate.type] = count + 1;
            const preparedCandidate = {
                type: candidate.type,
                mesh,
                localPoint
            };
            nextCandidates.push(preparedCandidate);
            candidateGroup?.candidates.push(preparedCandidate);
        });
    };
    const buildPromise = (async () => {
        await yieldToAnimationFrame();
        for (let meshIndex = 0; meshIndex < meshes.length; meshIndex += 1) {
            if (state.snapCandidateBuildSignature !== signature || !isSimulationSnapInteractionActive()) return;
            const mesh = meshes[meshIndex];
            if (!faceSelections.length) {
                if (isLazySimulationSnapMesh(mesh)) continue;
            }
            try {
                const meshFaceSelections = faceSelectionsByMesh.get(mesh.uuid) || [];
                if (meshFaceSelections.length) {
                    // Build each selected face independently. This preserves
                    // the normal one-face candidates before adding any
                    // multi-face combination candidates.
                    meshFaceSelections.forEach((selection) => {
                        try {
                            const result = buildSimulationSnapResultForMesh(mesh, false, {
                                triangleRanges: selection.triangleRanges
                            });
                            appendMeshCandidates(
                                result,
                                mesh,
                                candidateGroupsByKey.get(selection.key) || null
                            );
                        } catch (error) {
                            console.warn('Selected face snap candidate generation failed:', mesh.name, error);
                        }
                    });
                } else if (!faceSelections.length) {
                    const result = buildSimulationSnapResultForMesh(mesh, false);
                    appendMeshCandidates(result, mesh);
                }
            } catch (error) {
                console.warn('Snap candidate generation failed:', mesh.name, error);
            }
            if (meshIndex + 1 < meshes.length) await yieldToAnimationFrame();
        }
        if (state.snapCandidateBuildSignature !== signature || !isSimulationSnapInteractionActive()) return;
        try {
            const combinedCandidates = buildSimulationCombinedSnapCandidates(candidateGroups, faceSelections);
            combinedCandidates.forEach((candidate) => {
                const count = nextCandidateCounts[candidate.type] || 0;
                const limit = SIMULATION_SNAP_MAX_PER_TYPE[candidate.type] || Infinity;
                if (count >= limit) return;
                nextCandidateCounts[candidate.type] = count + 1;
                nextCandidates.push(candidate);
            });
        } catch (error) {
            // Combination snaps are additive. A malformed pair must not
            // remove valid endpoint/vertex/center candidates from either face.
            console.warn('Multi-face snap combination skipped:', error);
        }
        state.snapCandidates = nextCandidates;
        state.snapCandidateModelsSignature = signature;
        state.snapCandidatesReady = true;
        state.snapWorldIndex = null;
        state.snapWorldIndexSignature = '';
        try {
            updateSimulationSnapCandidateMarkers();
        } catch (error) {
            // Keep the prepared candidates usable for pointer snapping even
            // when the DOM marker layer cannot be refreshed in this frame.
            clearSimulationSnapCandidateMarkers();
            console.warn('Snap candidate marker refresh skipped:', error);
        }
    })();
    state.snapCandidateBuildPromise = buildPromise;
    try {
        await buildPromise;
    } finally {
        if (state.snapCandidateBuildPromise === buildPromise) state.snapCandidateBuildPromise = null;
    }
    return getSimulationSnapMeshes(scope);
}

function getPreparedSimulationSnapMeshes(scope = getSimulationSnapScope()) {
    const meshes = getSimulationSnapMeshes(scope);
    const faceSelections = scope === 'scene' && state.snapMoveMode
        ? getSimulationSnapFaceSelections() : [];
    const faceSignature = getSimulationSnapFaceSelectionSignature(faceSelections);
    const signature = `${scope}:${meshes.map((mesh) => `${mesh.uuid}:${mesh.geometry.uuid}`).join('|')}:${faceSignature}`;
    if (signature !== state.snapCandidateModelsSignature || !state.snapCandidatesReady) return [];
    return meshes;
}

/*
 * Candidate generation intentionally runs outside pointer events. Large STEP files
 * are split into several render meshes, allowing a frame between expensive chunks.
 */
function invalidateSimulationSnapCandidates() {
    state.snapCandidateBuildSignature = '';
    state.snapCandidateModelsSignature = '';
    state.snapCandidatesReady = false;
    state.snapCandidates = [];
    state.snapWorldIndex = null;
    state.snapWorldIndexSignature = '';
    state.snapLazyReadyMeshes.clear();
    state.snapLazyBuildPromises.clear();
    clearSimulationSnapCandidateMarkers();
}

function getSimulationSnapTriangleVertexIndices(geometry, triangleIndex) {
    const indexArray = geometry.index?.array;
    if (indexArray) {
        const offset = triangleIndex * 3;
        return [indexArray[offset], indexArray[offset + 1], indexArray[offset + 2]];
    }
    const offset = triangleIndex * 3;
    return [offset, offset + 1, offset + 2];
}

function getSimulationSnapFaceTriangleRanges(mesh, triangleIndex) {
    const brepFaces = getValidatedStepBrepFaces(mesh);
    if (brepFaces) {
        const faceIndex = brepFaces.findIndex((face) => (
            triangleIndex >= Number(face.first) && triangleIndex <= Number(face.last)
        ));
        if (faceIndex >= 0) {
            const face = brepFaces[faceIndex];
            return {
                faceIndex,
                key: `${mesh.uuid}:step-face:${faceIndex}`,
                triangleRanges: [{ first: Number(face.first), last: Number(face.last) }]
            };
        }
    }
    return {
        faceIndex: triangleIndex,
        key: `${mesh.uuid}:triangle:${triangleIndex}`,
        triangleRanges: [{ first: triangleIndex, last: triangleIndex }]
    };
}

function createSimulationSnapFaceOverlay(selection) {
    const geometry = selection?.mesh?.geometry;
    const position = geometry?.getAttribute('position');
    if (!geometry || !position || !selection?.triangleRanges?.length) return null;
    const vertices = [];
    selection.triangleRanges.forEach((range) => {
        for (let triangleIndex = range.first; triangleIndex <= range.last; triangleIndex += 1) {
            const indices = getSimulationSnapTriangleVertexIndices(geometry, triangleIndex);
            indices.forEach((vertexIndex) => {
                if (!Number.isInteger(vertexIndex) || vertexIndex < 0 || vertexIndex >= position.count) return;
                vertices.push(position.getX(vertexIndex), position.getY(vertexIndex), position.getZ(vertexIndex));
            });
        }
    });
    if (vertices.length < 9) return null;

    const overlayGeometry = new THREE.BufferGeometry();
    overlayGeometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    overlayGeometry.computeVertexNormals();
    const overlay = new THREE.Mesh(overlayGeometry, new THREE.MeshBasicMaterial({
        color: 0xfacc15,
        transparent: true,
        opacity: 0.2,
        depthWrite: false,
        side: THREE.DoubleSide
    }));
    overlay.name = 'Simulation Snap Selected Face';
    overlay.userData.simulationSnapFaceOverlay = true;
    overlay.renderOrder = 1000;
    overlay.frustumCulled = false;
    selection.mesh.add(overlay);
    return overlay;
}

function clearSimulationSnapFaceSelection({ invalidate = true } = {}) {
    const overlays = state.snapFaceOverlays.length
        ? state.snapFaceOverlays
        : (state.snapFaceOverlay ? [state.snapFaceOverlay] : []);
    overlays.forEach((overlay) => {
        overlay.removeFromParent();
        overlay.geometry?.dispose();
        overlay.material?.dispose();
    });
    state.snapFaceOverlays = [];
    state.snapFaceOverlay = null;
    state.snapFaceSelections = [];
    state.snapFaceSelection = null;
    clearSimulationSnapCandidateMarkers();
    if (invalidate) invalidateSimulationSnapCandidates();
}

function clearSimulationSnapCandidateMarkers() {
    state.snapCandidateMarkers.forEach((marker) => marker.remove());
    state.snapCandidateMarkers = [];
    state.snapDisplayedCandidates = [];
}

function setSimulationSnapFaceOverlaysVisible(visible) {
    state.snapFaceOverlays.forEach((overlay) => {
        overlay.visible = visible;
    });
}

function hideSimulationSnapCandidateMarkersForNavigation() {
    // Keep the DOM nodes so the next settled frame can reuse them, but do not
    // let the marker layer participate in layout/painting while OrbitControls
    // is producing camera-change events.
    state.snapCandidateMarkers.forEach((marker) => marker.classList.add('hidden'));
    state.snapDisplayedCandidates = [];
}

function createSimulationSnapCandidateMarker() {
    const marker = document.createElement('div');
    marker.className = 'simulation-snap-marker simulation-snap-candidate-marker';
    marker.setAttribute('aria-hidden', 'true');
    marker.innerHTML = '<span></span>';
    el.canvasContainer?.appendChild(marker);
    return marker;
}

function updateSimulationSnapCandidateMarkers() {
    // Projecting every candidate and doing depth tests while the camera is
    // moving was the main source of the large-model orbit/pan hitch. The
    // selected face remains intact; markers are rebuilt once navigation ends.
    if (state.viewNavigationActive) return;
    if (!state.snapMoveMode || !getSimulationSnapFaceSelections().length || !state.snapCandidatesReady
        || !el.canvasContainer || !state.renderer || !state.camera) {
        clearSimulationSnapCandidateMarkers();
        return;
    }
    const meshes = getSimulationSnapMeshes('scene');
    const bounds = state.renderer.domElement.getBoundingClientRect();
    if (!meshes.length || bounds.width <= 0 || bounds.height <= 0) {
        clearSimulationSnapCandidateMarkers();
        return;
    }
    state.camera.updateMatrixWorld(true);
    getSimulationSnapWorldIndex(meshes);
    // Selected-face candidates are intentional snap targets. Do not let the
    // model's depth occlusion hide them while snap-move mode is active; the
    // marker layer must keep priority over geometry behind the selected face.
    const visibilityMeshes = state.snapMoveMode || isLargeModelSnapPerformanceMode('scene')
        ? null
        : getAllSimulationSnapMeshes('scene');
    const candidates = [];
    const markerCells = new Map();
    const markerSpacing = state.largeModelPerformanceMode ? 12 : 7;
    const getMarkerCellKey = (x, y) => `${Math.floor(x / markerSpacing)}:${Math.floor(y / markerSpacing)}`;
    const isBetterMarker = (next, current) => (
        snapTypeInfo(next.candidate.type).priority < snapTypeInfo(current.candidate.type).priority
    );
    const projected = new THREE.Vector3();
    // Candidate generation follows geometry/topology order, which can put
    // thousands of endpoints ahead of the useful center candidates. Grouping
    // and ordering here makes centers visible on the settled frame instead of
    // waiting for the pointer to hover over their screen position.
    const candidatesByType = new Map();
    state.snapCandidates.forEach((candidate) => {
        const candidatesForType = candidatesByType.get(candidate.type) || [];
        candidatesForType.push(candidate);
        candidatesByType.set(candidate.type, candidatesForType);
    });
    const orderedCandidates = [];
    const orderedTypes = new Set();
    SIMULATION_SNAP_MARKER_TYPE_ORDER.forEach((type) => {
        orderedTypes.add(type);
        orderedCandidates.push(...(candidatesByType.get(type) || []));
    });
    candidatesByType.forEach((candidatesForType, type) => {
        if (!orderedTypes.has(type)) orderedCandidates.push(...candidatesForType);
    });
    let centerMarkerCount = 0;
    for (const candidate of orderedCandidates) {
        if (!candidate.mesh.visible || !candidate.snapWorldPoint) continue;
        const isCenterMarker = SIMULATION_SNAP_CENTER_MARKER_TYPES.has(candidate.type);
        if (isCenterMarker && centerMarkerCount >= MAX_VISIBLE_SIMULATION_SNAP_CENTER_MARKERS) continue;
        projected.copy(candidate.snapWorldPoint).project(state.camera);
        if (projected.z < -1 || projected.z > 1) continue;
        const screenX = (projected.x * 0.5 + 0.5) * bounds.width;
        const screenY = (-projected.y * 0.5 + 0.5) * bounds.height;
        if (screenX < -12 || screenX > bounds.width + 12
            || screenY < -12 || screenY > bounds.height + 12) continue;
        if (visibilityMeshes) {
            const visibilityCandidate = {
                ...candidate,
                worldPoint: candidate.snapWorldPoint
            };
            if (!isSimulationSnapCandidateVisible(visibilityCandidate, projected, visibilityMeshes)) continue;
        }
        const item = { candidate, screenX, screenY };
        const cellX = Math.floor(screenX / markerSpacing);
        const cellY = Math.floor(screenY / markerSpacing);
        let duplicateIndex = -1;
        for (let offsetX = -1; offsetX <= 1 && duplicateIndex < 0; offsetX += 1) {
            for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
                const cell = markerCells.get(`${cellX + offsetX}:${cellY + offsetY}`) || [];
                const match = cell.find((index) => (
                    Math.hypot(candidates[index].screenX - screenX, candidates[index].screenY - screenY)
                    <= markerSpacing
                ));
                if (match !== undefined) {
                    duplicateIndex = match;
                    break;
                }
            }
        }
        if (duplicateIndex >= 0) {
            if (isBetterMarker(item, candidates[duplicateIndex])) candidates[duplicateIndex] = item;
            continue;
        }
        const cellKey = getMarkerCellKey(screenX, screenY);
        const cell = markerCells.get(cellKey) || [];
        cell.push(candidates.length);
        markerCells.set(cellKey, cell);
        candidates.push(item);
        if (isCenterMarker) centerMarkerCount += 1;
        if (candidates.length >= MAX_VISIBLE_SIMULATION_SNAP_MARKERS) break;
    }
    state.snapDisplayedCandidates = candidates.map(({ candidate }) => candidate);
    while (state.snapCandidateMarkers.length < candidates.length) {
        state.snapCandidateMarkers.push(createSimulationSnapCandidateMarker());
    }
    state.snapCandidateMarkers.forEach((marker, index) => {
        const item = candidates[index];
        marker.classList.toggle('hidden', !item);
        if (!item) return;
        const info = snapTypeInfo(item.candidate.type);
        marker.style.left = `${item.screenX}px`;
        marker.style.top = `${item.screenY}px`;
        marker.dataset.snapType = item.candidate.type;
        marker.style.setProperty(
            '--simulation-snap-camera-scale',
            el.snapMarker?.style.getPropertyValue('--simulation-snap-camera-scale') || '1'
        );
        const symbol = marker.querySelector('span');
        if (symbol) symbol.textContent = info.symbol;
    });
}

function pickSimulationSnapFaceAtPointer(pointerEvent) {
    const meshes = getAllSimulationSnapMeshes('scene');
    if (!meshes.length) return null;
    const bounds = state.renderer.domElement.getBoundingClientRect();
    if (bounds.width <= 0 || bounds.height <= 0) return null;
    const pointer = new THREE.Vector2(
        ((pointerEvent.clientX - bounds.left) / bounds.width) * 2 - 1,
        -((pointerEvent.clientY - bounds.top) / bounds.height) * 2 + 1
    );
    state.camera.updateMatrixWorld(true);
    state.snapVisibilityRaycaster.setFromCamera(pointer, state.camera);
    const hit = state.snapVisibilityRaycaster.intersectObjects(meshes, false)[0];
    if (!hit?.object || !Number.isInteger(hit.faceIndex)) return null;
    const face = getSimulationSnapFaceTriangleRanges(hit.object, hit.faceIndex);
    return {
        mesh: hit.object,
        point: hit.point.clone(),
        faceIndex: face.faceIndex,
        triangleIndex: hit.faceIndex,
        key: face.key,
        triangleRanges: face.triangleRanges
    };
}

function handleSimulationSnapMoveClick(event) {
    const selectedFaces = getSimulationSnapFaceSelections();
    if (event.shiftKey) {
        const selection = pickSimulationSnapFaceAtPointer(event);
        if (!selection) {
            setStatus('스냅할 3D 모델의 면을 클릭하세요.', '#f59e0b');
            return;
        }
        event.preventDefault();
        event.stopPropagation();
        selectSimulationSnapFace(selection, { additive: true });
        return;
    }

    const snap = selectedFaces.length ? findSimulationSnapAtPointer(event) : null;
    if (snap) {
        event.preventDefault();
        event.stopPropagation();
        if (moveRobotTcpToSimulationSnap(snap)) showSimulationSnapMarker(snap);
        return;
    }

    const selection = pickSimulationSnapFaceAtPointer(event);
    if (selection && !selectedFaces.some((face) => face.key === selection.key)) {
        event.preventDefault();
        event.stopPropagation();
        selectSimulationSnapFace(selection);
        return;
    }
    setStatus(
        selection ? '선택된 면의 스냅 후보를 가리켜 주세요.' : '스냅할 3D 모델의 면을 클릭하세요.',
        '#f59e0b'
    );
}

function selectSimulationSnapFace(selection, { additive = false } = {}) {
    const nextSelection = cloneSimulationSnapFaceSelection(selection);
    if (!nextSelection) return false;
    const currentSelections = cloneSimulationSnapFaceSelections();
    const nextSelections = additive ? currentSelections : [];
    const existingIndex = nextSelections.findIndex((face) => face.key === nextSelection.key);
    if (additive && existingIndex >= 0) nextSelections.splice(existingIndex, 1);
    else nextSelections.push(nextSelection);
    if (!nextSelections.length) {
        clearSimulationSnapFaceSelection();
        setStatus('스냅할 3D 모델의 면을 클릭하세요.', '#60a5fa');
        return false;
    }

    clearSimulationSnapFaceSelection({ invalidate: false });
    state.snapFaceSelections = nextSelections;
    state.snapFaceSelection = nextSelections[nextSelections.length - 1];
    state.snapFaceOverlays = nextSelections
        .map((face) => createSimulationSnapFaceOverlay(face))
        .filter(Boolean);
    state.snapFaceOverlay = state.snapFaceOverlays[0] || null;
    invalidateSimulationSnapCandidates();
    hideSimulationSnapMarker();
    setStatus('면을 선택했습니다. 선택된 면의 스냅 후보를 계산하는 중입니다...', '#f59e0b');
    const selectionSignature = getSimulationSnapFaceSelectionSignature(nextSelections);
    void buildSimulationSnapCandidates('scene').then(() => {
        if (!state.snapMoveMode || getSimulationSnapFaceSelectionSignature() !== selectionSignature) return;
        setStatus('선택한 면의 스냅 후보를 클릭하세요.', '#60a5fa');
    }).catch((error) => {
        console.warn('Selected face snap candidate generation failed:', error);
        if (getSimulationSnapFaceSelectionSignature() === selectionSignature) {
            // Candidate generation is asynchronous. A transient failure or a
            // stale mesh must not erase the user's face selection; keep the
            // overlays and allow a later rebuild after the scene settles.
            invalidateSimulationSnapCandidates();
            setStatus('선택한 면의 스냅 후보를 다시 계산해야 합니다. 면 선택은 유지됩니다.', '#f59e0b');
        }
    });
    return true;
}

function snapTypeInfo(type) {
    return SNAP_TYPES[type] || SNAP_TYPES.vertex;
}

function compareSimulationSnapCandidates(left, right) {
    const pixelDifference = left.pixelDistance - right.pixelDistance;
    const priorityDifference = snapTypeInfo(left.type).priority - snapTypeInfo(right.type).priority;
    if (priorityDifference && Math.abs(pixelDifference) <= SIMULATION_SNAP_OVERLAP_TOLERANCE_PX) {
        return priorityDifference;
    }
    return pixelDifference || priorityDifference || left.cameraDistance - right.cameraDistance;
}

function isSimulationSnapPicking() {
    return state.snapMoveMode || state.tcpSnapMode || (
        state.zeroPointEdit.active && state.zeroPointEdit.snapMode
    );
}

function isSimulationSnapInteractionActive() {
    return isSimulationSnapPicking() && !state.viewNavigationActive;
}

function beginSimulationViewNavigation() {
    if (state.viewNavigationActive) return;
    state.viewNavigationActive = true;
    // Camera movement can generate a pointermove for every orbit/pan step.
    // Cancel any pending snap work before those events reach the snap picker.
    state.snapCandidateBuildSignature = '';
    hideSimulationSnapMarker();
    hideSimulationSnapCandidateMarkersForNavigation();
    setSimulationSnapFaceOverlaysVisible(false);
}

function endSimulationViewNavigation() {
    if (!state.viewNavigationActive) return;
    state.viewNavigationActive = false;
    setSimulationSnapFaceOverlaysVisible(true);
    if (!isSimulationSnapPicking()) return;
    if (state.snapCandidatesReady) {
        requestRender();
        scheduleSimulationSnapPreview();
        return;
    }

    // If navigation interrupted candidate preparation, resume it after the
    // controls release without doing any work inside the camera gesture.
    void buildSimulationSnapCandidates(getSimulationSnapScope()).then(() => {
        requestRender();
        scheduleSimulationSnapPreview();
    }).catch((error) => {
        console.warn('Snap candidate generation resume failed:', error);
    });
}

function isTcpMultiPointSnapMode() {
    return state.tcpSnapMode && state.tcpSnapType === 'multi-point-center';
}

function setTcpSnapReadout(message) {
    state.tcpSnapReadoutMessage = message;
    if (!el.tcpSnapReadout) return;
    el.tcpSnapReadout.dataset.sourceMessage = message;
    el.tcpSnapReadout.textContent = uiText(message);
}

function formatSimulationSnapPoint(point) {
    return `X ${point.x.toFixed(3)} · Y ${point.y.toFixed(3)} · Z ${point.z.toFixed(3)} mm`;
}

function resetTcpSnapPoints() {
    state.tcpSnapPoints = [];
    updateTcpMultiCenterControls();
}

function getTcpSnapCenter() {
    if (!state.tcpSnapPoints.length) return null;
    const center = new THREE.Vector3();
    state.tcpSnapPoints.forEach((point) => center.add(point));
    return center.multiplyScalar(1 / state.tcpSnapPoints.length);
}

function updateTcpMultiCenterControls() {
    const multi = isTcpMultiPointSnapMode();
    const count = state.tcpSnapPoints.length;
    if (el.tcpMultiCenterControls) el.tcpMultiCenterControls.classList.toggle('hidden', !multi);
    if (el.tcpMultiCenterCount) {
        el.tcpMultiCenterCount.textContent = `${uiText('다중 점 선택')} ${count}/4`;
    }
    if (el.btnTcpMultiCenterApply) el.btnTcpMultiCenterApply.disabled = !multi || count < 2 || count > 4;
    if (el.btnTcpMultiCenterReset) el.btnTcpMultiCenterReset.disabled = !multi || count === 0;
}

function updateTcpSnapUi() {
    const available = Boolean(state.activeArticulatedModel?.userData?.tcpFrame) && !isMotionActive();
    if (!available && state.tcpSnapMode) {
        state.tcpSnapMode = false;
        invalidateSimulationSnapCandidates();
        resetTcpSnapPoints();
        hideSimulationSnapMarker();
        resetSimulationSnapMarkerCameraScale();
    }
    if (el.btnTcpSnap) {
        el.btnTcpSnap.disabled = !available;
        el.btnTcpSnap.classList.toggle('active', state.tcpSnapMode);
        el.btnTcpSnap.setAttribute('aria-pressed', String(state.tcpSnapMode));
        el.btnTcpSnap.title = uiText(state.tcpSnapMode ? 'TCP 위치 스냅 종료' : 'TCP 위치 스냅');
    }
    if (el.tcpSnapType) el.tcpSnapType.disabled = !available;
    if (el.tcpSnapRadius) el.tcpSnapRadius.disabled = !available;
    el.canvasContainer?.classList.toggle('tcp-snap-picking', state.tcpSnapMode);
    updateTcpMultiCenterControls();
}

function setTcpSnapMode(enabled) {
    state.tcpSnapMode = Boolean(enabled);
    if (state.tcpSnapMode) {
        state.snapMoveMode = false;
        clearSimulationSnapFaceSelection({ invalidate: false });
        state.snapLastPointerEvent = null;
        resetTcpSnapPoints();
        captureSimulationSnapMarkerReferenceDistance();
        setStatus('스냅 후보를 계산하는 중입니다...', '#f59e0b');
        updateSimulationSnapButton();
        updateTcpSnapUi();
        void buildSimulationSnapCandidates('tool')
            .then(() => {
                if (state.tcpSnapMode) {
                    setTcpSnapReadout('3D 모델링의 스냅 지점을 클릭하세요.');
                    setStatus('3D 모델링의 스냅 지점을 클릭하세요.', '#60a5fa');
                }
            })
            .catch((error) => {
                console.warn('TCP snap candidate generation failed:', error);
                if (state.tcpSnapMode) {
                    setTcpSnapMode(false);
                    setStatus('선택 가능한 스냅 지점을 가리켜 주세요.', '#ef4444');
                }
            });
    } else {
        invalidateSimulationSnapCandidates();
        resetTcpSnapPoints();
        hideSimulationSnapMarker();
        resetSimulationSnapMarkerCameraScale();
        setTcpSnapReadout('3D 모델링의 스냅 지점을 클릭하세요.');
        updateTcpSnapUi();
    }
}

function toggleTcpSnapMode() {
    if (isMotionActive()) return;
    if (!state.activeArticulatedModel?.userData?.tcpFrame) {
        setStatus('스냅 이동할 로봇을 먼저 선택하세요.', '#ef4444');
        return;
    }
    if (!state.tcpSnapMode && getSimulationSnapMeshes('tool').length === 0) {
        setStatus('TCP 스냅할 Tool 모델을 먼저 지정하세요.', '#f59e0b');
        return;
    }
    setTcpSnapMode(!state.tcpSnapMode);
}

function hideSimulationSnapMarker() {
    state.snapHover = null;
    state.snapLastPointerEvent = null;
    if (state.snapPointerMoveFrame !== null) {
        cancelAnimationFrame(state.snapPointerMoveFrame);
        state.snapPointerMoveFrame = null;
    }
    el.snapMarker?.classList.add('hidden');
}

function updateSimulationSnapMarkerCameraScale() {
    if (!isSimulationSnapInteractionActive()) return;
    if (!el.snapMarker || !state.camera || !state.controls) return;
    const cameraZoom = Math.max(state.camera.zoom || 1, Number.EPSILON);
    const cameraDistance = state.camera.position.distanceTo(state.controls.target) / cameraZoom;
    const referenceDistance = state.snapMarkerReferenceDistance;
    if (!Number.isFinite(cameraDistance) || !Number.isFinite(referenceDistance) || referenceDistance <= 0) return;

    const scale = THREE.MathUtils.clamp(
        Math.sqrt(cameraDistance / referenceDistance),
        SNAP_MARKER_CAMERA_SCALE.min,
        SNAP_MARKER_CAMERA_SCALE.max
    );
    el.snapMarker.style.setProperty('--simulation-snap-camera-scale', scale.toFixed(3));
}

function captureSimulationSnapMarkerReferenceDistance() {
    if (!state.camera || !state.controls) return;
    state.snapMarkerReferenceDistance = state.camera.position.distanceTo(state.controls.target)
        / Math.max(state.camera.zoom || 1, Number.EPSILON);
    updateSimulationSnapMarkerCameraScale();
}

function resetSimulationSnapMarkerCameraScale() {
    state.snapMarkerReferenceDistance = null;
    el.snapMarker?.style.setProperty('--simulation-snap-camera-scale', '1');
}

function simulationSnapMeshKey(mesh) {
    return `${mesh.uuid}:${mesh.geometry.uuid}`;
}

function scheduleLazySimulationSnapBuild(mesh) {
    const key = simulationSnapMeshKey(mesh);
    if (state.snapLazyReadyMeshes.has(key) || state.snapLazyBuildPromises.has(key)) return;
    const buildSignature = state.snapCandidateModelsSignature;
    const promise = (async () => {
        await yieldToAnimationFrame();
        if (state.snapCandidateModelsSignature !== buildSignature || !isSimulationSnapInteractionActive()) return;
        const result = buildSimulationSnapResultForMesh(mesh, true);
        if (state.snapCandidateModelsSignature !== buildSignature) return;
        const counts = {};
        state.snapCandidates.forEach((candidate) => {
            counts[candidate.type] = (counts[candidate.type] || 0) + 1;
        });
        result.candidates.forEach((candidate) => {
            const count = counts[candidate.type] || 0;
            const limit = SIMULATION_SNAP_MAX_PER_TYPE[candidate.type] || Infinity;
            if (count >= limit) return;
            counts[candidate.type] = count + 1;
            state.snapCandidates.push({
                type: candidate.type,
                mesh,
                localPoint: new THREE.Vector3().fromArray(candidate.point)
            });
        });
        state.snapLazyReadyMeshes.add(key);
        state.snapWorldIndex = null;
        state.snapWorldIndexSignature = '';
        const pointerEvent = state.snapLastPointerEvent;
        if (pointerEvent && isSimulationSnapInteractionActive()) {
            requestAnimationFrame(() => {
                if (isSimulationSnapInteractionActive()) {
                    showSimulationSnapMarker(findSimulationSnapAtPointer(pointerEvent));
                }
            });
        }
    })().catch((error) => {
        if (state.snapCandidateModelsSignature === buildSignature) {
            state.snapLazyReadyMeshes.add(key);
        }
        console.warn('Large-model snap chunk generation failed:', mesh.name, error);
    }).finally(() => {
        if (state.snapLazyBuildPromises.get(key) === promise) {
            state.snapLazyBuildPromises.delete(key);
        }
    });
    state.snapLazyBuildPromises.set(key, promise);
}

function getLazySimulationSnapMeshAtPointer(pointerX, pointerY, bounds, meshes) {
    const lazyMeshes = meshes.filter(isLazySimulationSnapMesh);
    if (!lazyMeshes.length || bounds.width <= 0 || bounds.height <= 0) return null;
    const pointer = new THREE.Vector2(
        (pointerX / bounds.width) * 2 - 1,
        -(pointerY / bounds.height) * 2 + 1
    );
    state.snapVisibilityRaycaster.setFromCamera(pointer, state.camera);
    return state.snapVisibilityRaycaster.intersectObjects(lazyMeshes, false)[0]?.object || null;
}

function isSimulationSnapCandidateVisible(candidate, projected, meshes) {
    state.snapVisibilityRaycaster.setFromCamera(new THREE.Vector2(projected.x, projected.y), state.camera);
    const frontHit = state.snapVisibilityRaycaster.intersectObjects(meshes, false)[0] || null;
    if (!frontHit) return true;
    const candidateOffset = candidate.worldPoint.clone().sub(state.snapVisibilityRaycaster.ray.origin);
    const candidateDistance = candidateOffset.dot(state.snapVisibilityRaycaster.ray.direction);
    if (!Number.isFinite(candidateDistance) || candidateDistance <= 0) return false;
    const viewportHeight = Math.max(state.renderer.domElement.clientHeight, 1);
    const worldUnitsPerPixel = (
        2 * candidateDistance * Math.tan(THREE.MathUtils.degToRad(state.camera.fov * 0.5))
    ) / viewportHeight;
    return candidateDistance <= frontHit.distance + Math.max(worldUnitsPerPixel * 2.5, 0.001);
}

function simulationSnapMatrixSignature(matrix) {
    return matrix.elements.join(',');
}

function getSimulationSnapWorldIndexSignature(meshes) {
    return [
        state.snapCandidateModelsSignature,
        ...meshes.map((mesh) => `${mesh.uuid}:${simulationSnapMatrixSignature(mesh.matrixWorld)}`)
    ].join('|');
}

function buildSimulationSnapWorldOctree(candidates, depth = 0) {
    const bounds = new THREE.Box3();
    candidates.forEach((candidate) => bounds.expandByPoint(candidate.snapWorldPoint));
    const sphere = new THREE.Sphere();
    bounds.getBoundingSphere(sphere);

    if (candidates.length <= SNAP_WORLD_INDEX_LEAF_SIZE || depth >= SNAP_WORLD_INDEX_MAX_DEPTH) {
        return {
            bounds,
            center: sphere.center,
            radius: sphere.radius,
            candidates,
            children: null
        };
    }

    const center = sphere.center;
    const buckets = Array.from({ length: 8 }, () => []);
    candidates.forEach((candidate) => {
        const point = candidate.snapWorldPoint;
        const bucketIndex = (point.x >= center.x ? 1 : 0)
            | (point.y >= center.y ? 2 : 0)
            | (point.z >= center.z ? 4 : 0);
        buckets[bucketIndex].push(candidate);
    });
    const nonEmptyBuckets = buckets.filter((bucket) => bucket.length > 0);
    if (nonEmptyBuckets.length <= 1) {
        return {
            bounds,
            center: sphere.center,
            radius: sphere.radius,
            candidates,
            children: null
        };
    }

    return {
        bounds,
        center: sphere.center,
        radius: sphere.radius,
        candidates: null,
        children: nonEmptyBuckets.map((bucket) => buildSimulationSnapWorldOctree(bucket, depth + 1))
    };
}

function getSimulationSnapWorldIndex(meshes) {
    meshes.forEach((mesh) => mesh.updateWorldMatrix?.(true, false));
    const signature = getSimulationSnapWorldIndexSignature(meshes);
    if (state.snapWorldIndex && state.snapWorldIndexSignature === signature) {
        return state.snapWorldIndex;
    }

    const candidates = [];
    state.snapCandidates.forEach((candidate) => {
        if (!candidate.mesh.visible) return;
        candidate.snapWorldPoint = (candidate.snapWorldPoint || new THREE.Vector3())
            .copy(candidate.localPoint)
            .applyMatrix4(candidate.mesh.matrixWorld);
        candidates.push(candidate);
    });

    state.snapWorldIndex = {
        signature,
        root: candidates.length ? buildSimulationSnapWorldOctree(candidates) : null
    };
    state.snapWorldIndexSignature = signature;
    return state.snapWorldIndex;
}

function isSimulationSnapOctreeNodeNearPointer(node, bounds, pointerX, pointerY, radius) {
    const cameraPoint = node.center.clone().applyMatrix4(state.camera.matrixWorldInverse);
    const depth = -cameraPoint.z;
    if (depth + node.radius <= state.camera.near || depth - node.radius >= state.camera.far) return false;
    if (depth <= node.radius) return true;

    const projected = node.center.clone().project(state.camera);
    if (!Number.isFinite(projected.x) || !Number.isFinite(projected.y) || !Number.isFinite(projected.z)) return true;
    const focalPixels = bounds.height * Math.max(state.camera.zoom || 1, Number.EPSILON)
        / (2 * Math.tan(THREE.MathUtils.degToRad(state.camera.fov * 0.5)));
    const screenRadius = node.radius * focalPixels
        / Math.max(depth - node.radius, Number.EPSILON) + radius;
    const screenX = (projected.x * 0.5 + 0.5) * bounds.width;
    const screenY = (-projected.y * 0.5 + 0.5) * bounds.height;
    return screenX >= pointerX - screenRadius
        && screenX <= pointerX + screenRadius
        && screenY >= pointerY - screenRadius
        && screenY <= pointerY + screenRadius;
}

// Kept as the old entry point for callers/tests; the index is now camera-independent.
function getSimulationSnapScreenIndex(meshes, bounds) {
    return getSimulationSnapWorldIndex(meshes);
}

function getSimulationSnapCandidatesNearPointer(meshes, bounds, pointerX, pointerY, radius) {
    const nearby = [];
    const index = getSimulationSnapScreenIndex(meshes, bounds);
    if (!index.root) return nearby;

    const projected = new THREE.Vector3();
    const visit = (node) => {
        if (!isSimulationSnapOctreeNodeNearPointer(node, bounds, pointerX, pointerY, radius)) return;
        if (node.children) {
            node.children.forEach(visit);
            return;
        }
        node.candidates.forEach((candidate) => {
            if (!candidate.mesh.visible || !candidate.snapWorldPoint) return;
            projected.copy(candidate.snapWorldPoint).project(state.camera);
            if (projected.z < -1 || projected.z > 1) return;
            const screenX = (projected.x * 0.5 + 0.5) * bounds.width;
            const screenY = (-projected.y * 0.5 + 0.5) * bounds.height;
            const pixelDistance = Math.hypot(screenX - pointerX, screenY - pointerY);
            if (pixelDistance <= radius) nearby.push(candidate);
        });
    };
    visit(index.root);
    return nearby;
}

function findSimulationSnapAtPointer(pointerEvent) {
    if (!isSimulationSnapInteractionActive()) return null;
    const meshes = getPreparedSimulationSnapMeshes();
    if (!meshes.length) return null;
    const visibilityMeshes = state.snapMoveMode
        ? getAllSimulationSnapMeshes('scene')
        : meshes;
    state.camera.updateMatrixWorld(true);
    const bounds = state.renderer.domElement.getBoundingClientRect();
    const pointerX = pointerEvent.clientX - bounds.left;
    const pointerY = pointerEvent.clientY - bounds.top;
    const lazyMesh = getLazySimulationSnapMeshAtPointer(pointerX, pointerY, bounds, meshes);
    if (lazyMesh) {
        const lazyKey = simulationSnapMeshKey(lazyMesh);
        if (!state.snapLazyReadyMeshes.has(lazyKey)) {
            scheduleLazySimulationSnapBuild(lazyMesh);
            return null;
        }
    }
    if (!state.snapCandidates.length) return null;
    const tcpPicking = state.tcpSnapMode;
    const zeroPointPicking = state.zeroPointEdit.active && state.zeroPointEdit.snapMode;
    const requestedType = zeroPointPicking ? state.zeroPointEdit.snapType : state.tcpSnapType;
    const requiredType = (tcpPicking || zeroPointPicking)
        && requestedType !== 'auto' && requestedType !== 'multi-point-center'
        ? requestedType
        : null;
    const snapRadius = zeroPointPicking
        ? state.zeroPointEdit.snapRadiusPx
        : tcpPicking ? state.tcpSnapRadiusPx : SNAP_RADIUS_PX;
    const nearby = [];
    const candidatesNearPointer = getSimulationSnapCandidatesNearPointer(
        meshes,
        bounds,
        pointerX,
        pointerY,
        snapRadius
    );
    candidatesNearPointer.forEach((candidate) => {
        if (!candidate.mesh.visible) return;
        if (requiredType && candidate.type !== requiredType) return;
        const worldPoint = candidate.snapWorldPoint
            ? candidate.snapWorldPoint.clone()
            : candidate.localPoint.clone().applyMatrix4(candidate.mesh.matrixWorld);
        const projected = worldPoint.clone().project(state.camera);
        if (projected.z < -1 || projected.z > 1) return;
        const screenX = (projected.x * 0.5 + 0.5) * bounds.width;
        const screenY = (-projected.y * 0.5 + 0.5) * bounds.height;
        const pixelDistance = Math.hypot(screenX - pointerX, screenY - pointerY);
        if (pixelDistance > snapRadius) return;
        nearby.push({
            ...candidate,
            sourceCandidate: candidate,
            worldPoint,
            projected,
            screenX,
            screenY,
            pixelDistance,
            cameraDistance: state.camera.position.distanceTo(worldPoint)
        });
    });
    nearby.sort(requiredType
        ? (left, right) => left.pixelDistance - right.pixelDistance || left.cameraDistance - right.cameraDistance
        : compareSimulationSnapCandidates);
    if (state.snapMoveMode) {
        const displayedCandidate = nearby.find((candidate) => (
            state.snapDisplayedCandidates.includes(candidate.sourceCandidate)
        ));
        if (displayedCandidate) return displayedCandidate;
        // A candidate that was not persistently visible can still become the
        // active snap when the pointer is directly over its projected point.
        // showSimulationSnapMarker() then makes the priority explicit before
        // the user clicks, even when another model is in front of it.
        return nearby[0] || null;
    }
    return nearby.find((candidate) => isSimulationSnapCandidateVisible(
        candidate,
        candidate.projected,
        visibilityMeshes
    )) || null;
}

function showSimulationSnapMarker(snap) {
    if (!snap || !el.snapMarker || !isSimulationSnapInteractionActive()) {
        hideSimulationSnapMarker();
        return;
    }
    state.snapHover = snap;
    const info = snapTypeInfo(snap.type);
    el.snapMarker.style.left = `${snap.screenX}px`;
    el.snapMarker.style.top = `${snap.screenY}px`;
    el.snapMarker.classList.toggle('label-left', snap.screenX > el.canvasContainer.clientWidth - 190);
    el.snapMarker.dataset.snapType = snap.type;
    const symbol = el.snapMarker.querySelector('span');
    if (symbol) symbol.textContent = info.symbol;
    if (el.snapLabel) {
        el.snapLabel.textContent = `${uiText(info.label)} · X ${snap.worldPoint.x.toFixed(3)}, Y ${snap.worldPoint.y.toFixed(3)}, Z ${snap.worldPoint.z.toFixed(3)}`;
    }
    el.snapMarker.classList.remove('hidden');
}

function handleSimulationSnapPointerMove(event) {
    if (!isSimulationSnapInteractionActive()) return;
    state.snapLastPointerEvent = { clientX: event.clientX, clientY: event.clientY };
    scheduleSimulationSnapPreview();
}

function scheduleSimulationSnapPreview() {
    if (!isSimulationSnapInteractionActive()
        || !state.snapLastPointerEvent
        || state.snapPointerMoveFrame !== null) return;
    state.snapPointerMoveFrame = requestAnimationFrame(() => {
        state.snapPointerMoveFrame = null;
        const pointerEvent = state.snapLastPointerEvent;
        if (pointerEvent && isSimulationSnapInteractionActive()) {
            showSimulationSnapMarker(findSimulationSnapAtPointer(pointerEvent));
        }
    });
}

function applyTcpSnapPoint(worldPoint, selectedLabelKey = '스냅') {
    const robot = state.activeArticulatedModel;
    const flangeFrame = getRobotToolMountFrame(robot);
    if (!robot?.userData?.tcpFrame || !flangeFrame) return false;
    const localPoint = flangeFrame.worldToLocal(worldPoint.clone());
    ['x', 'y', 'z'].forEach((axis) => {
        const input = el.tcpOffsetInputs[axis];
        if (input) input.value = Number(localPoint[axis].toFixed(3));
    });
    updateTcpProfileLive();
    setTcpSnapMode(false);
    setTcpProfileStatus('TCP 위치를 스냅했습니다. 적용을 눌러 저장하세요.', 'success');
    setStatus('{label} TCP 위치 스냅', '#22c55e', {
        label: uiText(selectedLabelKey)
    });
    return true;
}

function handleTcpSnapSelection(snap) {
    if (!snap) return false;
    if (!isTcpMultiPointSnapMode()) {
        return applyTcpSnapPoint(snap.worldPoint, snapTypeInfo(snap.type).label);
    }
    if (state.tcpSnapPoints.length >= 4) {
        setStatus('최대 4개까지 선택할 수 있습니다.', '#f59e0b');
        return false;
    }
    const duplicateTolerance = 1e-4;
    if (state.tcpSnapPoints.some((point) => point.distanceTo(snap.worldPoint) <= duplicateTolerance)) {
        setStatus('중복된 스냅 점입니다.', '#f59e0b');
        return false;
    }
    state.tcpSnapPoints.push(snap.worldPoint.clone());
    updateTcpMultiCenterControls();
    const center = getTcpSnapCenter();
    setTcpSnapReadout(center && state.tcpSnapPoints.length >= 2
        ? `${uiText('다중 점 중심점')} · ${formatSimulationSnapPoint(center)}`
        : `${uiText('다중 점 선택')} ${state.tcpSnapPoints.length}/4 · ${uiText('스냅 점 2~4개를 선택하세요.')}`);
    setStatus('{count} 다중 점 선택', '#60a5fa', {
        count: `${state.tcpSnapPoints.length}/4`
    });
    return true;
}

function applyTcpMultiPointCenter() {
    if (!isTcpMultiPointSnapMode() || state.tcpSnapPoints.length < 2) return;
    const center = getTcpSnapCenter();
    if (center) applyTcpSnapPoint(center, '다중 점 중심점');
}

function isZeroPointMultiPointSnapMode() {
    return state.zeroPointEdit.active && state.zeroPointEdit.snapType === 'multi-point-center';
}

function readZeroPointSnapType() {
    return el.zeroPointSnapType?.selectedOptions?.[0]?.dataset.zeroSnapType
        || state.zeroPointEdit.snapType
        || 'auto';
}

function setZeroPointSnapReadout(message) {
    state.zeroPointEdit.snapReadoutMessage = message;
    if (!el.zeroPointSnapReadout) return;
    el.zeroPointSnapReadout.dataset.sourceMessage = message;
    el.zeroPointSnapReadout.textContent = uiText(message);
}

function resetZeroPointSnapPoints() {
    state.zeroPointEdit.snapPoints = [];
    updateZeroPointMultiCenterControls();
}

function updateZeroPointMultiCenterControls() {
    const multi = isZeroPointMultiPointSnapMode();
    const count = state.zeroPointEdit.snapPoints.length;
    el.zeroPointMultiCenterControls?.classList.toggle('hidden', !multi);
    if (el.zeroPointMultiCenterCount) {
        el.zeroPointMultiCenterCount.textContent = `${uiText('다중 점 선택')} ${count}/4`;
    }
    if (el.btnZeroPointMultiCenterApply) {
        el.btnZeroPointMultiCenterApply.disabled = !multi || count < 2 || count > 4;
    }
    if (el.btnZeroPointMultiCenterReset) {
        el.btnZeroPointMultiCenterReset.disabled = !multi || count === 0;
    }
}

function getZeroPointSnapCenter() {
    if (!state.zeroPointEdit.snapPoints.length) return null;
    const center = new THREE.Vector3();
    state.zeroPointEdit.snapPoints.forEach((point) => center.add(point));
    return center.multiplyScalar(1 / state.zeroPointEdit.snapPoints.length);
}

function getZeroPointRotationQuaternion() {
    return new THREE.Quaternion().setFromEuler(new THREE.Euler(
        THREE.MathUtils.degToRad(state.zeroPointEdit.rotationDegrees.x),
        THREE.MathUtils.degToRad(state.zeroPointEdit.rotationDegrees.y),
        THREE.MathUtils.degToRad(state.zeroPointEdit.rotationDegrees.z),
        'XYZ'
    )).normalize();
}

function updateZeroPointEditorInputs() {
    const { origin, rotationDegrees } = state.zeroPointEdit;
    ['x', 'y', 'z'].forEach((axis) => {
        const originInput = el.zeroPointOriginInputs[axis];
        const rotationInput = el.zeroPointRotationInputs[axis];
        if (originInput && originInput !== document.activeElement) {
            originInput.value = formatTransformNumber(origin[axis]);
        }
        if (rotationInput && rotationInput !== document.activeElement) {
            rotationInput.value = formatTransformNumber(normalizeDegrees(rotationDegrees[axis]));
        }
    });
}

function updateZeroPointAxisDirections() {
    const quaternion = state.zeroPointEdit.frame?.quaternion || new THREE.Quaternion();
    const directions = {
        x: new THREE.Vector3(1, 0, 0).applyQuaternion(quaternion),
        y: new THREE.Vector3(0, 1, 0).applyQuaternion(quaternion),
        z: new THREE.Vector3(0, 0, 1).applyQuaternion(quaternion)
    };
    Object.entries(directions).forEach(([axis, direction]) => {
        const output = el.zeroPointAxisDirections?.querySelector(`[data-zero-axis-direction="${axis}"]`);
        if (output) output.textContent = direction.toArray().map((value) => value.toFixed(3)).join(', ');
    });
}

function captureZeroPointModelState(model) {
    if (!model) return null;
    if (model.matrixAutoUpdate !== false) model.updateMatrix();
    return {
        position: model.position.clone(),
        quaternion: model.quaternion.clone(),
        scale: model.scale.clone(),
        matrix: model.matrix.toArray(),
        matrixAutoUpdate: model.matrixAutoUpdate !== false,
        childTransforms: [...model.children].map((child) => {
            if (child.matrixAutoUpdate !== false) child.updateMatrix();
            return {
                child,
                matrix: child.matrix.toArray(),
                matrixAutoUpdate: child.matrixAutoUpdate !== false
            };
        })
    };
}

function restoreZeroPointModelState(model, snapshot, invalidate = true) {
    if (!model || !snapshot) return;
    model.position.copy(snapshot.position);
    model.quaternion.copy(snapshot.quaternion);
    model.scale.copy(snapshot.scale);
    model.matrixAutoUpdate = snapshot.matrixAutoUpdate !== false;
    if (model.matrixAutoUpdate) model.updateMatrix();
    else model.matrix.fromArray(snapshot.matrix);
    snapshot.childTransforms.forEach(({ child, matrix, matrixAutoUpdate }) => {
        if (!child || !model.children.includes(child)) return;
        child.matrix.fromArray(matrix);
        if (matrixAutoUpdate === false) {
            child.matrixAutoUpdate = false;
            child.matrixWorldNeedsUpdate = true;
        } else {
            child.matrix.decompose(child.position, child.quaternion, child.scale);
            child.matrixAutoUpdate = true;
        }
    });
    model.updateMatrixWorld(true);
    if (invalidate) invalidateSimulationSnapCandidates();
}

function applyZeroPointModelPreview() {
    const edit = state.zeroPointEdit;
    if (!edit.active || !edit.model || !edit.baseModelState) return;
    restoreZeroPointModelState(edit.model, edit.baseModelState, false);
    applyModelZeroPointFrame(edit.model, edit.origin, edit.rotationDegrees);
}

function updateZeroPointCurrentReadout(worldPosition) {
    if (!el.zeroPointCurrentReadout || !worldPosition) return;
    el.zeroPointCurrentReadout.textContent = `${uiText('현재 영점')} · X ${worldPosition.x.toFixed(3)}, Y ${worldPosition.y.toFixed(3)}, Z ${worldPosition.z.toFixed(3)} mm`;
}

function updateZeroPointCurrentMarker() {
    const marker = state.zeroPointEdit.marker;
    const model = state.zeroPointEdit.active ? state.zeroPointEdit.model : null;
    if (!marker || !model?.userData?.uploaded || model.visible === false || !state.models.includes(model)) {
        if (marker) marker.visible = false;
        return;
    }
    model.updateMatrixWorld(true);
    marker.position.copy(model.getWorldPosition(new THREE.Vector3()));
    marker.visible = true;
    if (state.zeroPointEdit.active) updateZeroPointCurrentReadout(marker.position);
}

function refreshZeroPointSnapCandidates() {
    const edit = state.zeroPointEdit;
    if (!edit.active || !edit.snapMode) return;
    void buildSimulationSnapCandidates('zero')
        .then(() => {
            if (!edit.active || !edit.snapMode || !state.snapLastPointerEvent) return;
            showSimulationSnapMarker(findSimulationSnapAtPointer(state.snapLastPointerEvent));
        })
        .catch((error) => console.warn('Zero point snap candidate refresh failed:', error));
}

function updateZeroPointFrameFromState() {
    const edit = state.zeroPointEdit;
    if (!edit.active || !edit.model || !edit.frame) return;
    applyZeroPointModelPreview();
    edit.model.updateMatrixWorld(true);
    const rootPosition = edit.model.getWorldPosition(new THREE.Vector3());
    const rootQuaternion = edit.model.getWorldQuaternion(new THREE.Quaternion());
    edit.frame.position.copy(rootPosition);
    edit.frame.quaternion.copy(rootQuaternion).multiply(getZeroPointRotationQuaternion()).normalize();
    edit.frame.updateMatrixWorld(true);
    edit.axes?.updateMatrixWorld(true);
    updateZeroPointAxisDirections();
    updateZeroPointCurrentReadout(rootPosition);
    updateZeroPointCurrentMarker();
    refreshZeroPointSnapCandidates();
}

function setZeroPointSnapMode(enabled) {
    const edit = state.zeroPointEdit;
    if (!edit.active || !edit.model) return;
    edit.snapMode = Boolean(enabled);
    if (edit.snapMode) {
        state.snapMoveMode = false;
        clearSimulationSnapFaceSelection({ invalidate: false });
        if (state.tcpSnapMode) setTcpSnapMode(false);
        state.snapLastPointerEvent = null;
        resetZeroPointSnapPoints();
        captureSimulationSnapMarkerReferenceDistance();
        setStatus('영점 스냅 후보를 계산하는 중입니다...', '#f59e0b');
        if (el.btnZeroPointSnap) {
            el.btnZeroPointSnap.classList.add('active');
            el.btnZeroPointSnap.setAttribute('aria-pressed', 'true');
        }
        void buildSimulationSnapCandidates('zero')
            .then(() => {
                if (!edit.active || !edit.snapMode) return;
                setZeroPointSnapReadout(isZeroPointMultiPointSnapMode()
                    ? '스냅 점 2~4개를 선택하세요.'
                    : '모델 형상 위로 이동하면 스냅 후보가 표시됩니다.');
                setStatus('영점으로 지정할 모델 스냅 위치를 선택하세요.', '#60a5fa');
            })
            .catch((error) => {
                console.warn('Zero point snap candidate generation failed:', error);
                if (edit.active && edit.snapMode) {
                    setZeroPointSnapMode(false);
                    setStatus('선택 가능한 스냅 지점을 계산하지 못했습니다.', '#ef4444');
                }
            });
    } else {
        invalidateSimulationSnapCandidates();
        resetZeroPointSnapPoints();
        hideSimulationSnapMarker();
        resetSimulationSnapMarkerCameraScale();
        setZeroPointSnapReadout('스냅 위치 선택을 누른 뒤 모델 형상 위로 포인터를 이동하세요.');
        if (el.btnZeroPointSnap) {
            el.btnZeroPointSnap.classList.remove('active');
            el.btnZeroPointSnap.setAttribute('aria-pressed', 'false');
        }
    }
}

function getZeroPointBaselineLocalPoint(worldPoint) {
    const edit = state.zeroPointEdit;
    if (!edit.model) return null;
    const currentLocalPoint = edit.model.worldToLocal(worldPoint.clone());
    return currentLocalPoint.applyQuaternion(getZeroPointRotationQuaternion()).add(edit.origin);
}

function commitZeroPointSnapPoint(worldPoint, selectedLabelKey = '스냅') {
    const edit = state.zeroPointEdit;
    if (!edit.model) return false;
    const localPoint = getZeroPointBaselineLocalPoint(worldPoint);
    if (!localPoint) return false;
    edit.origin.copy(localPoint);
    updateZeroPointEditorInputs();
    updateZeroPointFrameFromState();
    setZeroPointSnapMode(false);
    setStatus('{label} 영점 위치에 적용되었습니다.', '#22c55e', {
        label: uiText(selectedLabelKey)
    });
    setZeroPointSnapReadout(`${uiText(selectedLabelKey)} · X ${localPoint.x.toFixed(3)}, Y ${localPoint.y.toFixed(3)}, Z ${localPoint.z.toFixed(3)} mm`);
    return true;
}

function handleZeroPointSnapSelection(snap) {
    if (!snap || !state.zeroPointEdit.active) return false;
    if (!isZeroPointMultiPointSnapMode()) {
        return commitZeroPointSnapPoint(snap.worldPoint, snapTypeInfo(snap.type).label);
    }
    const edit = state.zeroPointEdit;
    if (edit.snapPoints.length >= 4) {
        setStatus('최대 4개까지 선택할 수 있습니다.', '#f59e0b');
        return false;
    }
    if (edit.snapPoints.some((point) => point.distanceTo(snap.worldPoint) <= 1e-4)) {
        setStatus('중복된 스냅 점입니다.', '#f59e0b');
        return false;
    }
    edit.snapPoints.push(snap.worldPoint.clone());
    updateZeroPointMultiCenterControls();
    const center = getZeroPointSnapCenter();
    setZeroPointSnapReadout(center && edit.snapPoints.length >= 2
        ? `${uiText('다중 점 중심점')} · X ${center.x.toFixed(3)}, Y ${center.y.toFixed(3)}, Z ${center.z.toFixed(3)} mm`
        : `${uiText('다중 점 선택')} ${edit.snapPoints.length}/4 · ${uiText('스냅 점 2~4개를 선택하세요.')}`);
    setStatus('{count} 다중 점 선택', '#60a5fa', {
        count: `${edit.snapPoints.length}/4`
    });
    return true;
}

function applyZeroPointMultiCenter() {
    if (!isZeroPointMultiPointSnapMode() || state.zeroPointEdit.snapPoints.length < 2) return;
    const center = getZeroPointSnapCenter();
    if (center) commitZeroPointSnapPoint(center, '다중 점 중심점');
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
    if (!isSimulationSnapInteractionActive() || event.button !== 0) return;
    if (state.snapMoveMode) {
        handleSimulationSnapMoveClick(event);
        return;
    }
    if (false) {
        event.preventDefault();
        event.stopPropagation();
        const selection = pickSimulationSnapFaceAtPointer(event);
        if (!selection) {
            setStatus('스냅할 3D 모델의 면을 클릭하세요.', '#f59e0b');
            return;
        }
        selectSimulationSnapFace(selection);
        return;
    }
    const snap = findSimulationSnapAtPointer(event);
    if (!snap) {
        setStatus('선택 가능한 스냅 지점을 가리켜 주세요.', '#f59e0b');
        return;
    }
    event.preventDefault();
    event.stopPropagation();
    if (state.zeroPointEdit.active && state.zeroPointEdit.snapMode) {
        handleZeroPointSnapSelection(snap);
    } else if (state.tcpSnapMode) {
        handleTcpSnapSelection(snap);
    } else if (moveRobotTcpToSimulationSnap(snap)) {
        showSimulationSnapMarker(snap);
    }
}

function updateSimulationSnapButton() {
    if (!el.btnSnapMove) return;
    const available = !isMotionActive();
    if (!available && state.snapMoveMode) {
        state.snapMoveMode = false;
        clearSimulationSnapFaceSelection({ invalidate: false });
        invalidateSimulationSnapCandidates();
        hideSimulationSnapMarker();
        resetSimulationSnapMarkerCameraScale();
    }
    el.btnSnapMove.disabled = !available;
    el.btnSnapMove.classList.toggle('active', state.snapMoveMode);
    el.btnSnapMove.setAttribute('aria-pressed', String(state.snapMoveMode));
    el.btnSnapMove.title = uiText(state.snapMoveMode ? '스냅 이동 종료' : '스냅 이동');
    el.canvasContainer?.classList.toggle('simulation-snap-picking', state.snapMoveMode);
}

async function toggleSimulationSnapMoveMode() {
    if (isMotionActive()) return;
    state.snapMoveMode = !state.snapMoveMode;
    if (state.snapMoveMode) {
        if (state.tcpSnapMode) setTcpSnapMode(false);
        clearJogModeSelectionForSnap();
        clearSimulationSnapFaceSelection({ invalidate: false });
        invalidateSimulationSnapCandidates();
        captureSimulationSnapMarkerReferenceDistance();
        setStatus('스냅할 3D 모델의 면을 클릭하세요.', '#60a5fa');
        updateSimulationSnapButton();
    } else {
        clearSimulationSnapFaceSelection();
        hideSimulationSnapMarker();
        resetSimulationSnapMarkerCameraScale();
        setStatus('스냅 이동을 종료했습니다.', '#22c55e');
    }
    updateSimulationSnapButton();
    updateTcpSnapUi();
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
    state.controls.addEventListener('change', requestRender);
    state.controls.addEventListener('start', beginSimulationViewNavigation);
    state.controls.addEventListener('end', endSimulationViewNavigation);

    state.transformControls = new TransformControls(state.camera, state.renderer.domElement);
    enableContinuousTransformRotation(state.transformControls, THREE);
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
    state.transformControls.addEventListener('objectChange', () => {
        markSceneCollisionDirty(state.transformControls.object);
        updateSelectedModelTransformInputs();
    });
    state.transformControls.addEventListener('objectChange', requestRender);
    removeRotationScreenHandle(state.transformControls);
    applyTransformControlColors(state.transformControls);
    state.transformControls.visible = false;
    state.transformControls.enabled = false;
    state.scene.add(state.transformControls);

    const zeroPointEdit = state.zeroPointEdit;
    zeroPointEdit.frame = new THREE.Object3D();
    zeroPointEdit.frame.name = 'Model zero point frame';
    zeroPointEdit.axes = new THREE.AxesHelper(1);
    applyAxesHelperColors(zeroPointEdit.axes);
    zeroPointEdit.axes.renderOrder = 25;
    zeroPointEdit.frame.add(zeroPointEdit.axes);
    zeroPointEdit.frame.visible = false;
    state.scene.add(zeroPointEdit.frame);

    zeroPointEdit.marker = new THREE.Mesh(
        new THREE.SphereGeometry(1, 16, 10),
        new THREE.MeshBasicMaterial({
            color: 0xfacc15,
            depthTest: false,
            depthWrite: false,
            transparent: true,
            opacity: 0.96
        })
    );
    zeroPointEdit.marker.name = 'Current model zero point';
    zeroPointEdit.marker.renderOrder = 26;
    zeroPointEdit.marker.scale.setScalar(5);
    zeroPointEdit.marker.visible = false;
    state.scene.add(zeroPointEdit.marker);

    zeroPointEdit.transformControls = new TransformControls(state.camera, state.renderer.domElement);
    zeroPointEdit.transformControls.setMode('rotate');
    zeroPointEdit.transformControls.setSpace('local');
    zeroPointEdit.transformControls.setSize(0.82);
    enableContinuousTransformRotation(zeroPointEdit.transformControls, THREE);
    removeRotationScreenHandle(zeroPointEdit.transformControls);
    applyTransformControlColors(zeroPointEdit.transformControls);
    zeroPointEdit.transformControls.visible = false;
    zeroPointEdit.transformControls.enabled = false;
    zeroPointEdit.transformControls.addEventListener('dragging-changed', (event) => {
        state.controls.enabled = !event.value;
    });
    zeroPointEdit.transformControls.addEventListener('objectChange', () => {
        if (!zeroPointEdit.active || !zeroPointEdit.frame) return;
        const deltaQuaternion = zeroPointEdit.baseWorldQuaternion.clone().invert()
            .multiply(zeroPointEdit.frame.getWorldQuaternion(new THREE.Quaternion()))
            .normalize();
        const euler = new THREE.Euler().setFromQuaternion(deltaQuaternion, 'XYZ');
        zeroPointEdit.rotationDegrees.set(
            THREE.MathUtils.radToDeg(euler.x),
            THREE.MathUtils.radToDeg(euler.y),
            THREE.MathUtils.radToDeg(euler.z)
        );
        updateZeroPointEditorInputs();
        updateZeroPointFrameFromState();
    });
    zeroPointEdit.transformControls.addEventListener('objectChange', requestRender);
    state.scene.add(zeroPointEdit.transformControls);

    setupBaseJogTransformControls();
}

function setupBaseJogTransformControls() {
    const target = new THREE.Object3D();
    target.name = 'Base JOG TCP Target';
    state.baseJogGizmoTarget = target;

    const controls = new TransformControls(state.camera, state.renderer.domElement);
    enableContinuousTransformRotation(controls, THREE);
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
    controls.addEventListener('objectChange', requestRender);
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
    state.tcpSnapType = el.tcpSnapType?.value || state.tcpSnapType;
    state.tcpSnapRadiusPx = Number(el.tcpSnapRadius?.value) || state.tcpSnapRadiusPx;
    if (el.tcpSnapRadiusValue) el.tcpSnapRadiusValue.textContent = `${state.tcpSnapRadiusPx} px`;
    state.zeroPointEdit.snapType = readZeroPointSnapType();
    state.zeroPointEdit.snapRadiusPx = Number(el.zeroPointSnapRadius?.value) || state.zeroPointEdit.snapRadiusPx;
    if (el.zeroPointSnapRadiusValue) {
        el.zeroPointSnapRadiusValue.textContent = `${state.zeroPointEdit.snapRadiusPx} px`;
    }
    window.addEventListener('resize', onResize);
    document.addEventListener('pointermove', handleFullscreenUiPointerMove);
    document.addEventListener('click', requestRender);
    document.addEventListener('input', requestRender);
    document.addEventListener('change', requestRender);
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) requestRender();
    });
    document.addEventListener('inorobot:i18nready', refreshLocalizedControls);
    document.addEventListener('inorobot:languagechange', refreshLocalizedControls);
    el.modelSelect.addEventListener('change', (e) => {
        const file = e.target.value;
        if (!file) return;
        const model = state.catalog.get(file);
        if (model) void loadModelFromServer(model);
    });
    el.btnResetSimulation?.addEventListener('click', openSimulationResetDialog);
    el.btnCancelSimulationReset?.addEventListener('click', closeSimulationResetDialog);
    el.btnConfirmSimulationReset?.addEventListener('click', () => void resetSimulation());
    el.simulationResetDialog?.addEventListener('cancel', (event) => {
        event.preventDefault();
        closeSimulationResetDialog();
    });
    el.btnCancelTestModel?.addEventListener('click', () => resolveTestModelConfirmation(false));
    el.btnConfirmTestModel?.addEventListener('click', () => resolveTestModelConfirmation(true));
    el.testModelDialog?.addEventListener('cancel', (event) => {
        event.preventDefault();
        resolveTestModelConfirmation(false);
    });

    el.btnFullscreenMode?.addEventListener('click', () => setFullscreenUiMode(!state.fullscreenUiMode));
    el.btnPositionExport?.addEventListener('click', exportPositionPoints);
    el.btnSnapMove?.addEventListener('click', toggleSimulationSnapMoveMode);
    el.btnTcpSnap?.addEventListener('click', toggleTcpSnapMode);
    el.tcpSnapType?.addEventListener('change', () => {
        state.tcpSnapType = el.tcpSnapType.value || 'auto';
        resetTcpSnapPoints();
        updateTcpMultiCenterControls();
        if (state.tcpSnapMode && state.tcpSnapType === 'multi-point-center') {
            setTcpSnapReadout('스냅 점 2~4개를 선택하세요.');
        } else if (state.tcpSnapMode) {
            setTcpSnapReadout('3D 모델링의 스냅 지점을 클릭하세요.');
        }
        if (state.tcpSnapMode && state.snapLastPointerEvent) {
            showSimulationSnapMarker(findSimulationSnapAtPointer(state.snapLastPointerEvent));
        }
    });
    el.tcpSnapRadius?.addEventListener('input', () => {
        state.tcpSnapRadiusPx = Number(el.tcpSnapRadius.value) || 16;
        if (el.tcpSnapRadiusValue) el.tcpSnapRadiusValue.textContent = `${state.tcpSnapRadiusPx} px`;
        if (state.tcpSnapMode && state.snapLastPointerEvent) {
            showSimulationSnapMarker(findSimulationSnapAtPointer(state.snapLastPointerEvent));
        }
    });
    el.btnTcpMultiCenterApply?.addEventListener('click', applyTcpMultiPointCenter);
    el.btnTcpMultiCenterReset?.addEventListener('click', () => {
        resetTcpSnapPoints();
        if (state.tcpSnapMode) setTcpSnapReadout('스냅 점 2~4개를 선택하세요.');
    });
    state.renderer.domElement.addEventListener('pointerdown', requestRender, { passive: true });
    state.renderer.domElement.addEventListener('pointermove', handleSimulationSnapPointerMove);
    state.renderer.domElement.addEventListener('pointermove', requestRender, { passive: true });
    state.renderer.domElement.addEventListener('pointerleave', hideSimulationSnapMarker);
    state.renderer.domElement.addEventListener('pointerleave', requestRender);
    state.renderer.domElement.addEventListener('click', handleSimulationSnapClick);
    el.btnTestModel?.addEventListener('click', handleTestModelImport);
    el.btnToggleCollision?.addEventListener('click', () => {
        state.collision.enabled = !state.collision.enabled;
        clearCollisionStopNotice();
        if (!state.collision.enabled) {
            updateCollisionStatus(null);
            setStatus('충돌 감지 끄기', '#f59e0b');
        } else {
            setStatus('충돌 감지 켜기', '#22c55e');
            checkSceneCollisions({ force: true });
        }
        updateCollisionUi();
        requestRender();
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
        const partButton = event.target.closest('[data-model-part-id]');
        if (partButton) {
            const match = findImportedModelPart(partButton.dataset.modelPartId);
            if (match) {
                commitPendingHistory('수치 모델 변환', 'pendingNumericHistory');
                selectSceneModelPart(match.model, match.part);
            }
            return;
        }
        const button = event.target.closest('[data-model-tree-id]');
        if (!button) return;
        commitPendingHistory('수치 모델 변환', 'pendingNumericHistory');
        const model = state.models.find((candidate) => candidate.userData.modelTreeId === button.dataset.modelTreeId);
        if (model) selectSceneModel(model);
    });
    el.modelTree?.addEventListener('change', (event) => {
        const checkbox = event.target.closest('[data-model-part-visibility]');
        if (!checkbox) return;
        const match = findImportedModelPart(checkbox.dataset.modelPartVisibility);
        if (match) setModelPartVisibility(match.model, match.part, checkbox.checked);
    });
    el.modelTree?.addEventListener('contextmenu', (event) => {
        if (isMotionActive()) return;
        const partButton = event.target.closest('[data-model-part-id]');
        const partVisibility = event.target.closest('[data-model-part-visibility]');
        const partId = partButton?.dataset.modelPartId || partVisibility?.dataset.modelPartVisibility;
        const partMatch = partId ? findImportedModelPart(partId) : null;
        if (partId && !partMatch) return;
        const button = event.target.closest('[data-model-tree-id]');
        const model = partMatch?.model || state.models.find((candidate) => candidate.userData.modelTreeId === button?.dataset.modelTreeId);
        if (!model?.userData?.uploaded) return;
        event.preventDefault();
        commitPendingHistory('수치 모델 변환', 'pendingNumericHistory');
        if (partMatch) selectSceneModelPart(partMatch.model, partMatch.part);
        else selectSceneModel(model);
        openModelContextMenu(event, model, partMatch?.part || null);
    });
    el.modelChangeZeroPoint?.addEventListener('click', () => {
        const target = getModelContextTarget();
        closeModelContextMenu();
        if (target?.model && !target.part) openZeroPointEditor(target.model);
    });
    el.modelColorPicker?.addEventListener('input', () => {
        const target = getModelContextTarget();
        if (target) applyImportedModelColor(target.model, target.part, el.modelColorPicker.value);
    });
    el.modelColorPicker?.addEventListener('change', () => {
        closeModelContextMenu();
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
    el.btnZeroPointSnap?.addEventListener('click', () => {
        if (!state.zeroPointEdit.active) return;
        setZeroPointSnapMode(!state.zeroPointEdit.snapMode);
    });
    el.zeroPointSnapType?.addEventListener('change', () => {
        state.zeroPointEdit.snapType = readZeroPointSnapType();
        resetZeroPointSnapPoints();
        if (state.zeroPointEdit.snapMode) {
            setZeroPointSnapReadout(isZeroPointMultiPointSnapMode()
                ? '스냅 점 2~4개를 선택하세요.'
                : '모델 형상 위로 이동하면 스냅 후보가 표시됩니다.');
            if (state.snapLastPointerEvent) {
                showSimulationSnapMarker(findSimulationSnapAtPointer(state.snapLastPointerEvent));
            }
        }
    });
    el.zeroPointSnapRadius?.addEventListener('input', () => {
        state.zeroPointEdit.snapRadiusPx = Number(el.zeroPointSnapRadius.value) || 16;
        if (el.zeroPointSnapRadiusValue) {
            el.zeroPointSnapRadiusValue.textContent = `${state.zeroPointEdit.snapRadiusPx} px`;
        }
        if (state.zeroPointEdit.snapMode && state.snapLastPointerEvent) {
            showSimulationSnapMarker(findSimulationSnapAtPointer(state.snapLastPointerEvent));
        }
    });
    el.btnZeroPointMultiCenterApply?.addEventListener('click', applyZeroPointMultiCenter);
    el.btnZeroPointMultiCenterReset?.addEventListener('click', () => {
        resetZeroPointSnapPoints();
        if (state.zeroPointEdit.snapMode) setZeroPointSnapReadout('스냅 점 2~4개를 선택하세요.');
    });
    [...Object.values(el.zeroPointOriginInputs), ...Object.values(el.zeroPointRotationInputs)].forEach((input) => {
        input?.addEventListener('input', applyZeroPointEditorInput);
        input?.addEventListener('keydown', (event) => {
            if (event.key !== 'Enter') return;
            event.preventDefault();
            event.currentTarget.blur();
        });
        enableHalfStepWheel(input);
    });
    el.btnApplyZeroPoint?.addEventListener('click', applyZeroPointEditor);
    el.btnCancelZeroPoint?.addEventListener('click', exitZeroPointEditor);
    el.btnCloseZeroPointEditor?.addEventListener('click', exitZeroPointEditor);

    document.querySelectorAll('[data-panel-action]').forEach((button) => {
        button.addEventListener('click', () => handlePanelAction(button.dataset.panelAction, button.dataset.panelId));
    });
    document.querySelectorAll('[data-panel-toggle]').forEach((button) => {
        button.addEventListener('click', () => togglePanelVisibility(button.dataset.panelToggle));
    });
    el.interferenceZoneList?.addEventListener('click', (event) => {
        const row = event.target.closest('[data-interference-zone-row]');
        if (!row) return;
        const zoneId = Number(row.dataset.interferenceZoneRow);
        if (event.target.closest('[data-interference-zone-read]')) {
            readInterferenceZoneFromController(zoneId);
            return;
        }
        if (event.target.closest('[data-interference-zone-edit]')) openInterferenceZoneEditor(zoneId);
    });
    el.interferenceZoneList?.addEventListener('change', (event) => {
        const row = event.target.closest('[data-interference-zone-row]');
        if (!row) return;
        const activate = event.target.closest('[data-interference-zone-activate]');
        if (activate) setInterferenceZoneActivate(Number(row.dataset.interferenceZoneRow), activate.checked);
    });
    el.endMonitoringList?.addEventListener('click', (event) => {
        const row = event.target.closest('[data-end-monitoring-row]');
        if (!row) return;
        const objectId = Number(row.dataset.endMonitoringRow);
        if (event.target.closest('[data-end-monitoring-read]')) {
            readInterferenceToolFromController(objectId);
            return;
        }
        if (event.target.closest('[data-end-monitoring-edit]')) openEndMonitoringEditor(objectId);
    });
    el.interferenceInputList?.addEventListener('change', (event) => {
        const input = event.target.closest('[data-interference-input]');
        if (!input) return;
        const index = Number(input.dataset.interferenceInput);
        if (!Number.isInteger(index) || index < 0 || index >= state.simulationIo.inputs.length) return;
        state.simulationIo.inputs[index] = input.checked;
        evaluateInterferenceZones(performance.now());
    });
    el.interferenceZoneClose?.addEventListener('click', closeInterferenceZoneEditor);
    el.interferenceZoneDialog?.addEventListener('cancel', (event) => {
        event.preventDefault();
        closeInterferenceZoneEditor();
    });
    el.interferenceZoneMethod?.addEventListener('change', updateInterferenceZoneGeometryFields);
    el.interferenceZoneNext?.addEventListener('click', () => {
        if (validateInterferenceZoneDraft().valid) setInterferenceZoneDialogStep('geometry');
    });
    el.interferenceZonePrevious?.addEventListener('click', () => {
        readInterferenceZoneDialogDraft();
        setInterferenceZoneDialogStep('basic');
    });
    el.interferenceZoneDone?.addEventListener('click', commitInterferenceZoneDraft);
    el.interferenceZoneDialog?.querySelectorAll('[data-interference-get-point]').forEach((button) => {
        button.addEventListener('click', () => setInterferenceDialogPoint(button.dataset.interferenceGetPoint));
    });
    el.endMonitoringClose?.addEventListener('click', closeEndMonitoringEditor);
    el.endMonitoringDialog?.addEventListener('cancel', (event) => {
        event.preventDefault();
        closeEndMonitoringEditor();
    });
    el.endMonitoringType?.addEventListener('change', updateEndMonitoringTypeFields);
    el.endMonitoringCuboidMethod?.addEventListener('change', updateEndMonitoringTypeFields);
    el.endMonitoringDone?.addEventListener('click', commitEndMonitoringDraft);
    el.endMonitoringDialog?.querySelectorAll('[data-end-monitoring-get-point]').forEach((button) => {
        button.addEventListener('click', () => setEndMonitoringDialogPoint(button.dataset.endMonitoringGetPoint));
    });
    el.btnUndo?.addEventListener('click', undoLastAction);
    el.btnRedo?.addEventListener('click', redoLastAction);
    [el.modelBrowserPanel, el.jogPanel, el.virtualControllerPanel, el.viewPresetsPanel, el.interferenceZonePanel, el.programPanel].forEach(makePanelDraggable);
    [el.tcpProfilePanel].forEach(makePanelDraggable);
    [el.modelBrowserPanel, el.jogPanel, el.virtualControllerPanel, el.viewPresetsPanel, el.interferenceZonePanel, el.programPanel].forEach(makePanelEdgeResizable);
    [el.tcpProfilePanel].forEach(makePanelEdgeResizable);
    setupInterferenceZoneDialogDragging();
    initializePanelStack();

    el.viewPresetsList?.addEventListener('click', handleViewPresetListClick);
    el.viewPresetsList?.addEventListener('input', handleViewPresetListInput);

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
    el.virtualControllerKind?.addEventListener('change', () => {
        if (isVirtualControllerActive()) return;
        const controller = state.virtualController;
        controller.controllerKind = el.virtualControllerKind.value === 'real' ? 'real' : 'virtual';
        if (controller.controllerKind === 'virtual') {
            controller.ipAddress = '127.0.0.1';
        } else if (controller.ipAddress === '127.0.0.1') {
            controller.ipAddress = '';
        }
        refreshVirtualControllerUi();
    });
    el.virtualControllerIp?.addEventListener('input', () => {
        if (state.virtualController.controllerKind !== 'real') return;
        state.virtualController.ipAddress = el.virtualControllerIp.value.trim();
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
    el.btnProgramAddView?.addEventListener('click', addViewMotionStep);
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
        if (el.programStepContextMenu && !el.programStepContextMenu.classList.contains('hidden')
            && !el.programStepContextMenu.contains(event.target)) closeProgramStepContextMenu();
        if (el.modelContextMenu && !el.modelContextMenu.classList.contains('hidden')
            && !el.modelContextMenu.contains(event.target)) closeModelContextMenu();
    });

    el.btnResetJoints?.addEventListener('click', () => {
        stopBaseJogHold();
        if (state.activeArticulatedModel) {
            const before = captureSceneSnapshot();
            resetArticulatedJoints(state.activeArticulatedModel);
            recordHistory('관절 원점 복귀', before, captureSceneSnapshot());
        }
    });

    el.tcpProfileButtons.forEach((button) => {
        button.addEventListener('click', () => selectTcpProfile(Number(button.dataset.tcpProfile)));
    });
    el.btnApplyTcpProfile?.addEventListener('click', applyTcpProfileEditor);
    el.btnResetTcpProfile?.addEventListener('click', resetActiveTcpProfile);
    Object.values(el.tcpOffsetInputs).forEach((input) => {
        input?.addEventListener('input', updateTcpProfileLive);
        input?.addEventListener('keydown', (event) => {
            if (event.key !== 'Enter') return;
            event.preventDefault();
            applyTcpProfileEditor();
        });
        enableHalfStepWheel(input);
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
    el.btnToggleOutline?.addEventListener('click', () => {
        setModelOutlineMode(!state.outlineMode);
    });
    el.btnToggleGrid.addEventListener('click', () => {
        state.grid.visible = !state.grid.visible;
        state.baseAxes.visible = state.grid.visible;
        state.labels.forEach(l => l.visible = state.grid.visible);
        el.btnToggleGrid.classList.toggle('active', state.grid.visible);
    });
    updateOutlineToggleUi();

    window.addEventListener('keydown', handleGlobalKeyDown);

    const btnDown = document.getElementById('btn-download-cad');
    if (btnDown) {
        btnDown.addEventListener('click', handleCADDownload);
    }

    window.addEventListener('beforeunload', () => {
        closeVirtualControllerSocket(false);
        if (!state.resetInProgress) saveMotionProjectNow();
        closeViewWindow();
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
    if (event.key === 'Escape' && state.snapMoveMode && getSimulationSnapFaceSelections().length) {
        event.preventDefault();
        clearSimulationSnapFaceSelection();
        setStatus('스냅할 3D 모델의 면을 클릭하세요.', '#60a5fa');
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
            scale: model.scale.toArray(),
            childTransforms: model.userData.uploaded ? model.children.map((child) => {
                if (child.matrixAutoUpdate !== false) child.updateMatrix();
                return {
                    child,
                    matrix: child.matrix.toArray(),
                    matrixAutoUpdate: child.matrixAutoUpdate !== false
                };
            }) : [],
            partVisibility: getImportedModelParts(model).map((part) => ({
                part,
                visible: part.visible !== false
            }))
        })),
        joints: state.models
            .filter((model) => model.userData.joints)
            .map((robot) => ({
                robot,
                angles: robot.userData.joints.map((joint) => joint.angle),
                tcpProfiles: serializeRobotTcpProfiles(robot),
                activeTcpProfileIndex: robot.userData.activeTcpProfileIndex
            })),
        selectedModel: currentModels.has(state.selectedModel) ? state.selectedModel : null,
        activeArticulatedModel: currentModels.has(state.activeArticulatedModel) ? state.activeArticulatedModel : null,
        activeProgramRobot: currentModels.has(state.activeProgramRobot) ? state.activeProgramRobot : null,
        motionRepeatRobot: state.motionRepeatRobot,
        motionRepeat: state.motionRepeat,
        interferenceZones: cloneInterferenceZones(state.interferenceZones),
        endMonitoringObjects: cloneEndMonitoringObjects(state.endMonitoringObjects),
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
        const leftChildren = left.childTransforms || [];
        const rightChildren = right.childTransforms || [];
        if (leftChildren.length !== rightChildren.length) return false;
        for (let childIndex = 0; childIndex < leftChildren.length; childIndex += 1) {
            if (leftChildren[childIndex].child !== rightChildren[childIndex].child
                || !numberArraysEqual(leftChildren[childIndex].matrix, rightChildren[childIndex].matrix)) return false;
        }
        const leftParts = left.partVisibility || [];
        const rightParts = right.partVisibility || [];
        if (leftParts.length !== rightParts.length) return false;
        for (let partIndex = 0; partIndex < leftParts.length; partIndex += 1) {
            if (leftParts[partIndex].part !== rightParts[partIndex].part
                || Boolean(leftParts[partIndex].visible) !== Boolean(rightParts[partIndex].visible)) return false;
        }
    }
    for (let index = 0; index < a.joints.length; index += 1) {
        if (a.joints[index].robot !== b.joints[index].robot
            || !numberArraysEqual(a.joints[index].angles, b.joints[index].angles)) return false;
        if (a.joints[index].activeTcpProfileIndex !== b.joints[index].activeTcpProfileIndex) return false;
        const leftProfiles = a.joints[index].tcpProfiles || [];
        const rightProfiles = b.joints[index].tcpProfiles || [];
        if (leftProfiles.length !== rightProfiles.length) return false;
        for (let profileIndex = 0; profileIndex < leftProfiles.length; profileIndex += 1) {
            if (!numberArraysEqual(leftProfiles[profileIndex].position, rightProfiles[profileIndex].position)
                || !numberArraysEqual(leftProfiles[profileIndex].quaternion, rightProfiles[profileIndex].quaternion)) {
                return false;
            }
        }
    }
    if (a.selectedModel !== b.selectedModel
        || a.activeArticulatedModel !== b.activeArticulatedModel
        || a.activeProgramRobot !== b.activeProgramRobot
        || Boolean(a.motionRepeatRobot) !== Boolean(b.motionRepeatRobot)
        || Boolean(a.motionRepeat) !== Boolean(b.motionRepeat)) return false;
    if (JSON.stringify(a.interferenceZones || []) !== JSON.stringify(b.interferenceZones || [])) return false;
    if (JSON.stringify(a.endMonitoringObjects || []) !== JSON.stringify(b.endMonitoringObjects || [])) return false;
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
    if (state.zeroPointEdit.active) exitZeroPointEditor();
    state.historySuspended = true;
    setTransformHandlesEnabled(false);
    setBaseJogGizmoEnabled(false);

    const allModels = new Set([
        ...state.models,
        ...snapshot.models.map((entry) => entry.model)
    ]);
    const snapshotModels = new Set(snapshot.models.map((entry) => entry.model));
    allModels.forEach((model) => {
        if (!snapshotModels.has(model)) disposeModelOutlines(model);
        model.removeFromParent();
    });

    state.models = snapshot.models.map((entry) => entry.model);
    markSceneCollisionDirty();
    snapshot.models.forEach((entry) => {
        entry.model.position.fromArray(entry.position);
        entry.model.quaternion.fromArray(entry.quaternion);
        entry.model.scale.fromArray(entry.scale);
        (entry.childTransforms || []).forEach(({ child, matrix, matrixAutoUpdate }) => {
            if (!child || !entry.model.children.includes(child)) return;
            child.matrix.fromArray(matrix);
            if (matrixAutoUpdate === false) {
                child.matrixAutoUpdate = false;
                child.matrixWorldNeedsUpdate = true;
            } else {
                child.matrix.decompose(child.position, child.quaternion, child.scale);
                child.matrixAutoUpdate = true;
            }
        });
        (entry.partVisibility || []).forEach(({ part, visible }) => {
            part.visible = visible !== false;
        });
        const toolMountFrame = getRobotToolMountFrame(entry.host);
        if (toolMountFrame && state.models.includes(entry.host)) {
            toolMountFrame.add(entry.model);
            entry.model.userData.attachmentHost = entry.host;
            entry.model.userData.attachmentFrame = 'flange';
        } else {
            state.scene.add(entry.model);
        }
    });

    snapshot.joints.forEach(({ robot, angles, tcpProfiles, activeTcpProfileIndex }) => {
        restoreRobotTcpProfiles(robot, tcpProfiles, activeTcpProfileIndex);
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
    state.interferenceZones = normalizeInterferenceZones(snapshot.interferenceZones);
    state.endMonitoringObjects = normalizeEndMonitoringObjects(snapshot.endMonitoringObjects);
    state.interferenceRuntime.forEach((runtime, index) => {
        if (!runtime) return;
        resetInterferenceZoneRuntime(index);
    });
    updateInterferenceZoneVisuals();
    renderInterferenceZonePanel();
    state.activeProgramRobot = state.models.includes(snapshot.activeProgramRobot)
        ? snapshot.activeProgramRobot
        : state.activeArticulatedModel;
    syncMotionRepeatControl();
    if (state.activeArticulatedModel) renderJogControls(state.activeArticulatedModel);
    else {
        hideJogPanel();
        refreshTcpProfileUi(null);
    }

    updateUIStatus();
    selectSceneModel(state.models.includes(snapshot.selectedModel) ? snapshot.selectedModel : null);
    renderMotionProgramPanel();
    scheduleMotionProjectSave();
    refreshCollisionDebugOverlays();
    checkSceneCollisions({ force: true });
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
        'tcp-profile-panel': el.tcpProfilePanel,
        'virtual-controller-panel': el.virtualControllerPanel,
        'view-presets-panel': el.viewPresetsPanel,
        'program-panel': el.programPanel,
        'interference-zone-panel': el.interferenceZonePanel,
        'interference-zone-dialog': el.interferenceZoneDialog
    }[panelId] || null;
}

function isPanelOpenInDocument(panel) {
    if (!panel || panel.ownerDocument !== document) return false;
    if (panel.id === 'interference-zone-dialog') return panel.open;
    return !panel.classList.contains('panel-user-hidden')
        && !panel.classList.contains('hidden');
}

function updatePanelStack() {
    state.panelOpenOrder = state.panelOpenOrder.filter((panelId) => {
        const panel = getPanelElement(panelId);
        return isPanelOpenInDocument(panel);
    });
    state.panelOpenOrder.forEach((panelId, index) => {
        const panel = getPanelElement(panelId);
        if (panel) panel.style.zIndex = String(PANEL_STACK_BASE_Z_INDEX + index);
    });
}

function bringPanelToFront(panelId) {
    const panel = getPanelElement(panelId);
    if (!panel || panel.ownerDocument !== document) return;
    state.panelOpenOrder = state.panelOpenOrder.filter((openPanelId) => openPanelId !== panelId);
    state.panelOpenOrder.push(panelId);
    updatePanelStack();
}

function initializePanelStack() {
    state.panelOpenOrder = PANEL_STACK_IDS.filter((panelId) => isPanelOpenInDocument(getPanelElement(panelId)));
    updatePanelStack();
}

function updatePanelLauncher(panelId) {
    const panel = getPanelElement(panelId);
    const button = document.querySelector(`[data-panel-toggle="${panelId}"]`);
    if (!panel || !button) return;
    const unavailable = (panelId === 'jog-panel' && !state.activeArticulatedModel)
        || (panelId === 'tcp-profile-panel' && getArticulatedRobots().length === 0)
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
    const isVisible = !panel.classList.contains('panel-user-hidden');
    if (panelId === 'model-browser-panel' && panel.classList.contains('panel-user-hidden')) {
        setTransformHandlesEnabled(false);
    }
    if (panelId === 'jog-panel') {
        const isHidden = panel.classList.contains('panel-user-hidden');
        setBaseJogGizmoEnabled(!isHidden && !el.baseJogView?.classList.contains('hidden'));
    }
    if (panelId === 'tcp-profile-panel' && panel.classList.contains('panel-user-hidden')) {
        setTcpSnapMode(false);
    }
    updatePanelLauncher(panelId);
    if (isVisible) bringPanelToFront(panelId);
    else updatePanelStack();
    if (panelId === 'virtual-controller-panel' && isVisible) {
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
        if (panelId === 'tcp-profile-panel') setTcpSnapMode(false);
        updatePanelLauncher(panelId);
        updatePanelStack();
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
    updatePanelStack();
    updatePanelLauncher(panelId);
}

function getPanelWindowTitle(panelId) {
    const panelName = panelId === 'program-panel'
        ? uiText('Program Panel')
        : panelId === 'tcp-profile-panel'
        ? uiText('TCP 설정')
        : panelId === 'virtual-controller-panel'
            ? uiText('컨트롤러 연결')
        : panelId === 'view-presets-panel'
            ? uiText('사용자 뷰')
        : panelId === 'interference-zone-panel'
            ? uiText('간섭영역 설정')
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
    bringPanelToFront(panelId);
    updatePanelLauncher(panelId);
}

function setupInterferenceZoneDialogDragging() {
    const dialog = el.interferenceZoneDialog;
    const header = dialog?.querySelector('.interference-zone-dialog-header');
    if (!dialog || !header) return;
    let drag = null;
    header.addEventListener('pointerdown', (event) => {
        if (event.button !== 0 || event.target.closest('button, input, select, textarea, a')) return;
        const rect = dialog.getBoundingClientRect();
        drag = {
            pointerId: event.pointerId,
            offsetX: event.clientX - rect.left,
            offsetY: event.clientY - rect.top
        };
        dialog.classList.add('interference-zone-is-dragging');
        header.setPointerCapture(event.pointerId);
        event.preventDefault();
    });
    header.addEventListener('pointermove', (event) => {
        if (!drag || drag.pointerId !== event.pointerId) return;
        const maxLeft = Math.max(0, window.innerWidth - dialog.offsetWidth);
        const maxTop = Math.max(0, window.innerHeight - dialog.offsetHeight);
        const left = THREE.MathUtils.clamp(event.clientX - drag.offsetX, 0, maxLeft);
        const top = THREE.MathUtils.clamp(event.clientY - drag.offsetY, 0, maxTop);
        dialog.style.left = `${left}px`;
        dialog.style.top = `${top}px`;
        dialog.style.transform = 'none';
    });
    const stopDrag = (event) => {
        if (!drag || (event.pointerId !== undefined && drag.pointerId !== event.pointerId)) return;
        drag = null;
        dialog.classList.remove('interference-zone-is-dragging');
    };
    header.addEventListener('pointerup', stopDrag);
    header.addEventListener('pointercancel', stopDrag);
    header.addEventListener('lostpointercapture', stopDrag);
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

function createModelTreePartNode(model, part) {
    const item = document.createElement('li');
    item.className = 'model-tree-part-node';
    item.setAttribute('role', 'treeitem');
    item.setAttribute('aria-selected', String(part === state.selectedModelPart));

    const row = document.createElement('div');
    row.className = 'model-tree-part-row';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'model-tree-part-visibility';
    checkbox.checked = part.visible !== false;
    checkbox.dataset.modelPartVisibility = part.userData.modelPartId;
    checkbox.setAttribute('aria-label', part.userData.modelPartName || 'PART');

    const button = document.createElement('button');
    button.type = 'button';
    button.className = `model-tree-part-button${part === state.selectedModelPart ? ' active' : ''}`;
    button.dataset.modelPartId = part.userData.modelPartId;
    button.title = `${part.userData.modelPartName || uiText('PART')} ${uiText('선택')}`;

    const icon = document.createElement('span');
    icon.className = 'model-tree-part-icon';
    icon.innerHTML = '<i class="fa-solid fa-cube"></i>';

    const name = document.createElement('span');
    name.className = 'model-tree-part-name';
    name.textContent = part.userData.modelPartName || uiText('PART');

    button.append(icon, name);
    row.append(checkbox, button);
    item.appendChild(row);
    return item;
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
    const parts = getImportedModelParts(model);
    if (children.length > 0 || parts.length > 0) {
        const childList = document.createElement('ul');
        childList.className = 'model-tree-children';
        childList.setAttribute('role', 'group');
        children.forEach((child) => childList.appendChild(createModelTreeNode(child)));
        parts.forEach((part) => childList.appendChild(createModelTreePartNode(model, part)));
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
    if (!model) {
        updateZeroPointCurrentMarker();
        return;
    }
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
    updateZeroPointCurrentMarker();
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
    if (state.zeroPointEdit.active) {
        const shouldEnableZeroPoint = Boolean(enabled);
        state.transformControls.visible = false;
        state.transformControls.enabled = false;
        state.transformControls.detach();
        state.zeroPointEdit.handlerVisible = shouldEnableZeroPoint;
        state.zeroPointEdit.transformControls.visible = shouldEnableZeroPoint;
        state.zeroPointEdit.transformControls.enabled = shouldEnableZeroPoint;
        state.zeroPointEdit.axes.visible = shouldEnableZeroPoint;
        updateTransformModeButtons();
        return;
    }
    const shouldEnable = Boolean(enabled && state.selectedModel && !state.zeroPointEdit.active);
    if (shouldEnable) setBaseJogGizmoEnabled(false);
    state.transformControls.visible = shouldEnable;
    state.transformControls.enabled = shouldEnable;
    if (shouldEnable) attachTransformControlsToSelectedModel();
    else state.transformControls.detach();
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

function setZeroPointEditorVisibility(visible) {
    el.modelBrowserPanel?.classList.toggle('zero-point-editing', visible);
    const defaultControls = [
        el.modelTransformPanel?.querySelector('.transform-mode-buttons'),
        el.modelNumericTransform,
        el.modelTransformPanel?.querySelector('.model-transform-help')
    ].filter(Boolean);
    defaultControls.forEach((control) => control.classList.toggle('hidden', visible));
    el.zeroPointEditor?.classList.toggle('hidden', !visible);
}

function updateZeroPointFrameScale(model) {
    if (!model || !state.zeroPointEdit.axes) return;
    const bounds = new THREE.Box3().setFromObject(model);
    const size = bounds.getSize(new THREE.Vector3());
    const length = size.length();
    const scale = THREE.MathUtils.clamp(Number.isFinite(length) && length > 0 ? length * 0.14 : 80, 25, 420);
    state.zeroPointEdit.axes.scale.setScalar(scale);
    state.zeroPointEdit.marker?.scale.setScalar(THREE.MathUtils.clamp(scale * 0.035, 3.5, 16));
    state.zeroPointEdit.transformControls?.setSize(THREE.MathUtils.clamp(scale / 125, 0.65, 1.35));
}

function readZeroPointEditorValues() {
    const origin = Object.fromEntries(['x', 'y', 'z'].map((axis) => [
        axis,
        el.zeroPointOriginInputs[axis]?.value.trim() === '' ? NaN : Number(el.zeroPointOriginInputs[axis]?.value)
    ]));
    const rotation = Object.fromEntries(['x', 'y', 'z'].map((axis) => [
        axis,
        el.zeroPointRotationInputs[axis]?.value.trim() === '' ? NaN : Number(el.zeroPointRotationInputs[axis]?.value)
    ]));
    return [...Object.values(origin), ...Object.values(rotation)].every(Number.isFinite)
        ? { origin, rotation }
        : null;
}

function applyZeroPointEditorInput(event) {
    const edit = state.zeroPointEdit;
    if (!edit.active || !edit.model) return;
    const originEntry = Object.entries(el.zeroPointOriginInputs).find(([, input]) => input === event.currentTarget);
    const rotationEntry = Object.entries(el.zeroPointRotationInputs).find(([, input]) => input === event.currentTarget);
    const entry = originEntry || rotationEntry;
    if (!entry || event.currentTarget.value.trim() === '') return;
    const value = Number(event.currentTarget.value);
    if (!Number.isFinite(value)) return;
    if (originEntry) edit.origin[entry[0]] = value;
    else edit.rotationDegrees[entry[0]] = value;
    updateZeroPointFrameFromState();
}

function applyModelZeroPointFrame(model, origin, rotationDegrees) {
    if (!model || !origin || !rotationDegrees) return false;
    const rotationQuaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(
        THREE.MathUtils.degToRad(rotationDegrees.x),
        THREE.MathUtils.degToRad(rotationDegrees.y),
        THREE.MathUtils.degToRad(rotationDegrees.z),
        'XYZ'
    )).normalize();
    const inverseFrameOffset = new THREE.Matrix4().compose(
        origin.clone(),
        rotationQuaternion,
        new THREE.Vector3(1, 1, 1)
    ).invert();
    const oldChildMatrices = new Map([...model.children].map((child) => {
        if (child.matrixAutoUpdate !== false) child.updateMatrix();
        return [child, child.matrix.clone()];
    }));
    oldChildMatrices.forEach((oldChildMatrix, child) => {
        child.matrix.copy(inverseFrameOffset).multiply(oldChildMatrix);
        child.matrixAutoUpdate = false;
        child.matrixWorldNeedsUpdate = true;
    });
    model.updateMatrixWorld(true);
    invalidateSimulationSnapCandidates();
    return true;
}

function getModelContextTarget() {
    const menu = el.modelContextMenu;
    const modelId = menu?.dataset.modelTreeId;
    const model = state.models.find((candidate) => candidate.userData.modelTreeId === modelId);
    if (!model?.userData?.uploaded) return null;
    const partId = menu?.dataset.modelPartId;
    const part = partId ? getImportedModelParts(model).find((candidate) => candidate.userData.modelPartId === partId) : null;
    if (partId && !part) return null;
    return { model, part: part || null };
}

function getImportedObjectColorHex(object) {
    let colorHex = null;
    object?.traverse?.((child) => {
        if (colorHex || !child.isMesh) return;
        const material = getMeshMaterials(child).find((candidate) => candidate?.color);
        if (material?.color) colorHex = `#${material.color.getHexString()}`;
    });
    return colorHex || '#bfc7d5';
}

function applyImportedModelColor(model, part, colorValue) {
    if (!model?.userData?.uploaded || !colorValue) return false;
    const target = part || model;
    const color = new THREE.Color(colorValue);
    const highlightedPart = state.selectedModelPart
        && (!part || state.selectedModelPart === part)
        && getImportedModelParts(model).includes(state.selectedModelPart)
        ? state.selectedModelPart
        : null;
    if (highlightedPart) setModelPartHighlight(highlightedPart, false);
    target.traverse((child) => {
        if (!child.isMesh) return;
        ensureModelPartMaterialIsolation(child);
        getMeshMaterials(child).forEach((material) => {
            if (!material?.color) return;
            material.color.copy(color);
            material.needsUpdate = true;
            child.userData.modelPartMaterials?.forEach((entry) => {
                if (entry.material === material && entry.color) entry.color.copy(color);
            });
        });
    });
    if (highlightedPart) setModelPartHighlight(highlightedPart, true);
    return true;
}

function openModelContextMenu(event, model, part = null) {
    const menu = el.modelContextMenu;
    if (!menu || !model?.userData?.uploaded) return;
    closeModelContextMenu();
    menu.dataset.modelTreeId = model.userData.modelTreeId;
    if (part) menu.dataset.modelPartId = part.userData.modelPartId;
    else delete menu.dataset.modelPartId;
    if (el.modelChangeZeroPoint) el.modelChangeZeroPoint.hidden = Boolean(part);
    if (el.modelColorPicker) el.modelColorPicker.value = getImportedObjectColorHex(part || model);
    menu.classList.remove('hidden');
    menu.style.left = '0px';
    menu.style.top = '0px';
    const bounds = menu.getBoundingClientRect();
    menu.style.left = `${Math.max(8, Math.min(event.clientX, window.innerWidth - bounds.width - 8))}px`;
    menu.style.top = `${Math.max(8, Math.min(event.clientY, window.innerHeight - bounds.height - 8))}px`;
}

function closeModelContextMenu() {
    if (!el.modelContextMenu) return;
    el.modelContextMenu.classList.add('hidden');
    delete el.modelContextMenu.dataset.modelTreeId;
    delete el.modelContextMenu.dataset.modelPartId;
    if (el.modelChangeZeroPoint) el.modelChangeZeroPoint.hidden = false;
}

function exitZeroPointEditor({ restoreModel = true } = {}) {
    const edit = state.zeroPointEdit;
    if (edit.snapMode) setZeroPointSnapMode(false);
    if (restoreModel && edit.model && edit.baseModelState) {
        restoreZeroPointModelState(edit.model, edit.baseModelState);
    }
    edit.transformControls?.detach();
    if (edit.transformControls) {
        edit.transformControls.visible = false;
        edit.transformControls.enabled = false;
    }
    if (edit.axes) edit.axes.visible = false;
    if (edit.frame) edit.frame.visible = false;
    edit.handlerVisible = false;
    edit.active = false;
    edit.model = null;
    edit.baseModelState = null;
    edit.historyBefore = null;
    edit.snapPoints = [];
    state.transformControls.visible = false;
    state.transformControls.enabled = false;
    state.transformControls.detach();
    setZeroPointEditorVisibility(false);
    updateZeroPointCurrentMarker();
    updateZeroPointMultiCenterControls();
    updateTransformModeButtons();
}

function openZeroPointEditor(model) {
    if (isMotionActive() || !model?.userData?.uploaded) return;
    closeModelContextMenu();
    if (state.snapMoveMode) {
        state.snapMoveMode = false;
        clearSimulationSnapFaceSelection({ invalidate: false });
        invalidateSimulationSnapCandidates();
        hideSimulationSnapMarker();
        resetSimulationSnapMarkerCameraScale();
        updateSimulationSnapButton();
    }
    if (state.tcpSnapMode) setTcpSnapMode(false);
    if (state.zeroPointEdit.active) exitZeroPointEditor();
    commitPendingHistory('수치 모델 변환', 'pendingNumericHistory');
    selectSceneModel(model);

    const edit = state.zeroPointEdit;
    edit.historyBefore = captureSceneSnapshot();
    model.updateMatrixWorld(true);
    edit.active = true;
    edit.model = model;
    edit.baseModelState = captureZeroPointModelState(model);
    edit.origin.set(0, 0, 0);
    edit.rotationDegrees.set(0, 0, 0);
    model.getWorldQuaternion(edit.baseWorldQuaternion);
    edit.snapType = readZeroPointSnapType();
    edit.snapRadiusPx = Number(el.zeroPointSnapRadius?.value) || 16;
    edit.snapMode = false;
    edit.handlerVisible = false;
    edit.frame.visible = true;
    edit.transformControls.attach(edit.frame);
    edit.transformControls.visible = false;
    edit.transformControls.enabled = false;
    updateZeroPointFrameScale(model);
    updateZeroPointEditorInputs();
    updateZeroPointFrameFromState();
    setZeroPointEditorVisibility(true);
    setTransformHandlesEnabled(false);
    updateZeroPointMultiCenterControls();
    setZeroPointSnapReadout('스냅 위치 선택을 누른 뒤 모델 형상 위로 포인터를 이동하세요.');
    setStatus('영점 변경 중입니다. 모델 영점과 좌표계 방향을 설정하세요.', '#60a5fa');
}

function applyZeroPointEditor() {
    const edit = state.zeroPointEdit;
    if (!edit.active || !edit.model) return;
    const values = readZeroPointEditorValues();
    if (!values) {
        setStatus('영점 좌표와 회전값을 확인하세요.', '#ef4444');
        return;
    }
    edit.origin.set(values.origin.x, values.origin.y, values.origin.z);
    edit.rotationDegrees.set(values.rotation.x, values.rotation.y, values.rotation.z);
    commitAllPendingHistories();
    const before = edit.historyBefore || captureSceneSnapshot();
    const target = edit.model;
    restoreZeroPointModelState(target, edit.baseModelState, false);
    applyModelZeroPointFrame(target, edit.origin, edit.rotationDegrees);
    const after = captureSceneSnapshot();
    recordHistory('모델 영점 변경', before, after);
    exitZeroPointEditor({ restoreModel: false });
    markSceneCollisionDirty(target);
    updateSelectedModelTransformInputs();
    renderModelTree();
    setStatus('모델 영점과 좌표계 방향을 적용했습니다.', '#22c55e');
}

function selectSceneModelPart(model, part) {
    if (!model || !part || !getImportedModelParts(model).includes(part)) return;
    selectSceneModel(model, { preservePart: true });
    setSelectedModelPart(part);
}

function selectSceneModel(model, options = {}) {
    if (isMotionActive()) return;
    if (model && !state.models.includes(model)) return;
    if (state.zeroPointEdit.active && model !== state.zeroPointEdit.model) {
        exitZeroPointEditor();
    }
    const preservePart = Boolean(options.preservePart);
    const currentPartBelongsToModel = state.selectedModelPart
        && model
        && getImportedModelParts(model).includes(state.selectedModelPart);
    if (!preservePart || !currentPartBelongsToModel) setSelectedModelPart(null);
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
    markSceneCollisionDirty(model);
    setSelectedTransformMode(rotationEntry ? 'rotate' : isScaleMode ? 'scale' : 'translate', false);
    setStatus('모델 변환이 적용되었습니다.', '#22c55e');
}

function refreshBackgroundModelLoading() {
    let indicator = el.canvasContainer?.querySelector('.background-loading-indicator');
    const activeLoads = [...state.backgroundModelLoads.values()];
    if (activeLoads.length === 0) {
        indicator?.remove();
        return;
    }
    if (!indicator) {
        indicator = document.createElement('div');
        indicator.className = 'background-loading-indicator';
        indicator.innerHTML = `
            <div class="background-loading-header">
                <div class="background-loading-label" data-background-loading-label></div>
            <strong data-background-loading-percent>0% · 남은 100%</strong>
            </div>
            <div class="background-loading-track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">
                <span data-background-loading-progress></span>
            </div>`;
        el.canvasContainer?.appendChild(indicator);
    }
    const currentLoad = activeLoads.at(-1) || { text: uiText('불러오는 중...'), progress: 0 };
    const label = indicator.querySelector('[data-background-loading-label]');
    const percentLabel = indicator.querySelector('[data-background-loading-percent]');
    const progressBar = indicator.querySelector('[data-background-loading-progress]');
    const progressTrack = indicator.querySelector('.background-loading-track');
    const progress = Math.max(0, Math.min(100, Number(currentLoad.progress) || 0));
    if (label) label.textContent = currentLoad.text;
    if (percentLabel) percentLabel.textContent = uiFormat('{progress}% · 남은 {remaining}%', {
        progress,
        remaining: 100 - progress
    });
    if (progressBar) progressBar.style.width = `${progress}%`;
    if (progressTrack) progressTrack.setAttribute('aria-valuenow', String(progress));
}

function beginBackgroundModelLoading(requestId, text) {
    state.backgroundModelLoads.set(requestId, { text, progress: 0 });
    refreshBackgroundModelLoading();
}

function updateBackgroundModelLoading(requestId, text, progress = null) {
    if (!state.backgroundModelLoads.has(requestId)) return;
    const previous = state.backgroundModelLoads.get(requestId);
    state.backgroundModelLoads.set(requestId, {
        text,
        progress: Number.isFinite(Number(progress)) ? Number(progress) : previous?.progress || 0
    });
    refreshBackgroundModelLoading();
}

function finishBackgroundModelLoading(requestId) {
    state.backgroundModelLoads.delete(requestId);
    refreshBackgroundModelLoading();
}

function discardUncommittedModel(model, type) {
    if (!model) return;
    model.removeFromParent();
    // Articulated STL geometry is shared by the worker-backed cache. Do not
    // dispose it here, otherwise a later load would reuse disposed buffers.
    if (type !== 'articulated-stl') disposeObjectResources(model);
}

async function loadModelFromServer(modelDefinition) {
    const isAddMode = Boolean(el.btnAddMode?.checked);
    if (isMotionActive() && !isAddMode) {
        setStatus('시뮬레이션 실행 중에는 Add Mode에서만 모델을 추가할 수 있습니다.', '#f59e0b');
        return;
    }

    const { file, folder, name, type = 'fbx' } = modelDefinition;
    const requestId = ++state.modelLoadRequestId;
    const loadLabel = '{name} 불러오는 중...';
    beginBackgroundModelLoading(requestId, uiFormat(loadLabel, { name }));
    setStatus(loadLabel, '#f59e0b', { name });

    try {
        const model = type === 'articulated-stl'
            ? await loadArticulatedRobot(modelDefinition, (p) => {
                updateBackgroundModelLoading(requestId, uiFormat('{name}: 로봇 링크', { name }), p);
            })
            : await loadFBX(`./models/${file}`, (p) => updateBackgroundModelLoading(
                requestId,
                uiFormat('{name}: 모델', { name }),
                p
            ));

        // A later replacement request wins. Add Mode requests are independent
        // and can finish in any order.
        if (!isAddMode && requestId !== state.modelLoadRequestId) {
            discardUncommittedModel(model, type);
            return;
        }

        const motionWasActive = isMotionActive();
        if (motionWasActive && !isAddMode) {
            discardUncommittedModel(model, type);
            setStatus('시뮬레이션이 시작되어 모델 교체를 취소했습니다.', '#f59e0b');
            return;
        }

        if (state.zeroPointEdit.active) exitZeroPointEditor();
        setTransformHandlesEnabled(false);
        setBaseJogGizmoEnabled(false);
        commitAllPendingHistories();
        const historyBefore = captureSceneSnapshot();

        // If not in Add Mode, clean up previous models only after the new
        // model has finished loading, so the current simulation stays usable.
        if (!isAddMode) cleanupScene();

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
        updateModelRenderComplexity(model);

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
        markSceneCollisionDirty();
        refreshCollisionDebugOverlays();
        if (type === 'articulated-stl') attachPendingToolModels(model);
        ensureModelTreeId(model);

        if (type === 'articulated-stl' && !motionWasActive) {
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
        if(!isAddMode) fitCamera();
        setStatus(isAddMode ? '{name} 추가 완료' : '{name} 불러오기 완료', '#22c55e', { name });
    } catch (err) {
        console.error('Load failed:', err);
        setStatus('{name} 불러오기 실패', '#ef4444', { name });
    } finally {
        finishBackgroundModelLoading(requestId);
    }
}

function loadFBX(url, onProgress) {
    return loadFBXInWorker(url, onProgress).catch((workerError) => {
        // Keep compatibility with browsers that cannot start module workers.
        console.warn('FBX worker unavailable; falling back to main-thread loading:', workerError);
        return new Promise((resolve, reject) => {
            new FBXLoader().load(url, resolve,
                (xhr) => { if (xhr.total > 0 && onProgress) onProgress(Math.round(xhr.loaded / xhr.total * 100)); },
                reject);
        });
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
    // P0 is the fixed mounting/base plate below J1. It is assembled to the
    // equipment in the real installation, so it must not report a collision.
    baseMesh.userData.collisionDisabled = true;
    baseMesh.userData.collisionRole = 'robot-mounted-base';
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
            // The final kinematic link is the Tool mounting link (J6 on a
            // 6-axis robot, J4 on SCARA). SCARA models that expose a J3 mesh
            // use it for the vertical ballscrew/mount assembly, which is also
            // mechanically occupied by the attached Tool. Exclude only these
            // attached Tool/mount contacts; other Tool-to-body checks stay on.
            const isAttachedToolMountAssembly = index === manifest.joints.length - 1
                || (manifest.robotType === 'scara' && jointDefinition.name === 'J3');
            linkMesh.userData.collisionIgnoreAttachedToolContact = isAttachedToolMountAssembly;
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
    const flangeFrame = new THREE.Group();
    flangeFrame.name = 'Tool flange';
    flangeFrame.position.copy(tcpPosition).sub(parentPivot);

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
        flangeFrame.quaternion.setFromRotationMatrix(
            new THREE.Matrix4().makeBasis(toolX, toolY, toolZ)
        );
    }
    robot.userData.toolHomeQuaternion = flangeFrame.quaternion.clone();

    parent.add(flangeFrame);
    robot.userData.flangeFrame = flangeFrame;

    const tcpFrame = new THREE.Group();
    tcpFrame.name = 'Active TCP';
    flangeFrame.add(tcpFrame);
    robot.userData.tcpFrame = tcpFrame;
    robot.userData.tcpProfiles = Array.from({ length: TCP_PROFILE_COUNT }, createDefaultTcpProfile);
    robot.userData.activeTcpProfileIndex = 0;

    const toolAxesAtTcp = new THREE.AxesHelper(TCP_AXES_LOCAL_SIZE);
    toolAxesAtTcp.name = 'Tool axes at TCP';
    applyAxesHelperColors(toolAxesAtTcp);
    const axesMaterials = Array.isArray(toolAxesAtTcp.material) ? toolAxesAtTcp.material : [toolAxesAtTcp.material];
    axesMaterials.forEach((material) => {
        material.depthTest = false;
        material.transparent = true;
    });
    toolAxesAtTcp.renderOrder = 20;
    toolAxesAtTcp.userData.cameraScaledSize = {
        localSize: TCP_AXES_LOCAL_SIZE,
        pixelSize: TCP_AXES_SCREEN_PIXELS
    };
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
        j3Mesh = false,
        j3ControllerLimits = null
    } = modelDefinition;
    if (!Array.isArray(structure) || !Array.isArray(limits) || !Array.isArray(jointSpeeds)) {
        throw new Error(`Robot kinematics are missing for ${name}.`);
    }
    // SCARA structure[3] stores the J3 ballscrew lead in mm/rev. The
    // simulator keeps the prismatic joint internally in millimeters, while
    // the controller/Joint display uses the equivalent output angle.
    const j3ScrewLeadMmPerRev = robotType === 'scara' ? Number(structure[3]) : null;
    if (robotType === 'scara' && (!Number.isFinite(j3ScrewLeadMmPerRev) || j3ScrewLeadMmPerRev <= 0)) {
        throw new Error(`SCARA J3 screw lead is invalid for ${name}.`);
    }
    const normalizedJ3ControllerLimits = robotType === 'scara' && Array.isArray(j3ControllerLimits)
        ? j3ControllerLimits.map(Number)
        : null;
    if (normalizedJ3ControllerLimits
        && (normalizedJ3ControllerLimits.length !== 2
            || normalizedJ3ControllerLimits.some((limit) => !Number.isFinite(limit))
            || normalizedJ3ControllerLimits[0] >= normalizedJ3ControllerLimits[1])) {
        throw new Error(`SCARA J3 controller limits are invalid for ${name}.`);
    }
    const robotJointLimits = limits.map((limit, index) => (
        robotType === 'scara' && index === 2 && normalizedJ3ControllerLimits
            ? normalizedJ3ControllerLimits.map((angle) => angle * j3ScrewLeadMmPerRev / 360)
            : limit
    ));
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
        min: robotJointLimits[index][0],
        max: robotJointLimits[index][1],
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
            j3ScrewLeadMmPerRev,
            j3ControllerLimits: normalizedJ3ControllerLimits,
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

function resetModelImportWorkerSession(session = state.modelImportWorkerSession, error = null) {
    if (!session) return;
    if (state.modelImportWorkerSession === session) state.modelImportWorkerSession = null;
    session.worker.terminate();
    if (error) {
        session.pending.forEach(({ reject }) => reject(error));
    }
    session.pending.clear();
}

function getModelImportWorkerSession() {
    if (state.modelImportWorkerSession) return state.modelImportWorkerSession;

    const workerUrl = new URL('./model-load-worker.js?v=20260721-background-model-2', import.meta.url);
    const worker = new Worker(workerUrl, { type: 'module' });
    const session = { worker, pending: new Map() };
    state.modelImportWorkerSession = session;

    worker.addEventListener('message', (event) => {
        const payload = event.data || {};
        const pending = session.pending.get(payload.requestId);
        if (!pending) return;
        if (payload.type === 'progress') {
            pending.onProgress?.(payload.progress);
            return;
        }
        session.pending.delete(payload.requestId);
        if (payload.type === 'done') pending.resolve(payload);
        else pending.reject(new Error(payload.message || 'Model worker failed.'));
    });
    worker.addEventListener('error', (event) => {
        event.preventDefault();
        resetModelImportWorkerSession(session, new Error(event.message || 'STL worker stopped unexpectedly.'));
    });
    return session;
}

function createSTLGeometryFromWorker(serialized) {
    if (!serialized?.attributes?.position?.array) {
        throw new Error('The STL worker returned invalid geometry data.');
    }
    const geometry = new THREE.BufferGeometry();
    Object.entries(serialized.attributes).forEach(([name, attribute]) => {
        if (!ArrayBuffer.isView(attribute.array)) return;
        geometry.setAttribute(
            name,
            new THREE.BufferAttribute(attribute.array, attribute.itemSize, attribute.normalized)
        );
    });
    if (ArrayBuffer.isView(serialized.index)) {
        geometry.setIndex(new THREE.BufferAttribute(serialized.index, 1));
    }
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    return geometry;
}

function loadSTLInWorker(url) {
    const session = getModelImportWorkerSession();
    const requestId = ++state.modelImportRequestId;
    return new Promise((resolve, reject) => {
        session.pending.set(requestId, { resolve, reject });
        session.worker.postMessage({ type: 'parse-stl', requestId, url });
    }).then((payload) => createSTLGeometryFromWorker(payload.geometry));
}

function createWorkerMaterial(definition = {}) {
    return new THREE.MeshStandardMaterial({
        color: Number.isInteger(definition.color) ? definition.color : 0xcccccc,
        roughness: Number.isFinite(definition.roughness) ? definition.roughness : 0.66,
        metalness: Number.isFinite(definition.metalness) ? definition.metalness : 0.06,
        transparent: Boolean(definition.transparent),
        opacity: Number.isFinite(definition.opacity) ? definition.opacity : 1,
        side: Number.isInteger(definition.side) ? definition.side : THREE.FrontSide
    });
}

function createFBXObjectFromWorker(serialized) {
    if (!serialized?.root || !Array.isArray(serialized.geometries)) {
        throw new Error('The FBX worker returned invalid model data.');
    }
    const geometries = serialized.geometries.map(createSTLGeometryFromWorker);
    const createNode = (definition) => {
        const geometry = Number.isInteger(definition.geometryId)
            ? geometries[definition.geometryId]
            : null;
        const materials = Array.isArray(definition.materials) && definition.materials.length
            ? definition.materials.map(createWorkerMaterial)
            : [createWorkerMaterial()];
        const object = definition.type === 'mesh' && geometry
            ? new THREE.Mesh(geometry, materials.length === 1 ? materials[0] : materials)
            : new THREE.Group();
        object.name = definition.name || '';
        if (Array.isArray(definition.position)) object.position.fromArray(definition.position);
        if (Array.isArray(definition.quaternion)) object.quaternion.fromArray(definition.quaternion);
        if (Array.isArray(definition.scale)) object.scale.fromArray(definition.scale);
        object.visible = definition.visible !== false;
        (definition.children || []).forEach((child) => object.add(createNode(child)));
        return object;
    };
    return createNode(serialized.root);
}

function loadFBXInWorker(url, onProgress) {
    const session = getModelImportWorkerSession();
    const requestId = ++state.modelImportRequestId;
    return new Promise((resolve, reject) => {
        session.pending.set(requestId, { resolve, reject, onProgress });
        session.worker.postMessage({ type: 'parse-fbx', requestId, url });
    }).then((payload) => createFBXObjectFromWorker(payload.model));
}

function loadSTL(url) {
    if (!stlGeometryCache.has(url)) {
        const request = loadSTLInWorker(url).catch((workerError) => {
            // Keep the viewer usable if a browser blocks module workers or the
            // worker CDN is unavailable. The fallback remains asynchronous.
            console.warn('STL worker unavailable; falling back to main-thread loading:', workerError);
            return new Promise((resolve, reject) => {
                new STLLoader().load(url, resolve, undefined, reject);
            });
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

function getRobotToolMountFrame(robot) {
    return robot?.userData.flangeFrame || robot?.userData.tcpFrame || null;
}

function mountToolModelAtActiveTcp(robot, model) {
    const tcpFrame = robot?.userData.tcpFrame;
    const mountFrame = getRobotToolMountFrame(robot);
    if (!tcpFrame || !mountFrame || !model) return false;

    // Align the file origin with the active TCP once. The physical tool then
    // stays fixed to the flange when the selected TCP profile changes.
    tcpFrame.add(model);
    model.position.set(0, 0, 0);
    model.quaternion.identity();
    model.scale.set(1, 1, 1);
    if (mountFrame !== tcpFrame) mountFrame.attach(model);
    model.userData.attachmentHost = robot;
    model.userData.attachmentFrame = 'flange';
    model.userData.placement = 'tcp';
    model.updateMatrixWorld(true);
    return true;
}

function isModelImportFileTooLarge(file) {
    return Number.isFinite(file?.size) && file.size > MAX_MODEL_IMPORT_SIZE_BYTES;
}

function formatModelImportFileSize(bytes) {
    const megabytes = Math.ceil(Number(bytes) / MEBIBYTE);
    return `${Number.isFinite(megabytes) ? megabytes : 0}MB`;
}

function rejectOversizedModelImport(file) {
    if (!isModelImportFileTooLarge(file)) return false;
    state.pendingImportFile = null;
    if (el.importDialog?.open) el.importDialog.close();
    alert(uiFormat(
        '3D 모델 파일은 최대 {limit}까지 불러올 수 있습니다.\n선택한 파일: {size}',
        {
            limit: `${MAX_MODEL_IMPORT_SIZE_BYTES / MEBIBYTE}MB`,
            size: formatModelImportFileSize(file.size)
        }
    ));
    return true;
}

function openImportDialog(file) {
    const extension = getFileExtension(file.name);
    if (!SUPPORTED_IMPORT_EXTENSIONS.has(extension)) {
        alert(uiText('지원하지 않는 형식입니다. STL, FBX, OBJ, GLB, GLTF, STP, STEP 파일을 선택해 주세요.'));
        return;
    }

    if (rejectOversizedModelImport(file)) return;

    state.pendingImportFile = file;
    el.importPlacement.value = 'scene';
    refreshImportPlacementOptions();
    refreshImportQualityOptions(extension);

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

function getSelectedStepImportQuality() {
    return STEP_IMPORT_QUALITY_PRESETS[el.importQuality?.value] || STEP_IMPORT_QUALITY_PRESETS.auto;
}

function refreshImportQualityOptions(extension = getFileExtension(state.pendingImportFile?.name || '')) {
    if (!el.importQuality) return;
    const isStep = extension === 'stp' || extension === 'step';
    el.importQuality.disabled = !isStep;
    if (!isStep) el.importQuality.value = 'auto';
    if (el.importQualityNote) {
        el.importQualityNote.textContent = isStep
            ? uiText('STEP/STP의 메시 정밀도와 처리 속도를 조절합니다.')
            : uiText('STEP/STP 가져오기에만 적용됩니다.')
    }
}

function getAutomaticSourceUpAxis(extension) {
    return Y_UP_IMPORT_EXTENSIONS.has(extension) ? 'y' : 'z';
}

function getStepTessellationParameters(fileSizeBytes, qualityKey = 'auto') {
    if (qualityKey === 'lightweight') {
        return { linearDeflection: 0.004, angularDeflection: 1.0 };
    }
    if (qualityKey === 'standard') {
        return { linearDeflection: 0.001, angularDeflection: 0.5 };
    }
    if (qualityKey === 'high') {
        return { linearDeflection: 0.00025, angularDeflection: 0.25 };
    }
    if (fileSizeBytes >= 150 * MEBIBYTE) {
        return { linearDeflection: 0.003, angularDeflection: 0.85 };
    }
    if (fileSizeBytes >= 50 * MEBIBYTE) {
        return { linearDeflection: 0.002, angularDeflection: 0.7 };
    }
    if (fileSizeBytes >= 20 * MEBIBYTE) {
        return { linearDeflection: 0.0015, angularDeflection: 0.6 };
    }
    return { linearDeflection: 0.001, angularDeflection: 0.5 };
}

function getLargeStepTessellationParameters(fileSizeBytes, qualityKey = 'auto') {
    if (qualityKey === 'lightweight') {
        if (fileSizeBytes >= 400 * MEBIBYTE) return { linearDeflectionAbsolute: 16, angularDeflection: 1.4 };
        if (fileSizeBytes >= 256 * MEBIBYTE) return { linearDeflectionAbsolute: 12, angularDeflection: 1.35 };
        if (fileSizeBytes >= 128 * MEBIBYTE) return { linearDeflectionAbsolute: 8, angularDeflection: 1.3 };
        return { linearDeflectionAbsolute: 6, angularDeflection: 1.25 };
    }
    if (qualityKey === 'standard') {
        if (fileSizeBytes >= 400 * MEBIBYTE) return { linearDeflectionAbsolute: 8, angularDeflection: 1.15 };
        if (fileSizeBytes >= 256 * MEBIBYTE) return { linearDeflectionAbsolute: 5, angularDeflection: 1.1 };
        if (fileSizeBytes >= 128 * MEBIBYTE) return { linearDeflectionAbsolute: 3, angularDeflection: 1.05 };
        return { linearDeflectionAbsolute: 2, angularDeflection: 1 };
    }
    if (qualityKey === 'high') {
        if (fileSizeBytes >= 400 * MEBIBYTE) return { linearDeflectionAbsolute: 4, angularDeflection: 0.8 };
        if (fileSizeBytes >= 256 * MEBIBYTE) return { linearDeflectionAbsolute: 3, angularDeflection: 0.75 };
        if (fileSizeBytes >= 128 * MEBIBYTE) return { linearDeflectionAbsolute: 2, angularDeflection: 0.7 };
        return { linearDeflectionAbsolute: 1, angularDeflection: 0.6 };
    }
    if (fileSizeBytes >= 400 * MEBIBYTE) {
        return { linearDeflectionAbsolute: 8, angularDeflection: 1.15 };
    }
    if (fileSizeBytes >= 256 * MEBIBYTE) {
        return { linearDeflectionAbsolute: 5, angularDeflection: 1.1 };
    }
    if (fileSizeBytes >= 128 * MEBIBYTE) {
        return { linearDeflectionAbsolute: 3, angularDeflection: 1.05 };
    }
    if (fileSizeBytes >= LARGE_MODEL_PERFORMANCE_MIN_BYTES) {
        return { linearDeflectionAbsolute: 2, angularDeflection: 1 };
    }
    return { linearDeflectionAbsolute: 1, angularDeflection: 0.8 };
}

function getStepImportCacheKey(file, parameters, qualityKey = 'auto') {
    return [
        'step-mesh-v3-cad-hierarchy',
        file.name,
        file.size,
        file.lastModified || 0,
        qualityKey,
        parameters.linearDeflectionAbsolute ?? parameters.linearDeflection,
        parameters.angularDeflection
    ].join('|');
}

function openStepImportCacheDb() {
    if (!('indexedDB' in window)) return Promise.resolve(null);
    if (state.stepImportCacheDbPromise) return state.stepImportCacheDbPromise;
    state.stepImportCacheDbPromise = new Promise((resolve) => {
        const request = window.indexedDB.open(STEP_IMPORT_CACHE_DB_NAME, STEP_IMPORT_CACHE_VERSION);
        request.addEventListener('upgradeneeded', () => {
            const db = request.result;
            const store = db.objectStoreNames.contains(STEP_IMPORT_CACHE_STORE_NAME)
                ? request.transaction.objectStore(STEP_IMPORT_CACHE_STORE_NAME)
                : db.createObjectStore(STEP_IMPORT_CACHE_STORE_NAME, { keyPath: 'key' });
            if (!store.indexNames.contains('savedAt')) store.createIndex('savedAt', 'savedAt');
        });
        request.addEventListener('success', () => resolve(request.result));
        request.addEventListener('error', () => resolve(null));
        request.addEventListener('blocked', () => resolve(null));
    });
    return state.stepImportCacheDbPromise;
}

async function readStepImportCache(key) {
    const db = await openStepImportCacheDb();
    if (!db) return null;
    return new Promise((resolve) => {
        try {
            const transaction = db.transaction(STEP_IMPORT_CACHE_STORE_NAME, 'readonly');
            const request = transaction.objectStore(STEP_IMPORT_CACHE_STORE_NAME).get(key);
            request.addEventListener('success', () => resolve(request.result || null));
            request.addEventListener('error', () => resolve(null));
        } catch (_) {
            resolve(null);
        }
    });
}

async function deleteStepImportCache(key) {
    const db = await openStepImportCacheDb();
    if (!db) return;
    try {
        db.transaction(STEP_IMPORT_CACHE_STORE_NAME, 'readwrite')
            .objectStore(STEP_IMPORT_CACHE_STORE_NAME)
            .delete(key);
    } catch (_) {
        // Cache cleanup must never block importing the original STEP file.
    }
}

async function writeStepImportCache(record) {
    const db = await openStepImportCacheDb();
    if (!db) return;
    try {
        const transaction = db.transaction(STEP_IMPORT_CACHE_STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STEP_IMPORT_CACHE_STORE_NAME);
        store.put(record);
        const countRequest = store.count();
        countRequest.addEventListener('success', () => {
            let entriesToDelete = Math.max(countRequest.result - STEP_IMPORT_CACHE_MAX_ENTRIES, 0);
            if (!entriesToDelete) return;
            const cursorRequest = store.index('savedAt').openCursor();
            cursorRequest.addEventListener('success', () => {
                const cursor = cursorRequest.result;
                if (!cursor || entriesToDelete <= 0) return;
                cursor.delete();
                entriesToDelete -= 1;
                cursor.continue();
            });
        });
    } catch (error) {
        console.warn('STEP cache write failed:', error);
    }
}

function scheduleStepImportCacheWrite(record) {
    const write = () => { void writeStepImportCache(record); };
    if ('requestIdleCallback' in window) window.requestIdleCallback(write, { timeout: 3000 });
    else window.setTimeout(write, 500);
}

function resetStepImportWorkerSession(session = state.stepImportWorkerSession) {
    if (!session) return;
    if (state.stepImportWorkerSession === session) state.stepImportWorkerSession = null;
    session.worker.terminate();
}

function getStepImportWorkerSession() {
    if (state.stepImportWorkerSession) return state.stepImportWorkerSession;

    const workerUrl = new URL('./step-import-worker.js?v=20260721-large-step-chunked-snap-face-groups-3-navigation-snap-1', import.meta.url);
    const worker = new Worker(workerUrl);
    let readySettled = false;
    let resolveReady;
    let rejectReady;
    const readyPromise = new Promise((resolve, reject) => {
        resolveReady = resolve;
        rejectReady = reject;
    });
    const session = { worker, readyPromise };
    state.stepImportWorkerSession = session;

    const finishReady = (error = null) => {
        if (readySettled) return;
        readySettled = true;
        worker.removeEventListener('message', handleReadyMessage);
        worker.removeEventListener('error', handleReadyError);
        if (error) {
            resetStepImportWorkerSession(session);
            rejectReady(error);
        } else {
            resolveReady(session);
        }
    };
    const handleReadyMessage = (event) => {
        const payload = event.data || {};
        if (payload.type === 'ready') finishReady();
        else if (payload.type === 'error' && payload.requestId == null) {
            finishReady(new Error(payload.message || 'STEP worker initialization failed.'));
        }
    };
    const handleReadyError = (event) => {
        event.preventDefault();
        finishReady(new Error(event.message || 'STEP worker initialization failed.'));
    };
    worker.addEventListener('message', handleReadyMessage);
    worker.addEventListener('error', handleReadyError);
    worker.postMessage({ type: 'init' });
    return session;
}

function warmStepImportWorker() {
    getStepImportWorkerSession().readyPromise.catch((error) => {
        console.warn('STEP worker warm-up failed:', error);
    });
}

function scheduleStepImportWorkerWarmup() {
    if ('requestIdleCallback' in window) {
        window.requestIdleCallback(warmStepImportWorker, { timeout: 2000 });
    } else {
        window.setTimeout(warmStepImportWorker, 750);
    }
}

function createStepMeshFromWorker(meshDefinition, index, placement, performanceMode = false) {
    const positions = meshDefinition?.positions;
    const indices = meshDefinition?.indices;
    if (!(positions instanceof Float32Array) || positions.length < 9
        || !ArrayBuffer.isView(indices) || indices.length < 3) {
        throw new Error('The STEP worker returned invalid mesh data.');
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setIndex(new THREE.BufferAttribute(indices, 1));
    if (meshDefinition.normals instanceof Float32Array
        && meshDefinition.normals.length === positions.length) {
        geometry.setAttribute('normal', new THREE.BufferAttribute(meshDefinition.normals, 3));
    } else {
        geometry.computeVertexNormals();
    }
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();

    const material = createImportedPlacementMaterial(placement, null, performanceMode);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = meshDefinition.partName || meshDefinition.name || `STEP Surface ${index + 1}`;
    mesh.userData.importColorRole = placement;
    mesh.userData.cadPartKey = meshDefinition.partId || `cad-mesh-${index}`;
    mesh.userData.cadPartName = meshDefinition.partName || meshDefinition.name || mesh.name;
    mesh.userData.largeModelMode = performanceMode;
    mesh.userData.largeModelChunk = Boolean(performanceMode && meshDefinition.largeModelChunk);
    mesh.userData.largeModelChunkIndex = Number(meshDefinition.chunkIndex) || 0;
    mesh.userData.largeModelChunkCount = Number(meshDefinition.chunkCount) || 1;
    if (Array.isArray(meshDefinition.brepFaces) && meshDefinition.brepFaces.length) {
        // A malformed range must never turn a face click into a whole-chunk
        // snap search. Invalid data falls back to the hit triangle.
        mesh.userData.stepBrepFaces = meshDefinition.brepFaces;
        if (!getValidatedStepBrepFaces(mesh)) mesh.userData.stepBrepFaces = null;
    }
    return mesh;
}

async function parseStepBufferInWorker(fileBuffer, parameters, engine, fileName, onMesh, onProgress) {
    onProgress?.({ phase: 'engine' });
    const session = getStepImportWorkerSession();
    await session.readyPromise;
    if (state.stepImportWorkerSession !== session) {
        throw new Error('STEP worker restarted before the import began.');
    }

    return new Promise((resolve, reject) => {
        const { worker } = session;
        const requestId = ++state.stepImportRequestId;
        let settled = false;

        const finish = (callback, value, resetWorker = false) => {
            if (settled) return;
            settled = true;
            worker.removeEventListener('message', handleMessage);
            worker.removeEventListener('error', handleError);
            if (resetWorker) resetStepImportWorkerSession(session);
            callback(value);
        };

        const handleMessage = (event) => {
            const payload = event.data || {};
            if (payload.requestId !== requestId) return;
            if (payload.type === 'mesh') {
                try {
                    onMesh(payload.mesh);
                } catch (error) {
                    finish(reject, error, true);
                }
                return;
            }
            if (payload.type === 'progress') {
                onProgress?.(payload);
                return;
            }
            if (payload.type === 'done') {
                finish(resolve, payload, true);
                return;
            }
            if (payload.type === 'error') {
                finish(reject, new Error(payload.message || 'STEP worker stopped unexpectedly.'), true);
            }
        };
        const handleError = (event) => {
            event.preventDefault();
            finish(reject, new Error(event.message || 'STEP worker stopped unexpectedly.'), true);
        };
        worker.addEventListener('message', handleMessage);
        worker.addEventListener('error', handleError);

        worker.postMessage({
            type: 'parse',
            requestId,
            fileBuffer,
            engine,
            fileName,
            parameters: {
                linearUnit: 'millimeter',
                linearDeflectionType: 'bounding_box_ratio',
                ...parameters
            }
        }, [fileBuffer]);
    });
}

async function parseStepFile(file, placement, qualityKey = 'auto') {
    const group = new THREE.Group();
    group.name = 'STEP Assembly';
    try {
        const useLargeFileEngine = file.size >= STEP_LARGE_FILE_ENGINE_MIN_BYTES;
        const performanceMode = file.size >= LARGE_MODEL_PERFORMANCE_MIN_BYTES;
        group.userData.largeModelMode = performanceMode;
        const parameters = useLargeFileEngine
            ? getLargeStepTessellationParameters(file.size, qualityKey)
            : getStepTessellationParameters(file.size, qualityKey);
        const cacheEnabled = file.size <= STEP_IMPORT_CACHE_MAX_SOURCE_BYTES;
        const cacheKey = cacheEnabled ? getStepImportCacheKey(file, parameters, qualityKey) : null;
        const cached = cacheEnabled ? await readStepImportCache(cacheKey) : null;
        if (cached?.meshes?.length) {
            try {
                showLoading(true, `${file.name} · STEP Cache`);
                for (let index = 0; index < cached.meshes.length; index += 1) {
                    group.add(createStepMeshFromWorker(cached.meshes[index], index, placement, performanceMode));
                    if (index > 0 && index % 4 === 0) await yieldToAnimationFrame();
                }
                group.name = cached.rootName || group.name;
                return group;
            } catch (error) {
                disposeObjectResources(group);
                group.clear();
                await deleteStepImportCache(cacheKey);
                console.warn('Discarded invalid STEP cache entry:', error);
            }
        }

        const fileBuffer = await file.arrayBuffer();
        const cacheMeshes = cacheEnabled ? [] : null;
        const result = await parseStepBufferInWorker(
            fileBuffer,
            parameters,
            useLargeFileEngine ? 'large' : 'standard',
            file.name,
            (meshDefinition) => {
                cacheMeshes?.push(meshDefinition);
                group.add(createStepMeshFromWorker(
                    meshDefinition,
                    group.children.length,
                    placement,
                    performanceMode
                ));
            },
            ({ phase, sourceMeshCount }) => {
                const phaseLabel = phase === 'engine'
                    ? 'STEP Engine'
                    : phase === 'reading'
                        ? 'STEP Reading'
                    : phase === 'packing'
                        ? `STEP Mesh ${sourceMeshCount || ''}`.trim()
                        : 'STEP Tessellation';
                showLoading(true, `${file.name} · ${phaseLabel}`);
            }
        );
        group.name = result.rootName || group.name;
        if (group.children.length === 0) {
            throw new Error('The STEP file contains no triangulated mesh.');
        }
        if (cacheEnabled) {
            scheduleStepImportCacheWrite({
                key: cacheKey,
                savedAt: Date.now(),
                rootName: group.name,
                meshes: cacheMeshes
            });
        }
        return group;
    } catch (error) {
        disposeObjectResources(group);
        throw error;
    }
}

async function parseUploaded3DFile(file, extension, placement, qualityKey = 'auto') {
    if (isModelImportFileTooLarge(file)) {
        throw new Error('The model file exceeds the 500 MB import limit.');
    }
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
        return parseStepFile(file, placement, qualityKey);
    }
    throw new Error(`Unsupported file extension: ${extension}`);
}

function prepareImportedObject(object, performanceMode = false) {
    let meshCount = 0;
    object.traverse((child) => {
        if (!child.isMesh) return;
        meshCount += 1;
        child.userData.largeModelMode = performanceMode;
        if (!child.geometry.getAttribute('normal')) child.geometry.computeVertexNormals();
        if (!child.material) {
            child.material = new THREE.MeshStandardMaterial({
                color: 0xbfc7d5,
                roughness: 0.6,
                metalness: 0.15
            });
        }
        child.castShadow = !performanceMode;
        child.receiveShadow = !performanceMode;
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        materials.forEach((material) => {
            if (material) material.needsUpdate = true;
        });
    });
    return meshCount;
}

function createImportedPlacementMaterial(placement, source = null, performanceMode = false) {
    const color = IMPORT_PLACEMENT_COLORS[placement] ?? IMPORT_PLACEMENT_COLORS.scene;
    const MaterialClass = performanceMode ? THREE.MeshLambertMaterial : THREE.MeshStandardMaterial;
    return new MaterialClass({
        color,
        ...(performanceMode ? {} : {
            roughness: placement === 'tcp' ? 0.48 : 0.64,
            metalness: placement === 'tcp' ? 0.18 : 0.06
        }),
        side: source?.side ?? THREE.FrontSide,
        transparent: Boolean(source?.transparent || (source?.opacity ?? 1) < 1),
        opacity: source?.opacity ?? 1,
        depthTest: source?.depthTest ?? true,
        depthWrite: source?.depthWrite ?? true
    });
}

function applyImportedPlacementColor(object, placement, performanceMode = false) {
    object.traverse((child) => {
        if (!child.isMesh) return;
        const sourceMaterials = Array.isArray(child.material) ? child.material : [child.material];
        const materials = sourceMaterials.map((source) => (
            createImportedPlacementMaterial(placement, source, performanceMode)
        ));
        child.material = Array.isArray(child.material) ? materials : materials[0];
        child.userData.importColorRole = placement;
    });
}

function getMeshMaterials(mesh) {
    return Array.isArray(mesh?.material) ? mesh.material : [mesh?.material];
}

function ensureModelPartMaterialIsolation(mesh) {
    if (!mesh?.isMesh || mesh.userData.modelPartMaterials) return;
    const sourceMaterials = getMeshMaterials(mesh);
    const isolatedMaterials = sourceMaterials.map((material) => material?.clone?.() || material);
    mesh.material = Array.isArray(mesh.material) ? isolatedMaterials : isolatedMaterials[0];
    mesh.userData.modelPartMaterials = isolatedMaterials.map((material) => ({
        material,
        color: material?.color?.clone?.() || null,
        emissive: material?.emissive?.clone?.() || null,
        emissiveIntensity: Number.isFinite(material?.emissiveIntensity) ? material.emissiveIntensity : null
    }));
}

function setModelPartHighlight(part, highlighted) {
    if (!part) return;
    part.traverse((child) => {
        if (!child.isMesh) return;
        ensureModelPartMaterialIsolation(child);
        child.userData.modelPartMaterials?.forEach(({ material, color, emissive, emissiveIntensity }) => {
            if (!material) return;
            if (highlighted) {
                if (material.emissive) {
                    material.emissive.setHex(MODEL_PART_SELECTION_COLOR);
                    material.emissiveIntensity = Math.max(emissiveIntensity ?? 0, 0.72);
                } else if (material.color) {
                    material.color.setHex(MODEL_PART_SELECTION_COLOR);
                }
            } else {
                if (color && material.color) material.color.copy(color);
                if (emissive && material.emissive) material.emissive.copy(emissive);
                if (emissiveIntensity !== null && 'emissiveIntensity' in material) {
                    material.emissiveIntensity = emissiveIntensity;
                }
            }
            material.needsUpdate = true;
        });
    });
}

function getImportedModelParts(model) {
    return Array.isArray(model?.userData?.importedParts) ? model.userData.importedParts : [];
}

const IMPORT_PART_GENERIC_NAME_PATTERN = /^(?:scene|root|rootnode|model|group|object|mesh|node|geometry|default)$/i;
const IMPORT_PART_BODY_NAME_PATTERN = /^body(?:[_ -]?\d+)?$/i;
const IMPORT_PART_CAD_NAME_PATTERN = /^(?:base|j\d+|cable(?:[_ -]?\d+)?|screw(?:[_ -]?\d+)?|working[_ -]?range(?:[_ -]?\d+)?|workspace(?:[_ -]?\d+)?|tool|flange)(?:[_ -]?\d+)?$/i;

function getImportedHierarchyPartRoot(mesh, content) {
    let fallback = null;
    let current = mesh?.parent || null;
    while (current && current !== content) {
        const name = String(current.name || '').trim();
        if (name && !IMPORT_PART_BODY_NAME_PATTERN.test(name)
            && !IMPORT_PART_GENERIC_NAME_PATTERN.test(name)) {
            if (!fallback) fallback = current;
            if (IMPORT_PART_CAD_NAME_PATTERN.test(name)) return current;
        }
        current = current.parent;
    }
    return fallback;
}

function registerImportedModelParts(model, content, performanceMode = false) {
    const meshList = [];
    content?.traverse?.((child) => {
        if (child.isMesh) meshList.push(child);
    });
    const groups = new Map();
    meshList.forEach((mesh, index) => {
        const hierarchyRoot = mesh.userData.cadPartKey
            ? null
            : getImportedHierarchyPartRoot(mesh, content);
        const cadPartKey = mesh.userData.cadPartKey
            || (hierarchyRoot ? `hierarchy-${hierarchyRoot.uuid}` : `mesh-${mesh.uuid}`);
        let group = groups.get(cadPartKey);
        if (!group) {
            group = {
                key: cadPartKey,
                name: hierarchyRoot?.name || mesh.userData.cadPartName || mesh.name || uiFormat('Part {index}', { index: index + 1 }),
                sourceNode: hierarchyRoot,
                meshes: []
            };
            groups.set(cadPartKey, group);
        }
        group.meshes.push(mesh);
    });

    const parts = [];
    const nameCounts = new Map();
    groups.forEach((group) => {
        const count = (nameCounts.get(group.name) || 0) + 1;
        nameCounts.set(group.name, count);
        const displayName = count > 1 ? `${group.name} #${count}` : group.name;
        // Keep the loader's CAD group in place so its original transforms and
        // hierarchy remain intact; only STEP mesh buckets need a new wrapper.
        const sourceNode = group.sourceNode && group.sourceNode !== content
            ? group.sourceNode
            : null;
        const part = sourceNode || (group.meshes.length === 1 ? group.meshes[0] : new THREE.Group());
        if (!sourceNode && part !== group.meshes[0]) {
            part.name = displayName;
            content.add(part);
            group.meshes.forEach((mesh) => part.add(mesh));
        }
        if (sourceNode) sourceNode.name = displayName;
        state.modelPartIdCounter += 1;
        part.userData.modelPartId = `scene-model-part-${state.modelPartIdCounter}`;
        part.userData.modelPartName = displayName;
        part.userData.cadPartKey = group.key;
        if (!performanceMode) {
            group.meshes.forEach((mesh) => ensureModelPartMaterialIsolation(mesh));
        }
        parts.push(part);
    });
    model.userData.importedParts = parts;
    return parts;
}

function findImportedModelPart(partId) {
    if (!partId) return null;
    for (const model of state.models) {
        const part = getImportedModelParts(model).find((candidate) => candidate.userData.modelPartId === partId);
        if (part) return { model, part };
    }
    return null;
}

function setSelectedModelPart(part) {
    if (state.selectedModelPart === part) return;
    setModelPartHighlight(state.selectedModelPart, false);
    state.selectedModelPart = part || null;
    setModelPartHighlight(state.selectedModelPart, true);
    renderModelTree();
}

function setModelPartVisibility(model, part, visible, recordHistoryChange = true) {
    if (!model || !part || !getImportedModelParts(model).includes(part)) return;
    const nextVisible = Boolean(visible);
    if (part.visible === nextVisible) return;
    const historyBefore = recordHistoryChange && !state.historySuspended ? captureSceneSnapshot() : null;
    part.visible = nextVisible;
    markSceneCollisionDirty(model);
    if (!nextVisible && state.selectedModelPart === part) setSelectedModelPart(null);
    invalidateSimulationSnapCandidates();
    renderModelTree();
    if (historyBefore) recordHistory('모델 변환', historyBefore, captureSceneSnapshot());
}

function getImportErrorDetail(error, extension) {
    const message = String(error?.message || '').trim();
    if (extension === 'stp' || extension === 'step') {
        if (/memory|allocation|array buffer|worker stopped|out of bounds|abort/i.test(message)) {
            return uiText('브라우저 메모리가 부족하거나 STEP 형상이 너무 복잡합니다.');
        }
        if (/no triangulated mesh|no renderable mesh/i.test(message)) {
            return uiText('STEP 파일에 표시 가능한 메시가 없습니다.');
        }
        if (/opencascade|could not convert|could not be read/i.test(message)) {
            return uiText('STEP 형상을 해석하지 못했습니다.');
        }
        if (/failed to fetch|importscripts|parser is unavailable|networkerror/i.test(message)) {
            return uiText('STEP 변환 엔진을 불러오지 못했습니다. 네트워크 연결을 확인해 주세요.');
        }
    }
    return message || uiText('알 수 없는 오류가 발생했습니다.');
}

function getImportErrorMessage(error, extension) {
    const message = getImportErrorDetail(error, extension);
    if (extension === 'gltf') {
        return uiFormat('3D 파일을 불러오지 못했습니다.\n{message}\n\n외부 파일을 참조하는 GLTF는 GLB로 변환해서 사용해 주세요.', { message });
    }
    if (extension === 'stp' || extension === 'step') {
        return uiFormat('STEP 파일을 불러오지 못했습니다.\n{message}\n\n파일이 매우 크거나 형상이 복잡한 경우 CAD에서 불필요한 부품을 제거하거나 GLB/STL로 내보낸 뒤 다시 시도해 주세요.', { message });
    }
    return uiFormat('3D 파일을 불러오지 못했습니다.\n{message}', { message });
}

async function handle3DImport(options = {}) {
    const file = state.pendingImportFile;
    if (!file) return null;
    if (rejectOversizedModelImport(file)) return null;
    if (state.zeroPointEdit.active) exitZeroPointEditor();
    invalidateSimulationSnapCandidates();
    if (state.snapMoveMode) {
        state.snapMoveMode = false;
        clearSimulationSnapFaceSelection({ invalidate: false });
        invalidateSimulationSnapCandidates();
        hideSimulationSnapMarker();
        resetSimulationSnapMarkerCameraScale();
        updateSimulationSnapButton();
    }
    setTransformHandlesEnabled(false);
    setBaseJogGizmoEnabled(false);
    commitAllPendingHistories();
    const historyBefore = captureSceneSnapshot();

    const extension = getFileExtension(file.name);
    const performanceMode = file.size >= LARGE_MODEL_PERFORMANCE_MIN_BYTES;
    const placement = el.importPlacement.value;
    const importQuality = getSelectedStepImportQuality();
    const robot = placement === 'tcp' ? getArticulatedRobotForAttachment() : null;
    if (placement === 'tcp' && !robot) {
        alert(uiText('TCP에 장착할 로봇을 먼저 불러와 주세요.'));
        return null;
    }

    const upAxis = getAutomaticSourceUpAxis(extension);
    el.btnConfirmImport.disabled = true;
    if (el.importDialog.open) el.importDialog.close();
    showLoading(true, uiFormat('{name} 가져오는 중...', { name: file.name }));
    setStatus('가져오는 중', '#f59e0b');

    let importedModel = null;
    try {
        const content = await parseUploaded3DFile(file, extension, placement, importQuality.key);
        if (extension === 'fbx') applyFBXMaterial(content);
        const meshCount = prepareImportedObject(content, performanceMode);
        if (meshCount === 0) throw new Error('The file contains no renderable mesh.');
        if (extension !== 'stp' && extension !== 'step') {
            applyImportedPlacementColor(content, placement, performanceMode);
        }

        importedModel = new THREE.Group();
        importedModel.name = `Imported: ${file.name}`;
        importedModel.add(content);
        importedModel.userData.modelName = file.name;
        importedModel.userData.uploaded = true;
        importedModel.userData.sourceExtension = extension;
        importedModel.userData.sourceUnit = 'mm';
        importedModel.userData.sourceUpAxis = placement === 'tcp' ? 'tool' : upAxis;
        importedModel.userData.placement = placement;
        importedModel.userData.sourceFileSize = file.size;
        importedModel.userData.largeModelMode = performanceMode;
        importedModel.userData.importQuality = importQuality.key;
        if (options.testModel) importedModel.userData.testModel = true;

        // Only free-standing 3D models are normalized into the viewer's Z-Up axes.
        // TCP tools preserve file XYZ and inherit the robot's Tool XYZ frame 1:1.
        if (placement === 'scene' && upAxis === 'y') importedModel.rotateX(Math.PI / 2);

        if (placement === 'tcp') {
            mountToolModelAtActiveTcp(robot, importedModel);
            if (options.testToolPositionZero) importedModel.position.set(0, 0, 0);
            if (options.testToolRotationX && robot.userData.manifest?.robotType === 'scara') {
                importedModel.rotateX(Math.PI);
            }
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
        updateModelRenderComplexity(importedModel);

        state.models.push(importedModel);
        markSceneCollisionDirty();
        refreshCollisionDebugOverlays();
        ensureModelTreeId(importedModel);
        registerImportedModelParts(importedModel, content, performanceMode);

        updateUIStatus();
        selectSceneModel(importedModel);
        recordHistory(placement === 'tcp' ? 'TCP 툴 불러오기' : '3D 모델링 불러오기', historyBefore, captureSceneSnapshot());
        fitCamera();
        if (placement === 'tcp') {
            setStatus('Tool이 TCP에 부착되었습니다.', '#22c55e');
        } else if (performanceMode) {
            setStatus('3D 모델링 불러오기 완료 · {quality}', '#22c55e', {
                quality: uiText(importQuality.label)
            });
        } else {
            setStatus('3D 모델링 불러오기 완료', '#22c55e');
        }
        return importedModel;
    } catch (error) {
        console.error('3D import failed:', error);
        importedModel?.removeFromParent();
        if (importedModel) disposeObjectResources(importedModel);
        applySceneSnapshot(historyBefore);
        const errorDetail = getImportErrorDetail(error, extension);
        if (errorDetail) {
            setStatus('가져오기 오류: {message}', '#ef4444', { message: errorDetail });
        } else {
            setStatus('가져오기 오류', '#ef4444');
        }
        if (!options.suppressErrorAlert) alert(getImportErrorMessage(error, extension));
        return null;
    } finally {
        state.pendingImportFile = null;
        el.btnConfirmImport.disabled = false;
        showLoading(false);
    }
}

function isTestModel(model) {
    return Boolean(model?.userData?.testModel)
        || TEST_MODEL_FILE_NAMES.has(model?.userData?.modelName);
}

function removeExistingTestModels() {
    const testModels = state.models.filter(isTestModel);
    if (!testModels.length) return false;

    if (state.zeroPointEdit.active && testModels.includes(state.zeroPointEdit.model)) {
        exitZeroPointEditor();
    }
    invalidateSimulationSnapCandidates();
    setBaseJogGizmoEnabled(false);
    state.transformControls.detach();
    closeModelContextMenu();

    const removedSelectedModel = testModels.includes(state.selectedModel);
    testModels.forEach((model) => {
        if (model.userData.motionInstanceId) state.motionPrograms.delete(model.userData.motionInstanceId);
        disposeCollisionDebugForModel(model);
        disposeModelOutlines(model);
        model.removeFromParent();
        disposeObjectResources(model);
    });
    state.models = state.models.filter((model) => !testModels.includes(model));
    markSceneCollisionDirty();
    if (removedSelectedModel) {
        state.selectedModel = null;
        state.selectedModelPart = null;
    }

    updateUIStatus();
    if (!state.selectedModel) {
        selectSceneModel(state.activeArticulatedModel || state.models.at(-1) || null);
    }
    return true;
}

function applyTestTcpProfile(robot) {
    if (!robot?.userData?.tcpFrame) return false;
    if (state.activeArticulatedModel !== robot) {
        state.activeArticulatedModel = robot;
        renderJogControls(robot);
    }
    commitAllPendingHistories();
    const before = captureSceneSnapshot();
    clearTcpProfileLive(robot);
    const profiles = ensureRobotTcpProfiles(robot);
    const profile = profiles[0];
    robot.userData.activeTcpProfileIndex = 0;
    const isScara = robot.userData.manifest?.robotType === 'scara';
    profile.position.set(200, 0, isScara ? -33 : 33);
    profile.quaternion.identity();
    syncActiveTcpFrame(robot);
    captureCurrentTcpTarget(robot);
    refreshTcpProfileUi(robot);
    setTcpProfileStatus('Test TCP 1 값을 적용했습니다.', 'success');
    recordHistory('Test TCP 1 설정', before, captureSceneSnapshot());
    return true;
}

async function loadTestModelAssetFile(assetPath) {
    const response = await fetch(assetPath, { cache: 'no-store' });
    if (!response.ok) {
        throw new Error(`Test asset request failed (${response.status}): ${assetPath}`);
    }
    const blob = await response.blob();
    const name = assetPath.split('/').pop() || 'test-model';
    return new File([blob], name, { type: blob.type || 'application/octet-stream' });
}

async function importTestModelFile(file, placement, options = {}) {
    state.pendingImportFile = file;
    if (el.importPlacement) el.importPlacement.value = placement;
    if (el.importQuality) el.importQuality.value = 'auto';
    return handle3DImport({ ...options, suppressErrorAlert: true });
}

async function handleTestModelImport() {
    if (isMotionActive()) {
        setStatus('모션 실행 중에는 테스트 모델을 적용할 수 없습니다.', '#f59e0b');
        return;
    }
    if (!await requestTestModelConfirmation()) return;

    const robot = getArticulatedRobotForAttachment();
    if (!robot) {
        alert(uiText('Tool을 장착할 로봇을 먼저 불러와 주세요.'));
        return;
    }

    el.btnTestModel.disabled = true;
    try {
        const [equipmentFile, toolFile] = await Promise.all([
            loadTestModelAssetFile(TEST_MODEL_ASSET_PATHS.scene),
            loadTestModelAssetFile(TEST_MODEL_ASSET_PATHS.tcp)
        ]);
        const replacementBefore = captureSceneSnapshot();
        if (removeExistingTestModels()) {
            recordHistory('기존 Test 모델 삭제', replacementBefore, captureSceneSnapshot());
        }
        if (!applyTestTcpProfile(robot)) throw new Error('TCP 1 is not available.');

        const equipment = await importTestModelFile(equipmentFile, 'scene', {
            testModel: true
        });
        if (!equipment) throw new Error('Test equipment import failed.');
        const tool = await importTestModelFile(toolFile, 'tcp', {
            testModel: true,
            testToolPositionZero: true,
            testToolRotationX: robot.userData.manifest?.robotType === 'scara'
        });
        if (!tool) throw new Error('Vacuum tool import failed.');
        setStatus('Test 모델과 Tool 적용 완료', '#22c55e');
        checkSceneCollisions({ force: true });
    } catch (error) {
        console.error('Test model import failed:', error);
        setStatus('Test 모델 적용 오류', '#ef4444');
        alert(uiFormat('테스트 모델을 불러오지 못했습니다.\n{message}', {
            message: error.message || error
        }));
    } finally {
        state.pendingImportFile = null;
        el.btnTestModel.disabled = false;
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
    mesh.userData.scaraCosines = new Float32Array(256);
    mesh.userData.scaraSines = new Float32Array(256);
    return mesh;
}

function updateScaraTube(robot) {
    const tube = robot?.userData.scaraTube;
    const j1 = robot?.userData.joints?.[0];
    if (!tube || !j1) return;

    const physicalAngle = THREE.MathUtils.degToRad(j1.angle) * Math.sign(j1.axis.z || 1);
    const cosines = tube.userData.scaraCosines
        || (tube.userData.scaraCosines = new Float32Array(256));
    const sines = tube.userData.scaraSines
        || (tube.userData.scaraSines = new Float32Array(256));
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

function createDefaultTcpProfile() {
    return {
        position: new THREE.Vector3(),
        quaternion: new THREE.Quaternion()
    };
}

function normalizeTcpProfile(profile) {
    const normalized = createDefaultTcpProfile();
    const position = profile?.position;
    const quaternion = profile?.quaternion;
    if (position?.isVector3) normalized.position.copy(position);
    else if (Array.isArray(position) && position.length === 3 && position.every(Number.isFinite)) {
        normalized.position.fromArray(position);
    }
    if (quaternion?.isQuaternion) normalized.quaternion.copy(quaternion).normalize();
    else if (Array.isArray(quaternion) && quaternion.length === 4 && quaternion.every(Number.isFinite)) {
        normalized.quaternion.fromArray(quaternion);
        if (normalized.quaternion.lengthSq() < 1e-12) normalized.quaternion.identity();
        else normalized.quaternion.normalize();
    }
    return normalized;
}

function ensureRobotTcpProfiles(robot) {
    if (!robot) return [];
    const source = Array.isArray(robot.userData.tcpProfiles) ? robot.userData.tcpProfiles : [];
    robot.userData.tcpProfiles = Array.from({ length: TCP_PROFILE_COUNT }, (_, index) => (
        normalizeTcpProfile(source[index])
    ));
    const activeIndex = Number(robot.userData.activeTcpProfileIndex);
    robot.userData.activeTcpProfileIndex = Number.isInteger(activeIndex)
        ? THREE.MathUtils.clamp(activeIndex, 0, TCP_PROFILE_COUNT - 1)
        : 0;
    return robot.userData.tcpProfiles;
}

function serializeRobotTcpProfiles(robot) {
    return ensureRobotTcpProfiles(robot).map((profile) => ({
        position: profile.position.toArray(),
        quaternion: profile.quaternion.toArray()
    }));
}

function syncActiveTcpFrame(robot, profileOverride = null) {
    const tcpFrame = robot?.userData.tcpFrame;
    if (!tcpFrame) return;
    const profiles = ensureRobotTcpProfiles(robot);
    const profile = profileOverride
        || robot.userData.tcpLiveProfile
        || profiles[robot.userData.activeTcpProfileIndex];
    tcpFrame.position.copy(profile.position);
    tcpFrame.quaternion.copy(profile.quaternion);
    tcpFrame.scale.set(1, 1, 1);
    tcpFrame.updateMatrix();
    robot.updateMatrixWorld(true);
}

function restoreRobotTcpProfiles(robot, profiles, activeIndex = 0) {
    if (!robot?.userData.tcpFrame) return;
    delete robot.userData.tcpLiveProfile;
    robot.userData.tcpProfiles = Array.from({ length: TCP_PROFILE_COUNT }, (_, index) => (
        normalizeTcpProfile(profiles?.[index])
    ));
    const index = Number(activeIndex);
    robot.userData.activeTcpProfileIndex = Number.isInteger(index)
        ? THREE.MathUtils.clamp(index, 0, TCP_PROFILE_COUNT - 1)
        : 0;
    syncActiveTcpFrame(robot);
}

function getTcpProfileRotationDegrees(profile) {
    const euler = new THREE.Euler().setFromQuaternion(profile.quaternion, 'ZYX');
    return {
        rx: normalizeDegrees(THREE.MathUtils.radToDeg(euler.x)),
        ry: normalizeDegrees(THREE.MathUtils.radToDeg(euler.y)),
        rz: normalizeDegrees(THREE.MathUtils.radToDeg(euler.z))
    };
}

function getTcpProfileEditorValues(profile) {
    const rotation = getTcpProfileRotationDegrees(profile);
    return {
        x: profile.position.x,
        y: profile.position.y,
        z: profile.position.z,
        ...rotation
    };
}

function clearTcpProfileLive(robot, refresh = false) {
    if (!robot?.userData.tcpLiveProfile) return false;
    delete robot.userData.tcpLiveProfile;
    syncActiveTcpFrame(robot);
    captureCurrentTcpTarget(robot);
    if (refresh) refreshTcpProfileUi(robot);
    return true;
}

function setTcpProfileStatus(message, type = '') {
    if (!el.tcpProfileStatus) return;
    el.tcpProfileStatus.dataset.sourceMessage = message;
    el.tcpProfileStatus.textContent = uiText(message);
    el.tcpProfileStatus.classList.toggle('success', type === 'success');
    el.tcpProfileStatus.classList.toggle('error', type === 'error');
}

function refreshTcpProfileUi(robot = state.activeArticulatedModel) {
    const available = Boolean(robot?.userData.tcpFrame);
    const profiles = available ? ensureRobotTcpProfiles(robot) : [];
    const activeIndex = available ? robot.userData.activeTcpProfileIndex : 0;
    if (el.activeTcpProfileLabel) el.activeTcpProfileLabel.textContent = `TCP ${activeIndex + 1}`;
    if (el.tcpLauncherLabel) el.tcpLauncherLabel.textContent = `TCP ${activeIndex + 1}`;
    el.tcpProfileButtons.forEach((button) => {
        const selected = Number(button.dataset.tcpProfile) === activeIndex;
        button.classList.toggle('active', selected);
        button.setAttribute('aria-pressed', String(selected));
        button.disabled = !available || isMotionActive();
        button.title = uiFormat('TCP {number} 선택', { number: Number(button.dataset.tcpProfile) + 1 });
    });
    Object.values(el.tcpOffsetInputs).forEach((input) => { input.disabled = !available || isMotionActive(); });
    if (el.btnApplyTcpProfile) el.btnApplyTcpProfile.disabled = !available || isMotionActive();
    if (el.btnResetTcpProfile) el.btnResetTcpProfile.disabled = !available || isMotionActive();
    if (!available) el.tcpProfilePanel?.classList.add('panel-user-hidden');
    updatePanelLauncher('tcp-profile-panel');
    updateTcpSnapUi();
    if (!available) return;

    const profile = robot.userData.tcpLiveProfile || profiles[activeIndex];
    const values = getTcpProfileEditorValues(profile);
    Object.entries(values).forEach(([key, value]) => {
        const input = el.tcpOffsetInputs[key];
        if (input && input !== document.activeElement) input.value = String(Number(value.toFixed(3)));
    });
}

function selectTcpProfile(index) {
    const robot = state.activeArticulatedModel;
    if (isMotionActive() || !robot?.userData.tcpFrame || !Number.isInteger(index)
        || index < 0 || index >= TCP_PROFILE_COUNT) return;
    ensureRobotTcpProfiles(robot);
    if (robot.userData.activeTcpProfileIndex === index) {
        refreshTcpProfileUi(robot);
        return;
    }
    commitAllPendingHistories();
    clearTcpProfileLive(robot);
    const before = captureSceneSnapshot();
    robot.userData.activeTcpProfileIndex = index;
    syncActiveTcpFrame(robot);
    captureCurrentTcpTarget(robot);
    refreshTcpProfileUi(robot);
    setTcpProfileStatus('선택한 TCP가 활성화되었습니다.', 'success');
    setStatus('TCP {number} 활성화', '#f97316', { number: index + 1 });
    recordHistory('TCP 선택', before, captureSceneSnapshot());
}

function readTcpProfileEditorValues() {
    const values = Object.fromEntries(Object.entries(el.tcpOffsetInputs).map(([key, input]) => [
        key,
        input?.value.trim() === '' ? NaN : Number(input?.value)
    ]));
    const valid = Object.entries(values).every(([key, value]) => {
        if (!Number.isFinite(value)) return false;
        const limit = ['x', 'y', 'z'].includes(key) ? 10000 : 360;
        return Math.abs(value) <= limit;
    });
    return valid ? values : null;
}

function applyTcpProfileEditor() {
    const robot = state.activeArticulatedModel;
    if (isMotionActive() || !robot?.userData.tcpFrame) return;
    const values = readTcpProfileEditorValues();
    if (!values) {
        setTcpProfileStatus('TCP 오프셋 입력값을 확인하세요.', 'error');
        setStatus('TCP 오프셋 입력값을 확인하세요.', '#ef4444');
        return;
    }
    commitAllPendingHistories();
    const before = captureSceneSnapshot();
    delete robot.userData.tcpLiveProfile;
    const profiles = ensureRobotTcpProfiles(robot);
    const profile = profiles[robot.userData.activeTcpProfileIndex];
    profile.position.set(values.x, values.y, values.z);
    profile.quaternion.setFromEuler(new THREE.Euler(
        THREE.MathUtils.degToRad(values.rx),
        THREE.MathUtils.degToRad(values.ry),
        THREE.MathUtils.degToRad(values.rz),
        'ZYX'
    )).normalize();
    syncActiveTcpFrame(robot);
    captureCurrentTcpTarget(robot);
    refreshTcpProfileUi(robot);
    setTcpProfileStatus('TCP 오프셋을 적용했습니다.', 'success');
    setStatus('TCP {number} 오프셋 적용', '#22c55e', {
        number: robot.userData.activeTcpProfileIndex + 1
    });
    recordHistory('TCP 오프셋 설정', before, captureSceneSnapshot());
}

function resetActiveTcpProfile() {
    const robot = state.activeArticulatedModel;
    if (isMotionActive() || !robot?.userData.tcpFrame) return;
    commitAllPendingHistories();
    const before = captureSceneSnapshot();
    delete robot.userData.tcpLiveProfile;
    const profiles = ensureRobotTcpProfiles(robot);
    const profile = profiles[robot.userData.activeTcpProfileIndex];
    profile.position.set(0, 0, 0);
    profile.quaternion.identity();
    syncActiveTcpFrame(robot);
    captureCurrentTcpTarget(robot);
    refreshTcpProfileUi(robot);
    setTcpProfileStatus('TCP 오프셋을 초기화했습니다.', 'success');
    recordHistory('TCP 오프셋 초기화', before, captureSceneSnapshot());
}

function updateTcpProfileLive() {
    const robot = state.activeArticulatedModel;
    if (isMotionActive() || !robot?.userData.tcpFrame) return;
    const values = readTcpProfileEditorValues();
    if (!values) {
        clearTcpProfileLive(robot);
        setTcpProfileStatus('TCP 오프셋 입력값을 확인하세요.', 'error');
        return;
    }
    const liveProfile = createDefaultTcpProfile();
    liveProfile.position.set(values.x, values.y, values.z);
    liveProfile.quaternion.setFromEuler(new THREE.Euler(
        THREE.MathUtils.degToRad(values.rx),
        THREE.MathUtils.degToRad(values.ry),
        THREE.MathUtils.degToRad(values.rz),
        'ZYX'
    )).normalize();
    robot.userData.tcpLiveProfile = liveProfile;
    syncActiveTcpFrame(robot, liveProfile);
    captureCurrentTcpTarget(robot);
}

function renderJogControls(robot) {
    const joints = robot.userData.joints || [];
    el.jogControls.replaceChildren();

    joints.forEach((joint) => {
        const { name } = joint.definition;
        const display = getJointJogDisplaySpec(joint);
        const unit = display.unit;
        const isPositionDisplay = unit === 'mm';
        const row = document.createElement('div');
        row.className = 'jog-row';

        const heading = document.createElement('div');
        heading.className = 'jog-row-heading';
        heading.innerHTML = `<strong>${name}</strong><span>${formatJogValue(display.min)}${unit} / ${formatJogValue(display.max)}${unit}</span>`;

        const range = document.createElement('input');
        range.type = 'range';
        range.min = display.min;
        range.max = display.max;
        range.step = '0.1';
        range.value = formatJogValue(display.toDisplay(0));
        range.setAttribute('aria-label', `${name} ${uiText(isPositionDisplay ? '관절 위치' : '관절 각도')}`);

        const valueWrap = document.createElement('label');
        valueWrap.className = 'jog-value';
        const number = document.createElement('input');
        number.type = 'number';
        number.min = display.min;
        number.max = display.max;
        number.step = '0.5';
        number.value = formatJogValue(display.toDisplay(0));
        number.setAttribute('aria-label', `${name} ${uiText(isPositionDisplay ? '관절 위치(mm)' : '관절 각도(도)')}`);
        valueWrap.append(number, document.createTextNode(unit));

        const applyFromControl = (rawValue) => {
            clearJogCollisionLock();
            setJointAngle(joint, display.fromDisplay(Number(rawValue)));
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
        joint.control = { range, number, display };

        row.append(heading, range, valueWrap);
        el.jogControls.appendChild(row);
    });

    el.jogPanel.classList.remove('hidden');
    updatePanelLauncher('jog-panel');
    refreshTcpProfileUi(robot);
    setTcpProfileStatus('선택한 TCP는 로봇별로 저장됩니다.');
    updateBaseJogCapabilities(robot);
    setJogMode('joint');
    captureCurrentTcpTarget(robot);
}

function refreshJointControlLabels() {
    const robot = state.activeArticulatedModel;
    if (!robot) return;
    (robot.userData.joints || []).forEach((joint) => {
        const name = joint.definition.name;
        const isPositionDisplay = getJointJogDisplaySpec(joint).unit === 'mm';
        joint.control?.range?.setAttribute('aria-label', `${name} ${uiText(isPositionDisplay ? '관절 위치' : '관절 각도')}`);
        joint.control?.number?.setAttribute('aria-label', `${name} ${uiText(isPositionDisplay ? '관절 위치(mm)' : '관절 각도(도)')}`);
    });
}

function resetArticulatedJoints(robot) {
    clearJogCollisionLock();
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
    refreshTcpProfileUi(null);
    updatePanelLauncher('jog-panel');
}

function formatJogValue(value) {
    return String(Number(Number(value).toFixed(3)));
}

function getJointJogDisplaySpec(joint) {
    const definition = joint.definition;
    const isScaraJ3 = definition.name === 'J3'
        && definition.type === 'prismatic'
        && joint.robot?.userData?.manifest?.robotType === 'scara';
    if (!isScaraJ3) {
        return {
            unit: definition.type === 'prismatic' ? 'mm' : '°',
            min: definition.min,
            max: definition.max,
            fromDisplay: (value) => value,
            toDisplay: (value) => value
        };
    }

    const lead = Number(joint.robot.userData.manifest.j3ScrewLeadMmPerRev);
    const degreesPerMillimeter = 360 / lead;
    const controllerLimits = joint.robot.userData.manifest.j3ControllerLimits;
    return {
        unit: '°',
        min: Array.isArray(controllerLimits)
            ? controllerLimits[0]
            : definition.min * degreesPerMillimeter,
        max: Array.isArray(controllerLimits)
            ? controllerLimits[1]
            : definition.max * degreesPerMillimeter,
        fromDisplay: (value) => value / degreesPerMillimeter,
        toDisplay: (value) => value * degreesPerMillimeter
    };
}

function setJointAngle(joint, rawValue, syncControl = true) {
    const { min, max } = joint.definition;
    const parsed = Number(rawValue);
    const value = THREE.MathUtils.clamp(Number.isFinite(parsed) ? parsed : 0, min, max);
    const changed = !Number.isFinite(joint.angle) || Math.abs(joint.angle - value) > 1e-9;
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
        const display = joint.control.display || getJointJogDisplaySpec(joint);
        const displayValue = display.toDisplay(value);
        joint.control.range.value = formatJogValue(displayValue);
        joint.control.number.value = formatJogValue(displayValue);
    }
    if (changed) markSceneCollisionDirty(joint.robot);
    requestRender();
    return value;
}

function syncJointControls(robot) {
    (robot.userData.joints || []).forEach((joint) => {
        if (!joint.control) return;
        const display = joint.control.display || getJointJogDisplaySpec(joint);
        const displayValue = display.toDisplay(joint.angle);
        joint.control.range.value = formatJogValue(displayValue);
        joint.control.number.value = formatJogValue(displayValue);
    });
}

function setJogMode(mode) {
    if (state.snapMoveMode) {
        state.snapMoveMode = false;
        clearSimulationSnapFaceSelection({ invalidate: false });
        invalidateSimulationSnapCandidates();
        hideSimulationSnapMarker();
        resetSimulationSnapMarkerCameraScale();
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
            setBaseJogStatus('Target is outside the reachable range or joint limits.', 'error');
        } else {
            robot.userData.baseJogTarget = desired;
            syncJointControls(robot);
            updateTcpPresentation(robot);
            setBaseJogStatus('');
            clearJogCollisionLock();
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

function updateCameraScaledTcpAxes() {
    const viewportHeight = state.renderer?.domElement.clientHeight || 0;
    if (!state.camera || !state.scene || viewportHeight <= 0) return;

    state.camera.updateMatrixWorld(true);
    const fovScale = 2 * Math.tan(THREE.MathUtils.degToRad(state.camera.fov * 0.5));
    const cameraZoom = Math.max(state.camera.zoom || 1, Number.EPSILON);

    state.models.forEach((robot) => {
        const axes = robot.userData.toolAxesAtTcp;
        const sizing = axes?.userData.cameraScaledSize;
        if (!axes || !sizing || !axes.visible) return;

        axes.getWorldPosition(tcpAxesWorldPosition);
        tcpAxesCameraPosition.copy(tcpAxesWorldPosition).applyMatrix4(state.camera.matrixWorldInverse);
        const cameraDepth = -tcpAxesCameraPosition.z;
        if (cameraDepth <= 0) return;

        const worldUnitsPerPixel = (cameraDepth * fovScale) / (viewportHeight * cameraZoom);
        const parentWorldScale = axes.parent
            ? axes.parent.getWorldScale(tcpAxesParentScale)
            : tcpAxesParentScale.set(1, 1, 1);
        const inheritedScale = Math.max(
            Math.abs(parentWorldScale.x),
            Math.abs(parentWorldScale.y),
            Math.abs(parentWorldScale.z),
            Number.EPSILON
        );
        const localScale = (worldUnitsPerPixel * sizing.pixelSize) / (sizing.localSize * inheritedScale);
        axes.scale.setScalar(localScale);
    });
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
        setBaseJogStatus('Target is outside the reachable range or joint limits.', 'error');
        return;
    }

    robot.userData.baseJogTarget = target;
    syncJointControls(robot);
    updateTcpPresentation(robot, target);
    syncBaseJogGizmoFromRobot(robot);
    setBaseJogStatus('');
    clearJogCollisionLock();
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
        setBaseJogStatus('Target is outside the reachable range or joint limits.', 'error');
        return false;
    }

    robot.userData.baseJogTarget = target;
    syncJointControls(robot);
    updateTcpPresentation(robot, target);
    syncBaseJogGizmoFromRobot(robot);
    setBaseJogStatus('');
    clearJogCollisionLock();
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
    const tcpFrame = robot.userData.tcpFrame;
    if (joints.length !== 4 || !homeQuaternion || !tcpFrame || !Array.isArray(manifest?.structure)) {
        return { success: false, positionError: Infinity, rotationError: Infinity };
    }

    const targetFlangeQuaternion = target.quaternion.clone()
        .multiply(tcpFrame.quaternion.clone().invert())
        .normalize();
    const targetFlangePosition = target.position.clone().sub(
        tcpFrame.position.clone().applyQuaternion(targetFlangeQuaternion)
    );

    const currentPose = getCurrentTcpPoseBase(robot);
    const rzOnlyError = quaternionErrorVector(target.quaternion, currentPose.quaternion);
    if (currentPose.position.distanceTo(target.position) < 0.01
        && Math.hypot(tcpFrame.position.x, tcpFrame.position.y) < 1e-9
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
    const radiusSquared = targetFlangePosition.x ** 2 + targetFlangePosition.y ** 2;
    const denominator = 2 * arm1 * signedArm2;
    const rawCosine = (radiusSquared - arm1 ** 2 - signedArm2 ** 2) / denominator;
    const prismaticTarget = targetFlangePosition.z - (manifest.tcp?.[2] || 0);
    const targetRotation = quaternionErrorVector(targetFlangeQuaternion, homeQuaternion);
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
        const physicalJ1 = Math.atan2(targetFlangePosition.y, targetFlangePosition.x)
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
    const singularityEscapeSeeds = joints.length >= 6
        ? [
            [[1, 3]], [[1, -3]],
            [[2, 3]], [[2, -3]],
            [[1, 5], [2, -5]], [[1, -5], [2, 5]],
            [[4, 5]], [[4, -5]],
            [[3, 12], [5, -12]], [[3, -12], [5, 12]]
        ]
        : [[[1, 3]], [[1, -3]], [[0, 3]], [[0, -3]]];
    singularityEscapeSeeds.forEach(addSeed);
    let lastResult = { success: false, positionError: Infinity, rotationError: Infinity };
    let bestResult = null;
    let bestAngles = startingAngles;
    let bestScore = Infinity;

    for (let attempt = 0; attempt < seedOffsets.length; attempt += 1) {
        joints.forEach((joint, index) => {
            setJointAngle(joint, startingAngles[index] + seedOffsets[attempt][index], false);
        });
        robot.updateMatrixWorld(true);
        lastResult = solveRobotIKAttempt(robot, target, tolerance);
        const score = Math.max(
            lastResult.positionError / tolerance.finalPosition,
            lastResult.rotationError / tolerance.finalRotation
        );
        if (Number.isFinite(score) && score < bestScore) {
            bestScore = score;
            bestResult = { ...lastResult };
            bestAngles = joints.map((joint) => joint.angle);
        }
        if (lastResult.success) {
            lastResult.usedSingularityEscape = attempt > 0;
            return lastResult;
        }
    }
    bestAngles.forEach((angle, index) => setJointAngle(joints[index], angle, false));
    robot.updateMatrixWorld(true);
    return bestResult || lastResult;
}

function calculateIkDamping(positionErrorLength, rotationErrorLength) {
    const normalizedError = Math.max(positionErrorLength / IK_POSITION_SCALE, rotationErrorLength);
    const ratio = THREE.MathUtils.clamp(normalizedError / IK_DAMPING_TRANSITION_ERROR, 0, 1);
    return THREE.MathUtils.lerp(IK_MIN_DAMPING, IK_DAMPING, ratio * ratio);
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
        const damping = calculateIkDamping(positionErrorLength, rotationErrorLength);
        for (let index = 0; index < joints.length; index += 1) {
            normal[index][index] += damping * damping;
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
        controller.corePromise = import('./virtual-controller-core.mjs?v=20260723-vc-ip-port-1')
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
    const isRealController = controller.controllerKind === 'real';
    if (el.virtualControllerKind) {
        el.virtualControllerKind.value = isRealController ? 'real' : 'virtual';
        el.virtualControllerKind.disabled = controller.wanted;
    }
    if (el.virtualControllerIp) {
        if (!isRealController) {
            controller.ipAddress = '127.0.0.1';
            el.virtualControllerIp.value = controller.ipAddress;
        } else {
            el.virtualControllerIp.value = controller.ipAddress || '';
        }
        el.virtualControllerIp.disabled = controller.wanted || !isRealController;
        el.virtualControllerIp.readOnly = !isRealController;
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
    const canReadInterferenceZone = canReadInterferenceZoneFromController();
    el.interferenceZoneList?.querySelectorAll('[data-interference-zone-read]').forEach((button) => {
        const zoneId = Number(button.closest('[data-interference-zone-row]')?.dataset.interferenceZoneRow);
        const pending = controller.pendingInterferenceReads.has(zoneId);
        button.disabled = !canReadInterferenceZone || pending;
        button.textContent = pending ? '읽는 중' : '가져오기';
    });
    el.endMonitoringList?.querySelectorAll('[data-end-monitoring-read]').forEach((button) => {
        const toolId = Number(button.closest('[data-end-monitoring-row]')?.dataset.endMonitoringRow);
        const pending = controller.pendingInterferenceToolReads.has(toolId);
        button.disabled = !canReadInterferenceZone || pending;
        button.textContent = pending ? '읽는 중' : '가져오기';
    });
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
    if (parsed.type === 'interferenceZoneReadResult') {
        applyInterferenceZoneControllerResult(message.result);
    } else if (parsed.type === 'interferenceToolReadResult') {
        applyInterferenceToolControllerResult(message.result);
    } else if (parsed.type === 'connectResult') {
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
        const connectCommand = {
            type: 'connect',
            ip: controller.ipAddress || core.VIRTUAL_CONTROLLER_HOST,
            controllerKind: controller.controllerKind
        };
        if (source.id === 'bridge') connectCommand.port = core.VIRTUAL_CONTROLLER_TARGET_PORT;
        sendVirtualControllerCommand(connectCommand);
    });
    socket.addEventListener('message', (event) => {
        if (controller.socket === socket) handleVirtualControllerMessage(event.data);
    });
    socket.addEventListener('close', () => {
        if (controller.socket === socket) controller.socket = null;
        controller.pendingInterferenceReads.clear();
        controller.pendingInterferenceToolReads.clear();
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
    controller.pendingInterferenceReads.clear();
    controller.pendingInterferenceToolReads.clear();
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
    refreshViewPresetsUi();
    if (historyBefore) recordHistory('가상 컨트롤러 동기화', historyBefore, captureSceneSnapshot());
}

async function connectVirtualController() {
    const controller = state.virtualController;
    if (isMotionActive()) return;
    refreshVirtualControllerRobotOptions();
    const isRealController = controller.controllerKind === 'real';
    const ipAddress = isRealController ? (el.virtualControllerIp?.value.trim() || '') : '127.0.0.1';
    if (getVirtualControllerSourceConfig().id === 'bridge' && isRealController && !ipAddress) {
        setVirtualControllerStatus('error', '컨트롤러 IP를 입력해 주세요.');
        el.virtualControllerIp?.focus();
        return;
    }
    controller.ipAddress = ipAddress;
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
    requestRender();
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
    refreshViewPresetsUi();
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
    if (robot.userData.interferenceStopLatched) return;
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
    joints.forEach((joint, index) => {
        let value = sample.joints[index];
        // The controller can report the SCARA vertical axis as a motor/encoder
        // angle, while the simulator's J3 is prismatic and expects millimeters.
        // TCP Z is already in the Cartesian unit expected by the simulator. If
        // TCP feedback is unavailable (for example Trace), convert the raw
        // controller Joint angle back to the simulator's millimeter coordinate.
        if (index === 2
            && robot.userData.manifest?.robotType === 'scara'
            && Number.isFinite(sample.position?.[2])) {
            const tcpOffsetZ = Number(robot.userData.tcpFrame?.position?.z) || 0;
            value = sample.position[2] - tcpOffsetZ;
        } else if (index === 2 && robot.userData.manifest?.robotType === 'scara') {
            value = getJointJogDisplaySpec(joint).fromDisplay(value);
        }
        setJointAngle(joint, value, false);
    });
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
    const wasHidden = el.programPanel.classList.contains('hidden')
        || el.programPanel.classList.contains('panel-user-hidden');
    el.programPanel.classList.remove('hidden');
    if (!el.programPanel.dataset.motionPanelInitialized) {
        el.programPanel.classList.remove('panel-user-hidden');
        el.programPanel.dataset.motionPanelInitialized = 'true';
    }
    if (wasHidden && !el.programPanel.classList.contains('panel-user-hidden')) {
        bringPanelToFront('program-panel');
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
    if (step.motion === 'VIEW') return `View ${Math.min(4, Math.max(1, Number(step.viewSlot) + 1 || 1))}`;
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
            ? '자세, 뷰, DELAY 또는 타이머 명령을 추가하세요.'
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
                ['TIME_OUT', 'T.Out'],
                ['VIEW', 'View']
            ].forEach(([value, label]) => {
                const option = document.createElement('option');
                option.value = value;
                option.textContent = label;
                motion.appendChild(option);
            });
            motion.value = step.motion;
            motion.title = step.motion.replace('_', ' ');

            const isView = step.motion === 'VIEW';
            const speed = isView ? document.createElement('select') : document.createElement('input');
            const isDelay = step.motion === 'DELAY';
            speed.className = 'program-step-speed';
            if (isView) {
                speed.dataset.programStepViewSlot = step.id;
                speed.dataset.programEdit = '';
                for (let slot = 0; slot < VIEW_PRESET_COUNT; slot += 1) {
                    const option = document.createElement('option');
                    option.value = String(slot);
                    option.textContent = `V${slot + 1}`;
                    speed.appendChild(option);
                }
                speed.value = String(Math.min(VIEW_PRESET_COUNT - 1, Math.max(0, Number(step.viewSlot) || 0)));
                speed.title = uiText('전환할 화면 뷰');
                speed.setAttribute('aria-label', uiText('전환할 화면 뷰'));
            } else {
                speed.type = 'number';
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
            }
            speed.dataset.programEdit = '';

            const unit = document.createElement('span');
            unit.className = 'program-step-unit';
            unit.textContent = isTimer || isView ? '' : isDelay ? 's' : step.motion === 'MOVJ' ? '%' : 'mm/s';
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
        showPositionValueError('입력한 위치가 로봇의 도달 범위 또는 관절 제한을 벗어났습니다.');
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
    const viewSlotControl = event.target.closest('[data-program-step-view-slot]');
    const speedControl = event.target.closest('[data-program-step-speed]');
    const stepId = pointIndexControl?.dataset.programStepPointIndex
        || labelControl?.dataset.programStepLabel
        || motionControl?.dataset.programStepMotion
        || viewSlotControl?.dataset.programStepViewSlot
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
    if (viewSlotControl) {
        const viewSlot = Number(viewSlotControl.value);
        if (!Number.isInteger(viewSlot) || viewSlot < 0 || viewSlot >= VIEW_PRESET_COUNT) {
            renderMotionProgramPanel();
            return;
        }
        if (step.motion !== 'VIEW' || step.viewSlot === viewSlot) return;
        const before = captureSceneSnapshot();
        step.viewSlot = viewSlot;
        step.name = programCommandName(step);
        recordHistory('화면 뷰 전환 대상 변경', before, captureSceneSnapshot());
        renderMotionProgramPanel();
        return;
    }
    const before = captureSceneSnapshot();
    if (motionControl) {
        const wasPoint = isMotionPointMotion(step.motion);
        const nextMotion = ['MOVJ', 'MOVL', 'DELAY', 'TIME_START', 'TIME_OUT', 'VIEW'].includes(motionControl.value)
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
            step.name = step.motion === 'DELAY'
                ? 'Delay'
                : step.motion === 'TIME_START'
                    ? 'Time Start'
                    : step.motion === 'TIME_OUT'
                        ? 'Time Out'
                        : 'View 1';
        }
        if (step.motion === 'DELAY') {
            delete step.speed;
            delete step.viewSlot;
            step.delaySeconds = DEFAULT_DELAY_SECONDS;
        } else if (step.motion === 'MOVJ' || step.motion === 'MOVL') {
            delete step.delaySeconds;
            delete step.viewSlot;
            step.speed = step.motion === 'MOVJ' ? DEFAULT_MOVJ_SPEED : DEFAULT_MOVL_SPEED;
        } else if (step.motion === 'VIEW') {
            delete step.delaySeconds;
            delete step.speed;
            step.viewSlot = Number.isInteger(step.viewSlot)
                ? THREE.MathUtils.clamp(step.viewSlot, 0, VIEW_PRESET_COUNT - 1)
                : 0;
            step.name = programCommandName(step);
        } else {
            delete step.speed;
            delete step.delaySeconds;
            delete step.viewSlot;
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
                    : motion === 'TIME_OUT'
                        ? 'Time Out'
                        : `View ${(Number.isInteger(existing?.viewSlot) ? existing.viewSlot : 0) + 1}`,
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
                : motion === 'VIEW'
                    ? { viewSlot: Number.isInteger(existing?.viewSlot)
                        ? THREE.MathUtils.clamp(existing.viewSlot, 0, VIEW_PRESET_COUNT - 1)
                        : 0 }
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

function addViewMotionStep() {
    if (isMotionActive() || !state.activeProgramRobot) return;
    const before = captureSceneSnapshot();
    const program = ensureMotionProgram(state.activeProgramRobot);
    const step = captureRobotMotionStep(state.activeProgramRobot);
    if (!step) return;
    step.name = 'View 1';
    step.motion = 'VIEW';
    step.viewSlot = 0;
    delete step.pointIndex;
    delete step.label;
    delete step.armParameters;
    delete step.externalAxes;
    delete step.speed;
    delete step.delaySeconds;
    insertMotionStepAfterSelected(program, step);
    program.selectedStepId = step.id;
    recordHistory('화면 뷰 전환 명령 추가', before, captureSceneSnapshot());
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
    // Model selection stays available while motion is running so Add Mode can
    // load another robot in the background. Replacing the active scene is
    // still rejected by loadModelFromServer.
    if (el.modelSelect) el.modelSelect.disabled = false;
    if (el.btnImport3D) el.btnImport3D.disabled = locked;
    if (el.btnAddMode) el.btnAddMode.disabled = false;
    if (el.modelTree) el.modelTree.classList.toggle('motion-locked', locked);
    el.jogPanel?.querySelectorAll('button:not([data-panel-action]), input')
        .forEach((control) => { control.disabled = locked; });
    el.jogPanel?.querySelectorAll('[data-panel-action]')
        .forEach((control) => { control.disabled = false; });
    el.tcpProfilePanel?.querySelectorAll('button:not([data-panel-action]), input, select')
        .forEach((control) => { control.disabled = locked; });
    el.tcpProfilePanel?.querySelectorAll('[data-panel-action]')
        .forEach((control) => { control.disabled = false; });
    el.modelTransformPanel?.querySelectorAll('button, input').forEach((control) => { control.disabled = locked; });
    el.programPanel?.querySelectorAll('[data-program-edit], [data-program-robot-include], [data-program-step-select], [data-program-robot-select]')
        .forEach((control) => { control.disabled = locked; });
    el.interferenceZonePanel?.querySelectorAll('[data-interference-zone-activate], [data-interference-zone-edit]')
        .forEach((control) => { control.disabled = locked; });
    el.endMonitoringList?.querySelectorAll('[data-end-monitoring-edit]')
        .forEach((control) => { control.disabled = locked; });
    el.endMonitoringDialog?.querySelectorAll('input, select, button:not(#end-monitoring-close)')
        .forEach((control) => { control.disabled = locked; });
    el.programRepeatButtons.forEach((button) => { button.disabled = false; });
    if (locked) {
        setTransformHandlesEnabled(false);
        setBaseJogGizmoEnabled(false);
    }
    refreshTcpProfileUi();
    updateTcpSnapUi();
    updateSimulationSnapButton();
    updateHistoryButtons();
}

function serializeMotionProject() {
    return {
        schemaVersion: MOTION_PROJECT_SCHEMA_VERSION,
        repeatCurrentRobot: state.motionRepeatRobot,
        repeat: state.motionRepeat,
        interferenceZones: cloneInterferenceZones(state.interferenceZones),
        endMonitoringObjects: cloneEndMonitoringObjects(state.endMonitoringObjects),
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
                tcpProfiles: serializeRobotTcpProfiles(robot),
                activeTcpProfileIndex: robot.userData.activeTcpProfileIndex,
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
    state.interferenceZones = normalizeInterferenceZones(input.interferenceZones);
    state.endMonitoringObjects = normalizeEndMonitoringObjects(input.endMonitoringObjects);
    state.interferenceRuntime.forEach((runtime, index) => {
        if (!runtime) return;
        resetInterferenceZoneRuntime(index);
    });
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
    removedModels.forEach((model) => {
        disposeModelOutlines(model);
        model.removeFromParent();
    });
    state.models = state.models.filter((model) => !removedModels.has(model));
    markSceneCollisionDirty();
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
        restoreRobotTcpProfiles(
            robot,
            robotProject.tcpProfiles,
            robotProject.activeTcpProfileIndex
        );
        robot.position.fromArray(robotProject.baseTransform.position);
        robot.quaternion.fromArray(robotProject.baseTransform.quaternion);
        robot.scale.fromArray(robotProject.baseTransform.scale);
        robot.updateMatrixWorld(true);
        updateModelRenderComplexity(robot);
        state.models.push(robot);
        state.scene.add(robot);
        markSceneCollisionDirty();
        refreshCollisionDebugOverlays();
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
        const rawProject = serializeMotionProject();
        const project = {
            ...normalizeMotionProject(rawProject),
            interferenceZones: normalizeInterferenceZones(rawProject.interferenceZones)
        };
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
            throw new Error(`${label}: unreachable or outside joint limits.`);
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
            if (step.motion === 'VIEW') {
                if (!getViewPreset(step.viewSlot)) {
                    throw new Error(`${step.name}: 저장된 뷰가 없습니다.`);
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
    // A collision is a breakpoint, not an interlock.  Restarting is allowed
    // from the currently colliding pose; only a newly encountered mesh pair
    // stops motion again.  Every pair already present is tracked separately
    // so a multi-link/Tool collision can resume as one visible breakpoint.
    const currentCollisionResults = checkSceneCollisions({ force: true });
    const restartCollisionKeys = asCollisionResults(
        currentCollisionResults?.length ? currentCollisionResults : state.collision.stopNotice?.result
    ).map(collisionResultKey).filter(Boolean);
    clearCollisionStopNotice({ resetViewerStatus: false });
    state.collision.ignoredMotionCollisionKeys = new Set(restartCollisionKeys);
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
    requestRender();
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
    requestRender();
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
    requestRender();
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
    if (step.motion === 'VIEW') {
        return {
            type: 'VIEW',
            step,
            startTime: timestamp,
            duration: 0
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
    if (segment.type === 'VIEW') {
        applyViewPreset(segment.step.viewSlot, { announce: false });
        const program = ensureMotionProgram(robot);
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

function isOutlineMesh(mesh) {
    return Boolean(mesh?.isMesh
        && mesh.geometry?.getAttribute?.('position')
        && mesh.geometry.getAttribute('position').count > 0
        && !mesh.userData?.outlineSource
        && !mesh.userData?.excludeFromOutline);
}

function disposeModelOutlines(model) {
    const outlineLines = [];
    model?.traverse?.((object) => {
        if (object.userData?.outlineSource) outlineLines.push(object);
    });
    outlineLines.forEach((line) => {
        if (line.parent?.userData) delete line.parent.userData.outlineLine;
        line.removeFromParent();
        line.geometry?.dispose();
        const materials = Array.isArray(line.material) ? line.material : [line.material];
        materials.forEach((material) => material?.dispose());
    });
}

function removeModelOutlines() {
    state.models.forEach(disposeModelOutlines);
}

function syncModelOutlines() {
    if (!state.outlineMode) {
        removeModelOutlines();
        return;
    }
    state.models.forEach((model) => {
        model.traverse((mesh) => {
            if (!isOutlineMesh(mesh) || mesh.userData.outlineLine) return;
            const edgeGeometry = new THREE.EdgesGeometry(mesh.geometry, 28);
            const lineMaterial = new THREE.LineBasicMaterial({
                color: 0x000000,
                transparent: true,
                opacity: 0.95,
                depthTest: true,
                depthWrite: false,
                toneMapped: false
            });
            const line = new THREE.LineSegments(edgeGeometry, lineMaterial);
            line.name = 'Cartoon Outline';
            line.renderOrder = 30;
            line.frustumCulled = false;
            line.userData.outlineSource = true;
            mesh.add(line);
            mesh.userData.outlineLine = line;
        });
    });
}

function updateOutlineToggleUi() {
    const button = el.btnToggleOutline;
    if (!button) return;
    button.classList.toggle('active', state.outlineMode);
    button.setAttribute('aria-pressed', String(state.outlineMode));
    button.title = uiText(state.outlineMode ? '외곽선 끄기' : '외곽선 켜기');
    button.setAttribute('aria-label', uiText('외곽선 표시/숨김'));
}

function setModelOutlineMode(enabled) {
    state.outlineMode = Boolean(enabled);
    syncModelOutlines();
    updateOutlineToggleUi();
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
    const mountFrame = getRobotToolMountFrame(robot);
    if (!mountFrame) return;
    state.models.forEach((model) => {
        const transform = model.userData.pendingToolAttachment;
        if (!transform) return;
        mountFrame.add(model);
        model.position.fromArray(transform.position);
        model.quaternion.fromArray(transform.quaternion);
        model.scale.fromArray(transform.scale);
        model.userData.attachmentHost = robot;
        model.userData.attachmentFrame = 'flange';
        model.userData.placement = 'tcp';
        delete model.userData.pendingToolAttachment;
        model.updateMatrixWorld(true);
    });
}

function cleanupScene() {
    if (state.zeroPointEdit.active) exitZeroPointEditor();
    invalidateSimulationSnapCandidates();
    setBaseJogGizmoEnabled(false);
    state.transformControls.detach();
    const models = [...state.models];
    const preservedImportedModels = models.filter((model) => model.userData.uploaded);
    preservedImportedModels.forEach((model) => {
        const toolHost = model.userData.placement === 'tcp'
            && getRobotToolMountFrame(model.userData.attachmentHost);
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
        model.userData.attachmentFrame = null;
        model.userData.placement = 'scene';
    });
    models.filter((model) => !preservedImportedModels.includes(model)).forEach((model) => {
        if (model.userData.motionInstanceId) state.motionPrograms.delete(model.userData.motionInstanceId);
        disposeCollisionDebugForModel(model);
        disposeModelOutlines(model);
        model.removeFromParent();
    });
    state.models = preservedImportedModels;
    markSceneCollisionDirty();
    state.selectedModel = preservedImportedModels.includes(state.selectedModel) ? state.selectedModel : null;
    state.activeArticulatedModel = null;
    state.activeProgramRobot = null;
    hideJogPanel();
    renderModelTree();
    el.modelTransformPanel.classList.add('hidden');
    renderMotionProgramPanel();
    refreshCollisionDebugOverlays();
    checkSceneCollisions({ force: true });
}

function deleteSelectedModel() {
    if (isMotionActive()) return;
    const model = state.selectedModel;
    if (!model) return;
    if (state.zeroPointEdit.active) exitZeroPointEditor();
    invalidateSimulationSnapCandidates();
    commitAllPendingHistories();
    setBaseJogGizmoEnabled(false);
    const historyBefore = captureSceneSnapshot();

    const attachments = state.models.filter((candidate) => candidate.userData.attachmentHost === model);
    const modelsToDelete = [model, ...attachments];
    state.transformControls.detach();
    modelsToDelete.forEach((item) => {
        if (item.userData.motionInstanceId) state.motionPrograms.delete(item.userData.motionInstanceId);
        disposeCollisionDebugForModel(item);
        disposeModelOutlines(item);
        item.removeFromParent();
        const index = state.models.indexOf(item);
        if (index > -1) state.models.splice(index, 1);
    });
    markSceneCollisionDirty();

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
    updateLargeModelPerformanceMode();
    syncModelOutlines();
    const names = state.models.map(m => m.userData.modelName);
    el.statName.textContent = names.length > 1 ? `${names[0]} (+${names.length-1})` : (names[0] || '-');
    el.emptyState.classList.toggle('hidden', state.models.length > 0);
    renderModelTree();
    refreshInterferenceZoneDialogRobotOptions();
    renderInterferenceZonePanel();
    updateInterferenceZoneVisuals();
    evaluateInterferenceZones(performance.now());
    setStatus('Ready', '#22c55e');
    requestRender();
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

function requiresContinuousRendering() {
    return isViewWindowOpen()
        || isVirtualControllerActive()
        || [...state.motionSessions.values()].some((session) => session.status === 'running');
}

function requestRender() {
    if (!state.renderer || state.renderFramePending) return;
    state.renderFramePending = true;
    requestAnimationFrame(animate);
}

function animate(timestamp = performance.now()) {
    state.renderFramePending = false;
    if (!state.collision.lastCheckSkipped) captureCollisionSafeRobotPoses();
    applyVirtualControllerFrame(timestamp);
    updateMotionSessions(timestamp);
    updateCycleTimeReadout(timestamp);
    const collision = checkSceneCollisions();
    const collisionFresh = !state.collision.lastCheckSkipped;
    if (collisionFresh) releaseClearedMotionCollisionIgnores(collision);
    const blockingMotionCollision = getBlockingMotionCollision(collision);
    // Controller input (virtual or real) is simulation-only feedback. A
    // collision must not reject/restore the received pose or alter the
    // controller connection; updateCollisionStatus() above already keeps the
    // visual collision result red.
    if (collisionFresh && blockingMotionCollision && state.motionSessions.size > 0) {
        const movingRobots = [...state.motionSessions.values()].map((session) => session.robot);
        stopRobotMotions(movingRobots);
        latchCollisionStopNotice(collision, '충돌이 감지되어 모션을 정지했습니다.');
        updateCollisionStatus(collision);
        setMotionProgramStatus('충돌이 감지되어 모션을 정지했습니다.', 'error');
        setStatus('충돌이 감지되어 모션을 정지했습니다.', '#ef4444');
    } else if (collisionFresh && !asCollisionResults(collision).length) {
        captureCollisionSafeRobotPoses();
    }
    evaluateInterferenceZones(timestamp);
    state.controls.update();
    updateCameraScaledTcpAxes();
    updateSimulationSnapMarkerCameraScale();
    updateSimulationSnapCandidateMarkers();
    orientEndMonitoringOutlinesToCamera(state.camera);
    state.renderer.render(state.scene, state.camera);
    renderViewWindow();
    updateZeroPointCurrentMarker();
    if (requiresContinuousRendering()) requestRender();
}

function onResize() {
    const w = el.canvasContainer.clientWidth, h = el.canvasContainer.clientHeight;
    state.camera.aspect = w / h;
    state.camera.updateProjectionMatrix();
    state.renderer.setSize(w, h);
    [el.modelBrowserPanel, el.jogPanel, el.tcpProfilePanel, el.virtualControllerPanel, el.viewPresetsPanel, el.interferenceZonePanel, el.programPanel].forEach((panel) => {
        if (panel?.dataset.userResized === 'true') normalizePanelResizeBox(panel);
    });
    resizeViewWindow();
    requestRender();
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
    if (state.snapMoveMode) captureSimulationSnapMarkerReferenceDistance();
}

async function populateModelList() {
    try {
        const res = await fetch('./models/models.json?v=20260724-j3-angle-display-1');
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
