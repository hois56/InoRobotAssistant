import * as THREE from './vendor/three/three.module.js';
import { OrbitControls } from './vendor/three/examples/jsm/controls/OrbitControls.js';
import { TransformControls } from './vendor/three/examples/jsm/controls/TransformControls.js';
import { STLLoader } from './vendor/three/examples/jsm/loaders/STLLoader.js';
import { enableContinuousTransformRotation } from './continuous-transform-rotation.mjs?v=20260719-1';
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
const MAX_DETAILED_SNAP_TRIANGLES = 200000;
const AXIS_COLORS = Object.freeze({ x: '#d32f2f', y: '#388e3c', z: '#1976d2' });
const HELPER_SCREEN_PIXELS = Object.freeze({
  axes: 72,
  tcp: 18,
  centerOfMass: 16,
  selectedSnap: 10,
  multiPointCenter: 14
});
const SNAP_MARKER_CAMERA_SCALE = Object.freeze({ min: 0.55, max: 1.25 });
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
  exportingStep: false
};

const el = {};
const uiText = (value) => window.InoRobotI18n ? window.InoRobotI18n.translate(String(value)) : String(value);
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
    fileName: document.getElementById('cad-file-name'),
    status: document.getElementById('cad-status'),
    parts: document.getElementById('cad-parts-list'),
    result: document.getElementById('cad-result'),
    mass: document.getElementById('cad-result-mass'),
    center: document.getElementById('cad-result-center'),
    originInertia: document.getElementById('cad-result-origin-inertia'),
    centerInertia: document.getElementById('cad-result-center-inertia'),
    calculate: document.getElementById('cad-calculate'),
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

    // Match the 3D Simulation camera interaction exactly: left drag rotates,
    // the wheel zooms, and right drag pans with OrbitControls defaults.
    state.controls = new OrbitControls(state.camera, state.renderer.domElement);
    state.controls.enableDamping = false;
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
  state.rotationDegrees.set(
    THREE.MathUtils.radToDeg(euler.x),
    THREE.MathUtils.radToDeg(euler.y),
    THREE.MathUtils.radToDeg(euler.z)
  );
  setDirectionsFromFrameObject();
  writeVectorInputs('rotation', state.rotationDegrees.toArray());
  updateHelpers();
  el.result.classList.add('hide');
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
  disposePartOutlines();
  state.parts.forEach((part) => {
    part.mesh.geometry.dispose();
    part.mesh.material.dispose();
    part.mesh.removeFromParent();
  });
  state.parts = [];
  state.snapCandidates = [];
  state.snapMarkerReferenceDistance = null;
  el.snapMarker?.style.setProperty('--cad-snap-camera-scale', '1');
  state.hoverSnap = null;
  resetMultiPoints();
  hideSnapMarker();
  if (state.centerMarker) state.centerMarker.visible = false;
  state.sourceStepFile = null;
  state.sourceCadFormat = null;
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

function importStepInWorker(buffer, onProgress) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./step-import-worker.js', import.meta.url));
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
      buffer,
      options: {
        linearUnit: 'millimeter',
        linearDeflectionType: 'bounding_box_ratio',
        linearDeflection: 0.00025,
        angularDeflection: 0.25
      }
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

async function importStepOnMainThread(buffer, onProgress) {
  if (!(buffer instanceof ArrayBuffer)) throw new Error('STEP source data is missing.');
  onProgress?.('STEP 파일 해석 엔진을 준비하는 중입니다.');
  const occt = await getOcctImporter();
  const result = occt.ReadStepFile(new Uint8Array(buffer), {
    linearUnit: 'millimeter',
    linearDeflectionType: 'bounding_box_ratio',
    linearDeflection: 0.00025,
    angularDeflection: 0.25
  });
  if (!result?.success || !Array.isArray(result.meshes)) throw new Error('CAD file could not be read.');
  return result;
}

async function importStepWithFallback(buffer, onProgress) {
  try {
    return await importStepInWorker(buffer, onProgress);
  } catch (workerError) {
    console.warn('STEP worker import failed; retrying with the main-thread parser.', workerError);
    onProgress?.('STEP 파일을 다시 해석하는 중입니다.');
    return importStepOnMainThread(buffer, onProgress);
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

async function loadCadFile(file) {
  const extension = file.name.split('.').pop()?.toLowerCase();
  if (!['step', 'stp', 'stl'].includes(extension)) {
    setStatus('STEP/STP/STL 파일만 선택할 수 있습니다.', 'error');
    el.fileInput.value = '';
    return;
  }

  const sourceFormat = extension === 'stl' ? 'STL' : 'STEP';
  setStatus(`${sourceFormat} 파일을 불러오는 중입니다.`);
  el.fileName.textContent = file.name;
  el.calculate.disabled = true;
  clearParts();
  resetCoordinateValues();

  try {
    let result;
    if (extension === 'stl') {
      result = { success: true, meshes: [await createStlMeshDefinition(file)] };
    } else {
      const buffer = await file.arrayBuffer();
      result = await importStepWithFallback(buffer, (message) => setStatus(message));
    }
    if (!result?.success || !Array.isArray(result.meshes)) throw new Error('CAD file could not be read.');

    let remainingDetailedTriangles = MAX_DETAILED_SNAP_TRIANGLES;
    let simplifiedSnapPartCount = 0;
    for (let index = 0; index < result.meshes.length; index += 1) {
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
        mesh.name = meshDefinition.name || `Part ${index + 1}`;
        state.modelGroup.add(mesh);
        const partIndex = state.parts.length;
        state.parts.push({
          name: mesh.name,
          mesh,
          geometry: geometryProperties,
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
        setStatus(`${sourceFormat} 파일을 불러오는 중입니다. (${index + 1}/${result.meshes.length})`);
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
      ? ` · 대용량 최적화 ${simplifiedSnapPartCount.toLocaleString()}개 부품`
      : '';
    setStatus(`${sourceFormat} 파일 분석 완료 · ${uiText('스냅 후보')} ${state.snapCandidates.length.toLocaleString()}${simplifiedNote}`, 'ok');
  } catch (error) {
    console.error('STEP import failed:', error);
    clearParts();
    setStatus(`${sourceFormat} 파일을 해석할 수 없습니다. ${error.message}`, 'error');
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

function renderParts() {
  if (!state.parts.length) {
    el.parts.innerHTML = `<div class="cad-empty">${uiText('CAD 파일을 먼저 불러오세요.')}</div>`;
    return;
  }
  el.parts.innerHTML = state.parts.map((part, index) => `
    <div class="cad-part-row" data-part-index="${index}">
      <input type="checkbox" data-part-enabled ${part.enabled ? 'checked' : ''} title="${uiText('포함')}">
      <div class="cad-part-name">
        <b title="${escapeHtml(part.name)}">${escapeHtml(part.name)}</b>
        <small>${part.geometry.volumeMm3.toFixed(1)} mm³</small>
      </div>
      <div class="cad-part-material">
        <select data-part-material>${materialOptions(part.materialKey)}</select>
        <input type="number" data-part-density value="${Number((part.densityKgPerMm3 / KG_PER_MM3_PER_G_PER_CM3).toFixed(6))}" step="0.01" min="0">
        <span class="cad-density-unit">g/cm³</span>
      </div>
    </div>
  `).join('');
}

function updatePartFromControl(control) {
  const row = control.closest('[data-part-index]');
  const part = state.parts[Number(row.dataset.partIndex)];
  if (!part) return;

  if (control.matches('[data-part-enabled]')) {
    part.enabled = control.checked;
    part.mesh.visible = part.enabled;
  } else if (control.matches('[data-part-material]')) {
    part.materialKey = control.value;
    part.densityKgPerMm3 = MATERIALS[control.value].density;
    row.querySelector('[data-part-density]').value = Number((part.densityKgPerMm3 / KG_PER_MM3_PER_G_PER_CM3).toFixed(6));
  } else if (control.matches('[data-part-density]')) {
    part.densityKgPerMm3 = Number(control.value) * KG_PER_MM3_PER_G_PER_CM3;
    part.materialKey = 'custom';
    row.querySelector('[data-part-material]').value = 'custom';
  }
  el.result.classList.add('hide');
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

function isSnapCandidateVisible(candidate, projected, enabledMeshes) {
  if (!state.camera || !state.renderer) return false;
  state.visibilityRaycaster.setFromCamera(new THREE.Vector2(projected.x, projected.y), state.camera);
  const frontHit = state.visibilityRaycaster.intersectObjects(enabledMeshes, false)[0] || null;
  if (!frontHit) return true;

  const candidateDistance = state.camera.position.distanceTo(candidate.point);
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
  state.snapCandidates.forEach((candidate) => {
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
  best = nearbyCandidates.find((candidate) => isSnapCandidateVisible(candidate, candidate.projected, enabledMeshes)) || null;
  return best;
}

function showSnapMarker(snap) {
  if (!snap) {
    hideSnapMarker();
    if (state.pickMode) {
      setSnapReadout(isMultiPointCenterMode()
        ? multiCenterInstruction
        : '현재 위치에 선택 가능한 스냅 후보가 없습니다.');
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
      : 'CAD 형상 위로 이동하면 스냅 후보가 표시됩니다.');
  } else {
    hideSnapMarker();
    if (state.parts.length) setStatus(`${state.sourceCadFormat || 'CAD'} 파일 분석 완료`, 'ok');
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
  if (state.pointerMoveFrame) return;
  state.pointerMoveFrame = requestAnimationFrame(() => {
    state.pointerMoveFrame = null;
    showSnapMarker(findSnapAtPointer(state.lastPointer));
  });
}

function onPointerUp(event) {
  if (!state.pickMode || !state.parts.length || !state.pointerDown) return;
  const movement = Math.hypot(event.clientX - state.pointerDown.x, event.clientY - state.pointerDown.y);
  state.pointerDown = null;
  if (movement > 5) return;
  const snap = findSnapAtPointer(event);
  if (!snap) {
    setStatus('현재 위치에 선택 가능한 스냅 후보가 없습니다.', 'error');
    return;
  }

  try {
    if (isMultiPointCenterMode()) {
      addMultiPoint(snap);
      return;
    }
    commitSnapPoint(snap.point, snapTypeInfo(snap.type).label);
  } catch (error) {
    setStatus('좌표계 방향이 올바르지 않습니다.', 'error');
  }
}

function renderTriple(container, labels, values, unit, digits) {
  container.innerHTML = values.map((value, index) => `
    <div>${labels[index]}<b>${value.toFixed(digits)} ${unit}</b></div>
  `).join('');
}

function calculateMassProperties() {
  try {
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
    setStatus(`STEP 파일 내보내기 완료 · ${selectedPartCount}개 부품 · ${result.fileName}`, 'ok');
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
  el.mode.querySelectorAll('[data-vector]').forEach((input) => {
    const eventName = input.dataset.vector === 'rotation' ? 'input' : 'change';
    input.addEventListener(eventName, () => {
      if (input.value === '') return;
      try {
        readCoordinateInputs();
        el.result.classList.add('hide');
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
  updateOutlineToggleUi();
  updateGridVisibility();
  updateMultiCenterControls();
  renderStatus();
  renderSnapReadout();
  if (state.hoverSnap) el.snapLabel.textContent = uiText(snapTypeInfo(state.hoverSnap.type).label);
}

function init() {
  cacheElements();
  if (!el.mode || !el.viewport) return;
  const previewReady = setupScene();
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
