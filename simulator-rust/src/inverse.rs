use crate::with_buffer;

fn turns(angle: f64, min: f64, max: f64) -> impl Iterator<Item = f64> {
    (-3..=3)
        .map(move |turn| angle + 360. * f64::from(turn))
        .filter(move |&v| v >= min - 1e-7 && v <= max + 1e-7)
        .map(move |v| v.max(min).min(max))
}

/// The target flange is in the controller's base frame. Only J3 uses mm.
#[no_mangle]
pub extern "C" fn scara_inverse(
    x: f64,
    y: f64,
    z: f64,
    yaw: f64,
    tilt: f64,
    arm1: f64,
    arm2: f64,
    elbow_sign: f64,
    turn: f64,
) -> u32 {
    with_buffer(|b| {
        let cosine = (x * x + y * y - arm1 * arm1 - arm2 * arm2) / (2. * arm1 * arm2);
        if !cosine.is_finite() {
            return 1;
        }
        if !(-1. - 1e-7..=1. + 1e-7).contains(&cosine) {
            return 2;
        }
        if !(tilt < 0.01_f64.to_radians()) {
            return 3;
        }
        if z < b[6] - 1e-7 {
            return 4;
        }
        if z > b[10] + 1e-7 {
            return 5;
        }
        let magnitude = cosine.clamp(-1., 1.).acos();
        let elbows = if magnitude < 1e-9 {
            [0., f64::NAN]
        } else {
            [magnitude, -magnitude]
        };
        let mut best = None;
        for elbow in elbows {
            if !elbow.is_finite()
                || (elbow_sign != 0. && elbow.abs() >= 1e-9 && elbow.signum() != elbow_sign)
            {
                continue;
            }
            let shoulder = y.atan2(x) - (arm2 * elbow.sin()).atan2(arm1 + arm2 * elbow.cos());
            for j1 in turns(shoulder.to_degrees(), b[4], b[8]) {
                for j2 in turns(elbow.to_degrees(), b[5], b[9]) {
                    let wrist = || turns(yaw - j1 - j2, b[7], b[11]);
                    let distance = |v: f64| {
                        if turn.is_finite() && turn.fract() == 0. {
                            (((v + 1e-9) / 90.).floor() - turn).abs()
                        } else {
                            0.
                        }
                    };
                    let nearest = wrist().map(distance).fold(f64::INFINITY, f64::min);
                    for j4 in wrist().filter(|&v| distance(v) == nearest) {
                        let angles = [j1, j2, z, j4];
                        let score = angles
                            .iter()
                            .zip(&b[..4])
                            .map(|(a, v)| (a - v).powi(2))
                            .sum::<f64>();
                        if best.is_none_or(|(cost, _)| score < cost) {
                            best = Some((score, angles));
                        }
                    }
                }
            }
        }
        if let Some((_, angles)) = best {
            b[..4].copy_from_slice(&angles);
            0
        } else {
            6
        }
    })
}

fn dot(a: &[f64], b: &[f64]) -> f64 {
    a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}

/// Damped least-squares Jacobian update. Joint axes, pivots, TCP and
/// rotation tasks are all expressed in the same world frame.
#[no_mangle]
pub extern "C" fn ik_step(
    joints: usize,
    rotation_tasks: usize,
    scale: f64,
    damping: f64,
    max_linear: f64,
    max_angular: f64,
) -> bool {
    with_buffer(|b| {
        let rows = 3 + rotation_tasks;
        let tasks = &b[9..9 + 3 * rotation_tasks];
        let descriptors = &b[9 + 3 * rotation_tasks..];
        let mut jacobian = vec![0.; rows * joints];
        for (column, joint) in descriptors.chunks_exact(7).take(joints).enumerate() {
            let axis = &joint[1..4];
            if joint[0] != 0. {
                for i in 0..3 {
                    jacobian[i * joints + column] = axis[i] * scale / scale;
                }
            } else {
                let lever = [b[0] - joint[4], b[1] - joint[5], b[2] - joint[6]];
                for i in 0..3 {
                    let j = (i + 1) % 3;
                    let k = (i + 2) % 3;
                    jacobian[i * joints + column] =
                        (axis[j] * lever[k] - axis[k] * lever[j]) / scale;
                }
                for (i, task) in tasks.chunks_exact(3).enumerate() {
                    jacobian[(3 + i) * joints + column] = dot(axis, task);
                }
            }
        }
        let stride = joints + 1;
        let mut system = vec![0.; joints * stride];
        for (i, row) in jacobian.chunks_exact(joints).enumerate() {
            let error = if i < 3 {
                b[3 + i] / scale
            } else {
                dot(&tasks[3 * (i - 3)..], &b[6..9])
            };
            for (k, augmented) in system.chunks_exact_mut(stride).enumerate() {
                for j in 0..joints {
                    augmented[j] += row[k] * row[j];
                }
                augmented[joints] += row[k] * error;
            }
        }
        for i in 0..joints {
            system[i * stride + i] += damping * damping;
        }
        // Normalize the pivot row before eliminating, as the controller-side
        // jog solver does near singular arm or wrist configurations.
        for i in 0..joints {
            let mut pivot = i;
            for row in i + 1..joints {
                if system[row * stride + i].abs() > system[pivot * stride + i].abs() {
                    pivot = row;
                }
            }
            if system[pivot * stride + i].abs() < 1e-12 {
                return false;
            }
            for j in i..stride {
                system.swap(pivot * stride + j, i * stride + j);
            }
            let divisor = system[i * stride + i];
            for j in i..stride {
                system[i * stride + j] /= divisor;
            }
            for row in 0..joints {
                if row == i {
                    continue;
                }
                let factor = system[row * stride + i];
                for j in i..stride {
                    system[row * stride + j] -= factor * system[i * stride + j];
                }
            }
        }
        let descriptor_start = 9 + 3 * rotation_tasks;
        for i in 0..joints {
            let result = system[i * stride + joints];
            if !result.is_finite() {
                return false;
            }
            system[i * stride + joints] = if b[descriptor_start + 7 * i] != 0. {
                (result * scale).clamp(-max_linear, max_linear)
            } else {
                result.clamp(-max_angular, max_angular).to_degrees()
            };
        }
        for i in 0..joints {
            b[i] = system[i * stride + joints];
        }
        true
    })
}
