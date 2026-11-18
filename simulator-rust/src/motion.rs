use crate::with_buffer;

fn side(v: f64, a: f64, jerk: f64) -> [f64; 3] {
    let threshold = a * a / jerk;
    if v > threshold {
        [a / jerk, (v - threshold) / a, a / jerk]
    } else {
        let ramp = (v / jerk).sqrt();
        [ramp, 0., ramp]
    }
}

struct Phases {
    start: [f64; 3],
    stop: [f64; 3],
    distance: f64,
}

fn phases(v: f64, a: f64, d: f64, ja: f64, jd: f64) -> Phases {
    let start = side(v, a, ja);
    let stop = side(v, d, jd);
    let time: f64 = start.iter().chain(&stop).sum();
    Phases {
        start,
        stop,
        distance: v * 0.5 * time,
    }
}

fn integrate(p: f64, v: f64, a: f64, jerk: f64, t: f64) -> [f64; 3] {
    [
        p + v * t + a * t * t / 2. + jerk * t * t * t / 6.,
        v + a * t + jerk * t * t / 2.,
        a + jerk * t,
    ]
}

// Output: total time, signed peak speed, short flag, then seven segments of
// [start time, duration, jerk, start position, start velocity, start acceleration].
#[no_mangle]
pub extern "C" fn plan_motion(distance: f64, vmax: f64, a: f64, d: f64, ja: f64, jd: f64) -> u32 {
    let length = distance.abs();
    let mut peak = vmax;
    let mut profile = phases(peak, a, d, ja, jd);
    let short = length > 0. && profile.distance > length;
    if short {
        // SPC25 compares displacement residual with midpoint velocity, in
        // native radians and milliseconds. Changing this alters controller times.
        let iterations =
            (((vmax.ln() - 1e-10_f64.ln()) * 10_f64.log2()).round() + 1.).clamp(0., 200.) as usize;
        if iterations == 0 {
            return 1;
        }
        let (mut lo, mut hi) = (0., vmax);
        let mut hi_error = profile.distance - length;
        for _ in 0..iterations {
            peak = (lo + hi) * 0.5;
            profile = phases(peak, a, d, ja, jd);
            let error = profile.distance - length;
            if error == 0. {
                lo = peak;
                hi = peak;
            } else if hi_error * error > 0. {
                hi = peak;
                hi_error = error;
            } else {
                lo = peak;
            }
            if error.abs() < peak && error * peak < 0. {
                break;
            }
        }
        if profile.distance > length * (1. + 1e-12) {
            return 2;
        }
    }
    let mut times = [0.; 7];
    if length > 0. {
        times[..3].copy_from_slice(&profile.start);
        times[3] = ((length - profile.distance) / peak).max(0.);
        times[4..].copy_from_slice(&profile.stop);
    } else {
        peak = 0.;
    }
    let sign = if distance == 0. {
        distance
    } else {
        distance.signum()
    };
    let jerks = [ja, 0., -ja, 0., -jd, 0., jd];
    with_buffer(|out| {
        let mut time = 0.;
        let mut state = [0.; 3];
        for (i, segment) in out[3..45].chunks_exact_mut(6).enumerate() {
            let duration = times[i];
            if !duration.is_finite() || duration < 0. {
                return 3;
            }
            let jerk = jerks[i] * sign;
            segment.copy_from_slice(&[time, duration, jerk, state[0], state[1], state[2]]);
            state = integrate(state[0], state[1], state[2], jerk, duration);
            time += duration;
        }
        if !time.is_finite() {
            return 4;
        }
        out[..3].copy_from_slice(&[time, peak * sign, if short { 1. } else { 0. }]);
        0
    })
}

#[no_mangle]
pub extern "C" fn sample_motion(time: f64, distance: f64) {
    with_buffer(|b| {
        let mut state = [distance, 0., 0.];
        if time <= 0. {
            state = [0.; 3];
        } else if time < b[0] {
            for s in b[3..45].chunks_exact(6) {
                if s[1] > 0. && time <= s[0] + s[1] {
                    state = integrate(s[3], s[4], s[5], s[2], time - s[0]);
                    break;
                }
            }
        }
        b[..3].copy_from_slice(&state);
    });
}
