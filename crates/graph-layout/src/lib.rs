//! Hierarchical (Sugiyama-style) graph layout — layered DAG
//! positions. Single-FFI-crossing shape: a LayoutSpec goes in,
//! positions + edge points come out.
//!
//! Scope-cut per docs/perf-review/dagre.md: no graphlib-chain API
//! (setNode/setEdge would multiply FFI crossings). One call per
//! layout. See the `layout()` entry point.

use napi_derive::napi;
use std::collections::{HashMap, VecDeque};

#[napi(object)]
#[derive(Clone)]
pub struct NodeSpec {
    pub id: String,
    pub width: f64,
    pub height: f64,
    /// Optional: pin this node to a specific rank (0-indexed from the
    /// top for `TB` / `BT`, from the left for `LR` / `RL`).
    pub rank: Option<u32>,
}

#[napi(object)]
#[derive(Clone)]
pub struct EdgeSpec {
    pub source: String,
    pub target: String,
    /// Minimum rank distance between source and target. Default 1.
    pub minlen: Option<u32>,
    /// Edge weight (used by crossing-reduction heuristic). Default 1.
    pub weight: Option<f64>,
}

#[napi(object)]
#[derive(Clone)]
pub struct LayoutOptions {
    /// `"TB"` (top-bottom, default), `"BT"`, `"LR"`, or `"RL"`.
    pub rankdir: Option<String>,
    /// Horizontal separation between nodes within the same rank.
    pub nodesep: Option<f64>,
    /// Vertical separation between ranks. Default 50.
    pub ranksep: Option<f64>,
    /// Outer left/right margin. Default 0.
    pub marginx: Option<f64>,
    /// Outer top/bottom margin. Default 0.
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

struct Graph {
    n: usize,
    node_ids: Vec<String>,
    widths: Vec<f64>,
    heights: Vec<f64>,
    pinned_rank: Vec<Option<u32>>,
    adj: Vec<Vec<usize>>,
    radj: Vec<Vec<usize>>,
    minlen: HashMap<(usize, usize), u32>,
    edges: Vec<(usize, usize)>,
}

fn build_graph(spec: &LayoutSpec) -> Graph {
    let mut id_to_idx = HashMap::new();
    let mut node_ids = Vec::new();
    let mut widths = Vec::new();
    let mut heights = Vec::new();
    let mut pinned_rank = Vec::new();

    for node in &spec.nodes {
        let idx = node_ids.len();
        id_to_idx.insert(node.id.clone(), idx);
        node_ids.push(node.id.clone());
        widths.push(node.width);
        heights.push(node.height);
        pinned_rank.push(node.rank);
    }

    let n = node_ids.len();
    let mut adj = vec![Vec::new(); n];
    let mut radj = vec![Vec::new(); n];
    let mut minlen = HashMap::new();
    let mut edges = Vec::new();

    for edge in &spec.edges {
        if let (Some(&u), Some(&v)) = (id_to_idx.get(&edge.source), id_to_idx.get(&edge.target)) {
            adj[u].push(v);
            radj[v].push(u);
            minlen.insert((u, v), edge.minlen.unwrap_or(1));
            edges.push((u, v));
        }
    }

    Graph {
        n,
        node_ids,
        widths,
        heights,
        pinned_rank,
        adj,
        radj,
        minlen,
        edges,
    }
}

/// Rank assignment via longest-path: each node's rank is 1 + max
/// rank of its predecessors. Cycle-tolerant (cycle edges are ignored
/// for ranking via topological fallback).
fn assign_ranks(g: &Graph) -> Vec<u32> {
    let mut ranks = vec![0u32; g.n];

    // Topological ordering (Kahn's algorithm). Nodes participating in
    // cycles fall back to rank 0.
    let mut indeg: Vec<usize> = g.radj.iter().map(|l| l.len()).collect();
    let mut queue: VecDeque<usize> = (0..g.n).filter(|&v| indeg[v] == 0).collect();
    let mut visited = 0usize;
    while let Some(u) = queue.pop_front() {
        visited += 1;
        for &v in &g.adj[u] {
            let minlen = *g.minlen.get(&(u, v)).unwrap_or(&1);
            ranks[v] = ranks[v].max(ranks[u] + minlen);
            indeg[v] -= 1;
            if indeg[v] == 0 {
                queue.push_back(v);
            }
        }
    }
    // If the graph has cycles, any remaining node keeps rank 0.
    let _ = visited;

    // Apply pinning.
    for (i, p) in g.pinned_rank.iter().enumerate() {
        if let Some(r) = p {
            ranks[i] = *r;
        }
    }

    ranks
}

/// Group nodes by rank; each rank is a Vec<usize> of node indices.
fn bucket_by_rank(ranks: &[u32]) -> Vec<Vec<usize>> {
    let max_rank = ranks.iter().copied().max().unwrap_or(0);
    let mut buckets = vec![Vec::new(); (max_rank + 1) as usize];
    for (i, &r) in ranks.iter().enumerate() {
        buckets[r as usize].push(i);
    }
    buckets
}

/// Reduce edge crossings via barycentric heuristic with 4 sweeps.
fn reduce_crossings(g: &Graph, buckets: &mut [Vec<usize>]) {
    for _ in 0..4 {
        // Top-down sweep
        for rank in 1..buckets.len() {
            sort_by_barycenter(g, buckets, rank, true);
        }
        // Bottom-up sweep
        for rank in (0..buckets.len().saturating_sub(1)).rev() {
            sort_by_barycenter(g, buckets, rank, false);
        }
    }
}

fn sort_by_barycenter(g: &Graph, buckets: &mut [Vec<usize>], rank: usize, use_predecessors: bool) {
    // Position map: node -> index within its rank.
    let mut pos = vec![0usize; g.n];
    for (r_idx, bucket) in buckets.iter().enumerate() {
        for (i, &n) in bucket.iter().enumerate() {
            pos[n] = if r_idx == rank { 0 } else { i };
        }
    }

    let ref_rank = if use_predecessors {
        if rank == 0 {
            return;
        }
        rank - 1
    } else {
        if rank + 1 >= buckets.len() {
            return;
        }
        rank + 1
    };
    // Recompute pos for ref_rank (barycentre target).
    for (i, &n) in buckets[ref_rank].iter().enumerate() {
        pos[n] = i;
    }

    let mut current = buckets[rank].clone();
    current.sort_by(|&a, &b| {
        let bca = barycentre(g, a, use_predecessors, &pos);
        let bcb = barycentre(g, b, use_predecessors, &pos);
        bca.partial_cmp(&bcb).unwrap_or(std::cmp::Ordering::Equal)
    });
    buckets[rank] = current;
}

fn barycentre(g: &Graph, node: usize, use_predecessors: bool, pos: &[usize]) -> f64 {
    let neighbors = if use_predecessors {
        &g.radj[node]
    } else {
        &g.adj[node]
    };
    if neighbors.is_empty() {
        return f64::INFINITY;
    }
    let sum: usize = neighbors.iter().map(|&n| pos[n]).sum();
    sum as f64 / neighbors.len() as f64
}

fn assign_coordinates(
    g: &Graph,
    buckets: &[Vec<usize>],
    opts: &Resolved,
) -> (Vec<f64>, Vec<f64>, f64, f64) {
    let n = g.n;
    let mut x = vec![0.0; n];
    let mut y = vec![0.0; n];

    let mut cur_y = opts.marginy;
    let mut max_width = 0.0f64;
    for bucket in buckets.iter() {
        // Row height = max node height in this rank.
        let row_h = bucket.iter().map(|&i| g.heights[i]).fold(0.0f64, f64::max);
        let mut cur_x = opts.marginx;
        for &i in bucket.iter() {
            x[i] = cur_x + g.widths[i] / 2.0;
            y[i] = cur_y + row_h / 2.0;
            cur_x += g.widths[i] + opts.nodesep;
        }
        max_width = max_width.max(cur_x - opts.nodesep);
        cur_y += row_h + opts.ranksep;
    }
    let total_w = max_width + opts.marginx;
    let total_h = cur_y - opts.ranksep + opts.marginy;

    // Honour rankdir by rotating / flipping.
    match opts.rankdir.as_str() {
        "BT" => {
            for yi in &mut y {
                *yi = total_h - *yi;
            }
        }
        "LR" => {
            // swap x/y
            for i in 0..n {
                std::mem::swap(&mut x[i], &mut y[i]);
            }
            return (x, y, total_h, total_w);
        }
        "RL" => {
            for i in 0..n {
                std::mem::swap(&mut x[i], &mut y[i]);
            }
            for xi in &mut x {
                *xi = total_h - *xi;
            }
            return (x, y, total_h, total_w);
        }
        _ => {}
    }

    (x, y, total_w, total_h)
}

struct Resolved {
    rankdir: String,
    nodesep: f64,
    ranksep: f64,
    marginx: f64,
    marginy: f64,
}

impl Resolved {
    fn from(o: Option<LayoutOptions>) -> Self {
        let o = o.unwrap_or(LayoutOptions {
            rankdir: None,
            nodesep: None,
            ranksep: None,
            marginx: None,
            marginy: None,
        });
        Self {
            rankdir: o.rankdir.unwrap_or_else(|| "TB".to_string()),
            nodesep: o.nodesep.unwrap_or(50.0),
            ranksep: o.ranksep.unwrap_or(50.0),
            marginx: o.marginx.unwrap_or(0.0),
            marginy: o.marginy.unwrap_or(0.0),
        }
    }
}

/// Compute a hierarchical layout. Single call per graph.
#[napi(js_name = "layout")]
pub fn layout(spec: LayoutSpec) -> LayoutResult {
    let opts = Resolved::from(spec.options.clone());
    let g = build_graph(&spec);
    if g.n == 0 {
        return LayoutResult {
            nodes: vec![],
            edges: vec![],
            width: 0.0,
            height: 0.0,
        };
    }

    let ranks = assign_ranks(&g);
    let mut buckets = bucket_by_rank(&ranks);
    reduce_crossings(&g, &mut buckets);
    let (x, y, total_w, total_h) = assign_coordinates(&g, &buckets, &opts);

    let node_positions: Vec<NodePosition> = (0..g.n)
        .map(|i| NodePosition {
            id: g.node_ids[i].clone(),
            x: x[i],
            y: y[i],
            width: g.widths[i],
            height: g.heights[i],
        })
        .collect();

    // Emit straight-line edge routings.
    let edges: Vec<EdgeRouting> = g
        .edges
        .iter()
        .map(|&(u, v)| EdgeRouting {
            source: g.node_ids[u].clone(),
            target: g.node_ids[v].clone(),
            points: vec![Point { x: x[u], y: y[u] }, Point { x: x[v], y: y[v] }],
        })
        .collect();

    LayoutResult {
        nodes: node_positions,
        edges,
        width: total_w,
        height: total_h,
    }
}

/// Batch: one FFI crossing for N independent layouts.
#[napi(js_name = "layoutMany")]
pub fn layout_many(specs: Vec<LayoutSpec>) -> Vec<LayoutResult> {
    specs.into_iter().map(layout).collect()
}

// Expose id_to_idx for tests to avoid dead_code warnings.
#[cfg(test)]
fn _lookup_helper(g: &Graph, id: &str) -> Option<usize> {
    g.id_to_idx.get(id).copied()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn mk(nodes: &[(&str, f64, f64)], edges: &[(&str, &str)]) -> LayoutSpec {
        LayoutSpec {
            nodes: nodes
                .iter()
                .map(|(id, w, h)| NodeSpec {
                    id: id.to_string(),
                    width: *w,
                    height: *h,
                    rank: None,
                })
                .collect(),
            edges: edges
                .iter()
                .map(|(s, t)| EdgeSpec {
                    source: s.to_string(),
                    target: t.to_string(),
                    minlen: None,
                    weight: None,
                })
                .collect(),
            options: None,
        }
    }

    #[test]
    fn single_node() {
        let spec = mk(&[("a", 100.0, 40.0)], &[]);
        let r = layout(spec);
        assert_eq!(r.nodes.len(), 1);
        assert!(r.width >= 100.0);
        assert!(r.height >= 40.0);
    }

    #[test]
    fn simple_chain_ranks_are_increasing() {
        let spec = mk(
            &[("a", 50.0, 30.0), ("b", 50.0, 30.0), ("c", 50.0, 30.0)],
            &[("a", "b"), ("b", "c")],
        );
        let r = layout(spec);
        let ya = r.nodes.iter().find(|n| n.id == "a").unwrap().y;
        let yb = r.nodes.iter().find(|n| n.id == "b").unwrap().y;
        let yc = r.nodes.iter().find(|n| n.id == "c").unwrap().y;
        assert!(ya < yb);
        assert!(yb < yc);
    }

    #[test]
    fn fork_siblings_share_rank() {
        let spec = mk(
            &[("root", 50.0, 30.0), ("a", 50.0, 30.0), ("b", 50.0, 30.0)],
            &[("root", "a"), ("root", "b")],
        );
        let r = layout(spec);
        let ya = r.nodes.iter().find(|n| n.id == "a").unwrap().y;
        let yb = r.nodes.iter().find(|n| n.id == "b").unwrap().y;
        assert!((ya - yb).abs() < 1e-6);
    }

    #[test]
    fn lr_rankdir_swaps_axes() {
        let spec = LayoutSpec {
            nodes: vec![
                NodeSpec {
                    id: "a".into(),
                    width: 50.0,
                    height: 30.0,
                    rank: None,
                },
                NodeSpec {
                    id: "b".into(),
                    width: 50.0,
                    height: 30.0,
                    rank: None,
                },
            ],
            edges: vec![EdgeSpec {
                source: "a".into(),
                target: "b".into(),
                minlen: None,
                weight: None,
            }],
            options: Some(LayoutOptions {
                rankdir: Some("LR".into()),
                nodesep: None,
                ranksep: None,
                marginx: None,
                marginy: None,
            }),
        };
        let r = layout(spec);
        let a = r.nodes.iter().find(|n| n.id == "a").unwrap();
        let b = r.nodes.iter().find(|n| n.id == "b").unwrap();
        // With LR: b should be to the right of a (x_b > x_a), and y's
        // should be close.
        assert!(b.x > a.x);
        assert!((a.y - b.y).abs() < 1e-6);
    }

    #[test]
    fn edges_have_two_points() {
        let spec = mk(&[("a", 50.0, 30.0), ("b", 50.0, 30.0)], &[("a", "b")]);
        let r = layout(spec);
        assert_eq!(r.edges.len(), 1);
        assert_eq!(r.edges[0].points.len(), 2);
    }

    #[test]
    fn cycle_does_not_panic() {
        let spec = mk(
            &[("a", 50.0, 30.0), ("b", 50.0, 30.0)],
            &[("a", "b"), ("b", "a")],
        );
        let r = layout(spec);
        assert_eq!(r.nodes.len(), 2);
    }

    #[test]
    fn empty_graph() {
        let r = layout(mk(&[], &[]));
        assert_eq!(r.nodes.len(), 0);
        assert_eq!(r.width, 0.0);
        assert_eq!(r.height, 0.0);
    }

    #[test]
    fn many_batch() {
        let specs = vec![
            mk(&[("a", 10.0, 10.0)], &[]),
            mk(&[("x", 10.0, 10.0), ("y", 10.0, 10.0)], &[("x", "y")]),
        ];
        let out = layout_many(specs);
        assert_eq!(out.len(), 2);
        assert_eq!(out[0].nodes.len(), 1);
        assert_eq!(out[1].nodes.len(), 2);
    }

    #[test]
    fn pinned_rank_honored() {
        let spec = LayoutSpec {
            nodes: vec![
                NodeSpec {
                    id: "a".into(),
                    width: 10.0,
                    height: 10.0,
                    rank: None,
                },
                NodeSpec {
                    id: "b".into(),
                    width: 10.0,
                    height: 10.0,
                    rank: Some(5),
                },
            ],
            edges: vec![],
            options: None,
        };
        let r = layout(spec);
        // Node b pinned to rank 5 should have larger y than a.
        let a = r.nodes.iter().find(|n| n.id == "a").unwrap();
        let b = r.nodes.iter().find(|n| n.id == "b").unwrap();
        assert!(b.y > a.y);
    }
}
