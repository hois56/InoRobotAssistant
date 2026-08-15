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
import { clone as cloneObjectWithSkeletons } from 'three/addons/utils/SkeletonUtils.js';
import { enableContinuousTransformRotation } from '../3_ToolSelector/continuous-transform-rotation.mjs?v=20260720-rx-continuous-1';
import { buildStepSnapCandidates } from '../3_ToolSelector/snap-geometry.mjs?v=20260721-face-filter-1';
import { MeshCollisionSystem } from './collision-system.mjs?v=20260726-collision-smooth-2';
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
    advanceMotionCursor,
    getDirectionalTimerActions,
    createEmptyMotionProgram,
    cloneMotionProgram,
    reorderMotionSteps,
    normalizeMotionProject
} from './motion-program-core.mjs?v=20260815-reverse-repeat-1';
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
import {
    buildOlpProjectFromFiles,
    getOlpEditableFiles,
    normalizeOlpTextForWindows,
    resolveOlpPoint,
    updateOlpFileText
} from './olp-project-core.mjs?v=20260727-olp-windows-newline-1';
import * as WorkspaceRecovery from './workspace-recovery-core.mjs?v=20260815-workspace-selector-1';
import {
    BIT_COUNT as OLP_BIT_COUNT,
    BIT_START as OLP_BIT_START,
    WORD_COUNT as OLP_WORD_COUNT,
    WORD_START as OLP_WORD_START,
    OLP_RUNTIME_BUILD,
    OlpRuntime,
    clampWord,
    normalizeAddress as normalizeOlpAddress
} from './olp-runtime.mjs?v=20260726-olp-runtime-30';
function uiText(value) {
    return window.InoRobotI18n ? window.InoRobotI18n.translate(String(value)) : String(value);
}

function uiFormat(value, replacements = {}) {
    return uiText(value).replace(/\{([A-Za-z0-9_]+)\}/g, (match, key) => (
        Object.prototype.hasOwnProperty.call(replacements, key) ? String(replacements[key]) : match
    ));
}

const IS_MANUAL_GUIDE_EMBED = window.self !== window.top
    && new URLSearchParams(window.location.search).get('embed') === 'manual-guide';

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
    modelTreeCollapsedIds: new Set(),
    modelClipboard: null,
    modelClipboardPastePending: false,
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
    motionReverseRepeatRobot: false,
    motionReverseRepeat: false,
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
    workspaceRecovery: {
        db: null,
        workspace: null,
        workspaceId: null,
        ownerId: null,
        ready: false,
        restoring: false,
        saveInFlight: null,
        saveQueued: false,
        requestedRevision: 0,
        leaseLost: false,
        heartbeatTimer: null,
        channel: null,
        channelListener: null,
        pendingProbes: new Map(),
        recoveryChoiceResolver: null,
        recoveryCandidates: [],
        selectedRecoveryWorkspaceId: null,
        ownershipTransition: null,
        unloading: false,
        legacyMigrationPending: false,
        legacyMigrationFingerprint: null,
        startupWarning: false
    },
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
        bridgeToken: null,
        bridgeHealthDeadline: 0,
        bridgeHealthTimer: null,
        bridgeHealthFailureCount: 0,
        bridgeHealthCheckSequence: 0,
        bridgeHealthMonitorGeneration: 0,
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
        reconnectAttempt: 0,
        reconnectMessage: '',
        streamWatchdogTimer: null,
        socketGeneration: 0
    },
    olp: {
        enabled: false,
        project: null,
        runtime: null,
        socket: null,
        status: 'disconnected',
        selectedFile: '',
        importInProgress: false,
        projectEditTimer: null,
        projectDirty: false,
        inputWords: new Uint16Array(OLP_WORD_COUNT),
        outputWords: new Uint16Array(OLP_WORD_COUNT),
        inputExtended: new Map(),
        outputExtended: new Map(),
        positionCommandValues: new Map(),
        // These are display-only pointers to the last real Virtual Bus input
        // observed by OLP.  They never alter the bus or program input state.
        lastRawInputBitAddress: '',
        lastRawInputWordAddress: '',
        outputTimer: null,
        lastOutputSignature: '',
        reconnectTimer: null,
        busMonitorTimer: null,
        busHandshakeTimer: null,
        ioRenderTimer: null,
        ioRenderAt: 0,
        runtimeViewTimer: null,
        runtimeViewPending: null,
        virtualBusWanted: false,
        busToken: null,
        remoteCommandValues: new Map(),
        remoteCommandBusy: false,
        resetCursorOnStop: false,
        workOriginBusy: false,
        manualMoveBusy: false,
        pointContextTarget: null,
        editorHiddenProgramInfo: new Map(),
        editorLineOffsets: new Map(),
        consoleLines: [],
        consoleEntries: [],
        busStatus: 'Virtual Bus disconnected',
        // Transport-open and tester/master handshake are separate states.
        // A browser socket to the local broker is not a connected Virtual Bus
        // until the tester sends the master ready message.
        busConnected: false,
        // Incremented whenever the OLP transport is replaced or invalidated.
        // WebSocket events can arrive after close()/goodbye(); stale events
        // must never be allowed to turn the indicator green again.
        busSocketGeneration: 0,
        busPhase: 'off',
        busLastPacketAt: 0,
        lastIoEvent: 'No Virtual Bus packet received.',
        lastIoSource: 'No Virtual Bus packet received.',
        lastIoReplacements: {},
        lastInputAt: 0,
        lastOutputAt: 0,
        lastMotion: 'No OLP motion command executed yet.',
        lastMotionSource: 'No OLP motion command executed yet.',
        lastMotionReplacements: {},
        lastInputSignature: '',
        modelAdaptationNotices: new Set(),
        execution: {
            phase: 'ready',
            running: false,
            paused: false,
            filePath: null,
            lineNumber: 0,
            lineText: '',
            command: '',
            waitCondition: '',
            callStack: [],
            alarm: null
        }
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
        lastVisualResult: null,
        lastVisualHitAt: 0,
        visualClearTimer: null,
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
    workspaceRecoveryDialog: document.getElementById('workspace-recovery-dialog'),
    workspaceRecoveryDescription: document.getElementById('workspace-recovery-description'),
    workspaceRecoveryOptions: document.getElementById('workspace-recovery-options'),
    workspaceRecoveryList: document.getElementById('workspace-recovery-list'),
    workspaceRecoveryDetails: document.getElementById('workspace-recovery-details'),
    workspaceRecoverySavedAt: document.getElementById('workspace-recovery-saved-at'),
    workspaceRecoverySummary: document.getElementById('workspace-recovery-summary'),
    workspaceRecoveryIsolationNote: document.getElementById('workspace-recovery-isolation-note'),
    workspaceRecoveryError: document.getElementById('workspace-recovery-error'),
    btnWorkspaceNew: document.getElementById('btn-workspace-new'),
    btnWorkspaceRestore: document.getElementById('btn-workspace-restore'),
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
    modelCopy: document.getElementById('model-copy'),
    modelPaste: document.getElementById('model-paste'),
    modelDelete: document.getElementById('model-delete'),
    modelChangeZeroPoint: document.getElementById('model-change-zero-point'),
    modelChangeColor: document.getElementById('model-change-color'),
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
    olpModeButton: document.getElementById('olp-mode-button'),
    olpRobotControlSlot: document.getElementById('olp-robot-control-slot'),
    olpInlineCursor: document.getElementById('olp-inline-cursor'),
    olpWorkspace: document.getElementById('olp-workspace'),
    olpWorkspaceTitle: document.getElementById('olp-workspace-title'),
    olpProjectName: document.getElementById('olp-project-name'),
    olpStatusDot: document.getElementById('olp-status-dot'),
    olpBusIndicator: document.getElementById('olp-bus-indicator'),
    olpImportFolderInput: document.getElementById('olp-import-folder-input'),
    olpFileSelect: document.getElementById('olp-file-select'),
    olpFileGutter: document.getElementById('olp-file-gutter'),
    olpFileEditor: document.getElementById('olp-file-editor'),
    olpFileHighlight: document.getElementById('olp-file-highlight'),
    olpPointTable: document.getElementById('olp-point-table'),
    olpPointContextMenu: document.getElementById('olp-point-context-menu'),
    olpPointWriteCurrent: document.getElementById('olp-point-write-current'),
    olpPointMoveTarget: document.getElementById('olp-point-move-target'),
    olpBusStatus: document.getElementById('olp-bus-status'),
    olpIoNote: document.getElementById('olp-io-note'),
    olpIoInBitAddress: document.getElementById('olp-io-in-bit-address'),
    olpIoOutBitAddress: document.getElementById('olp-io-out-bit-address'),
    olpIoInWordAddress: document.getElementById('olp-io-in-word-address'),
    olpIoOutWordAddress: document.getElementById('olp-io-out-word-address'),
    olpIoInBit: document.getElementById('olp-io-in-bit'),
    olpIoOutBit: document.getElementById('olp-io-out-bit'),
    olpIoInWord: document.getElementById('olp-io-in-word'),
    olpIoOutWord: document.getElementById('olp-io-out-word'),
    olpIoLast: document.getElementById('olp-io-last'),
    olpMotionLast: document.getElementById('olp-motion-last'),
    olpRuntimeBadge: document.getElementById('olp-runtime-badge'),
    olpRuntimeState: document.getElementById('olp-runtime-state'),
    olpRuntimeCursor: document.getElementById('olp-runtime-cursor'),
    olpRuntimeLine: document.getElementById('olp-runtime-line'),
    olpRuntimeStack: document.getElementById('olp-runtime-stack'),
    olpConsole: document.getElementById('olp-console'),
    programPointSection: document.getElementById('program-point-section'),
    programPointActions: document.getElementById('program-point-actions'),
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
    btnProgramWorkOriginRobot: document.getElementById('program-work-origin-robot'),
    programControlRobot: document.getElementById('program-control-robot'),
    programPlayback: document.getElementById('program-playback'),
    btnProgramStepGroup: document.getElementById('program-step-group'),
    btnProgramRunGroup: document.getElementById('program-run-group'),
    btnProgramPauseGroup: document.getElementById('program-pause-group'),
    btnProgramStopGroup: document.getElementById('program-stop-group'),
    programControlGroup: document.getElementById('program-control-group'),
    programRepeatButtons: [...document.querySelectorAll('[data-program-repeat], [data-program-reverse-repeat]')],
    programCycleTimePanel: document.getElementById('program-cycle-time-panel'),
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
    viewWindow: document.getElementById('view-window'),
    viewWindowTitle: document.getElementById('view-window-title'),
    viewWindowCount: document.getElementById('view-window-count'),
    viewWindowPopout: document.getElementById('view-window-popout'),
    viewWindowHide: document.getElementById('view-window-hide'),
    viewWindowGrid: document.getElementById('view-window-grid'),
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
// TUBE.stl keeps each cable's authored CAD shape. These Z translations restore
// the component placement measured in the matching full SCARA assembly FBX.
const SCARA_TUBE_CAD_Z_OFFSETS = Object.freeze({
    'IR-S4-40Z15': -2,
    'IR-S7-50Z20': -1,
    'IR-S7-60Z20': 1,
    'IR-S7-70Z20': -1,
    'IR-S10-60Z20': -1,
    'IR-S10-70Z20': -1,
    'IR-S10-80Z20': -1,
    'IR-S25-80Z42': 0,
    'IR-S25-100Z42': -5.002,
    'IR-S25-120Z42': -52.5,
    'IR-S35-80Z42': 0,
    'IR-S35-100Z42': 0,
    'IR-S35-120Z42': 0,
    'IR-S60-120Z40': -45.372,
    'IR-GS60-120Z40': -5.628
});
const SIX_AXIS_POSITION_HOME_QUATERNION = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(-Math.PI, -Math.PI / 2, 0, 'ZYX')
);
const stlGeometryCache = new Map();
const BASE_JOG_HOLD_DELAY = 250;
const BASE_JOG_REPEAT_INTERVAL = 30;
const COLLISION_VISUAL_CLEAR_DELAY_MS = 180;
const TCP_PROFILE_COUNT = 3;
const TRACE_SOURCE_LIVENESS_TIMEOUT_MS = 2500;
const VIRTUAL_CONTROLLER_STREAM_STALL_MS = 750;
const VIRTUAL_CONTROLLER_STREAM_WATCHDOG_MS = 250;
const VIRTUAL_CONTROLLER_BRIDGE_HEALTH_FAILURE_LIMIT = 3;
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
const WORKSPACE_SESSION_POINTER_KEY = WorkspaceRecovery.WORKSPACE_SESSION_KEY;
const WORKSPACE_START_CLEAN_KEY = WorkspaceRecovery.WORKSPACE_START_CLEAN_SESSION_KEY;
const WORKSPACE_BROADCAST_CHANNEL = WorkspaceRecovery.WORKSPACE_CHANNEL_NAME;
const WORKSPACE_LIVE_PROBE_TIMEOUT_MS = 180;
const WORKSPACE_HEARTBEAT_INTERVAL_MS = 5000;
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
    'view-window': { width: 360, height: 220 },
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
        let preserveWorkspaceStatus = false;
        if (IS_MANUAL_GUIDE_EMBED) renderMotionProgramPanel();
        else preserveWorkspaceStatus = await initializeWorkspaceRecovery();
        installSimulationManualGuide();
        if (!preserveWorkspaceStatus) setStatus('Ready', '#22c55e');
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
    const workspaceWasReady = state.workspaceRecovery.ready;
    const olpProjectWasDirty = state.olp.projectDirty;
    state.resetInProgress = true;
    closeSimulationResetDialog();
    if (el.btnResetSimulation) el.btnResetSimulation.disabled = true;
    if (el.btnConfirmSimulationReset) el.btnConfirmSimulationReset.disabled = true;
    window.clearTimeout(state.motionSaveTimer);
    state.motionSaveTimer = null;

    const recovery = state.workspaceRecovery;
    const resetLineageSourceId = recovery.workspace?.incompleteRecoveryFrom
        || recovery.workspaceId;
    recovery.ready = false;
    state.olp.projectDirty = false;
    try {
        if (recovery.saveInFlight) await recovery.saveInFlight.catch(() => {});
        if (recovery.db && recovery.workspaceId) {
            await recovery.db.deleteWorkspace(recovery.workspaceId, { ownerId: recovery.ownerId });
        }
        if (recovery.db && resetLineageSourceId) {
            try {
                const lineageRecords = (await recovery.db.listWorkspaces())
                    .filter((record) => record.id === resetLineageSourceId
                        || record.incompleteRecoveryFrom === resetLineageSourceId);
                for (const record of lineageRecords) {
                    try {
                        await recovery.db.archiveWorkspace(record.id, true, {
                            expectedRevision: record.revision,
                            requireUnleased: true
                        });
                    } catch (error) {
                        // A different live window owns this record, so its
                        // independent work must survive this window's reset.
                        console.warn('Unable to archive a reset recovery record:', error);
                    }
                }
            } catch (error) {
                console.warn('Unable to inspect reset recovery records:', error);
            }
        }
        try {
            localStorage.removeItem(MOTION_PROJECT_STORAGE_KEY);
            localStorage.removeItem(VIEW_PRESETS_STORAGE_KEY);
        } catch (error) {
            console.warn('Unable to clear legacy simulation storage:', error);
        }
        writeSessionStorageValue(WORKSPACE_SESSION_POINTER_KEY, null);
        writeSessionStorageValue(WORKSPACE_START_CLEAN_KEY, '1');
        releaseWorkspaceOwnership();
    } catch (error) {
        console.error('Simulation reset failed:', error);
        recovery.ready = workspaceWasReady;
        state.olp.projectDirty = olpProjectWasDirty;
        state.resetInProgress = false;
        if (el.btnResetSimulation) el.btnResetSimulation.disabled = false;
        if (el.btnConfirmSimulationReset) el.btnConfirmSimulationReset.disabled = false;
        setStatus('작업을 자동 저장하지 못했습니다.', '#ef4444');
        return;
    }
    window.location.reload();
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
            <button type="button" class="interference-zone-read" data-interference-zone-read title="${uiText('실제 컨트롤러에서 설정 가져오기')}">${uiText('가져오기')}</button>
            <button type="button" class="interference-zone-edit" data-interference-zone-edit>${uiText('Edit')}</button>
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
    if (IS_MANUAL_GUIDE_EMBED) return;
    scheduleMotionProjectSave();
}

function loadViewConfiguration() {
    state.viewPresets = Array.from({ length: VIEW_PRESET_COUNT }, () => null);
    if (IS_MANUAL_GUIDE_EMBED) {
        refreshViewPresetsUi();
        return;
    }
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

function getViewWindowRecord() {
    const viewWindow = state.viewWindow;
    if (!viewWindow) return null;
    if (viewWindow.root?.isConnected) return viewWindow;
    closeViewWindow();
    return null;
}

function getOpenViewWindow() {
    const viewWindow = getViewWindowRecord();
    return viewWindow && !viewWindow.root.classList.contains('hidden')
        ? viewWindow
        : null;
}

function bringViewWindowToFront() {
    if (!el.viewWindow || el.viewWindow.classList.contains('hidden')) return;
    el.viewWindow.style.zIndex = String(PANEL_STACK_BASE_Z_INDEX + PANEL_IDS.length + 10);
}

function updateViewWindowHeader() {
    const viewWindow = state.viewWindow;
    if (!viewWindow?.root?.isConnected) return;
    const count = viewWindow.cells.size;
    if (viewWindow.grid) viewWindow.grid.dataset.count = String(count);
    if (el.viewWindowCount) el.viewWindowCount.textContent = String(count);
    if (el.viewWindowTitle) {
        el.viewWindowTitle.setAttribute('aria-label', uiFormat('고정 뷰 {count}개', { count }));
    }
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
    if (!viewWindow?.root || !viewWindow.grid) return;
    const ownerWindow = viewWindow.root.ownerDocument?.defaultView || window;
    const pixelRatio = Math.min(ownerWindow.devicePixelRatio || 1, 2);
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
    if (!viewWindow?.root || !viewWindow.grid || !preset || !isValidViewPreset(preset)) return null;
    const ownerDocument = viewWindow.root.ownerDocument || document;
    const element = ownerDocument.createElement('article');
    element.className = 'view-window-cell';
    element.dataset.slot = String(slot);

    const label = ownerDocument.createElement('span');
    label.className = 'view-window-label';
    label.textContent = String(Number(slot) + 1);
    label.setAttribute('aria-hidden', 'true');
    element.append(label);

    const canvas = ownerDocument.createElement('canvas');
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

function restoreViewWindowFromPopup(closePopup = false) {
    const viewWindow = state.viewWindow;
    if (!viewWindow?.popup) return;
    const popup = viewWindow.popup;
    viewWindow.popup = null;
    popup.removeEventListener('resize', viewWindow.handleResize);
    if (viewWindow.placeholder?.parentNode) {
        viewWindow.placeholder.parentNode.insertBefore(viewWindow.root, viewWindow.placeholder);
        viewWindow.placeholder.remove();
    }
    viewWindow.placeholder = null;
    viewWindow.root.classList.remove('panel-popout');
    if (viewWindow.savedStyle) viewWindow.root.setAttribute('style', viewWindow.savedStyle);
    else viewWindow.root.removeAttribute('style');
    viewWindow.savedStyle = '';
    if (closePopup && !popup.closed) popup.close();
    requestRender();
}

function closeViewWindow() {
    const viewWindow = state.viewWindow;
    if (!viewWindow) return;
    restoreViewWindowFromPopup(true);
    state.viewWindow = null;
    viewWindow.resizeObserver?.disconnect();
    viewWindow.cells.forEach((cell) => {
        cell.controls.dispose();
        cell.renderer.dispose();
    });
    viewWindow.grid?.replaceChildren();
    viewWindow.root?.classList.add('hidden');
    if (el.viewWindowCount) el.viewWindowCount.textContent = '0';
}

function hideViewWindow() {
    const viewWindow = getViewWindowRecord();
    if (!viewWindow) return;
    restoreViewWindowFromPopup(true);
    viewWindow.root.classList.add('hidden');
    requestRender();
}

function popOutViewWindow() {
    const viewWindow = getViewWindowRecord();
    if (!viewWindow) return;
    if (viewWindow.popup && !viewWindow.popup.closed) {
        viewWindow.popup.focus();
        return;
    }

    const popup = window.open('', 'InoRobot-fixed-view-window', 'popup=yes,width=1100,height=780,resizable=yes');
    if (!popup) {
        setStatus('팝업이 차단되었습니다. 고정 뷰 창을 열려면 팝업을 허용하세요.', '#ef4444');
        return;
    }

    popup.document.open();
    popup.document.write(`<!doctype html><html lang="ko"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>3D Simulation - ${uiText('고정 뷰 창')}</title></head><body></body></html>`);
    popup.document.close();
    document.querySelectorAll('link[rel="stylesheet"]').forEach((source) => {
        const link = popup.document.createElement('link');
        link.rel = 'stylesheet';
        link.href = source.href;
        popup.document.head.appendChild(link);
    });
    popup.document.body.className = 'panel-popout-body';

    const placeholder = document.createComment('view-window placeholder');
    viewWindow.root.parentNode.insertBefore(placeholder, viewWindow.root);
    const savedStyle = viewWindow.root.getAttribute('style') || '';
    viewWindow.root.removeAttribute('style');
    viewWindow.root.classList.remove('hidden');
    viewWindow.root.classList.add('panel-popout');
    popup.document.body.appendChild(viewWindow.root);

    viewWindow.popup = popup;
    viewWindow.placeholder = placeholder;
    viewWindow.savedStyle = savedStyle;
    popup.addEventListener('resize', viewWindow.handleResize);
    popup.addEventListener('beforeunload', () => restoreViewWindowFromPopup(false), { once: true });
    resizeViewWindow();
    requestRender();
    popup.focus();
}

function openViewWindow(slot) {
    const index = Number(slot);
    const preset = getViewPreset(index);
    if (!preset || !isValidViewPreset(preset) || !state.camera || !state.scene) return;

    const existing = getViewWindowRecord();
    if (existing) {
        existing.root.classList.remove('hidden');
        if (!existing.cells.has(index)) createViewWindowCell(index);
        updateViewWindowHeader();
        resizeViewWindow();
        applyViewWindowPreset(index);
        bringViewWindowToFront();
        return;
    }

    if (!el.viewWindow || !el.viewWindowGrid) {
        setStatus('고정 뷰 창을 표시할 수 없습니다.', '#ef4444');
        return;
    }

    const grid = el.viewWindowGrid;
    state.viewWindow = {
        root: el.viewWindow,
        grid,
        cells: new Map(),
        handleResize: null,
        resizeObserver: null,
        popup: null,
        placeholder: null,
        savedStyle: ''
    };
    el.viewWindow.classList.remove('hidden');
    const handleResize = () => resizeViewWindow();
    state.viewWindow.handleResize = handleResize;
    const ownerWindow = el.viewWindow.ownerDocument?.defaultView || window;
    if (typeof ownerWindow.ResizeObserver === 'function') {
        state.viewWindow.resizeObserver = new ownerWindow.ResizeObserver(handleResize);
        state.viewWindow.resizeObserver.observe(grid);
    }
    createViewWindowCell(index);
    updateViewWindowHeader();
    resizeViewWindow();
    applyViewWindowPreset(index);
    bringViewWindowToFront();
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
            monitorButton.title = uiText('페이지 안의 고정 뷰 창에 보기');
            monitorButton.setAttribute('aria-label', uiFormat('{name}을 페이지 안의 고정 뷰 창에 보기', {
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
    refreshOlpLocalizedUi();
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
    if (state.collision.lastVisualResult || state.collision.lastResult) {
        updateCollisionStatus(state.collision.lastVisualResult || state.collision.lastResult);
    }
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

function refreshOlpLocalizedUi() {
    if (el.olpModeButton) el.olpModeButton.title = uiText('Open Offline Line Programming mode');
    if (el.olpWorkspace) el.olpWorkspace.setAttribute('aria-label', uiText('OLP workspace'));
    if (el.olpWorkspaceTitle) el.olpWorkspaceTitle.textContent = uiText('OFFLINE LINE PROGRAMMING');
    if (el.olpFileSelect) el.olpFileSelect.setAttribute('aria-label', uiText('Project files'));
    if (el.olpFileEditor) el.olpFileEditor.setAttribute('aria-label', uiText('Selected project file'));
    if (el.olpPointTable) el.olpPointTable.setAttribute('aria-label', uiText('Point file table'));
    if (el.olpRobotControlSlot) el.olpRobotControlSlot.setAttribute('aria-label', uiText('OLP robot controls'));
    if (el.olpPointWriteCurrent) {
        el.olpPointWriteCurrent.innerHTML = `<i class="fa-solid fa-location-crosshairs"></i> ${uiText('현재 위치로 수정')}`;
    }
    if (el.olpPointMoveTarget) {
        el.olpPointMoveTarget.innerHTML = `<i class="fa-solid fa-person-walking"></i> ${uiText('해당 위치로 이동')}`;
    }
    if (el.olpInlineCursor && !state.olp.execution?.filePath) {
        el.olpInlineCursor.textContent = `main.pro:-- · ${uiText('READY')}`;
    }
    if (state.olp.project) {
        if (el.olpProjectName) {
            el.olpProjectName.textContent = uiFormat('{name} · {count} files', {
                name: state.olp.project.name,
                count: state.olp.project.files.size
            });
        }
        renderOlpPointTable();
    } else if (el.olpProjectName) {
        el.olpProjectName.textContent = uiText('No project loaded');
    }
    renderOlpConsole();
    renderOlpIoMonitor();
    updateOlpProgramPanelUi();
    updateOlpProgramIndicator();
    updateOlpBusIndicator();
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

function setCollisionMaterialHighlight(material, enabled) {
    const snapshots = state.collision.highlightedMaterials;
    const snapshot = snapshots.get(material);
    if (enabled) {
        if (snapshot) return;
        snapshots.set(material, {
            color: material.color?.clone?.() || null,
            emissive: material.emissive?.clone?.() || null,
            emissiveIntensity: Number.isFinite(material.emissiveIntensity)
                ? material.emissiveIntensity
                : null
        });
        material.color?.setHex(0xef4444);
        material.emissive?.setHex(0x7f1d1d);
        if ('emissiveIntensity' in material) material.emissiveIntensity = 0.9;
        return;
    }
    if (!snapshot) return;
    if (snapshot.color && material.color) material.color.copy(snapshot.color);
    if (snapshot.emissive && material.emissive) material.emissive.copy(snapshot.emissive);
    if (snapshot.emissiveIntensity !== null && 'emissiveIntensity' in material) {
        material.emissiveIntensity = snapshot.emissiveIntensity;
    }
    snapshots.delete(material);
}

function collectCollisionHighlightMaterials(result) {
    const materials = new Set();
    const attachedTools = new Set();
    asCollisionResults(result).forEach((hit) => {
        getCollisionMaterials(hit.meshA).forEach((material) => materials.add(material));
        getCollisionMaterials(hit.meshB).forEach((material) => materials.add(material));
        if (hit.objectA?.userData?.attachmentHost) attachedTools.add(hit.objectA);
        if (hit.objectB?.userData?.attachmentHost) attachedTools.add(hit.objectB);
    });

    // A Tool import often contains several independently coloured meshes.
    // checkAll() intentionally retains one precise contact per robot link for
    // motion performance, so colouring only that representative mesh can
    // leave another visibly colliding Tool part green. Once a Tool is part of
    // a collision pair, show the complete Tool assembly in red without adding
    // another expensive mesh-pair scan. De-duplicate each Tool and material so
    // a multi-link collision never traverses or updates the same assembly more
    // than once.
    attachedTools.forEach((model) => {
        model.traverse((child) => {
            if (!child.isMesh || child.userData?.collisionDisabled) return;
            getCollisionMaterials(child).forEach((material) => materials.add(material));
        });
    });
    return materials;
}

function syncCollisionHighlight(result) {
    const desiredMaterials = collectCollisionHighlightMaterials(result);
    [...state.collision.highlightedMaterials.keys()].forEach((material) => {
        if (!desiredMaterials.has(material)) setCollisionMaterialHighlight(material, false);
    });
    desiredMaterials.forEach((material) => setCollisionMaterialHighlight(material, true));
}

function clearCollisionHighlight() {
    [...state.collision.highlightedMaterials.keys()]
        .forEach((material) => setCollisionMaterialHighlight(material, false));
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

function cancelCollisionVisualClearTimer() {
    if (!state.collision.visualClearTimer) return;
    window.clearTimeout(state.collision.visualClearTimer);
    state.collision.visualClearTimer = null;
}

function resolveCollisionVisualResult(result, {
    now = performance.now(),
    immediate = false
} = {}) {
    const results = asCollisionResults(result);
    if (results.length) {
        cancelCollisionVisualClearTimer();
        state.collision.lastVisualHitAt = now;
        return results;
    }

    const previousResults = asCollisionResults(state.collision.lastVisualResult);
    if (immediate || !previousResults.length || state.collision.stopNotice) {
        cancelCollisionVisualClearTimer();
        state.collision.lastVisualHitAt = 0;
        return null;
    }

    const remaining = COLLISION_VISUAL_CLEAR_DELAY_MS - (now - state.collision.lastVisualHitAt);
    if (remaining <= 0) {
        cancelCollisionVisualClearTimer();
        state.collision.lastVisualHitAt = 0;
        return null;
    }

    // A single boundary miss used to flash every material back to its base
    // colour and red again on the following scan. Keep only the visual state
    // latched briefly; motion logic still receives the raw empty result.
    if (!state.collision.visualClearTimer) {
        state.collision.visualClearTimer = window.setTimeout(() => {
            state.collision.visualClearTimer = null;
            if (asCollisionResults(state.collision.lastResult).length || state.collision.stopNotice) return;
            state.collision.lastVisualHitAt = 0;
            state.collision.lastResult = null;
            updateCollisionStatus(resolveCollisionVisualResult(null, { immediate: true }));
            requestRender();
        }, Math.ceil(remaining));
    }
    return previousResults;
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
            if (collisionResultsKey(state.collision.lastVisualResult) !== collisionResultsKey(stopResults)) {
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
        state.collision.lastVisualResult = null;
        state.collision.lastStatusKey = '';
        return;
    }

    const primary = results[0];
    const leftName = collisionModelLabel(primary.objectA);
    const rightName = collisionModelLabel(primary.objectB);
    const statusKey = collisionResultsKey(results);
    const sameCollision = state.collision.lastStatusKey === statusKey;
    if (!sameCollision) syncCollisionHighlight(results);
    state.collision.lastVisualResult = results;
    const collisionMessage = '충돌 감지: {left} ↔ {right}';
    const collisionReplacements = {
        left: leftName,
        right: rightName
    };
    if (status) {
        if (status.classList.contains('hidden')) status.classList.remove('hidden');
        const label = status.querySelector('span');
        const nextLabel = uiFormat(collisionMessage, collisionReplacements);
        if (label && label.textContent !== nextLabel) label.textContent = nextLabel;
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
            state.collision.lastResult = null;
            updateCollisionStatus(resolveCollisionVisualResult(null, { immediate: true }));
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
        const collisionModels = getCollisionModels();
        const changedRoots = new Set(
            [...state.collision.dirtyRoots].filter((root) => collisionModels.includes(root))
        );
        if (!force && changedRoots.size > 0) {
            changedRoots.forEach((root) => {
                if (typeof root.updateWorldMatrix === 'function') root.updateWorldMatrix(true, true);
                else root.updateMatrixWorld(true);
            });
        } else {
            state.scene?.updateMatrixWorld(true);
        }
        if (force) state.collision.system.prepare(collisionModels);
        const result = force || changedRoots.size === 0
            ? state.collision.system.checkAll(collisionModels, { allowWarmHitReuse: false })
            : state.collision.system.checkAll(collisionModels, { changedRoots, allowWarmHitReuse: true });
        state.collision.dirty = false;
        state.collision.dirtyRoots.clear();
        state.collision.lastResult = result;
        updateCollisionStatus(resolveCollisionVisualResult(result, { now, immediate: force }));
        return result;
    } catch (error) {
        console.warn('Mesh collision check failed:', error);
        state.collision.dirty = false;
        state.collision.dirtyRoots.clear();
        const wasReported = state.collision.lastStatusKey === 'error';
        state.collision.lastResult = null;
        updateCollisionStatus(resolveCollisionVisualResult(null, { immediate: true }));
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

function isSimulationSnapFaceSelectionActive(scope = getSimulationSnapScope()) {
    return (scope === 'scene' && state.snapMoveMode)
        || (scope === 'zero' && state.zeroPointEdit.active && state.zeroPointEdit.snapMode);
}

function getSimulationSnapMeshes(scope = 'scene') {
    const selections = getSimulationSnapFaceSelections();
    if (isSimulationSnapFaceSelectionActive(scope) && selections.length) {
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
    const faceSelections = isSimulationSnapFaceSelectionActive(scope)
        ? cloneSimulationSnapFaceSelections() : [];
    if (isSimulationSnapFaceSelectionActive(scope) && !faceSelections.length) {
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
    const faceSelections = isSimulationSnapFaceSelectionActive(scope)
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
    const scope = getSimulationSnapScope();
    if (!isSimulationSnapFaceSelectionActive(scope) || !getSimulationSnapFaceSelections().length
        || !state.snapCandidatesReady
        || !el.canvasContainer || !state.renderer || !state.camera) {
        clearSimulationSnapCandidateMarkers();
        return;
    }
    const meshes = getSimulationSnapMeshes(scope);
    const bounds = state.renderer.domElement.getBoundingClientRect();
    if (!meshes.length || bounds.width <= 0 || bounds.height <= 0) {
        clearSimulationSnapCandidateMarkers();
        return;
    }
    state.camera.updateMatrixWorld(true);
    getSimulationSnapWorldIndex(meshes);
    // Selected-face candidates are intentional snap targets. Do not let the
    // model's depth occlusion hide them while face-selection mode is active; the
    // marker layer must keep priority over geometry behind the selected face.
    const visibilityMeshes = isSimulationSnapFaceSelectionActive(scope)
        || isLargeModelSnapPerformanceMode(scope)
        ? null
        : getAllSimulationSnapMeshes(scope);
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

function pickSimulationSnapFaceAtPointer(pointerEvent, scope = getSimulationSnapScope()) {
    const meshes = getAllSimulationSnapMeshes(scope);
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

function handleSimulationSnapFaceSelectionClick(event) {
    const scope = getSimulationSnapScope();
    const selectedFaces = getSimulationSnapFaceSelections();
    if (event.shiftKey) {
        const selection = pickSimulationSnapFaceAtPointer(event, scope);
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
        if (state.snapMoveMode) {
            if (moveRobotTcpToSimulationSnap(snap)) showSimulationSnapMarker(snap);
        } else if (state.zeroPointEdit.active && state.zeroPointEdit.snapMode) {
            handleZeroPointSnapSelection(snap);
        }
        return;
    }

    const selection = pickSimulationSnapFaceAtPointer(event, scope);
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
    const scope = getSimulationSnapScope();
    void buildSimulationSnapCandidates(scope).then(() => {
        if (!isSimulationSnapFaceSelectionActive(scope)
            || getSimulationSnapFaceSelectionSignature() !== selectionSignature) return;
        if (scope === 'zero') {
            setZeroPointSnapReadout('선택한 면의 스냅 후보를 클릭하세요.');
        }
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
    scheduleMotionProjectSave();
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
    const scope = getSimulationSnapScope();
    const meshes = getPreparedSimulationSnapMeshes(scope);
    if (!meshes.length) return null;
    const visibilityMeshes = isSimulationSnapFaceSelectionActive(scope)
        ? getAllSimulationSnapMeshes(scope)
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
    if (isSimulationSnapFaceSelectionActive(getSimulationSnapScope())) {
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
        invalidateSimulationSnapCandidates();
        if (state.tcpSnapMode) setTcpSnapMode(false);
        state.snapLastPointerEvent = null;
        resetZeroPointSnapPoints();
        captureSimulationSnapMarkerReferenceDistance();
        setZeroPointSnapReadout('스냅할 3D 모델의 면을 클릭하세요.');
        setStatus('스냅할 3D 모델의 면을 클릭하세요.', '#60a5fa');
        if (el.btnZeroPointSnap) {
            el.btnZeroPointSnap.classList.add('active');
            el.btnZeroPointSnap.setAttribute('aria-pressed', 'true');
        }
    } else {
        clearSimulationSnapFaceSelection({ invalidate: false });
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
    el.canvasContainer?.classList.toggle(
        'simulation-snap-picking',
        state.snapMoveMode || state.zeroPointEdit.snapMode
    );
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
    if (isSimulationSnapFaceSelectionActive()) {
        handleSimulationSnapFaceSelectionClick(event);
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
    el.canvasContainer?.classList.toggle(
        'simulation-snap-picking',
        state.snapMoveMode || state.zeroPointEdit.snapMode
    );
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
    state.controls.addEventListener('end', scheduleMotionProjectSave);

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

function setupOlpConsoleScroll() {
    const consoleElement = el.olpConsole;
    if (!consoleElement) return;
    consoleElement.addEventListener('wheel', (event) => {
        if (event.ctrlKey || consoleElement.scrollHeight <= consoleElement.clientHeight || !event.deltaY) return;
        const lineHeight = Number.parseFloat(getComputedStyle(consoleElement).lineHeight) || 13;
        // Mouse wheels usually report pixels (around 100px per notch). Scale
        // that to roughly one or two log lines; line-mode devices use their
        // own line unit and need a smaller correction.
        const scale = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? lineHeight * 0.5 : 0.18;
        event.preventDefault();
        consoleElement.scrollTop += event.deltaY * scale;
    }, { passive: false });
}

function setupOlpEditorScroll() {
    const editor = el.olpFileEditor;
    if (!editor) return;
    editor.addEventListener('wheel', (event) => {
        if (event.ctrlKey || editor.scrollHeight <= editor.clientHeight || !event.deltaY) return;
        const lineHeight = Number.parseFloat(getComputedStyle(editor).lineHeight) || 18;
        // Keep code browsing to roughly one or two source lines per wheel step.
        const scale = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? lineHeight * 0.5 : 0.18;
        event.preventDefault();
        editor.scrollTop += event.deltaY * scale;
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
    setupOlpConsoleScroll();
    setupOlpEditorScroll();
    document.addEventListener('pointermove', handleFullscreenUiPointerMove);
    document.addEventListener('click', requestRender);
    document.addEventListener('input', requestRender);
    document.addEventListener('change', requestRender);
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) void saveMotionProjectNow();
        else requestRender();
    });
    window.addEventListener('pagehide', (event) => {
        if (event.persisted || state.resetInProgress) return;
        void Promise.resolve(saveMotionProjectNow()).catch((error) => {
            console.warn('Final workspace save failed:', error);
        }).finally(() => {
            releaseWorkspaceOwnership();
        });
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
    el.btnWorkspaceNew?.addEventListener('click', () => resolveWorkspaceRecoveryChoice('new'));
    el.btnWorkspaceRestore?.addEventListener('click', () => resolveWorkspaceRecoveryChoice('restore'));
    el.workspaceRecoveryList?.addEventListener('change', handleWorkspaceRecoverySelectionChange);
    el.workspaceRecoveryDialog?.addEventListener('cancel', (event) => {
        // A recovery source must never be silently accepted or overwritten.
        event.preventDefault();
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
            state.collision.lastResult = null;
            updateCollisionStatus(resolveCollisionVisualResult(null, { immediate: true }));
            setStatus('충돌 감지 끄기', '#f59e0b');
        } else {
            setStatus('충돌 감지 켜기', '#22c55e');
            checkSceneCollisions({ force: true });
        }
        updateCollisionUi();
        requestRender();
        scheduleMotionProjectSave();
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
        const toggle = event.target.closest('[data-model-tree-toggle]');
        if (toggle) {
            event.preventDefault();
            const model = state.models.find((candidate) => candidate.userData.modelTreeId === toggle.dataset.modelTreeToggle);
            if (model) toggleModelTreeNode(model);
            return;
        }
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
        const contextTarget = event.target.closest(
            '[data-model-part-id], [data-model-part-visibility], [data-model-tree-id], [data-model-tree-toggle]'
        );
        if (!contextTarget) return;
        event.preventDefault();
        if (isMotionActive()) {
            closeModelContextMenu();
            return;
        }
        const partButton = event.target.closest('[data-model-part-id]');
        const partVisibility = event.target.closest('[data-model-part-visibility]');
        const partId = partButton?.dataset.modelPartId || partVisibility?.dataset.modelPartVisibility;
        const partMatch = partId ? findImportedModelPart(partId) : null;
        if (partId && !partMatch) return;
        const button = event.target.closest('[data-model-tree-id]');
        const model = partMatch?.model || state.models.find((candidate) => candidate.userData.modelTreeId === button?.dataset.modelTreeId);
        if (!model) return;
        commitPendingHistory('수치 모델 변환', 'pendingNumericHistory');
        if (partMatch) selectSceneModelPart(partMatch.model, partMatch.part);
        else selectSceneModel(model);
        openModelContextMenu(event, model, partMatch?.part || null);
    });
    el.modelCopy?.addEventListener('click', copyModelContextTarget);
    el.modelPaste?.addEventListener('click', () => {
        void pasteModelClipboard();
    });
    el.modelDelete?.addEventListener('click', () => {
        const target = getModelContextTarget();
        closeModelContextMenu();
        if (!target?.model || target.part || isMotionActive()) return;
        if (state.selectedModel !== target.model) selectSceneModel(target.model);
        deleteSelectedModel();
    });
    el.modelChangeZeroPoint?.addEventListener('click', () => {
        const target = getModelContextTarget();
        closeModelContextMenu();
        if (target?.model && !target.part) openZeroPointEditor(target.model);
    });
    el.modelColorPicker?.addEventListener('input', () => {
        const target = getModelContextTarget();
        if (target) {
            applyImportedModelColor(target.model, target.part, el.modelColorPicker.value);
            scheduleMotionProjectSave();
        }
    });
    el.modelColorPicker?.addEventListener('change', () => {
        closeModelContextMenu();
        scheduleMotionProjectSave();
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
            const hasFaceSelection = getSimulationSnapFaceSelections().length > 0;
            setZeroPointSnapReadout(!hasFaceSelection
                ? '스냅할 3D 모델의 면을 클릭하세요.'
                : isZeroPointMultiPointSnapMode()
                    ? '스냅 점 2~4개를 선택하세요.'
                    : '선택한 면의 스냅 후보를 클릭하세요.');
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
    el.viewWindowPopout?.addEventListener('click', popOutViewWindow);
    el.viewWindowHide?.addEventListener('click', hideViewWindow);
    [el.modelBrowserPanel, el.jogPanel, el.virtualControllerPanel, el.viewPresetsPanel, el.interferenceZonePanel, el.programPanel, el.viewWindow].forEach(makePanelDraggable);
    [el.tcpProfilePanel].forEach(makePanelDraggable);
    [el.modelBrowserPanel, el.jogPanel, el.virtualControllerPanel, el.viewPresetsPanel, el.interferenceZonePanel, el.programPanel, el.viewWindow].forEach(makePanelEdgeResizable);
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
    el.btnProgramStepRobot?.addEventListener('click', stepActiveProgramOrOlp);
    el.btnProgramRunRobot?.addEventListener('click', runActiveProgramOrOlp);
    el.btnProgramPauseRobot?.addEventListener('click', pauseActiveProgramOrOlp);
    el.btnProgramStopRobot?.addEventListener('click', stopActiveProgramOrOlp);
    el.btnProgramWorkOriginRobot?.addEventListener('click', () => void moveOlpToWorkOrigin());
    el.btnProgramStepGroup?.addEventListener('click', stepIntoCheckedRobots);
    el.btnProgramRunGroup?.addEventListener('click', runCheckedRobotPrograms);
    el.btnProgramPauseGroup?.addEventListener('click', pauseCheckedRobotMotions);
    el.btnProgramStopGroup?.addEventListener('click', stopCheckedRobotMotions);
    el.programRepeatButtons.forEach((button) => button.addEventListener('click', updateMotionRepeat));
    el.btnProgramExport?.addEventListener('click', () => void saveActiveProject());
    el.btnProgramImport?.addEventListener('click', importActiveProject);
    el.inputProgramImport?.addEventListener('change', handleMotionProjectImport);
    el.olpModeButton?.addEventListener('click', () => toggleOlpWorkspace());
    el.olpImportFolderInput?.addEventListener('change', handleOlpFolderImport);
    el.olpFileSelect?.addEventListener('change', () => {
        flushOlpPendingEdit();
        state.olp.selectedFile = el.olpFileSelect.value;
        renderOlpSelectedFile();
        scheduleMotionProjectSave();
    });
    el.olpPointTable?.addEventListener('contextmenu', handleOlpPointContextMenu);
    el.olpPointTable?.addEventListener('keydown', handleOlpPointTableActivate);
    el.olpPointWriteCurrent?.addEventListener('click', writeOlpPointFromCurrentRobot);
    el.olpPointMoveTarget?.addEventListener('click', () => void moveOlpPointFromContext());
    el.olpFileEditor?.addEventListener('input', () => {
        renderOlpSourceHighlight(el.olpFileEditor.value);
        if (!state.olp.project || !state.olp.selectedFile || isOlpRunning()) return;
        state.olp.projectDirty = true;
        scheduleMotionProjectSave();
        if (state.olp.projectEditTimer) clearTimeout(state.olp.projectEditTimer);
        state.olp.projectEditTimer = window.setTimeout(() => {
            state.olp.projectEditTimer = null;
            if (!state.olp.project || !state.olp.selectedFile || isOlpRunning()) return;
            updateOlpFileText(
                state.olp.project,
                state.olp.selectedFile,
                getOlpEditorProjectText(state.olp.selectedFile, el.olpFileEditor.value)
            );
        }, 250);
    });
    el.olpFileEditor?.addEventListener('scroll', syncOlpEditorScroll);
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
        if (el.olpPointContextMenu && !el.olpPointContextMenu.classList.contains('hidden')
            && !el.olpPointContextMenu.contains(event.target)) closeOlpPointContextMenu();
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
    
    el.btnResetView.addEventListener('click', () => {
        fitCamera();
        scheduleMotionProjectSave();
    });
    el.btnToggleOutline?.addEventListener('click', () => {
        setModelOutlineMode(!state.outlineMode);
    });
    el.btnToggleGrid.addEventListener('click', () => {
        state.grid.visible = !state.grid.visible;
        state.baseAxes.visible = state.grid.visible;
        state.labels.forEach(l => l.visible = state.grid.visible);
        el.btnToggleGrid.classList.toggle('active', state.grid.visible);
        scheduleMotionProjectSave();
    });
    updateOutlineToggleUi();

    window.addEventListener('keydown', handleGlobalKeyDown);

    const btnDown = document.getElementById('btn-download-cad');
    if (btnDown) {
        btnDown.addEventListener('click', handleCADDownload);
    }

    window.addEventListener('beforeunload', (event) => {
        flushOlpPendingEdit();
        if (state.olp.projectDirty) {
            event.preventDefault();
            event.returnValue = '';
        }
        closeVirtualControllerSocket(false);
        const olpSocket = state.olp.socket;
        state.olp.socket = null;
        state.olp.busConnected = false;
        if (olpSocket?.readyState === WebSocket.OPEN) {
            try { olpSocket.send(JSON.stringify({ type: 'goodbye', reason: 'Simulation closed' })); } catch { }
            try { olpSocket.close(); } catch { }
        }
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
    if (event.key === 'Escape' && isSimulationSnapFaceSelectionActive()
        && getSimulationSnapFaceSelections().length) {
        event.preventDefault();
        clearSimulationSnapFaceSelection();
        if (state.zeroPointEdit.active && state.zeroPointEdit.snapMode) {
            setZeroPointSnapReadout('스냅할 3D 모델의 면을 클릭하세요.');
        }
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
        motionReverseRepeatRobot: state.motionReverseRepeatRobot,
        motionReverseRepeat: state.motionReverseRepeat,
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
        || Boolean(a.motionRepeat) !== Boolean(b.motionRepeat)
        || Boolean(a.motionReverseRepeatRobot) !== Boolean(b.motionReverseRepeatRobot)
        || Boolean(a.motionReverseRepeat) !== Boolean(b.motionReverseRepeat)) return false;
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
        if (!snapshotModels.has(model)) {
            disposeCollisionDebugForModel(model);
            disposeModelOutlines(model);
        }
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
    state.motionReverseRepeatRobot = Boolean(snapshot.motionReverseRepeatRobot);
    state.motionReverseRepeat = Boolean(snapshot.motionReverseRepeat);
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

    const isOlpProgramPanel = panelId === 'program-panel' && state.olp.enabled;
    const popupFeatures = isOlpProgramPanel
        ? 'popup=yes,width=400,height=900,resizable=yes'
        : 'popup=yes,width=380,height=760,resizable=yes';
    const popup = window.open('', `InoRobot-${panelId}`, popupFeatures);
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
            canvasRect,
            olpPanel: panel === el.programPanel && panel.classList.contains('olp-mode-active')
        };
        panel.classList.add('panel-is-dragging');
        panel.setPointerCapture(event.pointerId);
        event.preventDefault();
    });
    panel.addEventListener('pointermove', (event) => {
        if (!drag || drag.pointerId !== event.pointerId) return;
        if (drag.olpPanel) panel.classList.add('olp-panel-positioned');
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
    ensureWorkspaceModelId(model);
    if (!model.userData.modelTreeId) {
        state.modelTreeIdCounter += 1;
        model.userData.modelTreeId = `scene-model-${state.modelTreeIdCounter}`;
    }
    return model.userData.modelTreeId;
}

function createWorkspaceObjectId(prefix = 'model') {
    const uuid = typeof WorkspaceRecovery.createWorkspaceId === 'function'
        ? WorkspaceRecovery.createWorkspaceId(prefix)
        : globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    return String(uuid).startsWith(`${prefix}-`) ? String(uuid) : `${prefix}-${uuid}`;
}

function ensureWorkspaceModelId(model, preferredId = '') {
    if (!model?.userData) return null;
    const requested = typeof preferredId === 'string' ? preferredId.trim() : '';
    if (requested) model.userData.workspaceModelId = requested;
    if (!model.userData.workspaceModelId) model.userData.workspaceModelId = createWorkspaceObjectId('model');
    return model.userData.workspaceModelId;
}

function findModelByWorkspaceId(workspaceModelId) {
    return typeof workspaceModelId === 'string'
        ? state.models.find((model) => model.userData.workspaceModelId === workspaceModelId) || null
        : null;
}

function modelTreeHasChildren(model) {
    return state.models.some((candidate) => candidate.userData.attachmentHost === model)
        || getImportedModelParts(model).length > 0;
}

function isModelTreeNodeCollapsed(model) {
    return state.modelTreeCollapsedIds.has(ensureModelTreeId(model));
}

function toggleModelTreeNode(model) {
    const treeId = ensureModelTreeId(model);
    if (state.modelTreeCollapsedIds.has(treeId)) state.modelTreeCollapsedIds.delete(treeId);
    else state.modelTreeCollapsedIds.add(treeId);
    renderModelTree();
    scheduleMotionProjectSave();
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
    row.dataset.modelPartId = part.userData.modelPartId;

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
    const hasChildren = modelTreeHasChildren(model);
    const collapsed = hasChildren && isModelTreeNodeCollapsed(model);
    const item = document.createElement('li');
    item.className = 'model-tree-node';
    item.setAttribute('role', 'treeitem');
    item.setAttribute('aria-selected', String(model === state.selectedModel));
    if (hasChildren) item.setAttribute('aria-expanded', String(!collapsed));

    const row = document.createElement('div');
    row.className = 'model-tree-node-row';
    row.dataset.modelTreeId = treeId;

    if (hasChildren) {
        const toggle = document.createElement('button');
        toggle.type = 'button';
        toggle.className = 'model-tree-toggle';
        toggle.dataset.modelTreeToggle = treeId;
        toggle.setAttribute('aria-expanded', String(!collapsed));
        toggle.setAttribute('aria-label', `${displayNameForModelTree(model)} ${uiText(collapsed ? '펼치기' : '접기')}`);
        toggle.title = uiText(collapsed ? '펼치기' : '접기');
        toggle.innerHTML = `<i class="fa-solid fa-chevron-${collapsed ? 'right' : 'down'}"></i>`;
        toggle.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            toggleModelTreeNode(model);
        });
        row.appendChild(toggle);
    } else {
        const placeholder = document.createElement('span');
        placeholder.className = 'model-tree-toggle-placeholder';
        placeholder.setAttribute('aria-hidden', 'true');
        row.appendChild(placeholder);
    }

    const button = document.createElement('button');
    button.type = 'button';
    button.className = `model-tree-button${model === state.selectedModel ? ' active' : ''}`;
    button.classList.add(`model-tree-button-${meta.className}`);
    button.dataset.modelTreeId = treeId;
    const displayName = displayNameForModelTree(model);
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
    row.appendChild(button);
    item.appendChild(row);

    const children = state.models.filter((candidate) => candidate.userData.attachmentHost === model);
    const parts = getImportedModelParts(model);
    if (hasChildren) {
        const childList = document.createElement('ul');
        childList.className = 'model-tree-children';
        childList.setAttribute('role', 'group');
        childList.hidden = collapsed;
        children.forEach((child) => childList.appendChild(createModelTreeNode(child)));
        parts.forEach((part) => childList.appendChild(createModelTreePartNode(model, part)));
        item.appendChild(childList);
    }
    return item;
}

function displayNameForModelTree(model) {
    return formatRobotPanelName(model.userData.motionDisplayName || model.userData.modelName || model.name || uiText('MODEL'));
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

const MODEL_CLIPBOARD_PASTE_OFFSET_Y = 600;
const MODEL_CLIPBOARD_TOOL_PASTE_OFFSET_Y = 100;
const MODEL_CLIPBOARD_USER_DATA_OMIT_KEYS = new Set([
    'attachmentHost',
    'attachmentFrame',
    'collisionGeometry',
    'importedParts',
    'modelPartId',
    'modelPartMaterials',
    'modelTreeId',
    'workspaceModelId',
    'outlineLine',
    'pendingToolAttachment',
    'stepBrepFaces'
]);

function cloneClipboardUserDataValue(value, seen) {
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    if (typeof value !== 'object') return undefined;
    if (ArrayBuffer.isView(value) || value instanceof ArrayBuffer) return undefined;
    if (value.isObject3D || value.isMaterial || value.isTexture || value.isBufferGeometry
        || value.isVector2 || value.isVector3 || value.isVector4 || value.isQuaternion
        || value.isEuler || value.isMatrix3 || value.isMatrix4 || value.isColor) return undefined;
    if (seen.has(value)) return undefined;
    seen.add(value);
    if (Array.isArray(value)) {
        const result = value.map((item) => cloneClipboardUserDataValue(item, seen));
        return result;
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return undefined;
    const result = {};
    Object.entries(value).forEach(([key, item]) => {
        const cloned = cloneClipboardUserDataValue(item, seen);
        if (cloned !== undefined) result[key] = cloned;
    });
    return result;
}

function sanitizeClipboardUserData(userData = {}) {
    const result = {};
    const seen = new WeakSet();
    Object.entries(userData).forEach(([key, value]) => {
        if (MODEL_CLIPBOARD_USER_DATA_OMIT_KEYS.has(key)) return;
        const cloned = cloneClipboardUserDataValue(value, seen);
        if (cloned !== undefined) result[key] = cloned;
    });
    return result;
}

function initializeClipboardPartMaterials(model) {
    if (model?.userData?.largeModelMode) return;
    getImportedModelParts(model).forEach((part) => {
        part.traverse((child) => {
            if (!child.isMesh || child.userData.modelPartMaterials) return;
            child.userData.modelPartMaterials = getMeshMaterials(child).map((material) => ({
                material,
                color: material?.color?.clone?.() || null,
                emissive: material?.emissive?.clone?.() || null,
                emissiveIntensity: Number.isFinite(material?.emissiveIntensity)
                    ? material.emissiveIntensity
                    : null
            }));
        });
    });
}

function cloneClipboardMaterial(material) {
    const clonedMaterial = material?.clone?.() || material;
    const collisionSnapshot = state.collision.highlightedMaterials.get(material);
    if (!collisionSnapshot || clonedMaterial === material) return clonedMaterial;
    if (collisionSnapshot.color && clonedMaterial.color) {
        clonedMaterial.color.copy(collisionSnapshot.color);
    }
    if (collisionSnapshot.emissive && clonedMaterial.emissive) {
        clonedMaterial.emissive.copy(collisionSnapshot.emissive);
    }
    if (collisionSnapshot.emissiveIntensity !== null
        && 'emissiveIntensity' in clonedMaterial) {
        clonedMaterial.emissiveIntensity = collisionSnapshot.emissiveIntensity;
    }
    return clonedMaterial;
}

function cloneClipboardObjectTemplate(source) {
    if (!source?.isObject3D) throw new Error('The selected model cannot be cloned.');
    const sourceRecords = [];
    source.traverse((object) => {
        sourceRecords.push({ object, userData: object.userData });
    });

    let clone = null;
    try {
        sourceRecords.forEach((record) => {
            record.object.userData = sanitizeClipboardUserData(record.userData);
        });
        if (sourceRecords.some((record) => record.object.isSkinnedMesh)) {
            clone = cloneObjectWithSkeletons(source);
        } else {
            clone = source.clone(true);
        }
    } finally {
        sourceRecords.forEach((record) => {
            record.object.userData = record.userData;
        });
    }

    const cloneObjects = [];
    clone.traverse((object) => cloneObjects.push(object));
    if (cloneObjects.length !== sourceRecords.length) {
        throw new Error('The cloned model hierarchy is incomplete.');
    }

    const sourceToClone = new Map();
    sourceRecords.forEach((record, index) => {
        const clonedObject = cloneObjects[index];
        sourceToClone.set(record.object, clonedObject);
        if (record.userData.collisionGeometry) {
            clonedObject.userData.collisionGeometry = record.userData.collisionGeometry;
        }
        if (record.userData.stepBrepFaces) {
            clonedObject.userData.stepBrepFaces = record.userData.stepBrepFaces;
        }
        delete clonedObject.userData.modelTreeId;
        delete clonedObject.userData.modelPartId;
        delete clonedObject.userData.modelPartMaterials;
        delete clonedObject.userData.outlineLine;
        delete clonedObject.userData.attachmentHost;
        delete clonedObject.userData.attachmentFrame;
    });

    cloneObjects.filter((object) => (
        object.userData?.outlineSource
        || object.userData?.simulationSnapFaceOverlay
        || object.userData?.collisionDebugMesh
    )).forEach((transientVisual) => {
        transientVisual.removeFromParent();
    });
    clone.traverse((object) => {
        if (!object.isMesh) return;
        const sourceMaterials = Array.isArray(object.material) ? object.material : [object.material];
        const materials = sourceMaterials.map(cloneClipboardMaterial);
        object.material = Array.isArray(object.material) ? materials : materials[0];
    });

    const clonedParts = getImportedModelParts(source)
        .map((part) => sourceToClone.get(part))
        .filter(Boolean);
    if (source.userData.uploaded || clonedParts.length) clone.userData.importedParts = clonedParts;
    initializeClipboardPartMaterials(clone);
    clone.updateMatrixWorld(true);
    return clone;
}

function assignClipboardModelTreeIds(model) {
    delete model.userData.modelTreeId;
    ensureModelTreeId(model);
    getImportedModelParts(model).forEach((part) => {
        state.modelPartIdCounter += 1;
        part.userData.modelPartId = `scene-model-part-${state.modelPartIdCounter}`;
    });
}

function captureClipboardTransform(object, world = false) {
    if (!world) {
        return {
            position: object.position.toArray(),
            quaternion: object.quaternion.toArray(),
            scale: object.scale.toArray()
        };
    }
    object.updateWorldMatrix(true, false);
    return {
        position: object.getWorldPosition(new THREE.Vector3()).toArray(),
        quaternion: object.getWorldQuaternion(new THREE.Quaternion()).toArray(),
        scale: object.getWorldScale(new THREE.Vector3()).toArray()
    };
}

function applyClipboardTransform(object, transform, offsetY = 0) {
    object.position.fromArray(transform.position);
    object.position.y += offsetY;
    object.quaternion.fromArray(transform.quaternion).normalize();
    object.scale.fromArray(transform.scale);
    object.updateMatrix();
    object.matrixWorldNeedsUpdate = true;
}

function captureObjectClipboardSnapshot(model) {
    const host = state.models.includes(model.userData.attachmentHost)
        ? model.userData.attachmentHost
        : null;
    return {
        kind: 'object',
        template: cloneClipboardObjectTemplate(model),
        attachmentHost: host,
        localTransform: captureClipboardTransform(model),
        worldTransform: captureClipboardTransform(model, true),
        pasteCount: 0
    };
}

function findRobotClipboardModelDefinition(robot) {
    if (robot.userData.motionModelDefinition) return robot.userData.motionModelDefinition;
    return [...state.catalog.values()].find((definition) => (
        definition.type === 'articulated-stl'
        && definition.folder === robot.userData.motionModelFolder
        && (!robot.userData.motionRobotType || definition.robotType === robot.userData.motionRobotType)
    )) || null;
}

function captureRobotClipboardSnapshot(robot) {
    const modelDefinition = findRobotClipboardModelDefinition(robot);
    if (!modelDefinition) throw new Error('The robot model definition is unavailable.');
    return {
        kind: 'robot',
        modelDefinition,
        baseTransform: captureClipboardTransform(robot),
        jointAngles: robot.userData.joints.map((joint) => Number(joint.angle) || 0),
        tcpProfiles: serializeRobotTcpProfiles(robot),
        activeTcpProfileIndex: robot.userData.activeTcpProfileIndex,
        program: cloneMotionProgram(ensureMotionProgram(robot)),
        attachedTools: state.models
            .filter((model) => model.userData.uploaded && model.userData.attachmentHost === robot)
            .map((tool) => ({
                template: cloneClipboardObjectTemplate(tool),
                localTransform: captureClipboardTransform(tool)
            })),
        pasteCount: 0
    };
}

function disposeClipboardTemplateMaterials(template) {
    const materials = new Set();
    template?.traverse?.((object) => {
        const entries = Array.isArray(object.material) ? object.material : [object.material];
        entries.forEach((material) => {
            if (material) materials.add(material);
        });
    });
    materials.forEach((material) => material.dispose?.());
}

function releaseModelClipboardSnapshot(snapshot) {
    if (snapshot?.kind === 'object') disposeClipboardTemplateMaterials(snapshot.template);
    if (snapshot?.kind === 'robot') {
        snapshot.attachedTools?.forEach(({ template }) => disposeClipboardTemplateMaterials(template));
    }
}

function copyModelContextTarget() {
    const target = getModelContextTarget();
    closeModelContextMenu();
    if (!target?.model || target.part || isMotionActive() || state.modelClipboardPastePending) return;
    try {
        const snapshot = Array.isArray(target.model.userData.joints) && target.model.userData.tcpFrame
            ? captureRobotClipboardSnapshot(target.model)
            : captureObjectClipboardSnapshot(target.model);
        releaseModelClipboardSnapshot(state.modelClipboard);
        state.modelClipboard = snapshot;
        setStatus('모델을 복사했습니다.', '#22c55e');
    } catch (error) {
        console.error('Model copy failed:', error);
        setStatus('모델을 복사하지 못했습니다.', '#ef4444');
    }
}

function beginModelClipboardPasteMutation() {
    if (state.zeroPointEdit.active) exitZeroPointEditor();
    invalidateSimulationSnapCandidates();
    setTransformHandlesEnabled(false);
    setBaseJogGizmoEnabled(false);
    commitAllPendingHistories();
    return captureSceneSnapshot();
}

function finishModelClipboardPaste(rootModel, addedModels, historyBefore) {
    addedModels.forEach((model) => updateModelRenderComplexity(model));
    if (state.collision.enabled) state.collision.system?.prepare(addedModels);
    markSceneCollisionDirty();
    refreshCollisionDebugOverlays();
    updateUIStatus();
    selectSceneModel(rootModel);
    renderMotionProgramPanel();
    recordHistory('모델 붙여넣기', historyBefore, captureSceneSnapshot());
}

function rollbackModelClipboardPaste(historyBefore, addedModels, { disposeRootResources = false } = {}) {
    if (historyBefore) applySceneSnapshot(historyBefore);
    addedModels.forEach((model) => {
        if (!state.models.includes(model)) model.removeFromParent();
        disposeCollisionDebugForModel(model);
        disposeModelOutlines(model);
    });
    if (disposeRootResources && addedModels[0]) {
        disposeObjectResources(addedModels[0]);
        addedModels.slice(1).forEach(disposeClipboardTemplateMaterials);
    } else {
        addedModels.forEach(disposeClipboardTemplateMaterials);
    }
}

function pasteObjectClipboardSnapshot(snapshot, pasteNumber) {
    const pastedModel = cloneClipboardObjectTemplate(snapshot.template);
    const addedModels = [pastedModel];
    let historyBefore = null;
    try {
        if (isMotionActive()) throw new Error('Stop the active motion before pasting a model.');
        historyBefore = beginModelClipboardPasteMutation();
        const host = state.models.includes(snapshot.attachmentHost)
            && getRobotToolMountFrame(snapshot.attachmentHost)
            ? snapshot.attachmentHost
            : null;
        if (host) {
            getRobotToolMountFrame(host).add(pastedModel);
            applyClipboardTransform(
                pastedModel,
                snapshot.localTransform,
                MODEL_CLIPBOARD_TOOL_PASTE_OFFSET_Y * pasteNumber
            );
            pastedModel.userData.attachmentHost = host;
            pastedModel.userData.attachmentFrame = 'flange';
            pastedModel.userData.placement = 'tcp';
        } else {
            state.scene.add(pastedModel);
            applyClipboardTransform(
                pastedModel,
                snapshot.worldTransform,
                MODEL_CLIPBOARD_PASTE_OFFSET_Y * pasteNumber
            );
            delete pastedModel.userData.attachmentHost;
            delete pastedModel.userData.attachmentFrame;
            pastedModel.userData.placement = 'scene';
            pastedModel.userData.sceneModelAnchor = 'clipboard-offset';
        }
        pastedModel.updateMatrixWorld(true);
        assignClipboardModelTreeIds(pastedModel);
        state.models.push(pastedModel);
        finishModelClipboardPaste(pastedModel, addedModels, historyBefore);
        return pastedModel;
    } catch (error) {
        rollbackModelClipboardPaste(historyBefore, addedModels);
        throw error;
    }
}

async function pasteRobotClipboardSnapshot(snapshot, pasteNumber) {
    let robot = null;
    let pastedTools = [];
    let historyBefore = null;
    showLoading(true, uiText('모델 붙여넣는 중...'));
    try {
        robot = await loadArticulatedRobot(snapshot.modelDefinition, (progress) => {
            showLoading(true, uiFormat('모델 붙여넣는 중... {progress}%', { progress }));
        });
        pastedTools = snapshot.attachedTools.map(({ template, localTransform }) => ({
            model: cloneClipboardObjectTemplate(template),
            localTransform
        }));
        if (isMotionActive()) throw new Error('Stop the active motion before pasting a robot.');

        historyBefore = beginModelClipboardPasteMutation();
        robot.userData.modelName = snapshot.modelDefinition.name || robot.userData.robotName;
        assignRobotInstanceMetadata(robot, snapshot.modelDefinition);
        applyClipboardTransform(
            robot,
            snapshot.baseTransform,
            MODEL_CLIPBOARD_PASTE_OFFSET_Y * pasteNumber
        );
        snapshot.jointAngles.forEach((angle, index) => {
            if (robot.userData.joints[index]) setJointAngle(robot.userData.joints[index], angle, false);
        });
        restoreRobotTcpProfiles(robot, snapshot.tcpProfiles, snapshot.activeTcpProfileIndex);
        robot.updateMatrixWorld(true);
        captureCurrentTcpTarget(robot);
        assignClipboardModelTreeIds(robot);
        state.models.push(robot);
        state.scene.add(robot);
        state.motionPrograms.set(robot.userData.motionInstanceId, cloneMotionProgram(snapshot.program));

        const mountFrame = getRobotToolMountFrame(robot);
        pastedTools.forEach(({ model, localTransform }) => {
            mountFrame.add(model);
            applyClipboardTransform(model, localTransform);
            model.userData.attachmentHost = robot;
            model.userData.attachmentFrame = 'flange';
            model.userData.placement = 'tcp';
            model.updateMatrixWorld(true);
            assignClipboardModelTreeIds(model);
            state.models.push(model);
        });

        const addedModels = [robot, ...pastedTools.map(({ model }) => model)];
        finishModelClipboardPaste(robot, addedModels, historyBefore);
        return robot;
    } catch (error) {
        rollbackModelClipboardPaste(
            historyBefore,
            [robot, ...pastedTools.map(({ model }) => model)].filter(Boolean),
            { disposeRootResources: Boolean(robot) }
        );
        throw error;
    } finally {
        showLoading(false);
    }
}

async function pasteModelClipboard() {
    const snapshot = state.modelClipboard;
    closeModelContextMenu();
    if (!snapshot || isMotionActive() || state.modelClipboardPastePending) return;
    state.modelClipboardPastePending = true;
    const pasteNumber = (Number(snapshot.pasteCount) || 0) + 1;
    try {
        if (snapshot.kind === 'robot') await pasteRobotClipboardSnapshot(snapshot, pasteNumber);
        else await pasteObjectClipboardSnapshot(snapshot, pasteNumber);
        snapshot.pasteCount = pasteNumber;
        setStatus('모델을 붙여넣었습니다.', '#22c55e');
    } catch (error) {
        console.error('Model paste failed:', error);
        setStatus('모델을 붙여넣지 못했습니다.', '#ef4444');
    } finally {
        state.modelClipboardPastePending = false;
    }
}

function getModelContextTarget() {
    const menu = el.modelContextMenu;
    const modelId = menu?.dataset.modelTreeId;
    const model = state.models.find((candidate) => candidate.userData.modelTreeId === modelId);
    if (!model) return null;
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
    scheduleMotionProjectSave();
    return true;
}

function openModelContextMenu(event, model, part = null) {
    const menu = el.modelContextMenu;
    if (!menu || !model || !state.models.includes(model)) return;
    closeModelContextMenu();
    ensureModelTreeId(model);
    menu.dataset.modelTreeId = model.userData.modelTreeId;
    if (part) menu.dataset.modelPartId = part.userData.modelPartId;
    else delete menu.dataset.modelPartId;
    const uploaded = Boolean(model.userData.uploaded);
    const structuralActionsHidden = Boolean(part);
    [el.modelCopy, el.modelPaste, el.modelDelete].forEach((control) => {
        if (!control) return;
        control.hidden = structuralActionsHidden;
        control.disabled = state.modelClipboardPastePending;
    });
    if (el.modelPaste) el.modelPaste.disabled = state.modelClipboardPastePending || !state.modelClipboard;
    if (el.modelChangeZeroPoint) el.modelChangeZeroPoint.hidden = Boolean(part) || !uploaded;
    if (el.modelChangeColor) el.modelChangeColor.hidden = !uploaded;
    if (uploaded && el.modelColorPicker) {
        el.modelColorPicker.value = getImportedObjectColorHex(part || model);
    }
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
        scheduleMotionProjectSave();
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
    scheduleMotionProjectSave();
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

async function loadModelFromServer(modelDefinition, options = {}) {
    const isAddMode = options.forceAddMode === true || Boolean(el.btnAddMode?.checked);
    if (isRobotMotionActive() && !isAddMode) {
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

        const motionWasActive = isRobotMotionActive();
        if (motionWasActive && !isAddMode) {
            discardUncommittedModel(model, type);
            setStatus('시뮬레이션이 시작되어 모델 교체를 취소했습니다.', '#f59e0b');
            return;
        }

        if (state.zeroPointEdit.active) exitZeroPointEditor();
        setTransformHandlesEnabled(false);
        setBaseJogGizmoEnabled(false);
        commitAllPendingHistories();
        const historyBefore = options.suppressHistory ? null : captureSceneSnapshot();

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
        model.userData.workspaceCatalogKey = [...state.catalog.entries()]
            .find(([, candidate]) => candidate === modelDefinition)?.[0]
            || file
            || (folder ? `robot:${folder}` : '');
        ensureWorkspaceModelId(model, options.workspaceModelId);
        updateModelRenderComplexity(model);

        // Spread models a bit if adding
        if (isAddMode && state.models.length > 0) {
            model.position.y += (state.models.length * 600);
        }
        if (options.transform) applyClipboardTransform(model, options.transform);

        if (type === 'articulated-stl') {
            assignRobotInstanceMetadata(model, modelDefinition);
            ensureMotionProgram(model);
        }

        if (state.collision.enabled) state.collision.system?.prepare([model]);
        state.models.push(model);
        state.scene.add(model);
        markSceneCollisionDirty();
        refreshCollisionDebugOverlays();
        if (type === 'articulated-stl') attachPendingToolModels(model);
        ensureModelTreeId(model);

        if (!options.preserveActive) {
            if (type === 'articulated-stl' && !motionWasActive) {
                state.activeArticulatedModel = model;
                state.activeProgramRobot = model;
                renderJogControls(model);
            } else {
                state.activeArticulatedModel = null;
                hideJogPanel();
            }
        }

        updateUIStatus();
        if (!options.preserveSelection) selectSceneModel(model);
        renderMotionProgramPanel();
        if (historyBefore) recordHistory('모델 불러오기', historyBefore, captureSceneSnapshot());
        if (!options.suppressFit && !isAddMode) fitCamera();
        setStatus(isAddMode ? '{name} 추가 완료' : '{name} 불러오기 완료', '#22c55e', { name });
        return model;
    } catch (err) {
        console.error('Load failed:', err);
        setStatus('{name} 불러오기 실패', '#ef4444', { name });
        if (options.throwOnError) throw err;
        return null;
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
        const tubeMesh = createScaraTubeMesh(
            tubeGeometry,
            manifest.tube,
            geometries[0],
            manifest.joints[1]?.pivot?.[0]
        );
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

    // TUBE.stl already contains the conduit and both rotary connector details.
    // Keep that complete CAD mesh in the fixed robot frame and only reshape its
    // longitudinal span after the J1/J2 hierarchy has been assembled.
    if (robot.userData.scaraTube) updateScaraTube(robot);

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
                : {
                    name: 'CD conduit',
                    mesh: 'TUBE.stl',
                    color: '#292c2f',
                    cadZOffset: SCARA_TUBE_CAD_Z_OFFSETS[modelDefinition.folder] ?? 0
                },
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

    const workerUrl = new URL('./model-load-worker.js?v=20260725-stl-proxy-1', import.meta.url);
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

function createSTLResultFromWorker(payload) {
    return {
        geometry: createSTLGeometryFromWorker(payload.geometry),
        collisionGeometry: payload.collisionGeometry
            ? createSTLGeometryFromWorker(payload.collisionGeometry)
            : null
    };
}

function loadSTLInWorker(url) {
    const session = getModelImportWorkerSession();
    const requestId = ++state.modelImportRequestId;
    return new Promise((resolve, reject) => {
        session.pending.set(requestId, { resolve, reject });
        session.worker.postMessage({ type: 'parse-stl', requestId, url });
    }).then((payload) => createSTLGeometryFromWorker(payload.geometry));
}

function loadSTLBufferInWorker(buffer) {
    const session = getModelImportWorkerSession();
    const requestId = ++state.modelImportRequestId;
    return new Promise((resolve, reject) => {
        session.pending.set(requestId, { resolve, reject });
        session.worker.postMessage({
            type: 'parse-stl-buffer',
            requestId,
            buffer,
            includeCollisionProxy: true
        }, [buffer]);
    }).then(createSTLResultFromWorker);
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
        const sourceBuffer = await file.arrayBuffer();
        let geometry;
        let collisionGeometry = null;
        try {
            // Keep a copy for the synchronous fallback because the worker
            // transfer detaches the ArrayBuffer passed to postMessage().
            const workerResult = await loadSTLBufferInWorker(sourceBuffer.slice(0));
            geometry = workerResult.geometry;
            collisionGeometry = workerResult.collisionGeometry;
        } catch (workerError) {
            console.warn('STL worker unavailable; falling back to main-thread loading:', workerError);
            geometry = new STLLoader().parse(sourceBuffer);
        }
        if (!geometry.getAttribute('normal')) geometry.computeVertexNormals();
        const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({
            color: 0xbfc7d5,
            roughness: 0.6,
            metalness: 0.15
        }));
        if (collisionGeometry) mesh.userData.collisionGeometry = collisionGeometry;
        return mesh;
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
    if (nextVisible && state.collision.enabled) state.collision.system?.prepare([model]);
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
    const file = options.file || state.pendingImportFile;
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
    const historyBefore = options.suppressHistory ? null : captureSceneSnapshot();

    const extension = getFileExtension(file.name);
    const performanceMode = file.size >= LARGE_MODEL_PERFORMANCE_MIN_BYTES;
    const placement = options.placement || el.importPlacement.value;
    const importQuality = STEP_IMPORT_QUALITY_PRESETS[options.importQuality]
        || getSelectedStepImportQuality();
    const robot = placement === 'tcp'
        ? options.attachmentRobot || getArticulatedRobotForAttachment()
        : null;
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
    let assetPersistenceFailed = false;
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
        if (options.workspaceAssetId) importedModel.userData.workspaceAssetId = options.workspaceAssetId;
        ensureWorkspaceModelId(importedModel, options.workspaceModelId);
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
            if (!options.preserveSelection && state.activeArticulatedModel !== robot) {
                state.activeArticulatedModel = robot;
                renderJogControls(robot);
            }
        } else {
            // Preserve the source file origin: the 3D model (0, 0, 0) matches the scene Base origin.
            importedModel.position.set(0, 0, 0);
            importedModel.userData.sceneModelAnchor = 'source-origin';
            state.scene.add(importedModel);
        }
        if (options.transform) applyClipboardTransform(importedModel, options.transform);

        importedModel.updateMatrixWorld(true);
        const bounds = new THREE.Box3().setFromObject(importedModel);
        if (bounds.isEmpty()) throw new Error('The imported mesh has invalid bounds.');
        updateModelRenderComplexity(importedModel);

        if (state.collision.enabled) state.collision.system?.prepare([importedModel]);
        state.models.push(importedModel);
        markSceneCollisionDirty();
        refreshCollisionDebugOverlays();
        ensureModelTreeId(importedModel);
        registerImportedModelParts(importedModel, content, performanceMode);

        if (!options.skipAssetPersistence && !IS_MANUAL_GUIDE_EMBED) {
            try {
                const assetId = await persistImportedWorkspaceAsset(file, extension);
                if (assetId) importedModel.userData.workspaceAssetId = assetId;
            } catch (storageError) {
                console.warn('Imported source asset could not be saved:', storageError);
                assetPersistenceFailed = true;
            }
        }

        updateUIStatus();
        if (!options.preserveSelection) selectSceneModel(importedModel);
        if (historyBefore) {
            recordHistory(placement === 'tcp' ? 'TCP 툴 불러오기' : '3D 모델링 불러오기', historyBefore, captureSceneSnapshot());
        }
        if (!options.suppressFit) fitCamera();
        if (assetPersistenceFailed) {
            setStatus('3D 모델은 불러왔지만 원본 파일을 작업 복구 저장소에 저장하지 못했습니다.', '#f59e0b');
        } else if (options.suppressSuccessStatus) {
            // Workspace recovery reports a combined result after all models finish.
        } else if (placement === 'tcp') {
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
        if (historyBefore) applySceneSnapshot(historyBefore);
        const errorDetail = getImportErrorDetail(error, extension);
        if (errorDetail) {
            setStatus('가져오기 오류: {message}', '#ef4444', { message: errorDetail });
        } else {
            setStatus('가져오기 오류', '#ef4444');
        }
        if (!options.suppressErrorAlert) alert(getImportErrorMessage(error, extension));
        if (options.throwOnError) throw error;
        return null;
    } finally {
        if (!options.file) state.pendingImportFile = null;
        if (el.btnConfirmImport) el.btnConfirmImport.disabled = false;
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
    if (isRobotMotionActive()) {
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

function getExtremeSectionCenter(sourceGeometry, axisIndex, direction) {
    const position = sourceGeometry?.getAttribute?.('position');
    if (!position || position.count === 0) return null;
    let extreme = direction < 0 ? Infinity : -Infinity;
    for (let vertex = 0; vertex < position.count; vertex += 1) {
        const coordinate = position.array[vertex * position.itemSize + axisIndex];
        extreme = direction < 0
            ? Math.min(extreme, coordinate)
            : Math.max(extreme, coordinate);
    }
    if (!Number.isFinite(extreme)) return null;

    const tolerance = 0.5;
    const section = [];
    for (let vertex = 0; vertex < position.count; vertex += 1) {
        const point = new THREE.Vector3().fromBufferAttribute(position, vertex);
        const coordinate = point.getComponent(axisIndex);
        if ((direction < 0 && coordinate <= extreme + tolerance)
            || (direction > 0 && coordinate >= extreme - tolerance)) {
            section.push(point);
        }
    }
    if (section.length === 0) return null;

    const min = new THREE.Vector3(Infinity, Infinity, Infinity);
    const max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
    section.forEach((point) => {
        min.min(point);
        max.max(point);
    });
    return min.add(max).multiplyScalar(0.5);
}

function getScaraTubeJ1SocketOffset(sourceGeometry, baseGeometry, cadZOffset = 0) {
    const tubeJ1End = getExtremeSectionCenter(sourceGeometry, 2, -1);
    const baseJ1Socket = getExtremeSectionCenter(baseGeometry, 2, 1);
    if (!tubeJ1End || !baseJ1Socket) return new THREE.Vector3();
    const offset = baseJ1Socket.sub(tubeJ1End);
    // X/Y seat the rotary J1 connector in its socket. Z comes from the matching
    // full assembly CAD because the insertion depth differs by robot model and
    // cannot be inferred from the highest P0 surface.
    offset.z = Number.isFinite(Number(cadZOffset)) ? Number(cadZOffset) : 0;
    return offset;
}

function mapScaraTubeLongitudinal(
    longitudinal,
    sourcePlanLength,
    targetPlanLength,
    j1RigidEndLength
) {
    const flexibleStart = j1RigidEndLength;
    if (longitudinal <= flexibleStart) {
        return { distance: longitudinal, scale: 1 };
    }

    const sourceFlexibleLength = Math.max(sourcePlanLength - flexibleStart, 1e-6);
    const targetFlexibleLength = Math.max(
        targetPlanLength - flexibleStart,
        1e-6
    );
    const normalized = (longitudinal - flexibleStart) / sourceFlexibleLength;
    const targetFlexibleScale = targetFlexibleLength / sourceFlexibleLength;
    // Keep only the J1 socket rigid. After a short smooth transition, distribute
    // the remaining span change uniformly through the conduit all the way to J2.
    // No angle or rigid lead is imposed at J2, so short models do not form a
    // pointed crown when their endpoints approach each other.
    const transitionFraction = Math.min(0.12, targetFlexibleScale * 0.25);
    const flowingScale = (targetFlexibleScale - transitionFraction * 0.5)
        / (1 - transitionFraction * 0.5);
    const transitionIntegral = (value) => value ** 6
        - 3 * value ** 5
        + 2.5 * value ** 4;
    const transitionScale = (value) => value ** 3
        * (value * (value * 6 - 15) + 10);
    const transitionArea = transitionFraction * (1 + flowingScale) * 0.5;
    let normalizedDistance;
    let localScale;
    if (normalized < transitionFraction) {
        const transition = normalized / transitionFraction;
        normalizedDistance = normalized
            + (flowingScale - 1) * transitionFraction * transitionIntegral(transition);
        localScale = 1 + (flowingScale - 1) * transitionScale(transition);
    } else {
        normalizedDistance = transitionArea
            + flowingScale * (normalized - transitionFraction);
        localScale = flowingScale;
    }
    return {
        distance: flexibleStart + sourceFlexibleLength * normalizedDistance,
        scale: Math.max(localScale, 1e-6)
    };
}

function createScaraTubeMesh(sourceGeometry, definition, baseGeometry, j2PivotX) {
    const geometry = sourceGeometry.clone();
    if (!geometry.getAttribute('normal')) geometry.computeVertexNormals();
    geometry.computeBoundingBox();

    const position = geometry.getAttribute('position');
    const normal = geometry.getAttribute('normal');
    if (!position || position.count === 0) {
        throw new Error('SCARA CD conduit geometry has no vertices.');
    }

    // Preserve every TUBE.stl vertex, including the authored polygonal conduit
    // profile and both connector details. Only the plane/span mapping changes.
    const originalPositions = Float32Array.from(position.array);
    const originalNormals = Float32Array.from(normal.array);
    const sourceFixedEnd = getExtremeSectionCenter(geometry, 2, -1);
    if (!sourceFixedEnd) throw new Error('SCARA CD conduit has no fixed endpoint.');

    const j1SocketOffset = getScaraTubeJ1SocketOffset(
        sourceGeometry,
        baseGeometry,
        definition.cadZOffset
    );
    const fixedEnd = sourceFixedEnd.clone().add(j1SocketOffset);
    const sourceMovingX = Number.isFinite(Number(j2PivotX))
        ? Number(j2PivotX)
        : geometry.boundingBox.max.x;
    const sourceDeltaX = sourceMovingX - sourceFixedEnd.x;
    const sourceDeltaY = -sourceFixedEnd.y;
    const sourcePlanLength = Math.max(Math.hypot(sourceDeltaX, sourceDeltaY), 1);

    position.setUsage(THREE.DynamicDrawUsage);
    normal.setUsage(THREE.DynamicDrawUsage);
    const mesh = createSTLMesh(geometry, definition);
    mesh.frustumCulled = false;
    mesh.userData.excludeFromOutline = true;
    mesh.userData.scaraTubeOriginalStl = true;
    mesh.userData.scaraTubeOriginalPositions = originalPositions;
    mesh.userData.scaraTubeOriginalNormals = originalNormals;
    mesh.userData.scaraTubeSourceFixedEnd = sourceFixedEnd.toArray();
    mesh.userData.scaraTubeFixedEnd = fixedEnd.toArray();
    mesh.userData.scaraTubeSourceDirection = [
        sourceDeltaX / sourcePlanLength,
        sourceDeltaY / sourcePlanLength
    ];
    mesh.userData.scaraTubeSourcePlanLength = sourcePlanLength;
    mesh.userData.scaraTubeJ1SocketOffset = j1SocketOffset.toArray();
    return mesh;
}

function updateScaraTube(robot) {
    const tube = robot?.userData.scaraTube;
    const j2 = robot?.userData.joints?.[1];
    if (!tube || !j2) return;

    // The P0-side endpoint is fixed. The authored TUBE.stl curve and connector
    // geometry are retained while its longitudinal axis is mapped into the one
    // vertical plane shared by the fixed socket and the moving J2 socket.
    if (tube.parent !== robot) robot.add(tube);
    tube.position.set(0, 0, 0);
    tube.quaternion.identity();

    robot.updateMatrixWorld(true);
    const fixedEnd = new THREE.Vector3().fromArray(tube.userData.scaraTubeFixedEnd);
    const movingEndWorld = j2.group.getWorldPosition(new THREE.Vector3());
    const movingEnd = robot.worldToLocal(movingEndWorld.clone());
    const targetDeltaX = movingEnd.x - fixedEnd.x;
    const targetDeltaY = movingEnd.y - fixedEnd.y;
    const targetPlanLength = Math.hypot(targetDeltaX, targetDeltaY);
    if (targetPlanLength < 1e-6) return;

    const sourceFixedEnd = new THREE.Vector3().fromArray(tube.userData.scaraTubeSourceFixedEnd);
    const [sourceDirectionX, sourceDirectionY] = tube.userData.scaraTubeSourceDirection;
    const sourceNormalX = -sourceDirectionY;
    const sourceNormalY = sourceDirectionX;
    const sourcePlanLength = tube.userData.scaraTubeSourcePlanLength;
    const targetDirectionX = targetDeltaX / targetPlanLength;
    const targetDirectionY = targetDeltaY / targetPlanLength;
    const targetNormalX = -targetDirectionY;
    const targetNormalY = targetDirectionX;

    // Keep the J1 socket seated while the original conduit changes span in one
    // vertical plane all the way to the moving J2 socket.
    const j1RigidEndLength = Math.min(
        sourcePlanLength * 0.12,
        45,
        targetPlanLength * 0.24
    );
    const originalPositions = tube.userData.scaraTubeOriginalPositions;
    const originalNormals = tube.userData.scaraTubeOriginalNormals;
    const position = tube.geometry.getAttribute('position');
    const normal = tube.geometry.getAttribute('normal');
    const positions = position.array;
    const normals = normal.array;
    const zOffset = tube.userData.scaraTubeJ1SocketOffset[2];

    for (let vertex = 0; vertex < position.count; vertex += 1) {
        const offset = vertex * 3;
        const sourceOffsetX = originalPositions[offset] - sourceFixedEnd.x;
        const sourceOffsetY = originalPositions[offset + 1] - sourceFixedEnd.y;
        const longitudinal = sourceOffsetX * sourceDirectionX + sourceOffsetY * sourceDirectionY;
        const lateral = sourceOffsetX * sourceNormalX + sourceOffsetY * sourceNormalY;
        const longitudinalMapping = mapScaraTubeLongitudinal(
            longitudinal,
            sourcePlanLength,
            targetPlanLength,
            j1RigidEndLength
        );
        const mappedLongitudinal = longitudinalMapping.distance;
        const localScale = longitudinalMapping.scale;
        positions[offset] = fixedEnd.x
            + targetDirectionX * mappedLongitudinal
            + targetNormalX * lateral;
        positions[offset + 1] = fixedEnd.y
            + targetDirectionY * mappedLongitudinal
            + targetNormalY * lateral;
        positions[offset + 2] = originalPositions[offset + 2] + zOffset;

        const sourceNormalU = originalNormals[offset] * sourceDirectionX
            + originalNormals[offset + 1] * sourceDirectionY;
        const sourceNormalV = originalNormals[offset] * sourceNormalX
            + originalNormals[offset + 1] * sourceNormalY;
        const transformedNormalU = sourceNormalU / Math.max(localScale, 1e-6);
        let normalX = targetDirectionX * transformedNormalU + targetNormalX * sourceNormalV;
        let normalY = targetDirectionY * transformedNormalU + targetNormalY * sourceNormalV;
        let normalZ = originalNormals[offset + 2];
        const normalLength = Math.hypot(normalX, normalY, normalZ) || 1;
        normalX /= normalLength;
        normalY /= normalLength;
        normalZ /= normalLength;
        normals[offset] = normalX;
        normals[offset + 1] = normalY;
        normals[offset + 2] = normalZ;
    }

    position.needsUpdate = true;
    normal.needsUpdate = true;
    tube.geometry.computeBoundingBox();
    tube.geometry.computeBoundingSphere();
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
    if (changed) {
        markSceneCollisionDirty(joint.robot);
        syncOlpHomeStatus(joint.robot);
    }
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
        return {
            success: false,
            positionError: Infinity,
            rotationError: Infinity,
            reason: 'SCARA kinematic data is incomplete'
        };
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
        const reason = !Number.isFinite(rawCosine)
            ? 'XY target radius is not finite'
            : rawCosine < -1 - 1e-7 || rawCosine > 1 + 1e-7
                ? 'XY target is outside the SCARA arm reach'
                : !orientationIsRzOnly
                    ? 'target orientation contains unsupported tilt'
                    : prismaticTarget < joints[2].definition.min - 1e-7
                        ? 'Z target is below the SCARA lower limit'
                        : 'Z target is above the SCARA upper limit';
        return { success: false, positionError: Infinity, rotationError: Infinity, reason };
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

    if (!best) {
        return {
            success: false,
            positionError: Infinity,
            rotationError: Infinity,
            reason: 'no SCARA joint solution satisfies the joint limits'
        };
    }
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
    return {
        success,
        positionError,
        rotationError,
        analytic: true,
        reason: success ? '' : 'forward-kinematics verification exceeded tolerance'
    };
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
        controller.corePromise = import('./virtual-controller-core.mjs?v=20260725-vc-port-1')
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
        button.textContent = uiText(pending ? '읽는 중' : '가져오기');
    });
    el.endMonitoringList?.querySelectorAll('[data-end-monitoring-read]').forEach((button) => {
        const toolId = Number(button.closest('[data-end-monitoring-row]')?.dataset.endMonitoringRow);
        const pending = controller.pendingInterferenceToolReads.has(toolId);
        button.disabled = !canReadInterferenceZone || pending;
        button.textContent = uiText(pending ? '읽는 중' : '가져오기');
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
            controller.reconnectAttempt = 0;
            controller.reconnectMessage = '';
            controller.sourceConnectedAt = performance.now();
            setVirtualControllerStatus('connected');
            startVirtualControllerStream();
            monitorVirtualControllerStream();
        } else {
            const detail = String(message.message || 'Controller connection failed.').trim();
            controller.reconnectMessage = `${uiText('재연결 중')}: ${detail}`;
            setVirtualControllerStatus('error', detail);
            controller.socket?.close();
        }
    } else if (parsed.type === 'controllerConnectionLost') {
        const detail = String(message.message || 'Controller feedback interrupted; reconnecting...').trim();
        console.warn('Virtual controller native feedback interrupted.', { detail });
        setVirtualControllerStatus('reconnecting', detail);
    } else if (parsed.type === 'controllerReconnected') {
        controller.reconnectAttempt = 0;
        controller.reconnectMessage = '';
        controller.sourceConnectedAt = performance.now();
        setVirtualControllerStatus('connected');
        startVirtualControllerStream();
        monitorVirtualControllerStream();
    } else if (parsed.type === 'controllerReconnectFailed') {
        const detail = String(message.message || 'Controller reconnection failed.').trim();
        console.warn('Virtual controller native reconnect failed.', { detail });
        setVirtualControllerStatus('reconnecting', `${uiText('재연결 중')}: ${detail}`);
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

function scheduleVirtualControllerReconnect(source, message = '') {
    const controller = state.virtualController;
    if (!controller.wanted || controller.reconnectTimer) return;

    const attempt = controller.reconnectAttempt || 0;
    const delay = Math.min(5000, 250 * (2 ** Math.min(attempt, 4)));
    const socketGeneration = controller.socketGeneration;
    controller.reconnectAttempt = Math.min(attempt + 1, 4);
    setVirtualControllerStatus('reconnecting', message || 'Connection lost; reconnecting automatically...');
    const reconnectTimer = window.setTimeout(async () => {
        if (controller.reconnectTimer !== reconnectTimer) return;
        controller.reconnectTimer = null;
        if (!controller.wanted || controller.socketGeneration !== socketGeneration) return;

        if (source.id === 'bridge') {
            const healthCheckSequence = controller.bridgeHealthCheckSequence + 1;
            const bridgeRunning = await isVirtualControllerBridgeRunning();
            if (!controller.wanted || controller.socketGeneration !== socketGeneration) return;
            if (controller.bridgeHealthCheckSequence !== healthCheckSequence || !bridgeRunning) {
                scheduleVirtualControllerReconnect(source, 'Waiting for the dedicated bridge...');
                return;
            }
        }
        if (!controller.wanted || controller.socketGeneration !== socketGeneration) return;
        openVirtualControllerSocket(true);
    }, delay);
    controller.reconnectTimer = reconnectTimer;
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
    const socketGeneration = controller.socketGeneration + 1;
    controller.socketGeneration = socketGeneration;
    controller.socket = socket;
    const isCurrentSocket = () => controller.socket === socket
        && controller.socketGeneration === socketGeneration;
    socket.addEventListener('open', () => {
        if (!isCurrentSocket() || !controller.wanted) return;
        if (source.id === 'bridge') {
            if (!controller.bridgeToken) {
                setVirtualControllerStatus('error', '브리지 인증 토큰을 확인할 수 없습니다.');
                try { socket.close(1008, 'bridge pairing unavailable'); } catch { }
                return;
            }
            socket.send(JSON.stringify({ type: 'hello', token: controller.bridgeToken }));
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
        if (isCurrentSocket()) handleVirtualControllerMessage(event.data);
    });
    socket.addEventListener('close', (event) => {
        const closeDiagnostic = {
            source: source.id,
            code: Number(event.code) || 0,
            reason: String(event.reason || ''),
            wasClean: Boolean(event.wasClean),
            socketGeneration,
            current: isCurrentSocket()
        };
        if (!closeDiagnostic.current) {
            console.debug('Ignored stale virtual controller WebSocket close.', closeDiagnostic);
            return;
        }
        if (controller.wanted || closeDiagnostic.code !== 1000 || !closeDiagnostic.wasClean) {
            console.warn('Virtual controller WebSocket closed.', closeDiagnostic);
        }
        controller.socket = null;
        controller.socketGeneration += 1;
        const reconnectMessage = controller.reconnectMessage;
        controller.reconnectMessage = '';
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
        scheduleVirtualControllerReconnect(source, reconnectMessage);
    });
    socket.addEventListener('error', () => {
        if (isCurrentSocket() && controller.wanted) {
            setVirtualControllerStatus('error', getVirtualControllerUnavailableMessage());
        }
    });
}

function endVirtualControllerSessionForSourceExit(source) {
    const controller = state.virtualController;
    if (!controller.wanted) return;
    if (controller.reconnectTimer) {
        clearTimeout(controller.reconnectTimer);
        controller.reconnectTimer = null;
    }
    const socket = controller.socket;
    controller.socket = null;
    controller.socketGeneration += 1;
    controller.pendingInterferenceReads.clear();
    controller.pendingInterferenceToolReads.clear();
    controller.samples?.clear();
    controller.lastAppliedSampleId = 0;
    controller.sourceConnectedAt = 0;
    controller.lastSampleAt = 0;
    controller.lastStreamStartAt = 0;
    clearVirtualControllerStreamWatchdog();
    try {
        if (socket && [WebSocket.CONNECTING, WebSocket.OPEN].includes(socket.readyState)) socket.close();
    } catch { /* The source may already be closed. */ }
    const message = source.id === 'trace'
        ? 'Trace 연결이 일시적으로 끊겨 자동으로 재연결하는 중입니다.'
        : '전용 브리지 연결이 일시적으로 끊겨 자동으로 재연결하는 중입니다.';
    scheduleVirtualControllerReconnect(source, message);
    refreshViewPresetsUi();
}

function isOlpRunning() {
    const runtime = state.olp.runtime;
    if (!runtime) return false;
    // RUN is pressed just before OlpRuntime.run() flips its own `running`
    // property.  Treat that startup window (and paused/waiting/stopping
    // runtime phases) as active so a second RUN cannot be pressed and the
    // Pause/Stop controls are available immediately.
    if (runtime.running || state.olp.status === 'running') return true;
    return ['starting', 'running', 'waiting', 'paused', 'stopping'].includes(String(state.olp.execution?.phase || '').toLowerCase());
}

function renderOlpConsole() {
    const entries = Array.isArray(state.olp.consoleEntries) ? state.olp.consoleEntries : [];
    state.olp.consoleLines = entries.map((entry) => {
        const timestamp = new Date(entry.timestamp || Date.now()).toLocaleTimeString();
        return `[${timestamp}] ${uiFormat(entry.source, entry.replacements || {})}`;
    });
    if (el.olpConsole) el.olpConsole.textContent = state.olp.consoleLines.join('\n') || uiText('OLP ready.');
}

function appendOlpConsole(message, replacements = {}) {
    const source = String(message || '');
    state.olp.consoleEntries = [
        ...(Array.isArray(state.olp.consoleEntries) ? state.olp.consoleEntries : []),
        { timestamp: Date.now(), source, replacements }
    ].slice(-80);
    renderOlpConsole();
}

function setOlpLastMotion(source, replacements = {}) {
    state.olp.lastMotionSource = String(source || '');
    state.olp.lastMotionReplacements = replacements;
    state.olp.lastMotion = uiFormat(state.olp.lastMotionSource, replacements);
}

function getOlpLastMotionText() {
    return state.olp.lastMotionSource
        ? uiFormat(state.olp.lastMotionSource, state.olp.lastMotionReplacements || {})
        : uiText(state.olp.lastMotion || 'No OLP motion command executed yet.');
}

function setOlpLastIoEvent(source, replacements = {}) {
    state.olp.lastIoSource = String(source || '');
    state.olp.lastIoReplacements = replacements;
    state.olp.lastIoEvent = uiFormat(state.olp.lastIoSource, replacements);
}

function getOlpLastIoText() {
    return state.olp.lastIoSource
        ? uiFormat(state.olp.lastIoSource, state.olp.lastIoReplacements || {})
        : uiText(state.olp.lastIoEvent || 'No IO packet received.');
}

function flushOlpRuntimeView(runtime, snapshot = null) {
    if (state.olp.runtimeViewTimer) {
        window.clearTimeout(state.olp.runtimeViewTimer);
        state.olp.runtimeViewTimer = null;
    }
    state.olp.runtimeViewPending = null;
    if (state.olp.runtime === runtime) updateOlpRuntimeView(snapshot);
}

function queueOlpRuntimeView(runtime, snapshot = null) {
    if (state.olp.runtime !== runtime) return;
    state.olp.runtimeViewPending = { runtime, snapshot };
    const phase = String(snapshot?.phase || '').toLowerCase();
    const terminal = ['completed', 'stopped', 'error', 'alarm'].includes(phase);
    if (terminal) {
        flushOlpRuntimeView(runtime, snapshot);
        return;
    }
    if (state.olp.runtimeViewTimer) return;
    state.olp.runtimeViewTimer = window.setTimeout(() => {
        state.olp.runtimeViewTimer = null;
        const pending = state.olp.runtimeViewPending;
        state.olp.runtimeViewPending = null;
        if (pending?.runtime === state.olp.runtime) updateOlpRuntimeView(pending.snapshot);
    }, 80);
}

function updateOlpRuntimeView(snapshot = null) {
    if (snapshot) state.olp.execution = { ...state.olp.execution, ...snapshot };
    const execution = state.olp.execution || {};
    const phase = String(execution.phase || (execution.running ? 'running' : 'ready')).toLowerCase();
    const labels = {
        ready: 'READY',
        running: 'RUNNING',
        waiting: 'WAITING',
        draining: 'DRAINING',
        paused: 'PAUSED',
        stopping: 'STOPPING',
        stopped: 'STOPPED',
        completed: 'COMPLETE',
        error: 'ERROR',
        alarm: 'ALARM'
    };
    const badge = uiText(labels[phase] || phase.toUpperCase());
    updateOlpProgramIndicator();
    const path = String(execution.filePath || state.olp.project?.programPath || 'main.pro');
    const shortPath = path.split('/').at(-1) || path;
    const cursor = execution.lineNumber ? `${shortPath}:${execution.lineNumber}` : `${shortPath}:--`;
    const stateText = execution.alarm
        ? uiFormat(execution.alarm.easyGo ? 'Alarm {code} (EasyGo)' : 'Alarm {code}', { code: execution.alarm.code })
        : phase === 'waiting' && execution.waitCondition
            ? uiFormat('Waiting: {condition}', { condition: execution.waitCondition })
                    : phase === 'running' ? uiText('Program is executing')
            : phase === 'draining' ? uiText('Waiting for pending NWait motions')
            : phase === 'paused' ? uiText('Program paused')
                : phase === 'completed' ? uiText('Program cycle completed')
                    : phase === 'stopped' || phase === 'stopping' ? uiText('Program stopped')
                        : phase === 'error' ? uiText('Program error') : uiText('OLP ready');
    const stack = Array.isArray(execution.callStack) && execution.callStack.length
        ? execution.callStack.join('  >  ')
        : '—';
    if (el.olpRuntimeBadge) {
        el.olpRuntimeBadge.textContent = badge;
        el.olpRuntimeBadge.className = `olp-runtime-badge ${phase}`;
    }
    if (el.olpInlineCursor) el.olpInlineCursor.textContent = `${cursor} · ${badge}`;
    if (el.olpRuntimeState) el.olpRuntimeState.textContent = stateText;
    if (el.olpRuntimeCursor) el.olpRuntimeCursor.textContent = cursor;
    if (el.olpRuntimeLine) el.olpRuntimeLine.textContent = execution.lineText || uiText('No program line is executing.');
    if (el.olpRuntimeStack) el.olpRuntimeStack.textContent = uiFormat('Call stack: {stack}', { stack });
    const activeExecution = ['running', 'waiting', 'paused', 'stopping'].includes(phase);
    // The compact status line above the editor still shows the live file and
    // row.  Do not change the selected file, textarea selection, or scroll
    // position here: following every executed row makes long OLP programs
    // painful to inspect and also makes the editor appear to jump.
    el.olpFileEditor?.classList.toggle('olp-cursor-active', activeExecution);
}

function resetOlpProgramCursor() {
    const project = state.olp.project;
    if (!project) return;
    const mainPath = project.programPath
        || project.programFiles?.find((path) => /(^|\/)main\.pro$/i.test(path))
        || project.programFiles?.[0]
        || '';
    const record = project.files?.get(mainPath);
    if (!mainPath || !record) return;

    const source = String(record.text ?? '').replace(/\r\n?/g, '\n');
    const firstLine = source.split('\n')[0] ?? '';
    state.olp.selectedFile = mainPath;
    if (el.olpFileSelect) el.olpFileSelect.value = mainPath;
    setOlpEditorText(source);
    if (el.olpFileEditor) {
        el.olpFileEditor.setSelectionRange(0, firstLine.length);
        el.olpFileEditor.scrollTop = 0;
        el.olpFileEditor.scrollLeft = 0;
    }
    state.olp.execution = {
        ...state.olp.execution,
        phase: 'stopped',
        running: false,
        paused: false,
        filePath: mainPath,
        lineNumber: 1,
        lineText: firstLine,
        command: '',
        waitCondition: '',
        callStack: [],
        alarm: null
    };
    setOlpLastMotion('No OLP motion command executed yet.');
    updateOlpRuntimeView();
}

function formatOlpMonitorTime(timestamp) {
    return timestamp ? new Date(timestamp).toLocaleTimeString() : '--';
}

function getOlpMonitorAddress(prefix, preferredAddress = '') {
    const labels = Object.entries(state.olp.project?.labels || {});
    const displayPrefix = { IN: 'In', OUT: 'Out', INW: 'InW', OUTW: 'OutW' }[prefix] || prefix;
    const entries = labels
        .map(([label, address]) => {
            const parsed = normalizeOlpAddress(address, state.olp.project?.labels || {});
            return parsed?.prefix === prefix ? { label, address: `${displayPrefix}[${parsed.index}]`, parsed } : null;
        })
        .filter(Boolean)
        .sort((left, right) => left.parsed.index - right.parsed.index || left.label.localeCompare(right.label));
    const preferred = normalizeOlpAddress(preferredAddress, state.olp.project?.labels || {});
    if (preferred?.prefix === prefix) {
        const preferredCanonical = canonicalOlpAddress(preferred);
        return entries.find((entry) => canonicalOlpAddress(entry.parsed) === preferredCanonical)
            || { label: '', address: `${displayPrefix}[${preferred.index}]`, parsed: preferred };
    }
    return entries[0] || null;
}

function setOlpMonitorAddress(element, entry) {
    if (!element) return;
    element.textContent = entry?.address || '—';
    element.title = entry?.label || '';
}

function renderOlpIoMonitorNow() {
    const inputBit = getOlpMonitorAddress('IN', state.olp.lastRawInputBitAddress);
    const outputBit = getOlpMonitorAddress('OUT');
    const inputWordAddress = getOlpMonitorAddress('INW', state.olp.lastRawInputWordAddress);
    const outputWordAddress = getOlpMonitorAddress('OUTW');
    const inputBitValue = inputBit ? readOlpAddress(inputBit.address) : null;
    const outputBitValue = outputBit ? readOlpAddress(outputBit.address) : null;
    const inputWord = inputWordAddress ? readOlpAddress(inputWordAddress.address) : null;
    const outputWord = outputWordAddress ? readOlpAddress(outputWordAddress.address) : null;
    const labelEntries = Object.entries(state.olp.project?.labels || {});
    const inputLabelCount = labelEntries.filter(([, address]) => normalizeOlpAddress(address, state.olp.project?.labels || {})?.prefix?.startsWith('IN')).length;
    const outputLabelCount = labelEntries.filter(([, address]) => normalizeOlpAddress(address, state.olp.project?.labels || {})?.prefix?.startsWith('OUT')).length;
    const remoteIoMappingCount = state.olp.project?.remoteIoMapping?.length || 0;
    const mappedRemoteIoMappingCount = state.olp.project?.remoteIoMapping?.filter((entry) => entry?.mapped && entry?.address)?.length || 0;
    const setText = (element, value) => { if (element) element.textContent = String(value); };
    setText(el.olpBusStatus, uiText(state.olp.busStatus || 'Virtual Bus disconnected'));
    setText(el.olpIoNote, state.olp.project
        ? uiFormat('{name} · labels In {input} / Out {output} · Remote IO: {mapped}/{total} mapped', {
            name: state.olp.project.name,
            input: inputLabelCount,
            output: outputLabelCount,
            mapped: mappedRemoteIoMappingCount,
            total: remoteIoMappingCount
        })
        : uiText('Virtual Bus: load an OLP project to show its mapped IO addresses'));
    setOlpMonitorAddress(el.olpIoInBitAddress, inputBit);
    setOlpMonitorAddress(el.olpIoOutBitAddress, outputBit);
    setOlpMonitorAddress(el.olpIoInWordAddress, inputWordAddress);
    setOlpMonitorAddress(el.olpIoOutWordAddress, outputWordAddress);
    setText(el.olpIoInBit, inputBit ? (inputBitValue ? '1 / ON' : '0 / OFF') : '—');
    setText(el.olpIoOutBit, outputBit ? (outputBitValue ? '1 / ON' : '0 / OFF') : '—');
    setText(el.olpIoInWord, inputWord === null ? '—' : inputWord);
    setText(el.olpIoOutWord, outputWord === null ? '—' : outputWord);
    setText(el.olpIoLast, `${getOlpLastIoText()} · RX ${formatOlpMonitorTime(state.olp.lastInputAt)} · TX ${formatOlpMonitorTime(state.olp.lastOutputAt)}`);
    setText(el.olpMotionLast, getOlpLastMotionText());
    updateOlpRuntimeView();
}

function renderOlpIoMonitor() {
    const minimumInterval = 100;
    const now = performance.now();
    const last = Number(state.olp.ioRenderAt || 0);
    if (now - last >= minimumInterval && !state.olp.ioRenderTimer) {
        state.olp.ioRenderAt = now;
        renderOlpIoMonitorNow();
        return;
    }
    if (state.olp.ioRenderTimer) return;
    state.olp.ioRenderTimer = window.setTimeout(() => {
        state.olp.ioRenderTimer = null;
        state.olp.ioRenderAt = performance.now();
        renderOlpIoMonitorNow();
    }, Math.max(0, minimumInterval - (now - last)));
}

function updateOlpBusStatus(status, eventMessage = '') {
    state.olp.busStatus = status;
    if (eventMessage) setOlpLastIoEvent(eventMessage);
    updateOlpBusIndicator();
    renderOlpIoMonitor();
}

function getOlpProgramIndicatorState() {
    const phase = String(state.olp.execution?.phase || '').toLowerCase();
    const status = String(state.olp.status || '').toLowerCase();
    if (state.olp.execution?.alarm || phase === 'alarm' || phase === 'error' || status === 'error') return 'alarm';
    if (status === 'working') return 'loading';
    if (phase === 'starting' || phase === 'running') return 'running';
    if (phase === 'waiting') return 'waiting';
    if (phase === 'paused') return 'paused';
    if (phase === 'stopping') return 'stopping';
    if (phase === 'stopped' || phase === 'completed') return 'stopped';
    return state.olp.project ? 'ready' : 'stopped';
}

function updateOlpProgramIndicator() {
    const indicator = el.olpStatusDot;
    if (!indicator) return;
    const stateName = getOlpProgramIndicatorState();
    const alarmCode = state.olp.execution?.alarm?.code;
    const labels = {
        ready: '프로그램 대기',
        running: '프로그램 실행 중',
        waiting: '프로그램 대기 조건 처리 중',
        paused: '프로그램 일시정지',
        stopping: '프로그램 정지 중',
        stopped: '프로그램 정지',
        loading: '프로젝트 로딩 중',
        alarm: alarmCode === undefined ? '프로그램 알람' : uiFormat('프로그램 알람 {code}', { code: alarmCode })
    };
    indicator.classList.remove('ready', 'running', 'waiting', 'paused', 'stopping', 'stopped', 'loading', 'alarm', 'error');
    indicator.classList.add(stateName);
    const label = uiText(labels[stateName]);
    indicator.title = label;
    indicator.setAttribute('aria-label', label);
}

function getOlpBusIndicatorState() {
    const status = String(state.olp.busStatus || '').toLowerCase();
    const socket = state.olp.socket;
    const socketOpen = socket && typeof WebSocket !== 'undefined' && socket.readyState === WebSocket.OPEN;
    if (state.olp.busConnected && socketOpen) return 'connected';
    if (socket && typeof WebSocket !== 'undefined' && socket.readyState === WebSocket.CONNECTING) return 'connecting';
    if (status.includes('connecting')) return 'connecting';
    if (status.includes('waiting')) return 'waiting';
    if (status.includes('unavailable') || status.includes('error')) return 'unavailable';
    return 'disconnected';
}

function clearOlpBusHandshakeTimer() {
    if (!state.olp.busHandshakeTimer) return;
    clearTimeout(state.olp.busHandshakeTimer);
    state.olp.busHandshakeTimer = null;
}

function setOlpBusPhase(phase, status, message = '') {
    state.olp.busPhase = phase;
    state.olp.busConnected = phase === 'connected';
    if (phase === 'connected') state.olp.busLastPacketAt = Date.now();
    if (phase !== 'handshaking') clearOlpBusHandshakeTimer();
    updateOlpBusStatus(status, message);
}

function invalidateOlpBusSocket(socket, status, message = '', reconnect = true) {
    if (socket && state.olp.socket !== socket) return;
    clearOlpBusHandshakeTimer();
    // The launcher creates a new pairing token every time it starts.  Drop
    // the browser-side cached token whenever this socket is invalidated so a
    // reconnect can authenticate against the current server session.
    state.olp.busToken = null;
    state.olp.busConnected = false;
    state.olp.busPhase = state.olp.virtualBusWanted ? 'waiting' : 'off';
    state.olp.busSocketGeneration += 1;
    if (state.olp.socket === socket || !socket) state.olp.socket = null;
    try { socket?.close(); } catch { }
    updateOlpBusStatus(status, message);
    if (reconnect) scheduleOlpVirtualBusReconnect();
}

function scheduleOlpVirtualBusReconnect() {
    if (!state.olp.virtualBusWanted || state.virtualController.wanted || state.olp.reconnectTimer) return;
    state.olp.reconnectTimer = window.setTimeout(() => {
        state.olp.reconnectTimer = null;
        // Virtual Bus pairing is independent of loading an OLP project.  A
        // project only supplies labels/mappings, so keep the slave available
        // while the empty OLP workspace waits for the tester as well.
        if (state.olp.virtualBusWanted && !state.virtualController.wanted) connectOlpVirtualBus();
    }, 1000);
}

function refreshOlpBusTransportState() {
    const socket = state.olp.socket;
    const socketState = socket?.readyState;
    if (state.olp.busConnected && state.olp.busLastPacketAt
        && Date.now() - state.olp.busLastPacketAt > 3000) {
        invalidateOlpBusSocket(
            socket,
            'Virtual Bus waiting for tester',
            'Virtual Bus heartbeat timeout; waiting for tester reconnect.'
        );
        return;
    }
    const transportClosed = !socket
        || socketState === WebSocket.CLOSING
        || socketState === WebSocket.CLOSED;
    if (transportClosed && (state.olp.busConnected || socket)) {
        // The close event is not guaranteed to be delivered before the next
        // paint (especially when the tester process is terminated).  Clear
        // the state here as well so the indicator does not wait for a button
        // click to become accurate.
        invalidateOlpBusSocket(
            socket,
            state.olp.virtualBusWanted ? 'Virtual Bus waiting for tester' : 'Virtual Bus disconnected',
            'Virtual Bus transport disconnected.'
        );
        return;
    }
    updateOlpBusIndicator();
}

function startOlpBusMonitor() {
    if (state.olp.busMonitorTimer) return;
    state.olp.busMonitorTimer = window.setInterval(refreshOlpBusTransportState, 150);
    refreshOlpBusTransportState();
}

function stopOlpBusMonitor() {
    if (state.olp.busMonitorTimer) {
        window.clearInterval(state.olp.busMonitorTimer);
        state.olp.busMonitorTimer = null;
    }
    clearOlpBusHandshakeTimer();
}

function updateOlpBusIndicator() {
    const indicator = el.olpBusIndicator;
    if (!indicator) return;
    const stateName = getOlpBusIndicatorState();
    const labels = {
        connected: '로컬 가상 버스 연결됨 · OLP 슬레이브',
        connecting: '로컬 가상 버스 연결 중',
        waiting: '로컬 가상 버스 테스터 연결 대기 중',
        unavailable: '로컬 가상 버스 사용 불가 · OLP 단독 실행 가능',
        disconnected: '로컬 가상 버스 연결 안 됨'
    };
    indicator.classList.remove('connected', 'connecting', 'waiting', 'unavailable', 'disconnected');
    indicator.classList.add(stateName);
    const label = uiText(labels[stateName]);
    indicator.title = label;
    indicator.setAttribute('aria-label', label);
}

function setOlpStatus(status, message = '', replacements = {}) {
    state.olp.status = status;
    if (message) appendOlpConsole(message, replacements);
    updateOlpProgramIndicator();
    updateOlpBusIndicator();
    const running = isOlpRunning() || state.olp.workOriginBusy || state.olp.manualMoveBusy;
    if (el.olpFileEditor) el.olpFileEditor.disabled = !state.olp.project || running;
    if (el.olpFileSelect) el.olpFileSelect.disabled = !state.olp.project || running;
    updateOlpProgramPanelUi();
    updateOlpRuntimeView();
    renderOlpIoMonitor();
}

function updateOlpProgramPanelUi() {
    const enabled = Boolean(state.olp.enabled);
    const running = isOlpRunning();
    const manualMoveBusy = Boolean(state.olp.manualMoveBusy);
    const motionBusy = Boolean(state.olp.workOriginBusy || manualMoveBusy);
    const phase = String(state.olp.execution?.phase || '').toLowerCase();
    const paused = phase === 'paused' && Boolean(state.olp.runtime?.running && state.olp.runtime?.paused);
    const stopping = phase === 'stopping';
    const hasProject = Boolean(state.olp.project);
    const stopAvailable = hasProject && !motionBusy
        && (running || ['error', 'alarm', 'stopped', 'completed'].includes(phase) || state.olp.status === 'error');
    const stepAvailable = hasProject && !motionBusy
        && !Boolean(state.virtualController.wanted)
        && (!state.olp.runtime || phase === 'paused');
    const pauseAvailable = Boolean(state.olp.runtime) && !motionBusy
        && !stopping && ['starting', 'running', 'waiting', 'paused'].includes(phase);

    // The generated P[]/MovJ/Speed/Label editor belongs to the normal motion
    // program mode.  OLP shows its source files and runtime cursor instead.
    el.programPanel?.classList.toggle('olp-mode-active', enabled);
    moveOlpRobotControls(enabled);
    el.programPointActions?.classList.toggle('hidden', enabled);
    el.programStepList?.classList.toggle('hidden', enabled);
    el.programCycleTimePanel?.classList.toggle('hidden', enabled);
    el.btnProgramWorkOriginRobot?.classList.toggle('hidden', !enabled);

    if (enabled) {
        if (el.btnProgramStepRobot) {
            el.btnProgramStepRobot.disabled = !stepAvailable;
            el.btnProgramStepRobot.title = uiText(stepAvailable
                ? 'Execute one OLP program line'
                : 'Single-step is available when OLP is stopped or paused');
            el.btnProgramStepRobot.setAttribute('aria-label', uiText('Execute one OLP program line'));
        }
        if (el.btnProgramRunRobot) el.btnProgramRunRobot.disabled = !hasProject
            || (running && !paused)
            || motionBusy
            || state.motionSessions.size > 0
            || Boolean(state.virtualController.wanted);
        if (el.btnProgramRunRobot) {
            el.btnProgramRunRobot.title = uiText(paused ? 'OLP 계속 실행' : '현재 로봇 시작');
            el.btnProgramRunRobot.setAttribute('aria-label', uiText(paused ? 'OLP 계속 실행' : '현재 로봇 시작'));
        }
        if (el.btnProgramPauseRobot) el.btnProgramPauseRobot.disabled = !pauseAvailable;
        if (el.btnProgramStopRobot) {
            el.btnProgramStopRobot.disabled = !stopAvailable || stopping;
            el.btnProgramStopRobot.title = uiText(stopAvailable
                ? 'Stop OLP and reset cursor to the first line of main.pro'
                : 'Stop OLP');
            el.btnProgramStopRobot.setAttribute('aria-label', uiText('Stop OLP'));
        }
        if (el.btnProgramWorkOriginRobot) {
            const homeAvailable = hasProject && !running && !motionBusy
                && !Boolean(state.virtualController.wanted);
            el.btnProgramWorkOriginRobot.classList.remove('hidden');
            el.btnProgramWorkOriginRobot.disabled = !homeAvailable;
            el.btnProgramWorkOriginRobot.title = uiText(homeAvailable
                ? 'Move to Work Origin 0'
                : 'Work Origin is available when OLP is stopped');
        }
        if (el.programControlGroup) {
            el.programControlGroup.querySelectorAll('button').forEach((button) => { button.disabled = true; });
        }
        el.programRepeatButtons.forEach((button) => {
            button.disabled = true;
            button.classList.remove('active');
            button.setAttribute('aria-pressed', 'false');
        });
        if (el.btnProgramExport) el.btnProgramExport.disabled = !hasProject || running || manualMoveBusy;
        if (el.btnProgramImport) el.btnProgramImport.disabled = running || manualMoveBusy;
        el.btnProgramExport?.setAttribute('title', uiText('전체 OLP 프로젝트 ZIP 저장'));
        el.btnProgramImport?.setAttribute('title', uiText('전체 OLP 프로젝트 폴더 불러오기'));
        if (el.btnPositionExport) {
            const hasPointFile = Boolean(state.olp.project?.pointFiles?.some((entry) => entry.kind === 'point'));
            el.btnPositionExport.disabled = !hasPointFile || running || manualMoveBusy;
        }
        if (el.btnProgramPauseRobot) {
            const paused = phase === 'paused';
            el.btnProgramPauseRobot.title = uiText(paused ? 'OLP 계속 실행' : 'OLP 일시정지');
            el.btnProgramPauseRobot.setAttribute('aria-label', uiText(paused ? 'OLP 계속 실행' : 'OLP 일시정지'));
        }
    } else {
        el.btnProgramExport?.setAttribute('title', uiText('파일명과 저장 위치 선택'));
        el.btnProgramImport?.setAttribute('title', uiText('프로젝트 불러오기'));
    }
}

function moveOlpRobotControls(enabled) {
    const row = el.programControlRobot;
    const slot = el.olpRobotControlSlot;
    const playback = el.programPlayback;
    if (!row || !slot || !playback) return;

    if (enabled) {
        // Reuse the normal program-panel control row.  This keeps the OLP
        // buttons on the same handlers/state machine as the non-OLP panel and
        // avoids a second, easily desynchronised Start/Stop pair.
        slot.classList.remove('hidden');
        slot.insertBefore(row, el.olpInlineCursor || null);
        playback.classList.add('hidden');
    } else {
        playback.insertBefore(row, el.programControlGroup || null);
        playback.classList.remove('hidden');
        slot.classList.add('hidden');
    }
}

function setOlpPanelLayout(enabled) {
    const panel = el.programPanel;
    // A pop-out has its own document-sized layout.  Do not apply the main
    // canvas panel geometry to that separate window.
    if (!panel || panel.classList.contains('panel-popout')) return;
    const properties = ['top', 'right', 'bottom', 'left', 'width', 'height', 'maxWidth', 'maxHeight', 'transform'];
    if (enabled) {
        if (!panel._olpLayoutSnapshot) {
            panel._olpLayoutSnapshot = Object.fromEntries(properties.map((property) => [property, panel.style[property]]));
            panel._olpLayoutClasses = {
                positioned: panel.classList.contains('olp-panel-positioned'),
                edgeResized: panel.classList.contains('panel-edge-resized'),
                programResized: panel.classList.contains('program-panel-resized')
            };
        }
        // OLP changes the panel's size, not its location.  Capture the
        // current visual position in canvas coordinates before the OLP CSS
        // rules are applied, otherwise the panel jumps to the OLP default
        // corner every time the mode button is pressed.
        const canvasRect = el.canvasContainer?.getBoundingClientRect();
        const panelRect = panel.getBoundingClientRect();
        const targetWidth = Math.min(480, Math.max(1, (canvasRect?.width || panelRect.width) - 32));
        const targetHeight = Math.min(760, Math.max(1, (canvasRect?.height || panelRect.height) - 32));
        const currentLeft = canvasRect
            ? THREE.MathUtils.clamp(panelRect.left - canvasRect.left, 0, Math.max(0, canvasRect.width - targetWidth))
            : 16;
        const currentTop = canvasRect
            ? THREE.MathUtils.clamp(panelRect.top - canvasRect.top, 0, Math.max(0, canvasRect.height - targetHeight))
            : 16;
        panel.classList.add('olp-panel-positioned');
        panel.style.top = `${currentTop}px`;
        panel.style.right = 'auto';
        panel.style.bottom = 'auto';
        panel.style.left = `${currentLeft}px`;
        panel.style.width = 'min(480px, calc(100% - 32px))';
        panel.style.height = 'min(760px, calc(100% - 32px))';
        panel.style.maxWidth = 'calc(100% - 32px)';
        panel.style.maxHeight = 'calc(100% - 32px)';
        panel.style.transform = 'none';
        return;
    }
    const snapshot = panel._olpLayoutSnapshot;
    if (!snapshot) return;
    properties.forEach((property) => { panel.style[property] = snapshot[property] || ''; });
    if (panel._olpLayoutClasses?.positioned) panel.classList.add('olp-panel-positioned');
    else panel.classList.remove('olp-panel-positioned');
    if (panel._olpLayoutClasses?.edgeResized) panel.classList.add('panel-edge-resized');
    else panel.classList.remove('panel-edge-resized');
    if (panel._olpLayoutClasses?.programResized) panel.classList.add('program-panel-resized');
    else panel.classList.remove('program-panel-resized');
    delete panel._olpLayoutSnapshot;
    delete panel._olpLayoutClasses;
}

function toggleOlpWorkspace(force = null, { connectBus = true, saveWorkspace = true } = {}) {
    const enabled = force === null ? !state.olp.enabled : Boolean(force);
    if (!enabled && (isOlpRunning() || state.olp.socket)) void stopOlpSession('OLP workspace closed', { closeBus: true });
    state.olp.enabled = enabled;
    state.olp.virtualBusWanted = enabled && !state.virtualController.wanted;
    if (enabled) startOlpBusMonitor();
    else {
        stopOlpBusMonitor();
        if (state.olp.reconnectTimer) {
            clearTimeout(state.olp.reconnectTimer);
            state.olp.reconnectTimer = null;
        }
        state.olp.busConnected = false;
        state.olp.busPhase = 'off';
        state.olp.busLastPacketAt = 0;
        updateOlpBusStatus('Virtual Bus disconnected');
    }
    if (enabled) showMotionProgramPanel();
    setOlpPanelLayout(enabled);
    el.olpWorkspace?.classList.toggle('hidden', !enabled);
    el.olpModeButton?.classList.toggle('active', enabled);
    el.olpModeButton?.setAttribute('aria-pressed', String(enabled));
    renderMotionProgramPanel();
    updateOlpProgramPanelUi();
    setOlpStatus(state.olp.status, enabled ? 'OLP workspace opened' : 'OLP workspace closed');
    if (enabled && connectBus && !state.virtualController.wanted) connectOlpVirtualBus();
    if (saveWorkspace) scheduleMotionProjectSave();
}

const OLP_SYNTAX_ADDRESS_PATTERN = /^(?:InW|OutW|In|Out|JP|P|J|L|V|Z|Tool|Wobj|T|B|R|D)\s*\[\s*[-+]?\d+(?:\.\d+)?\s*\]$/i;
const OLP_SYNTAX_COMMAND_PATTERN = /^(?:ABS|CALL|DELAY|ELSE|END|ENDIF|GOTO|HOME|IF|JUMP|JUMPL|LABEL|MOVABS|MOVC|MOVJ|MOVL|MOVS|OUT|PRINT|RETURN|SET|START|STOP|THEN|TIME|TIMEOUT|TIMESTART|UNTIL|VELSET|WAIT)$/i;
const OLP_SYNTAX_TOKEN_PATTERN = /("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|(?:#|\/\/).*|(?:InW|OutW|In|Out|JP|P|J|L|V|Z|Tool|Wobj|T|B|R|D)\s*\[\s*[-+]?\d+(?:\.\d+)?\s*\]|\b(?:ABS|CALL|DELAY|ELSE|END|ENDIF|GOTO|HOME|IF|JUMP|JUMPL|LABEL|MOVABS|MOVC|MOVJ|MOVL|MOVS|OUT|PRINT|RETURN|SET|START|STOP|THEN|TIME|TIMEOUT|TIMESTART|UNTIL|VELSET|WAIT)\b|[-+]?(?:\d+(?:\.\d*)?|\.\d+)|[A-Za-z_][\w]*|[=<>!]+|[+\-*/%]|[()[\]{},;:.])/gi;

function escapeOlpHtml(value) {
    return String(value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;');
}

function getOlpSyntaxTokenClass(token, line, index) {
    if (/^(?:#|\/\/)/.test(token)) return 'olp-syntax-comment';
    if (/^(?:"|')/.test(token)) return 'olp-syntax-string';
    if (OLP_SYNTAX_ADDRESS_PATTERN.test(token)) return 'olp-syntax-address';
    if (OLP_SYNTAX_COMMAND_PATTERN.test(token)) return 'olp-syntax-command';
    if (/^[-+]?\d|^\.\d/.test(token)) return 'olp-syntax-number';
    if (/^[=<>!]+$/.test(token) || /^[+\-*/%]$/.test(token)) return 'olp-syntax-operator';
    if (/^[A-Za-z_][\w]*$/.test(token)) {
        const remainder = line.slice(index + token.length);
        if (/^\s*:/.test(remainder)) return 'olp-syntax-label';
        return 'olp-syntax-identifier';
    }
    return 'olp-syntax-punctuation';
}

function highlightOlpSourceLine(line) {
    let html = '';
    let cursor = 0;
    let match;
    OLP_SYNTAX_TOKEN_PATTERN.lastIndex = 0;
    while ((match = OLP_SYNTAX_TOKEN_PATTERN.exec(line))) {
        if (match.index > cursor) html += escapeOlpHtml(line.slice(cursor, match.index));
        const token = match[0];
        const tokenClass = getOlpSyntaxTokenClass(token, line, match.index);
        html += `<span class="${tokenClass}">${escapeOlpHtml(token)}</span>`;
        cursor = match.index + token.length;
    }
    return html + escapeOlpHtml(line.slice(cursor));
}

function getOlpEditorPresentation(source = '') {
    const normalized = String(source ?? '').replace(/\r\n?/g, '\n');
    // ProgramInfo is controller metadata, not executable source.  Keep its
    // exact prefix separately so the editor can hide it without losing it
    // when the project is saved.
    const header = normalized.match(/^(?:[ \t]*\n)*[ \t]*ProgramInfo\b[\s\S]*?^[ \t]*EndProgramInfo\b[^\n]*(?:\n|$)/im);
    if (!header) return { text: normalized, hiddenPrefix: '', lineOffset: 0 };

    let consumed = header[0].length;
    while (consumed < normalized.length) {
        const blankLines = normalized.slice(consumed).match(/^(?:[ \t]*\n)+/);
        if (!blankLines) break;
        consumed += blankLines[0].length;
    }
    const hiddenPrefix = normalized.slice(0, consumed);
    return {
        text: normalized.slice(consumed),
        hiddenPrefix,
        lineOffset: hiddenPrefix.split('\n').length - 1
    };
}

function getOlpEditorProjectText(path, visibleText) {
    const hiddenPrefix = state.olp.editorHiddenProgramInfo.get(path) || '';
    return hiddenPrefix + String(visibleText ?? '');
}

function flushOlpPendingEdit() {
    if (state.olp.projectEditTimer) {
        clearTimeout(state.olp.projectEditTimer);
        state.olp.projectEditTimer = null;
    }
    if (!state.olp.project || !state.olp.selectedFile || !el.olpFileEditor || isOlpRunning()) return false;
    const nextText = getOlpEditorProjectText(state.olp.selectedFile, el.olpFileEditor.value);
    const record = state.olp.project.files?.get(state.olp.selectedFile);
    if (!record || record.text === nextText) return false;
    const updated = updateOlpFileText(state.olp.project, state.olp.selectedFile, nextText);
    if (updated) state.olp.projectDirty = true;
    return updated;
}

function renderOlpSourceHighlight(source = '') {
    if (!el.olpFileHighlight) return;
    const normalized = String(source ?? '').replace(/\r\n?/g, '\n');
    const lines = normalized.split('\n');
    if (el.olpFileGutter) el.olpFileGutter.textContent = lines.map((_, index) => String(index + 1)).join('\n') || '1';
    el.olpFileHighlight.innerHTML = lines.map(highlightOlpSourceLine).join('\n') || ' ';
    syncOlpEditorScroll();
}

function syncOlpEditorScroll() {
    if (!el.olpFileEditor || !el.olpFileHighlight) return;
    el.olpFileHighlight.scrollTop = el.olpFileEditor.scrollTop;
    el.olpFileHighlight.scrollLeft = el.olpFileEditor.scrollLeft;
    if (el.olpFileGutter) el.olpFileGutter.scrollTop = el.olpFileEditor.scrollTop;
}

function setOlpEditorText(value = '') {
    if (!el.olpFileEditor) return;
    const presentation = getOlpEditorPresentation(value);
    const path = state.olp.selectedFile;
    if (path) {
        if (presentation.hiddenPrefix) state.olp.editorHiddenProgramInfo.set(path, presentation.hiddenPrefix);
        else state.olp.editorHiddenProgramInfo.delete(path);
        state.olp.editorLineOffsets.set(path, presentation.lineOffset);
    }
    el.olpFileEditor.value = presentation.text;
    renderOlpSourceHighlight(el.olpFileEditor.value);
}

function getOlpSelectedPointFile() {
    const project = state.olp.project;
    const path = state.olp.selectedFile;
    return project?.pointFiles?.find((file) => file.path === path && file.kind === 'point') || null;
}

function formatOlpPointTableValue(value, digits = 3) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric.toFixed(digits) : '-';
}

function captureOlpPointViewState() {
    const tableScroll = el.olpPointTable?.querySelector('.olp-point-table-scroll');
    return {
        fileScrollTop: el.olpFileSelect?.scrollTop || 0,
        fileScrollLeft: el.olpFileSelect?.scrollLeft || 0,
        tableScrollTop: tableScroll?.scrollTop || 0,
        tableScrollLeft: tableScroll?.scrollLeft || 0
    };
}

function restoreOlpPointViewState(viewState = {}) {
    const apply = () => {
        if (el.olpFileSelect) {
            el.olpFileSelect.scrollTop = Number(viewState.fileScrollTop) || 0;
            el.olpFileSelect.scrollLeft = Number(viewState.fileScrollLeft) || 0;
        }
        const tableScroll = el.olpPointTable?.querySelector('.olp-point-table-scroll');
        if (tableScroll) {
            tableScroll.scrollTop = Number(viewState.tableScrollTop) || 0;
            tableScroll.scrollLeft = Number(viewState.tableScrollLeft) || 0;
        }
    };

    apply();
    window.requestAnimationFrame?.(() => {
        apply();
        window.requestAnimationFrame?.(apply);
    });
}

function renderOlpPointTable() {
    const tableShell = el.olpPointTable;
    if (!tableShell) return;
    const pointFile = getOlpSelectedPointFile();
    const isPointFile = Boolean(pointFile);
    tableShell.classList.toggle('hidden', !isPointFile);
    if (!isPointFile) {
        tableShell.replaceChildren();
        return;
    }

    const robot = state.activeProgramRobot || state.activeArticulatedModel;
    const isScara = robot?.userData?.manifest?.robotType === 'scara';
    const columns = ['ID', 'Name', 'X', 'Y', 'Z', 'A', ...(isScara ? [] : ['B', 'C'])];
    const head = columns.map((column) => `<th>${escapeOlpHtml(uiText(column))}</th>`).join('');
    const rows = pointFile.records.map((record) => {
        const values = Array.isArray(record.values) ? record.values : [];
        const coordinateCells = values.slice(0, 6).map((value) => `<td>${formatOlpPointTableValue(value)}</td>`);
        if (isScara) coordinateCells.splice(4, 2);
        return `<tr tabindex="0" role="button" aria-label="${escapeOlpHtml(uiFormat('Point {point}', { point: record.name || `${record.sourceSymbol || 'P'}${record.index}` }))}" data-olp-point-row data-olp-point-path="${escapeOlpHtml(record.path)}" data-olp-point-index="${record.index}" data-olp-point-symbol="${escapeOlpHtml(record.sourceSymbol || 'P')}">
            <td class="olp-point-id">${escapeOlpHtml(record.index)}</td>
            <td class="olp-point-name">${escapeOlpHtml(record.name || `${record.sourceSymbol || 'P'}${record.index}`)}</td>
            ${coordinateCells.join('')}
        </tr>`;
    }).join('');

    tableShell.innerHTML = `
        <div class="olp-point-table-note">${escapeOlpHtml(uiFormat('{path} · 우클릭 또는 Enter/Space로 현재 로봇 위치와 Arm 파라미터를 덮어쓸 수 있습니다.', { path: pointFile.path }))}</div>
        <div class="olp-point-table-scroll">
            <table>
                <thead><tr>${head}</tr></thead>
                <tbody>${rows || `<tr><td class="olp-point-empty" colspan="${columns.length}">${escapeOlpHtml(uiText('포인트 레코드가 없습니다.'))}</td></tr>`}</tbody>
            </table>
        </div>`;
}

function renderOlpSelectedFile() {
    closeOlpPointContextMenu();
    const project = state.olp.project;
    const selected = project?.files?.get(state.olp.selectedFile);
    const isPointFile = Boolean(getOlpSelectedPointFile());
    el.olpFileGutter?.classList.toggle('hidden', isPointFile);
    el.olpFileHighlight?.classList.toggle('hidden', isPointFile);
    el.olpFileEditor?.classList.toggle('hidden', isPointFile);
    if (el.olpFileEditor) {
        setOlpEditorText(selected?.text ?? '');
        el.olpFileEditor.disabled = !selected || isPointFile || isOlpRunning();
    }
    renderOlpPointTable();
}

function renderOlpFileList() {
    const project = state.olp.project;
    if (!el.olpFileSelect) return;
    const files = getOlpEditableFiles(project)
        .filter((record) => !/\.rpj$/i.test(record.path)
            && !/(^|\/)BreakPoints\.jsn$/i.test(record.path));
    const current = state.olp.selectedFile;
    el.olpFileSelect.replaceChildren();
    files.forEach((record) => {
        const option = document.createElement('option');
        option.value = record.path;
        option.textContent = record.path;
        el.olpFileSelect.appendChild(option);
    });
    state.olp.selectedFile = files.some((record) => record.path === current)
        ? current
        : files.find((record) => /(^|\/)main\.pro$/i.test(record.path))?.path || files[0]?.path || '';
    el.olpFileSelect.value = state.olp.selectedFile;
    renderOlpSelectedFile();
}

function renderOlpProjectUi() {
    const project = state.olp.project;
    if (el.olpProjectName) el.olpProjectName.textContent = project
        ? uiFormat('{name} · {count} files', { name: project.name, count: project.files.size })
        : uiText('No project loaded');
    renderOlpFileList();
    setOlpStatus(state.olp.status, '');
}

const OLP_IMPORT_LIMITS = Object.freeze({ maxFiles: 512, maxDepth: 10, maxFileBytes: 32 * 1024 * 1024, maxTotalBytes: 128 * 1024 * 1024 });

async function collectOlpDirectoryFiles(directory, prefix = '', depth = 0, totalBytes = { value: 0 }) {
    if (depth > OLP_IMPORT_LIMITS.maxDepth) throw new Error(`Project folder nesting exceeds ${OLP_IMPORT_LIMITS.maxDepth} levels.`);
    const files = [];
    for await (const entry of directory.values()) {
        const relativePath = prefix ? prefix + '/' + entry.name : entry.name;
        if (entry.kind === 'directory') {
            files.push(...await collectOlpDirectoryFiles(entry, relativePath, depth + 1, totalBytes));
            continue;
        }
        const file = await entry.getFile();
        if (file.size > OLP_IMPORT_LIMITS.maxFileBytes) throw new Error(`${relativePath} exceeds the ${OLP_IMPORT_LIMITS.maxFileBytes / 1024 / 1024} MB file limit.`);
        totalBytes.value += file.size;
        if (totalBytes.value > OLP_IMPORT_LIMITS.maxTotalBytes) throw new Error(`Project folder exceeds the ${OLP_IMPORT_LIMITS.maxTotalBytes / 1024 / 1024} MB total limit.`);
        // Keep the folder-relative path without using a webkitdirectory
        // upload input. This avoids the browser's multi-file upload warning.
        files.push({
            name: file.name,
            type: file.type,
            size: file.size,
            lastModified: file.lastModified,
            relativePath,
            text: () => file.text(),
            arrayBuffer: () => file.arrayBuffer()
        });
        if (files.length > OLP_IMPORT_LIMITS.maxFiles) throw new Error(`Project folder exceeds the ${OLP_IMPORT_LIMITS.maxFiles} file limit.`);
    }
    return files;
}

function validateOlpImportFiles(files) {
    if (files.length > OLP_IMPORT_LIMITS.maxFiles) throw new Error(`Project folder exceeds the ${OLP_IMPORT_LIMITS.maxFiles} file limit.`);
    let totalBytes = 0;
    const paths = new Set();
    files.forEach((file) => {
        const relativePath = String(file.webkitRelativePath || file.relativePath || file.name || '').replaceAll('\\', '/');
        const parts = relativePath.split('/').filter(Boolean);
        if (!parts.length || parts.some((part) => part === '.' || part === '..' || part.startsWith('.'))) throw new Error(`Invalid project path: ${relativePath}`);
        if (parts.length > OLP_IMPORT_LIMITS.maxDepth + 1) throw new Error(`Project path exceeds ${OLP_IMPORT_LIMITS.maxDepth} levels: ${relativePath}`);
        if (paths.has(relativePath)) throw new Error(`Duplicate project path: ${relativePath}`);
        paths.add(relativePath);
        const size = Number(file.size) || 0;
        if (size > OLP_IMPORT_LIMITS.maxFileBytes) throw new Error(`${relativePath} exceeds the ${OLP_IMPORT_LIMITS.maxFileBytes / 1024 / 1024} MB file limit.`);
        totalBytes += size;
    });
    if (totalBytes > OLP_IMPORT_LIMITS.maxTotalBytes) throw new Error(`Project folder exceeds the ${OLP_IMPORT_LIMITS.maxTotalBytes / 1024 / 1024} MB total limit.`);
}

async function importOlpFolderFromPicker() {
    if (typeof window.showDirectoryPicker !== 'function') {
        el.olpImportFolderInput?.click();
        return;
    }
    try {
        const directory = await window.showDirectoryPicker({
            id: 'inorobot-olp-project-import',
            mode: 'read'
        });
        const files = await collectOlpDirectoryFiles(directory);
        await handleOlpFolderImport(files);
    } catch (error) {
        if (error?.name === 'AbortError') return;
        setOlpStatus('error', 'Project folder selection failed: {error}', { error: error.message || error });
    }
}

async function persistOlpWorkspaceBinaryAssets(project) {
    if (!project?.files || IS_MANUAL_GUIDE_EMBED) return false;
    let failed = false;
    for (const record of project.files.values()) {
        if (!record?.binary || record.workspaceAssetId || !record.file?.arrayBuffer) continue;
        try {
            const bytes = await record.file.arrayBuffer();
            const name = record.path.split('/').at(-1) || record.file.name || 'olp-binary.dat';
            const file = new File([bytes], name, {
                type: record.file.type || 'application/octet-stream',
                lastModified: record.file.lastModified || Date.now()
            });
            record.workspaceAssetId = await persistImportedWorkspaceAsset(file, getFileExtension(name));
        } catch (error) {
            failed = true;
            console.warn('OLP binary source could not be saved for workspace recovery:', error);
        }
    }
    return failed;
}

function activateOlpProject(project, {
    selectedFile = '',
    enabled = true,
    dirty = false,
    connectBus = true
} = {}) {
    state.olp.project = project;
    state.olp.selectedFile = selectedFile;
    state.olp.projectDirty = Boolean(dirty);
    state.olp.inputWords = new Uint16Array(OLP_WORD_COUNT);
    state.olp.outputWords = new Uint16Array(OLP_WORD_COUNT);
    state.olp.inputExtended = new Map();
    state.olp.outputExtended = new Map();
    state.olp.positionCommandValues = new Map();
    state.olp.lastRawInputBitAddress = '';
    state.olp.lastRawInputWordAddress = '';
    state.olp.consoleLines = [];
    state.olp.consoleEntries = [];
    state.olp.busStatus = 'Virtual Bus disconnected';
    state.olp.busConnected = false;
    state.olp.busPhase = 'off';
    state.olp.busLastPacketAt = 0;
    setOlpLastIoEvent('No Virtual Bus packet received.');
    state.olp.lastInputAt = 0;
    state.olp.lastOutputAt = 0;
    setOlpLastMotion('No OLP motion command executed yet.');
    state.olp.lastInputSignature = '';
    state.olp.lastOutputSignature = '';
    state.olp.modelAdaptationNotices = new Set();
    state.olp.remoteCommandValues = new Map();
    state.olp.remoteCommandBusy = false;
    state.olp.resetCursorOnStop = false;
    state.olp.editorHiddenProgramInfo = new Map();
    state.olp.editorLineOffsets = new Map();
    syncOlpHomeStatus(state.activeProgramRobot || state.activeArticulatedModel);
    state.olp.execution = {
        phase: 'ready', running: false, paused: false, filePath: project.programPath,
        lineNumber: 0, lineText: '', command: '', waitCondition: '', callStack: [], alarm: null
    };
    appendOlpConsole('Loaded {name}', { name: project.name });
    appendOlpConsole('OLP runtime {build} loaded.', { build: OLP_RUNTIME_BUILD });
    appendOlpConsole('JP.pts: {count} JointPoints', { count: project.pointFiles.filter((entry) => entry.kind === 'jointPoint').reduce((sum, entry) => sum + entry.records.length, 0) });
    appendOlpConsole('Point files: {count}', { count: project.pointFiles.filter((entry) => entry.kind === 'point').length });
    appendOlpConsole('Program files: {count}', { count: project.programFiles.length });
    appendOlpConsole(project.remoteIoMapping?.length
        ? 'Remote IO mapping: {path} ({count} entries)'
        : 'Remote IO mapping: not found; use simulation Run/Stop controls.',
        project.remoteIoMapping?.length
            ? { path: project.remoteIoMappingPath, count: project.remoteIoMapping.length }
            : {});
    const homeStatus = getOlpHomeStatusOutput(project);
    appendOlpConsole(homeStatus
        ? 'Home status: {label} ({address}), pose-driven.'
        : 'Home status: no Home_sts output label found in this project.',
        homeStatus ? { label: homeStatus.label, address: homeStatus.address } : {});
    renderOlpProjectUi();
    toggleOlpWorkspace(enabled, { connectBus: false, saveWorkspace: false });
    setOlpStatus('connected', 'Project ready. The current selected robot model will be used.');
    if (enabled && connectBus && !state.virtualController.wanted) {
        connectOlpVirtualBus({ refreshMetadata: true });
    }
}

async function handleOlpFolderImport(selectedFiles = null, options = {}) {
    const files = selectedFiles?.target?.files || selectedFiles || el.olpImportFolderInput?.files;
    if (!files?.length || state.olp.importInProgress || (isMotionActive() && !isOlpRunning())) return;
    if (!options.suppressDiscardPrompt && state.olp.projectDirty
        && !window.confirm(uiText('Unsaved OLP edits will be discarded. Continue?'))) {
        return;
    }
    flushOlpPendingEdit();
    const filesArray = [...files];
    state.olp.importInProgress = true;
    setOlpStatus('working', 'Loading robot project folder...');
    try {
        validateOlpImportFiles(filesArray);
        await stopOlpSession('Loading a new OLP project', { closeBus: true });
        const project = await buildOlpProjectFromFiles(filesArray);
        project.programPath = project.programFiles.find((path) => /(^|\/)main\.pro$/i.test(path)) || project.programFiles[0] || null;
        const binaryPersistenceFailed = !options.skipAssetPersistence
            ? await persistOlpWorkspaceBinaryAssets(project)
            : false;
        activateOlpProject(project, {
            selectedFile: options.selectedFile || '',
            enabled: options.enabled !== false,
            dirty: Boolean(options.dirty),
            connectBus: options.connectBus !== false
        });
        if (!options.suppressWorkspaceSave) scheduleMotionProjectSave();
        if (binaryPersistenceFailed) {
            setStatus('OLP 프로젝트는 불러왔지만 일부 바이너리 파일을 작업 복구 저장소에 저장하지 못했습니다.', '#f59e0b');
        }
        return project;
    } catch (error) {
        console.error('OLP project import failed:', error);
        setOlpStatus('error', 'Project load failed: {error}', { error: error.message || error });
        if (options.throwOnError) throw error;
        return null;
    } finally {
        state.olp.importInProgress = false;
        if (el.olpImportFolderInput) el.olpImportFolderInput.value = '';
    }
}

async function saveOlpProjectAsZip() {
    const project = state.olp.project;
    if (!project) return;
    flushOlpPendingEdit();
    try {
        const zip = new JSZip();
        const archivePaths = new Set();
        for (const record of project.files.values()) {
            const archivePath = String(record.path || '').replaceAll('\\', '/');
            if (!archivePath || archivePath.split('/').some((part) => !part || part === '.' || part === '..')) throw new Error(`Invalid ZIP path: ${record.path}`);
            if (archivePaths.has(archivePath)) throw new Error(`Duplicate ZIP path: ${archivePath}`);
            archivePaths.add(archivePath);
            if (record.binary && record.file) zip.file(archivePath, await record.file.arrayBuffer());
            else zip.file(archivePath, normalizeOlpTextForWindows(record.text));
        }
        const blob = await zip.generateAsync({ type: 'blob', compression: 'STORE' });
        const suggestedName = `${project.name || 'InoRobotProject'}_OLP.zip`;
        if (typeof window.showSaveFilePicker === 'function') {
            const fileHandle = await window.showSaveFilePicker({
                id: 'inorobot-olp-project-zip',
                suggestedName,
                startIn: 'downloads',
                excludeAcceptAllOption: true,
                types: [{
                    description: 'InoRobot OLP project ZIP',
                    accept: { 'application/zip': ['.zip'] }
                }]
            });
            const writable = await fileHandle.createWritable();
            await writable.write(blob);
            await writable.close();
        } else {
            // Older browsers cannot expose a save-path picker. Keep the
            // download fallback so ZIP export remains available there.
            saveAs(blob, suggestedName);
        }
        state.olp.projectDirty = false;
        scheduleMotionProjectSave();
        setOlpStatus('connected', 'Project saved as ZIP.');
    } catch (error) {
        if (error?.name === 'AbortError') return;
        setOlpStatus('error', 'ZIP save failed: {error}', { error: error.message || error });
    }
}

async function writeOlpFileToDirectory(directory, record) {
    const parts = record.path.split('/').filter(Boolean);
    const fileName = parts.pop();
    let target = directory;
    for (const part of parts) target = await target.getDirectoryHandle(part, { create: true });
    const handle = await target.getFileHandle(fileName, { create: true });
    const writable = await handle.createWritable();
    await writable.write(record.binary && record.file
        ? await record.file.arrayBuffer()
        : normalizeOlpTextForWindows(record.text));
    await writable.close();
}

async function saveOlpProjectAsFolder() {
    const project = state.olp.project;
    if (!project) return;
    flushOlpPendingEdit();
    if (typeof window.showDirectoryPicker !== 'function') {
        setOlpStatus('error', '이 브라우저는 폴더 저장을 지원하지 않습니다. Edge 또는 Chrome에서 다시 시도해 주세요.');
        return;
    }
    try {
        const directory = await window.showDirectoryPicker({ id: 'inorobot-olp-project', mode: 'readwrite' });
        if (!window.confirm(uiFormat('Files in {name} may be overwritten. Continue?', { name: directory.name || 'the selected folder' }))) return;
        for (const record of project.files.values()) await writeOlpFileToDirectory(directory, record);
        state.olp.projectDirty = false;
        scheduleMotionProjectSave();
        setOlpStatus('connected', 'Project saved to the selected folder.');
    } catch (error) {
        if (error?.name === 'AbortError') return;
        setOlpStatus('error', 'Folder save failed: {error}', { error: error.message || error });
    }
}

function canonicalOlpAddress(parsed) {
    return `${parsed.prefix}[${parsed.index}]`;
}

function readOlpAddress(address) {
    const parsed = normalizeOlpAddress(address, state.olp.project?.labels || {});
    if (!parsed) return 0;
    const key = canonicalOlpAddress(parsed);
    if (parsed.prefix === 'IN' || parsed.prefix === 'INW') {
        const bit = parsed.index - OLP_BIT_START;
        if (parsed.prefix === 'IN') {
            return bit >= 0 && bit < OLP_BIT_COUNT
                ? ((state.olp.inputWords[Math.floor(bit / 16)] >> (bit % 16)) & 1)
                : (state.olp.inputExtended.get(key) || 0);
        }
        const word = parsed.index - OLP_WORD_START;
        return word >= 0 && word < OLP_WORD_COUNT ? state.olp.inputWords[word] : (state.olp.inputExtended.get(key) || 0);
    }
    if (parsed.prefix === 'OUT') {
        const bit = parsed.index - OLP_BIT_START;
        return bit >= 0 && bit < OLP_BIT_COUNT
            ? ((state.olp.outputWords[Math.floor(bit / 16)] >> (bit % 16)) & 1)
            : (state.olp.outputExtended.get(key) || 0);
    }
    const word = parsed.index - OLP_WORD_START;
    return word >= 0 && word < OLP_WORD_COUNT ? state.olp.outputWords[word] : (state.olp.outputExtended.get(key) || 0);
}

function readOlpRawInputAddress(address) {
    const parsed = normalizeOlpAddress(address, state.olp.project?.labels || {});
    if (!parsed || !['IN', 'INW'].includes(parsed.prefix)) return 0;
    const key = canonicalOlpAddress(parsed);
    if (parsed.prefix === 'IN') {
        const bit = parsed.index - OLP_BIT_START;
        return bit >= 0 && bit < OLP_BIT_COUNT
            ? ((state.olp.inputWords[Math.floor(bit / 16)] >> (bit % 16)) & 1)
            : (state.olp.inputExtended.get(key) || 0);
    }
    const word = parsed.index - OLP_WORD_START;
    return word >= 0 && word < OLP_WORD_COUNT ? state.olp.inputWords[word] : (state.olp.inputExtended.get(key) || 0);
}

function writeOlpAddress(address, value) {
    const parsed = normalizeOlpAddress(address, state.olp.project?.labels || {});
    if (!parsed || !['OUT', 'OUTW'].includes(parsed.prefix)) return;
    const numeric = parsed.prefix === 'OUTW' ? clampWord(value) : (Number(value) ? 1 : 0);
    const previous = readOlpAddress(parsed);
    const key = canonicalOlpAddress(parsed);
    if (parsed.prefix === 'OUT') {
        const bit = parsed.index - OLP_BIT_START;
        if (bit >= 0 && bit < OLP_BIT_COUNT) {
            const word = Math.floor(bit / 16);
            const mask = 1 << (bit % 16);
            state.olp.outputWords[word] = numeric ? state.olp.outputWords[word] | mask : state.olp.outputWords[word] & ~mask;
        } else state.olp.outputExtended.set(key, numeric);
    } else {
        const word = parsed.index - OLP_WORD_START;
        if (word >= 0 && word < OLP_WORD_COUNT) state.olp.outputWords[word] = numeric;
        else state.olp.outputExtended.set(key, numeric);
    }
    // Generated main.pro files scan continuously and often assign the same IO
    // status on every pass. There is no state change to render or transmit.
    if (previous === numeric) return;
    state.olp.lastOutputAt = Date.now();
    setOlpLastIoEvent('OLP → Tester: {address} = {value}', {
        address: `${parsed.prefix}[${parsed.index}]`,
        value: numeric
    });
    renderOlpIoMonitor();
    sendOlpOutputSnapshot();
}

async function animateOlpJointMove(robot, targetAngles, speed, {
    motion = 'MOVJ', startPose = null, targetPose = null, speedProvider = null,
    accelerationScale = 1, zone = null, shouldStop = null, onProgress = null
} = {}) {
    const starts = robot.userData.joints.map((joint) => joint.angle);
    const targets = robot.userData.joints.map((joint, index) => Number(targetAngles[index] ?? starts[index]));
    const isLinear = motion === 'MOVL' && startPose && targetPose;
    // Z[CP] is the controller's continuous-path zone.  The previous OLP
    // implementation parsed it but still used the exact-stop S-curve for
    // every segment, which made generated P1/P2 routes visibly tap between
    // points.  Keep CP at a constant path rate so the next segment starts
    // without the artificial stop-and-restart profile used by Z[0]/Z[n].
    const continuousPath = String(zone || '').trim().toUpperCase() === 'CP';
    const pathDistance = isLinear ? startPose.position.distanceTo(targetPose.position) : 0;
    const getDuration = () => {
        const effectiveSpeed = Number(speedProvider?.() ?? speed) || speed;
        const durationSeconds = isLinear
            ? calculateMovlDuration(
                startPose.position.distanceTo(targetPose.position),
                THREE.MathUtils.radToDeg(startPose.quaternion.angleTo(targetPose.quaternion)),
                effectiveSpeed,
                robot.userData.manifest?.cartesianMotion
            )
            : calculateMovjDuration(starts, targets, robot.userData.joints, effectiveSpeed);
        // Preserve the controller's V[]/Velset relationship while keeping OLP
        // responsive at intentionally low test speeds.
        const scaledDuration = durationSeconds / Math.max(0.2, Math.min(1.2, Number(accelerationScale) || 1));
        return Math.max(100, Math.min(8000, scaledDuration * 1000));
    };
    const startAt = performance.now();
    let previousAt = startAt;
    let distanceProgress = 0;
    while (true) {
        if (state.olp.runtime?.cancelled) throw new Error('OLP stopped');
        if (shouldStop?.()) {
            captureCurrentTcpTarget(robot);
            return { interrupted: true, progress: distanceProgress };
        }
        const now = performance.now();
        const durationMilliseconds = getDuration();
        distanceProgress += Math.max(0, now - previousAt) / durationMilliseconds;
        previousAt = now;
        const progress = Math.min(1, distanceProgress);
        const eased = continuousPath
            ? progress
            : progress * progress * (3 - 2 * progress);
        targets.forEach((target, index) => setJointAngle(robot.userData.joints[index], starts[index] + (target - starts[index]) * eased, false));
        robot.updateMatrixWorld(true);
        syncJointControls(robot);
        requestRender();
        onProgress?.({
            progress,
            elapsedSeconds: Math.max(0, now - startAt) / 1000,
            durationSeconds: durationMilliseconds / 1000,
            distance: pathDistance
        });
        if (progress >= 1) break;
        await new Promise((resolve) => window.setTimeout(resolve, 16));
    }
    captureCurrentTcpTarget(robot);
    return { interrupted: false, progress: 1 };
}

function getOlpMotionTarget(project, pointExpression, runtime = null, options = {}) {
    if (options?.targetOverride?.values) {
        return {
            kind: options.targetOverride.kind === 'jointPoint' ? 'jointPoint' : 'point',
            values: [...options.targetOverride.values],
            name: options.targetOverride.name || pointExpression
        };
    }
    return resolveOlpPoint(project, pointExpression, runtime?.activePointFile);
}

function buildOlpCartesianTarget(robot, values) {
    const numeric = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
    const source = [
        numeric(values?.[0]),
        numeric(values?.[1]),
        numeric(values?.[2]),
        numeric(values?.[3]),
        numeric(values?.[4]),
        numeric(values?.[5])
    ];
    const adaptationDetails = [];
    const position = new THREE.Vector3(source[0], source[1], source[2]);
    let quaternion;

    if (robot.userData.manifest?.robotType === 'scara') {
        const prismaticDefinition = robot.userData.joints?.[2]?.definition;
        if (Number.isFinite(prismaticDefinition?.min) && Number.isFinite(prismaticDefinition?.max)) {
            const adaptedZ = THREE.MathUtils.clamp(
                position.z,
                prismaticDefinition.min,
                prismaticDefinition.max
            );
            if (Math.abs(adaptedZ - position.z) > 0.001) {
                adaptationDetails.push('Z ' + position.z.toFixed(3) + ' -> ' + adaptedZ.toFixed(3));
                position.z = adaptedZ;
            }
        }

        const structure = robot.userData.manifest?.structure || [];
        const arm1 = numeric(structure[0], NaN);
        const arm2 = numeric(structure[1], NaN);
        const radius = Math.hypot(position.x, position.y);
        if (Number.isFinite(arm1) && Number.isFinite(arm2)) {
            const minimumRadius = Math.max(0, Math.abs(arm1 - arm2) + 0.001);
            const maximumRadius = Math.max(minimumRadius, arm1 + arm2 - 0.001);
            const adaptedRadius = THREE.MathUtils.clamp(radius, minimumRadius, maximumRadius);
            if (Math.abs(adaptedRadius - radius) > 0.001) {
                if (radius < 0.001) {
                    position.set(adaptedRadius, 0, position.z);
                } else {
                    const scale = adaptedRadius / radius;
                    position.x *= scale;
                    position.y *= scale;
                }
                adaptationDetails.push('XY radius ' + radius.toFixed(3) + ' -> ' + adaptedRadius.toFixed(3));
            }
        }

        if (Math.abs(source[4]) > 0.01 || Math.abs(source[5]) > 0.01) {
            adaptationDetails.push('SCARA tilt axes ignored');
        }
        // OLP point records use Rz, Ry, Rx order after XYZ. SCARA accepts Rz
        // only, so preserve yaw and remove the unsupported tilt axes.
        quaternion = quaternionFromTcpRotationDegrees(robot, 0, 0, source[3]);
    } else {
        quaternion = quaternionFromTcpRotationDegrees(robot, source[5], source[4], source[3]);
    }

    return {
        position,
        quaternion,
        adaptation: {
            changed: adaptationDetails.length > 0,
            details: adaptationDetails
        }
    };
}

function getOlpMotionCallbacks(runtime, options = {}) {
    return {
        shouldStop: options.until ? () => Boolean(runtime?.evaluate?.(options.until)) : null,
        onProgress: (metrics) => runtime?.handleMotionProgress?.(options, metrics)
    };
}

function getOlpAccelerationScale(options = {}) {
    const acceleration = Number(options.acceleration);
    const deceleration = Number(options.deceleration);
    const values = [acceleration, deceleration].filter((value) => Number.isFinite(value) && value > 0);
    if (!values.length) return 1;
    // SetAcc/Acc/Dec values are percentages.  The S-curve duration is scaled
    // conservatively so a lower value visibly slows the OLP motion without
    // exceeding the model's configured acceleration limits.
    const average = values.reduce((sum, value) => sum + value, 0) / values.length;
    return Math.sqrt(Math.max(0.05, Math.min(1.2, average / 100)));
}

function getOlpEffectiveMotionSpeed(robot, motion, speed, runtime = null, options = {}) {
    const speedMode = options.speedMode || 'percent';
    const effective = Number(runtime?.getEffectiveMotionSpeed?.(speed, speedMode) ?? speed) || speed;
    if (motion !== 'MOVL' || speedMode === 'absolute') return effective;
    const maximum = Number(robot.userData.manifest?.cartesianMotion?.maxSpeed) || 1000;
    return Math.max(1, maximum * Math.max(1, Math.min(100, effective)) / 100);
}

function formatOlpIkFailure(robot, point, target, solved) {
    const manifest = robot.userData.manifest || {};
    const modelName = robot.userData.robotName || robot.userData.modelName || manifest.name || 'selected robot';
    const format = (value) => Number.isFinite(Number(value)) ? Number(value).toFixed(3) : 'unreachable';
    const source = point.values || [];
    const parts = [
        'IK failed for ' + (point.name || 'target'),
        'model=' + modelName + ' (' + (manifest.robotType || 'unknown') + ')',
        'source XYZ=[' + format(source[0]) + ', ' + format(source[1]) + ', ' + format(source[2]) + ']',
        'target XYZ=[' + format(target.position.x) + ', ' + format(target.position.y) + ', ' + format(target.position.z) + ']'
    ];
    const current = getCurrentTcpPoseBase(robot);
    if (current?.position) {
        parts.push('current XYZ=['
            + format(current.position.x) + ', '
            + format(current.position.y) + ', '
            + format(current.position.z) + ']');
    }
    parts.push('position error=' + format(solved?.positionError) + ' mm');
    parts.push('rotation error=' + format(Number(solved?.rotationError) * 180 / Math.PI) + ' deg');

    if (manifest.robotType === 'scara') {
        const structure = manifest.structure || [];
        const arm1 = Number(structure[0]);
        const arm2 = Number(structure[1]);
        const radius = Math.hypot(target.position.x, target.position.y);
        if (Number.isFinite(arm1) && Number.isFinite(arm2)) {
            parts.push('SCARA reach radius=' + format(radius)
                + ' mm (allowed ' + format(Math.abs(arm1 - arm2))
                + '...' + format(arm1 + arm2) + ' mm)');
        }
        const zDefinition = robot.userData.joints?.[2]?.definition;
        if (zDefinition) {
            parts.push('SCARA Z range=' + format(zDefinition.min) + '...' + format(zDefinition.max) + ' mm');
        }
    } else {
        parts.push('6-axis target may be outside the reachable workspace or joint limits');
    }
    if (target.adaptation?.details?.length) {
        parts.push('model adaptation=' + target.adaptation.details.join(', '));
    }
    if (solved?.reason) parts.push('reason=' + solved.reason);
    return parts.join('; ');
}

async function moveOlpTarget(robot, motion, point, speed, runtime = null, options = {}) {
    const speedProvider = () => getOlpEffectiveMotionSpeed(robot, motion, speed, runtime, options);
    const callbacks = getOlpMotionCallbacks(runtime, options);
    const accelerationScale = getOlpAccelerationScale(options);
    if (point.kind === 'jointPoint') {
        return animateOlpJointMove(robot, point.values, speed, {
            motion: 'MOVJ', speedProvider, accelerationScale, zone: options.zone, ...callbacks
        });
    }
    const target = buildOlpCartesianTarget(robot, point.values);
    if (target.adaptation?.changed) {
        const notices = state.olp.modelAdaptationNotices || new Set();
        state.olp.modelAdaptationNotices = notices;
        const signature = point.name + '|' + target.adaptation.details.join('|');
        if (!notices.has(signature)) {
            notices.add(signature);
            appendOlpConsole('Selected SCARA model adaptation: {name} ({details}).', {
                name: point.name,
                details: target.adaptation.details.join('; ')
            });
        }
    }
    const startPose = getCurrentTcpPoseBase(robot);
    const starts = robot.userData.joints.map((joint) => joint.angle);
    const solved = solveRobotIK(robot, target, { positionTolerance: 0.8, rotationTolerance: THREE.MathUtils.degToRad(0.5) });
    if (!solved.success) {
        restoreRobotJointAngles(robot, starts);
        throw new Error(formatOlpIkFailure(robot, point, target, solved));
    }
    const targets = robot.userData.joints.map((joint) => joint.angle);
    restoreRobotJointAngles(robot, starts);
    return animateOlpJointMove(robot, targets, speed, {
        motion: motion === 'MOVL' ? 'MOVL' : 'MOVJ',
        startPose,
        targetPose: target,
        speedProvider,
        accelerationScale,
        zone: options.zone,
        ...callbacks
    });
}

async function moveOlpCartesianPose(robot, motion, target, speed, runtime = null, options = {}) {
    const point = {
        kind: 'point',
        name: options.segmentName || motion,
        values: [
            target.position.x,
            target.position.y,
            target.position.z,
            ...(() => {
                const rotation = getTcpRotationDegrees(robot, target);
                return [rotation.rz, rotation.ry, rotation.rx];
            })()
        ]
    };
    return moveOlpTarget(robot, motion, point, speed, runtime, options);
}

async function runOlpMove(motion, pointExpression, speed, project, runtime = null, options = {}) {
    const robot = state.activeProgramRobot || state.activeArticulatedModel;
    if (!robot) throw new Error('Select one robot before running OLP.');
    if (motion === 'MOVC') {
        const arcTargets = options.arcTargets || [];
        const middle = arcTargets[1];
        const end = arcTargets[2];
        if (!middle?.targetOverride || !end?.targetOverride) throw new Error('MovC requires three valid point targets.');
        setOlpLastMotion('MOVC {targets} started (linear arc approximation).', {
            targets: arcTargets.map((entry) => entry.expression).join(' → ')
        });
        appendOlpConsole('Executing {motion}', { motion: getOlpLastMotionText() });
        renderOlpIoMonitor();
        const middleResult = await moveOlpTarget(robot, 'MOVL', {
            kind: middle.targetOverride.kind === 'jointPoint' ? 'jointPoint' : 'point',
            values: middle.targetOverride.values,
            name: middle.targetOverride.name || middle.expression
        }, speed, runtime, { ...options, outEvents: [] });
        if (!middleResult?.interrupted) {
            await moveOlpTarget(robot, 'MOVL', {
                kind: end.targetOverride.kind === 'jointPoint' ? 'jointPoint' : 'point',
                values: end.targetOverride.values,
                name: end.targetOverride.name || end.expression
            }, speed, runtime, options);
        }
        setOlpLastMotion('MOVC completed.');
        renderOlpIoMonitor();
        return;
    }
    const point = getOlpMotionTarget(project, pointExpression, runtime, options);
    if (!point) throw new Error(`Point not found: ${pointExpression}`);
    setOlpLastMotion('{motion} {point} started on selected robot.', {
        motion: motion.toUpperCase(),
        point: pointExpression
    });
    appendOlpConsole('Executing {motion}', { motion: getOlpLastMotionText() });
    // Home status is pose-driven and project-specific.  The first changed joint
    // during this motion will update the detected Home_sts output accordingly.
    renderOlpIoMonitor();
    const result = await moveOlpTarget(robot, motion, point, speed, runtime, options);
    setOlpLastMotion(result?.interrupted
        ? '{motion} {point} stopped by Until condition.'
        : '{motion} {point} completed.', {
            motion: motion.toUpperCase(),
            point: point.name
        });
    renderOlpIoMonitor();
}

async function runOlpJump(motion, pointExpression, speed, project, runtime = null, options = {}) {
    const robot = state.activeProgramRobot || state.activeArticulatedModel;
    if (!robot) throw new Error('Select one robot before running OLP.');
    if (robot.userData.manifest?.robotType !== 'scara') throw new Error(`${motion} is available only for SCARA robots.`);
    const point = getOlpMotionTarget(project, pointExpression, runtime, options);
    if (!point || point.kind === 'jointPoint') throw new Error(`${motion} requires a Cartesian P point.`);
    const start = getCurrentTcpPoseBase(robot);
    const target = buildOlpCartesianTarget(robot, point.values);
    const requestedHeight = Math.max(0, Number(options.jumpHeight) || 100);
    const highestPoseZ = Math.max(start.position.z, target.position.z);
    const prismaticJoint = robot.userData.joints?.[2];
    const zMin = Number(prismaticJoint?.definition?.min);
    const zMax = Number(prismaticJoint?.definition?.max);
    const requestedTravelZ = highestPoseZ + requestedHeight;
    // SCARA projects use the controller's prismatic range directly for the
    // Cartesian Z axis. In the upright model, Z=0 is already the highest
    // reachable height, so blindly adding 100 mm creates an impossible lift
    // and aborts the whole OLP runtime before the first real move.
    const travelZ = Number.isFinite(zMin) && Number.isFinite(zMax)
        ? THREE.MathUtils.clamp(requestedTravelZ, zMin, zMax)
        : requestedTravelZ;
    const height = Math.max(0, travelZ - highestPoseZ);
    const lift = { position: start.position.clone(), quaternion: start.quaternion.clone() };
    const travel = { position: target.position.clone(), quaternion: target.quaternion.clone() };
    lift.position.z = travelZ;
    travel.position.z = travelZ;
    if (height + 1e-6 < requestedHeight) {
        appendOlpConsole('JUMP clearance limited to {height} mm by the selected SCARA Z range.', { height });
    }
    setOlpLastMotion('{motion} {point} started (lift {height} mm).', {
        motion,
        point: pointExpression,
        height
    });
    appendOlpConsole('Executing {motion}', { motion: getOlpLastMotionText() });
    renderOlpIoMonitor();
    const liftResult = await moveOlpCartesianPose(robot, 'MOVL', lift, speed, runtime, { ...options, outEvents: [], segmentName: `${motion} lift` });
    if (liftResult?.interrupted) return;
    const traverseResult = await moveOlpCartesianPose(robot, motion === 'JUMPL' ? 'MOVL' : 'MOVJ', travel, speed, runtime, { ...options, outEvents: [], segmentName: `${motion} traverse` });
    if (traverseResult?.interrupted) return;
    const descendResult = await moveOlpCartesianPose(robot, 'MOVL', target, speed, runtime, { ...options, segmentName: `${motion} descend` });
    setOlpLastMotion(descendResult?.interrupted
        ? '{motion} {point} stopped by Until condition.'
        : '{motion} {point} completed.', {
            motion,
            point: point.name
        });
    renderOlpIoMonitor();
}

function getOlpCurrentPosition(kind = 'point') {
    const robot = state.activeProgramRobot || state.activeArticulatedModel;
    if (!robot) return null;
    if (kind === 'jointPoint') return robot.userData.joints.map((joint) => Number(joint.angle) || 0);
    const pose = getCurrentTcpPoseBase(robot);
    if (!pose) return null;
    const rotation = getTcpRotationDegrees(robot, pose);
    return [pose.position.x, pose.position.y, pose.position.z, rotation.rz, rotation.ry, rotation.rx];
}

function handleOlpAlarm(code, easyGo) {
    state.olp.execution = {
        ...state.olp.execution,
        alarm: { code, easyGo },
        phase: easyGo ? state.olp.execution?.phase || 'running' : 'alarm'
    };
    appendOlpConsole(easyGo ? 'OLP Alarm[{code}] EasyGo.' : 'OLP Alarm[{code}].', { code });
    if (!easyGo) setOlpLastMotion('Alarm[{code}] stopped OLP.', { code });
    updateOlpProgramIndicator();
    renderOlpIoMonitor();
}

function getOlpHomeTargetAngles(robot, homeIndex) {
    const targets = robot.userData.joints.map(() => 0);
    // Imported projects can use Home[0] without declaring a point.  In OLP it
    // means the fixed Work Origin 0: zero all axes and fold J5 to -90 degrees.
    // SCARA has its own mechanical zero convention, so it remains all zero.
    if (Number(homeIndex) === 0 && robot.userData.manifest?.robotType !== 'scara') {
        const j5Index = robot.userData.joints.findIndex((joint) => joint.definition?.name === 'J5');
        if (j5Index >= 0) targets[j5Index] = -90;
    }
    return targets;
}

function getOlpHomeStatusOutput(project = state.olp.project) {
    const labels = project?.labels || {};
    const candidates = Object.entries(labels)
        .map(([label, address]) => {
            const parsed = normalizeOlpAddress(address, labels);
            const compact = String(label || '').replace(/[^a-z0-9]/gi, '').toLowerCase();
            if (parsed?.prefix !== 'OUT' || !compact.includes('home') || !/(sts|status)$/.test(compact)) return null;
            const score = (compact === 'yrobothomests' ? 1000 : 0)
                + (/(?:home)(?:sts|status)$/.test(compact) ? 100 : 0)
                + (compact.includes('robot') ? 10 : 0);
            return { label, address: canonicalOlpAddress(parsed), score };
        })
        .filter(Boolean)
        .sort((left, right) => right.score - left.score || left.label.localeCompare(right.label));
    return candidates[0] || null;
}

function syncOlpHomeStatus(robot) {
    const homeStatus = getOlpHomeStatusOutput();
    if (!homeStatus || !robot?.userData?.joints?.length) return;
    const homeTargets = getOlpHomeTargetAngles(robot, 0);
    // The simulation uses degrees for rotary joints and millimetres for a SCARA
    // vertical axis.  A small tolerance avoids an ON/OFF flicker at the final
    // animation frame, while still making Out[519] reflect the actual pose.
    const atWorkOrigin0 = robot.userData.joints.every((joint, index) => (
        Math.abs(Number(joint.angle || 0) - Number(homeTargets[index] || 0)) <= 0.05
    ));
    writeOlpAddress(homeStatus.address, atWorkOrigin0 ? 1 : 0);
}

async function runOlpHome(homeIndex, speed, project, runtime = null) {
    const robot = state.activeProgramRobot || state.activeArticulatedModel;
    if (!robot) throw new Error('Select one robot before running OLP.');
    const isScara = robot.userData.manifest?.robotType === 'scara';
    const originDescription = Number(homeIndex) === 0
        ? (isScara ? 'Work Origin 0 (SCARA joint zero)' : 'Work Origin 0 (J5 = -90°)')
        : 'joint zero';
    setOlpLastMotion('HOME[{index}] {origin} started on selected robot.', {
        index: homeIndex,
        origin: originDescription
    });
    appendOlpConsole('Executing {motion}', { motion: getOlpLastMotionText() });
    renderOlpIoMonitor();
    await animateOlpJointMove(robot, getOlpHomeTargetAngles(robot, homeIndex), speed, {
        speedProvider: () => runtime?.getEffectiveMotionSpeed?.(speed, 'percent') ?? speed
    });
    syncOlpHomeStatus(robot);
    setOlpLastMotion('HOME[{index}] completed.', { index: homeIndex });
    appendOlpConsole('OLP Home[{index}] complete.', { index: homeIndex });
    renderOlpIoMonitor();
}

function sendOlpOutputSnapshot({ force = false } = {}) {
    // main.pro can scan hundreds of times per second and assigns the same status
    // values on every scan. Coalesce those assignments into one small bus update;
    // otherwise the tester spends all of its UI time repainting duplicate IO grids.
    if (state.olp.outputTimer) {
        if (force) state.olp.lastOutputSignature = '';
        return;
    }
    if (force) state.olp.lastOutputSignature = '';
    state.olp.outputTimer = window.setTimeout(() => {
        state.olp.outputTimer = null;
        const socket = state.olp.socket;
        if (socket?.readyState !== WebSocket.OPEN || !state.olp.busConnected) return;
        const words = [...state.olp.outputWords];
        const mappedValues = Object.fromEntries(state.olp.outputExtended);
        const signature = `${words.join(',')}|${Object.entries(mappedValues).sort(([left], [right]) => left.localeCompare(right)).map(([key, value]) => `${key}:${value}`).join(',')}`;
        if (signature === state.olp.lastOutputSignature) return;
        state.olp.lastOutputSignature = signature;
        socket.send(JSON.stringify({ type: 'outputSnapshot', words, mappedValues }));
    }, 25);
}

function getOlpRemoteCommand(command) {
    return state.olp.project?.remoteIoMapping?.find((entry) => entry?.ioType === 0 && entry?.command === command && entry?.address) || null;
}

async function resetOlpFromRemoteIo() {
    await stopOlpSession('Remote IO program reset', { resetCursor: true });
    state.olp.outputWords = new Uint16Array(OLP_WORD_COUNT);
    state.olp.outputExtended = new Map();
    state.olp.execution = { ...state.olp.execution, alarm: null };
    state.olp.lastOutputAt = Date.now();
        setOlpLastMotion('No OLP motion command executed yet.');
    appendOlpConsole('Remote IO reset received; OLP is ready.');
    renderOlpIoMonitor();
    sendOlpOutputSnapshot();
}

function getOlpPositionCommandEntries() {
    const labels = state.olp.project?.labels || {};
    return Object.entries(labels)
        .map(([label, address]) => {
            const match = label.match(/^xP(\d+)_(wait|work)_pos_start$/i);
            const parsed = normalizeOlpAddress(address, labels);
            return match && parsed?.prefix === 'IN'
                ? { label, address: canonicalOlpAddress(parsed), process: match[1], mode: match[2].toLowerCase() }
                : null;
        })
        .filter(Boolean);
}

function monitorOlpPositionInputs(previousValues, rawValues = null) {
    const entries = getOlpPositionCommandEntries();
    const nextValues = rawValues || new Map(entries.map((entry) => [entry.address, readOlpRawInputAddress(entry.address) ? 1 : 0]));
    for (const entry of entries) {
        const current = nextValues.get(entry.address) || 0;
        const previous = previousValues.get(entry.address) || 0;
        if (current !== previous) {
            const parsed = normalizeOlpAddress(entry.address, state.olp.project?.labels || {});
            state.olp.lastRawInputBitAddress = entry.address;
            if (parsed?.prefix === 'IN') {
                const bit = parsed.index - OLP_BIT_START;
                if (bit >= 0 && bit < OLP_BIT_COUNT) {
                    state.olp.lastRawInputWordAddress = `INW[${OLP_WORD_START + Math.floor(bit / 16)}]`;
                }
            }
            appendOlpConsole('Tester raw position input: {address}={value} ({label}).', {
                address: entry.address,
                value: current,
                label: entry.label
            });
        }
    }
    state.olp.positionCommandValues = nextValues;
}

async function handleOlpRemoteIoCommands(previousValues) {
    const mappings = ['start', 'stop', 'reset', 'clearAlarm']
        .map((command) => ({ command, entry: getOlpRemoteCommand(command) }))
        .filter(({ entry }) => entry);
    if (!mappings.length || state.olp.remoteCommandBusy) return;
    const rising = mappings.find(({ command, entry }) => (
        readOlpAddress(entry.address) !== 0 && previousValues.get(command) !== 1
    ));
    if (!rising) return;
    state.olp.remoteCommandBusy = true;
    try {
        if (rising.command === 'start') {
            appendOlpConsole('Remote IO start: {address} ON', { address: rising.entry.address });
            if (!isOlpRunning()) void startOlpSession();
        } else if (rising.command === 'stop') {
            appendOlpConsole('Remote IO stop: {address} ON', { address: rising.entry.address });
            await stopOlpSession('Remote IO program stop', { resetCursor: true });
        } else if (rising.command === 'reset') {
            await resetOlpFromRemoteIo();
        } else {
            appendOlpConsole('Remote IO clear alarm: {address} ON', { address: rising.entry.address });
            const runningAfterClear = isOlpRunning();
            state.olp.execution = {
                ...state.olp.execution,
                alarm: null,
                phase: ['alarm', 'error'].includes(String(state.olp.execution?.phase || '').toLowerCase())
                    ? (runningAfterClear ? 'running' : 'stopped')
                    : state.olp.execution?.phase
            };
            updateOlpBusStatus(state.olp.busConnected
                ? 'Virtual Bus connected · tester master'
                : 'Virtual Bus disconnected', 'Remote IO clear alarm received.');
            setOlpStatus(runningAfterClear ? 'running' : 'connected');
        }
    } finally {
        state.olp.remoteCommandBusy = false;
    }
}

function connectOlpVirtualBusLegacy() {
    // Kept as a compatibility shim for old bookmarks/tests. All runtime
    // callers must use the session-aware implementation below.
    return connectOlpVirtualBus();
    /*
    const oldSocket = state.olp.socket;
    if (oldSocket && [WebSocket.CONNECTING, WebSocket.OPEN].includes(oldSocket.readyState)) return;
    let socket;
    try { socket = new WebSocket('ws://127.0.0.1:8765/virtualbus/'); }
    catch {
        updateOlpBusStatus('Virtual Bus unavailable', 'No tester connection.');
        setOlpStatus(isOlpRunning() ? 'running' : 'connected');
        return;
    }
    state.olp.socket = socket;
    updateOlpBusStatus('Virtual Bus connecting; OLP runs locally');
    socket.addEventListener('open', () => {
        if (state.olp.socket !== socket) return;
        updateOlpBusStatus('Virtual Bus connected · OLP slave');
        const running = isOlpRunning();
        updateOlpBusStatus('Virtual Bus connected · OLP slave');
        setOlpStatus(running ? 'running' : 'connected', running
            ? 'Virtual Bus connected as OLP slave.'
            : 'Virtual Bus connected; waiting for OLP Run or Remote IO start.');
        socket.send(JSON.stringify({
            type: 'hello',
            role: 'slave',
            protocol: 'inorobot-virtual-bus',
            version: 1,
            robotName: state.activeProgramRobot?.userData?.robotName || '',
            modelName: state.activeProgramRobot?.userData?.modelName || '',
            labels: state.olp.project?.labels || {},
            remoteIoMapping: state.olp.project?.remoteIoMapping || []
        }));
        sendOlpOutputSnapshot({ force: true });
    });
    socket.addEventListener('message', (event) => {
        try {
            const message = JSON.parse(event.data);
            if (message.type === 'inputSnapshot' && Array.isArray(message.words)) {
                const previousPositionValues = new Map(state.olp.positionCommandValues);
                const nextWords = Uint16Array.from(message.words.slice(0, OLP_WORD_COUNT).map(clampWord));
                const nextExtended = new Map();
                if (message.mappedValues && typeof message.mappedValues === 'object') {
                    Object.entries(message.mappedValues).forEach(([address, value]) => {
                        const parsed = normalizeOlpAddress(address, state.olp.project?.labels || {});
                        if (parsed?.prefix === 'IN' || parsed?.prefix === 'INW') {
                            nextExtended.set(canonicalOlpAddress(parsed), parsed.prefix === 'INW' ? clampWord(value) : (Number(value) ? 1 : 0));
                        }
                    });
                }
                const nextSignature = `${[...nextWords].join(',')}|${[...nextExtended.entries()].sort().map(([key, value]) => `${key}:${value}`).join(',')}`;
                const changed = nextSignature !== state.olp.lastInputSignature;
                const previousRemoteValues = new Map(state.olp.remoteCommandValues);
                state.olp.inputWords = nextWords;
                state.olp.inputExtended = nextExtended;
                state.olp.lastInputAt = Date.now();
                state.olp.lastInputSignature = nextSignature;
                // OLP receives raw tester IO only.  Position inputs are logged
                // for diagnosis, but never latched, queued, or synthesized here.
                const rawPositionValues = new Map(getOlpPositionCommandEntries()
                    .map((entry) => [entry.address, readOlpRawInputAddress(entry.address) ? 1 : 0]));
                monitorOlpPositionInputs(previousPositionValues, rawPositionValues);
                const monitorInputBit = getOlpMonitorAddress('IN', state.olp.lastRawInputBitAddress);
                const monitorInputWord = getOlpMonitorAddress('INW', state.olp.lastRawInputWordAddress);
                const inputEvents = [
                    monitorInputBit ? `${monitorInputBit.address}=${readOlpAddress(monitorInputBit.address) ? 1 : 0}` : null,
                    monitorInputWord ? `${monitorInputWord.address}=${readOlpAddress(monitorInputWord.address)}` : null
                ].filter(Boolean);
        setOlpLastIoEvent(inputEvents.length
            ? 'Tester → OLP: {events}'
            : 'Tester → OLP: no mapped project input labels',
            inputEvents.length ? { events: inputEvents.join(', ') } : {});
                state.olp.remoteCommandValues = new Map(['start', 'stop', 'reset', 'clearAlarm']
                    .map((command) => {
                        const entry = getOlpRemoteCommand(command);
                        return [command, entry ? readOlpAddress(entry.address) : 0];
                    }));
                if (changed) appendOlpConsole(state.olp.lastIoSource, state.olp.lastIoReplacements);
                renderOlpIoMonitor();
                void handleOlpRemoteIoCommands(previousRemoteValues);
            }
        } catch (error) { console.warn('OLP Virtual Bus message ignored:', error); }
    });
    socket.addEventListener('close', () => {
        if (state.olp.socket !== socket) return;
        state.olp.socket = null;
        if (state.olp.virtualBusWanted && state.olp.project && !state.virtualController.wanted) {
            updateOlpBusStatus('Virtual Bus waiting for tester');
            setOlpStatus(isOlpRunning() ? 'running' : 'connected');
            if (!state.olp.reconnectTimer) state.olp.reconnectTimer = window.setTimeout(() => {
                state.olp.reconnectTimer = null;
                if (state.olp.virtualBusWanted && state.olp.project && !state.virtualController.wanted) connectOlpVirtualBus();
            }, 1000);
        }
    });
    socket.addEventListener('error', () => {
        updateOlpBusStatus('Virtual Bus unavailable · OLP local execution remains active');
        if (state.olp.socket === socket && state.olp.project) setOlpStatus(isOlpRunning() ? 'running' : 'connected');
    });
    */
}

function getOlpVirtualBusEndpoint() {
    // The local launcher (tools/serve-local.cjs) owns the broker endpoint.
    // The tester connects to the same endpoint as a WebSocket master.
    return 'ws://127.0.0.1:8765/virtualbus/';
}

async function getOlpVirtualBusToken({ force = false } = {}) {
    if (!force && state.olp.busToken) return state.olp.busToken;
    try {
        const response = await fetch('/api/virtualbus-token', { cache: 'no-store' });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || typeof data.token !== 'string' || data.token.length < 32) return null;
        state.olp.busToken = data.token;
        return data.token;
    } catch {
        return null;
    }
}

async function sendOlpVirtualBusHello(socket = state.olp.socket) {
    if (!socket || socket.readyState !== WebSocket.OPEN) return false;
    // Fetch on every hello so a server restart cannot leave the browser
    // handshaking with a token from an earlier launcher session.
    const token = await getOlpVirtualBusToken({ force: true });
    if (!token || socket.readyState !== WebSocket.OPEN) {
        updateOlpBusStatus('Virtual Bus unavailable · OLP local execution remains active', 'Local Virtual Bus pairing token is not configured.');
        return false;
    }
    socket.send(JSON.stringify({
        type: 'hello',
        token,
        role: 'slave',
        protocol: 'inorobot-virtual-bus',
        version: 1,
        sessionId: String(state.olp.busSocketGeneration || 0),
        robotName: state.activeProgramRobot?.userData?.robotName || '',
        modelName: state.activeProgramRobot?.userData?.modelName || '',
        labels: state.olp.project?.labels || {},
        remoteIoMapping: state.olp.project?.remoteIoMapping || []
    }));
    return true;
}

function connectOlpVirtualBus({ refreshMetadata = false } = {}) {
    if (state.virtualController.wanted || !state.olp.virtualBusWanted) return;
    startOlpBusMonitor();
    if (state.olp.reconnectTimer) {
        clearTimeout(state.olp.reconnectTimer);
        state.olp.reconnectTimer = null;
    }
    const oldSocket = state.olp.socket;
    if (oldSocket && oldSocket.readyState === WebSocket.OPEN) {
        // A project can be loaded after OLP was enabled. Refresh the broker's
        // project metadata without opening a second browser connection.
        if (refreshMetadata) void sendOlpVirtualBusHello(oldSocket).catch(() => { });
        return;
    }
    if (oldSocket && oldSocket.readyState === WebSocket.CONNECTING) return;

    let socket;
    try { socket = new WebSocket(getOlpVirtualBusEndpoint()); }
    catch (error) {
        state.olp.busConnected = false;
        state.olp.busPhase = 'unavailable';
        state.olp.busLastPacketAt = 0;
        updateOlpBusStatus('Virtual Bus unavailable · OLP local execution remains active', error?.message || 'connection skipped');
        scheduleOlpVirtualBusReconnect();
        return;
    }
    const socketGeneration = (state.olp.busSocketGeneration || 0) + 1;
    state.olp.busSocketGeneration = socketGeneration;
    const isCurrentSocket = () => state.olp.socket === socket
        && state.olp.busSocketGeneration === socketGeneration;
    state.olp.socket = socket;
    state.olp.busConnected = false;
    state.olp.busPhase = 'connecting';
    state.olp.busLastPacketAt = 0;
    updateOlpBusStatus('Virtual Bus connecting');
    socket.addEventListener('open', () => {
        if (!isCurrentSocket()) return;
        if (state.olp.reconnectTimer) {
            clearTimeout(state.olp.reconnectTimer);
            state.olp.reconnectTimer = null;
        }
        state.olp.busConnected = false;
        state.olp.busPhase = 'handshaking';
        state.olp.busLastPacketAt = Date.now();
        clearOlpBusHandshakeTimer();
        state.olp.busHandshakeTimer = window.setTimeout(() => {
            if (!isCurrentSocket() || state.olp.busConnected) return;
            invalidateOlpBusSocket(
                socket,
                'Virtual Bus waiting for tester',
                'Virtual Bus handshake timeout; waiting for tester reconnect.'
            );
        }, 3000);
        updateOlpBusStatus('Virtual Bus waiting for tester', 'OLP local broker endpoint is open; waiting for tester Connect.');
        try {
            sendOlpVirtualBusHello(socket);
        } catch (error) {
            updateOlpBusStatus('Virtual Bus unavailable · OLP local execution remains active', error?.message || 'hello failed');
        }
    });
    socket.addEventListener('message', (event) => {
        try {
            const message = JSON.parse(event.data);
            if (!isCurrentSocket()) return;
            if (message.type === 'busStatus' && message.connected === false) {
                // Invalidate this socket before closing it.  A delayed
                // `ready` event from the old master is then ignored by the
                // generation guard above and cannot restore a green icon.
                invalidateOlpBusSocket(socket, 'Virtual Bus disconnected', 'Tester master disconnected.');
                setOlpStatus(isOlpRunning() ? 'running' : 'connected');
                return;
            }
            if (message.type === 'ready' && String(message.role || '').toLowerCase() === 'master') {
                if (String(message.protocol || '') !== 'inorobot-virtual-bus' || Number(message.version) !== 1) {
                    invalidateOlpBusSocket(socket, 'Virtual Bus unavailable · OLP local execution remains active', 'Virtual Bus protocol mismatch.');
                    return;
                }
                setOlpBusPhase('connected', 'Virtual Bus connected · tester master', 'Tester master handshake completed.');
                setOlpStatus(isOlpRunning() ? 'running' : 'connected');
                sendOlpOutputSnapshot({ force: true });
                return;
            }
            if (message.type !== 'inputSnapshot' || !Array.isArray(message.words) || !state.olp.busConnected) return;
            const previousPositionValues = new Map(state.olp.positionCommandValues);
            const nextWords = Uint16Array.from(message.words.slice(0, OLP_WORD_COUNT).map(clampWord));
            const nextExtended = new Map();
            if (message.mappedValues && typeof message.mappedValues === 'object') {
                Object.entries(message.mappedValues).forEach(([address, value]) => {
                    const parsed = normalizeOlpAddress(address, state.olp.project?.labels || {});
                    if (parsed?.prefix === 'IN' || parsed?.prefix === 'INW') {
                        nextExtended.set(canonicalOlpAddress(parsed), parsed.prefix === 'INW' ? clampWord(value) : (Number(value) ? 1 : 0));
                    }
                });
            }
            const nextSignature = `${[...nextWords].join(',')}|${[...nextExtended.entries()].sort().map(([key, value]) => `${key}:${value}`).join(',')}`;
            const changed = nextSignature !== state.olp.lastInputSignature;
            const previousRemoteValues = new Map(state.olp.remoteCommandValues);
            state.olp.inputWords = nextWords;
            state.olp.inputExtended = nextExtended;
            state.olp.lastInputAt = Date.now();
            state.olp.busLastPacketAt = state.olp.lastInputAt;
            state.olp.lastInputSignature = nextSignature;
            const rawPositionValues = new Map(getOlpPositionCommandEntries()
                .map((entry) => [entry.address, readOlpRawInputAddress(entry.address) ? 1 : 0]));
            monitorOlpPositionInputs(previousPositionValues, rawPositionValues);
            const monitorInputBit = getOlpMonitorAddress('IN', state.olp.lastRawInputBitAddress);
            const monitorInputWord = getOlpMonitorAddress('INW', state.olp.lastRawInputWordAddress);
            const inputEvents = [
                monitorInputBit ? `${monitorInputBit.address}=${readOlpAddress(monitorInputBit.address) ? 1 : 0}` : null,
                monitorInputWord ? `${monitorInputWord.address}=${readOlpAddress(monitorInputWord.address)}` : null
            ].filter(Boolean);
            setOlpLastIoEvent(inputEvents.length
                ? 'Tester → OLP: {events}'
                : 'Tester → OLP: no mapped project input labels',
                inputEvents.length ? { events: inputEvents.join(', ') } : {});
            state.olp.remoteCommandValues = new Map(['start', 'stop', 'reset', 'clearAlarm']
                .map((command) => {
                    const entry = getOlpRemoteCommand(command);
                    return [command, entry ? readOlpAddress(entry.address) : 0];
                }));
            if (changed) appendOlpConsole(state.olp.lastIoSource, state.olp.lastIoReplacements);
            renderOlpIoMonitor();
            void handleOlpRemoteIoCommands(previousRemoteValues);
        } catch (error) { console.warn('OLP Virtual Bus message ignored:', error); }
    });
    socket.addEventListener('close', () => {
        if (!isCurrentSocket()) return;
        clearOlpBusHandshakeTimer();
        state.olp.busToken = null;
        state.olp.socket = null;
        state.olp.busConnected = false;
        state.olp.busPhase = state.olp.virtualBusWanted ? 'waiting' : 'off';
        if (state.olp.virtualBusWanted && !state.virtualController.wanted) {
            updateOlpBusStatus('Virtual Bus waiting for tester');
            setOlpStatus(isOlpRunning() ? 'running' : 'connected');
            if (!state.olp.reconnectTimer) state.olp.reconnectTimer = window.setTimeout(() => {
                state.olp.reconnectTimer = null;
                connectOlpVirtualBus();
            }, 1000);
        } else {
            updateOlpBusStatus('Virtual Bus disconnected');
        }
    });
    socket.addEventListener('error', () => {
        if (!isCurrentSocket()) return;
        state.olp.busToken = null;
        state.olp.busConnected = false;
        state.olp.busPhase = 'unavailable';
        updateOlpBusStatus('Virtual Bus unavailable · OLP local execution remains active');
        scheduleOlpVirtualBusReconnect();
    });
}

async function startOlpSession({ step = false } = {}) {
    if (step && state.olp.runtime?.running && state.olp.runtime.paused) {
        state.olp.runtime.stepOnce();
        return;
    }
    if (!step && state.olp.runtime?.running && state.olp.runtime.paused) {
        state.olp.runtime.togglePause();
        setOlpStatus('running', 'OLP resumed.');
        return;
    }
    const robot = state.activeProgramRobot || state.activeArticulatedModel;
    if (isOlpRunning()) return;
    if (!state.olp.project) { setOlpStatus('error', 'Load a robot project folder first.'); return; }
    if (!robot) { setOlpStatus('error', 'Select one robot before running OLP.'); return; }
    if (state.olp.workOriginBusy) { setOlpStatus('error', 'Wait until Work Origin movement is complete.'); return; }
    if (state.olp.manualMoveBusy) { setOlpStatus('error', 'Wait until the manual point movement is complete.'); return; }
    if (state.virtualController.wanted) { setOlpStatus('error', 'OLP is unavailable while a controller is connected.'); return; }
    if (state.motionSessions.size) { setOlpStatus('error', 'Stop the normal motion program before running OLP.'); return; }
    flushOlpPendingEdit();
    let runtime;
    runtime = new OlpRuntime(state.olp.project, {
        readAddress: readOlpAddress,
        writeAddress: writeOlpAddress,
        move: runOlpMove,
        jump: runOlpJump,
        home: runOlpHome,
        getCurrentPosition: getOlpCurrentPosition,
        alarm: handleOlpAlarm,
        delay: (milliseconds) => new Promise((resolve) => window.setTimeout(resolve, Math.max(0, milliseconds))),
        log: appendOlpConsole,
        status: appendOlpConsole,
        cursor: (snapshot) => queueOlpRuntimeView(runtime, snapshot),
        onStopped: (snapshot) => {
            if (state.olp.runtime === runtime) {
                flushOlpRuntimeView(runtime, snapshot);
                if (state.olp.resetCursorOnStop) {
                    resetOlpProgramCursor();
                    state.olp.resetCursorOnStop = false;
                }
                setOlpStatus('connected', snapshot?.phase === 'completed' ? 'OLP cycle completed.' : 'OLP stopped.');
                updateMotionUiLock();
                requestRender();
            }
        }
    });
    state.olp.runtime = runtime;
    state.olp.resetCursorOnStop = false;
    state.olp.virtualBusWanted = true;
    state.olp.execution = { ...state.olp.execution, phase: 'starting', running: true, filePath: state.olp.project.programPath, lineNumber: 0, lineText: '', command: '', waitCondition: '', callStack: [], alarm: null };
    writeOlpAddress('Out[512]', 1);
    writeOlpAddress('Out[513]', 0);
    setOlpStatus('running', 'Running {program} locally.', {
        program: state.olp.project.programPath || 'main.pro'
    });
    // Start the OLP interpreter first. The tester connection is deliberately
    // detached from program execution, so a missing Virtual Bus can never
    // prevent main.pro from running on the selected robot.
    const runtimePromise = step
        ? runtime.stepOnce(state.olp.project.programPath)
        : runtime.run(state.olp.project.programPath);
    try { connectOlpVirtualBus(); }
    catch (error) {
        updateOlpBusStatus('Virtual Bus unavailable · OLP local execution remains active', error?.message || 'connection skipped');
    }
    try { await runtimePromise; }
    catch (error) {
        if (!/OLP stopped/i.test(error?.message || '')) {
            state.olp.execution = { ...state.olp.execution, phase: 'error', running: false };
            setOlpStatus('error', 'OLP error: {error}', { error: error.message || error });
        }
    }
    if (state.olp.runtime === runtime) state.olp.runtime = null;
    setOlpStatus(state.olp.status === 'error' ? 'error' : 'connected', state.olp.status === 'error' ? '' : 'OLP ready.');
}

async function stopOlpSession(reason = 'OLP stopped', { closeBus = false, resetCursor = false } = {}) {
    const runtime = state.olp.runtime;
    const wasRunning = isOlpRunning();
    if (resetCursor) state.olp.resetCursorOnStop = true;
    if (wasRunning) runtime?.stop();
    // `stop()` changes the runtime phase synchronously.  Reflect it now so
    // duplicate Pause/Stop clicks are disabled while the current command is
    // unwinding, rather than waiting for the asynchronous stop completion.
    if (wasRunning) setOlpStatus('running');
    writeOlpAddress('Out[512]', 0);
    writeOlpAddress('Out[513]', 1);
    state.olp.virtualBusWanted = !closeBus && Boolean(state.olp.project) && !state.virtualController.wanted;
    if (state.olp.reconnectTimer) {
        clearTimeout(state.olp.reconnectTimer);
        state.olp.reconnectTimer = null;
    }
    if (closeBus) {
        stopOlpBusMonitor();
        const socket = state.olp.socket;
        state.olp.socket = null;
        state.olp.busConnected = false;
        if (socket && [WebSocket.OPEN, WebSocket.CONNECTING].includes(socket.readyState)) {
            if (socket.readyState === WebSocket.OPEN) {
                try { socket.send(JSON.stringify({ type: 'goodbye', reason })); } catch { }
            }
            try { socket.close(); } catch { }
        }
    }
    updateOlpBusStatus(closeBus
        ? 'Virtual Bus closed'
        : (state.olp.busConnected ? 'Virtual Bus connected · tester master; OLP stopped' : 'Virtual Bus disconnected; OLP stopped'), reason);
    if (runtime) appendOlpConsole(reason);
    if (runtime?.running) {
        const deadline = performance.now() + 1200;
        while (runtime.running && performance.now() < deadline) await new Promise((resolve) => window.setTimeout(resolve, 20));
    }
    if (!runtime || !runtime.running) {
        if (state.olp.resetCursorOnStop) {
            resetOlpProgramCursor();
            state.olp.resetCursorOnStop = false;
        }
        setOlpStatus(state.olp.project ? 'connected' : 'disconnected', reason);
        if (!closeBus && state.olp.virtualBusWanted && !state.olp.socket) connectOlpVirtualBus();
    }
    updateMotionUiLock();
}

async function connectVirtualController() {
    const controller = state.virtualController;
    if (isOlpRunning() || state.olp.socket) await stopOlpSession('Controller connection requested; OLP and Virtual Bus closed.', { closeBus: true });
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
    if (getVirtualControllerSourceConfig().id === 'bridge' && !controller.bridgeToken) {
        const bridgeRunning = await isVirtualControllerBridgeRunning();
        if (!bridgeRunning || !controller.bridgeToken) {
            setVirtualControllerStatus('error', '브리지 인증 설정이 없어 연결할 수 없습니다. 운영 Origin과 토큰을 설정해 주세요.');
            return;
        }
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
    controller.reconnectAttempt = 0;
    controller.reconnectMessage = '';
    openVirtualControllerSocket(false);
    requestRender();
}

function clearVirtualControllerBridgeHealthMonitor() {
    const controller = state.virtualController;
    if (controller.bridgeHealthTimer) {
        clearTimeout(controller.bridgeHealthTimer);
        controller.bridgeHealthTimer = null;
    }
    controller.bridgeHealthMonitorGeneration += 1;
}

async function isVirtualControllerBridgeRunning() {
    const controller = state.virtualController;
    const healthCheckSequence = controller.bridgeHealthCheckSequence + 1;
    controller.bridgeHealthCheckSequence = healthCheckSequence;
    const bridge = controller.core?.getVirtualControllerSource?.('bridge') || {
        healthUrl: 'http://127.0.0.1:5055/api/health'
    };
    if (!bridge.healthUrl) return false;
    try {
        const response = await fetch(bridge.healthUrl, { cache: 'no-store' });
        const health = await response.json().catch(() => ({}));
        const pairingToken = response.ok && typeof health.pairingToken === 'string'
            ? health.pairingToken
            : null;
        const running = response.ok
            && health.service === 'InoRobotVirtualControllerBridge'
            && Boolean(pairingToken);
        if (controller.bridgeHealthCheckSequence === healthCheckSequence && running) {
            controller.bridgeToken = pairingToken;
            controller.bridgeHealthFailureCount = 0;
        } else if (controller.bridgeHealthCheckSequence === healthCheckSequence
            && (controller.wanted || controller.bridgeRunning || controller.bridgeStartInProgress)) {
            console.warn('Virtual controller bridge health check returned an unusable response.', {
                healthUrl: bridge.healthUrl,
                sequence: healthCheckSequence,
                status: Number(response.status) || 0,
                service: String(health.service || ''),
                hasPairingToken: Boolean(pairingToken)
            });
        }
        return running;
    } catch (error) {
        if (controller.bridgeHealthCheckSequence === healthCheckSequence
            && (controller.wanted || controller.bridgeRunning || controller.bridgeStartInProgress)) {
            console.warn('Virtual controller bridge health check failed.', {
                healthUrl: bridge.healthUrl,
                sequence: healthCheckSequence,
                error: error instanceof Error
                    ? `${error.name}: ${error.message}`
                    : String(error)
            });
        }
        return false;
    }
}

function monitorVirtualControllerBridgeHealth(silent = false) {
    const controller = state.virtualController;
    clearVirtualControllerBridgeHealthMonitor();
    const monitorGeneration = controller.bridgeHealthMonitorGeneration;
    void (async () => {
        const wasRunning = controller.bridgeRunning;
        const healthCheckSequence = controller.bridgeHealthCheckSequence + 1;
        const running = await isVirtualControllerBridgeRunning();
        if (controller.bridgeHealthMonitorGeneration !== monitorGeneration) return;
        if (controller.bridgeHealthCheckSequence !== healthCheckSequence) {
            controller.bridgeHealthTimer = window.setTimeout(
                () => monitorVirtualControllerBridgeHealth(true),
                controller.wanted ? 350 : 750
            );
            return;
        }
        const bridgeIsActiveSource = getVirtualControllerSourceConfig().id === 'bridge';

        if (running) {
            controller.bridgeRunning = true;
            controller.bridgeHealthFailureCount = 0;
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

        controller.bridgeHealthFailureCount = Math.min(
            VIRTUAL_CONTROLLER_BRIDGE_HEALTH_FAILURE_LIMIT,
            controller.bridgeHealthFailureCount + 1
        );
        if (controller.bridgeHealthFailureCount < VIRTUAL_CONTROLLER_BRIDGE_HEALTH_FAILURE_LIMIT) {
            controller.bridgeHealthTimer = window.setTimeout(
                () => monitorVirtualControllerBridgeHealth(true),
                controller.wanted ? 350 : 750
            );
            if (!wasRunning) refreshVirtualControllerUi();
            return;
        }

        controller.bridgeRunning = false;
        controller.bridgeToken = null;
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
        if (!(await isVirtualControllerBridgeRunning()) || !controller.bridgeToken) {
            throw new Error('Bridge pairing is not configured.');
        }
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
                socket.send(JSON.stringify({ type: 'hello', token: controller.bridgeToken }));
                socket.send(JSON.stringify({ type: 'shutdown', allowShutdown: true }));
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
    controller.socketGeneration += 1;
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
    controller.pendingInterferenceReads.clear();
    controller.pendingInterferenceToolReads.clear();
    controller.samples?.clear();
    controller.lastAppliedSampleId = 0;
    controller.sourceConnectedAt = 0;
    controller.lastSampleAt = 0;
    controller.lastStreamStartAt = 0;
    controller.reconnectMessage = '';
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
    return isRobotMotionActive()
        || isVirtualControllerActive();
}

// A connected controller continuously updates the selected robot pose, but it
// should not make unrelated scene operations unavailable. Keep the controller
// in the motion interlock for robot-control actions while using this narrower
// predicate for model loading and other scene-only operations.
function isRobotMotionActive() {
    return state.motionSessions.size > 0
        || isOlpRunning()
        || Boolean(state.olp.workOriginBusy)
        || Boolean(state.olp.manualMoveBusy);
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
    if (el.programRobotName) el.programRobotName.textContent = robot
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
    updateOlpProgramPanelUi();
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
    scheduleMotionProjectSave();
    renderMotionProgramPanel();
}

function closeProgramStepContextMenu() {
    state.programContextStepId = null;
    el.programStepContextMenu?.classList.add('hidden');
}

function closeOlpPointContextMenu() {
    state.olp.pointContextTarget = null;
    el.olpPointContextMenu?.classList.add('hidden');
}

function openOlpPointContextMenu(event, record) {
    const menu = el.olpPointContextMenu;
    if (!menu || !record) return;
    closeOlpPointContextMenu();
    state.olp.pointContextTarget = {
        path: record.path,
        index: record.index,
        sourceSymbol: record.sourceSymbol || 'P'
    };
    menu.classList.remove('hidden');
    menu.style.left = '0px';
    menu.style.top = '0px';
    const bounds = menu.getBoundingClientRect();
    menu.style.left = `${Math.max(8, Math.min(event.clientX, window.innerWidth - bounds.width - 8))}px`;
    menu.style.top = `${Math.max(8, Math.min(event.clientY, window.innerHeight - bounds.height - 8))}px`;
}

function handleOlpPointContextMenu(event) {
    if (isOlpRunning() || state.olp.manualMoveBusy || state.olp.workOriginBusy || !state.olp.project) return;
    const row = event.target.closest('[data-olp-point-row]');
    if (!row) return;
    const pointFile = getOlpSelectedPointFile();
    const record = pointFile?.records?.find((candidate) => candidate.index === Number(row.dataset.olpPointIndex)
        && (candidate.sourceSymbol || 'P').toUpperCase() === String(row.dataset.olpPointSymbol || 'P').toUpperCase());
    if (!record) return;
    event.preventDefault();
    openOlpPointContextMenu(event, record);
}

function handleOlpPointTableActivate(event) {
    if (event.type === 'keydown' && !['Enter', ' '].includes(event.key)) return;
    if (isOlpRunning() || state.olp.manualMoveBusy || state.olp.workOriginBusy || !state.olp.project) return;
    const row = event.target.closest('[data-olp-point-row]');
    if (!row) return;
    const pointFile = getOlpSelectedPointFile();
    const record = pointFile?.records?.find((candidate) => candidate.index === Number(row.dataset.olpPointIndex)
        && (candidate.sourceSymbol || 'P').toUpperCase() === String(row.dataset.olpPointSymbol || 'P').toUpperCase());
    if (!record) return;
    if (event.type === 'keydown') event.preventDefault();
    const bounds = row.getBoundingClientRect();
    openOlpPointContextMenu({
        clientX: event.clientX || bounds.left + 12,
        clientY: event.clientY || bounds.bottom
    }, record);
}

function getOlpPointContextRecord(target = state.olp.pointContextTarget) {
    if (!target || !state.olp.project) return null;
    const pointFile = state.olp.project.pointFiles?.find((file) => file.path === target.path);
    return pointFile?.records?.find((record) => record.index === Number(target.index)
        && (record.sourceSymbol || 'P').toUpperCase() === String(target.sourceSymbol || 'P').toUpperCase()) || null;
}

async function moveOlpPointFromContext() {
    const target = state.olp.pointContextTarget;
    closeOlpPointContextMenu();
    if (!target || !state.olp.project) return;
    if (isOlpRunning()) {
        setOlpStatus('error', 'Stop OLP before moving to a point.');
        return;
    }
    if (state.olp.manualMoveBusy || state.olp.workOriginBusy) return;
    if (state.virtualController.wanted) {
        setOlpStatus('error', 'Point movement is unavailable while a controller is connected.');
        return;
    }
    if (state.motionSessions.size) {
        setOlpStatus('error', 'Stop the normal motion program before moving to a point.');
        return;
    }

    const robot = state.activeProgramRobot || state.activeArticulatedModel;
    const record = getOlpPointContextRecord(target);
    if (!robot) {
        setOlpStatus('error', 'Select one robot before moving to a point.');
        return;
    }
    if (!record || !Array.isArray(record.values) || !record.values.length) {
        setOlpStatus('error', 'Point record not found: {point}.', {
            point: `${target.sourceSymbol || 'P'}[${target.index}]`
        });
        return;
    }

    const pointName = `${record.sourceSymbol || 'P'}[${record.index}]`;
    state.olp.manualMoveBusy = true;
    updateOlpProgramPanelUi();
    updateMotionUiLock();
    try {
        setOlpLastMotion('Moving to {point}.', { point: pointName });
        appendOlpConsole('Moving {point} from {path}.', {
            point: pointName,
            path: record.path
        });
        setOlpStatus('working');
        await moveOlpTarget(robot, 'MOVJ', record, 100, null, {
            segmentName: pointName,
            armParameters: record.armParameters || []
        });
        setOlpLastMotion('{point} reached.', { point: pointName });
        appendOlpConsole('{point} reached.', { point: pointName });
        setOlpStatus('connected', 'Moved to {point}.', { point: pointName });
    } catch (error) {
        setOlpStatus('error', 'Point move failed: {error}', {
            error: error?.message || error
        });
    } finally {
        state.olp.manualMoveBusy = false;
        updateOlpProgramPanelUi();
        updateMotionUiLock();
        requestRender();
    }
}

function formatOlpPointSourceLine(record, coordinates, armParameters) {
    const sourceLine = String(record?.sourceLine || '');
    const segments = sourceLine.split(';');
    const assignment = segments[0]?.match(/^(\s*(?:P|LP)\s*\[\s*\d+\s*\]\s*=\s*)/i);
    if (!assignment) throw new Error('포인트 레코드 형식을 인식할 수 없습니다.');
    const formatNumber = (value) => {
        const numeric = Number(value);
        if (!Number.isFinite(numeric)) throw new Error('현재 로봇 위치값이 올바르지 않습니다.');
        return (Object.is(numeric, -0) ? 0 : numeric).toFixed(6);
    };
    const coordinateText = coordinates.slice(0, 6).map(formatNumber).join(', ');
    const armText = armParameters.slice(0, 4).map((value) => {
        const numeric = Number(value);
        if (!Number.isFinite(numeric)) throw new Error('Arm 파라미터가 올바르지 않습니다.');
        return String(Math.trunc(numeric));
    }).join(', ');
    segments[0] = `${assignment[1]}${coordinateText}`;
    segments[1] = ` ${armText}`;
    if (segments.length < 3) segments.push('0.000000, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000');
    return segments.join(';');
}

function writeOlpPointFromCurrentRobot() {
    const target = state.olp.pointContextTarget;
    closeOlpPointContextMenu();
    if (!target || isOlpRunning() || !state.olp.project) return;
    const robot = state.activeProgramRobot || state.activeArticulatedModel;
    const pointFile = state.olp.project.pointFiles?.find((file) => file.path === target.path && file.kind === 'point');
    const record = pointFile?.records?.find((candidate) => candidate.index === Number(target.index)
        && (candidate.sourceSymbol || 'P').toUpperCase() === String(target.sourceSymbol || 'P').toUpperCase());
    if (!robot || !pointFile || !record) return;
    const coordinates = getOlpCurrentPosition('point');
    if (!Array.isArray(coordinates) || coordinates.length < 6) {
        setOlpStatus('error', '현재 로봇 위치를 읽을 수 없습니다.');
        return;
    }
    try {
        const joints = (robot.userData.joints || []).map((joint) => Number(joint.angle) || 0);
        const armParameters = calculatePointArmParameters(robot, joints);
        const nextLine = formatOlpPointSourceLine(record, coordinates, armParameters);
        const fileRecord = state.olp.project.files.get(target.path);
        const sourceLines = String(fileRecord?.text || '').split(/\r?\n/);
        let lineIndex = sourceLines.findIndex((line) => line === record.sourceLine);
        if (lineIndex < 0) {
            lineIndex = sourceLines.findIndex((line) => new RegExp(`^\\s*(?:P|LP)\\s*\\[\\s*${Number(target.index)}\\s*\\]\\s*=`, 'i').test(line));
        }
        if (lineIndex < 0) throw new Error('원본 포인트 행을 찾을 수 없습니다.');
        sourceLines[lineIndex] = nextLine;
        const viewState = captureOlpPointViewState();
        updateOlpFileText(state.olp.project, target.path, sourceLines.join('\n'));
        state.olp.projectDirty = true;
        scheduleMotionProjectSave();
        state.olp.selectedFile = target.path;
        renderOlpFileList();
        restoreOlpPointViewState(viewState);
        appendOlpConsole('{symbol}[{index}] overwritten from current robot pose; Arm=[{arm}].', {
            symbol: target.sourceSymbol || 'P',
            index: target.index,
            arm: armParameters.join(', ')
        });
        setOlpStatus(state.olp.status === 'error' ? 'connected' : state.olp.status, 'OLP point updated from the current robot position.');
    } catch (error) {
        setOlpStatus('error', '포인트 쓰기 실패: {error}', { error: error.message || error });
    }
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

function preflightActiveReverseRepeatSessions(scope) {
    [...state.motionSessions.values()]
        .filter((session) => !session.stepIntoStepId && session.controlScope === scope)
        .forEach((session) => preflightRobotMotion(session.robot, session.steps, {
            reverseRepeat: true,
            timerOnly: true
        }));
}

function updateMotionRepeat(event) {
    if (state.olp.enabled) return;
    const scope = event.currentTarget?.dataset.programRepeatScope === 'robot' ? 'robot' : 'group';
    const reverse = event.currentTarget?.hasAttribute('data-program-reverse-repeat') === true;
    const repeatStateKey = scope === 'robot' ? 'motionRepeatRobot' : 'motionRepeat';
    const reverseStateKey = scope === 'robot' ? 'motionReverseRepeatRobot' : 'motionReverseRepeat';
    const stateKey = reverse ? reverseStateKey : repeatStateKey;
    const enabled = !state[stateKey];
    if (reverse && enabled) {
        try {
            preflightActiveReverseRepeatSessions(scope);
        } catch (error) {
            setMotionProgramStatus('모션 경로 검증에 실패했습니다.', 'error');
            renderMotionProgramPanel();
            return;
        }
    }
    const before = isMotionActive() ? null : captureSceneSnapshot();
    state[repeatStateKey] = reverse ? false : enabled;
    state[reverseStateKey] = reverse ? enabled : false;
    state.motionSessions.forEach((session) => {
        if (session.stepIntoStepId || session.controlScope !== scope) return;
        session.repeat = state[repeatStateKey];
        session.reverseRepeat = state[reverseStateKey];
    });
    syncMotionRepeatControl();
    if (before) recordHistory(reverse ? '역순 반복 변경' : '반복 실행 변경', before, captureSceneSnapshot());
    else scheduleMotionProjectSave();
    renderMotionProgramPanel();
}

function syncMotionRepeatControl() {
    el.programRepeatButtons.forEach((button) => {
        const reverse = button.hasAttribute('data-program-reverse-repeat');
        const robotScope = button.dataset.programRepeatScope === 'robot';
        const enabled = reverse
            ? (robotScope ? state.motionReverseRepeatRobot : state.motionReverseRepeat)
            : (robotScope ? state.motionRepeatRobot : state.motionRepeat);
        const available = !state.olp.enabled;
        button.classList.toggle('active', available && enabled);
        button.setAttribute('aria-pressed', String(available && enabled));
        button.setAttribute('aria-label', uiText(reverse
            ? (robotScope ? '현재 로봇 역순 반복' : '체크 로봇 역순 반복')
            : (robotScope ? '현재 로봇 반복 실행' : '체크 로봇 반복 실행')));
        button.disabled = !available;
        button.title = uiText(reverse
            ? (enabled ? '역순 반복 켜짐' : '역순 반복 꺼짐')
            : (enabled ? '반복 실행 켜짐' : '반복 실행 꺼짐'));
    });
}

function updateMotionUiLock() {
    const locked = isMotionActive();
    const sceneLocked = isRobotMotionActive();
    // Model selection stays available while motion is running so Add Mode can
    // load another robot in the background. Replacing the active scene is
    // still rejected by loadModelFromServer.
    if (el.modelSelect) el.modelSelect.disabled = false;
    // A controller connection only locks robot-control actions. Standalone
    // model import and the model tree remain usable while controller samples
    // are streaming.
    if (el.btnImport3D) el.btnImport3D.disabled = sceneLocked;
    if (el.btnAddMode) el.btnAddMode.disabled = false;
    if (el.modelTree) el.modelTree.classList.toggle('motion-locked', sceneLocked);
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
    el.programRepeatButtons.forEach((button) => { button.disabled = Boolean(state.olp.enabled); });
    if (locked) {
        setTransformHandlesEnabled(false);
        setBaseJogGizmoEnabled(false);
    }
    refreshTcpProfileUi();
    updateTcpSnapUi();
    updateSimulationSnapButton();
    updateHistoryButtons();
}

function getWorkspaceObjectPath(root, object) {
    if (!root || !object) return null;
    if (root === object) return [];
    const path = [];
    let cursor = object;
    while (cursor && cursor !== root) {
        const parent = cursor.parent;
        if (!parent) return null;
        const index = parent.children.indexOf(cursor);
        if (index < 0) return null;
        path.unshift(index);
        cursor = parent;
    }
    return cursor === root ? path : null;
}

function getWorkspaceObjectAtPath(root, path) {
    if (!root || !Array.isArray(path)) return null;
    return path.reduce((object, index) => (
        object && Number.isInteger(index) ? object.children[index] || null : null
    ), root);
}

function captureWorkspaceChildMatrices(model) {
    return [...(model?.children || [])].map((child, index) => {
        if (child.matrixAutoUpdate !== false) child.updateMatrix();
        return {
            index,
            matrix: child.matrix.toArray(),
            matrixAutoUpdate: child.matrixAutoUpdate !== false
        };
    });
}

function applyWorkspaceChildMatrices(model, records) {
    (Array.isArray(records) ? records : []).forEach((record) => {
        const child = model?.children?.[Number(record?.index)];
        if (!child || !Array.isArray(record.matrix) || record.matrix.length !== 16) return;
        child.matrix.fromArray(record.matrix);
        if (record.matrixAutoUpdate === false) {
            child.matrixAutoUpdate = false;
            child.matrixWorldNeedsUpdate = true;
        } else {
            child.matrix.decompose(child.position, child.quaternion, child.scale);
            child.matrixAutoUpdate = true;
        }
    });
    model?.updateMatrixWorld?.(true);
}

function getWorkspaceMaterialColor(material, mesh) {
    const partBaseline = mesh?.userData?.modelPartMaterials
        ?.find((entry) => entry.material === material)?.color;
    const collisionBaseline = state.collision.highlightedMaterials.get(material)?.color;
    const color = partBaseline || collisionBaseline || material?.color;
    return color?.isColor ? color.getHexString() : null;
}

function captureWorkspaceMaterialColors(model) {
    const records = [];
    model?.traverse?.((object) => {
        if (!object.isMesh || object.userData?.collisionDebugMesh || object.userData?.simulationSnapFaceOverlay) return;
        const path = getWorkspaceObjectPath(model, object);
        if (!path) return;
        records.push({
            path,
            colors: getMeshMaterials(object).map((material) => getWorkspaceMaterialColor(material, object))
        });
    });
    return records;
}

function applyWorkspaceMaterialColors(model, records) {
    (Array.isArray(records) ? records : []).forEach((record) => {
        const mesh = getWorkspaceObjectAtPath(model, record?.path);
        if (!mesh?.isMesh || !Array.isArray(record.colors)) return;
        ensureModelPartMaterialIsolation(mesh);
        getMeshMaterials(mesh).forEach((material, index) => {
            const colorHex = record.colors[index];
            if (!material?.color || typeof colorHex !== 'string' || !/^[0-9a-f]{6}$/i.test(colorHex)) return;
            material.color.setHex(Number.parseInt(colorHex, 16));
            material.needsUpdate = true;
            mesh.userData.modelPartMaterials?.forEach((entry) => {
                if (entry.material === material && entry.color) entry.color.copy(material.color);
            });
        });
    });
}

function captureWorkspacePartState(model) {
    return getImportedModelParts(model).map((part, index) => ({
        index,
        visible: part.visible !== false
    }));
}

function applyWorkspacePartState(model, records) {
    const parts = getImportedModelParts(model);
    (Array.isArray(records) ? records : []).forEach((record) => {
        const part = parts[Number(record?.index)];
        if (part) part.visible = record.visible !== false;
    });
}

function getWorkspaceCatalogKey(model) {
    if (typeof model?.userData?.workspaceCatalogKey === 'string' && model.userData.workspaceCatalogKey) {
        return model.userData.workspaceCatalogKey;
    }
    return [...state.catalog.entries()].find(([, definition]) => (
        definition.type !== 'articulated-stl'
        && (definition.name === model?.userData?.modelName || definition.file === model?.userData?.modelName)
    ))?.[0] || null;
}

function serializeWorkspaceSceneModel(model) {
    const workspaceModelId = ensureWorkspaceModelId(model);
    const transform = captureClipboardTransform(model);
    if (model.userData.uploaded) {
        return {
            kind: 'uploaded',
            workspaceModelId,
            assetId: model.userData.workspaceAssetId || null,
            name: model.userData.modelName || model.name || '',
            placement: model.userData.placement === 'tcp' ? 'tcp' : 'scene',
            hostRobotInstanceId: model.userData.attachmentHost?.userData?.motionInstanceId || null,
            transform,
            sourceExtension: model.userData.sourceExtension || '',
            sourceUnit: model.userData.sourceUnit || 'mm',
            sourceUpAxis: model.userData.sourceUpAxis || '',
            sourceFileSize: Number(model.userData.sourceFileSize) || 0,
            importQuality: model.userData.importQuality || 'auto',
            largeModelMode: Boolean(model.userData.largeModelMode),
            testModel: Boolean(model.userData.testModel),
            sceneModelAnchor: model.userData.sceneModelAnchor || '',
            childMatrices: captureWorkspaceChildMatrices(model),
            partState: captureWorkspacePartState(model),
            materialColors: captureWorkspaceMaterialColors(model)
        };
    }
    return {
        kind: 'catalog',
        workspaceModelId,
        catalogKey: getWorkspaceCatalogKey(model),
        name: model.userData.modelName || model.name || '',
        transform
    };
}

function serializeWorkspaceOlpProject() {
    const project = state.olp.project;
    if (!project?.files) return null;
    return {
        schemaVersion: 1,
        name: String(project.name || 'OLP Project'),
        programPath: project.programPath || null,
        selectedFile: state.olp.selectedFile || '',
        enabled: Boolean(state.olp.enabled),
        projectDirty: Boolean(state.olp.projectDirty),
        files: [...project.files.values()].map((record) => ({
            path: String(record.path || ''),
            binary: Boolean(record.binary),
            text: record.binary ? null : String(record.text ?? ''),
            assetId: record.binary ? (record.workspaceAssetId || null) : null,
            name: String(record.file?.name || record.path?.split('/').at(-1) || ''),
            type: String(record.file?.type || (record.binary ? 'application/octet-stream' : 'text/plain')),
            size: Math.max(0, Number(record.file?.size) || 0),
            lastModified: Math.max(0, Number(record.file?.lastModified) || 0)
        }))
    };
}

function serializeWorkspaceSnapshot() {
    flushOlpPendingEdit();
    const robots = getArticulatedRobots();
    state.models.forEach(ensureWorkspaceModelId);
    const sceneModels = state.models
        .filter((model) => !robots.includes(model))
        .map(serializeWorkspaceSceneModel);
    const selectedPartIndex = state.selectedModel
        ? getImportedModelParts(state.selectedModel).indexOf(state.selectedModelPart)
        : -1;
    const motionProject = serializeMotionProject();
    const cameraChanged = state.camera && state.controls && (
        state.camera.position.distanceToSquared(new THREE.Vector3(1400, -1400, 1000)) > 1e-8
        || state.controls.target.lengthSq() > 1e-8
        || state.camera.up.distanceToSquared(new THREE.Vector3(0, 0, 1)) > 1e-8
        || Math.abs((Number(state.camera.zoom) || 1) - 1) > 1e-8
    );
    const interferenceChanged = JSON.stringify(state.interferenceZones)
        !== JSON.stringify(normalizeInterferenceZones());
    const monitoringChanged = JSON.stringify(state.endMonitoringObjects)
        !== JSON.stringify(normalizeEndMonitoringObjects());
    const olpProject = serializeWorkspaceOlpProject();
    const hasWork = state.models.length > 0
        || Boolean(olpProject)
        || state.viewPresets.some(Boolean)
        || state.grid?.visible === false
        || state.outlineMode
        || !state.collision.enabled
        || cameraChanged
        || interferenceChanged
        || monitoringChanged;
    return {
        schemaVersion: 1,
        hasWork,
        motionProject,
        robotRuntime: robots.map((robot) => ({
            instanceId: robot.userData.motionInstanceId,
            workspaceModelId: ensureWorkspaceModelId(robot),
            jointAngles: robot.userData.joints.map((joint) => Number(joint.angle) || 0)
        })),
        programSelection: robots.map((robot) => ({
            instanceId: robot.userData.motionInstanceId,
            selectedStepId: ensureMotionProgram(robot).selectedStepId || null
        })),
        importedModels: sceneModels.filter((model) => model.kind === 'uploaded'),
        catalogModels: sceneModels.filter((model) => model.kind === 'catalog'),
        olpProject,
        assetIds: [...new Set([
            ...sceneModels
                .filter((model) => model.kind === 'uploaded' && model.assetId)
                .map((model) => model.assetId),
            ...(olpProject?.files || [])
                .filter((file) => file.binary && file.assetId)
                .map((file) => file.assetId)
        ])],
        selection: {
            selectedModelId: state.selectedModel ? ensureWorkspaceModelId(state.selectedModel) : null,
            selectedPartIndex: selectedPartIndex >= 0 ? selectedPartIndex : null,
            activeRobotInstanceId: state.activeArticulatedModel?.userData?.motionInstanceId || null,
            activeProgramRobotInstanceId: state.activeProgramRobot?.userData?.motionInstanceId || null
        },
        camera: state.camera && state.controls ? {
            position: state.camera.position.toArray(),
            target: state.controls.target.toArray(),
            up: state.camera.up.toArray(),
            zoom: Number.isFinite(state.camera.zoom) ? state.camera.zoom : 1
        } : null,
        display: {
            gridVisible: state.grid?.visible !== false,
            outlineMode: Boolean(state.outlineMode),
            collisionEnabled: Boolean(state.collision.enabled)
        },
        viewConfiguration: serializeViewConfiguration(),
        collapsedModelIds: state.models
            .filter((model) => state.modelTreeCollapsedIds.has(ensureModelTreeId(model)))
            .map((model) => ensureWorkspaceModelId(model))
    };
}

function serializeMotionProject() {
    return {
        schemaVersion: MOTION_PROJECT_SCHEMA_VERSION,
        repeatCurrentRobot: state.motionRepeatRobot,
        repeat: state.motionRepeat,
        reverseRepeatCurrentRobot: state.motionReverseRepeatRobot,
        reverseRepeat: state.motionReverseRepeat,
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
                            : step.motion === 'VIEW'
                                ? { viewSlot: step.viewSlot }
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

async function persistImportedWorkspaceAsset(file, extension = getFileExtension(file?.name)) {
    const recovery = state.workspaceRecovery;
    if (!file || !recovery.db || !recovery.ready || recovery.restoring) {
        throw new Error('Workspace recovery storage is not ready.');
    }
    try { await navigator.storage?.persist?.(); } catch { }
    try {
        const estimate = await navigator.storage?.estimate?.();
        const remaining = Number(estimate?.quota) - Number(estimate?.usage);
        const required = Number(file.size) * 1.1 + (8 * MEBIBYTE);
        if (Number.isFinite(remaining) && remaining < required) {
            throw new DOMException('Workspace storage quota is insufficient.', 'QuotaExceededError');
        }
    } catch (error) {
        if (WorkspaceRecovery.isWorkspaceQuotaError(error)) throw error;
        console.warn('Workspace storage capacity could not be estimated:', error);
    }
    const assetId = WorkspaceRecovery.createWorkspaceId('asset');
    const blob = typeof file.slice === 'function'
        ? file.slice(0, file.size, file.type || '')
        : file;
    const asset = await recovery.db.putAsset({
        id: assetId,
        name: file.name,
        type: file.type || blob.type || '',
        size: file.size,
        lastModified: file.lastModified || Date.now(),
        extension,
        blob
    });
    return asset.id;
}

function clearSceneForWorkspaceRestore() {
    if (state.zeroPointEdit.active) exitZeroPointEditor();
    setTransformHandlesEnabled(false);
    setBaseJogGizmoEnabled(false);
    invalidateSimulationSnapCandidates();
    state.models.forEach((model) => {
        disposeCollisionDebugForModel(model);
        disposeModelOutlines(model);
        model.removeFromParent();
    });
    state.models = [];
    state.motionPrograms.clear();
    state.motionSessions.clear();
    state.selectedModel = null;
    state.selectedModelPart = null;
    state.activeArticulatedModel = null;
    state.activeProgramRobot = null;
    state.modelTreeCollapsedIds.clear();
    markSceneCollisionDirty();
}

function restoreWorkspaceViewConfiguration(configuration) {
    state.viewPresets = Array.from({ length: VIEW_PRESET_COUNT }, () => null);
    const presets = Array.isArray(configuration) ? configuration : configuration?.viewPresets;
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
    state.activeViewSlot = null;
    refreshViewPresetsUi();
}

function applyWorkspaceDisplayState(snapshot) {
    const display = snapshot?.display || {};
    const gridVisible = display.gridVisible !== false;
    if (state.grid) state.grid.visible = gridVisible;
    if (state.baseAxes) state.baseAxes.visible = gridVisible;
    state.labels.forEach((label) => { label.visible = gridVisible; });
    el.btnToggleGrid?.classList.toggle('active', gridVisible);
    state.collision.enabled = display.collisionEnabled !== false;
    clearCollisionStopNotice();
    updateCollisionUi();
    setModelOutlineMode(Boolean(display.outlineMode));
}

function applyWorkspaceCameraState(cameraState) {
    if (!state.camera || !state.controls || !cameraState) return;
    if (Array.isArray(cameraState.position) && cameraState.position.length === 3) {
        state.camera.position.fromArray(cameraState.position);
    }
    if (Array.isArray(cameraState.target) && cameraState.target.length === 3) {
        state.controls.target.fromArray(cameraState.target);
    }
    if (Array.isArray(cameraState.up) && cameraState.up.length === 3) {
        state.camera.up.fromArray(cameraState.up);
    }
    if (Number.isFinite(Number(cameraState.zoom)) && Number(cameraState.zoom) > 0) {
        state.camera.zoom = Number(cameraState.zoom);
        state.camera.updateProjectionMatrix();
    }
    state.camera.lookAt(state.controls.target);
    state.controls.update();
}

function findWorkspaceCatalogDefinition(entry) {
    const direct = state.catalog.get(entry?.catalogKey);
    if (direct?.type !== 'articulated-stl') return direct;
    return [...state.catalog.values()].find((definition) => (
        definition.type !== 'articulated-stl'
        && (definition.name === entry?.name || definition.file === entry?.catalogKey)
    )) || null;
}

async function restoreWorkspaceCatalogModel(entry) {
    const definition = findWorkspaceCatalogDefinition(entry);
    if (!definition) throw new Error(`Catalog model is unavailable: ${entry?.name || entry?.catalogKey || ''}`);
    return loadModelFromServer(definition, {
        forceAddMode: true,
        suppressHistory: true,
        suppressFit: true,
        preserveActive: true,
        preserveSelection: true,
        throwOnError: true,
        transform: entry.transform,
        workspaceModelId: entry.workspaceModelId
    });
}

async function restoreWorkspaceImportedModel(entry, robotsById) {
    const asset = await state.workspaceRecovery.db.getAsset(entry.assetId, { touch: true });
    if (!asset?.blob) throw new Error(`Imported source asset is unavailable: ${entry?.name || entry?.assetId || ''}`);
    const attachmentRobot = entry.placement === 'tcp'
        ? robotsById.get(entry.hostRobotInstanceId) || null
        : null;
    if (entry.placement === 'tcp' && !attachmentRobot) {
        throw new Error(`Tool attachment robot is unavailable: ${entry.hostRobotInstanceId || entry.name || ''}`);
    }
    const file = new File([asset.blob], asset.name, {
        type: asset.type || asset.blob.type || '',
        lastModified: asset.lastModified || Date.now()
    });
    const model = await handle3DImport({
        file,
        placement: entry.placement,
        attachmentRobot,
        importQuality: entry.importQuality,
        workspaceAssetId: asset.id,
        workspaceModelId: entry.workspaceModelId,
        transform: entry.transform,
        testModel: Boolean(entry.testModel),
        skipAssetPersistence: true,
        suppressHistory: true,
        suppressFit: true,
        preserveSelection: true,
        suppressSuccessStatus: true,
        suppressErrorAlert: true,
        throwOnError: true
    });
    if (!model) throw new Error(`Imported model could not be restored: ${entry.name || asset.name}`);
    model.userData.sourceUnit = entry.sourceUnit || model.userData.sourceUnit;
    model.userData.sourceUpAxis = entry.sourceUpAxis || model.userData.sourceUpAxis;
    model.userData.sceneModelAnchor = entry.sceneModelAnchor || model.userData.sceneModelAnchor;
    applyWorkspaceChildMatrices(model, entry.childMatrices);
    applyWorkspacePartState(model, entry.partState);
    applyWorkspaceMaterialColors(model, entry.materialColors);
    return model;
}

function createWorkspaceOlpFileWrapper(entry, blob, { prefixRoot = true } = {}) {
    const path = String(entry?.path || '').replaceAll('\\', '/');
    const name = String(entry?.name || path.split('/').at(-1) || 'olp-file');
    const content = blob instanceof Blob ? blob : new Blob([String(entry?.text ?? '')], {
        type: entry?.type || 'text/plain'
    });
    return {
        name,
        type: String(entry?.type || content.type || ''),
        size: content.size,
        lastModified: Math.max(0, Number(entry?.lastModified) || 0),
        relativePath: prefixRoot ? `__workspace__/${path}` : path,
        text: () => content.text(),
        arrayBuffer: () => content.arrayBuffer()
    };
}

async function restoreWorkspaceOlpProject(snapshot) {
    if (!snapshot || !Array.isArray(snapshot.files) || !snapshot.files.length) return [];
    if (Number(snapshot.schemaVersion || 1) !== 1) throw new Error('Unsupported saved OLP project schema.');
    const warnings = [];
    const validationFiles = snapshot.files.map((entry) => createWorkspaceOlpFileWrapper(entry,
        entry?.binary ? new Blob([], { type: entry?.type || 'application/octet-stream' }) : null,
        { prefixRoot: false }));
    validationFiles.forEach((file, index) => {
        if (snapshot.files[index]?.binary) file.size = Math.max(0, Number(snapshot.files[index]?.size) || 0);
    });
    validateOlpImportFiles(validationFiles);

    const files = [];
    for (const entry of snapshot.files) {
        if (!entry?.binary) {
            files.push(createWorkspaceOlpFileWrapper(entry, null));
            continue;
        }
        const asset = entry.assetId
            ? await state.workspaceRecovery.db.getAsset(entry.assetId, { touch: true })
            : null;
        if (!asset?.blob) {
            warnings.push(entry?.path || entry?.name || 'OLP binary');
            continue;
        }
        files.push(createWorkspaceOlpFileWrapper(entry, asset.blob));
    }
    if (!files.length) throw new Error('The saved OLP project has no recoverable files.');
    validateOlpImportFiles(files.map((file) => ({
        ...file,
        relativePath: String(file.relativePath || '').replace(/^__workspace__\//, '')
    })));
    const project = await buildOlpProjectFromFiles(files);
    const savedProgramPath = String(snapshot.programPath || '');
    project.programPath = project.programFiles.includes(savedProgramPath)
        ? savedProgramPath
        : project.programFiles.find((path) => /(^|\/)main\.pro$/i.test(path)) || project.programFiles[0] || null;
    if (snapshot.name) project.name = String(snapshot.name);
    project.files.forEach((record, path) => {
        const saved = snapshot.files.find((entry) => entry?.path === path);
        if (saved?.binary && saved.assetId) record.workspaceAssetId = saved.assetId;
    });
    activateOlpProject(project, {
        selectedFile: snapshot.selectedFile || '',
        enabled: snapshot.enabled !== false,
        dirty: Boolean(snapshot.projectDirty),
        connectBus: false
    });
    return warnings;
}

async function clearOlpProjectForWorkspaceRestore() {
    if (state.olp.projectEditTimer) {
        window.clearTimeout(state.olp.projectEditTimer);
        state.olp.projectEditTimer = null;
    }
    await stopOlpSession('Workspace changed', { closeBus: true });
    state.olp.project = null;
    state.olp.selectedFile = '';
    state.olp.projectDirty = false;
    state.olp.runtime = null;
    state.olp.execution = {
        phase: 'stopped', running: false, paused: false, filePath: '', lineNumber: 0,
        lineText: '', command: '', waitCondition: '', callStack: [], alarm: null
    };
    closeOlpPointContextMenu();
    toggleOlpWorkspace(false, { connectBus: false, saveWorkspace: false });
    renderOlpProjectUi();
    setOlpStatus('disconnected', '');
}

async function restoreWorkspaceSnapshot(snapshot) {
    const recovery = state.workspaceRecovery;
    const warnings = [];
    recovery.restoring = true;
    state.historySuspended = true;
    try {
        await clearOlpProjectForWorkspaceRestore();
        clearSceneForWorkspaceRestore();
        const motionProject = snapshot?.motionProject || {
            schemaVersion: MOTION_PROJECT_SCHEMA_VERSION,
            repeatCurrentRobot: false,
            repeat: false,
            reverseRepeatCurrentRobot: false,
            reverseRepeat: false,
            robots: []
        };
        await restoreMotionProjectData(motionProject);

        const robotsById = new Map(getArticulatedRobots().map((robot) => (
            [robot.userData.motionInstanceId, robot]
        )));
        (Array.isArray(snapshot?.robotRuntime) ? snapshot.robotRuntime : []).forEach((runtime) => {
            const robot = robotsById.get(runtime?.instanceId);
            if (!robot) return;
            ensureWorkspaceModelId(robot, runtime.workspaceModelId);
            if (Array.isArray(runtime.jointAngles)
                && runtime.jointAngles.length === robot.userData.joints.length) {
                restoreRobotJointAngles(robot, runtime.jointAngles);
                robot.updateMatrixWorld(true);
                captureCurrentTcpTarget(robot);
            }
        });
        (Array.isArray(snapshot?.programSelection) ? snapshot.programSelection : []).forEach((selection) => {
            const robot = robotsById.get(selection?.instanceId);
            const program = robot ? ensureMotionProgram(robot) : null;
            if (program?.steps.some((step) => step.id === selection?.selectedStepId)) {
                program.selectedStepId = selection.selectedStepId;
            }
        });

        for (const entry of Array.isArray(snapshot?.catalogModels) ? snapshot.catalogModels : []) {
            try {
                await restoreWorkspaceCatalogModel(entry);
            } catch (error) {
                console.warn('Workspace catalog model restore failed:', error);
                warnings.push(entry?.name || entry?.catalogKey || uiText('카탈로그 모델'));
            }
        }

        const importedModels = Array.isArray(snapshot?.importedModels) ? snapshot.importedModels : [];
        for (const entry of importedModels.filter((model) => model?.placement !== 'tcp')) {
            try {
                await restoreWorkspaceImportedModel(entry, robotsById);
            } catch (error) {
                console.warn('Workspace imported model restore failed:', error);
                warnings.push(entry?.name || uiText('3D 모델'));
            }
        }
        for (const entry of importedModels.filter((model) => model?.placement === 'tcp')) {
            try {
                await restoreWorkspaceImportedModel(entry, robotsById);
            } catch (error) {
                console.warn('Workspace tool restore failed:', error);
                warnings.push(entry?.name || uiText('Tool'));
            }
        }

        if (snapshot?.olpProject) {
            try {
                warnings.push(...await restoreWorkspaceOlpProject(snapshot.olpProject));
            } catch (error) {
                console.warn('Workspace OLP project restore failed:', error);
                warnings.push(snapshot.olpProject?.name || 'OLP Project');
            }
        }

        restoreWorkspaceViewConfiguration(snapshot?.viewConfiguration);
        applyWorkspaceDisplayState(snapshot);
        applyWorkspaceCameraState(snapshot?.camera);

        state.modelTreeCollapsedIds.clear();
        (Array.isArray(snapshot?.collapsedModelIds) ? snapshot.collapsedModelIds : []).forEach((modelId) => {
            const model = findModelByWorkspaceId(modelId);
            if (model) state.modelTreeCollapsedIds.add(ensureModelTreeId(model));
        });

        const selection = snapshot?.selection || {};
        const selectedModel = findModelByWorkspaceId(selection.selectedModelId);
        if (selectedModel && selection.selectedPartIndex !== null
            && selection.selectedPartIndex !== undefined
            && Number.isInteger(Number(selection.selectedPartIndex))) {
            const part = getImportedModelParts(selectedModel)[Number(selection.selectedPartIndex)];
            if (part) selectSceneModelPart(selectedModel, part);
            else selectSceneModel(selectedModel);
        } else {
            selectSceneModel(selectedModel || null);
        }
        state.activeArticulatedModel = robotsById.get(selection.activeRobotInstanceId)
            || getArticulatedRobots()[0]
            || null;
        state.activeProgramRobot = robotsById.get(selection.activeProgramRobotInstanceId)
            || state.activeArticulatedModel;
        if (state.activeArticulatedModel) renderJogControls(state.activeArticulatedModel);
        else hideJogPanel();
        if (state.olp.project) {
            syncOlpHomeStatus(state.activeProgramRobot || state.activeArticulatedModel);
        }

        state.undoStack = [];
        state.redoStack = [];
        updateHistoryButtons();
        updateUIStatus();
        renderModelTree();
        renderMotionProgramPanel();
        refreshCollisionDebugOverlays();
        markSceneCollisionDirty();
        checkSceneCollisions({ force: true });
        requestRender();
        return warnings;
    } finally {
        state.historySuspended = false;
        recovery.restoring = false;
        showLoading(false);
    }
}

function workspaceSnapshotHasWork(snapshot) {
    if (!snapshot || typeof snapshot !== 'object') return false;
    if (snapshot.hasWork === true) return true;
    if (Array.isArray(snapshot.olpProject?.files) && snapshot.olpProject.files.length > 0) return true;
    const summary = WorkspaceRecovery.getWorkspaceSummary({ state: snapshot });
    if (summary.robots > 0 || summary.models > 0) return true;
    if (snapshot.viewConfiguration?.viewPresets?.some(Boolean)) return true;
    if (snapshot.display?.gridVisible === false
        || snapshot.display?.outlineMode === true
        || snapshot.display?.collisionEnabled === false) return true;
    const project = snapshot.motionProject || {};
    const interferenceChanged = Array.isArray(project.interferenceZones)
        && JSON.stringify(normalizeInterferenceZones(project.interferenceZones))
            !== JSON.stringify(normalizeInterferenceZones());
    const monitoringChanged = Array.isArray(project.endMonitoringObjects)
        && JSON.stringify(normalizeEndMonitoringObjects(project.endMonitoringObjects))
            !== JSON.stringify(normalizeEndMonitoringObjects());
    return interferenceChanged || monitoringChanged;
}

function readSessionStorageValue(key) {
    try { return sessionStorage.getItem(key); } catch { return null; }
}

function writeSessionStorageValue(key, value) {
    try {
        if (value === null || value === undefined) sessionStorage.removeItem(key);
        else sessionStorage.setItem(key, String(value));
    } catch (error) {
        console.warn('Unable to update the workspace session pointer:', error);
    }
}

function createWorkspaceRecord(workspaceId, snapshot = {}, options = {}) {
    const now = Date.now();
    return WorkspaceRecovery.normalizeWorkspaceRecord({
        id: workspaceId,
        schemaVersion: WorkspaceRecovery.WORKSPACE_SCHEMA_VERSION,
        revision: Number(options.revision) || 0,
        createdAt: Number(options.createdAt) || now,
        updatedAt: Number(options.updatedAt) || now,
        forkedFrom: options.forkedFrom || null,
        incompleteRecoveryFrom: options.incompleteRecoveryFrom || null,
        archived: false,
        state: snapshot
    }, { now });
}

function resolveWorkspaceRecoveryChoice(choice) {
    const recovery = state.workspaceRecovery;
    const resolve = recovery.recoveryChoiceResolver;
    if (!resolve) return;
    recovery.recoveryChoiceResolver = null;
    resolve(choice === 'restore'
        ? { action: 'restore', workspaceId: recovery.selectedRecoveryWorkspaceId }
        : { action: 'new', workspaceId: null });
}

function showWorkspaceRecoveryError(message = '') {
    if (!el.workspaceRecoveryError) return;
    el.workspaceRecoveryError.textContent = message ? uiText(message) : '';
    el.workspaceRecoveryError.hidden = !message;
}

function formatWorkspaceRecoverySavedAt(record) {
    const language = document.documentElement.lang || navigator.language || 'ko';
    try {
        return new Intl.DateTimeFormat(language, {
            dateStyle: 'medium',
            timeStyle: 'short'
        }).format(new Date(record?.updatedAt || Date.now()));
    } catch {
        return new Date(record?.updatedAt || Date.now()).toLocaleString();
    }
}

function formatWorkspaceRecoverySummary(record) {
    const summary = WorkspaceRecovery.getWorkspaceSummary(record);
    const baseSummary = uiFormat('로봇 {robots}대 · 3D 모델 {models}개', summary);
    return summary.olpProjects > 0
        ? `${baseSummary} · ${uiFormat('OLP 프로젝트 {projects}개', { projects: summary.olpProjects })}`
        : baseSummary;
}

function getWorkspaceRecoveryDisplayName(record, number) {
    const stateSnapshot = record?.state || {};
    const primaryName = stateSnapshot.motionProject?.robots?.[0]?.displayName
        || stateSnapshot.importedModels?.[0]?.name
        || stateSnapshot.catalogModels?.[0]?.name
        || stateSnapshot.olpProject?.name
        || '';
    const numberedName = uiFormat('저장된 작업 {number}', { number });
    return primaryName ? `${numberedName} · ${primaryName}` : numberedName;
}

function updateWorkspaceRecoveryIsolationNote(isolatedCopy) {
    if (!el.workspaceRecoveryIsolationNote) return;
    const message = isolatedCopy
        ? '같은 작업이 다른 창에서 열려 있어 이 창은 독립된 복사본으로 시작합니다.'
        : '다른 창에서 연 작업은 독립된 복사본으로 저장되어 서로 덮어쓰지 않습니다.';
    const noteText = el.workspaceRecoveryIsolationNote.querySelector('span');
    if (noteText) noteText.textContent = uiText(message);
}

function renderWorkspaceRecoverySelection() {
    const recovery = state.workspaceRecovery;
    const selectedId = recovery.selectedRecoveryWorkspaceId;
    const selected = recovery.recoveryCandidates.find((candidate) => candidate.record.id === selectedId)
        || recovery.recoveryCandidates[0]
        || null;
    if (selected && selected.record.id !== selectedId) {
        recovery.selectedRecoveryWorkspaceId = selected.record.id;
    }
    el.workspaceRecoveryList?.querySelectorAll('.workspace-recovery-option').forEach((option) => {
        const input = option.querySelector('input[type="radio"]');
        option.classList.toggle('is-selected', Boolean(input?.checked));
    });
    updateWorkspaceRecoveryIsolationNote(Boolean(selected?.live));
    if (el.btnWorkspaceRestore) el.btnWorkspaceRestore.disabled = !selected;
}

function handleWorkspaceRecoverySelectionChange(event) {
    const input = event.target?.closest?.('input[name="workspace-recovery-source"]');
    if (!input) return;
    state.workspaceRecovery.selectedRecoveryWorkspaceId = input.value;
    renderWorkspaceRecoverySelection();
}

function renderWorkspaceRecoveryCandidates(candidates, preferredWorkspaceId = null) {
    const recovery = state.workspaceRecovery;
    recovery.recoveryCandidates = [...candidates];
    const preferred = candidates.some((candidate) => candidate.record.id === preferredWorkspaceId)
        ? preferredWorkspaceId
        : candidates[0]?.record?.id || null;
    recovery.selectedRecoveryWorkspaceId = preferred;
    const multiple = candidates.length > 1;
    if (el.workspaceRecoveryDescription) {
        el.workspaceRecoveryDescription.textContent = uiText(multiple
            ? '저장된 작업이 여러 개 있습니다. 불러올 작업을 선택하세요.'
            : '저장된 3D 시뮬레이션 작업이 있습니다. 불러오시겠습니까?');
    }
    if (el.workspaceRecoveryOptions) el.workspaceRecoveryOptions.hidden = !multiple;
    if (el.workspaceRecoveryDetails) el.workspaceRecoveryDetails.hidden = multiple;
    if (el.workspaceRecoveryList) el.workspaceRecoveryList.replaceChildren();

    const selected = candidates.find((candidate) => candidate.record.id === preferred)
        || candidates[0]
        || null;
    const singleIncomplete = Boolean(!multiple && selected?.incompleteFallback);
    el.workspaceRecoveryDetails?.classList.toggle('is-incomplete', singleIncomplete);
    if (el.btnWorkspaceRestore) {
        if (singleIncomplete) {
            el.btnWorkspaceRestore.setAttribute('aria-describedby', 'workspace-recovery-summary');
        } else {
            el.btnWorkspaceRestore.removeAttribute('aria-describedby');
        }
    }
    if (!multiple && selected) {
        if (el.workspaceRecoverySavedAt) {
            el.workspaceRecoverySavedAt.textContent = uiFormat('마지막 저장: {time}', {
                time: formatWorkspaceRecoverySavedAt(selected.record)
            });
        }
        if (el.workspaceRecoverySummary) {
            const summary = formatWorkspaceRecoverySummary(selected.record);
            el.workspaceRecoverySummary.textContent = selected.incompleteFallback
                ? `${summary} · ${uiText('일부만 복구된 작업')}`
                : summary;
        }
    }

    if (multiple && el.workspaceRecoveryList) {
        const fragment = document.createDocumentFragment();
        candidates.forEach((candidate, index) => {
            const number = index + 1;
            const option = document.createElement('label');
            option.className = 'workspace-recovery-option';
            const input = document.createElement('input');
            input.type = 'radio';
            input.name = 'workspace-recovery-source';
            input.value = candidate.record.id;
            input.checked = candidate.record.id === preferred;
            const metaId = `workspace-recovery-option-meta-${number}`;
            const summaryId = `workspace-recovery-option-summary-${number}`;
            input.setAttribute('aria-label', getWorkspaceRecoveryDisplayName(candidate.record, number));
            const content = document.createElement('span');
            content.className = 'workspace-recovery-option-content';
            const header = document.createElement('span');
            header.className = 'workspace-recovery-option-header';
            const title = document.createElement('span');
            title.className = 'workspace-recovery-option-title';
            title.textContent = getWorkspaceRecoveryDisplayName(candidate.record, number);
            header.append(title);
            const statusDescriptionIds = [];
            if (candidate.live) {
                const live = document.createElement('span');
                live.id = `workspace-recovery-option-live-${number}`;
                statusDescriptionIds.push(live.id);
                live.className = 'workspace-recovery-option-live';
                live.textContent = uiText('다른 창에서 열려 있음');
                header.append(live);
            }
            if (candidate.incompleteFallback) {
                const incomplete = document.createElement('span');
                incomplete.id = `workspace-recovery-option-incomplete-${number}`;
                statusDescriptionIds.push(incomplete.id);
                incomplete.className = 'workspace-recovery-option-incomplete';
                incomplete.textContent = uiText('일부만 복구된 작업');
                header.append(incomplete);
            }
            const meta = document.createElement('span');
            meta.id = metaId;
            meta.className = 'workspace-recovery-option-meta';
            meta.textContent = uiFormat('마지막 저장: {time}', {
                time: formatWorkspaceRecoverySavedAt(candidate.record)
            });
            const summary = document.createElement('span');
            summary.id = summaryId;
            summary.className = 'workspace-recovery-option-summary';
            summary.textContent = formatWorkspaceRecoverySummary(candidate.record);
            input.setAttribute('aria-describedby', [metaId, summaryId, ...statusDescriptionIds].join(' '));
            content.append(header, meta, summary);
            option.append(input, content);
            fragment.append(option);
        });
        el.workspaceRecoveryList.append(fragment);
    }
    renderWorkspaceRecoverySelection();
}

function requestWorkspaceRecoveryChoice(candidates, {
    preferredWorkspaceId = null,
    errorMessage = ''
} = {}) {
    renderWorkspaceRecoveryCandidates(candidates, preferredWorkspaceId);
    const selected = candidates.find((candidate) => (
        candidate.record.id === state.workspaceRecovery.selectedRecoveryWorkspaceId
    )) || candidates[0] || null;
    if (el.workspaceRecoverySavedAt) {
        // Keep the original single-record details populated for assistive
        // technology even while the multi-record fieldset is visible.
        if (selected && candidates.length > 1) {
            el.workspaceRecoverySavedAt.textContent = uiFormat('마지막 저장: {time}', {
                time: formatWorkspaceRecoverySavedAt(selected.record)
            });
        }
    }
    showWorkspaceRecoveryError(errorMessage);
    if (typeof el.workspaceRecoveryDialog?.showModal !== 'function') {
        const shouldRestore = window.confirm(uiText(candidates.length > 1
            ? '저장된 작업이 여러 개 있습니다. 불러올 작업을 선택하세요.'
            : '저장된 3D 시뮬레이션 작업이 있습니다. 불러오시겠습니까?'));
        if (!shouldRestore || !selected) {
            return Promise.resolve({ action: 'new', workspaceId: null });
        }
        if (candidates.length === 1 || typeof window.prompt !== 'function') {
            return Promise.resolve({ action: 'restore', workspaceId: selected.record.id });
        }
        const options = candidates.map((candidate, index) => (
            `${index + 1}. ${getWorkspaceRecoveryDisplayName(candidate.record, index + 1)}`
        )).join('\n');
        const answer = window.prompt(`${uiText('불러올 작업 선택')}\n${options}`, '1');
        if (answer === null) return Promise.resolve({ action: 'new', workspaceId: null });
        const index = Math.max(0, Math.min(candidates.length - 1, Math.trunc(Number(answer) || 1) - 1));
        return Promise.resolve({ action: 'restore', workspaceId: candidates[index].record.id });
    }
    if (!el.workspaceRecoveryDialog.open) el.workspaceRecoveryDialog.showModal();
    queueMicrotask(() => {
        el.workspaceRecoveryList?.querySelector('input[type="radio"]:checked')?.focus();
    });
    return new Promise((resolve) => {
        state.workspaceRecovery.recoveryChoiceResolver = resolve;
    });
}

function closeWorkspaceRecoveryDialog() {
    showWorkspaceRecoveryError('');
    if (el.workspaceRecoveryDialog?.open) el.workspaceRecoveryDialog.close();
}

function setupWorkspaceBroadcastChannel() {
    const recovery = state.workspaceRecovery;
    if (recovery.channel || typeof BroadcastChannel !== 'function') return;
    const channel = new BroadcastChannel(WORKSPACE_BROADCAST_CHANNEL);
    const listener = (event) => {
        const message = event.data;
        if (!message || message.senderId === recovery.ownerId) return;
        if (message.type === 'workspace-probe'
            && message.workspaceId === recovery.workspaceId
            && recovery.ownerId) {
            // Flush first so a duplicated tab receives the newest durable
            // snapshot when it forks this workspace.
            void Promise.resolve(saveMotionProjectNow()).catch((error) => {
                console.warn('Workspace probe flush failed:', error);
            }).finally(() => {
                channel.postMessage({
                    type: 'workspace-alive',
                    workspaceId: recovery.workspaceId,
                    probeId: message.probeId,
                    targetOwnerId: message.senderId,
                    senderId: recovery.ownerId,
                    revision: recovery.workspace?.revision || 0
                });
            });
            return;
        }
        if (message.type === 'workspace-alive'
            && message.targetOwnerId === recovery.ownerId) {
            const pending = recovery.pendingProbes.get(message.probeId);
            if (pending) pending({
                live: true,
                revision: Number.isInteger(Number(message.revision))
                    ? Number(message.revision)
                    : null
            });
        }
    };
    channel.addEventListener('message', listener);
    recovery.channel = channel;
    recovery.channelListener = listener;
}

function probeLiveWorkspaceOwner(workspaceId) {
    const recovery = state.workspaceRecovery;
    if (!workspaceId || !recovery.channel) {
        return Promise.resolve({ live: false, revision: null });
    }
    const probeId = WorkspaceRecovery.createWorkspaceId('probe');
    return new Promise((resolve) => {
        let settled = false;
        const finish = (result = {}) => {
            if (settled) return;
            settled = true;
            recovery.pendingProbes.delete(probeId);
            resolve({
                live: Boolean(result.live),
                revision: Number.isInteger(Number(result.revision))
                    ? Number(result.revision)
                    : null
            });
        };
        recovery.pendingProbes.set(probeId, finish);
        recovery.channel.postMessage({
            type: 'workspace-probe',
            workspaceId,
            probeId,
            senderId: recovery.ownerId
        });
        window.setTimeout(() => finish({ live: false, revision: null }), WORKSPACE_LIVE_PROBE_TIMEOUT_MS);
    });
}

async function claimWorkspaceLease(workspaceId, { force = false } = {}) {
    const recovery = state.workspaceRecovery;
    for (let attempt = 0; attempt < 3; attempt += 1) {
        const result = await recovery.db.acquireLease(workspaceId, recovery.ownerId, { force });
        if (result.acquired) return workspaceId;
        workspaceId = WorkspaceRecovery.createWorkspaceId('workspace');
        force = false;
    }
    throw new Error('Unable to claim an isolated simulation workspace.');
}

function startWorkspaceHeartbeat() {
    const recovery = state.workspaceRecovery;
    window.clearInterval(recovery.heartbeatTimer);
    recovery.heartbeatTimer = window.setInterval(() => {
        if ((!recovery.ready && !recovery.restoring)
            || recovery.unloading || !recovery.workspaceId) return;
        void recovery.db.renewLease(recovery.workspaceId, recovery.ownerId).catch((error) => {
            if (error?.code === 'WORKSPACE_LEASE_LOST') {
                if (recovery.ready || recovery.restoring) void forkWorkspaceAfterOwnershipLoss();
            }
            else console.warn('Workspace heartbeat failed:', error);
        });
        recovery.channel?.postMessage({
            type: 'workspace-heartbeat',
            workspaceId: recovery.workspaceId,
            senderId: recovery.ownerId,
            at: Date.now()
        });
    }, WORKSPACE_HEARTBEAT_INTERVAL_MS);
}

async function forkWorkspaceAfterOwnershipLoss() {
    const recovery = state.workspaceRecovery;
    if (recovery.ownershipTransition) return recovery.ownershipTransition;
    recovery.ownershipTransition = (async () => {
        const previousId = recovery.workspaceId;
        const workspaceId = await claimWorkspaceLease(WorkspaceRecovery.createWorkspaceId('workspace'));
        recovery.workspaceId = workspaceId;
        recovery.workspace = createWorkspaceRecord(workspaceId, serializeWorkspaceSnapshot(), {
            forkedFrom: previousId,
            incompleteRecoveryFrom: recovery.workspace?.incompleteRecoveryFrom || null
        });
        recovery.leaseLost = false;
        writeSessionStorageValue(WORKSPACE_SESSION_POINTER_KEY, workspaceId);
        setStatus('같은 작업이 다른 창에서 열려 있어 이 창은 독립된 복사본으로 시작합니다.', '#f59e0b');
        recovery.saveQueued = true;
        if (!recovery.saveInFlight) queueMicrotask(() => void runWorkspaceSaveLoop());
    })().finally(() => {
        recovery.ownershipTransition = null;
    });
    return recovery.ownershipTransition;
}

function clearLegacyWorkspaceStorageAfterCommit() {
    const recovery = state.workspaceRecovery;
    if (!recovery.legacyMigrationPending) return;
    try {
        const currentFingerprint = readLegacyWorkspaceFingerprint();
        if (recovery.legacyMigrationFingerprint
            && currentFingerprint !== recovery.legacyMigrationFingerprint) {
            // A legacy tab saved a newer snapshot while the picker was open.
            // Preserve it for the next explicit recovery choice.
            recovery.legacyMigrationPending = false;
            recovery.legacyMigrationFingerprint = null;
            return;
        }
        localStorage.removeItem(MOTION_PROJECT_STORAGE_KEY);
        localStorage.removeItem(VIEW_PRESETS_STORAGE_KEY);
        recovery.legacyMigrationPending = false;
        recovery.legacyMigrationFingerprint = null;
    } catch (error) {
        console.warn('Unable to finish legacy workspace migration:', error);
    }
}

async function runWorkspaceSaveLoop() {
    const recovery = state.workspaceRecovery;
    if (recovery.saveInFlight) {
        recovery.saveQueued = true;
        return recovery.saveInFlight;
    }
    recovery.saveInFlight = (async () => {
        do {
            recovery.saveQueued = false;
            if (!recovery.ready || recovery.restoring || recovery.unloading
                || state.resetInProgress || !recovery.workspaceId) return;
            const snapshot = serializeWorkspaceSnapshot();
            const previous = recovery.workspace || createWorkspaceRecord(recovery.workspaceId, snapshot);
            try {
                const saved = await recovery.db.saveWorkspaceWithLease({
                    ...previous,
                    id: recovery.workspaceId,
                    state: snapshot
                }, {
                    ownerId: recovery.ownerId,
                    expectedRevision: previous.revision
                });
                recovery.workspace = saved;
                clearLegacyWorkspaceStorageAfterCommit();
            } catch (error) {
                if (error?.code === 'WORKSPACE_LEASE_LOST'
                    || error?.code === 'WORKSPACE_REVISION_CONFLICT') {
                    await forkWorkspaceAfterOwnershipLoss();
                    recovery.saveQueued = true;
                    continue;
                }
                recovery.startupWarning = true;
                console.warn('Workspace autosave failed:', error);
                setStatus(WorkspaceRecovery.isWorkspaceQuotaError(error)
                    ? '자동 복구 저장 공간이 부족합니다. 프로젝트를 파일로 저장해 주세요.'
                    : '작업을 자동 저장하지 못했습니다.', '#ef4444');
            }
        } while (recovery.saveQueued);
    })().finally(() => {
        recovery.saveInFlight = null;
    });
    return recovery.saveInFlight;
}

async function findWorkspaceRecoveryCandidates(records, { sessionWorkspaceId = null } = {}) {
    const eligible = records.filter((record) => (
        record && !record.archived && workspaceSnapshotHasWork(record.state)
    ));
    const collapsed = WorkspaceRecovery.collapseWorkspaceRecoveryRecords(eligible, { sessionWorkspaceId });
    const candidates = await Promise.all(collapsed.map(async (candidate) => {
        const [probe, lease] = await Promise.all([
            probeLiveWorkspaceOwner(candidate.record.id),
            state.workspaceRecovery.db.getLease(candidate.record.id)
        ]);
        const leased = Boolean(lease && Number(lease.expiresAt) > Date.now()
            && lease.ownerId !== state.workspaceRecovery.ownerId);
        return {
            ...candidate,
            live: probe.live || leased,
            respondingOwner: probe.live,
            leased,
            observedRevision: probe.revision
        };
    }));
    return candidates;
}

async function waitForWorkspaceRecoveryRevision(workspaceId, minimumRevision = null) {
    let record = await state.workspaceRecovery.db.getWorkspace(workspaceId);
    if (!record || minimumRevision === null || record.revision >= minimumRevision) return record;
    for (let attempt = 0; attempt < 10; attempt += 1) {
        await new Promise((resolve) => window.setTimeout(resolve, 100));
        const refreshed = await state.workspaceRecovery.db.getWorkspace(workspaceId);
        if (refreshed) record = refreshed;
        if (!record || record.revision >= minimumRevision) break;
    }
    return record;
}

async function refreshWorkspaceRecoveryCandidate(candidate) {
    if (candidate.legacy) {
        const latest = readLegacyWorkspaceCandidate();
        if (!latest) {
            const error = new Error('The selected legacy workspace is no longer available.');
            error.code = 'WORKSPACE_NOT_FOUND';
            throw error;
        }
        return { ...candidate, record: latest, live: false };
    }
    let record = await state.workspaceRecovery.db.getWorkspace(candidate.record.id);
    if (!record || record.archived || !workspaceSnapshotHasWork(record.state)) {
        const error = new Error('The selected workspace is no longer available.');
        error.code = 'WORKSPACE_NOT_FOUND';
        throw error;
    }
    const [probe, lease] = await Promise.all([
        probeLiveWorkspaceOwner(record.id),
        state.workspaceRecovery.db.getLease(record.id)
    ]);
    if (probe.revision !== null && probe.revision > record.revision) {
        record = await waitForWorkspaceRecoveryRevision(record.id, probe.revision);
    } else {
        record = await state.workspaceRecovery.db.getWorkspace(record.id) || record;
    }
    if (!record || record.archived || !workspaceSnapshotHasWork(record.state)) {
        const error = new Error('The selected workspace is no longer available.');
        error.code = 'WORKSPACE_NOT_FOUND';
        throw error;
    }
    return {
        ...candidate,
        record,
        live: probe.live || Boolean(lease && Number(lease.expiresAt) > Date.now()
            && lease.ownerId !== state.workspaceRecovery.ownerId),
        respondingOwner: probe.live,
        leased: Boolean(lease && Number(lease.expiresAt) > Date.now()
            && lease.ownerId !== state.workspaceRecovery.ownerId),
        observedRevision: probe.revision
    };
}

function readLegacyWorkspaceCandidate() {
    let motionProject = null;
    let viewConfiguration = null;
    let motionRaw = '';
    let viewRaw = '';
    try {
        motionRaw = localStorage.getItem(MOTION_PROJECT_STORAGE_KEY) || '';
        viewRaw = localStorage.getItem(VIEW_PRESETS_STORAGE_KEY) || '';
        if (motionRaw) motionProject = JSON.parse(motionRaw);
        if (viewRaw) viewConfiguration = JSON.parse(viewRaw);
        if (!motionRaw && !viewRaw) return null;
    } catch (error) {
        console.warn('Legacy simulation recovery data is invalid:', error);
        return null;
    }
    const snapshot = {
        schemaVersion: 1,
        motionProject: motionProject || {
            schemaVersion: MOTION_PROJECT_SCHEMA_VERSION,
            repeatCurrentRobot: false,
            repeat: false,
            reverseRepeatCurrentRobot: false,
            reverseRepeat: false,
            robots: []
        },
        robotRuntime: [],
        importedModels: [],
        catalogModels: [],
        assetIds: [],
        selection: {},
        camera: null,
        display: { gridVisible: true, outlineMode: false, collisionEnabled: true },
        viewConfiguration: viewConfiguration || { viewPresets: [] },
        collapsedModelIds: []
    };
    if (!workspaceSnapshotHasWork(snapshot)) return null;
    const record = createWorkspaceRecord(WorkspaceRecovery.createWorkspaceId('legacy'), snapshot, {
        updatedAt: Date.now()
    });
    record.legacyFingerprint = `${motionRaw}\u0000${viewRaw}`;
    return record;
}

function readLegacyWorkspaceFingerprint() {
    try {
        const motionRaw = localStorage.getItem(MOTION_PROJECT_STORAGE_KEY) || '';
        const viewRaw = localStorage.getItem(VIEW_PRESETS_STORAGE_KEY) || '';
        return `${motionRaw}\u0000${viewRaw}`;
    } catch {
        return null;
    }
}

async function resetCleanWorkspaceUiState() {
    await clearOlpProjectForWorkspaceRestore();
    clearSceneForWorkspaceRestore();
    state.motionRepeatRobot = false;
    state.motionRepeat = false;
    state.motionReverseRepeatRobot = false;
    state.motionReverseRepeat = false;
    state.interferenceZones = normalizeInterferenceZones();
    state.endMonitoringObjects = normalizeEndMonitoringObjects();
    syncMotionRepeatControl();
    state.viewPresets = Array.from({ length: VIEW_PRESET_COUNT }, () => null);
    state.activeViewSlot = null;
    refreshViewPresetsUi();
    applyWorkspaceDisplayState({
        display: { gridVisible: true, outlineMode: false, collisionEnabled: true }
    });
    updateUIStatus();
    renderMotionProgramPanel();
    fitCamera();
}

async function discoverWorkspaceRecoveryCandidates({ sessionWorkspaceId = null, startClean = false } = {}) {
    if (startClean) return [];
    const candidates = await findWorkspaceRecoveryCandidates(
        await state.workspaceRecovery.db.listWorkspaces(),
        { sessionWorkspaceId }
    );
    const legacy = readLegacyWorkspaceCandidate();
    if (legacy) {
        candidates.push({
            record: legacy,
            live: false,
            respondingOwner: false,
            leased: false,
            observedRevision: null,
            sessionMatch: false,
            incompleteFallback: false,
            memberIds: new Set([legacy.id]),
            legacy: true
        });
    }
    return candidates;
}

async function acquireSelectedWorkspaceRecovery(candidate) {
    const recovery = state.workspaceRecovery;
    let selected = await refreshWorkspaceRecoveryCandidate(candidate);
    let source = selected.record;
    const legacySource = selected.legacy ? source : null;
    let targetWorkspaceId = null;
    let sourceIsLive = Boolean(selected.live);

    if (selected.legacy || sourceIsLive) {
        targetWorkspaceId = await claimWorkspaceLease(WorkspaceRecovery.createWorkspaceId('workspace'));
    } else {
        const leaseResult = await recovery.db.acquireLease(source.id, recovery.ownerId);
        if (leaseResult.acquired) {
            targetWorkspaceId = source.id;
        } else {
            // Another window won the selection race. Refresh the durable source
            // that it owns, then restore into this document's isolated target.
            selected = await refreshWorkspaceRecoveryCandidate({ ...selected, live: true });
            source = selected.record;
            sourceIsLive = true;
            targetWorkspaceId = await claimWorkspaceLease(WorkspaceRecovery.createWorkspaceId('workspace'));
        }
    }

    try {
        if (!selected.legacy) {
            const latest = await state.workspaceRecovery.db.getWorkspace(source.id);
            if (!latest || latest.archived || !workspaceSnapshotHasWork(latest.state)) {
                const error = new Error('The selected workspace is no longer available.');
                error.code = 'WORKSPACE_NOT_FOUND';
                throw error;
            }
            source = latest;
        }
        return { source, sourceIsLive, legacySource, targetWorkspaceId };
    } catch (error) {
        if (targetWorkspaceId) {
            await recovery.db.releaseLease(targetWorkspaceId, recovery.ownerId).catch(() => {});
        }
        throw error;
    }
}

async function initializeWorkspaceRecovery() {
    const recovery = state.workspaceRecovery;
    recovery.ownerId = WorkspaceRecovery.createWorkspaceId('owner');
    recovery.db = new WorkspaceRecovery.WorkspaceRecoveryStore(window.indexedDB);
    setupWorkspaceBroadcastChannel();
    try {
        await recovery.db.open();
        try { await navigator.storage?.persist?.(); } catch { }
        const startClean = readSessionStorageValue(WORKSPACE_START_CLEAN_KEY) === '1';
        writeSessionStorageValue(WORKSPACE_START_CLEAN_KEY, null);
        const sessionWorkspaceId = readSessionStorageValue(WORKSPACE_SESSION_POINTER_KEY);
        let candidates = await discoverWorkspaceRecoveryCandidates({ sessionWorkspaceId, startClean });
        let preferredWorkspaceId = candidates.find((candidate) => candidate.sessionMatch)?.record.id
            || candidates[0]?.record.id
            || null;
        let source = null;
        let sourceIsLive = false;
        let legacySource = null;
        let restoreSelected = false;
        let restoreHadWarnings = false;
        let incompleteRecoverySourceId = null;
        let targetWorkspaceId = null;
        let errorMessage = '';

        while (candidates.length && !startClean) {
            const choice = await requestWorkspaceRecoveryChoice(candidates, {
                preferredWorkspaceId,
                errorMessage
            });
            if (choice.action === 'new') {
                break;
            }
            preferredWorkspaceId = choice.workspaceId;
            const candidate = candidates.find((entry) => entry.record.id === choice.workspaceId);
            if (!candidate) {
                errorMessage = '이전 작업을 불러오지 못했습니다.';
                candidates = await discoverWorkspaceRecoveryCandidates({ sessionWorkspaceId });
                continue;
            }
            closeWorkspaceRecoveryDialog();
            showLoading(true, uiText('이전 작업 불러오는 중...'));
            try {
                const prepared = await acquireSelectedWorkspaceRecovery(candidate);
                source = prepared.source;
                sourceIsLive = prepared.sourceIsLive;
                legacySource = prepared.legacySource;
                targetWorkspaceId = prepared.targetWorkspaceId;
                recovery.workspaceId = targetWorkspaceId;
                writeSessionStorageValue(WORKSPACE_SESSION_POINTER_KEY, targetWorkspaceId);
                recovery.legacyMigrationPending = Boolean(legacySource);
                recovery.legacyMigrationFingerprint = legacySource?.legacyFingerprint || null;
                startWorkspaceHeartbeat();
                const warnings = await restoreWorkspaceSnapshot(source.state);
                restoreSelected = true;
                if (warnings.length) {
                    restoreHadWarnings = true;
                    recovery.startupWarning = true;
                    setStatus('저장된 작업 파일 일부를 찾을 수 없어 이전 작업을 모두 복구하지 못했습니다.', '#f59e0b');
                } else if (source.incompleteRecoveryFrom) {
                    recovery.startupWarning = true;
                    setStatus('저장된 작업 파일 일부를 찾을 수 없어 이전 작업을 모두 복구하지 못했습니다.', '#f59e0b');
                }
                break;
            } catch (error) {
                console.error('Workspace restore failed:', error);
                showLoading(false);
                window.clearInterval(recovery.heartbeatTimer);
                recovery.heartbeatTimer = null;
                if (recovery.ownershipTransition) {
                    await recovery.ownershipTransition.catch(() => {});
                }
                const failedWorkspaceIds = new Set([
                    targetWorkspaceId,
                    recovery.workspaceId
                ].filter(Boolean));
                for (const workspaceId of failedWorkspaceIds) {
                    await recovery.db.releaseLease(workspaceId, recovery.ownerId).catch(() => {});
                }
                recovery.workspaceId = null;
                recovery.workspace = null;
                writeSessionStorageValue(WORKSPACE_SESSION_POINTER_KEY, null);
                source = null;
                sourceIsLive = false;
                legacySource = null;
                targetWorkspaceId = null;
                errorMessage = '이전 작업을 불러오지 못했습니다.';
                candidates = await discoverWorkspaceRecoveryCandidates({ sessionWorkspaceId });
                preferredWorkspaceId = candidates.some((entry) => entry.record.id === choice.workspaceId)
                    ? choice.workspaceId
                    : candidates[0]?.record.id || null;
            }
        }

        if (restoreSelected && restoreHadWarnings && source?.id === recovery.workspaceId) {
            // Keep an intact source untouched when a missing model asset causes
            // a partial restore. The incomplete result is stored separately.
            await recovery.db.releaseLease(recovery.workspaceId, recovery.ownerId);
            recovery.workspaceId = await claimWorkspaceLease(WorkspaceRecovery.createWorkspaceId('workspace'));
            targetWorkspaceId = recovery.workspaceId;
            writeSessionStorageValue(WORKSPACE_SESSION_POINTER_KEY, recovery.workspaceId);
        }
        if (restoreSelected && restoreHadWarnings && source?.id) {
            incompleteRecoverySourceId = source.id;
        }

        if (!restoreSelected) {
            closeWorkspaceRecoveryDialog();
            await resetCleanWorkspaceUiState();
            recovery.workspaceId = await claimWorkspaceLease(WorkspaceRecovery.createWorkspaceId('workspace'));
            targetWorkspaceId = recovery.workspaceId;
            writeSessionStorageValue(WORKSPACE_SESSION_POINTER_KEY, recovery.workspaceId);
            recovery.legacyMigrationPending = false;
            recovery.legacyMigrationFingerprint = null;
        }

        const reusingSourceRecord = Boolean(source && source.id === recovery.workspaceId);
        recovery.workspace = createWorkspaceRecord(recovery.workspaceId,
            restoreSelected ? source.state : serializeWorkspaceSnapshot(), {
                revision: reusingSourceRecord ? source.revision : 0,
                createdAt: reusingSourceRecord ? source.createdAt : Date.now(),
                updatedAt: Date.now(),
                forkedFrom: restoreSelected && source.id !== recovery.workspaceId ? source.id : null,
                incompleteRecoveryFrom: incompleteRecoverySourceId
                    || (restoreSelected ? source?.incompleteRecoveryFrom : null)
            });
        recovery.ready = true;
        startWorkspaceHeartbeat();
        await runWorkspaceSaveLoop();
        const targetWasCommitted = Number(recovery.workspace?.revision) > 0;
        if (targetWasCommitted && source && !sourceIsLive && !legacySource && !restoreHadWarnings
            && source.id !== recovery.workspaceId) {
            try {
                await recovery.db.archiveWorkspace(source.id, true, {
                    expectedRevision: source.revision,
                    requireUnleased: true
                });
            } catch (error) {
                console.warn('Unable to archive the migrated workspace source:', error);
            }
        }
        // Partial-recovery descendants stay durable and are collapsed behind
        // their intact source by the chooser. They are never auto-archived:
        // a throttled but live window may still own the only newer copy.
        void (async () => {
            await recovery.db.pruneArchivedWorkspaces({ keep: 1 });
            await recovery.db.deleteOrphanAssets({ gracePeriodMs: 600000 });
        })().catch((error) => {
            console.warn('Unable to clean old workspace recovery records:', error);
        });
        return recovery.startupWarning;
    } catch (error) {
        console.error('Workspace recovery initialization failed:', error);
        recovery.ready = false;
        recovery.startupWarning = true;
        renderMotionProgramPanel();
        setStatus('작업을 자동 저장하지 못했습니다.', '#ef4444');
        return true;
    }
}

function releaseWorkspaceOwnership({ releaseLease = true } = {}) {
    const recovery = state.workspaceRecovery;
    recovery.unloading = true;
    window.clearInterval(recovery.heartbeatTimer);
    recovery.heartbeatTimer = null;
    recovery.channel?.postMessage({
        type: 'workspace-goodbye',
        workspaceId: recovery.workspaceId,
        senderId: recovery.ownerId
    });
    if (releaseLease && recovery.workspaceId && recovery.ownerId) {
        void recovery.db?.releaseLease(recovery.workspaceId, recovery.ownerId).catch(() => {});
    }
    if (recovery.channel && recovery.channelListener) {
        recovery.channel.removeEventListener('message', recovery.channelListener);
    }
    recovery.channel?.close();
    recovery.channel = null;
}

function saveMotionProjectNow() {
    window.clearTimeout(state.motionSaveTimer);
    state.motionSaveTimer = null;
    if (IS_MANUAL_GUIDE_EMBED) return;
    return runWorkspaceSaveLoop();
}

function scheduleMotionProjectSave() {
    window.clearTimeout(state.motionSaveTimer);
    if (IS_MANUAL_GUIDE_EMBED) {
        state.motionSaveTimer = null;
        return;
    }
    if (state.workspaceRecovery.restoring || !state.workspaceRecovery.ready) {
        state.motionSaveTimer = null;
        return;
    }
    state.motionSaveTimer = window.setTimeout(() => void saveMotionProjectNow(), 180);
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
        if (state.collision.enabled) state.collision.system?.prepare([robot]);
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
    state.motionReverseRepeatRobot = project.reverseRepeatCurrentRobot;
    state.motionReverseRepeat = project.reverseRepeat;
    syncMotionRepeatControl();
    state.activeArticulatedModel = getArticulatedRobots()[0] || null;
    state.activeProgramRobot = state.activeArticulatedModel;
    if (state.activeArticulatedModel) {
        renderJogControls(state.activeArticulatedModel);
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

function importActiveProject() {
    if (state.olp.enabled) {
        if (isOlpRunning()) return;
        void importOlpFolderFromPicker();
        return;
    }
    el.inputProgramImport?.click();
}

async function saveActiveProject() {
    if (state.olp.enabled) {
        await saveOlpProjectAsZip();
        return;
    }
    await exportMotionProject();
}

async function saveStandalonePFile(content, suggestedName = 'P.pts') {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    if (typeof window.showSaveFilePicker === 'function') {
        const fileHandle = await window.showSaveFilePicker({
            id: 'inorobot-position-points',
            suggestedName,
            startIn: 'documents',
            excludeAcceptAllOption: true,
            types: [{
                description: 'InoRobot P.pts position file',
                accept: { 'text/plain': ['.pts'] }
            }]
        });
        const writable = await fileHandle.createWritable();
        await writable.write(blob);
        await writable.close();
        return fileHandle.name;
    }
    saveAs(blob, suggestedName);
    return suggestedName;
}

// Keep P.pts headers identical to 4_ProjectGenerator/generator.js DataPoints.
// This is intentionally locale-independent; browser/Windows locale must not
// change the controller's Korean 오전/오후 timestamp convention.
function formatProjectGeneratorPFileTime(date = new Date()) {
    const pad = (value) => String(value).padStart(2, '0');
    const hours = date.getHours();
    const meridiem = hours < 12 ? '오전' : '오후';
    const hour12 = hours % 12 || 12;
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${meridiem} ${hour12}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function getSelectedRobotProgramName() {
    const robot = state.activeProgramRobot || state.activeArticulatedModel;
    return robot?.userData?.robotName
        || robot?.userData?.modelName
        || state.olp.project?.projectInfo?.RobotName
        || 'SelectedRobot';
}

function normalizeExportedPFileContent(content, robotName = getSelectedRobotProgramName()) {
    const normalized = String(content ?? '').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
    const headerMatch = normalized.match(/^(?:[ \t]*\n)*[ \t]*ProgramInfo\b[\s\S]*?^[ \t]*EndProgramInfo\b[^\n]*(?:\n|$)/im);
    const body = (headerMatch ? normalized.slice(headerMatch[0].length) : normalized)
        .replace(/^\s+/, '')
        .trimEnd();
    const header = [
        'ProgramInfo',
        '    Version = "S4.24"',
        '    VRC = "V4R24"',
        `    Time = "${formatProjectGeneratorPFileTime()}"`,
        `    RobotName = "${robotName}"`,
        'EndProgramInfo'
    ].join('\r\n');
    // The robot controller accepts Windows text files only. Normalize both
    // the generated header and the imported point records to CRLF so an OLP
    // project originally stored with LF can still be exported directly.
    return `${header}\r\n${body ? `${body.replace(/\n/g, '\r\n')}\r\n` : ''}`;
}

async function exportPositionPoints() {
    if (state.olp.enabled && state.olp.project) {
        const pointFile = state.olp.project.pointFiles?.find((entry) => /(^|\/)P\.pts$/i.test(entry.path))
            || state.olp.project.pointFiles?.find((entry) => entry.kind === 'point');
        const record = pointFile ? state.olp.project.files?.get(pointFile.path) : null;
        if (!record || typeof record.text !== 'string') {
            setMotionProgramStatus('OLP 프로젝트에 P.pts 파일이 없습니다.', 'error');
            return;
        }
        try {
            const name = await saveStandalonePFile(
                normalizeExportedPFileContent(record.text),
                'P.pts'
            );
            setMotionProgramStatus('P.pts 내보내기 완료: {name}', '', { name });
            setStatus('P.pts 내보내기 완료', '#22c55e');
        } catch (error) {
            if (error?.name === 'AbortError') return;
            console.error('OLP P.pts export failed:', error);
            setMotionProgramStatus('P.pts 내보내기에 실패했습니다.', 'error');
            setStatus('P.pts 내보내기 실패', '#ef4444');
        }
        return;
    }
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

    const content = normalizeExportedPFileContent(
        `${points.map((step) => formatPositionPointRecord(robot, step)).join('\n')}\n`,
        getSelectedRobotProgramName()
    );
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    try {
        if (typeof window.showSaveFilePicker === 'function') {
            const fileHandle = await window.showSaveFilePicker({
                id: 'inorobot-position-points',
                suggestedName: 'P.pts',
                startIn: 'documents',
                excludeAcceptAllOption: true,
                types: [{
                    description: 'InoRobot P.pts position file',
                    accept: { 'text/plain': ['.pts'] }
                }]
            });
            const writable = await fileHandle.createWritable();
            await writable.write(blob);
            await writable.close();
            setMotionProgramStatus('P.pts 내보내기 완료: {name}', '', { name: fileHandle.name });
        } else {
            saveAs(blob, 'P.pts');
            setMotionProgramStatus('P.pts 내보내기 완료: {name}', '', { name: 'P.pts' });
        }
        setStatus('P.pts 내보내기 완료', '#22c55e');
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
            interferenceZones: normalizeInterferenceZones(rawProject.interferenceZones),
            endMonitoringObjects: normalizeEndMonitoringObjects(rawProject.endMonitoringObjects)
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

function preflightRobotMotion(robot, steps, { reverseRepeat = false, timerOnly = false } = {}) {
    if (!timerOnly && (!robot?.userData.joints?.length || !robot.userData.tcpFrame)) {
        throw new Error('This model does not provide articulated kinematics.');
    }
    if (!steps.length) throw new Error(`${robot.userData.motionDisplayName}: no motion points.`);
    const originalAngles = timerOnly ? null : robot.userData.joints.map((joint) => joint.angle);
    let timerAvailable = Number.isFinite(ensureMotionProgram(robot).cycleTimerStartedAt);
    const traversal = steps.map((step, cursor) => ({ step, cursor, direction: 1 }));
    if (reverseRepeat && steps.length > 1) {
        for (let cursor = steps.length - 2; cursor >= 0; cursor -= 1) {
            traversal.push({ step: steps[cursor], cursor, direction: -1 });
        }
    }

    const validateTimerAction = (action, step) => {
        if (action === 'TIME_START') {
            timerAvailable = true;
            return;
        }
        if (action === 'TIME_OUT') {
            if (!timerAvailable) throw new Error(`${step.name}: TIME START must run before TIME OUT.`);
            timerAvailable = false;
        }
    };

    try {
        traversal.forEach(({ step, cursor, direction }) => {
            const timerActions = getDirectionalTimerActions(step.motion, {
                cursor,
                direction,
                stepCount: steps.length,
                repeat: false,
                reverseRepeat
            });
            if (timerActions.length) {
                timerActions.forEach((action) => validateTimerAction(action, step));
                return;
            }
            if (timerOnly) return;
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
        if (originalAngles) restoreRobotJointAngles(robot, originalAngles);
    }
}

function createMotionSession(robot, steps, startAt, options = {}) {
    const controlScope = options.controlScope === 'robot' ? 'robot' : 'group';
    const reverseRepeat = options.reverseRepeat
        ?? (controlScope === 'robot' ? state.motionReverseRepeatRobot : state.motionReverseRepeat);
    return {
        robot,
        steps,
        cursor: 0,
        direction: 1,
        currentStepId: null,
        segment: null,
        startAt,
        nextSegmentStartAt: startAt,
        repeat: reverseRepeat
            ? false
            : (options.repeat ?? (controlScope === 'robot' ? state.motionRepeatRobot : state.motionRepeat)),
        reverseRepeat: Boolean(reverseRepeat),
        controlScope,
        stepIntoStepId: typeof options.stepIntoStepId === 'string' ? options.stepIntoStepId : null,
        status: 'running',
        pauseStarted: 0
    };
}

function startRobotMotionPlans(plans) {
    if (isMotionActive() || plans.length === 0) return;
    try {
        plans.forEach(({ robot, steps, reverseRepeat }) => preflightRobotMotion(robot, steps, { reverseRepeat }));
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
    plans.forEach(({ robot, steps, repeat, reverseRepeat, controlScope, stepIntoStepId }) => {
        const program = ensureMotionProgram(robot);
        program.status = 'running';
        program.progress = 0;
        state.motionSessions.set(robot.userData.motionInstanceId, createMotionSession(robot, steps, startAt, {
            repeat,
            reverseRepeat,
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
        reverseRepeat: false,
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

function runActiveProgramOrOlp() {
    if (state.olp.enabled) {
        void startOlpSession();
        return;
    }
    runActiveRobotProgram();
}

function stepActiveProgramOrOlp() {
    if (state.olp.enabled) {
        void startOlpSession({ step: true });
        return;
    }
    stepIntoActiveRobot();
}

function pauseActiveProgramOrOlp() {
    if (state.olp.enabled) {
        if (!state.olp.runtime) return;
        state.olp.runtime.togglePause();
        // Refresh the bottom-panel control state immediately on pause/resume.
        setOlpStatus('running');
        return;
    }
    pauseActiveRobotMotion();
}

function stopActiveProgramOrOlp() {
    if (state.olp.enabled) {
        void stopOlpSession('OLP stopped by user', { resetCursor: true });
        return;
    }
    stopActiveRobotMotion();
}

async function moveOlpToWorkOrigin() {
    if (state.olp.workOriginBusy || state.olp.manualMoveBusy) return;
    if (!state.olp.project) {
        setOlpStatus('error', 'Load a robot project folder before moving to Work Origin.');
        return;
    }
    if (isOlpRunning()) {
        setOlpStatus('error', 'Stop OLP before moving to Work Origin.');
        return;
    }
    if (state.virtualController.wanted) {
        setOlpStatus('error', 'Work Origin is unavailable while a controller is connected.');
        return;
    }

    state.olp.workOriginBusy = true;
    updateOlpProgramPanelUi();
    updateMotionUiLock();
    try {
        state.olp.execution = {
            ...state.olp.execution,
            phase: 'stopped',
            running: false,
            paused: false,
            filePath: state.olp.project.programPath,
            lineNumber: 1,
            lineText: 'Work Origin 0',
            command: 'HOME[0]',
            waitCondition: '',
            callStack: [],
            alarm: null
        };
        setOlpStatus('connected', 'Moving to Work Origin 0.');
        await runOlpHome(0, 100, state.olp.project, null);
        setOlpStatus('connected', 'Work Origin 0 reached.');
    } catch (error) {
        state.olp.execution = { ...state.olp.execution, phase: 'error', running: false, alarm: null };
        setOlpStatus('error', 'Work Origin move failed: {error}', { error: error?.message || error });
    } finally {
        state.olp.workOriginBusy = false;
        updateOlpProgramPanelUi();
        updateMotionUiLock();
        requestRender();
    }
}

function runActiveRobotProgram() {
    const robot = state.activeProgramRobot;
    if (robot && resumePausedRobotMotions([robot])) return;
    const program = ensureMotionProgram(robot);
    if (robot && program?.steps.length) startRobotMotionPlans([{
        robot,
        steps: program.steps,
        repeat: state.motionRepeatRobot,
        reverseRepeat: state.motionReverseRepeatRobot,
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
            reverseRepeat: state.motionReverseRepeat,
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

function motionSessionProgress(session, segmentProgress = 1) {
    const stepCount = Math.max(1, session.steps.length);
    const progress = THREE.MathUtils.clamp(Number(segmentProgress) || 0, 0, 1);
    return session.direction < 0
        ? THREE.MathUtils.clamp((session.cursor + 1 - progress) / stepCount, 0, 1)
        : THREE.MathUtils.clamp((session.cursor + progress) / stepCount, 0, 1);
}

function createMotionSegment(session, timestamp) {
    const { robot } = session;
    const step = session.steps[session.cursor];
    if (!step) return null;
    session.currentStepId = step.id;
    if (step.motion === 'TIME_START' || step.motion === 'TIME_OUT') {
        const timerActions = getDirectionalTimerActions(step.motion, {
            cursor: session.cursor,
            direction: session.direction,
            stepCount: session.steps.length,
            repeat: session.repeat,
            reverseRepeat: session.reverseRepeat
        });
        return {
            type: timerActions[0],
            timerActions,
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
        (segment.timerActions || [segment.type]).forEach((timerAction) => {
            if (timerAction === 'TIME_START') {
                program.cycleTimerStartedAt = markerTime;
                program.lastCycleTimeSeconds = null;
                return;
            }
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
        });
        program.progress = motionSessionProgress(session, 1);
        return true;
    }
    if (segment.type === 'VIEW') {
        applyViewPreset(segment.step.viewSlot, { announce: false });
        const program = ensureMotionProgram(robot);
        program.progress = motionSessionProgress(session, 1);
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
    program.progress = motionSessionProgress(session, linearProgress);
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
                const nextPlayback = advanceMotionCursor({
                    cursor: session.cursor,
                    direction: session.direction,
                    stepCount: session.steps.length,
                    repeat: session.repeat,
                    reverseRepeat: session.reverseRepeat
                });
                session.cursor = nextPlayback.cursor;
                session.direction = nextPlayback.direction;
                session.segment = null;
                session.currentStepId = null;
                renderNeeded = true;
                if (nextPlayback.completed) {
                    finishRobotMotionSession(session, 'completed', '{name} 완료.', {
                        name: session.robot.userData.motionDisplayName
                    });
                    return;
                }
                if (nextPlayback.boundary) {
                    ensureMotionProgram(session.robot).progress = motionSessionProgress(session, 0);
                    break;
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
    scheduleMotionProjectSave();
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
        const collisionGeometry = child.userData?.collisionGeometry;
        if (collisionGeometry && !cache.geometries.has(collisionGeometry)) {
            cache.geometries.add(collisionGeometry);
            collisionGeometry.dispose();
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

const SIMULATION_MANUAL_TIMELINE = Object.freeze({
    jog: [13000, 16000],
    snap: [41500, 44500],
    programPoseA: [49500, 51000],
    programPoseB: [53100, 54500]
});

function installSimulationManualGuide() {
    if (!IS_MANUAL_GUIDE_EMBED || window.InoRobotSimulationManual) return;

    const manual = {
        preparing: null,
        prepared: false,
        paused: true,
        cue: '',
        milestone: 'blank',
        snapshots: new Map(),
        robotCatalogKey: 'robot:IR-S4-40Z15',
        homeAngles: [],
        jogAngles: [],
        snapAngles: [],
        programPoseA: [],
        programPoseB: [],
        snapSelection: null,
        snapTarget: null
    };

    const waitForManualCondition = (test, timeout = 45000, interval = 80) => new Promise((resolve, reject) => {
        const started = performance.now();
        const poll = () => {
            let result = null;
            try { result = test(); } catch { result = null; }
            if (result) {
                resolve(result);
                return;
            }
            if (performance.now() - started >= timeout) {
                reject(new Error('3D Simulation manual preparation timed out.'));
                return;
            }
            window.setTimeout(poll, interval);
        };
        poll();
    });

    const activeManualRobot = () => state.activeArticulatedModel
        || getArticulatedRobots().find((robot) => robot.userData.motionModelFolder === 'IR-S4-40Z15')
        || getArticulatedRobots()[0]
        || null;

    const clampManualAngles = (robot, values) => (robot?.userData.joints || []).map((joint, index) => (
        THREE.MathUtils.clamp(
            Number.isFinite(Number(values[index])) ? Number(values[index]) : joint.angle,
            joint.definition.min,
            joint.definition.max
        )
    ));

    const setManualJointAngles = (values) => {
        const robot = activeManualRobot();
        if (!robot) return false;
        const angles = clampManualAngles(robot, values);
        angles.forEach((angle, index) => setJointAngle(robot.userData.joints[index], angle, false));
        robot.updateMatrixWorld(true);
        syncJointControls(robot);
        captureCurrentTcpTarget(robot);
        updateTcpPresentation(robot);
        requestRender();
        return true;
    };

    const captureManualMilestone = (name) => {
        manual.snapshots.set(name, captureSceneSnapshot());
        return manual.snapshots.get(name);
    };

    const closeManualDialogs = () => {
        if (el.testModelDialog?.open) el.testModelDialog.close();
        const importDialog = document.getElementById('import-3d-dialog');
        if (importDialog?.open) importDialog.close();
        showLoading(false);
    };

    const clearManualSnapUi = () => {
        state.snapMoveMode = false;
        clearSimulationSnapFaceSelection();
        hideSimulationSnapMarker();
        resetSimulationSnapMarkerCameraScale();
        updateSimulationSnapButton();
    };

    const applyManualMilestone = (name, { fit = true } = {}) => {
        const snapshot = manual.snapshots.get(name);
        if (!snapshot) return false;
        stopRobotMotions(getArticulatedRobots());
        closeManualDialogs();
        clearManualSnapUi();
        applySceneSnapshot(snapshot);
        manual.milestone = name;
        if (el.modelSelect) el.modelSelect.value = name === 'blank' ? '' : manual.robotCatalogKey;
        if (fit && state.models.length) fitCamera();
        requestRender();
        return true;
    };

    const manualFaceEntries = (model) => {
        const entries = [];
        model?.updateMatrixWorld(true);
        model?.traverse((mesh) => {
            const position = mesh.isMesh ? mesh.geometry?.getAttribute('position') : null;
            if (!position) return;
            mesh.updateWorldMatrix?.(true, false);
            const faces = getValidatedStepBrepFaces(mesh)
                || Array.from({ length: Math.min(80, Math.floor((mesh.geometry.index?.count || position.count) / 3)) }, (_, index) => ({ first: index, last: index }));
            faces.forEach((face, faceIndex) => {
                const triangleIndex = Number(face.first);
                const indices = getSimulationSnapTriangleVertexIndices(mesh.geometry, triangleIndex);
                if (indices.some((index) => !Number.isInteger(index) || index < 0 || index >= position.count)) return;
                const points = indices.map((index) => new THREE.Vector3().fromBufferAttribute(position, index).applyMatrix4(mesh.matrixWorld));
                const normal = points[1].clone().sub(points[0]).cross(points[2].clone().sub(points[0])).normalize();
                const point = points[0].clone().add(points[1]).add(points[2]).multiplyScalar(1 / 3);
                const range = getSimulationSnapFaceTriangleRanges(mesh, triangleIndex);
                entries.push({
                    mesh,
                    point,
                    faceIndex: range.faceIndex ?? faceIndex,
                    triangleIndex,
                    key: range.key,
                    triangleRanges: range.triangleRanges,
                    upward: Math.abs(normal.z)
                });
            });
        });
        const robot = activeManualRobot();
        const pose = robot && getCurrentTcpPoseBase(robot);
        const tcpWorld = pose ? robot.localToWorld(pose.position.clone()) : new THREE.Vector3();
        return entries.sort((left, right) => (
            (left.upward >= 0.65 ? 0 : 1) - (right.upward >= 0.65 ? 0 : 1)
            || left.point.distanceToSquared(tcpWorld) - right.point.distanceToSquared(tcpWorld)
        ));
    };

    const projectManualSnapTarget = () => {
        if (!manual.snapTarget || !state.camera || !el.canvasContainer) return null;
        const bounds = state.renderer.domElement.getBoundingClientRect();
        const projected = manual.snapTarget.worldPoint.clone().project(state.camera);
        return {
            ...manual.snapTarget,
            screenX: (projected.x * 0.5 + 0.5) * bounds.width,
            screenY: (-projected.y * 0.5 + 0.5) * bounds.height,
            projected
        };
    };

    const tryManualSnapWorldPoint = (robot, startAngles, worldPoint, type = 'vertex') => {
        startAngles.forEach((angle, index) => setJointAngle(robot.userData.joints[index], angle, false));
        robot.updateMatrixWorld(true);
        if (!moveRobotTcpToSimulationSnap({ worldPoint: worldPoint.clone(), type })) return false;
        manual.snapTarget = { worldPoint: worldPoint.clone(), type };
        manual.snapAngles = robot.userData.joints.map((joint) => joint.angle);
        const visibleTarget = projectManualSnapTarget();
        if (visibleTarget) showSimulationSnapMarker(visibleTarget);
        return true;
    };

    const findManualSnapTarget = async () => {
        const robot = activeManualRobot();
        const equipment = state.models.find((model) => isTestModel(model) && model.userData.placement === 'scene');
        if (!robot || !equipment) return false;
        const startAngles = robot.userData.joints.map((joint) => joint.angle);
        const pose = getCurrentTcpPoseBase(robot);
        const tcpWorld = pose ? robot.localToWorld(pose.position.clone()) : new THREE.Vector3();
        state.snapMoveMode = true;
        updateSimulationSnapButton();

        for (const selection of manualFaceEntries(equipment).slice(0, 28)) {
            startAngles.forEach((angle, index) => setJointAngle(robot.userData.joints[index], angle, false));
            clearSimulationSnapFaceSelection();
            state.snapMoveMode = true;
            updateSimulationSnapButton();
            selectSimulationSnapFace(selection);
            try {
                await waitForManualCondition(() => state.snapCandidatesReady, 8000, 40);
            } catch {
                continue;
            }
            getSimulationSnapWorldIndex(getSimulationSnapMeshes('scene'));
            const typeOrder = new Map(['circle-center', 'rectangle-center', 'edge-midpoint', 'endpoint', 'vertex']
                .map((type, index) => [type, index]));
            const candidates = state.snapCandidates
                .filter((candidate) => candidate.snapWorldPoint || candidate.localPoint)
                .map((candidate) => ({
                    candidate,
                    worldPoint: candidate.snapWorldPoint?.clone()
                        || candidate.localPoint.clone().applyMatrix4(candidate.mesh.matrixWorld)
                }))
                .sort((left, right) => (
                    (typeOrder.get(left.candidate.type) ?? 99) - (typeOrder.get(right.candidate.type) ?? 99)
                    || left.worldPoint.distanceToSquared(tcpWorld) - right.worldPoint.distanceToSquared(tcpWorld)
                ));
            for (const item of candidates.slice(0, 60)) {
                if (!tryManualSnapWorldPoint(robot, startAngles, item.worldPoint, item.candidate.type)) continue;
                manual.snapSelection = cloneSimulationSnapFaceSelection(selection);
                return true;
            }
        }

        const bounds = new THREE.Box3().setFromObject(equipment);
        const center = bounds.getCenter(new THREE.Vector3());
        const size = bounds.getSize(new THREE.Vector3());
        const fallbackPoints = [
            center.clone().setZ(bounds.max.z),
            center.clone().add(new THREE.Vector3(size.x * 0.2, 0, size.z * 0.35)),
            center.clone().add(new THREE.Vector3(-size.x * 0.2, 0, size.z * 0.35))
        ];
        for (const worldPoint of fallbackPoints) {
            if (tryManualSnapWorldPoint(robot, startAngles, worldPoint, 'vertex')) return true;
        }

        startAngles.forEach((angle, index) => setJointAngle(robot.userData.joints[index], angle, false));
        syncJointControls(robot);
        captureCurrentTcpTarget(robot);
        updateTcpPresentation(robot);
        clearManualSnapUi();
        return false;
    };

    const prepareManualTestAssets = async () => {
        const robot = activeManualRobot();
        if (!robot) throw new Error('The manual robot is not ready.');
        const [equipmentFile, toolFile] = await Promise.all([
            loadTestModelAssetFile(TEST_MODEL_ASSET_PATHS.scene),
            loadTestModelAssetFile(TEST_MODEL_ASSET_PATHS.tcp)
        ]);
        removeExistingTestModels();
        if (!applyTestTcpProfile(robot)) throw new Error('Test TCP 1 is not available.');
        const equipment = await importTestModelFile(equipmentFile, 'scene', { testModel: true });
        const tool = await importTestModelFile(toolFile, 'tcp', {
            testModel: true,
            testToolPositionZero: true,
            testToolRotationX: robot.userData.manifest?.robotType === 'scara'
        });
        if (!equipment || !tool) throw new Error('The Test assets could not be prepared.');
        fitCamera();
        requestRender();
    };

    const prepareManualProgramMilestones = () => {
        const robot = activeManualRobot();
        if (!robot) throw new Error('The manual robot is not ready.');
        const program = ensureMotionProgram(robot);
        program.steps = [];
        program.selectedStepId = null;
        program.status = 'idle';
        program.progress = 0;
        state.motionRepeatRobot = false;
        state.motionReverseRepeatRobot = false;
        syncMotionRepeatControl();
        renderMotionProgramPanel();
        captureManualMilestone('programBase');

        const center = manual.snapAngles.length
            ? manual.snapAngles
            : robot.userData.joints.map((joint) => joint.angle);
        manual.programPoseA = clampManualAngles(robot, center.map((value, index) => (
            index === 0 ? value - 24 : index === 1 ? value + 10 : value
        )));
        manual.programPoseB = clampManualAngles(robot, center.map((value, index) => (
            index === 0 ? value + 24 : index === 1 ? value - 10 : value
        )));

        setManualJointAngles(manual.programPoseA);
        captureManualMilestone('programPoseA');
        addCurrentMotionStep();
        const first = program.steps[0];
        if (first) {
            first.label = 'Pick';
            first.speed = 12;
        }
        renderMotionProgramPanel();
        captureManualMilestone('programP0');

        setManualJointAngles(manual.programPoseB);
        captureManualMilestone('programPoseB');
        addCurrentMotionStep();
        const second = program.steps[1];
        if (second) {
            second.label = 'Place';
            second.speed = 12;
        }
        program.selectedStepId = second?.id || first?.id || null;
        renderMotionProgramPanel();
        captureManualMilestone('programP1');

        state.motionRepeatRobot = true;
        state.motionReverseRepeatRobot = false;
        syncMotionRepeatControl();
        renderMotionProgramPanel();
        captureManualMilestone('programReady');
    };

    const prepare = async () => {
        if (manual.prepared) {
            applyManualMilestone('blank', { fit: false });
            return true;
        }
        if (manual.preparing) return manual.preparing;
        manual.preparing = (async () => {
            await waitForManualCondition(() => state.scene && state.renderer && state.catalog.size > 0);
            state.collision.enabled = false;
            clearCollisionStopNotice();
            updateCollisionUi();
            captureManualMilestone('blank');

            const definition = state.catalog.get(manual.robotCatalogKey)
                || [...state.catalog.values()].find((item) => item.folder === 'IR-S4-40Z15');
            if (!definition) throw new Error('IR-S4-40Z15 is not available.');
            await loadModelFromServer(definition);
            const robot = await waitForManualCondition(() => activeManualRobot(), 30000, 100);
            manual.homeAngles = robot.userData.joints.map((joint) => joint.angle);
            captureManualMilestone('robot');

            manual.jogAngles = clampManualAngles(robot, manual.homeAngles.map((value, index) => (
                index === 0 ? value + 24 : value
            )));
            setManualJointAngles(manual.jogAngles);
            captureManualMilestone('jog');

            await prepareManualTestAssets();
            captureManualMilestone('test');

            const snapped = await findManualSnapTarget();
            if (!snapped) {
                manual.snapAngles = [...manual.jogAngles];
                setManualJointAngles(manual.snapAngles);
            }
            captureManualMilestone('snap');
            prepareManualProgramMilestones();

            state.undoStack = [];
            state.redoStack = [];
            updateHistoryButtons();
            manual.prepared = true;
            applyManualMilestone('blank', { fit: false });
            return true;
        })().finally(() => {
            manual.preparing = null;
        });
        return manual.preparing;
    };

    const interpolateManualMilestone = (fromName, toAngles, startTime, endTime, time) => {
        const snapshot = manual.snapshots.get(fromName);
        const robotEntry = snapshot?.joints?.[0];
        if (!robotEntry || !toAngles.length) return;
        const raw = (Number(time) - startTime) / Math.max(1, endTime - startTime);
        const progress = sCurveProgress(THREE.MathUtils.clamp(raw, 0, 1));
        setManualJointAngles(robotEntry.angles.map((value, index) => (
            THREE.MathUtils.lerp(value, toAngles[index] ?? value, progress)
        )));
    };

    const interpolateManualJogJ1 = (time) => {
        const snapshot = manual.snapshots.get('robot');
        const robot = activeManualRobot();
        const j1 = robot?.userData.joints?.[0];
        const fromAngle = snapshot?.joints?.[0]?.angles?.[0];
        const toAngle = manual.jogAngles[0];
        if (!j1 || !Number.isFinite(fromAngle) || !Number.isFinite(toAngle)) return;
        const [startTime, endTime] = SIMULATION_MANUAL_TIMELINE.jog;
        const raw = (Number(time) - startTime) / Math.max(1, endTime - startTime);
        const progress = sCurveProgress(THREE.MathUtils.clamp(raw, 0, 1));
        const nextAngle = THREE.MathUtils.lerp(fromAngle, toAngle, progress);
        const range = j1.control?.range;
        const display = j1.control?.display || getJointJogDisplaySpec(j1);
        if (range) {
            range.value = formatJogValue(display.toDisplay(nextAngle));
            range.dispatchEvent(new Event('input', { bubbles: true }));
        } else {
            setJointAngle(j1, nextAngle);
            captureCurrentTcpTarget(robot);
        }
    };

    const setTimelineTime = (time) => {
        if (!manual.prepared) return;
        if (manual.cue === 'simulation_jog_move') {
            interpolateManualJogJ1(time);
        } else if (manual.cue === 'simulation_snap_move') {
            interpolateManualMilestone('test', manual.snapAngles, ...SIMULATION_MANUAL_TIMELINE.snap, time);
        } else if (manual.cue === 'simulation_program_pose_a') {
            interpolateManualMilestone('programBase', manual.programPoseA, ...SIMULATION_MANUAL_TIMELINE.programPoseA, time);
        } else if (manual.cue === 'simulation_program_pose_b') {
            interpolateManualMilestone('programP0', manual.programPoseB, ...SIMULATION_MANUAL_TIMELINE.programPoseB, time);
        }
    };

    const setSnapMode = (enabled) => {
        state.snapMoveMode = Boolean(enabled);
        if (enabled) {
            if (state.tcpSnapMode) setTcpSnapMode(false);
            clearJogModeSelectionForSnap();
        } else {
            clearSimulationSnapFaceSelection();
        }
        updateSimulationSnapButton();
        if (enabled) captureSimulationSnapMarkerReferenceDistance();
    };

    const showSnapSelection = () => {
        setSnapMode(true);
        if (manual.snapSelection) selectSimulationSnapFace(manual.snapSelection);
        requestRender();
    };

    const showSnapTarget = () => {
        setSnapMode(true);
        const target = projectManualSnapTarget();
        if (target) showSimulationSnapMarker(target);
        requestRender();
    };

    const showProgramPanelForManual = () => {
        showMotionProgramPanel();
        el.programPanel?.classList.remove('panel-user-hidden');
        updatePanelLauncher('program-panel');
        renderMotionProgramPanel();
    };

    const setManualPanelVisible = (panelId, visible) => {
        const panel = getPanelElement(panelId);
        if (!panel) return false;
        if (!visible) {
            if (isPanelOpenInDocument(panel)) handlePanelAction('hide', panelId);
            else panel.classList.add('panel-user-hidden');
            updatePanelLauncher(panelId);
            updatePanelStack();
            return true;
        }
        if (panelId === 'program-panel') showMotionProgramPanel();
        if (panelId === 'jog-panel') {
            const robot = activeManualRobot();
            if (robot && (panel.classList.contains('hidden') || !el.jogControls?.children.length)) {
                renderJogControls(robot);
            }
            if (robot) syncJointControls(robot);
        }
        panel.classList.remove('hidden', 'panel-user-hidden');
        updatePanelLauncher(panelId);
        bringPanelToFront(panelId);
        return true;
    };

    const focusManualRobot = () => {
        const robot = activeManualRobot();
        if (!robot || !state.camera || !state.controls) return false;
        robot.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(robot);
        if (box.isEmpty()) return false;
        const sphere = box.getBoundingSphere(new THREE.Sphere());
        const verticalFov = THREE.MathUtils.degToRad(state.camera.fov || 50);
        const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * Math.max(0.1, state.camera.aspect || 1));
        const limitingFov = Math.max(0.1, Math.min(verticalFov, horizontalFov));
        const distance = Math.max(1, sphere.radius * 1.3 / Math.sin(limitingFov / 2));
        const direction = new THREE.Vector3(0.8, -0.8, 0.55).normalize();
        state.camera.up.set(0, 0, 1);
        state.camera.position.copy(sphere.center).addScaledVector(direction, distance);
        state.camera.lookAt(sphere.center);
        state.controls.target.copy(sphere.center);
        state.controls.update();
        requestRender();
        return true;
    };

    const startProgram = () => {
        applyManualMilestone('programReady');
        showProgramPanelForManual();
        runActiveRobotProgram();
        if (manual.paused) pauseRobotMotions([activeManualRobot()].filter(Boolean));
        requestRender();
    };

    const ensureProgramRunning = () => {
        const robot = activeManualRobot();
        if (!robot) return false;
        const program = ensureMotionProgram(robot);
        if (program.steps.length !== 2 || !state.motionRepeatRobot) {
            applyManualMilestone('programReady');
        }
        const session = getMotionSession(robot);
        if (session?.status === 'paused') resumePausedRobotMotions([robot]);
        else if (!session || session.status !== 'running') runActiveRobotProgram();
        if (manual.paused) pauseRobotMotions([robot]);
        requestRender();
        return ['running', 'paused'].includes(getMotionStatus(robot));
    };

    const setPaused = (paused) => {
        manual.paused = Boolean(paused);
        const robot = activeManualRobot();
        if (!robot) return;
        if (manual.paused) pauseRobotMotions([robot]);
        else resumePausedRobotMotions([robot]);
    };

    const reset = () => {
        manual.cue = '';
        setPaused(true);
        closeManualDialogs();
        if (manual.prepared) applyManualMilestone('blank', { fit: false });
    };

    window.InoRobotSimulationManual = Object.freeze({
        prepare,
        applyMilestone: applyManualMilestone,
        setCue: cue => { manual.cue = String(cue || ''); },
        setTimelineTime,
        setPaused,
        reset,
        showLoading: (show, text = '불러오는 중...') => showLoading(Boolean(show), uiText(text)),
        showTestDialog: () => {
            if (el.testModelDialog && !el.testModelDialog.open) el.testModelDialog.showModal();
        },
        closeTestDialog: () => { if (el.testModelDialog?.open) el.testModelDialog.close(); },
        showModelSelection: selected => {
            if (el.modelSelect) el.modelSelect.value = selected ? manual.robotCatalogKey : '';
        },
        setJogMode,
        setSnapMode,
        showSnapSelection,
        showSnapTarget,
        showProgramPanel: showProgramPanelForManual,
        setPanelVisible: setManualPanelVisible,
        focusRobot: focusManualRobot,
        startProgram,
        ensureProgramRunning,
        getState: () => ({
            prepared: manual.prepared,
            cue: manual.cue,
            milestone: manual.milestone,
            robotName: activeManualRobot()?.userData.motionDisplayName || '',
            joints: activeManualRobot()?.userData.joints.map((joint) => joint.angle) || [],
            testScene: state.models.some((model) => isTestModel(model) && model.userData.placement === 'scene'),
            testTool: state.models.some((model) => isTestModel(model) && model.userData.placement === 'tcp'),
            snapReady: Boolean(manual.snapTarget),
            programSteps: activeManualRobot() ? ensureMotionProgram(activeManualRobot()).steps.length : 0,
            repeat: state.motionRepeatRobot,
            motionStatus: activeManualRobot() ? getMotionStatus(activeManualRobot()) : 'idle',
            modelSelectValue: el.modelSelect?.value || '',
            panels: {
                model: isPanelOpenInDocument(el.modelBrowserPanel),
                jog: isPanelOpenInDocument(el.jogPanel),
                program: isPanelOpenInDocument(el.programPanel)
            }
        })
    });
}

function requiresContinuousRendering() {
    return isViewWindowOpen()
        || isVirtualControllerActive()
        // OLP itself does not need a 60 FPS scene loop while it is waiting on
        // IO or executing non-motion lines. Motion functions call
        // requestRender() for each animation frame, so keep continuous
        // rendering only for active OLP motion/control work.
        || state.olp.workOriginBusy
        || state.olp.manualMoveBusy
        || Boolean(state.olp.runtime?.pendingMotions?.size)
        || [...state.motionSessions.values()].some((session) => session.status === 'running');
}

function getRenderWindow() {
    const popup = state.viewWindow?.popup;
    return popup && !popup.closed && typeof popup.requestAnimationFrame === 'function'
        ? popup
        : window;
}

function requestRender() {
    if (!state.renderer || state.renderFramePending) return;
    state.renderFramePending = true;
    // When the fixed-view panel is detached, the opener can be backgrounded by
    // the browser. Schedule the scene loop in the visible popup so camera input
    // and robot motion continue to repaint at the expected rate. Always pass the
    // opener's monotonic clock to animate because each window has its own
    // requestAnimationFrame timestamp origin.
    getRenderWindow().requestAnimationFrame(() => animate(performance.now()));
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
        setMotionProgramStatus('충돌이 감지되어 모션을 정지했습니다.', 'error');
    } else if (collisionFresh && blockingMotionCollision && state.olp.runtime?.running) {
        state.olp.runtime.stop();
        latchCollisionStopNotice(collision, '충돌이 감지되어 OLP 모션을 정지했습니다.');
        setOlpStatus('error', '충돌이 감지되어 OLP 모션을 정지했습니다.');
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
