//! Geometry BVHs and the exact narrow phase of 2_3DSimulation/collision-system.mjs.
//! Every comparison and arithmetic step mirrors the JavaScript reference and the
//! three.js r156 Box3/Vector3 maths it uses, so the first reported hit, its point
//! and the triangle-test count are identical on both paths.
use std::cell::RefCell;
use std::collections::HashMap;

use crate::collision::intersect;
use crate::outline::{js_max, js_min, js_round, text_key};
use crate::with_buffer;

type Vec3 = [f64; 3];
type Tri = [Vec3; 3];
type Bounds = [f64; 6]; // min xyz, max xyz
type Matrix = [f64; 16]; // three.js column-major elements

const EMPTY: Bounds = [f64::INFINITY, f64::INFINITY, f64::INFINITY, f64::NEG_INFINITY, f64::NEG_INFINITY, f64::NEG_INFINITY];

struct Node {
    bounds: Bounds,
    left: u32,
    right: u32,
    start: u32,
    count: u32,
    leaf: bool,
}

struct Bvh {
    positions: Vec<f64>,
    indices: Option<Vec<u32>>,
    nodes: Vec<Node>,
    triangles: Vec<u32>, // leaf triangle order
    closed: Option<bool>,
}

// World-space node bounds for one traversal side, recomputed per call.
#[derive(Default)]
struct Scratch {
    generation: u32,
    stamps: Vec<u32>,
    bounds: Vec<Bounds>,
}

thread_local! {
    static BVHS: RefCell<Vec<Option<Bvh>>> = const { RefCell::new(Vec::new()) };
    static INDICES: RefCell<Vec<u32>> = const { RefCell::new(Vec::new()) };
    static SCRATCH: RefCell<[Scratch; 2]> = RefCell::new([Scratch::default(), Scratch::default()]);
}

impl Bvh {
    fn vertex_index(&self, triangle: usize, corner: usize) -> usize {
        let index = triangle * 3 + corner;
        self.indices.as_ref().map_or(index, |indices| indices[index] as usize)
    }
    fn local_vertex(&self, vertex: usize) -> Vec3 {
        [self.positions[3 * vertex], self.positions[3 * vertex + 1], self.positions[3 * vertex + 2]]
    }
    fn local_triangle(&self, triangle: usize) -> Tri {
        [0, 1, 2].map(|corner| self.local_vertex(self.vertex_index(triangle, corner)))
    }
    // GeometryBVH.readTriangleWorld: guarded perspective divide.
    fn world_triangle(&self, triangle: usize, m: &Matrix) -> Tri {
        self.local_triangle(triangle).map(|[x, y, z]| {
            let w = m[3] * x + m[7] * y + m[11] * z + m[15];
            let inverse = if w.abs() > f64::EPSILON { 1.0 / w } else { 1.0 };
            [
                (m[0] * x + m[4] * y + m[8] * z + m[12]) * inverse,
                (m[1] * x + m[5] * y + m[9] * z + m[13]) * inverse,
                (m[2] * x + m[6] * y + m[10] * z + m[14]) * inverse,
            ]
        })
    }
    fn leaf(&self, node: &Node) -> &[u32] {
        &self.triangles[node.start as usize..(node.start + node.count) as usize]
    }
}

impl Scratch {
    fn begin(&mut self, nodes: usize) {
        if self.stamps.len() < nodes {
            self.stamps.resize(nodes, 0);
            self.bounds.resize(nodes, EMPTY);
        }
        self.generation = self.generation.wrapping_add(1);
        if self.generation == 0 {
            self.stamps.iter_mut().for_each(|stamp| *stamp = 0);
            self.generation = 1;
        }
    }
    fn world(&mut self, bvh: &Bvh, node: usize, m: &Matrix) -> Bounds {
        if self.stamps[node] != self.generation {
            self.bounds[node] = apply_bounds(&bvh.nodes[node].bounds, m);
            self.stamps[node] = self.generation;
        }
        self.bounds[node]
    }
}

// Vector3.applyMatrix4
fn apply_point(m: &Matrix, [x, y, z]: Vec3) -> Vec3 {
    let w = 1.0 / (m[3] * x + m[7] * y + m[11] * z + m[15]);
    [
        (m[0] * x + m[4] * y + m[8] * z + m[12]) * w,
        (m[1] * x + m[5] * y + m[9] * z + m[13]) * w,
        (m[2] * x + m[6] * y + m[10] * z + m[14]) * w,
    ]
}

fn is_empty(b: &Bounds) -> bool {
    b[3] < b[0] || b[4] < b[1] || b[5] < b[2]
}

// Box3.applyMatrix4: the eight corners in three's binary order, then setFromPoints.
fn apply_bounds(b: &Bounds, m: &Matrix) -> Bounds {
    if is_empty(b) {
        return *b;
    }
    let mut out = EMPTY;
    for corner in 0..8 {
        let point = apply_point(m, [
            if corner & 4 == 0 { b[0] } else { b[3] },
            if corner & 2 == 0 { b[1] } else { b[4] },
            if corner & 1 == 0 { b[2] } else { b[5] },
        ]);
        for axis in 0..3 {
            out[axis] = js_min(out[axis], point[axis]);
            out[axis + 3] = js_max(out[axis + 3], point[axis]);
        }
    }
    out
}

// a.intersectsBox(b)
fn intersects(a: &Bounds, b: &Bounds) -> bool {
    !(b[3] < a[0] || b[0] > a[3] || b[4] < a[1] || b[1] > a[4] || b[5] < a[2] || b[2] > a[5])
}

fn surface_area(b: &Bounds) -> f64 {
    if is_empty(b) {
        return 0.0;
    }
    let (x, y, z) = (b[3] - b[0], b[4] - b[1], b[5] - b[2]);
    2.0 * (x * y + y * z + z * x)
}

fn contains(outer: &Bounds, inner: &Bounds, epsilon: f64) -> bool {
    outer[0] <= inner[0] + epsilon
        && outer[1] <= inner[1] + epsilon
        && outer[2] <= inner[2] + epsilon
        && outer[3] >= inner[3] - epsilon
        && outer[4] >= inner[4] - epsilon
        && outer[5] >= inner[5] - epsilon
}

fn dot(a: Vec3, b: Vec3) -> f64 {
    a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}

fn sub(a: Vec3, b: Vec3) -> Vec3 {
    [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
}

// GeometryBVH constructor and #build.
fn build(positions: Vec<f64>, indices: Option<Vec<u32>>, triangle_count: usize, leaf_size: usize) -> Option<Bvh> {
    let mut bvh = Bvh { positions, indices, nodes: Vec::new(), triangles: (0..triangle_count as u32).collect(), closed: None };
    let vertex_count = bvh.positions.len() / 3;
    if let Some(indices) = &bvh.indices {
        if indices.len() < triangle_count * 3 || indices[..triangle_count * 3].iter().any(|&index| index as usize >= vertex_count) {
            return None;
        }
    } else if triangle_count * 3 > vertex_count {
        return None;
    }
    let mut triangle_bounds = vec![0.0; triangle_count * 6];
    let mut centroids = vec![0.0; triangle_count * 3];
    for triangle in 0..triangle_count {
        let local = bvh.local_triangle(triangle);
        if local.iter().flatten().any(|value| !value.is_finite()) {
            return None;
        }
        for axis in 0..3 {
            triangle_bounds[triangle * 6 + axis] = js_min(js_min(local[0][axis], local[1][axis]), local[2][axis]);
            triangle_bounds[triangle * 6 + axis + 3] = js_max(js_max(local[0][axis], local[1][axis]), local[2][axis]);
            centroids[triangle * 3 + axis] = (local[0][axis] + local[1][axis] + local[2][axis]) / 3.0;
        }
    }
    if triangle_count > 0 {
        let mut order = std::mem::take(&mut bvh.triangles);
        build_node(&mut bvh.nodes, &mut order, 0, &triangle_bounds, &centroids, leaf_size.max(1));
        bvh.triangles = order;
    }
    Some(bvh)
}

fn build_node(nodes: &mut Vec<Node>, order: &mut [u32], start: usize, triangle_bounds: &[f64], centroids: &[f64], leaf_size: usize) -> u32 {
    let mut bounds = EMPTY;
    let mut centroid_bounds = EMPTY;
    for &triangle in order.iter() {
        let t = triangle as usize;
        for axis in 0..3 {
            bounds[axis] = js_min(bounds[axis], triangle_bounds[t * 6 + axis]);
            bounds[axis + 3] = js_max(bounds[axis + 3], triangle_bounds[t * 6 + axis + 3]);
            centroid_bounds[axis] = js_min(centroid_bounds[axis], centroids[t * 3 + axis]);
            centroid_bounds[axis + 3] = js_max(centroid_bounds[axis + 3], centroids[t * 3 + axis]);
        }
    }
    let id = nodes.len() as u32;
    nodes.push(Node { bounds, left: 0, right: 0, start: start as u32, count: order.len() as u32, leaf: true });
    if order.len() <= leaf_size {
        return id;
    }
    let size = [centroid_bounds[3] - centroid_bounds[0], centroid_bounds[4] - centroid_bounds[1], centroid_bounds[5] - centroid_bounds[2]];
    let axis = if size[1] > size[0] && size[1] >= size[2] {
        1
    } else if size[2] > size[0] && size[2] > size[1] {
        2
    } else {
        0
    };
    // Array.prototype.sort is stable, like slice::sort_by.
    order.sort_by(|&a, &b| {
        let difference = centroids[a as usize * 3 + axis] - centroids[b as usize * 3 + axis];
        difference.partial_cmp(&0.0).unwrap_or(std::cmp::Ordering::Equal)
    });
    let middle = order.len() / 2;
    let (left_part, right_part) = order.split_at_mut(middle);
    let left = build_node(nodes, left_part, start, triangle_bounds, centroids, leaf_size);
    let right = build_node(nodes, right_part, start + middle, triangle_bounds, centroids, leaf_size);
    let node = &mut nodes[id as usize];
    node.leaf = false;
    node.left = left;
    node.right = right;
    id
}

// geometryHasClosedSurface: quantized vertex keys, two faces on every edge.
fn closed_surface(bvh: &Bvh) -> bool {
    let triangle_count = bvh.triangles.len();
    let key = |vertex: usize| bvh.local_vertex(vertex).map(|value| text_key(js_round(value * 1e6)));
    let mut edges: HashMap<([u64; 3], [u64; 3]), u8> = HashMap::new();
    for triangle in 0..triangle_count {
        let keys = [0, 1, 2].map(|corner| key(bvh.vertex_index(triangle, corner)));
        for (first, second) in [(0, 1), (1, 2), (2, 0)] {
            let (a, b) = (keys[first], keys[second]);
            if a == b {
                return false;
            }
            let count = edges.entry(if a < b { (a, b) } else { (b, a) }).or_insert(0);
            *count += 1;
            if *count > 2 {
                return false;
            }
        }
    }
    !edges.is_empty() && edges.values().all(|&count| count == 2)
}

fn closed(bvhs: &mut [Option<Bvh>], handle: usize) -> bool {
    let bvh = bvhs[handle].as_mut().expect("collision BVH handle");
    if bvh.closed.is_none() {
        bvh.closed = Some(closed_surface(bvh));
    }
    bvh.closed.unwrap_or(false)
}

fn ray_direction() -> Vec3 {
    let raw: Vec3 = [1.0, 0.3713906763541037, 0.127000127000127];
    let length = (raw[0] * raw[0] + raw[1] * raw[1] + raw[2] * raw[2]).sqrt();
    let scale = 1.0 / if length == 0.0 { 1.0 } else { length };
    raw.map(|value| value * scale)
}

fn ray_box(origin: Vec3, direction: Vec3, b: &Bounds, epsilon: f64) -> bool {
    let (mut near, mut far) = (f64::NEG_INFINITY, f64::INFINITY);
    for axis in 0..3 {
        let (o, d, min, max) = (origin[axis], direction[axis], b[axis], b[axis + 3]);
        if d.abs() <= epsilon {
            if o < min - epsilon || o > max + epsilon {
                return false;
            }
            continue;
        }
        let first = (min - o) / d;
        let second = (max - o) / d;
        near = js_max(near, js_min(first, second));
        far = js_min(far, js_max(first, second));
        if near > far + epsilon {
            return false;
        }
    }
    far >= js_max(near, 0.0) - epsilon
}

fn ray_triangle_distance(origin: Vec3, direction: Vec3, t: &Tri, epsilon: f64) -> Option<f64> {
    let edge1 = sub(t[1], t[0]);
    let edge2 = sub(t[2], t[0]);
    let p = [
        direction[1] * edge2[2] - direction[2] * edge2[1],
        direction[2] * edge2[0] - direction[0] * edge2[2],
        direction[0] * edge2[1] - direction[1] * edge2[0],
    ];
    let determinant = dot(edge1, p);
    if determinant.abs() <= epsilon {
        return None;
    }
    let inverse = 1.0 / determinant;
    let relative = sub(origin, t[0]);
    let u = dot(relative, p) * inverse;
    if u < -epsilon || u > 1.0 + epsilon {
        return None;
    }
    let q = [
        relative[1] * edge1[2] - relative[2] * edge1[1],
        relative[2] * edge1[0] - relative[0] * edge1[2],
        relative[0] * edge1[1] - relative[1] * edge1[0],
    ];
    let v = dot(direction, q) * inverse;
    if v < -epsilon || u + v > 1.0 + epsilon {
        return None;
    }
    let distance = dot(edge2, q) * inverse;
    (distance >= epsilon).then_some(distance)
}

// pointInsideMesh: ray parity with merged duplicate hits.
fn point_inside(bvh: &Bvh, m: &Matrix, point: Vec3, epsilon: f64, scratch: &mut Scratch) -> bool {
    let direction = ray_direction();
    scratch.begin(bvh.nodes.len());
    if !ray_box(point, direction, &scratch.world(bvh, 0, m), epsilon) {
        return false;
    }
    let mut stack = vec![0usize];
    let mut hits: Vec<f64> = Vec::new();
    while let Some(id) = stack.pop() {
        if !ray_box(point, direction, &scratch.world(bvh, id, m), epsilon) {
            continue;
        }
        let node = &bvh.nodes[id];
        if node.leaf {
            for &triangle in bvh.leaf(node) {
                if let Some(distance) = ray_triangle_distance(point, direction, &bvh.world_triangle(triangle as usize, m), epsilon) {
                    hits.push(distance);
                }
            }
        } else {
            stack.push(node.left as usize);
            stack.push(node.right as usize);
        }
    }
    hits.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
    let mut unique = 0;
    let mut previous = f64::NEG_INFINITY;
    for distance in hits {
        if distance - previous > epsilon * 10.0 {
            unique += 1;
            previous = distance;
        }
    }
    unique % 2 == 1
}

fn point_triangle_distance_squared(p: Vec3, t: &Tri) -> f64 {
    let a = t[0];
    let ab = sub(t[1], a);
    let ac = sub(t[2], a);
    let ap = sub(p, a);
    let d_ab_ap = dot(ab, ap);
    let d_ac_ap = dot(ac, ap);
    if d_ab_ap <= 0.0 && d_ac_ap <= 0.0 {
        return ap[0] * ap[0] + ap[1] * ap[1] + ap[2] * ap[2];
    }
    let bp = sub(p, t[1]);
    let d_ab_bp = dot(ab, bp);
    let d_ac_bp = dot(ac, bp);
    if d_ab_bp >= 0.0 && d_ac_bp <= d_ab_bp {
        return bp[0] * bp[0] + bp[1] * bp[1] + bp[2] * bp[2];
    }
    let cp = sub(p, t[2]);
    let d_ab_cp = dot(ab, cp);
    let d_ac_cp = dot(ac, cp);
    if d_ac_cp >= 0.0 && d_ab_cp <= d_ac_cp {
        return cp[0] * cp[0] + cp[1] * cp[1] + cp[2] * cp[2];
    }
    let squared = |closest: Vec3| {
        let (x, y, z) = (p[0] - closest[0], p[1] - closest[1], p[2] - closest[2]);
        x * x + y * y + z * z
    };
    let vc = d_ab_ap * d_ac_bp - d_ab_bp * d_ac_ap;
    if vc <= 0.0 && d_ab_ap >= 0.0 && d_ab_bp <= 0.0 {
        let value = d_ab_ap / js_max(d_ab_ap - d_ab_bp, f64::EPSILON);
        return squared([a[0] + value * ab[0], a[1] + value * ab[1], a[2] + value * ab[2]]);
    }
    let vb = d_ab_cp * d_ac_ap - d_ab_ap * d_ac_cp;
    if vb <= 0.0 && d_ac_ap >= 0.0 && d_ac_cp <= 0.0 {
        let value = d_ac_ap / js_max(d_ac_ap - d_ac_cp, f64::EPSILON);
        return squared([a[0] + value * ac[0], a[1] + value * ac[1], a[2] + value * ac[2]]);
    }
    let va = d_ab_bp * d_ac_cp - d_ab_cp * d_ac_bp;
    if va <= 0.0 && d_ac_bp - d_ab_bp >= 0.0 && d_ab_cp - d_ac_cp >= 0.0 {
        let edge = sub(t[2], t[1]);
        let value = (d_ac_bp - d_ab_bp) / js_max((d_ac_bp - d_ab_bp) + (d_ab_cp - d_ac_cp), f64::EPSILON);
        return squared([t[1][0] + value * edge[0], t[1][1] + value * edge[1], t[1][2] + value * edge[2]]);
    }
    let denominator = js_max(va + vb + vc, f64::EPSILON);
    let (barycentric_b, barycentric_c) = (vb / denominator, vc / denominator);
    squared([
        a[0] + ab[0] * barycentric_b + ac[0] * barycentric_c,
        a[1] + ab[1] * barycentric_b + ac[1] * barycentric_c,
        a[2] + ab[2] * barycentric_b + ac[2] * barycentric_c,
    ])
}

// Box3.distanceToPoint
fn distance_to_point(b: &Bounds, p: Vec3) -> f64 {
    let clamped: Vec3 = std::array::from_fn(|axis| js_max(b[axis], js_min(b[axis + 3], p[axis])));
    let (x, y, z) = (clamped[0] - p[0], clamped[1] - p[1], clamped[2] - p[2]);
    (x * x + y * y + z * z).sqrt()
}

// pointNearMeshSurface
fn point_near_surface(bvh: &Bvh, m: &Matrix, point: Vec3, tolerance: f64, scratch: &mut Scratch) -> bool {
    let tolerance_squared = tolerance * tolerance;
    scratch.begin(bvh.nodes.len());
    if distance_to_point(&scratch.world(bvh, 0, m), point) > tolerance {
        return false;
    }
    let mut stack = vec![0usize];
    while let Some(id) = stack.pop() {
        if distance_to_point(&scratch.world(bvh, id, m), point) > tolerance {
            continue;
        }
        let node = &bvh.nodes[id];
        if node.leaf {
            for &triangle in bvh.leaf(node) {
                if point_triangle_distance_squared(point, &bvh.world_triangle(triangle as usize, m)) <= tolerance_squared {
                    return true;
                }
            }
            continue;
        }
        stack.push(node.left as usize);
        stack.push(node.right as usize);
    }
    false
}

fn bounds_distance_squared(a: &Bounds, b: &Bounds) -> f64 {
    let mut sum = 0.0;
    for axis in 0..3 {
        let gap = js_max(js_max(0.0, a[axis] - b[axis + 3]), b[axis] - a[axis + 3]);
        sum += gap * gap;
    }
    sum
}

fn clamp01(value: f64) -> f64 {
    js_max(0.0, js_min(1.0, value))
}

// segmentDistanceSquared (THREE.Vector3 operations)
fn segment_distance_squared(p: Vec3, p_end: Vec3, q: Vec3, q_end: Vec3) -> f64 {
    let u = sub(p_end, p);
    let v = sub(q_end, q);
    let w = sub(p, q);
    let (aa, bb, cc, dd, ee) = (dot(u, u), dot(u, v), dot(v, v), dot(u, w), dot(v, w));
    let (mut s, mut t) = (0.0, 0.0);
    if aa <= f64::EPSILON {
        t = if cc > f64::EPSILON { clamp01(ee / cc) } else { 0.0 };
    } else if cc <= f64::EPSILON {
        s = clamp01(-dd / aa);
    } else {
        let denominator = aa * cc - bb * bb;
        s = if denominator > f64::EPSILON { clamp01((bb * ee - cc * dd) / denominator) } else { 0.0 };
        t = (bb * s + ee) / cc;
        if t < 0.0 {
            t = 0.0;
            s = clamp01(-dd / aa);
        } else if t > 1.0 {
            t = 1.0;
            s = clamp01((bb - dd) / aa);
        }
    }
    let mut result = w;
    for axis in 0..3 {
        result[axis] += u[axis] * s;
    }
    for axis in 0..3 {
        result[axis] += v[axis] * -t;
    }
    result[0] * result[0] + result[1] * result[1] + result[2] * result[2]
}

fn triangles_within_distance(a: &Tri, b: &Tri, distance_squared: f64) -> bool {
    for corner in 0..3 {
        if point_triangle_distance_squared(a[corner], b) <= distance_squared
            || point_triangle_distance_squared(b[corner], a) <= distance_squared
        {
            return true;
        }
    }
    for i in 0..3 {
        for j in 0..3 {
            if segment_distance_squared(a[i], a[(i + 1) % 3], b[j], b[(j + 1) % 3]) <= distance_squared {
                return true;
            }
        }
    }
    false
}

// createMountContactFilter's predicate; `robot_is_left` selects the robot triangle.
struct Mount {
    normal: Vec3,
    constant: f64,
    robot_is_left: bool,
}
impl Mount {
    fn permits(&self, a: &Tri, b: &Tri) -> bool {
        let (robot, other) = if self.robot_is_left { (a, b) } else { (b, a) };
        let tolerance = 0.01;
        let (mut min_robot, mut max_other) = (f64::INFINITY, f64::NEG_INFINITY);
        for corner in 0..3 {
            let side = |p: Vec3| self.normal[0] * p[0] + self.normal[1] * p[1] + self.normal[2] * p[2] + self.constant;
            min_robot = js_min(min_robot, side(robot[corner]));
            max_other = js_max(max_other, side(other[corner]));
        }
        min_robot >= -tolerance && min_robot <= tolerance && max_other <= tolerance && max_other >= -tolerance
    }
}

enum Hit {
    None,
    Surface(u32, u32, Vec3),
    Containment(Vec3),
}

struct Side<'a> {
    bvh: &'a Bvh,
    matrix: Matrix,
    root: Bounds,
}

// meshPairIntersects up to the containment checks.
fn surface_hit(a: &Side, b: &Side, epsilon: f64, mount: Option<&Mount>, tests: &mut u64, scratch: &mut [Scratch; 2]) -> Hit {
    let [scratch_a, scratch_b] = scratch;
    scratch_a.begin(a.bvh.nodes.len());
    scratch_b.begin(b.bvh.nodes.len());
    let mut stack: Vec<(u32, u32)> = vec![(0, 0)];
    while let Some((id_a, id_b)) = stack.pop() {
        let bounds_a = scratch_a.world(a.bvh, id_a as usize, &a.matrix);
        let bounds_b = scratch_b.world(b.bvh, id_b as usize, &b.matrix);
        if !intersects(&bounds_a, &bounds_b) {
            continue;
        }
        let (node_a, node_b) = (&a.bvh.nodes[id_a as usize], &b.bvh.nodes[id_b as usize]);
        if node_a.leaf && node_b.leaf {
            for &triangle_a in a.bvh.leaf(node_a) {
                let world_a = a.bvh.world_triangle(triangle_a as usize, &a.matrix);
                for &triangle_b in b.bvh.leaf(node_b) {
                    *tests += 1;
                    let world_b = b.bvh.world_triangle(triangle_b as usize, &b.matrix);
                    if intersect(world_a, world_b, epsilon) {
                        if mount.is_some_and(|filter| filter.permits(&world_a, &world_b)) {
                            continue;
                        }
                        let point = std::array::from_fn(|axis| (world_a[0][axis] + world_a[1][axis] + world_a[2][axis]) / 3.0);
                        return Hit::Surface(triangle_a, triangle_b, point);
                    }
                }
            }
            continue;
        }
        if node_a.leaf || (!node_b.leaf && surface_area(&bounds_a) < surface_area(&bounds_b)) {
            stack.push((id_a, node_b.left));
            stack.push((id_a, node_b.right));
        } else {
            stack.push((node_a.left, id_b));
            stack.push((node_a.right, id_b));
        }
    }
    Hit::None
}

#[no_mangle]
pub extern "C" fn collision_indices(len: usize) -> *mut u32 {
    INDICES.with_borrow_mut(|indices| {
        indices.resize(len, 0);
        indices.as_mut_ptr()
    })
}

/// number_buffer = vertex positions; collision_indices = triangle indices when
/// `indexed` is set. Returns a handle, or -1 for geometry the JavaScript BVH
/// must handle (non-finite coordinates or indices outside the positions).
#[no_mangle]
pub extern "C" fn collision_bvh_build(position_len: usize, indexed: u32, triangle_count: usize, leaf_size: usize) -> i32 {
    let positions = with_buffer(|buffer| buffer[..position_len.min(buffer.len())].to_vec());
    let indices = (indexed != 0).then(|| INDICES.with_borrow_mut(std::mem::take));
    let Some(bvh) = build(positions, indices, triangle_count, leaf_size) else {
        return -1;
    };
    BVHS.with_borrow_mut(|bvhs| {
        let slot = bvhs.iter().position(Option::is_none).unwrap_or_else(|| {
            bvhs.push(None);
            bvhs.len() - 1
        });
        bvhs[slot] = Some(bvh);
        slot as i32
    })
}

#[no_mangle]
pub extern "C" fn collision_bvh_free(handle: usize) {
    BVHS.with_borrow_mut(|bvhs| {
        if let Some(slot) = bvhs.get_mut(handle) {
            *slot = None;
        }
    });
}

#[no_mangle]
pub extern "C" fn collision_bvh_closed(handle: usize) -> u32 {
    BVHS.with_borrow_mut(|bvhs| u32::from(closed(bvhs, handle)))
}

fn matrix_at(buffer: &[f64], start: usize) -> Matrix {
    buffer[start..start + 16].try_into().expect("matrix")
}
fn bounds_at(buffer: &[f64], start: usize) -> Bounds {
    buffer[start..start + 6].try_into().expect("bounds")
}

/// number_buffer in: matrix A, matrix B, world bounds A, world bounds B,
/// mount plane (normal xyz, constant). `mount`: 0 none, 1 robot is A, 2 robot is B.
/// Out (first seven values): kind (0 none, 1 surface, 2 containment),
/// triangle A, triangle B, point xyz, triangle tests. Returns the kind.
#[no_mangle]
pub extern "C" fn collision_pair(handle_a: usize, handle_b: usize, epsilon: f64, mount: u32) -> u32 {
    let input = with_buffer(|buffer| buffer[..48].to_vec());
    let filter = (mount != 0).then(|| Mount { normal: [input[44], input[45], input[46]], constant: input[47], robot_is_left: mount == 1 });
    let (root_a, root_b) = (bounds_at(&input, 32), bounds_at(&input, 38));
    let mut tests = 0u64;
    let hit = BVHS.with_borrow_mut(|bvhs| {
        let mut hit = Hit::None;
        if intersects(&root_a, &root_b) {
            let (Some(bvh_a), Some(bvh_b)) = (bvhs[handle_a].as_ref(), bvhs[handle_b].as_ref()) else {
                return Hit::None;
            };
            let a = Side { bvh: bvh_a, matrix: matrix_at(&input, 0), root: root_a };
            let b = Side { bvh: bvh_b, matrix: matrix_at(&input, 16), root: root_b };
            hit = SCRATCH.with_borrow_mut(|scratch| surface_hit(&a, &b, epsilon, filter.as_ref(), &mut tests, scratch));
            if !matches!(hit, Hit::None) {
                return hit;
            }
            let contain_a = contains(&b.root, &a.root, epsilon);
            let contain_b = contains(&a.root, &b.root, epsilon);
            let (point_a, point_b) = (
                apply_point(&a.matrix, bvh_a.local_vertex(bvh_a.vertex_index(0, 0))),
                apply_point(&b.matrix, bvh_b.local_vertex(bvh_b.vertex_index(0, 0))),
            );
            let (matrix_a, matrix_b) = (a.matrix, b.matrix);
            // Containment needs a closed surface; compute it lazily as JavaScript does.
            if contain_a && closed(bvhs, handle_b) {
                let bvh_b = bvhs[handle_b].as_ref().expect("collision BVH handle");
                if SCRATCH.with_borrow_mut(|scratch| point_inside(bvh_b, &matrix_b, point_a, epsilon, &mut scratch[1])) {
                    return Hit::Containment(point_a);
                }
            }
            if contain_b && closed(bvhs, handle_a) {
                let bvh_a = bvhs[handle_a].as_ref().expect("collision BVH handle");
                if SCRATCH.with_borrow_mut(|scratch| point_inside(bvh_a, &matrix_a, point_b, epsilon, &mut scratch[0])) {
                    return Hit::Containment(point_b);
                }
            }
        }
        hit
    });
    let (kind, triangle_a, triangle_b, point) = match hit {
        Hit::None => (0, 0, 0, [0.0; 3]),
        Hit::Surface(a, b, point) => (1, a, b, point),
        Hit::Containment(point) => (2, 0, 0, point),
    };
    with_buffer(|buffer| {
        buffer[..7].copy_from_slice(&[f64::from(kind), f64::from(triangle_a), f64::from(triangle_b), point[0], point[1], point[2], tests as f64]);
    });
    kind
}

/// number_buffer in: matrix, point. Returns 1 when the point is inside the
/// closed mesh and not within `tolerance` of its surface (isPointInside).
#[no_mangle]
pub extern "C" fn collision_point_inside(handle: usize, epsilon: f64, tolerance: f64) -> u32 {
    let input = with_buffer(|buffer| buffer[..19].to_vec());
    let (matrix, point) = (matrix_at(&input, 0), [input[16], input[17], input[18]]);
    BVHS.with_borrow(|bvhs| {
        let Some(bvh) = bvhs.get(handle).and_then(Option::as_ref) else {
            return 0;
        };
        SCRATCH.with_borrow_mut(|scratch| {
            let near = point_near_surface(bvh, &matrix, point, tolerance, &mut scratch[0]);
            u32::from(!near && point_inside(bvh, &matrix, point, epsilon, &mut scratch[0]))
        })
    })
}

/// number_buffer in: matrix A, matrix B. 1 when any two triangles are within
/// sqrt(limit_squared) of each other (isWithinDistance's BVH traversal).
#[no_mangle]
pub extern "C" fn collision_within_distance(handle_a: usize, handle_b: usize, limit_squared: f64) -> u32 {
    let input = with_buffer(|buffer| buffer[..32].to_vec());
    let (matrix_a, matrix_b) = (matrix_at(&input, 0), matrix_at(&input, 16));
    BVHS.with_borrow(|bvhs| {
        let (Some(a), Some(b)) = (bvhs.get(handle_a).and_then(Option::as_ref), bvhs.get(handle_b).and_then(Option::as_ref)) else {
            return 0;
        };
        SCRATCH.with_borrow_mut(|[scratch_a, scratch_b]| {
            scratch_a.begin(a.nodes.len());
            scratch_b.begin(b.nodes.len());
            let mut stack: Vec<(usize, usize)> = vec![(0, 0)];
            while let Some((id_a, id_b)) = stack.pop() {
                let bounds_a = scratch_a.world(a, id_a, &matrix_a);
                let bounds_b = scratch_b.world(b, id_b, &matrix_b);
                if bounds_distance_squared(&bounds_a, &bounds_b) > limit_squared {
                    continue;
                }
                let (node_a, node_b) = (&a.nodes[id_a], &b.nodes[id_b]);
                if node_a.leaf && node_b.leaf {
                    for &triangle_a in a.leaf(node_a) {
                        let world_a = a.world_triangle(triangle_a as usize, &matrix_a);
                        for &triangle_b in b.leaf(node_b) {
                            if triangles_within_distance(&world_a, &b.world_triangle(triangle_b as usize, &matrix_b), limit_squared) {
                                return 1;
                            }
                        }
                    }
                } else if node_a.leaf {
                    stack.push((id_a, node_b.left as usize));
                    stack.push((id_a, node_b.right as usize));
                } else {
                    stack.push((node_a.left as usize, id_b));
                    stack.push((node_a.right as usize, id_b));
                }
            }
            0
        })
    })
}
