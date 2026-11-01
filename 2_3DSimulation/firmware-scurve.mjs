/**
 * Stop-to-stop port of the fixed-envelope SPrfCalc / SNonzeroAsymProfile
 * in MC_ArticulatedArm_A V4R24C4SPC25. No controller or binary is required.
 *
 * This is NOT the complete RapidMove dynamic planner: callers must supply the
 * effective scalar velocity, acceleration and jerk limits after axis/dynamics
 * restrictions. No payload calculation, blending, vibration optimizer, external
 * axes, or nonzero boundary velocities are implemented here.
 *
 * The firmware's unusual short-distance bisection early-exit is intentional in
 * this port. Replacing it with a time-optimal root changes the firmware times.
 * For firmware fidelity inputs MUST use native scalar path radians and
 * milliseconds: rad, rad/ms, rad/ms², rad/ms³ -> duration/evaluate time in ms.
 * The firmware bisection compares a distance residual with a velocity, so
 * changing units or normalizing distance to 1 changes the early-exit result.
 * A progress/sec caller must convert using the joint-path norm L first:
 * distance=L; V=L*Vprogress/1000; A=L*Aprogress/1e6; J=L*Jprogress/1e9.
 * Use evaluate(seconds*1000), then divide position/velocity by L as needed,
 * applying the matching time derivative conversions for velocity/acceleration.
 * U is not TCP millimeters or the maximum moving joint angle.
 */

export const FIRMWARE_SCURVE_SCOPE = 'SPC25 fixed-envelope SPrfCalc, stop-to-stop';

function positive(value, name) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${name} must be a finite positive number`);
  }
  return value;
}

function sideTimes(velocity, acceleration, jerk) {
  const velocityToFullAcceleration = acceleration * acceleration / jerk;
  if (velocity > velocityToFullAcceleration) {
    const ramp = acceleration / jerk;
    return [ramp, (velocity - velocityToFullAcceleration) / acceleration, ramp];
  }
  const ramp = Math.sqrt(velocity / jerk);
  return [ramp, 0, ramp];
}

function phaseProfile(velocity, aMax, dMax, jAccel, jDecel) {
  const start = sideTimes(velocity, aMax, jAccel);
  const stop = sideTimes(velocity, dMax, jDecel);
  const movingTime = start[0] + start[1] + start[2] + stop[0] + stop[1] + stop[2];
  return {start, stop, movingDistance: velocity * 0.5 * movingTime};
}

function firmwareCruiseVelocity(distance, vMax, aMax, dMax, jAccel, jDecel) {
  const profileAt = velocity => phaseProfile(velocity, aMax, dMax, jAccel, jDecel);
  const maxProfile = profileAt(vMax);
  if (maxProfile.movingDistance <= distance) {
    return {velocity: vMax, ...maxProfile, shortMove: false};
  }

  // SNonzeroAsymBisectCmvVel (0x78cc0), stop-to-stop lower bound = 0.
  // The epsilon below limits iterations; the early-exit at 0x78ef4 compares
  // abs(distanceError) with the MIDPOINT VELOCITY, not with this epsilon.
  const epsilon = 1e-10;
  // Original literal is log2(10), even though aw_log returns natural log.
  // LOG2E would stop too early near the torque boundary's tiny acceleration.
  const iterations = Math.min(200, Math.max(0,
    Math.round((Math.log(vMax) - Math.log(epsilon)) * Math.log2(10)) + 1));
  if (iterations < 1) {
    throw new RangeError('vMax is below the verified firmware bisection range');
  }
  let lo = 0, hi = vMax;
  let hiError = maxProfile.movingDistance - distance;
  let candidate = 0, profile;
  for (let i = 0; i < iterations; i++) {
    candidate = (lo + hi) / 2;
    profile = profileAt(candidate);
    const error = profile.movingDistance - distance;
    if (error === 0) {
      lo = hi = candidate;
    } else if (hiError * error > 0) {
      hi = candidate;
      hiError = error;
    } else {
      lo = candidate;
    }
    if (Math.abs(error) < candidate && error * candidate < 0) break;
  }
  if (!profile || profile.movingDistance > distance * (1 + 1e-12)) {
    throw new RangeError('Firmware bisection did not produce a feasible profile');
  }
  return {velocity: candidate, ...profile, shortMove: true};
}

function integrate(position, velocity, acceleration, jerk, duration) {
  return {
    position: position + velocity * duration + acceleration * duration * duration / 2
      + jerk * duration * duration * duration / 6,
    velocity: velocity + acceleration * duration + jerk * duration * duration / 2,
    acceleration: acceleration + jerk * duration,
  };
}

/**
 * @param {{distance:number,vMax:number,aMax:number,dMax?:number,
 *   jAccel:number,jDecel?:number,startVelocity?:number,endVelocity?:number}} input
 * @returns {{duration:number,stageDurations:number[],segments:object[],
 *   peakVelocity:number,evaluate:(seconds:number)=>object,fidelity:string}}
 */
export function planFirmwareSCurve(input) {
  if (!input || !Number.isFinite(input.distance)) {
    throw new RangeError('distance must be finite');
  }
  if ((input.startVelocity ?? 0) !== 0 || (input.endVelocity ?? 0) !== 0) {
    throw new RangeError('Only zero startVelocity and endVelocity are supported');
  }
  const {distance} = input;
  const vMax = positive(input.vMax, 'vMax');
  const aMax = positive(input.aMax, 'aMax');
  const dMax = positive(input.dMax ?? aMax, 'dMax');
  const jAccel = positive(input.jAccel, 'jAccel');
  const jDecel = positive(input.jDecel ?? jAccel, 'jDecel');
  const sign = Math.sign(distance);
  const length = Math.abs(distance);
  let stageDurations, peakVelocity, shortMove = false;
  if (length === 0) {
    stageDurations = [0, 0, 0, 0, 0, 0, 0];
    peakVelocity = 0;
  } else {
    const profile = firmwareCruiseVelocity(length, vMax, aMax, dMax, jAccel, jDecel);
    const cruiseDuration = Math.max(0, (length - profile.movingDistance) / profile.velocity);
    stageDurations = [...profile.start, cruiseDuration, ...profile.stop];
    peakVelocity = profile.velocity;
    shortMove = profile.shortMove;
  }
  const jerks = [jAccel, 0, -jAccel, 0, -jDecel, 0, jDecel].map(j => j * sign);
  const segments = [];
  let time = 0, state = {position: 0, velocity: 0, acceleration: 0};
  for (let index = 0; index < 7; index++) {
    const duration = stageDurations[index];
    if (!Number.isFinite(duration) || duration < 0) throw new RangeError('Invalid stage duration');
    segments.push({index, startTime: time, duration, jerk: jerks[index],
      startPosition: state.position, startVelocity: state.velocity,
      startAcceleration: state.acceleration});
    state = integrate(state.position, state.velocity, state.acceleration, jerks[index], duration);
    time += duration;
  }
  const duration = time;
  if (!Number.isFinite(duration)) throw new RangeError('Profile duration overflow');
  function evaluate(seconds) {
    if (typeof seconds !== 'number' || Number.isNaN(seconds)) {
      throw new TypeError('time must be a number');
    }
    if (seconds <= 0) return {position: 0, velocity: 0, acceleration: 0};
    if (seconds >= duration) return {position: distance, velocity: 0, acceleration: 0};
    for (const segment of segments) {
      if (segment.duration > 0 && seconds <= segment.startTime + segment.duration) {
        return integrate(segment.startPosition, segment.startVelocity,
          segment.startAcceleration, segment.jerk, seconds - segment.startTime);
      }
    }
    return {position: distance, velocity: 0, acceleration: 0};
  }
  return {duration, stageDurations, segments, peakVelocity: sign * peakVelocity,
    shortMove, evaluate, fidelity: 'firmware-fixed-envelope-stop-to-stop',
    scope: FIRMWARE_SCURVE_SCOPE, units: 'native scalar rad and ms'};
}

export default planFirmwareSCurve;
