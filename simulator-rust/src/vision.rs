use crate::{kinematics::multiply, with_buffer};

/// Row-major augmented matrix, with the target in the last column.
fn solve(rows: &mut [f64], dimension: usize) -> bool {
    let stride = dimension + 1;
    for column in 0..dimension {
        let mut pivot = column;
        for row in column + 1..dimension {
            if rows[row * stride + column].abs() > rows[pivot * stride + column].abs() {
                pivot = row;
            }
        }
        if rows[pivot * stride + column].abs() < 1e-12 {
            return false;
        }
        for k in column..stride {
            rows.swap(pivot * stride + k, column * stride + k);
        }
        for row in 0..dimension {
            if row == column {
                continue;
            }
            let factor = rows[row * stride + column] / rows[column * stride + column];
            for k in column..stride {
                rows[row * stride + k] -= factor * rows[column * stride + k];
            }
        }
    }
    for i in 0..dimension {
        rows[i] = rows[i * stride + dimension] / rows[i * stride + i];
    }
    true
}

#[no_mangle]
pub extern "C" fn vision_solve(n: usize) -> bool {
    with_buffer(|b| solve(b, n))
}

struct Fit {
    normal: Vec<f64>,
    dim: usize,
}
impl Fit {
    fn new(dim: usize) -> Self {
        Self {
            normal: vec![0.; dim * (dim + 1)],
            dim,
        }
    }
    fn sample(&mut self, terms: &[f64], target: f64) {
        for (i, row) in self.normal.chunks_exact_mut(self.dim + 1).enumerate() {
            for j in 0..self.dim {
                row[j] += terms[i] * terms[j];
            }
            row[self.dim] += terms[i] * target;
        }
    }
    fn result(mut self) -> Option<Vec<f64>> {
        if !solve(&mut self.normal, self.dim) {
            return None;
        }
        self.normal.truncate(self.dim);
        Some(self.normal)
    }
}

struct Norm {
    x: f64,
    y: f64,
    scale: f64,
}
impl Norm {
    fn from_pairs(pairs: &[f64], offset: usize) -> Self {
        let count = pairs.len() as f64 / 4.;
        let x = pairs.chunks_exact(4).map(|p| p[offset]).sum::<f64>() / count;
        let y = pairs.chunks_exact(4).map(|p| p[offset + 1]).sum::<f64>() / count;
        let mean = pairs
            .chunks_exact(4)
            .map(|p| (p[offset] - x).hypot(p[offset + 1] - y))
            .sum::<f64>()
            / count;
        Self {
            x,
            y,
            scale: if mean > 1e-12 {
                std::f64::consts::SQRT_2 / mean
            } else {
                1.
            },
        }
    }
    fn matrix(&self) -> [f64; 9] {
        [
            self.scale,
            0.,
            -self.scale * self.x,
            0.,
            self.scale,
            -self.scale * self.y,
            0.,
            0.,
            1.,
        ]
    }
    fn inverse(&self) -> [f64; 9] {
        [
            1. / self.scale,
            0.,
            self.x,
            0.,
            1. / self.scale,
            self.y,
            0.,
            0.,
            1.,
        ]
    }
    fn point(&self, x: f64, y: f64) -> (f64, f64) {
        (
            self.scale * x - self.scale * self.x,
            self.scale * y - self.scale * self.y,
        )
    }
}

#[no_mangle]
pub extern "C" fn vision_calibrate(count: usize, projective: bool) -> bool {
    with_buffer(|b| {
        let pairs = &b[..4 * count];
        let pixel = Norm::from_pairs(pairs, 0);
        let matrix = if projective {
            let world = Norm::from_pairs(pairs, 2);
            let mut fit = Fit::new(8);
            for p in pairs.chunks_exact(4) {
                let (u, v) = pixel.point(p[0], p[1]);
                let (x, y) = world.point(p[2], p[3]);
                fit.sample(&[u, v, 1., 0., 0., 0., -u * x, -v * x], x);
                fit.sample(&[0., 0., 0., u, v, 1., -u * y, -v * y], y);
            }
            let Some(h) = fit.result() else {
                return false;
            };
            let transform = [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1.];
            let m = multiply(multiply(world.inverse(), transform), pixel.matrix());
            if m[8].abs() < 1e-12 {
                return false;
            }
            m.map(|v| v / m[8])
        } else {
            let (mut xs, mut ys) = (Fit::new(3), Fit::new(3));
            for p in pairs.chunks_exact(4) {
                let (u, v) = pixel.point(p[0], p[1]);
                xs.sample(&[u, v, 1.], p[2]);
                ys.sample(&[u, v, 1.], p[3]);
            }
            let (Some(x), Some(y)) = (xs.result(), ys.result()) else {
                return false;
            };
            let m = multiply(
                [x[0], x[1], x[2], y[0], y[1], y[2], 0., 0., 1.],
                pixel.matrix(),
            );
            if (m[0] * m[4] - m[1] * m[3]).abs() < 1e-12 {
                return false;
            }
            m
        };
        b[..9].copy_from_slice(&matrix);
        true
    })
}

#[no_mangle]
pub extern "C" fn vision_fit_circle(count: usize) -> i32 {
    with_buffer(|b| {
        let points = &b[..count * 2];
        let mx = points.chunks_exact(2).map(|p| p[0]).sum::<f64>() / count as f64;
        let my = points.chunks_exact(2).map(|p| p[1]).sum::<f64>() / count as f64;
        let mut fit = Fit::new(3);
        for p in points.chunks_exact(2) {
            let (x, y) = (p[0] - mx, p[1] - my);
            fit.sample(&[x, y, 1.], -(x * x + y * y));
        }
        let Some(f) = fit.result() else {
            return -1;
        };
        let (x, y) = (-f[0] / 2., -f[1] / 2.);
        let squared = x * x + y * y - f[2];
        if !(squared > 0.) {
            return -2;
        }
        let (x, y, r) = (x + mx, y + my, squared.sqrt());
        let rms = (points
            .chunks_exact(2)
            .map(|p| ((p[0] - x).hypot(p[1] - y) - r).powi(2))
            .sum::<f64>()
            / count as f64)
            .sqrt();
        b[..4].copy_from_slice(&[x, y, r, rms]);
        0
    })
}

#[no_mangle]
pub extern "C" fn vision_invert() -> bool {
    with_buffer(|values| {
        let [a, b, c, d, e, f, g, h, i]: [f64; 9] = values[..9].try_into().unwrap();
        let cofactors = [
            e * i - f * h,
            c * h - b * i,
            b * f - c * e,
            f * g - d * i,
            a * i - c * g,
            c * d - a * f,
            d * h - e * g,
            b * g - a * h,
            a * e - b * d,
        ];
        let determinant = a * cofactors[0] + b * cofactors[3] + c * cofactors[6];
        if determinant.abs() < 1e-15 {
            return false;
        }
        values[..9].copy_from_slice(&cofactors.map(|v| v / determinant));
        true
    })
}

#[no_mangle]
pub extern "C" fn vision_apply(u: f64, v: f64) -> bool {
    with_buffer(|m| {
        let w = m[6] * u + m[7] * v + m[8];
        if w.abs() < 1e-12 {
            return false;
        }
        let x = (m[0] * u + m[1] * v + m[2]) / w;
        let y = (m[3] * u + m[4] * v + m[5]) / w;
        m[..2].copy_from_slice(&[x, y]);
        true
    })
}
