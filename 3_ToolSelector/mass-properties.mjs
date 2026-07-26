const EPSILON = 1e-9;

function flattenNumericArray(value) {
  if (!value) return [];
  if (ArrayBuffer.isView(value)) return value;
  return Array.isArray(value[0]) ? value.flat() : Array.from(value);
}

function zeroMatrix() {
  return [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0]
  ];
}

function addMatrix(a, b) {
  return a.map((row, r) => row.map((value, c) => value + b[r][c]));
}

function subtractMatrix(a, b) {
  return a.map((row, r) => row.map((value, c) => value - b[r][c]));
}

function scaleMatrix(matrix, scale) {
  return matrix.map((row) => row.map((value) => value * scale));
}

function transpose(matrix) {
  return matrix[0].map((_, column) => matrix.map((row) => row[column]));
}

function multiplyMatrix(a, b) {
  const result = zeroMatrix();
  for (let row = 0; row < 3; row += 1) {
    for (let column = 0; column < 3; column += 1) {
      for (let k = 0; k < 3; k += 1) result[row][column] += a[row][k] * b[k][column];
    }
  }
  return result;
}

function addVector(a, b) {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function subtractVector(a, b) {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function scaleVector(vector, scale) {
  return vector.map((value) => value * scale);
}

function dot(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function cross(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0]
  ];
}

function normalize(vector) {
  const length = Math.sqrt(dot(vector, vector));
  if (!Number.isFinite(length) || length <= EPSILON) throw new Error('Coordinate axis has zero length.');
  return scaleVector(vector, 1 / length);
}

function parallelAxisMatrix(massOrVolume, offset) {
  const radiusSquared = dot(offset, offset);
  return [
    [massOrVolume * (radiusSquared - offset[0] * offset[0]), -massOrVolume * offset[0] * offset[1], -massOrVolume * offset[0] * offset[2]],
    [-massOrVolume * offset[1] * offset[0], massOrVolume * (radiusSquared - offset[1] * offset[1]), -massOrVolume * offset[1] * offset[2]],
    [-massOrVolume * offset[2] * offset[0], -massOrVolume * offset[2] * offset[1], massOrVolume * (radiusSquared - offset[2] * offset[2])]
  ];
}

/**
 * Integrates a closed, consistently oriented STEP tessellation.
 * Coordinates are millimetres. The returned inertia values use unit density
 * and therefore have units mm^5; multiplying by kg/mm^3 yields kg*mm^2.
 */
export function integrateStepMesh(meshDefinition) {
  const positions = flattenNumericArray(meshDefinition?.attributes?.position?.array);
  const sourceIndices = flattenNumericArray(meshDefinition?.index?.array);
  const hasIndices = sourceIndices.length > 0;
  const indices = sourceIndices;
  const indexCount = hasIndices ? indices.length : positions.length / 3;

  if (positions.length < 9 || positions.length % 3 !== 0) throw new Error('STEP mesh has invalid vertex data.');
  if (indexCount < 3 || indexCount % 3 !== 0) throw new Error('STEP mesh has invalid triangle data.');

  let volume = 0;
  const firstMoment = [0, 0, 0];
  let integralX2 = 0;
  let integralY2 = 0;
  let integralZ2 = 0;
  let integralXY = 0;
  let integralXZ = 0;
  let integralYZ = 0;

  for (let triangle = 0; triangle < indexCount; triangle += 3) {
    const aIndex = hasIndices ? indices[triangle] : triangle;
    const bIndex = hasIndices ? indices[triangle + 1] : triangle + 1;
    const cIndex = hasIndices ? indices[triangle + 2] : triangle + 2;
    const ax = positions[aIndex * 3];
    const ay = positions[aIndex * 3 + 1];
    const az = positions[aIndex * 3 + 2];
    const bx = positions[bIndex * 3];
    const by = positions[bIndex * 3 + 1];
    const bz = positions[bIndex * 3 + 2];
    const cx = positions[cIndex * 3];
    const cy = positions[cIndex * 3 + 1];
    const cz = positions[cIndex * 3 + 2];
    if (![ax, ay, az, bx, by, bz, cx, cy, cz].every(Number.isFinite)) {
      throw new Error('STEP mesh contains a non-finite coordinate.');
    }

    const tetraVolume = (
      ax * (by * cz - bz * cy)
      + ay * (bz * cx - bx * cz)
      + az * (bx * cy - by * cx)
    ) / 6;
    volume += tetraVolume;
    firstMoment[0] += tetraVolume * (ax + bx + cx) / 4;
    firstMoment[1] += tetraVolume * (ay + by + cy) / 4;
    firstMoment[2] += tetraVolume * (az + bz + cz) / 4;
    integralX2 += tetraVolume * (ax * ax + bx * bx + cx * cx + ax * bx + ax * cx + bx * cx) / 10;
    integralY2 += tetraVolume * (ay * ay + by * by + cy * cy + ay * by + ay * cy + by * cy) / 10;
    integralZ2 += tetraVolume * (az * az + bz * bz + cz * cz + az * bz + az * cz + bz * cz) / 10;
    integralXY += tetraVolume * (
      2 * (ax * ay + bx * by + cx * cy)
      + ax * by + bx * ay + ax * cy + cx * ay + bx * cy + cx * by
    ) / 20;
    integralXZ += tetraVolume * (
      2 * (ax * az + bx * bz + cx * cz)
      + ax * bz + bx * az + ax * cz + cx * az + bx * cz + cx * bz
    ) / 20;
    integralYZ += tetraVolume * (
      2 * (ay * az + by * bz + cy * cz)
      + ay * bz + by * az + ay * cz + cy * az + by * cz + cy * bz
    ) / 20;
  }

  if (!Number.isFinite(volume) || Math.abs(volume) <= EPSILON) throw new Error('STEP solid has zero or invalid volume.');

  if (volume < 0) {
    volume *= -1;
    for (let axis = 0; axis < 3; axis += 1) firstMoment[axis] *= -1;
    integralX2 *= -1;
    integralY2 *= -1;
    integralZ2 *= -1;
    integralXY *= -1;
    integralXZ *= -1;
    integralYZ *= -1;
  }

  const centroidMm = firstMoment.map((value) => value / volume);
  const inertiaOriginMm5 = [
    [integralY2 + integralZ2, -integralXY, -integralXZ],
    [-integralXY, integralX2 + integralZ2, -integralYZ],
    [-integralXZ, -integralYZ, integralX2 + integralY2]
  ];
  const inertiaCentroidMm5 = subtractMatrix(inertiaOriginMm5, parallelAxisMatrix(volume, centroidMm));

  return {
    volumeMm3: volume,
    centroidMm,
    inertiaCentroidMm5
  };
}

export function createCoordinateFrame(originMm, xDirection, yDirection) {
  const x = normalize(xDirection);
  const yCandidate = subtractVector(yDirection, scaleVector(x, dot(yDirection, x)));
  const y = normalize(yCandidate);
  const z = normalize(cross(x, y));
  const correctedY = normalize(cross(z, x));
  return {
    originMm: Array.from(originMm),
    x,
    y: correctedY,
    z
  };
}

function inertiaInFrame(inertiaWorld, frame) {
  const basis = [
    [frame.x[0], frame.y[0], frame.z[0]],
    [frame.x[1], frame.y[1], frame.z[1]],
    [frame.x[2], frame.y[2], frame.z[2]]
  ];
  return multiplyMatrix(multiplyMatrix(transpose(basis), inertiaWorld), basis);
}

export function pointInFrame(pointMm, frame) {
  const relative = subtractVector(pointMm, frame.originMm);
  return [dot(relative, frame.x), dot(relative, frame.y), dot(relative, frame.z)];
}

/**
 * Combines STEP solids with per-part density in kg/mm^3.
 * Inertia outputs are kg*m^2 and coordinates are mm.
 */
export function combineStepParts(parts, frame) {
  const activeParts = parts.filter((part) => part.enabled !== false);
  if (!activeParts.length) throw new Error('No active STEP solids.');

  const prepared = activeParts.map((part) => {
    const density = Number(part.densityKgPerMm3);
    const volume = Number(part.geometry?.volumeMm3);
    const centroid = part.geometry?.centroidMm;
    const inertia = part.geometry?.inertiaCentroidMm5;
    if (!Number.isFinite(density) || density <= 0) throw new Error('Each active STEP solid must have a positive finite density.');
    if (!Number.isFinite(volume) || volume <= EPSILON) throw new Error('Each active STEP solid must have a positive finite volume.');
    if (!Array.isArray(centroid) || centroid.length !== 3 || centroid.some((value) => !Number.isFinite(Number(value)))) throw new Error('STEP solid has an invalid centroid.');
    if (!Array.isArray(inertia) || inertia.length !== 3 || inertia.some((row) => !Array.isArray(row) || row.length !== 3 || row.some((value) => !Number.isFinite(Number(value))))) throw new Error('STEP solid has invalid inertia values.');
    const massKg = volume * density;
    return {
      massKg,
      centroidMm: centroid.map(Number),
      inertiaCentroidKgMm2: scaleMatrix(inertia, density)
    };
  });

  const massKg = prepared.reduce((sum, part) => sum + part.massKg, 0);
  if (!Number.isFinite(massKg) || massKg <= EPSILON) throw new Error('Calculated mass is zero or invalid.');

  const centerOfMassCadMm = scaleVector(
    prepared.reduce((sum, part) => addVector(sum, scaleVector(part.centroidMm, part.massKg)), [0, 0, 0]),
    1 / massKg
  );

  let inertiaCenterWorldKgMm2 = zeroMatrix();
  prepared.forEach((part) => {
    const offset = subtractVector(part.centroidMm, centerOfMassCadMm);
    inertiaCenterWorldKgMm2 = addMatrix(
      inertiaCenterWorldKgMm2,
      addMatrix(part.inertiaCentroidKgMm2, parallelAxisMatrix(part.massKg, offset))
    );
  });

  const centerOffsetFromOrigin = subtractVector(centerOfMassCadMm, frame.originMm);
  const inertiaOriginWorldKgMm2 = addMatrix(
    inertiaCenterWorldKgMm2,
    parallelAxisMatrix(massKg, centerOffsetFromOrigin)
  );
  const inertiaCenterFrameKgMm2 = inertiaInFrame(inertiaCenterWorldKgMm2, frame);
  const inertiaOriginFrameKgMm2 = inertiaInFrame(inertiaOriginWorldKgMm2, frame);
  const toKgM2 = (matrix) => matrix.map((row) => row.map((value) => value * 1e-6));

  return {
    massKg,
    centerOfMassCadMm,
    centerOfMassToolMm: pointInFrame(centerOfMassCadMm, frame),
    inertiaCenterKgM2: toKgM2(inertiaCenterFrameKgMm2),
    inertiaOriginKgM2: toKgM2(inertiaOriginFrameKgMm2)
  };
}
