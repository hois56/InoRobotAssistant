use crate::with_buffer;

type Vec3 = [f64; 3];
type Quaternion = [f64; 4];

#[no_mangle]
pub extern "C" fn eased_progress(progress: f64) -> f64 {
    let t = progress.clamp(0., 1.);
    t * t * t * (10. + t * (-15. + 6. * t))
}

fn slerp(a: Quaternion, mut b: Quaternion, t: f64) -> Quaternion {
    if t == 0. {
        return a;
    }
    if t == 1. {
        return b;
    }
    let mut cos = a.iter().zip(b).map(|(a, b)| a * b).sum::<f64>();
    if cos < 0. {
        cos = -cos;
        b = b.map(|v| -v);
    }
    if cos >= 1. {
        return a;
    }
    let sin_squared = 1. - cos * cos;
    if sin_squared <= f64::EPSILON {
        let mixed: Quaternion = std::array::from_fn(|i| (1. - t) * a[i] + t * b[i]);
        let len = mixed.iter().map(|v| v * v).sum::<f64>().sqrt();
        return if len > 0. {
            mixed.map(|v| v / len)
        } else {
            [0., 0., 0., 1.]
        };
    }
    let sin = sin_squared.sqrt();
    let arc = sin.atan2(cos);
    let left = ((1. - t) * arc).sin() / sin;
    let right = (t * arc).sin() / sin;
    std::array::from_fn(|i| a[i] * left + b[i] * right)
}
fn cross(a: Vec3, b: Vec3) -> Vec3 {
    [
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0],
    ]
}
fn rotate(q: Quaternion, v: Vec3) -> Vec3 {
    let axis = [q[0], q[1], q[2]];
    let t = cross(axis, v).map(|x| 2. * x);
    let c = cross(axis, t);
    std::array::from_fn(|i| v[i] + q[3] * t[i] + c[i])
}

// Inputs are the two orbit targets, orientations, initial up vector and
// its rotation, then the exact saved destination position and up vector.
#[no_mangle]
pub extern "C" fn orbit_transition(
    elapsed: f64,
    duration: f64,
    from_radius: f64,
    to_radius: f64,
    from_zoom: f64,
    to_zoom: f64,
) -> f64 {
    with_buffer(|b| {
        let raw = (elapsed / duration).clamp(0., 1.);
        let t = eased_progress(raw);
        let target: Vec3 = std::array::from_fn(|i| b[i] + (b[3 + i] - b[i]) * t);
        let orientation = slerp(
            b[6..10].try_into().unwrap(),
            b[10..14].try_into().unwrap(),
            t,
        );
        let radius = (1. - t) * from_radius + t * to_radius;
        let offset = rotate(orientation, [0., 0., radius]);
        let mut position: Vec3 = std::array::from_fn(|i| target[i] + offset[i]);
        let up_rotation = slerp([0., 0., 0., 1.], b[17..21].try_into().unwrap(), t);
        let mut up = rotate(up_rotation, b[14..17].try_into().unwrap());
        let length = up.iter().map(|v| v * v).sum::<f64>().sqrt();
        if length > 0. {
            up = up.map(|v| v / length);
        }
        if raw >= 1. {
            position.copy_from_slice(&b[21..24]);
            up.copy_from_slice(&b[24..27]);
        }
        b[..3].copy_from_slice(&target);
        b[3..6].copy_from_slice(&position);
        b[6..9].copy_from_slice(&up);
        b[9] = (1. - t) * from_zoom + t * to_zoom;
        raw
    })
}

#[no_mangle]
pub extern "C" fn resize_orthographic(
    left: f64,
    right: f64,
    top: f64,
    bottom: f64,
    width: f64,
    height: f64,
) {
    with_buffer(|b| {
        let half = (top - bottom).max(0.001) * 0.5;
        let extent = half * (width / height.max(1.)).max(0.1);
        let (x, y) = ((left + right) * 0.5, (top + bottom) * 0.5);
        b[..4].copy_from_slice(&[x - extent, x + extent, y + half, y - half]);
    })
}

#[no_mangle]
pub extern "C" fn orbit_follow_selection() -> bool {
    with_buffer(|b| {
        let delta: Vec3 = std::array::from_fn(|i| b[3 + i] - b[i]);
        if delta.iter().map(|v| v * v).sum::<f64>() < 1e-12 {
            return false;
        }
        for i in 0..3 {
            b[6 + i] += delta[i];
            b[9 + i] += delta[i];
        }
        true
    })
}
