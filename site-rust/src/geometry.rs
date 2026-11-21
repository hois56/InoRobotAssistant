use crate::{NUMBERS, WORDS};

type Vector = [f64; 3];
type Matrix = [[f64; 3]; 3];
fn dot(a: Vector, b: Vector) -> f64 {
    a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}
fn minus(a: Vector, b: Vector) -> Vector {
    std::array::from_fn(|i| a[i] - b[i])
}
fn cross(a: Vector, b: Vector) -> Vector {
    [
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0],
    ]
}
fn unit(a: Vector) -> Option<Vector> {
    let norm = dot(a, a).sqrt();
    (norm.is_finite() && norm > 1e-9).then(|| a.map(|v| v * (1.0 / norm)))
}
fn vector(data: &[f64], start: usize) -> Vector {
    data[start..start + 3].try_into().unwrap()
}

#[no_mangle]
pub extern "C" fn frame_axes() -> bool {
    NUMBERS.with_borrow_mut(|data| {
        let Some(x) = unit(vector(data, 0)) else {
            return false;
        };
        let raw_y = vector(data, 3);
        let Some(y) = unit(minus(raw_y, x.map(|v| v * dot(raw_y, x)))) else {
            return false;
        };
        let Some(z) = unit(cross(x, y)) else {
            return false;
        };
        let Some(y) = unit(cross(z, x)) else {
            return false;
        };
        data.clear();
        data.extend(x);
        data.extend(y);
        data.extend(z);
        true
    })
}
fn projected(a: Vector, axes: Matrix) -> Vector {
    axes.map(|v| dot(a, v))
}
#[no_mangle]
pub extern "C" fn frame_point() {
    NUMBERS.with_borrow_mut(|data| {
        let axes = std::array::from_fn(|i| vector(data, 3 + 3 * i));
        let point = projected(minus(vector(data, 12), vector(data, 0)), axes);
        data[..3].copy_from_slice(&point);
    })
}
fn parallel_axis(mass: f64, offset: Vector, i: usize, j: usize) -> f64 {
    if i == j {
        mass * (dot(offset, offset) - offset[i] * offset[i])
    } else {
        -mass * offset[i] * offset[j]
    }
}
fn in_frame(tensor: Matrix, axes: Matrix) -> Matrix {
    let left: Matrix = std::array::from_fn(|i| {
        std::array::from_fn(|j| (0..3).map(|k| axes[i][k] * tensor[k][j]).sum())
    });
    std::array::from_fn(|i| std::array::from_fn(|j| dot(left[i], axes[j]) * 1e-6))
}

// frame (origin and three basis vectors), then density, volume, centroid and
// the complete 3x3 centroidal tensor for each enabled part.
#[no_mangle]
pub extern "C" fn combine_parts() -> u32 {
    NUMBERS.with_borrow_mut(|data| {
        let origin = vector(data, 0);
        let axes = std::array::from_fn(|i| vector(data, 3 + 3 * i));
        let parts = &data[12..];
        if parts.is_empty() {
            return 1;
        }
        let mut mass = 0.0;
        let mut first = [0.0; 3];
        for p in parts.chunks_exact(14) {
            if !p[0].is_finite() || p[0] <= 0.0 {
                return 2;
            }
            if !p[1].is_finite() || p[1] <= 1e-9 {
                return 3;
            }
            if !p[2..5].iter().all(|v| v.is_finite()) {
                return 4;
            }
            if !p[5..].iter().all(|v| v.is_finite()) {
                return 5;
            }
            let m = p[0] * p[1];
            mass += m;
            for i in 0..3 {
                first[i] += p[2 + i] * m;
            }
        }
        if !mass.is_finite() || mass <= 1e-9 {
            return 6;
        }
        let center = first.map(|v| v * (1.0 / mass));
        let mut central = [[0.0; 3]; 3];
        for p in parts.chunks_exact(14) {
            let delta = minus(vector(p, 2), center);
            for (i, row) in central.iter_mut().enumerate() {
                for (j, value) in row.iter_mut().enumerate() {
                    *value += p[5 + 3 * i + j] * p[0] + parallel_axis(p[0] * p[1], delta, i, j);
                }
            }
        }
        let delta = minus(center, origin);
        let at_origin = std::array::from_fn(|i| {
            std::array::from_fn(|j| central[i][j] + parallel_axis(mass, delta, i, j))
        });
        data.clear();
        data.push(mass);
        data.extend(center);
        data.extend(projected(delta, axes));
        data.extend(in_frame(central, axes).into_iter().flatten());
        data.extend(in_frame(at_origin, axes).into_iter().flatten());
        0
    })
}

fn diagonal(mass: f64, x: f64, y: f64, z: f64) -> [f64; 3] {
    [
        mass * (y * y + z * z),
        mass * (x * x + z * z),
        mass * (x * x + y * y),
    ]
}

// Density (g/cm³), dimensions and centre (mm) for each block.
#[no_mangle]
pub extern "C" fn block_assembly() {
    NUMBERS.with_borrow_mut(|data| {
        let mut total = 0.0;
        let mut center = [0.0; 3];
        for b in data.chunks_exact_mut(7) {
            let mass = b[0] * b[1] * b[2] * b[3] * 1e-6;
            b[0] = mass;
            total += mass;
            for k in 0..3 {
                center[k] += mass * b[4 + k];
            }
        }
        for v in &mut center {
            *v = if total > 0.0 { *v / total } else { 0.0 };
        }
        let mut inertia = [0.0; 3];
        for b in data.chunks_exact(7) {
            let local = diagonal(b[0], b[1] / 1000.0, b[2] / 1000.0, b[3] / 1000.0);
            let shift = diagonal(
                b[0],
                (b[4] - center[0]) / 1000.0,
                (b[5] - center[1]) / 1000.0,
                (b[6] - center[2]) / 1000.0,
            );
            for k in 0..3 {
                inertia[k] += local[k] / 12.0 + shift[k];
            }
        }
        data.clear();
        data.push(total);
        data.extend(center);
        data.extend(inertia);
    });
}

#[no_mangle]
pub extern "C" fn shape_inertias() {
    NUMBERS.with_borrow_mut(|data| {
        let mut totals = [0.0; 4];
        for b in data.chunks_exact_mut(4) {
            let local = diagonal(b[0], b[1] / 1000.0, b[2] / 1000.0, b[3] / 1000.0);
            for k in 0..3 {
                b[k + 1] = local[k] / 12.0;
            }
            for k in 0..4 {
                totals[k] += b[k];
            }
        }
        data.extend(totals);
    });
}

// Replace each (load, limit) pair with its remaining margin and verdict.
#[no_mangle]
pub extern "C" fn load_verdicts() -> u32 {
    NUMBERS.with_borrow_mut(|data| {
        let mut worst = 0;
        for row in data.chunks_exact_mut(2) {
            let margin = (1.0 - row[0] / row[1]) * 100.0;
            let verdict = if row[0] <= row[1] {
                u32::from(margin < 10.0)
            } else {
                2
            };
            row[0] = margin;
            row[1] = f64::from(verdict);
            worst = worst.max(verdict);
        }
        worst
    })
}

#[no_mangle]
pub extern "C" fn wrist_load(
    mass: f64,
    x_mm: f64,
    y_mm: f64,
    z_mm: f64,
    j5_mm: f64,
    iyy: f64,
    izz: f64,
) {
    let (x, y, z) = (x_mm / 1000.0, y_mm / 1000.0, z_mm / 1000.0 + j5_mm / 1000.0);
    let j5 = (z * z + x * x).sqrt();
    let j6 = (x * x + y * y).sqrt();
    let inertia = diagonal(mass, x, y, z);
    NUMBERS.with_borrow_mut(|data| {
        data.clear();
        data.extend([
            j5,
            j6,
            mass * 9.8 * j5,
            mass * 9.8 * j6,
            iyy + inertia[1],
            izz + inertia[2],
        ]);
    });
}

fn second(a: f64, b: f64, c: f64) -> f64 {
    a * a + b * b + c * c + a * b + a * c + b * c
}
fn mixed(a: [f64; 3], b: [f64; 3]) -> f64 {
    let [x, y, z] = a;
    let [u, v, w] = b;
    2.0 * (x * u + y * v + z * w) + x * v + y * u + x * w + z * u + y * w + z * v
}

#[no_mangle]
pub extern "C" fn mesh_integrate() -> u32 {
    NUMBERS.with_borrow_mut(|v| {
        WORDS.with_borrow(|indices| {
            if v.len() < 9 || v.len() % 3 != 0 {
                return 1;
            }
            let indexed = !indices.is_empty();
            let count = if indexed { indices.len() } else { v.len() / 3 };
            if count < 3 || count % 3 != 0 {
                return 2;
            }
            let mut volume = 0.0;
            let mut first = [0.0; 3];
            let mut squares = [0.0; 3];
            let mut products = [0.0; 3]; // xy, xz, yz
            for i in (0..count).step_by(3) {
                let mut axis = [[0.0; 3]; 3];
                for j in 0..3 {
                    let vertex = if indexed {
                        indices[i + j] as usize
                    } else {
                        i + j
                    };
                    if vertex >= v.len() / 3 {
                        return 3;
                    }
                    for k in 0..3 {
                        let coordinate = v[3 * vertex + k];
                        if !coordinate.is_finite() {
                            return 3;
                        }
                        axis[k][j] = coordinate;
                    }
                }
                let [x, y, z] = axis;
                let signed = (x[0] * (y[1] * z[2] - z[1] * y[2])
                    + y[0] * (z[1] * x[2] - x[1] * z[2])
                    + z[0] * (x[1] * y[2] - y[1] * x[2]))
                    / 6.0;
                volume += signed;
                for (k, &[a, b, c]) in axis.iter().enumerate() {
                    first[k] += signed * (a + b + c) / 4.0;
                    squares[k] += signed * second(a, b, c) / 10.0;
                }
                for (k, (a, b)) in [(x, y), (x, z), (y, z)].into_iter().enumerate() {
                    products[k] += signed * mixed(a, b) / 20.0;
                }
            }
            if !volume.is_finite() || volume.abs() <= 1e-9 {
                return 4;
            }
            let [x, y, z] = first.map(|s| s / volume);
            let [xx, yy, zz] = squares.map(|s| s * volume.signum());
            let [xy, xz, yz] = products.map(|s| s * volume.signum());
            let volume = volume.abs();
            let r2 = x * x + y * y + z * z;
            let (ixy, ixz, iyz) = (
                -xy + volume * x * y,
                -xz + volume * x * z,
                -yz + volume * y * z,
            );
            v.clear();
            v.extend([
                volume,
                x,
                y,
                z,
                yy + zz - volume * (r2 - x * x),
                ixy,
                ixz,
                ixy,
                xx + zz - volume * (r2 - y * y),
                iyz,
                ixz,
                iyz,
                xx + yy - volume * (r2 - z * z),
            ]);
            0
        })
    })
}
