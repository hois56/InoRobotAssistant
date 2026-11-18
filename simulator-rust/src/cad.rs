use crate::{with_buffer, BUFFER};
use std::{collections::VecDeque, f64::consts::TAU};

type Point = [f64; 2];
const JOIN: f64 = 1e-7;
fn distance(a: Point, b: Point) -> f64 {
    (a[0] - b[0]).hypot(a[1] - b[1])
}
fn points(values: &[f64]) -> Vec<Point> {
    values.chunks_exact(2).map(|p| [p[0], p[1]]).collect()
}
fn push_points(b: &mut Vec<f64>, points: &[Point]) {
    for p in points {
        b.extend_from_slice(p);
    }
}
fn output_points(p: &[Point]) -> usize {
    BUFFER.with_borrow_mut(|b| {
        b.clear();
        push_points(b, p);
    });
    p.len()
}
fn samples(sweep: f64, segments: f64, minimum: f64) -> usize {
    (sweep.abs() / TAU * segments).ceil().clamp(minimum, 512.) as usize
}
fn curve(start: f64, sweep: f64, count: usize, point: impl Fn(f64) -> Point) -> Vec<Point> {
    if count == 0 {
        return Vec::new();
    }
    (0..=count)
        .map(|i| point(start + sweep * i as f64 / count as f64))
        .collect()
}
#[no_mangle]
pub extern "C" fn cad_arc(
    x: f64,
    y: f64,
    mx: f64,
    my: f64,
    ratio: f64,
    start: f64,
    end: f64,
    segments: f64,
    ellipse: bool,
) -> usize {
    let mut sweep = end - start;
    if !sweep.is_finite() {
        sweep = TAU;
    }
    if sweep <= 0. {
        sweep += TAU;
    }
    let result = curve(start, sweep, samples(sweep, segments, 8.), |angle| {
        let (s, c) = angle.sin_cos();
        if ellipse {
            [x + mx * c - my * ratio * s, y + my * c + mx * ratio * s]
        } else {
            [x + c * mx, y + s * mx]
        }
    });
    output_points(&result)
}
fn bulge(a: Point, b: Point, value: f64, segments: f64) -> Vec<Point> {
    if value.abs() < 1e-9 {
        return vec![a, b];
    }
    let chord = distance(a, b);
    if chord < 1e-9 {
        return vec![a];
    }
    let theta = 4. * value.atan();
    let radius = chord * (1. + value * value) / (4. * value.abs());
    let offset = chord * (1. - value * value) / (4. * value);
    let cx = (a[0] + b[0]) / 2. - (b[1] - a[1]) / chord * offset;
    let cy = (a[1] + b[1]) / 2. + (b[0] - a[0]) / chord * offset;
    let start = (a[1] - cy).atan2(a[0] - cx);
    curve(start, theta, samples(theta, segments, 4.), |angle| {
        [cx + angle.cos() * radius, cy + angle.sin() * radius]
    })
}
#[no_mangle]
pub extern "C" fn cad_bulge(
    ax: f64,
    ay: f64,
    bx: f64,
    by: f64,
    value: f64,
    segments: f64,
) -> usize {
    output_points(&bulge([ax, ay], [bx, by], value, segments))
}
#[no_mangle]
pub extern "C" fn cad_polyline(count: usize, closed: bool, segments: f64) -> usize {
    let result = with_buffer(|v| {
        let vertices: Vec<_> = v[..3 * count]
            .chunks_exact(3)
            .map(|p| ([p[0], p[1]], p[2]))
            .collect();
        let mut result = Vec::new();
        if vertices.is_empty() {
            return result;
        }
        for i in 0..if closed { count } else { count - 1 } {
            let (a, b) = (vertices[i], vertices[(i + 1) % count]);
            let edge = bulge(a.0, b.0, a.1, segments);
            result.extend(edge.into_iter().skip(usize::from(i > 0)));
        }
        if !closed && result.is_empty() {
            result.push(vertices[0].0);
        }
        if closed && result.len() > 1 && distance(result[0], *result.last().unwrap()) > JOIN {
            result.push(result[0]);
        }
        result
    });
    output_points(&result)
}
fn bounds(p: &[Point]) -> [f64; 4] {
    let mut b = [
        f64::INFINITY,
        f64::INFINITY,
        f64::NEG_INFINITY,
        f64::NEG_INFINITY,
    ];
    for &[x, y] in p {
        if !x.is_finite() || !y.is_finite() {
            continue;
        }
        b = [b[0].min(x), b[1].min(y), b[2].max(x), b[3].max(y)];
    }
    if b[0].is_infinite() {
        [0.; 4]
    } else {
        b
    }
}
fn area(p: &[Point]) -> f64 {
    if p.len() < 3 {
        return 0.;
    }
    let n = p.len() - usize::from(distance(p[0], p[p.len() - 1]) < JOIN);
    (0..n)
        .map(|i| {
            let a = p[i];
            let b = p[(i + 1) % n];
            a[0] * b[1] - b[0] * a[1]
        })
        .sum::<f64>()
        / 2.
}
fn clean(mut p: Vec<Point>) -> Vec<Point> {
    let mut kept = 0;
    for i in 0..p.len() {
        if kept == 0 || distance(p[i], p[kept - 1]) > JOIN {
            p[kept] = p[i];
            kept += 1;
        }
    }
    p.truncate(kept);
    if p.len() > 1 && distance(p[0], p[p.len() - 1]) <= JOIN {
        p.pop();
    }
    p
}
fn contains(p: Point, polygon: &[Point], boundary: bool) -> bool {
    if polygon.len() < 3 {
        return false;
    }
    let mut inside = false;
    let mut a = *polygon.last().unwrap();
    for &b in polygon {
        if boundary
            && ((p[0] - a[0]) * (b[1] - a[1]) - (p[1] - a[1]) * (b[0] - a[0])).abs() <= 1e-6
            && (0..2).all(|i| p[i] >= a[i].min(b[i]) - 1e-6 && p[i] <= a[i].max(b[i]) + 1e-6)
        {
            return true;
        }
        if (b[1] > p[1]) != (a[1] > p[1])
            && p[0] < (a[0] - b[0]) * (p[1] - b[1]) / (a[1] - b[1]) + b[0]
        {
            inside = !inside;
        }
        a = b;
    }
    inside
}
#[no_mangle]
pub extern "C" fn cad_length(count: usize, closed: bool) -> f64 {
    with_buffer(|b| {
        let p = points(&b[..2 * count]);
        let mut sum = p.windows(2).map(|w| distance(w[0], w[1])).sum();
        if closed && p.len() > 2 {
            let d = distance(p[0], p[p.len() - 1]);
            if d > JOIN {
                sum += d;
            }
        }
        sum
    })
}
#[no_mangle]
pub extern "C" fn cad_bounds(count: usize) {
    with_buffer(|b| {
        let result = bounds(&points(&b[..2 * count]));
        b[..4].copy_from_slice(&result);
    });
}
#[no_mangle]
pub extern "C" fn cad_area(count: usize) -> f64 {
    with_buffer(|b| area(&points(&b[..2 * count])))
}
#[no_mangle]
pub extern "C" fn cad_contains(count: usize, x: f64, y: f64, boundary: bool) -> bool {
    with_buffer(|b| contains([x, y], &clean(points(&b[..2 * count])), boundary))
}
#[no_mangle]
pub extern "C" fn cad_segment_distance(x: f64, y: f64, ax: f64, ay: f64, bx: f64, by: f64) -> f64 {
    let (dx, dy) = (bx - ax, by - ay);
    let squared = dx * dx + dy * dy;
    let t = if squared > 1e-12 {
        (((x - ax) * dx + (y - ay) * dy) / squared).clamp(0., 1.)
    } else {
        0.
    };
    distance([x, y], [ax + t * dx, ay + t * dy])
}

struct Loop {
    points: Vec<Point>,
    ids: Vec<usize>,
    signed: f64,
    bounds: [f64; 4],
}
impl Loop {
    fn create(p: Vec<Point>, ids: Vec<usize>) -> Option<Self> {
        let points = clean(p);
        let signed = area(&points);
        if points.len() < 3 || signed.abs() <= JOIN {
            return None;
        }
        Some(Self {
            bounds: bounds(&points),
            points,
            signed,
            ids,
        })
    }
    fn sample(&self) -> Point {
        let mut average = [0., 0.];
        for p in &self.points {
            average[0] += p[0];
            average[1] += p[1];
        }
        average = average.map(|v| v / self.points.len() as f64);
        if contains(average, &self.points, false) {
            average
        } else {
            self.points[0]
        }
    }
}
struct Edge {
    id: usize,
    points: Vec<Point>,
}
fn stitch(edges: &[Edge], loops: &mut Vec<Loop>) {
    let mut unused: VecDeque<_> = (0..edges.len()).collect();
    while let Some(seed) = unused.pop_front() {
        let mut chain = vec![seed];
        let mut points = edges[seed].points.clone();
        let mut closed = false;
        for _ in 0..edges.len() {
            let end = *points.last().unwrap();
            if points.len() >= 3 && distance(end, points[0]) <= 1e-5 {
                closed = true;
                break;
            }
            let mut nearest = f64::INFINITY;
            let mut candidate = None;
            for (i, &key) in unused.iter().enumerate() {
                let p = &edges[key].points;
                let d = distance(p[0], end);
                if (d <= 1e-5 || distance(*p.last().unwrap(), end) <= 1e-5) && d < nearest {
                    nearest = d;
                    candidate = Some(i);
                }
            }
            let Some(i) = candidate else {
                break;
            };
            let key = unused.remove(i).unwrap();
            let p = &edges[key].points;
            if nearest <= 1e-5 {
                points.extend_from_slice(&p[1..]);
            } else {
                points.extend(p.iter().rev().skip(1).copied());
            }
            chain.push(key);
        }
        if closed {
            if let Some(l) = Loop::create(points, chain.into_iter().map(|i| edges[i].id).collect())
            {
                loops.push(l);
            }
        } else {
            unused.extend(chain.into_iter().skip(1));
        }
    }
}
fn parents(loops: &[Loop]) -> Vec<Option<usize>> {
    if loops.is_empty() {
        return Vec::new();
    }
    let corners: Vec<_> = loops
        .iter()
        .flat_map(|l| [[l.bounds[0], l.bounds[1]], [l.bounds[2], l.bounds[3]]])
        .collect();
    let all = bounds(&corners);
    let cell = |v: f64, axis: usize| {
        (((v - all[axis]) / (all[axis + 2] - all[axis]).max(1e-9) * 128.).floor() as usize).min(127)
    };
    let mut grid = vec![Vec::<usize>::new(); 128 * 128];
    let mut large = Vec::new();
    for (i, l) in loops.iter().enumerate() {
        let (x, u, y, v) = (
            cell(l.bounds[0], 0),
            cell(l.bounds[2], 0),
            cell(l.bounds[1], 1),
            cell(l.bounds[3], 1),
        );
        if (u - x + 1) * (v - y + 1) > 4096 {
            large.push(i);
            continue;
        }
        for sx in x..=u {
            for sy in y..=v {
                grid[sx * 128 + sy].push(i);
            }
        }
    }
    loops
        .iter()
        .map(|l| {
            let p = l.sample();
            let mut nearest = None;
            let mut area = f64::INFINITY;
            for &i in grid[cell(p[0], 0) * 128 + cell(p[1], 1)]
                .iter()
                .chain(&large)
            {
                let outer = &loops[i];
                let a = outer.signed.abs();
                if a > l.signed.abs() + JOIN
                    && a < area
                    && (0..2).all(|axis| {
                        p[axis] >= outer.bounds[axis] - JOIN
                            && p[axis] <= outer.bounds[axis + 2] + JOIN
                    })
                    && contains(p, &outer.points, false)
                {
                    area = a;
                    nearest = Some(i);
                }
            }
            nearest
        })
        .collect()
}
/// Each input entity is tagged with its original index, closure and point count.
/// Each output loop records its parent and original entity IDs for picking.
#[no_mangle]
pub extern "C" fn cad_profiles() -> usize {
    BUFFER.with_borrow_mut(|b| {
        let mut loops = Vec::new();
        let mut edges = Vec::new();
        let mut i = 0;
        while i < b.len() {
            let id = b[i] as usize;
            let closed = b[i + 1] != 0.;
            let n = b[i + 2] as usize;
            i += 3;
            let p = points(&b[i..i + 2 * n]);
            i += 2 * n;
            if closed {
                if let Some(l) = Loop::create(p, vec![id]) {
                    loops.push(l);
                }
            } else {
                let p = clean(p);
                if p.len() >= 2 {
                    edges.push(Edge { id, points: p });
                }
            }
        }
        stitch(&edges, &mut loops);
        let parent = parents(&loops);
        b.clear();
        for (l, ancestor) in loops.into_iter().zip(parent) {
            b.extend_from_slice(&[
                ancestor.map_or(-1., |v| v as f64),
                l.signed,
                l.ids.len() as f64,
                l.points.len() as f64,
            ]);
            b.extend(l.bounds);
            b.extend(l.ids.into_iter().map(|v| v as f64));
            push_points(b, &l.points);
        }
        b.len()
    })
}
