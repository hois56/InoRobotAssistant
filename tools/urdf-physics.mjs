// SPC25 effective six-axis records use SI units. SetDyncArmLoad (also called
// for empty arm loads) clears the three products of inertia. Raw fields can
// contain gravity-model coefficients: never guess a unit from their magnitude.
export function nativeSixLinkFrame(index, wristLengthMeters) {
    const rotations = [
        [[1, 0, 0], [0, 1, 0], [0, 0, 1]],
        [[1, 0, 0], [0, 0, -1], [0, 1, 0]],
        [[0, -1, 0], [0, 0, -1], [1, 0, 0]],
        [[0, 0, 1], [0, -1, 0], [1, 0, 0]],
        [[0, -1, 0], [0, 0, -1], [1, 0, 0]],
        [[0, 0, 1], [0, -1, 0], [1, 0, 0]],
    ];
    if (!Number.isInteger(index) || index < 0 || index >= 6) throw new RangeError('Expected six-axis link index');
    // Native link 6 is measured from J5; the mesh/URDF link starts at J6.
    return { rotation: rotations[index], translation: index === 5 ? [-wristLengthMeters, 0, 0] : [0, 0, 0] };
}

export function validPrincipalMoments(values) {
    if (!Array.isArray(values) || values.length !== 3 || !values.every(v => Number.isFinite(v) && v > 0)) return false;
    // Relative tolerance only: small valid wrists must not fail an absolute
    // determinant threshold. Require a realizable tensor, not just positive I.
    const largest = Math.max(...values);
    return 2 * largest <= values.reduce((a, b) => a + b, 0) + largest * 1e-12;
}

export function boxInertial(mass, bounds, pivot) {
    if (!Number.isFinite(mass) || mass <= 0) throw new Error('Missing positive firmware link mass');
    if (!bounds || ![...bounds.min, ...bounds.max, ...bounds.center].every(Number.isFinite)) {
        throw new Error('Cannot approximate inertia without a finite STL bounding box');
    }
    const size = bounds.max.map((v, i) => (v - bounds.min[i]) * 0.001);
    if (!size.every(v => v > 0)) throw new Error('Degenerate STL bounding box');
    return {
        mass,
        origin: bounds.center.map((v, i) => (v - pivot[i]) * 0.001),
        inertia: [mass * (size[1] ** 2 + size[2] ** 2) / 12, 0, 0,
            mass * (size[0] ** 2 + size[2] ** 2) / 12, 0,
            mass * (size[0] ** 2 + size[1] ** 2) / 12],
        source: 'bounding-box-fallback',
    };
}

export function firmwareInertial(link, index, bounds, pivot, wristLengthMeters) {
    if (!Number.isFinite(link?.mass) || link.mass <= 0) throw new Error('Missing positive firmware link mass');
    const moments = link.inertia?.slice(0, 3);
    const cogValid = Array.isArray(link.cog) && link.cog.length === 3 && link.cog.every(Number.isFinite);
    if (!validPrincipalMoments(moments) || !cogValid) {
        return { ...boxInertial(link.mass, bounds, pivot), reason: !cogValid
            ? 'Non-finite firmware centre of mass'
            : 'Effective firmware principal moments are not physically realizable; no unit guessing applied' };
    }
    const { rotation, translation } = nativeSixLinkFrame(index, wristLengthMeters);
    const origin = rotation.map((row, i) => row.reduce((s, v, j) => s + v * link.cog[j], translation[i]));
    const diagonal = rotation.map(row => row.reduce((s, v, j) => s + v * v * moments[j], 0));
    return { mass: link.mass, origin, inertia: [diagonal[0], 0, 0, diagonal[1], 0, diagonal[2]],
        source: 'firmware-effective-si', reason: null };
}

export function nominalJointTorque(link) {
    if (!Number.isFinite(link?.ratedTrq) || link.ratedTrq <= 0 || !Number.isFinite(link.ratio) || link.ratio === 0) {
        throw new Error('Missing firmware rated torque or gear ratio');
    }
    // Nominal ideal gear output; not the drive's peak/current protection limit.
    return link.ratedTrq * Math.abs(link.ratio);
}

export function nominalScrewForce(link, leadMeters) {
    if (!Number.isFinite(leadMeters) || leadMeters <= 0) throw new Error('Missing positive screw lead');
    return nominalJointTorque(link) * 2 * Math.PI / leadMeters;
}
