const DEG_TO_RAD = Math.PI / 180;

function finiteTriplet(value, label) {
  const values = Array.from(value || []).map(Number);
  if (values.length !== 3 || !values.every(Number.isFinite)) {
    throw new Error(`${label} must contain three finite numbers.`);
  }
  return values;
}

export function buildWorldToToolTransform(originMm, rotationDegrees) {
  const origin = finiteTriplet(originMm, 'originMm');
  const rotation = finiteTriplet(rotationDegrees, 'rotationDegrees');
  return {
    translation: origin.map((value) => value === 0 ? 0 : -value),
    rotations: [
      { angleDegrees: rotation[0] === 0 ? 0 : -rotation[0], axis: [1, 0, 0] },
      { angleDegrees: rotation[1] === 0 ? 0 : -rotation[1], axis: [0, 1, 0] },
      { angleDegrees: rotation[2] === 0 ? 0 : -rotation[2], axis: [0, 0, 1] }
    ]
  };
}

function rotatePoint(point, angleDegrees, axis) {
  const angle = angleDegrees * DEG_TO_RAD;
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  const [x, y, z] = point;
  if (axis[0]) return [x, cosine * y - sine * z, sine * y + cosine * z];
  if (axis[1]) return [cosine * x + sine * z, y, -sine * x + cosine * z];
  return [cosine * x - sine * y, sine * x + cosine * y, z];
}

export function transformPointToTool(pointMm, originMm, rotationDegrees) {
  const point = finiteTriplet(pointMm, 'pointMm');
  const transform = buildWorldToToolTransform(originMm, rotationDegrees);
  let transformed = point.map((value, index) => value + transform.translation[index]);
  transform.rotations.forEach(({ angleDegrees, axis }) => {
    transformed = rotatePoint(transformed, angleDegrees, axis);
  });
  return transformed;
}

export function createStepExportFileName(sourceName) {
  const name = String(sourceName || '').split(/[\\/]/).pop().replace(/\.(?:step|stp)$/i, '').trim();
  return `${name || 'tool'}_ToolCS.step`;
}
