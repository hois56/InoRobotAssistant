use crate::with_buffer;
use std::f64::consts::PI;

type Point = [f64; 3];

fn delta(a: Point, b: Point) -> Point {
    [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
}
fn norm(p: Point) -> f64 {
    (p[0] * p[0] + p[1] * p[1] + p[2] * p[2]).sqrt()
}

#[no_mangle]
pub extern "C" fn film_layout(
    length: f64,
    width: f64,
    grip_width: f64,
    mut offset: f64,
    mut side: usize,
    pick: bool,
) -> usize {
    with_buffer(|b| {
        if pick {
            let (x, y) = (b[0], b[1]);
            let distances = [
                x.abs(),
                (x - length).abs(),
                (y + width / 2.).abs(),
                (y - width / 2.).abs(),
            ];
            side = 0;
            for i in 1..4 {
                if distances[i] < distances[side] {
                    side = i;
                }
            }
            offset = match side {
                0 => 0.5 + y / width,
                1 => 0.5 - y / width,
                2 => 1. - x / length,
                _ => x / length,
            };
        }
        let (l, w) = if matches!(side, 2 | 3) {
            (width, length)
        } else {
            (length, width)
        };
        let (x, y, angle) = match side {
            1 => (length, 0., PI),
            2 => (length / 2., -width / 2., PI / 2.),
            3 => (length / 2., width / 2., -PI / 2.),
            _ => (0., 0., 0.),
        };
        b[..8].copy_from_slice(&[
            l,
            w,
            x,
            y,
            0.,
            angle,
            offset.clamp(0., 1.),
            grip_width.min(w),
        ]);
        side
    })
}

#[no_mangle]
pub extern "C" fn film_peel(length: f64, width: f64, offset: f64, x: f64, y: f64, z: f64) -> f64 {
    let p = [x, y - width * (offset - 0.5), z];
    if norm(p) < 1e-8 {
        return 0.;
    }
    if x <= 1e-8 {
        return -1.;
    }
    let peel = (x * x + p[1] * p[1] + z * z) / (2. * x);
    if peel >= length - 1e-9 {
        length
    } else {
        peel
    }
}

#[no_mangle]
pub extern "C" fn film_grid(rows: usize, columns: usize, length: f64, width: f64) {
    with_buffer(|b| {
        let (points, _) = b.as_chunks_mut::<3>();
        for (row, line) in points.chunks_exact_mut(columns + 1).enumerate() {
            for (column, p) in line.iter_mut().enumerate() {
                *p = [
                    length * row as f64 / rows as f64,
                    width * (column as f64 / columns as f64 - 0.5),
                    0.,
                ];
            }
        }
    })
}

#[no_mangle]
pub extern "C" fn film_length_error(rows: usize, columns: usize, length: f64) -> f64 {
    with_buffer(|b| {
        let (points, _) = b.as_chunks::<3>();
        let rest = length / rows as f64;
        points
            .iter()
            .zip(points.iter().skip(columns + 1))
            .map(|(&a, &b)| (norm(delta(a, b)) - rest).abs())
            .fold(0., f64::max)
    })
}

fn constrain(
    points: &mut [Point],
    fixed: &[Option<Point>],
    a: usize,
    b: usize,
    rest: f64,
    strength: f64,
) {
    let (wa, wb) = (
        fixed[a].is_none() as u8 as f64,
        fixed[b].is_none() as u8 as f64,
    );
    if wa + wb == 0. {
        return;
    }
    let d = delta(points[b], points[a]);
    let distance = norm(d);
    if distance < 1e-10 {
        return;
    }
    let factor = (distance - rest) / distance * strength / (wa + wb);
    for k in 0..3 {
        points[a][k] += d[k] * factor * wa;
        points[b][k] -= d[k] * factor * wb;
    }
}

// The first eight numbers carry the anchor, ground plane and returned free
// length. Each edge entry contains a presence flag and the held position.
// Current and previous particle positions then follow in row-major order.
#[no_mangle]
pub extern "C" fn film_step(
    rows: usize,
    columns: usize,
    length: f64,
    width: f64,
    peel: f64,
    seconds: f64,
    stiffness: f64,
    damping: f64,
    offset: f64,
    grip_width: f64,
    has_anchor: bool,
    has_edge: bool,
    released: bool,
    ground: bool,
) -> i32 {
    with_buffer(|b| {
        let stride = columns + 1;
        let (header, b) = b.split_at_mut(8);
        let free = peel.min(length).max(0.);
        header[7] = free;
        if released && free < length {
            return 1;
        }
        let (edge, b) = b.split_at_mut(4 * stride);
        let (particles, _) = b.as_chunks_mut::<3>();
        let (points, previous) = particles.split_at_mut((rows + 1) * stride);
        let ds = length / rows as f64;
        let dw = width / columns as f64;
        let radius = free / (PI * (2. / 3. - stiffness.clamp(0., 1.) / 6.));
        let curve = |row: usize| {
            let flat = row as f64 * ds;
            let s = (free - flat).max(0.);
            if s == 0. {
                (flat, 0.)
            } else {
                let theta = s / radius;
                (free - radius * theta.sin(), radius * (1. - theta.cos()))
            }
        };
        let y = |column: usize| width * (column as f64 / columns as f64 - 0.5);
        if !released && ((!has_anchor && !has_edge) || free == 0.) {
            for (row, line) in points.chunks_exact_mut(stride).enumerate() {
                let (x, z) = curve(row);
                for (col, p) in line.iter_mut().enumerate() {
                    *p = [x, y(col), z];
                }
            }
            previous.copy_from_slice(points);
            return 0;
        }
        let free_row = (free / ds).ceil() as usize;
        let grip_y = width * (offset - 0.5);
        let (end_x, end_z) = curve(0);
        let end = if has_anchor {
            [header[0], header[1], header[2]]
        } else {
            [end_x, grip_y, end_z]
        };
        if !released && free < length && norm(delta(end, [free, grip_y, 0.])) > free * 1.005 {
            return 2;
        }
        let fixed: Vec<_> = (0..points.len())
            .map(|i| {
                let (row, col) = (i / stride, i % stride);
                let yy = y(col);
                if row == 0
                    && !released
                    && ((yy - grip_y).abs() <= grip_width / 2.
                        || col as f64 == (offset * columns as f64).round())
                {
                    if has_edge && edge[4 * col] != 0. {
                        Some([edge[4 * col + 1], edge[4 * col + 2], edge[4 * col + 3]])
                    } else {
                        Some([end[0], end[1] + yy - grip_y, end[2]])
                    }
                } else if row >= free_row && free < length {
                    Some([row as f64 * ds, yy, 0.])
                } else {
                    None
                }
            })
            .collect();
        let dt = seconds.clamp(0., 1. / 60.);
        let decay = damping.powf(dt * 60.);
        let normal = if ground {
            [header[3], header[4], header[5]]
        } else {
            [0., 0., 1.]
        };
        let magnitude = norm(normal);
        let scale = if magnitude == 0. { 1. } else { magnitude };
        let gravity = normal.map(|n| n / scale * 9810. * dt * dt);
        for (i, p) in points.iter_mut().enumerate() {
            if let Some(pin) = fixed[i] {
                *p = pin;
                previous[i] = pin;
                continue;
            }
            let old = *p;
            for k in 0..3 {
                p[k] += (p[k] - previous[i][k]) * decay;
                p[k] -= gravity[k];
            }
            previous[i] = old;
        }
        let diagonal = ds.hypot(dw);
        let normal_squared = normal.iter().map(|x| x * x).sum::<f64>();
        for _ in 0..24 {
            for row in 0..rows {
                for col in 0..stride {
                    let i = row * stride + col;
                    if !released && free < length && row + 1 == free_row {
                        if fixed[i].is_none() {
                            let front = [free, y(col), 0.];
                            let d = delta(points[i], front);
                            let n = norm(d);
                            if n > 1e-10 {
                                for k in 0..3 {
                                    points[i][k] = front[k] + d[k] * (free - row as f64 * ds) / n;
                                }
                            }
                        }
                    } else {
                        constrain(points, &fixed, i, i + stride, ds, 1.);
                    }
                    if col < columns {
                        constrain(points, &fixed, i, i + 1, dw, 1.);
                        constrain(points, &fixed, i, i + stride + 1, diagonal, 1.);
                        constrain(points, &fixed, i + 1, i + stride, diagonal, 1.);
                    }
                    if row + 2 <= rows {
                        constrain(points, &fixed, i, i + 2 * stride, 2. * ds, stiffness);
                    }
                }
            }
            for (i, p) in points.iter_mut().enumerate() {
                if let Some(pin) = fixed[i] {
                    *p = pin;
                    continue;
                }
                if (0. ..=length).contains(&p[0]) && p[1].abs() <= width / 2. {
                    p[2] = p[2].max(0.3);
                }
                if ground {
                    let distance = (0..3).fold(header[6], |s, k| s + normal[k] * p[k]);
                    if distance < 0. && normal_squared > 0. {
                        for k in 0..3 {
                            p[k] -= distance * normal[k] / normal_squared;
                        }
                    }
                }
            }
        }
        0
    })
}
