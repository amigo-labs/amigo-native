//! Force-directed graph layout — pure-Rust core. Internal-only.
//! See `crates/force-layout/` for the napi/WASM surfaces.

#![allow(clippy::needless_range_loop)]

use std::collections::HashMap;

#[derive(Clone, Debug)]
pub struct FnodeSpec {
    pub id: String,
    pub x: Option<f64>,
    pub y: Option<f64>,
    pub fixed: Option<bool>,
}

#[derive(Clone, Debug)]
pub struct FedgeSpec {
    pub source: String,
    pub target: String,
    pub distance: Option<f64>,
    pub strength: Option<f64>,
}

#[derive(Clone, Debug, Default)]
pub struct SimulationOptions {
    pub iterations: Option<u32>,
    pub charge: Option<f64>,
    pub collide_radius: Option<f64>,
    pub center_x: Option<f64>,
    pub center_y: Option<f64>,
    pub center_strength: Option<f64>,
    pub alpha: Option<f64>,
    pub alpha_decay: Option<f64>,
    pub velocity_decay: Option<f64>,
}

#[derive(Debug, Clone)]
pub struct NodeState {
    pub x: f64,
    pub y: f64,
    pub vx: f64,
    pub vy: f64,
    pub fixed: bool,
}

struct EdgeState {
    u: usize,
    v: usize,
    distance: f64,
    strength: f64,
}

fn initial_position(i: usize, _total: usize) -> (f64, f64) {
    let angle = i as f64 * std::f64::consts::PI * (3.0 - 5f64.sqrt());
    let radius = ((i as f64 + 0.5).sqrt()) * 10.0;
    (radius * angle.cos(), radius * angle.sin())
}

pub fn run_simulation(
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
            strength: e.strength.unwrap_or(0.0),
        });
    }
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

        if center_strength > 0.0 {
            for i in 0..n {
                if nodes[i].fixed {
                    continue;
                }
                nodes[i].vx += (center_x - nodes[i].x) * center_strength * alpha;
                nodes[i].vy += (center_y - nodes[i].y) * center_strength * alpha;
            }
        }

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
