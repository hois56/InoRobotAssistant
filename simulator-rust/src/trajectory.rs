use crate::{with_buffer, BUFFER};

type Point = [f64; 3];

fn distance(a: Point, b: Point) -> f64 {
    (a[0] - b[0]).hypot(a[1] - b[1]).hypot(a[2] - b[2])
}

fn length(points: &[Point]) -> f64 {
    points.windows(2).map(|p| distance(p[0], p[1])).sum()
}

fn mix(a: Point, b: Point, fraction: f64) -> Point {
    if fraction <= 1e-12 {
        a
    } else if fraction >= 1. - 1e-12 {
        b
    } else {
        std::array::from_fn(|i| a[i] + (b[i] - a[i]) * fraction)
    }
}

fn clean(curve: &[f64], closed: bool) -> Result<Vec<Point>, i32> {
    let mut points = Vec::new();
    for xyz in curve.chunks_exact(3) {
        let point = [xyz[0], xyz[1], xyz[2]];
        if points.last().is_none_or(|&p| distance(p, point) > 1e-7) {
            points.push(point);
        }
    }
    if points.len() < 2 {
        return Err(-1);
    }
    if closed && distance(points[0], *points.last().unwrap()) > 1e-7 {
        points.push(points[0]);
    }
    Ok(points)
}

fn simplify(points: &[Point], tolerance: f64) -> Vec<Point> {
    let last = points.len() - 1;
    let mut keep = vec![false; points.len()];
    keep[0] = true;
    keep[last] = true;
    let mut stack = vec![(0, last)];
    while let Some((first, last)) = stack.pop() {
        let (a, b) = (points[first], points[last]);
        let segment2 = distance(a, b).powi(2);
        let mut furthest = None;
        let mut maximum = tolerance;
        for (index, &p) in points.iter().enumerate().take(last).skip(first + 1) {
            let dot: f64 = (0..3).map(|i| (p[i] - a[i]) * (b[i] - a[i])).sum();
            let t = if segment2 == 0. {
                0.
            } else {
                (dot / segment2).clamp(0., 1.)
            };
            let deviation = distance(p, mix(a, b, t));
            if deviation > maximum {
                maximum = deviation;
                furthest = Some(index);
            }
        }
        if let Some(i) = furthest {
            keep[i] = true;
            stack.extend([(first, i), (i, last)]);
        }
    }
    points
        .iter()
        .zip(keep)
        .filter_map(|(&p, keep)| keep.then_some(p))
        .collect()
}

struct Options {
    step: f64,
    tolerance: f64,
    chord: bool,
    join: f64,
    reverse: bool,
    start: f64,
    end: f64,
    max_points: usize,
}

fn generate(encoded: &[f64], options: Options) -> Result<(Vec<Point>, f64), i32> {
    let mut curves = Vec::new();
    let mut pos = 0;
    while pos < encoded.len() {
        let count = encoded[pos] as usize;
        let closed = encoded[pos + 1] != 0.;
        let end = pos + 2 + count * 3;
        curves.push((clean(&encoded[pos + 2..end], closed)?, closed));
        pos = end;
    }
    let mut curves = curves.into_iter().peekable();
    let (mut path, closed) = curves.next().ok_or(-1)?;
    if let Some((next, _)) = curves.peek() {
        let gap = |p| distance(p, next[0]).min(distance(p, *next.last().unwrap()));
        if !closed && gap(path[0]) < gap(*path.last().unwrap()) {
            path.reverse();
        }
    }
    for (mut next, _) in curves {
        let tail = *path.last().unwrap();
        if distance(tail, *next.last().unwrap()) < distance(tail, next[0]) {
            next.reverse();
        }
        let gap = distance(tail, next[0]);
        if gap > options.join {
            return Err(-2);
        }
        path.extend(next.into_iter().skip(usize::from(gap <= 1e-7)));
    }
    if options.reverse {
        path.reverse();
    }
    let source = length(&path);
    if options.start + options.end >= source - 1e-7 {
        return Err(-3);
    }
    let mut trimmed = Vec::new();
    let mut travelled: f64 = 0.;
    for pair in path.windows(2) {
        let (a, b) = (pair[0], pair[1]);
        let segment = distance(a, b);
        let from = travelled.max(options.start);
        let to = (travelled + segment).min(source - options.end);
        if to > from + 1e-9 {
            if trimmed.is_empty() {
                trimmed.push(mix(a, b, (from - travelled) / segment));
            }
            trimmed.push(mix(a, b, (to - travelled) / segment));
        }
        travelled += segment;
    }
    if trimmed.is_empty() {
        return Err(-3);
    }
    if options.chord {
        trimmed = simplify(&trimmed, options.tolerance);
    }
    let mut result = vec![trimmed[0]];
    for pair in trimmed.windows(2) {
        let count = (distance(pair[0], pair[1]) / options.step).ceil().max(1.) as usize;
        if count > options.max_points - result.len() {
            return Err(-4);
        }
        for i in 1..=count {
            result.push(mix(pair[0], pair[1], i as f64 / count as f64));
        }
    }
    Ok((result, source))
}

#[no_mangle]
pub extern "C" fn curve_trajectory(
    step: f64,
    tolerance: f64,
    chord: bool,
    join: f64,
    reverse: bool,
    start: f64,
    end: f64,
    max_points: usize,
) -> i32 {
    let options = Options {
        step,
        tolerance,
        chord,
        join,
        reverse,
        start,
        end,
        max_points,
    };
    let (points, source) = match with_buffer(|b| generate(b, options)) {
        Ok(result) => result,
        Err(code) => return code,
    };
    let count = points.len();
    BUFFER.with_borrow_mut(|out| {
        out.clear();
        out.extend([length(&points), source]);
        out.extend(points.into_iter().flatten());
    });
    count as i32
}
