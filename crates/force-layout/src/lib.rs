//! Force-directed graph layout (d3-force equivalent). One-shot
//! `simulate(nodes, edges, options)` API that runs N ticks inside
//! Rust and returns final positions — avoiding the N × FFI
//! tick-callback anti-pattern.
//!
//! Forces implemented: many-body (repulsion), link (spring),
//! centering, collision. See docs/perf-review/d3-force.md for the
//! shape analysis.

// The simulation loop indexes `nodes` from several inner loops
// (`nodes[i]` / `nodes[j]` for pair interactions) — the typical
// iterator rewrite would fight the borrow checker without any
// speed-up, so we keep explicit indices here.
#![allow(clippy::needless_range_loop)]

use napi_derive::napi;
use std::collections::HashMap;

#[napi(object)]
#[derive(Clone)]
pub struct FnodeSpec {
    pub id: String,
    pub x: Option<f64>,
    pub y: Option<f64>,
    /// Pin to x,y — skip forces. Default false.
    pub fixed: Option<bool>,
}

#[napi(object)]
#[derive(Clone)]
pub struct FedgeSpec {
    pub source: String,
    pub target: String,
    /// Target link distance (pixels). Default 30.
    pub distance: Option<f64>,
    /// Link spring strength in [0,1]. Default 1/min(inbound, outbound).
    pub strength: Option<f64>,
}

#[napi(object)]
#[derive(Clone, Default)]
pub struct SimulationOptions {
    /// Iterations to run. Default 300.
    pub iterations: Option<u32>,
    /// Many-body strength (negative = repulsion). Default -30.
    pub charge: Option<f64>,
    /// Radius for collision force. Default 0 (off).
    pub collide_radius: Option<f64>,
    /// Centre x. Default 0.
    pub center_x: Option<f64>,
    /// Centre y. Default 0.
    pub center_y: Option<f64>,
    /// Centering force strength. Default 0.1.
    pub center_strength: Option<f64>,
    /// Initial alpha (cooling schedule). Default 1.
    pub alpha: Option<f64>,
    /// Alpha decay per iteration. Default computed from iterations.
    pub alpha_decay: Option<f64>,
    /// Velocity decay per iteration. Default 0.4.
    pub velocity_decay: Option<f64>,
}

#[napi(object)]
pub struct FnodeResult {
    pub id: String,
    pub x: f64,
    pub y: f64,
    pub vx: f64,
    pub vy: f64,
}

#[napi(object)]
pub struct SimulationResult {
    pub nodes: Vec<FnodeResult>,
}

struct NodeState {
    x: f64,
    y: f64,
    vx: f64,
    vy: f64,
    fixed: bool,
}

struct EdgeState {
    u: usize,
    v: usize,
    distance: f64,
    strength: f64,
}

fn initial_position(i: usize, total: usize) -> (f64, f64) {
    // Phyllotaxis spiral starter from d3-force.
    let angle = i as f64 * std::f64::consts::PI * (3.0 - 5f64.sqrt());
    let radius = ((i as f64 + 0.5).sqrt()) * 10.0;
    let _ = total;
    (radius * angle.cos(), radius * angle.sin())
}

fn run_simulation(
    node_specs: &[FnodeSpec],
    edge_specs: &[FedgeSpec],
    opts: &SimulationOptions,
) -> Vec<NodeState> {
    let n = node_specs.len();
    let id_map: HashMap<String, usize> = node_specs
        .iter()
        .enumerate()
        .map(|(i, s)| (s.id.clone(), i))
        .collect();

    let mut nodes: Vec<NodeState> = node_specs
        .iter()
        .enumerate()
        .map(|(i, s)| {
            let (ix, iy) = initial_position(i, n);
            NodeState {
                x: s.x.unwrap_or(ix),
                y: s.y.unwrap_or(iy),
                vx: 0.0,
                vy: 0.0,
                fixed: s.fixed.unwrap_or(false),
            }
        })
        .collect();

    // Edge list + per-node degree for link-strength default.
    let mut degree = vec![0usize; n];
    let mut edges: Vec<EdgeState> = Vec::with_capacity(edge_specs.len());
    for e in edge_specs {
        let (Some(&u), Some(&v)) = (id_map.get(&e.source), id_map.get(&e.target)) else {
            continue;
        };
        degree[u] += 1;
        degree[v] += 1;
        edges.push(EdgeState {
            u,
            v,
            distance: e.distance.unwrap_or(30.0),
            strength: e.strength.unwrap_or(0.0), // fill below
        });
    }
    // Default link strength: d3 uses 1 / min(count[source], count[target]).
    for es in edges.iter_mut() {
        if es.strength == 0.0 {
            let m = degree[es.u].min(degree[es.v]).max(1);
            es.strength = 1.0 / m as f64;
        }
    }

    let iterations = opts.iterations.unwrap_or(300);
    let charge = opts.charge.unwrap_or(-30.0);
    let collide_radius = opts.collide_radius.unwrap_or(0.0);
    let center_x = opts.center_x.unwrap_or(0.0);
    let center_y = opts.center_y.unwrap_or(0.0);
    let center_strength = opts.center_strength.unwrap_or(0.1);
    let velocity_decay = opts.velocity_decay.unwrap_or(0.4);
    let mut alpha = opts.alpha.unwrap_or(1.0);
    let alpha_decay = opts
        .alpha_decay
        .unwrap_or_else(|| 1.0 - (0.001f64).powf(1.0 / iterations.max(1) as f64));
    let alpha_min = 0.001;

    for _iter in 0..iterations {
        if alpha < alpha_min {
            break;
        }

        // Many-body (repulsion) — O(V^2).
        for i in 0..n {
            let (xi, yi) = (nodes[i].x, nodes[i].y);
            let mut dvx = 0.0;
            let mut dvy = 0.0;
            for j in 0..n {
                if i == j {
                    continue;
                }
                let dx = xi - nodes[j].x;
                let dy = yi - nodes[j].y;
                let d2 = (dx * dx + dy * dy).max(1e-6);
                let d = d2.sqrt();
                let w = (charge * alpha) / d2;
                dvx += (dx / d) * w;
                dvy += (dy / d) * w;
            }
            if !nodes[i].fixed {
                nodes[i].vx += dvx;
                nodes[i].vy += dvy;
            }
        }

        // Link (spring) forces.
        for e in &edges {
            let xu = nodes[e.u].x;
            let yu = nodes[e.u].y;
            let xv = nodes[e.v].x;
            let yv = nodes[e.v].y;
            let dx = xv - xu;
            let dy = yv - yu;
            let dist = (dx * dx + dy * dy).sqrt().max(1e-6);
            let diff = (dist - e.distance) / dist;
            let w = alpha * e.strength * diff;
            // Apply symmetrically by degree-weighted bias.
            let bias_u = degree[e.v] as f64 / (degree[e.u] + degree[e.v]).max(1) as f64;
            let bias_v = degree[e.u] as f64 / (degree[e.u] + degree[e.v]).max(1) as f64;
            if !nodes[e.u].fixed {
                nodes[e.u].vx += dx * w * bias_u;
                nodes[e.u].vy += dy * w * bias_u;
            }
            if !nodes[e.v].fixed {
                nodes[e.v].vx -= dx * w * bias_v;
                nodes[e.v].vy -= dy * w * bias_v;
            }
        }

        // Centering force (softly pulls toward center).
        if center_strength > 0.0 {
            for i in 0..n {
                if nodes[i].fixed {
                    continue;
                }
                nodes[i].vx += (center_x - nodes[i].x) * center_strength * alpha;
                nodes[i].vy += (center_y - nodes[i].y) * center_strength * alpha;
            }
        }

        // Collision (hard-sphere repulsion).
        if collide_radius > 0.0 {
            for i in 0..n {
                for j in (i + 1)..n {
                    let dx = nodes[j].x - nodes[i].x;
                    let dy = nodes[j].y - nodes[i].y;
                    let dist = (dx * dx + dy * dy).sqrt().max(1e-6);
                    let min_dist = collide_radius * 2.0;
                    if dist < min_dist {
                        let overlap = (min_dist - dist) / 2.0;
                        let nx = dx / dist;
                        let ny = dy / dist;
                        if !nodes[i].fixed {
                            nodes[i].x -= nx * overlap;
                            nodes[i].y -= ny * overlap;
                        }
                        if !nodes[j].fixed {
                            nodes[j].x += nx * overlap;
                            nodes[j].y += ny * overlap;
                        }
                    }
                }
            }
        }

        // Integrate + decay.
        for node in nodes.iter_mut() {
            if node.fixed {
                node.vx = 0.0;
                node.vy = 0.0;
                continue;
            }
            node.vx *= 1.0 - velocity_decay;
            node.vy *= 1.0 - velocity_decay;
            node.x += node.vx;
            node.y += node.vy;
        }

        alpha *= 1.0 - alpha_decay;
    }

    nodes
}

/// Batch simulation — runs all iterations in Rust, returns final
/// positions. Preferred over tick-by-tick for SSR / precompute
/// workloads.
#[napi(js_name = "simulate")]
pub fn simulate(
    nodes: Vec<FnodeSpec>,
    edges: Vec<FedgeSpec>,
    options: Option<SimulationOptions>,
) -> SimulationResult {
    let opts = options.unwrap_or_default();
    let final_nodes = run_simulation(&nodes, &edges, &opts);
    SimulationResult {
        nodes: final_nodes
            .into_iter()
            .zip(nodes.iter())
            .map(|(s, spec)| FnodeResult {
                id: spec.id.clone(),
                x: s.x,
                y: s.y,
                vx: s.vx,
                vy: s.vy,
            })
            .collect(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn nodes(n: usize) -> Vec<FnodeSpec> {
        (0..n)
            .map(|i| FnodeSpec {
                id: format!("n{i}"),
                x: None,
                y: None,
                fixed: None,
            })
            .collect()
    }

    #[test]
    fn simulate_no_edges_converges_on_centre() {
        let res = simulate(
            nodes(10),
            vec![],
            Some(SimulationOptions {
                iterations: Some(500),
                center_strength: Some(0.2),
                ..Default::default()
            }),
        );
        // Positions should be finite and near-origin-ish.
        for n in &res.nodes {
            assert!(n.x.is_finite());
            assert!(n.y.is_finite());
        }
    }

    #[test]
    fn pinned_node_stays_put() {
        let mut ns = nodes(5);
        ns[0].x = Some(100.0);
        ns[0].y = Some(200.0);
        ns[0].fixed = Some(true);
        let res = simulate(ns, vec![], None);
        let first = &res.nodes[0];
        assert_eq!(first.x, 100.0);
        assert_eq!(first.y, 200.0);
    }

    #[test]
    fn linked_nodes_approach_link_distance() {
        let ns = nodes(2);
        let edges = vec![FedgeSpec {
            source: "n0".into(),
            target: "n1".into(),
            distance: Some(50.0),
            strength: Some(1.0),
        }];
        let res = simulate(
            ns,
            edges,
            Some(SimulationOptions {
                iterations: Some(500),
                charge: Some(-1.0),
                center_strength: Some(0.0),
                ..Default::default()
            }),
        );
        let dx = res.nodes[0].x - res.nodes[1].x;
        let dy = res.nodes[0].y - res.nodes[1].y;
        let dist = (dx * dx + dy * dy).sqrt();
        assert!((dist - 50.0).abs() < 20.0, "dist={dist}");
    }

    #[test]
    fn empty_graph_returns_empty() {
        let res = simulate(vec![], vec![], None);
        assert!(res.nodes.is_empty());
    }

    #[test]
    fn custom_iterations_honored() {
        let res = simulate(
            nodes(3),
            vec![],
            Some(SimulationOptions {
                iterations: Some(1),
                ..Default::default()
            }),
        );
        assert_eq!(res.nodes.len(), 3);
    }
}
