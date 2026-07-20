const FULL_TURN = Math.PI * 2;
const AXIS_NAMES = new Set(['X', 'Y', 'Z']);

export function wrapRotationDelta(delta) {
  if (!Number.isFinite(delta)) return 0;
  return ((delta + Math.PI) % FULL_TURN + FULL_TURN) % FULL_TURN - Math.PI;
}

export function projectedRingAngle(pointer, center, basisU, basisV, minimumRadius = 0) {
  const dx = pointer.x - center.x;
  const dy = pointer.y - center.y;
  const determinant = basisU.x * basisV.y - basisU.y * basisV.x;
  const basisLengthProduct = Math.hypot(basisU.x, basisU.y) * Math.hypot(basisV.x, basisV.y);
  if (!Number.isFinite(determinant) || basisLengthProduct < 1e-12) return null;

  const normalizedDeterminant = Math.abs(determinant) / basisLengthProduct;
  if (normalizedDeterminant < 0.06) return null;

  const coefficientU = (dx * basisV.y - dy * basisV.x) / determinant;
  const coefficientV = (basisU.x * dy - basisU.y * dx) / determinant;
  const radius = Math.hypot(coefficientU, coefficientV);
  if (!Number.isFinite(radius) || radius < minimumRadius) return null;

  return Math.atan2(coefficientV, coefficientU);
}

function projectedPoint(THREE, point, camera) {
  const projected = point.clone().project(camera);
  return new THREE.Vector2(projected.x, projected.y);
}

function createLinearFallback(controls, THREE, centerWorld, worldAxis, radius) {
  const distance = controls.worldPositionStart.distanceTo(controls.cameraPosition);
  if (!Number.isFinite(distance) || distance < 1e-9) return null;

  // When the rotation ring is edge-on, its ellipse collapses to a line and
  // there is no reliable polar angle to read. The stock TransformControls
  // calculation still has a stable tangent in that case, so keep that
  // calculation but accumulate the pointer movement instead of recomputing
  // the angle from the original mouse-down point.
  const tangentWorld = worldAxis.clone().cross(controls.eye);
  if (tangentWorld.lengthSq() < 1e-12) return null;
  tangentWorld.normalize();

  const center = projectedPoint(THREE, centerWorld, controls.camera);
  const tangentPoint = projectedPoint(
    THREE,
    centerWorld.clone().addScaledVector(tangentWorld, Math.max(radius, 1)),
    controls.camera
  );
  const tangentScreen = tangentPoint.sub(center);
  const tangentScreenLength = tangentScreen.length();
  if (!Number.isFinite(tangentScreenLength) || tangentScreenLength < 1e-9) return null;

  return {
    tangentScreen: tangentScreen.multiplyScalar(1 / tangentScreenLength),
    anglePerNdc: (Math.max(radius, 1) / tangentScreenLength) * (20 / distance)
  };
}

function gizmoWorldRadius(controls) {
  const camera = controls.camera;
  const size = Number.isFinite(controls.size) ? controls.size : 1;
  if (camera.isOrthographicCamera) {
    return ((camera.top - camera.bottom) / camera.zoom) * size / 4;
  }

  const distance = controls.worldPositionStart.distanceTo(controls.cameraPosition);
  const perspectiveScale = Math.min(
    1.9 * Math.tan(Math.PI * camera.fov / 360) / camera.zoom,
    7
  );
  return distance * perspectiveScale * size / 4;
}

function perpendicularBasis(THREE, axis) {
  const reference = Math.abs(axis.x) < 0.8
    ? new THREE.Vector3(1, 0, 0)
    : new THREE.Vector3(0, 1, 0);
  const u = reference.addScaledVector(axis, -reference.dot(axis)).normalize();
  const v = axis.clone().cross(u).normalize();
  return { u, v };
}

function createRotationSession(controls, THREE) {
  if (controls.mode !== 'rotate' || !AXIS_NAMES.has(controls.axis) || !controls.object) return null;

  controls.camera.updateMatrixWorld(true);
  const axis = new THREE.Vector3(
    controls.axis === 'X' ? 1 : 0,
    controls.axis === 'Y' ? 1 : 0,
    controls.axis === 'Z' ? 1 : 0
  );
  const space = controls.space === 'local' ? 'local' : 'world';
  const worldAxis = axis.clone();
  if (space === 'local') worldAxis.applyQuaternion(controls.worldQuaternionStart).normalize();

  const radius = gizmoWorldRadius(controls);
  const { u, v } = perpendicularBasis(THREE, worldAxis);
  const centerWorld = controls.worldPositionStart.clone();
  const center = projectedPoint(THREE, centerWorld, controls.camera);
  const uPoint = projectedPoint(
    THREE,
    centerWorld.clone().addScaledVector(u, radius),
    controls.camera
  );
  const vPoint = projectedPoint(
    THREE,
    centerWorld.clone().addScaledVector(v, radius),
    controls.camera
  );
  const basisU = uPoint.sub(center);
  const basisV = vPoint.sub(center);
  const startPoint = projectedPoint(
    THREE,
    centerWorld.clone().add(controls.pointStart),
    controls.camera
  );
  const startAngle = projectedRingAngle(startPoint, center, basisU, basisV, 0.08);
  const linearFallback = createLinearFallback(controls, THREE, centerWorld, worldAxis, radius);

  return {
    object: controls.object,
    axisName: controls.axis,
    axis,
    worldAxis,
    space,
    center,
    basisU,
    basisV,
    lastAngle: startAngle,
    lastPointer: startPoint.clone(),
    usingLinearFallback: startAngle === null,
    linearFallback,
    accumulatedAngle: 0,
    quaternionStart: controls._quaternionStart.clone(),
    parentQuaternionInv: controls._parentQuaternionInv.clone()
  };
}

function applyRotationSession(controls, session, pointer, THREE) {
  const angle = projectedRingAngle(pointer, session.center, session.basisU, session.basisV, 0.08);
  if (angle !== null && !session.usingLinearFallback) {
    session.accumulatedAngle += wrapRotationDelta(angle - session.lastAngle);
    session.lastAngle = angle;
    session.lastPointer.set(pointer.x, pointer.y);
  } else if (angle !== null && session.usingLinearFallback) {
    // Re-entering the projected ring after the linear fallback must not add
    // the stale angle difference accumulated while the ring was edge-on.
    session.lastAngle = angle;
    session.lastPointer.set(pointer.x, pointer.y);
    session.usingLinearFallback = false;
  } else if (session.linearFallback) {
    const pointerDeltaX = pointer.x - session.lastPointer.x;
    const pointerDeltaY = pointer.y - session.lastPointer.y;
    const pointerDelta = pointerDeltaX * session.linearFallback.tangentScreen.x
      + pointerDeltaY * session.linearFallback.tangentScreen.y;
    session.accumulatedAngle += pointerDelta * session.linearFallback.anglePerNdc;
    session.lastPointer.set(pointer.x, pointer.y);
    session.usingLinearFallback = true;
  } else {
    return;
  }

  const appliedAngle = controls.rotationSnap
    ? Math.round(session.accumulatedAngle / controls.rotationSnap) * controls.rotationSnap
    : session.accumulatedAngle;
  const rotationAxis = session.space === 'local'
    ? session.axis
    : session.worldAxis.clone().applyQuaternion(session.parentQuaternionInv).normalize();
  const delta = new THREE.Quaternion().setFromAxisAngle(rotationAxis, appliedAngle);

  if (session.space === 'local') {
    session.object.quaternion.copy(session.quaternionStart).multiply(delta).normalize();
    controls.rotationAxis.copy(session.axis);
  } else {
    session.object.quaternion.copy(delta).multiply(session.quaternionStart).normalize();
    controls.rotationAxis.copy(rotationAxis);
  }
  controls.rotationAngle = appliedAngle;
  controls.dispatchEvent({ type: 'change' });
  controls.dispatchEvent({ type: 'objectChange' });
}

/**
 * Keeps TransformControls axis rotation continuous through the +/-180 degree
 * screen-angle boundary. If the projected ring becomes edge-on, an accumulated
 * tangent drag keeps the same session alive until the ring is readable again.
 */
export function enableContinuousTransformRotation(controls, THREE) {
  if (!controls || controls.userData?.continuousRotationEnabled) return controls;

  const originalPointerMove = controls.pointerMove.bind(controls);
  let session = null;

  controls.addEventListener('mouseDown', () => {
    session = createRotationSession(controls, THREE);
  });
  controls.addEventListener('mouseUp', () => {
    session = null;
  });

  controls.pointerMove = (pointer) => {
    if (!session
      || controls.mode !== 'rotate'
      || controls.axis !== session.axisName
      || controls.object !== session.object) {
      originalPointerMove(pointer);
      return;
    }

    applyRotationSession(controls, session, pointer, THREE);
  };
  controls.userData.continuousRotationEnabled = true;
  return controls;
}
