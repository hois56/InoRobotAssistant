use crate::with_buffer;
type Vec3 = [f64; 3];
type Triangle = [Vec3; 3];

fn sub(a: Vec3, b: Vec3) -> Vec3 {
    [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
}
fn dot(a: Vec3, b: Vec3) -> f64 {
    a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}
fn cross(a: Vec3, b: Vec3) -> Vec3 {
    [
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0],
    ]
}
fn norm(a: Vec3) -> f64 {
    a[0].hypot(a[1]).hypot(a[2])
}

fn edge_hits(a: Vec3, b: Vec3, t: &Triangle, epsilon: f64) -> bool {
    let dir = sub(b, a);
    let (e1, e2) = (sub(t[1], t[0]), sub(t[2], t[0]));
    let p = cross(dir, e2);
    let determinant = dot(e1, p);
    if determinant.abs() <= epsilon {
        return false;
    }
    let inv = 1. / determinant;
    let relative = sub(a, t[0]);
    let u = dot(relative, p) * inv;
    if u < -epsilon || u > 1. + epsilon {
        return false;
    }
    let q = cross(relative, e1);
    let v = dot(dir, q) * inv;
    let along = dot(e2, q) * inv;
    v >= -epsilon && u + v <= 1. + epsilon && along >= -epsilon && along <= 1. + epsilon
}

type Point2 = [f64; 2];

fn orient(a: Point2, b: Point2, c: Point2) -> f64 {
    (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
}

fn inside(p: Point2, t: &[Point2; 3], eps: f64) -> bool {
    let corners = [
        orient(t[0], t[1], p),
        orient(t[1], t[2], p),
        orient(t[2], t[0], p),
    ];
    !corners.iter().any(|v| *v < -eps) || !corners.iter().any(|v| *v > eps)
}

fn within(p: Point2, a: Point2, b: Point2, eps: f64) -> bool {
    (0..2).all(|i| p[i] >= a[i].min(b[i]) - eps && p[i] <= a[i].max(b[i]) + eps)
}

fn overlap(a: Point2, b: Point2, c: Point2, d: Point2, eps: f64) -> bool {
    let [o1, o2, o3, o4] = [
        orient(a, b, c),
        orient(a, b, d),
        orient(c, d, a),
        orient(c, d, b),
    ];
    let opposite = |x, y| (x > eps && y < -eps) || (y > eps && x < -eps);
    opposite(o1, o2) && opposite(o3, o4)
        || o1.abs() <= eps && within(c, a, b, eps)
        || o2.abs() <= eps && within(d, a, b, eps)
        || o3.abs() <= eps && within(a, c, d, eps)
        || o4.abs() <= eps && within(b, c, d, eps)
}

fn intersect(a: Triangle, b: Triangle, eps: f64) -> bool {
    for axis in 0..3 {
        let bounds = |t: Triangle| {
            (
                t[0][axis].min(t[1][axis]).min(t[2][axis]),
                t[0][axis].max(t[1][axis]).max(t[2][axis]),
            )
        };
        let (amin, amax) = bounds(a);
        let (bmin, bmax) = bounds(b);
        if amax < bmin - eps || bmax < amin - eps {
            return false;
        }
    }
    for i in 0..3 {
        let j = (i + 1) % 3;
        if edge_hits(a[i], a[j], &b, eps) || edge_hits(b[i], b[j], &a, eps) {
            return true;
        }
    }
    let normal = |t: Triangle| cross(sub(t[1], t[0]), sub(t[2], t[0]));
    let n = normal(a);
    if norm(cross(n, normal(b))) > eps || dot(n, sub(b[0], a[0])).abs() > eps * norm(n).max(eps) {
        return false;
    }
    let abs = n.map(f64::abs);
    let axes = if abs[0] >= abs[1] && abs[0] >= abs[2] {
        [1, 2]
    } else if abs[1] >= abs[2] {
        [0, 2]
    } else {
        [0, 1]
    };
    let project = |p: Vec3| [p[axes[0]], p[axes[1]]];
    let (a, b) = (a.map(project), b.map(project));
    (0..3).any(|i| {
        inside(a[i], &b, eps)
            || inside(b[i], &a, eps)
            || (0..3).any(|j| overlap(a[i], a[(i + 1) % 3], b[j], b[(j + 1) % 3], eps))
    })
}

#[no_mangle]
pub extern "C" fn triangles_intersect(epsilon: f64) -> bool {
    with_buffer(|buf| {
        let triangle = |offset: usize| {
            std::array::from_fn(|i| {
                let start = offset + i * 3;
                [buf[start], buf[start + 1], buf[start + 2]]
            })
        };
        intersect(triangle(0), triangle(9), epsilon)
    })
}
