use amigo_graph_layout_core as core;
use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;

#[derive(Deserialize)]
struct NodeSpecJs {
    id: String,
    width: f64,
    height: f64,
    rank: Option<u32>,
}

#[derive(Deserialize)]
struct EdgeSpecJs {
    source: String,
    target: String,
    minlen: Option<u32>,
    weight: Option<f64>,
}

#[derive(Default, Deserialize)]
struct LayoutOptionsJs {
    rankdir: Option<String>,
    nodesep: Option<f64>,
    ranksep: Option<f64>,
    marginx: Option<f64>,
    marginy: Option<f64>,
}

#[derive(Deserialize)]
struct LayoutSpecJs {
    nodes: Vec<NodeSpecJs>,
    edges: Vec<EdgeSpecJs>,
    options: Option<LayoutOptionsJs>,
}

#[derive(Serialize)]
struct NodePositionJs {
    id: String,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
}

#[derive(Serialize)]
struct PointJs {
    x: f64,
    y: f64,
}

#[derive(Serialize)]
struct EdgeRoutingJs {
    source: String,
    target: String,
    points: Vec<PointJs>,
}

#[derive(Serialize)]
struct LayoutResultJs {
    nodes: Vec<NodePositionJs>,
    edges: Vec<EdgeRoutingJs>,
    width: f64,
    height: f64,
}

fn to_core(s: LayoutSpecJs) -> core::LayoutSpec {
    core::LayoutSpec {
        nodes: s
            .nodes
            .into_iter()
            .map(|n| core::NodeSpec {
                id: n.id,
                width: n.width,
                height: n.height,
                rank: n.rank,
            })
            .collect(),
        edges: s
            .edges
            .into_iter()
            .map(|e| core::EdgeSpec {
                source: e.source,
                target: e.target,
                minlen: e.minlen,
                weight: e.weight,
            })
            .collect(),
        options: s.options.map(|o| core::LayoutOptions {
            rankdir: o.rankdir,
            nodesep: o.nodesep,
            ranksep: o.ranksep,
            marginx: o.marginx,
            marginy: o.marginy,
        }),
    }
}

fn from_core(r: core::LayoutResult) -> LayoutResultJs {
    LayoutResultJs {
        nodes: r
            .nodes
            .into_iter()
            .map(|n| NodePositionJs {
                id: n.id,
                x: n.x,
                y: n.y,
                width: n.width,
                height: n.height,
            })
            .collect(),
        edges: r
            .edges
            .into_iter()
            .map(|e| EdgeRoutingJs {
                source: e.source,
                target: e.target,
                points: e
                    .points
                    .into_iter()
                    .map(|p| PointJs { x: p.x, y: p.y })
                    .collect(),
            })
            .collect(),
        width: r.width,
        height: r.height,
    }
}

#[wasm_bindgen(js_name = "layout")]
pub fn layout(spec: JsValue) -> Result<JsValue, JsError> {
    let s: LayoutSpecJs =
        serde_wasm_bindgen::from_value(spec).map_err(|e| JsError::new(&e.to_string()))?;
    let result = core::layout(to_core(s));
    serde_wasm_bindgen::to_value(&from_core(result)).map_err(|e| JsError::new(&e.to_string()))
}

#[wasm_bindgen(js_name = "layoutMany")]
pub fn layout_many(specs: JsValue) -> Result<JsValue, JsError> {
    let ss: Vec<LayoutSpecJs> =
        serde_wasm_bindgen::from_value(specs).map_err(|e| JsError::new(&e.to_string()))?;
    let results: Vec<LayoutResultJs> = ss
        .into_iter()
        .map(|s| from_core(core::layout(to_core(s))))
        .collect();
    serde_wasm_bindgen::to_value(&results).map_err(|e| JsError::new(&e.to_string()))
}
