use amigo_force_layout_core as core;
use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;

#[derive(Deserialize)]
struct FnodeSpecJs {
    id: String,
    x: Option<f64>,
    y: Option<f64>,
    fixed: Option<bool>,
}

#[derive(Deserialize)]
struct FedgeSpecJs {
    source: String,
    target: String,
    distance: Option<f64>,
    strength: Option<f64>,
}

#[derive(Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SimulationOptionsJs {
    iterations: Option<u32>,
    charge: Option<f64>,
    collide_radius: Option<f64>,
    center_x: Option<f64>,
    center_y: Option<f64>,
    center_strength: Option<f64>,
    alpha: Option<f64>,
    alpha_decay: Option<f64>,
    velocity_decay: Option<f64>,
}

#[derive(Serialize)]
struct FnodeResultJs {
    id: String,
    x: f64,
    y: f64,
    vx: f64,
    vy: f64,
}

#[derive(Serialize)]
struct SimulationResultJs {
    nodes: Vec<FnodeResultJs>,
}

#[wasm_bindgen]
pub fn simulate(nodes: JsValue, edges: JsValue, options: JsValue) -> Result<JsValue, JsError> {
    let n: Vec<FnodeSpecJs> =
        serde_wasm_bindgen::from_value(nodes).map_err(|e| JsError::new(&e.to_string()))?;
    let e: Vec<FedgeSpecJs> =
        serde_wasm_bindgen::from_value(edges).map_err(|e| JsError::new(&e.to_string()))?;
    let o: SimulationOptionsJs = if options.is_undefined() || options.is_null() {
        SimulationOptionsJs::default()
    } else {
        serde_wasm_bindgen::from_value(options).map_err(|e| JsError::new(&e.to_string()))?
    };

    let core_nodes: Vec<core::FnodeSpec> = n
        .iter()
        .map(|s| core::FnodeSpec {
            id: s.id.clone(),
            x: s.x,
            y: s.y,
            fixed: s.fixed,
        })
        .collect();
    let core_edges: Vec<core::FedgeSpec> = e
        .iter()
        .map(|e| core::FedgeSpec {
            source: e.source.clone(),
            target: e.target.clone(),
            distance: e.distance,
            strength: e.strength,
        })
        .collect();
    let opts = core::SimulationOptions {
        iterations: o.iterations,
        charge: o.charge,
        collide_radius: o.collide_radius,
        center_x: o.center_x,
        center_y: o.center_y,
        center_strength: o.center_strength,
        alpha: o.alpha,
        alpha_decay: o.alpha_decay,
        velocity_decay: o.velocity_decay,
    };

    let final_nodes = core::run_simulation(&core_nodes, &core_edges, &opts);
    let result = SimulationResultJs {
        nodes: final_nodes
            .into_iter()
            .zip(n.iter())
            .map(|(s, spec)| FnodeResultJs {
                id: spec.id.clone(),
                x: s.x,
                y: s.y,
                vx: s.vx,
                vy: s.vy,
            })
            .collect(),
    };
    serde_wasm_bindgen::to_value(&result).map_err(|e| JsError::new(&e.to_string()))
}
