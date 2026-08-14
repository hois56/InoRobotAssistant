import * as THREE from './vendor/three/three.module.js';
import { TrackballControls } from './vendor/three/examples/jsm/controls/TrackballControls.js';
import { TransformControls } from './vendor/three/examples/jsm/controls/TransformControls.js';
import { STLLoader } from './vendor/three/examples/jsm/loaders/STLLoader.js';
import { enableContinuousTransformRotation } from './continuous-transform-rotation.mjs?v=20260720-rx-continuous-1';
import {
  combineStepParts,
  createCoordinateFrame,
  integrateStepMesh,
  pointInFrame
} from './mass-properties.mjs';
import { averagePoints, buildStepSnapCandidates } from './snap-geometry.mjs';
import { cadColorToHex } from './step-export-transform.mjs?v=20260719-ry-trackball-1';

const OCCT_IMPORT_BASE_URL = './vendor/occt/';
const OCCT_IMPORT_SCRIPT_URL = `${OCCT_IMPORT_BASE_URL}occt-import-js.js`;
const KG_PER_MM3_PER_G_PER_CM3 = 1e-6;
const ROBOT_SELECTION_GRAVITY = 9.8;
const MAX_DETAILED_SNAP_TRIANGLES = 200000;
const LARGE_STEP_ENGINE_MIN_BYTES = 100 * 1024 * 1024;
const LARGE_STEP_ENGINE_WORKER_URL = '../2_3DSimulation/step-import-worker.js?v=20260720-large-xcaf-quality-1';
const DEFAULT_STEP_IMPORT_OPTIONS = Object.freeze({
  linearUnit: 'millimeter',
  linearDeflectionType: 'bounding_box_ratio',
  linearDeflection: 0.00025,
  angularDeflection: 0.25
});
const STEP_IMPORT_QUALITY_PRESETS = Object.freeze({
  default: Object.freeze({
    key: 'default',
    label: '기본',
    snapTriangleBudget: MAX_DETAILED_SNAP_TRIANGLES,
    importOptions: DEFAULT_STEP_IMPORT_OPTIONS
  }),
  'ultra-light': Object.freeze({
    key: 'ultra-light',
    label: '초경량',
    snapTriangleBudget: 25000,
    importOptions: Object.freeze({
      linearUnit: 'millimeter',
      linearDeflectionType: 'absolute_value',
      linearDeflection: 5,
      angularDeflection: 1.2
    })
  })
});
const AXIS_COLORS = Object.freeze({ x: '#d32f2f', y: '#388e3c', z: '#1976d2' });
const HELPER_SCREEN_PIXELS = Object.freeze({
  axes: 72,
  tcp: 18,
  centerOfMass: 16,
  selectedSnap: 10,
  multiPointCenter: 14
});
const SNAP_MARKER_CAMERA_SCALE = Object.freeze({ min: 0.55, max: 1.25 });
const MAX_VISIBLE_CAD_SNAP_MARKERS = 256;
const CAD_SNAP_MARKER_TYPE_ORDER = Object.freeze([
  'rectangle-center',
  'circle-center',
  'face-center',
  'shape-center',
  'endpoint',
  'vertex',
  'edge-midpoint',
  'virtual-intersection'
]);
const MATERIALS = {
  aluminum: { name: '알루미늄 합금', density: 2.70e-6, color: 0xa8b7c4 },
  steel: { name: '강철', density: 7.85e-6, color: 0x64748b },
  stainless: { name: '스테인리스', density: 7.93e-6, color: 0xcbd5e1 },
  brass: { name: '황동', density: 8.50e-6, color: 0xb7791f },
  custom: { name: '사용자 정의', density: 1.00e-6, color: 0x8b5cf6 }
};

const SNAP_TYPES = {
  vertex: { label: '꼭짓점', symbol: '□', priority: 1 },
  endpoint: { label: '끝점', symbol: '◇', priority: 0 },
  'edge-midpoint': { label: '에지 중심점', symbol: '△', priority: 3 },
  'face-center': { label: '면 중심점', symbol: '○', priority: 4 },
  'circle-center': { label: '원/호 중심점', symbol: '⊙', priority: 2 },
  'rectangle-center': { label: '사각형 중심점', symbol: '▣', priority: 4 },
  'shape-center': { label: '형상 중심점', symbol: '⌖', priority: 5 },
  'virtual-intersection': { label: '가상 교점', symbol: '×', priority: 6 }
};

const state = {
  scene: null,
  camera: null,
  renderer: null,
  controls: null,
  rotationHandler: null,
  frameObject: null,
  gridHelper: null,
  gridVisible: false,
  outlineMode: false,
  visibilityRaycaster: new THREE.Raycaster(),
  modelGroup: new THREE.Group(),
  parts: [],
  origin: new THREE.Vector3(),
  xDirection: new THREE.Vector3(1, 0, 0),
  yDirection: new THREE.Vector3(0, 1, 0),
  zDirection: new THREE.Vector3(0, 0, 1),
  rotationDegrees: new THREE.Vector3(),
  tcp: new THREE.Vector3(),
  axesHelper: null,
  tcpMarker: null,
  centerMarker: null,
  multiCenterHelper: null,
  cameraScaledHelpers: new Set(),
  helperScale: 100,
  pickMode: null,
  pointerDown: null,
  pointerMoveFrame: null,
  lastPointer: null,
  snapCandidates: [],
  snapFaceCandidates: [],
  snapFaceSelection: null,
  snapFaceOverlay: null,
  snapCandidateMarkers: [],
  snapDisplayedCandidates: [],
  snapType: 'auto',
  snapRadiusPx: 16,
  snapMarkerReferenceDistance: null,
  hoverSnap: null,
  multiPoints: [],
  statusRenderer: null,
  statusKind: '',
  snapReadoutRenderer: null,
  occtScriptPromise: null,
  occtPromise: null,
  sourceStepFile: null,
  sourceCadFormat: null,
  selectedPartIndex: null,
  massProperties: null,
  exportingStep: false
};

const el = {};
const uiText = (value) => window.InoRobotI18n ? window.InoRobotI18n.translate(String(value)) : String(value);
const uiFormat = (value, replacements = {}) => uiText(value).replace(/\{([A-Za-z0-9_]+)\}/g, (match, key) => (
  Object.prototype.hasOwnProperty.call(replacements, key) ? String(replacements[key]) : match
));
const flatten = (value) => {
  if (!value) return [];
  if (ArrayBuffer.isView(value)) return value;
  return Array.isArray(value[0]) ? value.flat() : Array.from(value);
};
const helperWorldPosition = new THREE.Vector3();
const helperCameraPosition = new THREE.Vector3();
const helperParentScale = new THREE.Vector3();

function preventMiddleButtonAutoscroll(event) {
  if (event.button === 1) event.preventDefault();
}

function renderStatus() {
  if (!state.statusRenderer) return;
  el.status.textContent = state.statusRenderer();
  el.status.className = `cad-status ${state.statusKind}`.trim();
}

function setStatus(message, kind = '') {
  state.statusRenderer = typeof message === 'function' ? message : () => uiText(message);
  state.statusKind = kind;
  renderStatus();
}

function renderSnapReadout() {
  if (state.snapReadoutRenderer) el.snapReadout.textContent = state.snapReadoutRenderer();
}

function setSnapReadout(message) {
  state.snapReadoutRenderer = typeof message === 'function' ? message : () => uiText(message);
  renderSnapReadout();
}

function cacheElements() {
  Object.assign(el, {
    mode: document.getElementById('mode-cad'),
    viewport: document.getElementById('cad-viewport'),
    fileInput: document.getElementById('cad-step-file'),
    importQuality: document.getElementById('cad-import-quality'),
    fileName: document.getElementById('cad-file-name'),
    status: document.getElementById('cad-status'),
    parts: document.getElementById('cad-parts-list'),
    result: document.getElementById('cad-result'),
    mass: document.getElementById('cad-result-mass'),
    center: document.getElementById('cad-result-center'),
    originInertia: document.getElementById('cad-result-origin-inertia'),
    centerInertia: document.getElementById('cad-result-center-inertia'),
    calculate: document.getElementById('cad-calculate'),
    robot: document.getElementById('cad-robot'),
    robotJ5OffsetRow: document.getElementById('cad-j5off-row'),
    robotJ5Offset: document.getElementById('cad-j5off'),
    robotSpec: document.getElementById('cad-robot-spec'),
    robotCalculate: document.getElementById('cad-robot-calculate'),
    robotResult: document.getElementById('cad-robot-result'),
    robotSummary: document.getElementById('cad-robot-summary'),
    robotTable: document.getElementById('cad-robot-table'),
    robotOverall: document.getElementById('cad-robot-overall'),
    snapType: document.getElementById('cad-snap-type'),
    snapRadius: document.getElementById('cad-snap-radius'),
    snapRadiusValue: document.getElementById('cad-snap-radius-value'),
    snapReadout: document.getElementById('cad-snap-readout'),
    snapMarker: document.getElementById('cad-snap-marker'),
    snapSymbol: document.getElementById('cad-snap-symbol'),
    snapLabel: document.getElementById('cad-snap-label'),
    multiCenterControls: document.getElementById('cad-multi-center-controls'),
    multiCenterCount: document.getElementById('cad-multi-center-count'),
    multiCenterApply: document.getElementById('cad-multi-center-apply'),
    multiCenterReset: document.getElementById('cad-multi-center-reset'),
    outlineToggle: document.getElementById('cad-outline-toggle'),
    gridToggle: document.getElementById('cad-grid-toggle'),
    exportStep: document.getElementById('cad-export-step'),
    rotationHandlerToggle: document.getElementById('cad-rotation-handler'),
    axisDirections: document.getElementById('cad-axis-directions')
  });
}

function setupScene() {
  state.scene = new THREE.Scene();
  state.scene.background = new THREE.Color(0x080b11);
  state.scene.add(state.modelGroup);

  state.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 1e8);
  state.camera.up.set(0, 0, 1);
  state.camera.position.set(700, -700, 550);

  state.frameObject = new THREE.Object3D();
  state.frameObject.name = 'Tool coordinate frame';
  state.scene.add(state.frameObject);

  state.scene.add(new THREE.HemisphereLight(0xffffff, 0x172033, 1.15));
  const keyLight = new THREE.DirectionalLight(0xffffff, 1.45);
  keyLight.position.set(600, -500, 900);
  state.scene.add(keyLight);
  const fillLight = new THREE.DirectionalLight(0x93c5fd, 0.55);
  fillLight.position.set(-500, 350, 250);
  state.scene.add(fillLight);

  state.gridHelper = new THREE.GridHelper(4000, 40, 0x334155, 0x1e293b);
  state.gridHelper.rotation.x = Math.PI / 2;
  state.gridHelper.visible = state.gridVisible;
  state.scene.add(state.gridHelper);
  createHelpers();

  // Embedded browsers may not expose WebGL. The CAD input/calculation path
  // must still be usable when only the 3D preview cannot be initialized.
  try {
    state.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    state.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    state.renderer.outputColorSpace = THREE.SRGBColorSpace;
    el.viewport.appendChild(state.renderer.domElement);

    // Trackball controls allow the view to pass over every axis, so the CAD
    // model can be freely rotated through 360 degrees in any direction.
    // Left drag rotates, the wheel zooms, and right drag pans.
    state.controls = new TrackballControls(state.camera, state.renderer.domElement);
    state.controls.staticMoving = true;
    state.controls.addEventListener('change', scheduleSnapPreview);
    state.controls.addEventListener('start', hideSnapCandidateMarkersForNavigation);
    state.controls.addEventListener('end', () => {
      updateSnapCandidateMarkers();
      scheduleSnapPreview();
    });
    state.rotationHandler = new TransformControls(state.camera, state.renderer.domElement);
    enableContinuousTransformRotation(state.rotationHandler, THREE);
    state.rotationHandler.setMode('rotate');
    state.rotationHandler.setSpace('local');
    state.rotationHandler.setSize(0.78);
    removeRotationScreenHandle(state.rotationHandler);
    applyTransformControlColors(state.rotationHandler);
    state.rotationHandler.attach(state.frameObject);
    state.rotationHandler.addEventListener('dragging-changed', (event) => {
      state.controls.enabled = !event.value;
    });
    state.rotationHandler.addEventListener('objectChange', syncOrientationFromHandler);
    state.scene.add(state.rotationHandler);

    const resizeObserver = new ResizeObserver(resizeRenderer);
    resizeObserver.observe(el.viewport);
    state.renderer.domElement.addEventListener('mousedown', preventMiddleButtonAutoscroll, { capture: true });
    state.renderer.domElement.addEventListener('pointerdown', onPointerDown);
    state.renderer.domElement.addEventListener('pointerup', onPointerUp);
    state.renderer.domElement.addEventListener('pointermove', onPointerMove);
    state.renderer.domElement.addEventListener('pointerleave', hideSnapMarker);
    animate();
    return true;
  } catch (error) {
    console.warn('3D preview unavailable; CAD import will continue without WebGL.', error);
    state.renderer?.dispose?.();
    state.renderer?.domElement?.remove?.();
    state.renderer = null;
    state.controls = null;
    state.rotationHandler?.removeFromParent?.();
    state.rotationHandler = null;
    return false;
  }
}

function removeRotationScreenHandle(transformControls) {
  const screenRotationHandles = [];
  transformControls.traverse((object) => {
    if (object.name === 'E') screenRotationHandles.push(object);
  });
  screenRotationHandles.forEach((handle) => handle.removeFromParent());
}

function getTransformHandleColorKey(handleName, activeAxis = '') {
  const fixedColors = { X: 'x', Y: 'y', Z: 'z', YZ: 'x', XZ: 'y', XY: 'z', XYZ: 'z' };
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

function createThickAxesHelper(size) {
  const group = new THREE.Group();
  const shaftLength = size * 0.82;
  const headLength = size * 0.18;
  const shaftRadius = Math.max(size * 0.012, 0.35);
  const headRadius = Math.max(size * 0.035, shaftRadius * 2.4);
  const axes = [
    { direction: new THREE.Vector3(1, 0, 0), color: AXIS_COLORS.x },
    { direction: new THREE.Vector3(0, 1, 0), color: AXIS_COLORS.y },
    { direction: new THREE.Vector3(0, 0, 1), color: AXIS_COLORS.z }
  ];
  const up = new THREE.Vector3(0, 1, 0);

  axes.forEach(({ direction, color }) => {
    const material = new THREE.MeshBasicMaterial({ color });
    const orientation = new THREE.Quaternion().setFromUnitVectors(up, direction);
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(shaftRadius, shaftRadius, shaftLength, 12), material);
    shaft.position.copy(direction).multiplyScalar(shaftLength * 0.5);
    shaft.quaternion.copy(orientation);
    group.add(shaft);

    const head = new THREE.Mesh(new THREE.ConeGeometry(headRadius, headLength, 16), material);
    head.position.copy(direction).multiplyScalar(shaftLength + headLength * 0.5);
    head.quaternion.copy(orientation);
    group.add(head);
  });
  return group;
}

function disposeHelper(helper) {
  helper?.traverse((object) => {
    state.cameraScaledHelpers.delete(object);
    object.geometry?.dispose?.();
    if (Array.isArray(object.material)) object.material.forEach((material) => material?.dispose?.());
    else object.material?.dispose?.();
  });
}

function keepHelperAtScreenSize(helper, localSize, pixelSize) {
  helper.userData.cameraScaledSize = { localSize, pixelSize };
  state.cameraScaledHelpers.add(helper);
  return helper;
}

function updateCameraScaledHelpers() {
  const viewportHeight = state.renderer?.domElement.clientHeight || 0;
  if (!state.camera || !state.scene || viewportHeight <= 0) return;

  state.camera.updateMatrixWorld(true);
  state.scene.updateMatrixWorld(true);
  const fovScale = 2 * Math.tan(THREE.MathUtils.degToRad(state.camera.fov * 0.5));
  const cameraZoom = Math.max(state.camera.zoom || 1, Number.EPSILON);

  state.cameraScaledHelpers.forEach((helper) => {
    const sizing = helper.userData.cameraScaledSize;
    if (!sizing || !helper.parent || !helper.visible) return;

    helper.getWorldPosition(helperWorldPosition);
    helperCameraPosition.copy(helperWorldPosition).applyMatrix4(state.camera.matrixWorldInverse);
    const cameraDepth = -helperCameraPosition.z;
    if (cameraDepth <= 0) return;

    const worldUnitsPerPixel = (cameraDepth * fovScale) / (viewportHeight * cameraZoom);
    const parentWorldScale = helper.parent
      ? helper.parent.getWorldScale(helperParentScale)
      : helperParentScale.set(1, 1, 1);
    const inheritedScale = Math.max(
      Math.abs(parentWorldScale.x),
      Math.abs(parentWorldScale.y),
      Math.abs(parentWorldScale.z),
      Number.EPSILON
    );
    const localScale = (worldUnitsPerPixel * sizing.pixelSize) / (sizing.localSize * inheritedScale);
    helper.scale.setScalar(localScale);
  });
}

function updateSnapMarkerCameraScale() {
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
  el.snapMarker.style.setProperty('--cad-snap-camera-scale', scale.toFixed(3));
}

function createTcpTargetMarker(size) {
  const group = new THREE.Group();
  group.name = 'TCP target marker';
  const targetColor = 0x22d3ee;
  const diamond = new THREE.Mesh(
    new THREE.OctahedronGeometry(size, 0),
    new THREE.MeshBasicMaterial({ color: targetColor })
  );
  group.add(diamond);

  const ringGeometry = new THREE.TorusGeometry(size * 1.65, Math.max(size * 0.11, 0.18), 8, 32);
  const ringMaterial = new THREE.MeshBasicMaterial({ color: targetColor, transparent: true, opacity: 0.9 });
  const ringXY = new THREE.Mesh(ringGeometry, ringMaterial);
  const ringXZ = new THREE.Mesh(ringGeometry.clone(), ringMaterial.clone());
  const ringYZ = new THREE.Mesh(ringGeometry.clone(), ringMaterial.clone());
  ringXZ.rotation.x = Math.PI * 0.5;
  ringYZ.rotation.y = Math.PI * 0.5;
  group.add(ringXY, ringXZ, ringYZ);
  return group;
}

function createCenterOfMassMarker(size) {
  const group = new THREE.Group();
  group.name = 'Center of mass marker';
  const outline = new THREE.Mesh(
    new THREE.SphereGeometry(size * 1.18, 20, 14),
    new THREE.MeshBasicMaterial({ color: 0x111827, side: THREE.BackSide })
  );
  const center = new THREE.Mesh(
    new THREE.SphereGeometry(size, 20, 14),
    new THREE.MeshBasicMaterial({ color: 0xfacc15 })
  );
  group.add(outline, center);
  return group;
}

function isMultiPointCenterMode() {
  return state.snapType === 'multi-point-center';
}

function getMultiPointCenter() {
  return new THREE.Vector3(...averagePoints(state.multiPoints.map((point) => point.toArray())));
}

function removeMultiCenterHelper() {
  if (!state.multiCenterHelper) return;
  state.multiCenterHelper.removeFromParent();
  disposeHelper(state.multiCenterHelper);
  state.multiCenterHelper = null;
}

function updateMultiCenterHelper() {
  removeMultiCenterHelper();
  if (!state.multiPoints.length || !state.scene) return;

  const group = new THREE.Group();
  group.name = 'Multiple point center selection';
  const selectedSize = Math.max(state.helperScale * 0.025, 1);
  state.multiPoints.forEach((point) => {
    const marker = new THREE.Mesh(
      new THREE.SphereGeometry(selectedSize, 16, 12),
      new THREE.MeshBasicMaterial({ color: 0xf472b6, depthTest: false })
    );
    keepHelperAtScreenSize(marker, selectedSize * 2, HELPER_SCREEN_PIXELS.selectedSnap);
    marker.position.copy(point);
    marker.renderOrder = 20;
    group.add(marker);
  });

  if (state.multiPoints.length >= 2) {
    const center = getMultiPointCenter();
    const linePoints = state.multiPoints.flatMap((point) => [point, center]);
    const lines = new THREE.LineSegments(
      new THREE.BufferGeometry().setFromPoints(linePoints),
      new THREE.LineBasicMaterial({ color: 0x67e8f9, transparent: true, opacity: 0.72, depthTest: false })
    );
    lines.renderOrder = 19;
    group.add(lines);
    const centerMarkerSize = Math.max(state.helperScale * 0.045, 1.8);
    const centerMarker = new THREE.Mesh(
      new THREE.OctahedronGeometry(centerMarkerSize, 0),
      new THREE.MeshBasicMaterial({ color: 0x22d3ee, depthTest: false })
    );
    keepHelperAtScreenSize(centerMarker, centerMarkerSize * 2, HELPER_SCREEN_PIXELS.multiPointCenter);
    centerMarker.position.copy(center);
    centerMarker.renderOrder = 21;
    group.add(centerMarker);
  }

  state.multiCenterHelper = group;
  state.scene.add(group);
}

function updateMultiCenterControls() {
  if (!el.multiCenterControls) return;
  const count = state.multiPoints.length;
  el.multiCenterControls.hidden = !isMultiPointCenterMode();
  el.multiCenterCount.textContent = `${uiText('다중 점 선택')} ${count}/4`;
  el.multiCenterApply.disabled = count < 2 || count > 4 || !state.pickMode;
  el.multiCenterReset.disabled = count === 0;
}

function multiCenterInstruction() {
  return `${uiText('다중 점 선택')} ${state.multiPoints.length}/4 · ${uiText('스냅 점 2~4개를 선택하세요.')}`;
}

function resetMultiPoints() {
  state.multiPoints = [];
  removeMultiCenterHelper();
  updateMultiCenterControls();
}

function createHelpers() {
  if (state.axesHelper) {
    state.axesHelper.removeFromParent();
    disposeHelper(state.axesHelper);
  }
  if (state.tcpMarker) {
    state.tcpMarker.removeFromParent();
    disposeHelper(state.tcpMarker);
  }
  if (state.centerMarker) {
    state.centerMarker.removeFromParent();
    disposeHelper(state.centerMarker);
  }

  state.axesHelper = keepHelperAtScreenSize(
    createThickAxesHelper(state.helperScale),
    state.helperScale,
    HELPER_SCREEN_PIXELS.axes
  );
  state.scene.add(state.axesHelper);

  const tcpMarkerSize = Math.max(state.helperScale * 0.055, 2);
  state.tcpMarker = keepHelperAtScreenSize(
    createTcpTargetMarker(tcpMarkerSize),
    tcpMarkerSize * 3.52,
    HELPER_SCREEN_PIXELS.tcp
  );
  state.scene.add(state.tcpMarker);

  const centerMarkerSize = Math.max(state.helperScale * 0.065, 2.5);
  state.centerMarker = keepHelperAtScreenSize(
    createCenterOfMassMarker(centerMarkerSize),
    centerMarkerSize * 2.36,
    HELPER_SCREEN_PIXELS.centerOfMass
  );
  state.centerMarker.visible = false;
  state.scene.add(state.centerMarker);
  updateHelpers();
}

function updateHelpers() {
  if (!state.frameObject) {
    renderAxisDirections();
    return;
  }
  state.axesHelper?.position.copy(state.origin);
  state.axesHelper?.quaternion.copy(state.frameObject.quaternion);
  state.frameObject.position.copy(state.origin);
  state.tcpMarker?.position.copy(state.tcp);
  renderAxisDirections();
}

function setDirectionsFromFrameObject() {
  state.xDirection.set(1, 0, 0).applyQuaternion(state.frameObject.quaternion).normalize();
  state.yDirection.set(0, 1, 0).applyQuaternion(state.frameObject.quaternion).normalize();
  state.zDirection.set(0, 0, 1).applyQuaternion(state.frameObject.quaternion).normalize();
}

function renderAxisDirections() {
  if (!el.axisDirections) return;
  const directions = { x: state.xDirection, y: state.yDirection, z: state.zDirection };
  Object.entries(directions).forEach(([axis, direction]) => {
    const output = el.axisDirections.querySelector(`[data-axis-direction="${axis}"]`);
    if (output) output.textContent = direction.toArray().map((value) => value.toFixed(3)).join(', ');
  });
}

function applyRotationDegrees(rotationDegrees) {
  state.rotationDegrees.fromArray(rotationDegrees);
  if (!state.frameObject) {
    state.xDirection.set(1, 0, 0);
    state.yDirection.set(0, 1, 0);
    state.zDirection.set(0, 0, 1);
    return;
  }
  state.frameObject.rotation.set(
    THREE.MathUtils.degToRad(state.rotationDegrees.x),
    THREE.MathUtils.degToRad(state.rotationDegrees.y),
    THREE.MathUtils.degToRad(state.rotationDegrees.z),
    'XYZ'
  );
  state.frameObject.updateMatrixWorld(true);
  setDirectionsFromFrameObject();
}

function syncOrientationFromHandler() {
  if (!state.frameObject) return;
  const euler = new THREE.Euler().setFromQuaternion(state.frameObject.quaternion, 'XYZ');
  const rawDegrees = [euler.x, euler.y, euler.z].map((value) => THREE.MathUtils.radToDeg(value));
  const continuousDegrees = rawDegrees.map((value, index) => {
    const previous = state.rotationDegrees.getComponent(index);
    if (!Number.isFinite(previous)) return value;
    // Euler extraction intentionally returns a principal angle. Choose the
    // equivalent 360-degree turn nearest to the value already shown so a
    // handle drag can continue through 180, 360, 540, ... degrees.
    return value + Math.round((previous - value) / 360) * 360;
  });
  state.rotationDegrees.fromArray(continuousDegrees);
  setDirectionsFromFrameObject();
  writeVectorInputs('rotation', state.rotationDegrees.toArray());
  updateHelpers();
  el.result.classList.add('hide');
  invalidateCadRobotSelection();
  if (state.centerMarker) state.centerMarker.visible = false;
}

function updateRotationHandlerVisibility() {
  if (!state.rotationHandler) return;
  const visible = Boolean(el.rotationHandlerToggle?.checked) && !state.pickMode;
  state.rotationHandler.visible = visible;
  state.rotationHandler.enabled = visible;
}

function updateGridVisibility() {
  if (state.gridHelper) state.gridHelper.visible = state.gridVisible;
  if (!el.gridToggle) return;
  el.gridToggle.setAttribute('aria-pressed', String(state.gridVisible));
  el.gridToggle.classList.toggle('is-active', state.gridVisible);
  el.gridToggle.textContent = uiText(state.gridVisible ? '그리드 ON' : '그리드 OFF');
}

function toggleGrid() {
  state.gridVisible = !state.gridVisible;
  updateGridVisibility();
}

function resizeRenderer() {
  const width = el.viewport.clientWidth;
  const height = el.viewport.clientHeight;
  if (!width || !height || !state.renderer || !state.camera) return;
  state.renderer.setSize(width, height, false);
  state.camera.aspect = width / height;
  state.camera.updateProjectionMatrix();
  state.controls?.handleResize?.();
  updateSnapCandidateMarkers();
}

function animate() {
  if (!state.renderer) return;
  requestAnimationFrame(animate);
  state.controls?.update?.();
  updateCameraScaledHelpers();
  updateSnapMarkerCameraScale();
  state.renderer.render(state.scene, state.camera);
}

function getFrame() {
  return createCoordinateFrame(
    state.origin.toArray(),
    state.xDirection.toArray(),
    state.yDirection.toArray()
  );
}

function disposePartOutlines() {
  const outlineLines = [];
  state.parts.forEach((part) => {
    part.mesh?.traverse?.((object) => {
      if (object.userData?.outlineSource) outlineLines.push(object);
    });
  });
  outlineLines.forEach((line) => {
    if (line.parent?.userData) delete line.parent.userData.outlineLine;
    line.removeFromParent();
    line.geometry?.dispose?.();
    const materials = Array.isArray(line.material) ? line.material : [line.material];
    materials.forEach((material) => material?.dispose?.());
  });
}

function syncPartOutlines() {
  if (!state.outlineMode) {
    disposePartOutlines();
    return;
  }
  state.parts.forEach((part) => {
    const mesh = part.mesh;
    if (!mesh?.geometry?.getAttribute?.('position') || mesh.userData.outlineLine) return;
    const line = new THREE.LineSegments(
      new THREE.EdgesGeometry(mesh.geometry, 28),
      new THREE.LineBasicMaterial({
        color: 0x000000,
        transparent: true,
        opacity: 0.95,
        depthTest: true,
        depthWrite: false,
        toneMapped: false
      })
    );
    line.name = 'Cartoon Outline';
    line.renderOrder = 30;
    line.frustumCulled = false;
    line.userData.outlineSource = true;
    mesh.add(line);
    mesh.userData.outlineLine = line;
  });
}

function updateOutlineToggleUi() {
  if (!el.outlineToggle) return;
  el.outlineToggle.classList.toggle('is-active', state.outlineMode);
  el.outlineToggle.setAttribute('aria-pressed', String(state.outlineMode));
  el.outlineToggle.title = uiText(state.outlineMode ? '외곽선 끄기' : '외곽선 켜기');
  el.outlineToggle.setAttribute('aria-label', uiText('외곽선 표시/숨김'));
  const label = state.outlineMode ? '외곽선 ON' : '외곽선 OFF';
  el.outlineToggle.innerHTML = `<i class="fa-solid fa-pen-nib"></i><span>${uiText(label)}</span>`;
}

function setOutlineMode(enabled) {
  state.outlineMode = Boolean(enabled);
  syncPartOutlines();
  updateOutlineToggleUi();
}

function clearParts() {
  clearSnapFaceSelection();
  disposePartOutlines();
  state.parts.forEach((part) => {
    part.mesh.geometry.dispose();
    part.mesh.material.dispose();
    part.mesh.removeFromParent();
  });
  state.parts = [];
  state.selectedPartIndex = null;
  state.snapCandidates = [];
  state.snapFaceCandidates = [];
  state.snapMarkerReferenceDistance = null;
  el.snapMarker?.style.setProperty('--cad-snap-camera-scale', '1');
  state.hoverSnap = null;
  resetMultiPoints();
  hideSnapMarker();
  if (state.centerMarker) state.centerMarker.visible = false;
  state.sourceStepFile = null;
  state.sourceCadFormat = null;
  invalidateCadRobotSelection();
  if (el.exportStep) el.exportStep.disabled = true;
  el.result.classList.add('hide');
  renderParts();
}

function resetCoordinateValues() {
  state.origin.set(0, 0, 0);
  state.rotationDegrees.set(0, 0, 0);
  state.tcp.set(0, 0, 0);
  state.xDirection.set(1, 0, 0);
  state.yDirection.set(0, 1, 0);
  state.zDirection.set(0, 0, 1);
  writeVectorInputs('origin', [0, 0, 0]);
  writeVectorInputs('rotation', [0, 0, 0]);
  writeVectorInputs('tcp', [0, 0, 0]);
  applyRotationDegrees([0, 0, 0]);
  setPickMode(null);
  updateHelpers();
}

function getDisplayColor(color) {
  return new THREE.Color(cadColorToHex(color));
}

function createThreeGeometry(meshDefinition) {
  const positions = flatten(meshDefinition.attributes?.position?.array);
  const indices = flatten(meshDefinition.index?.array);
  const geometry = new THREE.BufferGeometry();
  const positionAttribute = positions instanceof Float32Array
    ? new THREE.BufferAttribute(positions, 3)
    : new THREE.Float32BufferAttribute(positions, 3);
  geometry.setAttribute('position', positionAttribute);
  if (indices.length) {
    geometry.setIndex(ArrayBuffer.isView(indices) ? new THREE.BufferAttribute(indices, 1) : indices);
  }
  const normals = flatten(meshDefinition.attributes?.normal?.array);
  if (normals.length === positions.length) {
    const normalAttribute = normals instanceof Float32Array
      ? new THREE.BufferAttribute(normals, 3)
      : new THREE.Float32BufferAttribute(normals, 3);
    geometry.setAttribute('normal', normalAttribute);
  }
  else geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function getSelectedStepImportQuality() {
  return STEP_IMPORT_QUALITY_PRESETS[el.importQuality?.value] || STEP_IMPORT_QUALITY_PRESETS.default;
}

function getLargeStepTessellationParameters(fileSizeBytes, qualityKey = 'default') {
  if (qualityKey === 'ultra-light') {
    if (fileSizeBytes >= 512 * 1024 * 1024) return { linearDeflectionAbsolute: 16, angularDeflection: 1.4 };
    if (fileSizeBytes >= 256 * 1024 * 1024) return { linearDeflectionAbsolute: 12, angularDeflection: 1.35 };
    if (fileSizeBytes >= 128 * 1024 * 1024) return { linearDeflectionAbsolute: 8, angularDeflection: 1.3 };
    return { linearDeflectionAbsolute: 6, angularDeflection: 1.25 };
  }
  if (fileSizeBytes >= 512 * 1024 * 1024) return { linearDeflectionAbsolute: 8, angularDeflection: 1.15 };
  if (fileSizeBytes >= 256 * 1024 * 1024) return { linearDeflectionAbsolute: 5, angularDeflection: 1.1 };
  if (fileSizeBytes >= 128 * 1024 * 1024) return { linearDeflectionAbsolute: 3, angularDeflection: 1.05 };
  return { linearDeflectionAbsolute: 2, angularDeflection: 1 };
}

function normalizeLargeWorkerMesh(meshDefinition, sourceFile) {
  const positions = meshDefinition?.positions;
  const indices = meshDefinition?.indices;
  const normals = meshDefinition?.normals;
  if (!(positions instanceof Float32Array) || positions.length < 9
    || !ArrayBuffer.isView(indices) || indices.length < 3) {
    throw new Error('Large STEP engine returned invalid mesh data.');
  }
  return {
    name: meshDefinition.partName || sourceFile.name || 'STEP Assembly',
    partId: meshDefinition.partId || 'cad-large-whole',
    partName: meshDefinition.partName || sourceFile.name || 'STEP Assembly',
    color: Array.isArray(meshDefinition.color) && meshDefinition.color.length === 3
      ? meshDefinition.color
      : null,
    attributes: {
      position: { array: positions },
      ...(normals instanceof Float32Array && normals.length === positions.length
        ? { normal: { array: normals } }
        : {})
    },
    index: { array: indices },
    brep_faces: Array.isArray(meshDefinition.brepFaces) ? meshDefinition.brepFaces : [],
    largeModelChunk: Boolean(meshDefinition.largeModelChunk),
    chunkIndex: Number(meshDefinition.chunkIndex) || 0,
    chunkCount: Number(meshDefinition.chunkCount) || 1
  };
}

async function createStlMeshDefinition(file) {
  const sourceGeometry = new STLLoader().parse(await file.arrayBuffer());
  const position = sourceGeometry.getAttribute('position');
  if (!position) throw new Error('STL file has no vertex data.');
  const normal = sourceGeometry.getAttribute('normal');
  const index = sourceGeometry.getIndex();
  return {
    name: file.name.replace(/\.[^.]+$/, '') || 'STL Part',
    attributes: {
      position: { array: position.array },
      ...(normal ? { normal: { array: normal.array } } : {})
    },
    ...(index ? { index: { array: index.array } } : {})
  };
}

function importStepInWorker(buffer, onProgress, importOptions = DEFAULT_STEP_IMPORT_OPTIONS) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./step-import-worker.js?v=20260720-exact-small-1', import.meta.url));
    const workerBuffer = buffer.slice(0);
    const finish = (callback, value) => {
      worker.terminate();
      callback(value);
    };
    worker.addEventListener('message', (event) => {
      if (event.data?.type === 'progress') {
        onProgress?.(event.data.message);
        return;
      }
      if (event.data?.type === 'complete') {
        finish(resolve, event.data.result);
        return;
      }
      if (event.data?.type === 'error') {
        finish(reject, new Error(event.data.message || 'STEP import worker failed.'));
      }
    });
    worker.addEventListener('error', (event) => {
      finish(reject, new Error(event.message || 'STEP import worker failed.'));
    });
    worker.postMessage({
      buffer: workerBuffer,
      options: importOptions,
      fileName: state.sourceStepFile?.name || ''
    }, [workerBuffer]);
  });
}

function importLargeStepInWorker(buffer, sourceFile, qualityKey, onMesh, onProgress) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL(LARGE_STEP_ENGINE_WORKER_URL, import.meta.url));
    const requestId = `tool-mode-d-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    let settled = false;
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      worker.terminate();
      callback(value);
    };
    const handleMessage = (event) => {
      const payload = event.data || {};
      if (payload.requestId !== requestId) return;
      if (payload.type === 'progress') {
        const phase = payload.phase;
        const message = phase === 'reading'
          ? '대용량 STEP 실제 형상을 읽는 중입니다.'
          : phase === 'tessellating'
            ? '대용량 STEP 실제 형상을 저해상도로 메싱하는 중입니다.'
            : phase === 'packing'
              ? '대용량 STEP 메시를 화면용 청크로 나누는 중입니다.'
              : '대용량 STEP 엔진을 준비하는 중입니다.';
        onProgress?.(message);
        return;
      }
      if (payload.type === 'mesh') {
        try {
          onMesh(normalizeLargeWorkerMesh(payload.mesh, sourceFile));
        } catch (error) {
          finish(reject, error);
        }
        return;
      }
      if (payload.type === 'done') {
        finish(resolve, { success: true, meshCount: Number(payload.meshCount) || 0 });
        return;
      }
      if (payload.type === 'error') {
        finish(reject, new Error(payload.message || 'Large STEP engine failed.'));
      }
    };
    const handleError = (event) => {
      event.preventDefault();
      finish(reject, new Error(event.message || 'Large STEP engine failed.'));
    };
    worker.addEventListener('message', handleMessage);
    worker.addEventListener('error', handleError);
    worker.postMessage({
      type: 'parse',
      requestId,
      engine: 'large',
      fileBuffer: buffer,
      fileName: sourceFile.name,
      parameters: getLargeStepTessellationParameters(sourceFile.size, qualityKey)
    }, [buffer]);
  });
}

function ensureOcctScript() {
  if (typeof window.occtimportjs === 'function') return Promise.resolve();
  if (!state.occtScriptPromise) {
    state.occtScriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = OCCT_IMPORT_SCRIPT_URL;
      script.async = true;
      script.onload = () => {
        if (typeof window.occtimportjs === 'function') resolve();
        else reject(new Error('OpenCascade STEP parser is unavailable.'));
      };
      script.onerror = () => reject(new Error('OpenCascade STEP parser could not be loaded.'));
      document.head.appendChild(script);
    }).catch((error) => {
      state.occtScriptPromise = null;
      throw error;
    });
  }
  return state.occtScriptPromise;
}

async function getOcctImporter() {
  await ensureOcctScript();
  if (!state.occtPromise) {
    state.occtPromise = window.occtimportjs({
      locateFile: (fileName) => `${OCCT_IMPORT_BASE_URL}${fileName}`
    }).catch((error) => {
      state.occtPromise = null;
      throw error;
    });
  }
  return state.occtPromise;
}

async function importStepOnMainThread(buffer, onProgress, importOptions = DEFAULT_STEP_IMPORT_OPTIONS) {
  if (!(buffer instanceof ArrayBuffer)) throw new Error('STEP source data is missing.');
  onProgress?.('STEP 파일 해석 엔진을 준비하는 중입니다.');
  const occt = await getOcctImporter();
  const result = occt.ReadStepFile(new Uint8Array(buffer), importOptions);
  if (!result?.success || !Array.isArray(result.meshes)) throw new Error('CAD file could not be read.');
  return annotateStepHierarchy(result);
}

function annotateStepHierarchy(result) {
  if (!result?.root || !Array.isArray(result.meshes)) return result;
  const partByMeshIndex = new Map();
  let fallbackPartIndex = 0;

  const visit = (node, path = [], isRoot = false) => {
    if (!node || typeof node !== 'object') return;
    const rawName = String(node.name || '').trim();
    const partName = rawName || `Part ${fallbackPartIndex + 1}`;
    const partId = isRoot ? null : `cad-part-${path.join('-') || fallbackPartIndex++}`;
    if (!isRoot && Array.isArray(node.meshes)) {
      node.meshes.forEach((meshIndex) => {
        const index = Number(meshIndex);
        if (Number.isInteger(index) && index >= 0) {
          partByMeshIndex.set(index, { partId, partName });
        }
      });
    }
    const children = Array.isArray(node.children) ? node.children : [];
    children.forEach((child, childIndex) => visit(child, [...path, childIndex], false));
  };

  visit(result.root, [], true);
  result.meshes.forEach((mesh, index) => {
    const partMeta = partByMeshIndex.get(index) || {
      partId: `cad-mesh-${index}`,
      partName: mesh?.name || `Part ${index + 1}`
    };
    mesh.partId ||= partMeta.partId;
    mesh.partName ||= partMeta.partName;
  });
  result.rootName ||= result.root.name || 'STEP Assembly';
  return result;
}

async function importStepWithFallback(buffer, onProgress, importOptions = DEFAULT_STEP_IMPORT_OPTIONS) {
  try {
    return await importStepInWorker(buffer, onProgress, importOptions);
  } catch (workerError) {
    console.warn('STEP worker import failed; retrying with the main-thread parser.', workerError);
    onProgress?.('STEP 파일을 다시 해석하는 중입니다.');
    return importStepOnMainThread(buffer, onProgress, importOptions);
  }
}

function meshTriangleCount(meshDefinition) {
  const indices = flatten(meshDefinition.index?.array);
  if (indices.length) return Math.floor(indices.length / 3);
  return Math.floor(flatten(meshDefinition.attributes?.position?.array).length / 9);
}

function createCenterOnlySnapData(geometryProperties, triangleCount, reason = '') {
  return {
    candidates: [{
      type: 'shape-center',
      point: Array.from(geometryProperties.centroidMm),
      source: { kind: 'solid-centroid' }
    }],
    stats: {
      triangleCount,
      candidateCount: 1,
      simplified: true,
      reason
    }
  };
}

function buildMemoryAwareSnapData(meshDefinition, geometryProperties, remainingDetailedTriangles) {
  const triangleCount = meshTriangleCount(meshDefinition);
  if (triangleCount > remainingDetailedTriangles) {
    return createCenterOnlySnapData(geometryProperties, triangleCount, 'triangle-budget');
  }
  try {
    return buildStepSnapCandidates(meshDefinition, { solidCenter: geometryProperties.centroidMm });
  } catch (error) {
    console.warn('Detailed snap analysis failed; using the solid center only.', error);
    return createCenterOnlySnapData(geometryProperties, triangleCount, error?.message || 'snap-analysis-failed');
  }
}

function appendImportedStepMesh(meshDefinition, index, sourceFormat, context) {
  const geometryProperties = integrateStepMesh(meshDefinition);
  const snapData = buildMemoryAwareSnapData(
    meshDefinition,
    geometryProperties,
    context.remainingDetailedTriangles
  );
  if (snapData.stats.simplified) context.simplifiedSnapPartCount += 1;
  else context.remainingDetailedTriangles = Math.max(
    context.remainingDetailedTriangles - (snapData.stats.triangleCount || 0),
    0
  );

  const geometry = createThreeGeometry(meshDefinition);
  const MaterialClass = context.largeModel ? THREE.MeshLambertMaterial : THREE.MeshStandardMaterial;
  const material = new MaterialClass({
    color: getDisplayColor(meshDefinition.color),
    ...(context.largeModel ? {} : { roughness: 0.58, metalness: 0.18 }),
    side: THREE.DoubleSide
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = meshDefinition.partName || meshDefinition.name || `Part ${index + 1}`;
  mesh.userData.largeModelMode = Boolean(context.largeModel);
  mesh.userData.largeModelChunk = Boolean(meshDefinition.largeModelChunk);
  mesh.userData.largeModelChunkIndex = Number(meshDefinition.chunkIndex) || 0;
  mesh.userData.largeModelChunkCount = Number(meshDefinition.chunkCount) || 1;
  state.modelGroup.add(mesh);

  const partIndex = state.parts.length;
  mesh.userData.modeDPartIndex = partIndex;
  state.parts.push({
    name: mesh.name,
    cadPartKey: meshDefinition.partId || `cad-mesh-${index}`,
    cadPartName: meshDefinition.partName || mesh.name,
    mesh,
    geometry: geometryProperties,
    brepFaces: Array.isArray(meshDefinition.brep_faces) ? meshDefinition.brep_faces : [],
    snapStats: snapData.stats,
    sourceColorHex: cadColorToHex(meshDefinition.color),
    materialKey: 'aluminum',
    densityKgPerMm3: MATERIALS.aluminum.density,
    enabled: true
  });
  state.snapCandidates.push(...snapData.candidates.map((candidate) => ({
    ...candidate,
    point: new THREE.Vector3(...candidate.point),
    partIndex
  })));
  if (context.largeModel && state.parts.length === 1) fitCameraToModel();
  return partIndex;
}

async function loadCadFile(file) {
  const extension = file.name.split('.').pop()?.toLowerCase();
  if (!['step', 'stp', 'stl'].includes(extension)) {
    setStatus('STEP/STP/STL 파일만 선택할 수 있습니다.', 'error');
    el.fileInput.value = '';
    return;
  }

  const sourceFormat = extension === 'stl' ? 'STL' : 'STEP';
  const importQuality = getSelectedStepImportQuality();
  const useLargeStepEngine = sourceFormat === 'STEP' && file.size >= LARGE_STEP_ENGINE_MIN_BYTES;
  setStatus(() => uiFormat('{format} {quality} 품질로 불러오는 중입니다.', {
    format: sourceFormat,
    quality: uiText(importQuality.label)
  }));
  el.fileName.textContent = file.name;
  el.calculate.disabled = true;
  clearParts();
  resetCoordinateValues();
  state.sourceStepFile = file;
  state.sourceCadFormat = sourceFormat;

  try {
    let result;
    const importContext = {
      remainingDetailedTriangles: importQuality.snapTriangleBudget,
      simplifiedSnapPartCount: 0,
      largeModel: useLargeStepEngine,
      importQuality: importQuality.key
    };
    if (extension === 'stl') {
      result = { success: true, meshes: [await createStlMeshDefinition(file)] };
    } else {
      const buffer = await file.arrayBuffer();
      if (useLargeStepEngine) {
        let meshIndex = 0;
        result = await importLargeStepInWorker(
          buffer,
          file,
          importQuality.key,
          (meshDefinition) => {
            appendImportedStepMesh(meshDefinition, meshIndex, sourceFormat, importContext);
            meshIndex += 1;
          },
          (message) => setStatus(message)
        );
      } else {
        result = await importStepWithFallback(
          buffer,
          (message) => setStatus(message),
          importQuality.importOptions
        );
      }
    }
    if (!result?.success || (sourceFormat === 'STEP' && !useLargeStepEngine && !Array.isArray(result.meshes))) {
      throw new Error('CAD file could not be read.');
    }

    let remainingDetailedTriangles = importContext.remainingDetailedTriangles;
    let simplifiedSnapPartCount = importContext.simplifiedSnapPartCount;
    for (let index = 0; index < (result.meshes?.length || 0); index += 1) {
      const meshDefinition = result.meshes[index];
      try {
        const geometryProperties = integrateStepMesh(meshDefinition);
        const snapData = buildMemoryAwareSnapData(meshDefinition, geometryProperties, remainingDetailedTriangles);
        if (snapData.stats.simplified) simplifiedSnapPartCount += 1;
        else remainingDetailedTriangles = Math.max(remainingDetailedTriangles - (snapData.stats.triangleCount || 0), 0);
        const geometry = createThreeGeometry(meshDefinition);
        const material = new THREE.MeshStandardMaterial({
          color: getDisplayColor(meshDefinition.color),
          roughness: 0.58,
          metalness: 0.18,
          side: THREE.DoubleSide
        });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.name = meshDefinition.partName || meshDefinition.name || `Part ${index + 1}`;
        state.modelGroup.add(mesh);
        const partIndex = state.parts.length;
        mesh.userData.modeDPartIndex = partIndex;
        state.parts.push({
          name: mesh.name,
          cadPartKey: meshDefinition.partId || `cad-mesh-${index}`,
          cadPartName: meshDefinition.partName || mesh.name,
          mesh,
          geometry: geometryProperties,
          brepFaces: Array.isArray(meshDefinition.brep_faces) ? meshDefinition.brep_faces : [],
          snapStats: snapData.stats,
          sourceColorHex: cadColorToHex(meshDefinition.color),
          materialKey: 'aluminum',
          densityKgPerMm3: MATERIALS.aluminum.density,
          enabled: true
        });
        state.snapCandidates.push(...snapData.candidates.map((candidate) => ({
          ...candidate,
          point: new THREE.Vector3(...candidate.point),
          partIndex
        })));
      } catch (error) {
        console.warn(`Skipped non-solid ${sourceFormat} mesh ${index + 1}:`, error);
      }
      if (index > 0 && index % 20 === 0) {
        setStatus(() => uiFormat('{format} 파일을 불러오는 중입니다. ({index}/{total})', {
          format: sourceFormat,
          index: index + 1,
          total: result.meshes.length
        }));
        await new Promise((resolve) => requestAnimationFrame(resolve));
      }
    }

    if (!state.parts.length) throw new Error(uiText('계산 가능한 솔리드가 없습니다.'));
    state.sourceStepFile = extension === 'stl' ? null : file;
    state.sourceCadFormat = sourceFormat;
    renderParts();
    syncPartOutlines();
    fitCameraToModel();
    el.calculate.disabled = false;
    el.exportStep.disabled = extension === 'stl';
    setSnapReadout(() => `${uiText('스냅 후보')} ${state.snapCandidates.length.toLocaleString()}${uiText('개가 준비되었습니다.')}`);
    const simplifiedNote = simplifiedSnapPartCount
      ? uiFormat(' · 대용량 최적화 {count}개 부품', { count: simplifiedSnapPartCount.toLocaleString() })
      : '';
    setStatus(() => uiFormat('{format} 파일 분석 완료 · {label} {count}{note}', {
      format: sourceFormat,
      label: uiText('스냅 후보'),
      count: state.snapCandidates.length.toLocaleString(),
      note: simplifiedNote
    }), 'ok');
  } catch (error) {
    console.error('STEP import failed:', error);
    clearParts();
    setStatus(() => uiFormat('{format} 파일을 해석할 수 없습니다. {message}', {
      format: sourceFormat,
      message: error.message
    }), 'error');
  }
}

function fitCameraToModel() {
  const bounds = new THREE.Box3().setFromObject(state.modelGroup);
  if (bounds.isEmpty()) return;
  const size = bounds.getSize(new THREE.Vector3());
  const center = bounds.getCenter(new THREE.Vector3());
  const maxDimension = Math.max(size.x, size.y, size.z, 10);
  state.helperScale = Math.max(maxDimension * 0.22, 20);
  createHelpers();
  if (!state.controls || !state.camera) {
    updateHelpers();
    return;
  }
  state.controls.target.copy(center);
  state.camera.position.copy(center).add(new THREE.Vector3(maxDimension * 1.3, -maxDimension * 1.3, maxDimension * 0.95));
  state.camera.near = Math.max(maxDimension / 10000, 0.01);
  state.camera.far = maxDimension * 100;
  state.camera.updateProjectionMatrix();
  state.controls.update();
  state.snapMarkerReferenceDistance = state.camera.position.distanceTo(state.controls.target)
    / Math.max(state.camera.zoom || 1, Number.EPSILON);
  updateSnapMarkerCameraScale();
}

function materialOptions(selectedKey) {
  return Object.entries(MATERIALS).map(([key, material]) => (
    `<option value="${key}" ${key === selectedKey ? 'selected' : ''}>${uiText(material.name)}</option>`
  )).join('');
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  })[character]);
}

function getPartGroups() {
  const groups = new Map();
  state.parts.forEach((part, partIndex) => {
    const key = part.cadPartKey || `cad-mesh-${partIndex}`;
    let group = groups.get(key);
    if (!group) {
      group = {
        key,
        name: part.cadPartName || part.name || `Part ${partIndex + 1}`,
        parts: []
      };
      groups.set(key, group);
    }
    group.parts.push({ part, partIndex });
  });

  const nameCounts = new Map();
  return [...groups.values()].map((group) => {
    const count = (nameCounts.get(group.name) || 0) + 1;
    nameCounts.set(group.name, count);
    group.displayName = count > 1 ? `${group.name} #${count}` : group.name;
    group.volumeMm3 = group.parts.reduce((sum, entry) => sum + Number(entry.part.geometry?.volumeMm3 || 0), 0);
    group.name = group.displayName;
    group.geometry = { volumeMm3: group.volumeMm3 };
    group.enabled = group.parts.every((entry) => entry.part.enabled !== false);
    const firstPart = group.parts[0]?.part;
    const hasUniformMaterial = group.parts.every((entry) => entry.part.materialKey === firstPart?.materialKey);
    const hasUniformDensity = group.parts.every((entry) => entry.part.densityKgPerMm3 === firstPart?.densityKgPerMm3);
    group.materialKey = hasUniformMaterial ? firstPart?.materialKey || 'custom' : 'custom';
    group.densityKgPerMm3 = hasUniformDensity ? firstPart?.densityKgPerMm3 || 0 : 0;
    return group;
  });
}

function renderParts() {
  if (!state.parts.length) {
    el.parts.innerHTML = `<div class="cad-empty">${uiText('CAD 파일을 먼저 불러오세요.')}</div>`;
    return;
  }
  const modelName = state.sourceStepFile?.name || `${state.sourceCadFormat || 'CAD'} model`;
  const groups = getPartGroups();
  el.parts.innerHTML = `
    <div class="cad-model-tree" role="tree">
      <div class="cad-model-tree-root" role="treeitem" aria-level="1">
        <span class="cad-model-tree-root-icon"><i class="fa-solid fa-cube"></i></span>
        <span class="cad-model-tree-root-name">
          <b title="${escapeHtml(modelName)}">${escapeHtml(modelName)}</b>
          <small>${escapeHtml(state.sourceCadFormat || 'CAD')}</small>
        </span>
      </div>
      <div class="cad-model-tree-children" role="group">
        ${groups.map((part, index) => `
          <div class="cad-part-row${state.selectedPartIndex === index ? ' active' : ''}" data-part-index="${index}" role="treeitem" aria-level="2" aria-selected="${state.selectedPartIndex === index}">
            <input type="checkbox" data-part-enabled ${part.enabled ? 'checked' : ''} title="${uiText('포함')}" aria-label="${escapeHtml(part.name)} ${uiText('포함')}">
            <button type="button" class="cad-part-name${state.selectedPartIndex === index ? ' active' : ''}" data-part-select aria-pressed="${state.selectedPartIndex === index}">
              <span class="cad-part-tree-icon"><i class="fa-solid fa-cube"></i></span>
              <span>
                <b title="${escapeHtml(part.name)}">${escapeHtml(part.name)}</b>
                <small>${part.geometry.volumeMm3.toFixed(1)} mm³</small>
              </span>
            </button>
            <div class="cad-part-material">
              <select data-part-material aria-label="${escapeHtml(part.name)} ${uiText('재질')}">${materialOptions(part.materialKey)}</select>
              <input type="number" data-part-density value="${Number((part.densityKgPerMm3 / KG_PER_MM3_PER_G_PER_CM3).toFixed(6))}" step="0.01" min="0" aria-label="${escapeHtml(part.name)} ${uiText('밀도')}">
              <span class="cad-density-unit">g/cm³</span>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

function selectPart(index) {
  if (!Number.isInteger(index) || !getPartGroups()[index]) return;
  state.selectedPartIndex = index;
  el.parts.querySelectorAll('[data-part-index]').forEach((row, rowIndex) => {
    const selected = rowIndex === index;
    row.classList.toggle('active', selected);
    row.setAttribute('aria-selected', String(selected));
    const button = row.querySelector('[data-part-select]');
    button?.classList.toggle('active', selected);
    button?.setAttribute('aria-pressed', String(selected));
  });
}

function updatePartFromControl(control) {
  const row = control.closest('[data-part-index]');
  const group = getPartGroups()[Number(row?.dataset.partIndex)];
  if (!group) return;

  if (control.matches('[data-part-enabled]')) {
    group.parts.forEach(({ part }) => {
      part.enabled = control.checked;
      part.mesh.visible = part.enabled;
    });
    if (!control.checked && group.parts.some(({ part }) => (
      part === state.parts[state.snapFaceSelection?.partIndex]
    ))) {
      clearSnapFaceSelection();
      hideSnapMarker();
    }
  } else if (control.matches('[data-part-material]')) {
    const density = MATERIALS[control.value].density;
    group.parts.forEach(({ part }) => {
      part.materialKey = control.value;
      part.densityKgPerMm3 = density;
    });
    row.querySelector('[data-part-density]').value = Number((density / KG_PER_MM3_PER_G_PER_CM3).toFixed(6));
  } else if (control.matches('[data-part-density]')) {
    const density = Number(control.value) * KG_PER_MM3_PER_G_PER_CM3;
    group.parts.forEach(({ part }) => {
      part.densityKgPerMm3 = density;
      part.materialKey = 'custom';
    });
    row.querySelector('[data-part-material]').value = 'custom';
  }
  el.result.classList.add('hide');
  invalidateCadRobotSelection();
  if (state.centerMarker) state.centerMarker.visible = false;
}

function readVectorInputs(group) {
  return ['x', 'y', 'z'].map((axis) => Number(el.mode.querySelector(`[data-vector="${group}"][data-axis="${axis}"]`).value));
}

function writeVectorInputs(group, vector) {
  ['x', 'y', 'z'].forEach((axis, index) => {
    el.mode.querySelector(`[data-vector="${group}"][data-axis="${axis}"]`).value = Number(vector[index].toFixed(6));
  });
}

function readCoordinateInputs() {
  const origin = readVectorInputs('origin');
  const rotation = readVectorInputs('rotation');
  const tcp = readVectorInputs('tcp');
  if (![...origin, ...rotation, ...tcp].every(Number.isFinite)) throw new Error('Coordinate value is invalid.');
  state.origin.fromArray(origin);
  state.tcp.fromArray(tcp);
  applyRotationDegrees(rotation);
  updateHelpers();
}

function snapTypeInfo(type) {
  return SNAP_TYPES[type] || SNAP_TYPES.vertex;
}

function snapTypeLabelKey(type) {
  if (type === 'auto') return '자동 스냅';
  if (type === 'multi-point-center') return '다중 점 중심점';
  return snapTypeInfo(type).label;
}

function hideSnapMarker() {
  state.hoverSnap = null;
  if (el.snapMarker) el.snapMarker.hidden = true;
}

function formatSnapPoint(point) {
  return `X ${point.x.toFixed(3)} · Y ${point.y.toFixed(3)} · Z ${point.z.toFixed(3)} mm`;
}

function getValidatedPartBrepFaces(part) {
  const rawFaces = part?.brepFaces;
  const triangleCount = Math.floor((part?.mesh?.geometry?.index?.count
    ?? part?.mesh?.geometry?.getAttribute?.('position')?.count
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

function getSnapFaceTriangleRange(part, triangleIndex) {
  const brepFaces = getValidatedPartBrepFaces(part);
  if (brepFaces) {
    const faceIndex = brepFaces.findIndex((face) => (
      triangleIndex >= face.first && triangleIndex <= face.last
    ));
    if (faceIndex >= 0) {
      return {
        faceIndex,
        key: `${part.mesh.uuid}:step-face:${faceIndex}`,
        triangleRanges: [{ ...brepFaces[faceIndex] }]
      };
    }
  }
  return {
    faceIndex: triangleIndex,
    key: `${part.mesh.uuid}:triangle:${triangleIndex}`,
    triangleRanges: [{ first: triangleIndex, last: triangleIndex }]
  };
}

function pickSnapFaceAtPointer(pointerEvent) {
  if (!state.camera || !state.renderer) return null;
  const enabledMeshes = state.parts.filter((part) => part.enabled).map((part) => part.mesh);
  if (!enabledMeshes.length) return null;
  const bounds = state.renderer.domElement.getBoundingClientRect();
  if (bounds.width <= 0 || bounds.height <= 0) return null;
  const pointer = new THREE.Vector2(
    ((pointerEvent.clientX - bounds.left) / bounds.width) * 2 - 1,
    -((pointerEvent.clientY - bounds.top) / bounds.height) * 2 + 1
  );
  state.camera.updateMatrixWorld(true);
  state.scene?.updateMatrixWorld(true);
  state.visibilityRaycaster.setFromCamera(pointer, state.camera);
  const hit = state.visibilityRaycaster.intersectObjects(enabledMeshes, false)[0];
  const partIndex = Number(hit?.object?.userData?.modeDPartIndex);
  if (!hit?.object || !Number.isInteger(hit.faceIndex)
    || !Number.isInteger(partIndex) || !state.parts[partIndex]?.enabled) return null;
  const face = getSnapFaceTriangleRange(state.parts[partIndex], hit.faceIndex);
  return {
    ...face,
    mesh: hit.object,
    partIndex,
    point: hit.point.clone(),
    triangleIndex: hit.faceIndex
  };
}

function createSnapFaceOverlay(selection) {
  const geometry = selection?.mesh?.geometry;
  const position = geometry?.getAttribute('position');
  if (!geometry || !position || !selection?.triangleRanges?.length) return null;
  const index = geometry.getIndex();
  const vertices = [];
  selection.triangleRanges.forEach((range) => {
    for (let triangleIndex = range.first; triangleIndex <= range.last; triangleIndex += 1) {
      for (let corner = 0; corner < 3; corner += 1) {
        const offset = triangleIndex * 3 + corner;
        const vertexIndex = index ? index.getX(offset) : offset;
        if (!Number.isInteger(vertexIndex) || vertexIndex < 0 || vertexIndex >= position.count) continue;
        vertices.push(position.getX(vertexIndex), position.getY(vertexIndex), position.getZ(vertexIndex));
      }
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
  overlay.name = 'Mode D Snap Selected Face';
  overlay.userData.modeDSnapFaceOverlay = true;
  overlay.renderOrder = 1000;
  overlay.frustumCulled = false;
  selection.mesh.add(overlay);
  return overlay;
}

function clearSnapFaceSelection() {
  state.snapFaceOverlay?.removeFromParent();
  state.snapFaceOverlay?.geometry?.dispose();
  state.snapFaceOverlay?.material?.dispose();
  state.snapFaceOverlay = null;
  state.snapFaceSelection = null;
  state.snapFaceCandidates = [];
  clearSnapCandidateMarkers();
}

function clearSnapCandidateMarkers() {
  state.snapCandidateMarkers.forEach((marker) => marker.remove());
  state.snapCandidateMarkers = [];
  state.snapDisplayedCandidates = [];
}

function hideSnapCandidateMarkersForNavigation() {
  state.snapCandidateMarkers.forEach((marker) => { marker.hidden = true; });
  state.snapDisplayedCandidates = [];
}

function createSnapCandidateMarker() {
  const marker = document.createElement('div');
  marker.className = 'cad-snap-marker cad-snap-candidate-marker';
  marker.setAttribute('aria-hidden', 'true');
  marker.innerHTML = '<span></span>';
  el.snapMarker?.parentElement?.appendChild(marker);
  return marker;
}

function updateSnapCandidateMarkers() {
  const markerParent = el.snapMarker?.parentElement;
  if (!state.pickMode || !state.snapFaceSelection || !state.snapFaceCandidates.length
    || !markerParent || !state.renderer || !state.camera) {
    clearSnapCandidateMarkers();
    return;
  }
  const bounds = state.renderer.domElement.getBoundingClientRect();
  if (bounds.width <= 0 || bounds.height <= 0) {
    clearSnapCandidateMarkers();
    return;
  }

  state.camera.updateMatrixWorld(true);
  state.scene?.updateMatrixWorld(true);
  const markerParentBounds = markerParent.getBoundingClientRect();
  const candidates = [];
  const markerCells = new Map();
  const markerSpacing = 7;
  const candidatesByType = new Map();
  state.snapFaceCandidates.forEach((candidate) => {
    const candidatesForType = candidatesByType.get(candidate.type) || [];
    candidatesForType.push(candidate);
    candidatesByType.set(candidate.type, candidatesForType);
  });
  const orderedCandidates = [];
  const orderedTypes = new Set();
  CAD_SNAP_MARKER_TYPE_ORDER.forEach((type) => {
    orderedTypes.add(type);
    orderedCandidates.push(...(candidatesByType.get(type) || []));
  });
  candidatesByType.forEach((candidatesForType, type) => {
    if (!orderedTypes.has(type)) orderedCandidates.push(...candidatesForType);
  });

  const projected = new THREE.Vector3();
  for (const candidate of orderedCandidates) {
    if (!state.parts[candidate.partIndex]?.enabled) continue;
    projected.copy(candidate.point).project(state.camera);
    if (projected.z < -1 || projected.z > 1) continue;
    const screenX = (projected.x * 0.5 + 0.5) * bounds.width;
    const screenY = (-projected.y * 0.5 + 0.5) * bounds.height;
    if (screenX < -12 || screenX > bounds.width + 12
      || screenY < -12 || screenY > bounds.height + 12) continue;

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
      const current = candidates[duplicateIndex];
      if (snapTypeInfo(candidate.type).priority < snapTypeInfo(current.candidate.type).priority) {
        candidates[duplicateIndex] = item;
      }
      continue;
    }
    const cellKey = `${cellX}:${cellY}`;
    const cell = markerCells.get(cellKey) || [];
    cell.push(candidates.length);
    markerCells.set(cellKey, cell);
    candidates.push(item);
    if (candidates.length >= MAX_VISIBLE_CAD_SNAP_MARKERS) break;
  }

  state.snapDisplayedCandidates = candidates.map(({ candidate }) => candidate);
  while (state.snapCandidateMarkers.length < candidates.length) {
    state.snapCandidateMarkers.push(createSnapCandidateMarker());
  }
  const markerScale = el.snapMarker.style.getPropertyValue('--cad-snap-camera-scale') || '1';
  state.snapCandidateMarkers.forEach((marker, index) => {
    const item = candidates[index];
    marker.hidden = !item;
    if (!item) return;
    marker.style.left = `${bounds.left + item.screenX - markerParentBounds.left - markerParent.clientLeft}px`;
    marker.style.top = `${bounds.top + item.screenY - markerParentBounds.top - markerParent.clientTop}px`;
    marker.style.setProperty('--cad-snap-camera-scale', markerScale);
    marker.dataset.snapType = item.candidate.type;
  });
}

function selectSnapFace(selection) {
  if (!selection?.mesh || !state.parts[selection.partIndex]?.enabled) return false;
  clearSnapFaceSelection();
  state.snapFaceSelection = {
    ...selection,
    point: selection.point.clone(),
    triangleRanges: selection.triangleRanges.map((range) => ({ ...range }))
  };
  state.snapFaceOverlay = createSnapFaceOverlay(state.snapFaceSelection);
  const part = state.parts[selection.partIndex];
  try {
    const snapData = buildStepSnapCandidates({
      attributes: part.mesh.geometry.attributes,
      index: part.mesh.geometry.index,
      brep_faces: getValidatedPartBrepFaces(part) || []
    }, {
      triangleRanges: selection.triangleRanges,
      maxVirtualPairs: 6000,
      maxVirtualCandidates: 160
    });
    part.mesh.updateWorldMatrix(true, false);
    state.snapFaceCandidates = snapData.candidates.map((candidate) => ({
      ...candidate,
      point: new THREE.Vector3(...candidate.point).applyMatrix4(part.mesh.matrixWorld),
      partIndex: selection.partIndex,
      faceKey: selection.key
    }));
    updateSnapCandidateMarkers();
  } catch (error) {
    console.warn('Selected CAD face snap candidate generation failed:', error);
    clearSnapFaceSelection();
    setStatus('선택한 면의 스냅 후보를 계산할 수 없습니다.', 'error');
    return false;
  }
  setStatus('선택한 면의 스냅 후보를 클릭하세요.');
  setSnapReadout('선택한 면의 스냅 후보를 클릭하세요.');
  return true;
}

function isSnapCandidateVisible(candidate, projected, enabledMeshes) {
  if (!state.camera || !state.renderer) return false;
  state.visibilityRaycaster.setFromCamera(new THREE.Vector2(projected.x, projected.y), state.camera);
  const frontHit = state.visibilityRaycaster.intersectObjects(enabledMeshes, false)[0] || null;
  if (!frontHit) return true;

  const candidateOffset = candidate.point.clone().sub(state.visibilityRaycaster.ray.origin);
  const candidateDistance = candidateOffset.dot(state.visibilityRaycaster.ray.direction);
  if (!Number.isFinite(candidateDistance) || candidateDistance <= 0) return false;
  const viewportHeight = Math.max(state.renderer.domElement.clientHeight, 1);
  const worldUnitsPerPixel = (
    2 * candidateDistance * Math.tan(THREE.MathUtils.degToRad(state.camera.fov * 0.5))
  ) / viewportHeight;
  const depthTolerance = Math.max(worldUnitsPerPixel * 2.5, state.helperScale * 1e-5, 1e-4);
  return candidateDistance <= frontHit.distance + depthTolerance;
}

function findSnapAtPointer(pointerEvent) {
  if (!state.parts.length || !state.camera || !state.renderer || !state.scene) return null;
  state.camera.updateMatrixWorld(true);
  state.scene.updateMatrixWorld(true);
  const bounds = state.renderer.domElement.getBoundingClientRect();
  const pointerX = pointerEvent.clientX - bounds.left;
  const pointerY = pointerEvent.clientY - bounds.top;
  const enabledMeshes = state.parts.filter((part) => part.enabled).map((part) => part.mesh);
  const requiredType = isMultiPointCenterMode() ? 'auto' : state.snapType;

  let best = null;
  const nearbyCandidates = [];
  state.snapFaceCandidates.forEach((candidate) => {
    if (!state.parts[candidate.partIndex]?.enabled) return;
    if (requiredType !== 'auto' && candidate.type !== requiredType) return;
    const projected = candidate.point.clone().project(state.camera);
    if (projected.z < -1 || projected.z > 1) return;
    const screenX = (projected.x * 0.5 + 0.5) * bounds.width;
    const screenY = (-projected.y * 0.5 + 0.5) * bounds.height;
    const pixelDistance = Math.hypot(screenX - pointerX, screenY - pointerY);
    if (pixelDistance > state.snapRadiusPx) return;
    const priority = state.snapType === 'auto' ? snapTypeInfo(candidate.type).priority : 0;
    const score = pixelDistance + priority * 0.08;
    const cameraDistance = state.camera.position.distanceTo(candidate.point);
    nearbyCandidates.push({
      ...candidate,
      projected,
      screenX: screenX + bounds.left,
      screenY: screenY + bounds.top,
      pixelDistance,
      cameraDistance,
      score
    });
  });
  nearbyCandidates.sort((first, second) => first.score - second.score || first.cameraDistance - second.cameraDistance);
  // The selected face owns these candidates. Match 3D Simulation by letting
  // every displayed marker remain selectable instead of hiding it behind a
  // second whole-model visibility test.
  best = state.snapFaceSelection
    ? nearbyCandidates[0] || null
    : nearbyCandidates.find((candidate) => isSnapCandidateVisible(candidate, candidate.projected, enabledMeshes)) || null;
  return best;
}

function scheduleSnapPreview() {
  if (!state.pickMode || !state.parts.length || !state.lastPointer || state.pointerMoveFrame) return;
  state.pointerMoveFrame = requestAnimationFrame(() => {
    state.pointerMoveFrame = null;
    if (state.pickMode && state.lastPointer) showSnapMarker(findSnapAtPointer(state.lastPointer));
  });
}

function showSnapMarker(snap) {
  if (!snap) {
    hideSnapMarker();
    if (state.pickMode) {
      setSnapReadout(isMultiPointCenterMode()
        ? multiCenterInstruction
        : state.snapFaceSelection
          ? '선택한 면의 스냅 후보를 클릭하세요.'
          : '스냅할 CAD 면을 클릭하세요.');
    }
    return;
  }
  state.hoverSnap = snap;
  const info = snapTypeInfo(snap.type);
  const markerParent = el.snapMarker.parentElement;
  const shellBounds = markerParent.getBoundingClientRect();
  const markerX = snap.screenX - shellBounds.left - markerParent.clientLeft;
  const markerY = snap.screenY - shellBounds.top - markerParent.clientTop;
  el.snapMarker.style.left = `${markerX}px`;
  el.snapMarker.style.top = `${markerY}px`;
  el.snapMarker.classList.toggle('label-left', markerX > markerParent.clientWidth - 150);
  el.snapMarker.dataset.snapType = snap.type;
  el.snapSymbol.textContent = info.symbol;
  el.snapLabel.textContent = uiText(info.label);
  el.snapMarker.hidden = false;
  setSnapReadout(() => `${uiText(info.label)} · ${formatSnapPoint(snap.point)}`);
}

function setPickMode(mode) {
  const nextPickMode = state.pickMode === mode ? null : mode;
  if (nextPickMode !== state.pickMode) resetMultiPoints();
  clearSnapFaceSelection();
  state.pickMode = nextPickMode;
  el.mode.querySelectorAll('[data-pick]').forEach((button) => button.classList.toggle('active', button.dataset.pick === state.pickMode));
  el.viewport.classList.toggle('is-picking', Boolean(state.pickMode));
  const messages = {
    origin: 'Tool 원점을 선택하세요.',
    tcp: 'TCP 위치를 선택하세요.'
  };
  updateRotationHandlerVisibility();
  updateMultiCenterControls();
  if (state.pickMode) {
    setStatus(messages[state.pickMode]);
    setSnapReadout(isMultiPointCenterMode()
      ? multiCenterInstruction
      : '스냅할 CAD 면을 클릭하세요.');
  } else {
    hideSnapMarker();
    if (state.parts.length) setStatus(() => uiFormat('{format} 파일 분석 완료', {
      format: state.sourceCadFormat || 'CAD'
    }), 'ok');
  }
}

function commitSnapPoint(point, selectedLabelKey) {
  if (state.pickMode === 'origin') {
    state.origin.copy(point);
    writeVectorInputs('origin', state.origin.toArray());
  } else if (state.pickMode === 'tcp') {
    state.tcp.copy(point);
    writeVectorInputs('tcp', state.tcp.toArray());
  }
  const selectedPoint = formatSnapPoint(point);
  updateHelpers();
  setPickMode(null);
  setStatus(() => `${uiText(selectedLabelKey)} ${uiText('스냅 선택')} · ${selectedPoint}`, 'ok');
  setSnapReadout(() => `${uiText(selectedLabelKey)} · ${selectedPoint}`);
  el.result.classList.add('hide');
  invalidateCadRobotSelection();
  if (state.centerMarker) state.centerMarker.visible = false;
}

function addMultiPoint(snap) {
  if (state.multiPoints.length >= 4) {
    setStatus('최대 4개까지 선택할 수 있습니다.', 'error');
    return;
  }
  const duplicateTolerance = Math.max(state.helperScale * 1e-5, 1e-4);
  if (state.multiPoints.some((point) => point.distanceTo(snap.point) <= duplicateTolerance)) {
    setStatus('중복된 스냅 점입니다.', 'error');
    return;
  }
  state.multiPoints.push(snap.point.clone());
  clearSnapFaceSelection();
  hideSnapMarker();
  updateMultiCenterHelper();
  updateMultiCenterControls();
  const countLabel = () => `${uiText('다중 점 선택')} ${state.multiPoints.length}/4`;
  if (state.multiPoints.length >= 2) {
    setSnapReadout(() => `${countLabel()} · ${uiText('다중 점 중심점')} ${formatSnapPoint(getMultiPointCenter())}`);
  } else {
    setSnapReadout(() => `${countLabel()} · ${uiText('스냅 점 2~4개를 선택하세요.')}`);
  }
  setStatus(countLabel, 'ok');
}

function applyMultiPointCenter() {
  if (!state.pickMode || state.multiPoints.length < 2 || state.multiPoints.length > 4) return;
  try {
    commitSnapPoint(getMultiPointCenter(), '다중 점 중심점');
  } catch {
    setStatus('스냅 점 2~4개를 선택하세요.', 'error');
  }
}

function onPointerDown(event) {
  state.pointerDown = { x: event.clientX, y: event.clientY };
}

function onPointerMove(event) {
  if (!state.pickMode || !state.parts.length) {
    hideSnapMarker();
    return;
  }
  state.lastPointer = { clientX: event.clientX, clientY: event.clientY };
  scheduleSnapPreview();
}

function onPointerUp(event) {
  if (!state.pickMode || !state.parts.length || !state.pointerDown) return;
  const movement = Math.hypot(event.clientX - state.pointerDown.x, event.clientY - state.pointerDown.y);
  state.pointerDown = null;
  if (movement > 5) return;
  const snap = state.snapFaceSelection ? findSnapAtPointer(event) : null;

  try {
    if (snap) {
      if (isMultiPointCenterMode()) {
        addMultiPoint(snap);
        return;
      }
      commitSnapPoint(snap.point, snapTypeInfo(snap.type).label);
      return;
    }

    const selection = pickSnapFaceAtPointer(event);
    if (selection && selection.key !== state.snapFaceSelection?.key && selectSnapFace(selection)) {
      showSnapMarker(findSnapAtPointer(event));
      return;
    }
    setStatus(selection
      ? '선택한 면의 스냅 후보를 클릭하세요.'
      : '스냅할 CAD 면을 클릭하세요.', 'error');
  } catch (error) {
    setStatus('좌표계 방향이 올바르지 않습니다.', 'error');
  }
}

function renderTriple(container, labels, values, unit, digits) {
  container.innerHTML = values.map((value, index) => `
    <div>${labels[index]}<b>${value.toFixed(digits)} ${unit}</b></div>
  `).join('');
}

function getCadRobotModels() {
  return Array.isArray(window.ToolSelectorRobotModels) ? window.ToolSelectorRobotModels : [];
}

function getSelectedCadRobot() {
  const models = getCadRobotModels();
  const index = Number(el.robot?.value);
  return Number.isInteger(index) && index >= 0 && index < models.length ? models[index] : null;
}

function updateCadRobotSpec(preserveJ5Offset = false) {
  const robot = getSelectedCadRobot();
  if (!robot) return;

  const isScara = robot.type === 'scara';
  el.robotJ5OffsetRow.hidden = isScara;
  if (!isScara && !preserveJ5Offset) el.robotJ5Offset.value = robot.j5;

  el.robotSpec.textContent = isScara
    ? `${uiText('형식 SCARA')} · ${uiText('정격 부하')} ${robot.rated} kg · ${uiText('최대 부하')} ${robot.load} kg · ${uiText('J4 정격 관성모멘트')} ${robot.i4r} kgm² · ${uiText('J4 허용 관성모멘트')} ${robot.i4} kgm²`
    : `${uiText('허용 질량')} ${robot.load} kg · ${uiText('J5 허용 토크')} ${robot.t5} N·m · ${uiText('J6 허용 토크')} ${robot.t6} N·m · ${uiText('J5 허용 관성모멘트')} ${robot.i5} kgm² · ${uiText('J6 허용 관성모멘트')} ${robot.i6} kgm²`;
}

function updateCadRobotSelectionAvailability() {
  const available = Boolean(state.massProperties && getSelectedCadRobot());
  if (el.robotCalculate) el.robotCalculate.disabled = !available;
  if (!available && el.robotResult) el.robotResult.hidden = true;
}

function invalidateCadRobotSelection() {
  state.massProperties = null;
  updateCadRobotSelectionAvailability();
}

function setupCadRobotSelection() {
  const models = getCadRobotModels();
  if (!el.robot || !models.length) return;

  const articulated = document.createElement('optgroup');
  articulated.label = uiText('다관절로봇');
  const scara = document.createElement('optgroup');
  scara.label = 'SCARA';
  models.forEach((robot, index) => {
    const option = document.createElement('option');
    option.value = String(index);
    option.textContent = robot.name;
    (robot.type === 'scara' ? scara : articulated).appendChild(option);
  });
  el.robot.replaceChildren(articulated, scara);
  el.robot.value = String(Math.max(models.findIndex((robot) => robot.name === 'R25'), 0));
  updateCadRobotSpec();
  updateCadRobotSelectionAvailability();
}

function calculateCadRobotSuitability() {
  const robot = getSelectedCadRobot();
  const massProperties = state.massProperties;
  if (!robot || !massProperties) return;

  const mass = massProperties.massKg;
  const [xMm, yMm, zMm] = massProperties.centerOfMassToolMm;
  const centerInertia = massProperties.inertiaCenterKgM2;
  const centerValues = [xMm, yMm, zMm].map(Number);
  const inertiaValues = [centerInertia?.[1]?.[1], centerInertia?.[2]?.[2]].map(Number);
  if (![mass, ...centerValues, ...inertiaValues].every(Number.isFinite)) return;

  const isScara = robot.type === 'scara';
  const [x, y, centerZ] = centerValues.map((value) => value / 1000);
  const j5OffsetInput = el.robotJ5Offset.value.trim();
  const enteredJ5Offset = j5OffsetInput === '' ? Number.NaN : Number(j5OffsetInput);
  const j5Offset = Number.isFinite(enteredJ5Offset) ? enteredJ5Offset : robot.j5;
  const z = centerZ + (isScara ? 0 : j5Offset / 1000);
  const j5ToCenter = Math.hypot(z, x);
  const j6ToCenter = Math.hypot(x, y);
  const j5Torque = mass * ROBOT_SELECTION_GRAVITY * j5ToCenter;
  const j6Torque = mass * ROBOT_SELECTION_GRAVITY * j6ToCenter;
  const j5Inertia = centerInertia[1][1] + mass * (x * x + z * z);
  const j6Inertia = centerInertia[2][2] + mass * (x * x + y * y);
  const rows = isScara
    ? [[uiText('최대 부하'), mass, robot.load, 'kg'], [uiText('J4 허용 관성모멘트'), j6Inertia, robot.i4, 'kgm²']]
    : [
      [uiText('허용 질량'), mass, robot.load, 'kg'],
      [uiText('J5 허용 토크'), j5Torque, robot.t5, 'N·m'],
      [uiText('J6 허용 토크'), j6Torque, robot.t6, 'N·m'],
      [uiText('J5 허용 관성모멘트'), j5Inertia, robot.i5, 'kgm²'],
      [uiText('J6 허용 관성모멘트'), j6Inertia, robot.i6, 'kgm²']
    ];

  let anyNg = false;
  let anyTight = false;
  el.robotTable.innerHTML = rows.map(([label, value, limit, unit]) => {
    const margin = (1 - value / limit) * 100;
    const isWithinLimit = value <= limit;
    const isTight = isWithinLimit && margin < 10;
    if (!isWithinLimit) anyNg = true;
    if (isTight) anyTight = true;
    const statusClass = !isWithinLimit ? 'ng' : isTight ? 'warn' : 'ok';
    const status = !isWithinLimit ? 'NG' : isTight ? uiText('OK (마진부족)') : 'OK';
    return `<tr><td>${label}</td><td>${value.toFixed(3)} ${unit}</td><td>${limit.toFixed(2)} ${unit}</td><td>${margin.toFixed(1)}%</td><td class="${statusClass}">${status}</td></tr>`;
  }).join('');
  el.robotSummary.innerHTML = isScara
    ? `<div>${uiText('총 질량')}<b>${mass.toFixed(3)} kg</b></div><div>${uiText('CoG 반경 (XY)')}<b>${(j6ToCenter * 1000).toFixed(1)} mm</b></div><div>${uiText('J4 관성')}<b>${j6Inertia.toFixed(3)} kgm²</b></div>`
    : `<div>${uiText('총 질량')}<b>${mass.toFixed(3)} kg</b></div><div>${uiText('J5→CoG')}<b>${(j5ToCenter * 1000).toFixed(1)} mm</b></div><div>${uiText('J6→CoG')}<b>${(j6ToCenter * 1000).toFixed(1)} mm</b></div>`;

  el.robotOverall.removeAttribute('style');
  if (anyNg) {
    el.robotOverall.className = 'overall ng';
    el.robotOverall.textContent = `❌ ${uiText('부적합 — 상위 모델 또는 Tool 재설계 필요')}`;
  } else if (anyTight) {
    el.robotOverall.className = 'overall ng';
    el.robotOverall.style.background = 'rgba(245,158,11,.1)';
    el.robotOverall.style.borderColor = 'rgba(245,158,11,.3)';
    el.robotOverall.style.color = '#fbbf24';
    el.robotOverall.textContent = `⚠️ ${uiText('적합하나 마진 부족')}`;
  } else {
    el.robotOverall.className = 'overall ok';
    el.robotOverall.textContent = `✅ ${uiText('적합 — 설치 가능')}`;
  }
  el.robotResult.hidden = false;
}

function calculateMassProperties() {
  try {
    invalidateCadRobotSelection();
    if (!state.parts.length) throw new Error(uiText('CAD 파일을 먼저 불러오세요.'));
    readCoordinateInputs();
    const frame = getFrame();
    const result = combineStepParts(state.parts, frame);
    const tcpTool = pointInFrame(state.tcp.toArray(), frame);

    el.mass.textContent = `${result.massKg.toFixed(4)} kg`;
    renderTriple(el.center, ['X', 'Y', 'Z'], result.centerOfMassToolMm, 'mm', 3);
    renderTriple(
      el.originInertia,
      ['Ixx', 'Iyy', 'Izz'],
      [result.inertiaOriginKgM2[0][0], result.inertiaOriginKgM2[1][1], result.inertiaOriginKgM2[2][2]],
      'kg·m²',
      6
    );
    renderTriple(
      el.centerInertia,
      ['Ixx', 'Iyy', 'Izz'],
      [result.inertiaCenterKgM2[0][0], result.inertiaCenterKgM2[1][1], result.inertiaCenterKgM2[2][2]],
      'kg·m²',
      6
    );
    if (state.centerMarker) {
      state.centerMarker.position.fromArray(result.centerOfMassCadMm);
      state.centerMarker.visible = true;
    }
    if (state.tcpMarker) state.tcpMarker.userData.toolCoordinatesMm = tcpTool;
    state.massProperties = {
      massKg: result.massKg,
      centerOfMassToolMm: [...result.centerOfMassToolMm],
      inertiaCenterKgM2: result.inertiaCenterKgM2.map((row) => [...row])
    };
    updateCadRobotSelectionAvailability();
    calculateCadRobotSuitability();
    el.result.classList.remove('hide');
    setStatus('계산이 완료되었습니다.', 'ok');
    el.result.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (error) {
    console.error('Mode D calculation failed:', error);
    setStatus(error.message || '계산할 수 없습니다.', 'error');
  }
}

function exportStepInWorker(payload, onProgress) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./step-export-worker.mjs', import.meta.url), { type: 'module' });
    const finish = (callback, value) => {
      worker.terminate();
      callback(value);
    };
    worker.addEventListener('message', (event) => {
      if (event.data?.type === 'progress') {
        onProgress(event.data.message);
        return;
      }
      if (event.data?.type === 'complete') {
        finish(resolve, {
          buffer: event.data.buffer,
          fileName: event.data.fileName
        });
        return;
      }
      if (event.data?.type === 'error') finish(reject, new Error(event.data.message));
    });
    worker.addEventListener('error', (event) => {
      finish(reject, new Error(event.message || 'STEP export worker failed.'));
    });
    worker.postMessage(payload, [payload.buffer]);
  });
}

function downloadStepBuffer(buffer, fileName) {
  const blob = new Blob([buffer], { type: 'application/step' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function exportStepWithToolFrame() {
  if (!state.sourceStepFile || state.exportingStep) return;
  try {
    readCoordinateInputs();
    const selectedPartCount = state.parts.filter((part) => part.enabled).length;
    if (!selectedPartCount) throw new Error(uiText('내보낼 부품을 하나 이상 선택하세요.'));
    state.exportingStep = true;
    el.exportStep.disabled = true;
    setStatus('STEP 파일 내보내기 엔진을 준비하는 중입니다.');
    const buffer = await state.sourceStepFile.arrayBuffer();
    const result = await exportStepInWorker({
      buffer,
      sourceName: state.sourceStepFile.name,
      originMm: state.origin.toArray(),
      rotationDegrees: state.rotationDegrees.toArray(),
      cadParts: state.parts.map((part) => ({
        name: part.name,
        color: part.sourceColorHex,
        enabled: part.enabled
      }))
    }, (message) => setStatus(message));
    downloadStepBuffer(result.buffer, result.fileName);
    setStatus(() => uiFormat('STEP 파일 내보내기 완료 · {count}개 부품 · {name}', {
      count: selectedPartCount,
      name: result.fileName
    }), 'ok');
  } catch (error) {
    console.error('STEP export failed:', error);
    setStatus(`${uiText('STEP 파일을 내보낼 수 없습니다.')} ${error.message || ''}`.trim(), 'error');
  } finally {
    state.exportingStep = false;
    el.exportStep.disabled = !state.sourceStepFile;
  }
}

function bindEvents() {
  el.fileInput.addEventListener('change', () => {
    const [file] = el.fileInput.files;
    el.fileInput.value = '';
    if (file) loadCadFile(file);
  });
  el.parts.addEventListener('click', (event) => {
    const button = event.target.closest('[data-part-select]');
    if (!button) return;
    const row = button.closest('[data-part-index]');
    selectPart(Number(row?.dataset.partIndex));
  });
  el.parts.addEventListener('change', (event) => updatePartFromControl(event.target));
  el.mode.querySelectorAll('[data-pick]').forEach((button) => button.addEventListener('click', () => setPickMode(button.dataset.pick)));
  el.snapType.addEventListener('change', () => {
    state.snapType = el.snapType.value;
    resetMultiPoints();
    if (state.pickMode && state.lastPointer) showSnapMarker(findSnapAtPointer(state.lastPointer));
    else setSnapReadout(() => `${uiText('스냅 유형')} · ${uiText(snapTypeLabelKey(state.snapType))}`);
  });
  el.snapRadius.addEventListener('input', () => {
    state.snapRadiusPx = Number(el.snapRadius.value);
    el.snapRadiusValue.textContent = `${state.snapRadiusPx} px`;
    if (state.pickMode && state.lastPointer) showSnapMarker(findSnapAtPointer(state.lastPointer));
  });
  el.outlineToggle.addEventListener('click', () => setOutlineMode(!state.outlineMode));
  el.gridToggle.addEventListener('click', toggleGrid);
  el.exportStep.addEventListener('click', exportStepWithToolFrame);
  el.multiCenterApply.addEventListener('click', applyMultiPointCenter);
  el.multiCenterReset.addEventListener('click', () => {
    resetMultiPoints();
    setSnapReadout(multiCenterInstruction);
  });
  el.rotationHandlerToggle.addEventListener('change', updateRotationHandlerVisibility);
  el.robot?.addEventListener('change', () => {
    updateCadRobotSpec();
    calculateCadRobotSuitability();
  });
  el.robotJ5Offset?.addEventListener('change', calculateCadRobotSuitability);
  el.robotCalculate?.addEventListener('click', calculateCadRobotSuitability);
  el.mode.querySelectorAll('[data-vector]').forEach((input) => {
    const eventName = input.dataset.vector === 'rotation' ? 'input' : 'change';
    input.addEventListener(eventName, () => {
      if (input.value === '') return;
      try {
        readCoordinateInputs();
        el.result.classList.add('hide');
        invalidateCadRobotSelection();
        if (state.centerMarker) state.centerMarker.visible = false;
      } catch {
        setStatus('좌표계 방향이 올바르지 않습니다.', 'error');
      }
    });
  });
  el.calculate.addEventListener('click', calculateMassProperties);
  document.addEventListener('inorobot:i18nready', refreshDynamicLanguage);
  document.addEventListener('inorobot:languagechange', refreshDynamicLanguage);
}

function refreshDynamicLanguage() {
  renderParts();
  if (el.robot) {
    const [articulated] = el.robot.querySelectorAll('optgroup');
    if (articulated) articulated.label = uiText('다관절로봇');
    updateCadRobotSpec(true);
  }
  updateOutlineToggleUi();
  updateGridVisibility();
  updateMultiCenterControls();
  renderStatus();
  renderSnapReadout();
  if (state.hoverSnap) el.snapLabel.textContent = uiText(snapTypeInfo(state.hoverSnap.type).label);
  calculateCadRobotSuitability();
}

function init() {
  cacheElements();
  if (!el.mode || !el.viewport) return;
  const previewReady = setupScene();
  setupCadRobotSelection();
  bindEvents();
  renderParts();
  state.snapType = el.snapType.value;
  state.snapRadiusPx = Number(el.snapRadius.value);
  el.snapRadiusValue.textContent = `${state.snapRadiusPx} px`;
  writeVectorInputs('origin', state.origin.toArray());
  writeVectorInputs('rotation', state.rotationDegrees.toArray());
  writeVectorInputs('tcp', state.tcp.toArray());
  applyRotationDegrees(state.rotationDegrees.toArray());
  updateHelpers();
  updateOutlineToggleUi();
  updateGridVisibility();
  updateRotationHandlerVisibility();
  updateMultiCenterControls();
  if (!previewReady) {
    setStatus('3D 미리보기를 사용할 수 없지만 CAD 불러오기와 계산은 계속할 수 있습니다.', 'error');
  }
  window.ToolModeD = {
    activate() {
      requestAnimationFrame(() => {
        resizeRenderer();
        updateRotationHandlerVisibility();
      });
    },
    calculate: calculateMassProperties,
    getSnapState() {
      return {
        type: state.snapType,
        radiusPx: state.snapRadiusPx,
        candidateCount: state.snapCandidates.length,
        gridVisible: state.gridVisible,
        outlineMode: state.outlineMode,
        pickMode: state.pickMode,
        multiPoints: state.multiPoints.map((point) => point.toArray()),
        rotationDegrees: state.rotationDegrees.toArray(),
        axisDirections: {
          x: state.xDirection.toArray(),
          y: state.yDirection.toArray(),
          z: state.zDirection.toArray()
        }
      };
    }
  };
}

init();
