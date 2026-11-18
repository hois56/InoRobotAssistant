use crate::with_buffer;
use crate::BUFFER;

#[no_mangle]
pub extern "C" fn feed_offsets(progress: f64, distance: f64, pitch: f64) -> usize {
    BUFFER.with_borrow_mut(|out| {
        out.clear();
        let rem = (progress.max(0.) + distance) % pitch;
        out.push(if progress.is_nan() {
            f64::NAN
        } else if rem < 1e-8 || pitch - rem < 1e-8 {
            0.
        } else {
            rem
        });
        if progress.is_nan() {
            return 0;
        }
        let mut offset = (pitch - progress).max(0.);
        while offset <= distance + 1e-8 {
            out.push(offset.min(distance));
            let next = offset + pitch;
            if next == offset {
                break;
            }
            offset = next;
        }
        out.len() - 1
    })
}

#[no_mangle]
pub extern "C" fn sensor_interval() -> i32 {
    with_buffer(|b| {
        let (mut enter, mut leave) = (0_f64, 1_f64);
        for axis in 0..3 {
            let delta = b[6 + axis] - b[axis];
            if (b[9 + axis] - b[3 + axis] - delta).abs() > 1e-6 {
                return -1;
            }
            if delta.abs() < 1e-12 {
                if b[3 + axis] < b[12 + axis] || b[axis] > b[15 + axis] {
                    return 0;
                }
            } else {
                let first = (b[12 + axis] - b[3 + axis]) / delta;
                let last = (b[15 + axis] - b[axis]) / delta;
                enter = enter.max(first.min(last));
                leave = leave.min(first.max(last));
                if enter > leave {
                    return 0;
                }
            }
        }
        b[0] = enter;
        b[1] = leave;
        1
    })
}

#[no_mangle]
pub extern "C" fn conveyor_seconds(elapsed: f64, background: bool) -> f64 {
    if !elapsed.is_finite() || elapsed < 0. {
        return 0.;
    }
    if background {
        elapsed.min(1.)
    } else if elapsed > 0.25 {
        0.
    } else {
        elapsed
    }
}

#[no_mangle]
pub extern "C" fn conveyor_travel(
    axis: usize,
    negative: bool,
    speed: f64,
    seconds: f64,
    tolerance: f64,
    allow_exit: bool,
) -> f64 {
    if !(speed > 0. && seconds > 0.) {
        return 0.;
    }
    with_buffer(|b| {
        let cross = 1 - axis;
        // [belt min, belt max, object min, object max], each XYZ in mm.
        if (b[8] - b[5]).abs() > tolerance
            || b[6 + cross] < b[cross] - tolerance
            || b[9 + cross] > b[3 + cross] + tolerance
            || (!allow_exit
                && (b[6 + axis] < b[axis] - tolerance || b[9 + axis] > b[3 + axis] + tolerance))
        {
            return 0.;
        }
        let available = if negative {
            b[6 + axis] - b[axis]
        } else {
            b[3 + axis] - b[9 + axis]
        };
        let distance = if allow_exit {
            speed * seconds
        } else {
            available.min(speed * seconds).max(0.)
        };
        if negative {
            -distance
        } else {
            distance
        }
    })
}

#[no_mangle]
pub extern "C" fn feed_extent(a: f64, b: f64, range_deg: f64) -> f64 {
    let angle = (range_deg * std::f64::consts::PI / 180.).min(b.atan2(a));
    a * angle.cos() + b * angle.sin()
}

#[no_mangle]
pub extern "C" fn feed_rotation(
    x: f64,
    y: f64,
    span_x: f64,
    span_y: f64,
    range: f64,
    random: f64,
) -> f64 {
    let mut angle = (random * 2. - 1.) * range * std::f64::consts::PI / 180.;
    for _ in 0..24 {
        let (s, c) = angle.sin_cos();
        if x * c.abs() + y * s.abs() <= span_x + 1e-8 && x * s.abs() + y * c.abs() <= span_y + 1e-8
        {
            return angle;
        }
        angle *= 0.5;
    }
    0.
}
