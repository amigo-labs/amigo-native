//! Hierarchical (Sugiyama-style) graph layout — pure-Rust core.
//! Internal-only; see `crates/graph-layout/` for the napi/WASM bindings.

use std::collections::{HashMap, VecDeque};

#[derive(Clone, Debug)]
pub struct NodeSpec {
    pub id: String,
    pub width: f64,
    pub height: f64,
    pub rank: Option<u32>,
}

#[derive(Clone, Debug)]
pub struct EdgeSpec {
    pub source: String,
    pub target: String,
    pub minlen: Option<u32>,
    pub weight: Option<f64>,
}

#[derive(Clone, Debug, Default)]
pub struct LayoutOptions {
    pub rankdir: Option<String>,
    pub nodesep: Option<f64>,
    pub ranksep: Option<f64>,
    pub marginx: Option<f64>,
    pub marginy: Option<f64>,
}

#[derive(Clone, Debug)]
pub struct LayoutSpec {
    pub nodes: Vec<NodeSpec>,
    pub edges: Vec<EdgeSpec>,
    pub options: Option<LayoutOptions>,
}

#[derive(Debug, Clone)]
pub struct NodePosition {
    pub id: String,
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

#[derive(Debug, Clone)]
pub struct Point {
    pub x: f64,
    pub y: f64,
}

#[derive(Debug, Clone)]
pub struct EdgeRouting {
    pub source: String,
    pub target: String,
    pub points: Vec<Point>,
}

#[derive(Debug, Clone)]
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

fn assign_ranks(g: &Graph) -> Vec<u32> {
    let mut ranks = vec![0u32; g.n];
    let mut indeg: Vec<usize> = g.radj.iter().map(|l| l.len()).collect();
    let mut queue: VecDeque<usize> = (0..g.n).filter(|&v| indeg[v] == 0).collect();
    while let Some(u) = queue.pop_front() {
        for &v in &g.adj[u] {
            let minlen = *g.minlen.get(&(u, v)).unwrap_or(&1);
            ranks[v] = ranks[v].max(ranks[u] + minlen);
            indeg[v] -= 1;
            if indeg[v] == 0 {
                queue.push_back(v);
            }
        }
    }

    for (i, p) in g.pinned_rank.iter().enumerate() {
        if let Some(r) = p {
            ranks[i] = *r;
        }
    }

    ranks
}

fn bucket_by_rank(ranks: &[u32]) -> Vec<Vec<usize>> {
    let max_rank = ranks.iter().copied().max().unwrap_or(0);
    let mut buckets = vec![Vec::new(); (max_rank + 1) as usize];
    for (i, &r) in ranks.iter().enumerate() {
        buckets[r as usize].push(i);
    }
    buckets
}

fn reduce_crossings(g: &Graph, buckets: &mut [Vec<usize>]) {
    for _ in 0..4 {
        for rank in 1..buckets.len() {
            sort_by_barycenter(g, buckets, rank, true);
        }
        for rank in (0..buckets.len().saturating_sub(1)).rev() {
            sort_by_barycenter(g, buckets, rank, false);
        }
    }
}

fn sort_by_barycenter(g: &Graph, buckets: &mut [Vec<usize>], rank: usize, use_predecessors: bool) {
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

struct Resolved {
    rankdir: String,
    nodesep: f64,
    ranksep: f64,
    marginx: f64,
    marginy: f64,
}

impl Resolved {
    fn from(o: Option<LayoutOptions>) -> Self {
        let o = o.unwrap_or_default();
        Self {
            rankdir: o.rankdir.unwrap_or_else(|| "TB".to_string()),
            nodesep: o.nodesep.unwrap_or(50.0),
            ranksep: o.ranksep.unwrap_or(50.0),
            marginx: o.marginx.unwrap_or(0.0),
            marginy: o.marginy.unwrap_or(0.0),
        }
    }
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

    match opts.rankdir.as_str() {
        "BT" => {
            for yi in &mut y {
                *yi = total_h - *yi;
            }
        }
        "LR" => {
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

pub fn layout_many(specs: Vec<LayoutSpec>) -> Vec<LayoutResult> {
    specs.into_iter().map(layout).collect()
}
