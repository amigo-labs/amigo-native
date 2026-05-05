// amigo-native dashboard — renders from packages.json + data.json

const state = {
  pkgs: null,
  data: null,
  activeIdx: 0,
  activeName: null,
  sortMode: 'speedup', // 'speedup' | 'alpha' | 'size'
  sortedList: [],
  typingTimers: [],
};

// --- sort helpers ---
// parses strings like "3-7x faster", "1.4-2.5× faster", returns max value
function parseMaxSpeedup(s) {
  if (!s) return 0;
  let best = -Infinity;
  for (const part of s.split('/')) {
    const nums = part.match(/(\d+(?:\.\d+)?)/g);
    if (!nums) continue;
    const n = Math.max(...nums.map(Number));
    const dir = /slower/i.test(part) ? -1 : /faster/i.test(part) ? 1 : 0;
    if (dir === 0) continue;
    const v = dir * n;
    if (v > best) best = v;
  }
  return best === -Infinity ? 0 : best;
}

// returns how much smaller amigo is vs. the largest competitor for this pkg
// e.g. 4.8 MB competitor / 2.1 MB amigo = 2.28
function sizeAdvantage(pkgName, sizesData) {
  const sizes = sizesData?.[pkgName];
  if (!sizes) return 0;
  const amigoKey = '@amigo-labs/' + pkgName;
  const amigoSize = sizes[amigoKey]?.installSize;
  if (!amigoSize) return 0;
  let maxCompetitor = 0;
  for (const [name, info] of Object.entries(sizes)) {
    if (name === amigoKey) continue;
    if ((info.installSize || 0) > maxCompetitor) maxCompetitor = info.installSize;
  }
  return maxCompetitor > amigoSize ? maxCompetitor / amigoSize : 0;
}

function computeSortedList() {
  const list = [...state.pkgs.packages];
  const mode = state.sortMode;
  if (mode === 'alpha') {
    list.sort((a, b) => a.name.localeCompare(b.name));
  } else if (mode === 'speedup') {
    list.sort((a, b) => parseMaxSpeedup(b.speedup) - parseMaxSpeedup(a.speedup));
  } else if (mode === 'size') {
    const sizes = state.data?.sizes;
    list.sort((a, b) => sizeAdvantage(b.name, sizes) - sizeAdvantage(a.name, sizes));
  }
  state.sortedList = list;
}

// --- helpers ---
function $(sel) { return document.querySelector(sel); }
function clearTimers() {
  state.typingTimers.forEach(t => clearTimeout(t));
  state.typingTimers = [];
}
function reducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
function typeInto(el, text, speed = 22) {
  if (reducedMotion()) { el.textContent = text; return; }
  el.textContent = '';
  let i = 0;
  function step() {
    if (i <= text.length) {
      el.textContent = text.slice(0, i);
      i++;
      const t = setTimeout(step, speed);
      state.typingTimers.push(t);
    }
  }
  step();
}
function countUp(el, from, to, duration = 400, formatter = v => v) {
  if (reducedMotion()) { el.textContent = formatter(to); return; }
  const start = performance.now();
  function tick(now) {
    const p = Math.min((now - start) / duration, 1);
    const eased = 1 - Math.pow(1 - p, 3);
    const v = from + (to - from) * eased;
    el.textContent = formatter(v);
    if (p < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}
function formatOps(hz) {
  if (hz >= 1e6) return (hz / 1e6).toFixed(2) + 'M';
  if (hz >= 1e3) return (hz / 1e3).toFixed(1) + 'K';
  if (hz >= 1) return hz.toFixed(1);
  return hz.toFixed(2);
}
function formatBytes(bytes) {
  if (!bytes) return 'N/A';
  if (bytes < 1024) return Math.round(bytes) + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}
function suiteCrate(suite) {
  const m = suite.file?.match(/^crates\/([^/]+)\//);
  return m ? m[1] : null;
}

// --- boot ---
async function boot() {
  const [pkgsRes, dataRes] = await Promise.all([
    fetch('packages.json'),
    fetch('data.json').catch(() => null),
  ]);
  state.pkgs = await pkgsRes.json();
  state.data = dataRes && dataRes.ok ? await dataRes.json() : null;

  computeSortedList();

  renderBrand();
  renderMarquee();
  renderPicker();
  wireSortChips();
  cycleHeroTagline();
  wireKeyboard();
  wireWheel();

  // initial active from hash (name-based so it survives sort changes)
  const hash = (location.hash || '').replace('#', '');
  const hashIdx = state.sortedList.findIndex(p => p.name === hash);
  if (hash && hashIdx < 0) {
    console.warn(`[amigo-native] no package matches #${hash} — falling back to first.`);
  }
  state.activeIdx = hashIdx >= 0 ? hashIdx : 0;
  state.activeName = state.sortedList[state.activeIdx].name;

  // scroll picker to initial item after layout is ready
  requestAnimationFrame(() => {
    snapTo(state.activeIdx, false);
    renderSlab();
  });
}

// --- brand, marquee, footer ---
function renderBrand() {
  const b = state.pkgs.brand;
  $('#heroRepoLabel').textContent = b.repo;
  $('#heroRepo').href = b.repoUrl;
  $('#footerRepo').textContent = b.repo;
  $('#footerRepo').href = b.repoUrl;
  $('#footerLicense').textContent = b.license + ' License';
  const gen = state.data?.generatedAt;
  const node = state.data?.nodeVersion;
  const platform = state.data?.platform;
  $('#footerMeta').textContent = [gen && 'generated ' + gen, node, platform].filter(Boolean).join(' · ');
}

function renderMarquee() {
  const items = state.pkgs.marquee;
  const html = [...items, ...items, ...items]
    .map(i => `<div class="marquee-item">${i.k}<span>${i.v}</span></div>`).join('');
  $('#marqueeTrack').innerHTML = html;
}

// --- hero tagline typewriter ---
function cycleHeroTagline() {
  const el = $('#heroTagline');
  const lines = state.pkgs.heroTaglines;
  if (reducedMotion()) { el.textContent = lines[0]; return; }
  let idx = 0;
  async function loop() {
    while (true) {
      await typeText(el, lines[idx], 35);
      await wait(2000);
      await deleteText(el, 25);
      await wait(250);
      idx = (idx + 1) % lines.length;
    }
  }
  loop();
}
function typeText(el, text, speed) {
  return new Promise(resolve => {
    let i = 0;
    function step() {
      if (i <= text.length) {
        el.textContent = text.slice(0, i);
        i++;
        setTimeout(step, speed);
      } else resolve();
    }
    step();
  });
}
function deleteText(el, speed) {
  return new Promise(resolve => {
    function step() {
      const t = el.textContent;
      if (t.length === 0) resolve();
      else {
        el.textContent = t.slice(0, -1);
        setTimeout(step, speed);
      }
    }
    step();
  });
}
function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

// --- picker ---
function renderPicker() {
  const picker = $('#picker');
  picker.innerHTML = state.sortedList.map((p, i) => `
    <li id="pkg-opt-${p.name}" role="option" data-idx="${i}" data-name="${p.name}" aria-selected="false" tabindex="-1">
      <span>${p.name}</span>
      <span class="arrow" aria-hidden="true">&larr;</span>
    </li>
  `).join('');

  // mobile still needs horizontal center-snap padding; desktop is a flat top-aligned list
  const updatePadding = () => {
    const isMobile = window.innerWidth <= 900;
    if (isMobile) {
      picker.style.paddingTop = '';
      picker.style.paddingBottom = '';
      picker.style.paddingLeft = '50%';
      picker.style.paddingRight = '50%';
    } else {
      picker.style.paddingLeft = '';
      picker.style.paddingRight = '';
      picker.style.paddingTop = '';
      picker.style.paddingBottom = '';
    }
  };
  updatePadding();
  window.addEventListener('resize', () => {
    updatePadding();
    // mobile's horizontal picker needs to re-center on the active item when the
    // layout flips across the 900px breakpoint; desktop's flat list is a no-op
    snapTo(state.activeIdx, false);
  });

  // click to select
  picker.querySelectorAll('li').forEach(li => {
    li.addEventListener('click', () => {
      const idx = parseInt(li.dataset.idx, 10);
      snapTo(idx, true);
    });
  });

  // scroll-based active detection only on mobile (horizontal wheel-picker)
  let scrollTimer = null;
  picker.addEventListener('scroll', () => {
    if (window.innerWidth > 900) return;
    if (state.isSnapping) return;
    if (scrollTimer) cancelAnimationFrame(scrollTimer);
    scrollTimer = requestAnimationFrame(() => {
      const idx = nearestCenterIdx();
      if (idx !== state.activeIdx) {
        state.activeIdx = idx;
        state.activeName = state.sortedList[idx]?.name || null;
        updateActiveClass();
        renderSlab();
        updateHash();
        updateMeta();
      }
    });
  }, { passive: true });
}

function nearestCenterIdx() {
  const picker = $('#picker');
  const isMobile = window.innerWidth <= 900;
  const items = picker.querySelectorAll('li');
  const pickerRect = picker.getBoundingClientRect();
  const center = isMobile
    ? pickerRect.left + pickerRect.width / 2
    : pickerRect.top + pickerRect.height / 2;
  let closest = 0, minDist = Infinity;
  items.forEach((li, i) => {
    const r = li.getBoundingClientRect();
    const c = isMobile ? r.left + r.width / 2 : r.top + r.height / 2;
    const d = Math.abs(c - center);
    if (d < minDist) { minDist = d; closest = i; }
  });
  return closest;
}

function snapTo(idx, smooth) {
  const picker = $('#picker');
  const li = picker.querySelectorAll('li')[idx];
  if (!li) return;
  state.activeIdx = idx;
  state.activeName = state.sortedList[idx]?.name || null;
  const isMobile = window.innerWidth <= 900;

  // suppress scroll-driven updates while the programmatic smooth scroll runs
  state.isSnapping = true;
  clearTimeout(state.snapTimer);

  if (isMobile) {
    const target = li.offsetLeft - (picker.clientWidth - li.offsetWidth) / 2;
    picker.scrollTo({ left: target, behavior: smooth ? 'smooth' : 'auto' });
  } else {
    li.scrollIntoView({ block: 'nearest', behavior: smooth ? 'smooth' : 'auto' });
  }

  // release the flag once scroll has settled (smooth ~500ms worst case)
  state.snapTimer = setTimeout(() => { state.isSnapping = false; }, smooth ? 500 : 0);

  updateActiveClass();
  renderSlab();
  updateHash();
  updateMeta();
}

function updateActiveClass() {
  const picker = $('#picker');
  const items = picker.querySelectorAll('li');
  let activeId = '';
  items.forEach((li, i) => {
    const isActive = i === state.activeIdx;
    li.classList.toggle('active', isActive);
    li.setAttribute('aria-selected', isActive ? 'true' : 'false');
    if (isActive) activeId = li.id;
  });
  picker.setAttribute('aria-activedescendant', activeId);
}

// When the user is arrow-navigating from inside the listbox, keep the visible
// focus ring on the active option. We don't steal focus when arrows fire from
// elsewhere in the page (e.g. global hotkeys with body focused).
function focusActiveOptionIfInPicker() {
  const picker = $('#picker');
  if (!picker) return;
  const active = document.activeElement;
  const isInPicker = active === picker || (active instanceof Node && picker.contains(active));
  if (!isInPicker) return;
  const li = picker.querySelectorAll('li')[state.activeIdx];
  if (li) li.focus({ preventScroll: true });
}

function updateHash() {
  const p = state.sortedList[state.activeIdx];
  if (p) history.replaceState(null, '', '#' + p.name);
}

// Reflect the active package in the document title + description so that
// tab labels, browser history entries, and link previews include it.
function updateMeta() {
  const p = state.sortedList[state.activeIdx];
  if (!p) return;
  document.title = `${p.name} · ${p.speedup} — amigo-native`;
  const desc = document.querySelector('meta[name="description"]');
  if (desc) {
    desc.setAttribute('content',
      `@amigo-labs/${p.name}: ${p.description} ${p.speedup}.`);
  }
  const ogTitle = document.querySelector('meta[property="og:title"]');
  if (ogTitle) {
    ogTitle.setAttribute('content', `@amigo-labs/${p.name} — ${p.speedup}`);
  }
  const ogDesc = document.querySelector('meta[property="og:description"]');
  if (ogDesc) ogDesc.setAttribute('content', p.description);
}

// --- slab ---
// Holding ↓/↑ rapidly cascades the 120 ms fade per render and feels janky.
// Coalesce: only the latest pending render lands; intermediates are dropped.
let renderSlabPending = null;
function renderSlab() {
  const p = state.sortedList[state.activeIdx];
  if (!p) return;
  const slab = $('#slab');
  clearTimers();

  // Announce the new package to assistive tech via the persistent live region.
  const announce = $('#slabAnnounce');
  if (announce) announce.textContent = `${p.name} — ${p.speedup}`;

  if (renderSlabPending !== null) {
    clearTimeout(renderSlabPending);
    renderSlabPending = null;
  }

  slab.classList.add('fading');
  renderSlabPending = setTimeout(() => {
    renderSlabPending = null;
    const cur = state.sortedList[state.activeIdx];
    if (!cur) return;
    slab.innerHTML = buildSlabHTML(cur);
    slab.classList.remove('fading');
    animateSlab(cur);
  }, reducedMotion() ? 0 : 120);
}

function buildSlabHTML(p) {
  const newTabSr = '<span class="visually-hidden"> (opens in new tab)</span>';
  return `
    <div class="slab-head">
      <div class="slab-name"><span class="scope">@amigo-labs/</span><span id="slabName">${p.name}</span></div>
      <div class="slab-speedup" id="slabSpeedup"></div>
    </div>
    <p class="slab-desc" id="slabDesc"></p>

    <div class="slab-install">
      <span class="prefix" aria-hidden="true">$</span>
      <span class="cmd" id="slabCmd"></span><span class="caret" aria-hidden="true"></span>
      <button class="copy-btn" type="button" id="slabCopy" aria-label="Copy install command">Copy</button>
    </div>

    <div class="slab-links">
      <a href="${p.npmUrl}" target="_blank" rel="noopener noreferrer">npm <span aria-hidden="true">&nearr;</span>${newTabSr}</a>
      <a href="${p.sourceUrl}" target="_blank" rel="noopener noreferrer">source <span aria-hidden="true">&nearr;</span>${newTabSr}</a>
      <a href="${p.readmeUrl}" target="_blank" rel="noopener noreferrer">readme <span aria-hidden="true">&nearr;</span>${newTabSr}</a>
    </div>

    <div class="slab-grid">
      <div class="slab-col">
        <div class="slab-col-head">Benchmarks (ops/s)</div>
        <div class="chart-legend" aria-hidden="true">
          <span><span class="swatch amigo"></span>amigo-labs</span>
          <span><span class="swatch competitor"></span>competitor</span>
        </div>
        <div id="slabBench"></div>
      </div>
      <div class="slab-col">
        <div class="slab-col-head">Install footprint</div>
        <div class="chart-legend" aria-hidden="true">
          <span><span class="swatch amigo"></span>amigo-labs</span>
          <span><span class="swatch competitor"></span>competitor</span>
        </div>
        <div id="slabSizes"></div>
      </div>
    </div>

    <details class="slab-readme" id="slabReadmeHost">
      <summary>README <span class="readme-hint">rendered by @amigo-labs/commonmark</span></summary>
      <div class="readme-body" id="slabReadme"></div>
    </details>
  `;
}

function animateSlab(p) {
  const cmdText = 'npm install @amigo-labs/' + p.name;

  // Speedup and description are functional content — show instantly so the
  // user can read them. The slab fade-in already provides motion. Only the
  // install command keeps the typewriter (it's the on-brand shell prompt).
  $('#slabSpeedup').textContent = p.speedup;
  $('#slabDesc').textContent = p.description;
  typeInto($('#slabCmd'), cmdText, 20);

  const installRow = document.querySelector('.slab-install');
  const copyBtn = $('#slabCopy');
  const triggerCopy = () => copyToClipboard(cmdText, copyBtn, installRow);
  copyBtn.addEventListener('click', triggerCopy);
  // Tapping anywhere on the install row also copies — so users don't have
  // to aim at the small button on touch devices.
  installRow.addEventListener('click', e => {
    if (e.target.closest('.copy-btn')) return; // button click already handled
    triggerCopy();
  });

  renderBench(p);
  renderSizes(p);
  wireReadme(p);
}

// Try the modern clipboard API; fall back to the legacy execCommand path
// for non-secure contexts (file://, embedded). On full failure surface a
// visible error state so the user knows to copy manually.
async function copyToClipboard(text, btn, installRow) {
  let ok = false;
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      ok = true;
    } else {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      ok = document.execCommand('copy');
      document.body.removeChild(ta);
    }
  } catch {
    ok = false;
  }
  if (!btn) return;
  const prev = btn.textContent;
  btn.textContent = ok ? '✓ Copied' : 'Copy failed';
  btn.classList.add(ok ? 'is-ok' : 'is-err');
  if (installRow && ok) installRow.classList.add('flash');
  setTimeout(() => {
    btn.textContent = prev;
    btn.classList.remove('is-ok', 'is-err');
    if (installRow) installRow.classList.remove('flash');
  }, 1500);
}

function wireReadme(pkg) {
  const details = $('#slabReadmeHost');
  const host = $('#slabReadme');
  if (!details || !host) return;
  let loaded = false;
  details.addEventListener('toggle', async () => {
    if (!details.open || loaded) return;
    host.innerHTML = '<div class="readme-skeleton" aria-label="Loading README"><div class="line"></div><div class="line"></div><div class="line"></div></div>';
    try {
      const res = await fetch(`readmes/${pkg.name}.html`);
      if (!res.ok) throw new Error(res.statusText);
      // The fetched HTML is locally rendered from each crate's README via
      // our own commonmark crate during the docs build — same-origin, no
      // user-controlled content. Do NOT route untrusted markup through
      // this assignment without sanitising it first.
      host.innerHTML = await res.text();
      loaded = true;
    } catch {
      host.innerHTML = '<div class="readme-error">Could not load README.</div>';
    }
  });
}

function renderBench(pkg) {
  const host = $('#slabBench');
  if (!state.data?.benchmarks?.suites) {
    host.innerHTML = '<div class="empty-state">No benchmark data available.</div>';
    return;
  }
  const suites = state.data.benchmarks.suites.filter(s => suiteCrate(s) === pkg.name);
  if (!suites.length) {
    host.innerHTML = '<div class="empty-state">No benchmarks for this package yet.</div>';
    return;
  }
  let html = '';
  for (const suite of suites) {
    const entries = suite.entries.filter(e => e.hz > 0);
    if (!entries.length) continue;
    const maxHz = Math.max(...entries.map(e => e.hz));
    const scenario = suite.name.replace(/^[^\s]+\s+[-—]\s+/, '') || suite.name;
    html += `<div class="slab-col-sub">${scenario}</div>`;
    const sorted = [...entries].sort((a, b) => b.hz - a.hz);
    for (const entry of sorted) {
      const pct = Math.max((entry.hz / maxHz) * 100, 2);
      const isAmigo = entry.name.includes('@amigo');
      const isFastest = entry.hz === maxHz;
      const fillCls = isAmigo && isFastest ? 'winner' : 'competitor';
      const labelCls = isAmigo ? ' is-amigo' : '';
      let ratio = '';
      if (isAmigo && isFastest && sorted.length > 1) {
        const second = sorted.find(e => !e.name.includes('@amigo'));
        if (second) ratio = `<span class="ratio">${(entry.hz / second.hz).toFixed(1)}&times;</span>`;
      }
      const tag = isAmigo ? '<span class="amigo-tag" aria-hidden="true">amigo</span>' : '';
      html += `
        <div class="bar-row">
          <span class="label${labelCls}">${tag}${entry.name}</span>
          <span class="val" data-hz="${entry.hz}">0</span>${ratio}
          <div class="track"><div class="fill ${fillCls}" data-pct="${pct}" style="width:0%"></div></div>
        </div>`;
    }
  }
  host.innerHTML = html;

  // animate
  requestAnimationFrame(() => {
    host.querySelectorAll('.fill').forEach(el => {
      el.style.width = el.dataset.pct + '%';
    });
    host.querySelectorAll('.val').forEach(el => {
      const to = parseFloat(el.dataset.hz);
      countUp(el, 0, to, 500, v => formatOps(v));
    });
  });
}

function renderSizes(pkg) {
  const host = $('#slabSizes');
  const sizes = state.data?.sizes?.[pkg.name];
  if (!sizes) {
    host.innerHTML = '<div class="empty-state">No size data.</div>';
    return;
  }
  const amigoKey = '@amigo-labs/' + pkg.name;
  const entries = Object.entries(sizes);
  const maxSize = Math.max(...entries.map(([, v]) => v.installSize || 0), 1);

  let html = '';
  for (const [name, info] of entries) {
    const size = info.installSize || 0;
    const pct = Math.max((size / maxSize) * 100, 2);
    const isAmigo = name === amigoKey;
    const fillCls = isAmigo ? 'winner' : 'competitor';
    const labelCls = isAmigo ? ' is-amigo' : '';
    let ratio = '';
    if (isAmigo && size > 0 && entries.length > 1) {
      const largestCompetitor = entries
        .filter(([n]) => n !== amigoKey)
        .reduce((max, [, info]) => Math.max(max, info.installSize || 0), 0);
      if (largestCompetitor > size) {
        ratio = `<span class="ratio">${(largestCompetitor / size).toFixed(1)}&times;</span>`;
      }
    }
    const tag = isAmigo ? '<span class="amigo-tag" aria-hidden="true">amigo</span>' : '';
    html += `
      <div class="bar-row">
        <span class="label${labelCls}">${tag}${name}</span>
        <span class="val" data-bytes="${size}">0</span>${ratio}
        <div class="track"><div class="fill ${fillCls}" data-pct="${pct}" style="width:0%"></div></div>
      </div>`;
  }
  host.innerHTML = html;

  requestAnimationFrame(() => {
    host.querySelectorAll('.fill').forEach(el => {
      el.style.width = el.dataset.pct + '%';
    });
    host.querySelectorAll('.val').forEach(el => {
      const to = parseFloat(el.dataset.bytes);
      countUp(el, 0, to, 500, v => formatBytes(v));
    });
  });
}

// --- keyboard ---
function wireSortChips() {
  document.querySelectorAll('.sort-chips .chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const mode = chip.dataset.sort;
      if (mode === state.sortMode) return;
      state.sortMode = mode;
      document.querySelectorAll('.sort-chips .chip').forEach(c => {
        c.setAttribute('aria-pressed', c.dataset.sort === mode ? 'true' : 'false');
      });
      const keepName = state.activeName;
      computeSortedList();
      renderPicker();
      const newIdx = Math.max(0, state.sortedList.findIndex(p => p.name === keepName));
      requestAnimationFrame(() => snapTo(newIdx, true));
    });
  });
}

function wireKeyboard() {
  const isInteractiveTarget = t => {
    if (!(t instanceof Element)) return false;
    if (t.isContentEditable) return true;
    return !!t.closest('input, textarea, select, button, a, [contenteditable=""], [contenteditable="true"], [role="button"], [role="link"]');
  };

  document.addEventListener('keydown', e => {
    if (!state.sortedList.length) return;
    if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    if (isInteractiveTarget(e.target)) return;

    const n = state.sortedList.length;
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight' || e.key === 'j') {
      snapTo((state.activeIdx + 1) % n, true);
      focusActiveOptionIfInPicker();
      e.preventDefault();
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft' || e.key === 'k') {
      snapTo((state.activeIdx - 1 + n) % n, true);
      focusActiveOptionIfInPicker();
      e.preventDefault();
    } else if (e.key === 'c') {
      const btn = document.getElementById('slabCopy');
      if (btn) btn.click();
    } else if (e.key === 'Home') {
      snapTo(0, true); focusActiveOptionIfInPicker(); e.preventDefault();
    } else if (e.key === 'End') {
      snapTo(n - 1, true); focusActiveOptionIfInPicker(); e.preventDefault();
    }
  });
}

// Wheel-driven picker navigation, scoped to the picker column. Wheels
// elsewhere on the page are left alone so users from "normal" sites don't
// feel hijacked. The picker's own native scroll-snap still works.
function wireWheel() {
  let accum = 0;
  let lastTime = 0;
  let cooldownUntil = 0;
  const THRESHOLD = 40;
  const COOLDOWN_MS = 220;

  const pickerWrap = document.querySelector('.picker-wrap');
  if (!pickerWrap) return;

  pickerWrap.addEventListener('wheel', e => {
    if (window.innerWidth <= 900) return; // mobile uses its own swipes
    if (!state.sortedList.length) return;

    const picker = document.getElementById('picker');

    // The picker's own scroll-snap handles wheels that land directly on it.
    // Wheels on the surrounding column (label, sort chips) drive the picker
    // programmatically.
    if (picker && picker.contains(e.target)) return;

    e.preventDefault();

    const now = performance.now();
    if (now < cooldownUntil) return;
    if (now - lastTime > 300) accum = 0;
    accum += e.deltaY;
    lastTime = now;

    if (Math.abs(accum) >= THRESHOLD) {
      const n = state.sortedList.length;
      if (accum > 0) {
        snapTo(Math.min(state.activeIdx + 1, n - 1), true);
      } else {
        snapTo(Math.max(state.activeIdx - 1, 0), true);
      }
      accum = 0;
      cooldownUntil = now + COOLDOWN_MS;
    }
  }, { passive: false });
}

// --- go ---
boot().catch(err => {
  console.error('amigo-native boot failed:', err);
  document.body.innerHTML = '<div style="padding:40px;font-family:monospace;color:#E8E6E2">Failed to load. Check console.</div>';
});
