//! Hierarchical graph layout — thin napi wrapper around
//! `amigo-graph-layout-core`.

use amigo_graph_layout_core as core;
use napi_derive::napi;

#[napi(object)]
#[derive(Clone)]
pub struct NodeSpec {
    pub id: String,
    pub width: f64,
    pub height: f64,
    pub rank: Option<u32>,
}

#[napi(object)]
#[derive(Clone)]
pub struct EdgeSpec {
    pub source: String,
    pub target: String,
    pub minlen: Option<u32>,
    pub weight: Option<f64>,
}

#[napi(object)]
#[derive(Clone)]
pub struct LayoutOptions {
    pub rankdir: Option<String>,
    pub nodesep: Option<f64>,
    pub ranksep: Option<f64>,
    pub marginx: Option<f64>,
    pub marginy: Option<f64>,
}

#[napi(object)]
pub struct LayoutSpec {
    pub nodes: Vec<NodeSpec>,
    pub edges: Vec<EdgeSpec>,
    pub options: Option<LayoutOptions>,
}

#[napi(object)]
pub struct NodePosition {
    pub id: String,
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

#[napi(object)]
pub struct Point {
    pub x: f64,
    pub y: f64,
}

#[napi(object)]
pub struct EdgeRouting {
    pub source: String,
    pub target: String,
    pub points: Vec<Point>,
}

#[napi(object)]
pub struct LayoutResult {
    pub nodes: Vec<NodePosition>,
    pub edges: Vec<EdgeRouting>,
    pub width: f64,
    pub height: f64,
}

fn to_core_spec(s: LayoutSpec) -> core::LayoutSpec {
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

fn from_core_result(r: core::LayoutResult) -> LayoutResult {
    LayoutResult {
        nodes: r
            .nodes
            .into_iter()
            .map(|n| NodePosition {
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
            .map(|e| EdgeRouting {
                source: e.source,
                target: e.target,
                points: e
                    .points
                    .into_iter()
                    .map(|p| Point { x: p.x, y: p.y })
                    .collect(),
            })
            .collect(),
        width: r.width,
        height: r.height,
    }
}

#[napi(js_name = "layout")]
pub fn layout(spec: LayoutSpec) -> LayoutResult {
    from_core_result(core::layout(to_core_spec(spec)))
}

#[napi(js_name = "layoutMany")]
pub fn layout_many(specs: Vec<LayoutSpec>) -> Vec<LayoutResult> {
    specs
        .into_iter()
        .map(|s| from_core_result(core::layout(to_core_spec(s))))
        .collect()
}
