//! Force-directed graph layout — thin napi wrapper around
//! `amigo-force-layout-core`.

use amigo_force_layout_core as core;
use napi_derive::napi;

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

fn to_core_node(s: &FnodeSpec) -> core::FnodeSpec {
    core::FnodeSpec {
        id: s.id.clone(),
        x: s.x,
        y: s.y,
        fixed: s.fixed,
    }
}
fn to_core_edge(e: &FedgeSpec) -> core::FedgeSpec {
    core::FedgeSpec {
        source: e.source.clone(),
        target: e.target.clone(),
        distance: e.distance,
        strength: e.strength,
    }
}
fn to_core_opts(o: &SimulationOptions) -> core::SimulationOptions {
    core::SimulationOptions {
        iterations: o.iterations,
        charge: o.charge,
        collide_radius: o.collide_radius,
        center_x: o.center_x,
        center_y: o.center_y,
        center_strength: o.center_strength,
        alpha: o.alpha,
        alpha_decay: o.alpha_decay,
        velocity_decay: o.velocity_decay,
    }
}

#[napi(js_name = "simulate")]
pub fn simulate(
    nodes: Vec<FnodeSpec>,
    edges: Vec<FedgeSpec>,
    options: Option<SimulationOptions>,
) -> SimulationResult {
    let opts = options.unwrap_or_default();
    let core_nodes: Vec<core::FnodeSpec> = nodes.iter().map(to_core_node).collect();
    let core_edges: Vec<core::FedgeSpec> = edges.iter().map(to_core_edge).collect();
    let final_nodes = core::run_simulation(&core_nodes, &core_edges, &to_core_opts(&opts));
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
