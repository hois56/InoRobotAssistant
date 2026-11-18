use crate::{with_buffer, BUFFER};
use std::cell::RefCell;

const EPSILON: f64 = 1e-9;

#[derive(Clone)]
struct Bound {
    min: f64,
    max: f64,
    weight: f64,
}
impl Bound {
    fn from_slice(b: &[f64]) -> Self {
        Self {
            min: b[0],
            max: b[1],
            weight: b[2],
        }
    }
}
fn distance(a: &[f64], b: &[f64], bounds: &[Bound]) -> f64 {
    a.iter()
        .zip(b)
        .zip(bounds)
        .map(|((&x, &y), bound)| {
            let range = bound.max - bound.min;
            let scale = if range.is_finite() && range > EPSILON {
                range
            } else {
                1.
            };
            ((x - y) / scale).powi(2) * bound.weight
        })
        .sum::<f64>()
        .sqrt()
}

struct Node {
    state: Vec<f64>,
    parent: Option<usize>,
}
impl Node {
    fn root(state: &[f64]) -> Self {
        Self {
            state: state.to_vec(),
            parent: None,
        }
    }
}
struct Proposal {
    tree: usize,
    parent: usize,
    state: Vec<f64>,
    reached: bool,
}
enum Phase {
    Grow,
    Connect(usize),
    Done(Vec<Vec<f64>>),
}
struct Search {
    trees: [Vec<Node>; 2],
    active: usize,
    bounds: Vec<Bound>,
    step: f64,
    phase: Phase,
    pending: Option<Proposal>,
}
fn trace(tree: &[Node], mut index: usize) -> Vec<Vec<f64>> {
    let mut path = Vec::new();
    loop {
        path.push(tree[index].state.clone());
        match tree[index].parent {
            Some(p) => index = p,
            None => break,
        }
    }
    path
}
impl Search {
    /// -1 requests a collision check; the other codes are returned by advance.
    fn propose(&mut self, sample: &[f64]) -> i32 {
        let active = self.active;
        let (side, target) = match self.phase {
            Phase::Grow => (active, sample),
            Phase::Connect(index) => (1 - active, self.trees[active][index].state.as_slice()),
            Phase::Done(_) => return 3,
        };
        let tree = &self.trees[side];
        let mut nearest = 0;
        let mut shortest = distance(&tree[0].state, target, &self.bounds);
        for (i, node) in tree.iter().enumerate().skip(1) {
            let d = distance(&node.state, target, &self.bounds);
            if d < shortest {
                nearest = i;
                shortest = d;
            }
        }
        if shortest <= EPSILON {
            return self.advance(Some(nearest), true);
        }
        let scaled = shortest.max(EPSILON) / self.step.max(EPSILON);
        let ratio = (1. / scaled).min(1.);
        let state: Vec<_> = if scaled <= EPSILON {
            target.to_vec()
        } else {
            tree[nearest]
                .state
                .iter()
                .zip(target)
                .zip(&self.bounds)
                .map(|((&a, &b), bound)| (a + (b - a) * ratio).max(bound.min).min(bound.max))
                .collect()
        };
        let reached = distance(&state, target, &self.bounds) <= EPSILON;
        self.pending = Some(Proposal {
            tree: side,
            parent: nearest,
            state,
            reached,
        });
        -1
    }
    /// 0 starts a new sample, 1 starts the other tree, 2 continues that
    /// connection and 3 returns the completed path, always from start to goal.
    fn advance(&mut self, node: Option<usize>, reached: bool) -> i32 {
        let Some(index) = node else {
            self.active = 1 - self.active;
            self.phase = Phase::Grow;
            return 0;
        };
        match self.phase {
            Phase::Grow => {
                self.phase = Phase::Connect(index);
                1
            }
            Phase::Connect(_) if !reached => 2,
            Phase::Connect(first) => {
                let mut path = trace(&self.trees[self.active], first);
                path.reverse();
                path.extend(
                    trace(&self.trees[1 - self.active], index)
                        .into_iter()
                        .skip(1),
                );
                if self.active != 0 {
                    path.reverse();
                }
                self.phase = Phase::Done(path);
                3
            }
            Phase::Done(_) => 3,
        }
    }
    fn accept(&mut self, safe: bool) -> i32 {
        let proposal = self.pending.take().unwrap();
        if !safe {
            return self.advance(None, false);
        }
        let tree = &mut self.trees[proposal.tree];
        let index = tree.len();
        tree.push(Node {
            state: proposal.state,
            parent: Some(proposal.parent),
        });
        self.advance(Some(index), proposal.reached)
    }
}

// A pending browser callback may start another plan before it resolves.
// Separate slots keep all tree and proposal state private to each search.
thread_local! { static SEARCHES: RefCell<Vec<Option<Search>>> = const {RefCell::new(Vec::new())}; }
fn with_search<T>(id: usize, access: impl FnOnce(&mut Search) -> T) -> T {
    SEARCHES.with_borrow_mut(|slots| access(slots[id].as_mut().unwrap()))
}
#[no_mangle]
pub extern "C" fn rrt_create(d: usize, step: f64) -> usize {
    let search = with_buffer(|b| Search {
        trees: [vec![Node::root(&b[..d])], vec![Node::root(&b[d..2 * d])]],
        bounds: b[2 * d..5 * d]
            .chunks_exact(3)
            .map(Bound::from_slice)
            .collect(),
        active: 0,
        step,
        phase: Phase::Grow,
        pending: None,
    });
    SEARCHES.with_borrow_mut(|slots| {
        if let Some(i) = slots.iter().position(Option::is_none) {
            slots[i] = Some(search);
            i
        } else {
            slots.push(Some(search));
            slots.len() - 1
        }
    })
}
#[no_mangle]
pub extern "C" fn rrt_destroy(id: usize) {
    SEARCHES.with_borrow_mut(|s| s[id] = None);
}
#[no_mangle]
pub extern "C" fn rrt_propose(id: usize, opposite_root: bool) -> i32 {
    with_search(id, |s| {
        with_buffer(|b| {
            let d = s.bounds.len();
            if opposite_root {
                b[..d].copy_from_slice(&s.trees[1 - s.active][0].state);
            }
            let status = s.propose(&b[..d]);
            if let Some(p) = &s.pending {
                b[..d].copy_from_slice(&s.trees[p.tree][p.parent].state);
                b[d..2 * d].copy_from_slice(&p.state);
            }
            status
        })
    })
}
#[no_mangle]
pub extern "C" fn rrt_accept(id: usize, safe: bool) -> i32 {
    with_search(id, |s| s.accept(safe))
}
#[no_mangle]
pub extern "C" fn rrt_path(id: usize) -> usize {
    with_search(id, |s| {
        let Phase::Done(path) = &s.phase else {
            return 0;
        };
        BUFFER.with_borrow_mut(|b| {
            b.clear();
            for state in path {
                b.extend_from_slice(state);
            }
        });
        path.len()
    })
}

/// Sparse adjacency is encoded as a degree followed by (index, cost) pairs
/// for each vertex. Walking vertices in index order preserves tie breaking.
#[no_mangle]
pub extern "C" fn waypoint_route(vertices: usize, goal: usize) -> usize {
    with_buffer(|b| {
        let mut offsets = Vec::with_capacity(vertices);
        let mut cursor = 0;
        for _ in 0..vertices {
            let end = cursor + 1 + 2 * b[cursor] as usize;
            offsets.push(cursor + 1..end);
            cursor = end;
        }
        let mut costs = vec![f64::INFINITY; vertices];
        let mut prev = vec![None; vertices];
        let mut visited = vec![false; vertices];
        costs[0] = 0.;
        loop {
            let mut next = None;
            let mut best = f64::INFINITY;
            for (i, &candidate) in costs.iter().enumerate() {
                if !visited[i] && candidate < best {
                    next = Some(i);
                    best = candidate;
                }
            }
            let Some(current) = next else {
                return 0;
            };
            if current == goal {
                break;
            }
            visited[current] = true;
            for edge in b[offsets[current].clone()].chunks_exact(2) {
                let neighbor = edge[0] as usize;
                let candidate = best + edge[1];
                if !visited[neighbor] && candidate < costs[neighbor] {
                    costs[neighbor] = candidate;
                    prev[neighbor] = Some(current);
                }
            }
        }
        let mut index = goal;
        let mut length = 0;
        loop {
            b[length] = index as f64;
            length += 1;
            if let Some(parent) = prev[index] {
                index = parent;
            } else {
                break;
            }
        }
        b[..length].reverse();
        length
    })
}
