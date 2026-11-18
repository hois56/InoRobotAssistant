import { engine, numbers } from './wasm/engine.mjs';

export const FIRMWARE_SCURVE_SCOPE = 'SPC25 fixed-envelope SPrfCalc, stop-to-stop';

export function planFirmwareSCurve(input) {
    if (!input || !Number.isFinite(input.distance)) throw new RangeError('distance must be finite');
    if ((input.startVelocity ?? 0) !== 0 || (input.endVelocity ?? 0) !== 0) {
        throw new RangeError('Only zero startVelocity and endVelocity are supported');
    }
    const { distance, vMax, aMax, jAccel } = input;
    const dMax = input.dMax ?? aMax, jDecel = input.jDecel ?? jAccel;
    for (const [name, limit] of Object.entries({ vMax, aMax, dMax, jAccel, jDecel })) {
        if (!Number.isFinite(limit) || limit <= 0) throw new RangeError(name + ' must be a finite positive number');
    }
    const buffer = numbers(45);
    const error = engine.plan_motion(distance, vMax, aMax, dMax, jAccel, jDecel);
    if (error) throw new RangeError(['', 'vMax is below the verified firmware bisection range',
        'Firmware bisection did not produce a feasible profile', 'Invalid stage duration', 'Profile duration overflow'][error]);
    const profile = buffer.slice();
    const segments = Array.from({ length: 7 }, (_, index) => {
        const row = profile.subarray(3 + index * 6);
        return { index, startTime: row[0], duration: row[1], jerk: row[2],
            startPosition: row[3], startVelocity: row[4], startAcceleration: row[5] };
    });
    function evaluate(time) {
        if (typeof time !== 'number' || Number.isNaN(time)) throw new TypeError('time must be a number');
        const data = numbers(profile.length);
        data.set(profile);
        engine.sample_motion(time, distance);
        return { position: data[0], velocity: data[1], acceleration: data[2] };
    }
    return { duration: profile[0], peakVelocity: profile[1], shortMove: Boolean(profile[2]),
        stageDurations: segments.map(segment => segment.duration), segments, evaluate,
        fidelity: 'firmware-fixed-envelope-stop-to-stop', scope: FIRMWARE_SCURVE_SCOPE, units: 'native scalar rad and ms' };
}

export default planFirmwareSCurve;
