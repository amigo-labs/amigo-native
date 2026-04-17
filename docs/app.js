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
  const matches = s.match(/(\d+(?:\.\d+)?)/g);
  if (!matches) return 0;
  const nums = matches.map(Number);
  return Math.max(...nums);
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
function detectCrate(name) {
  const l = name.toLowerCase();
  if (l.includes('slugify')) return 'slugify';
  if (l.includes('argon2')) return 'argon2';
  if (l.includes('xxh')) return 'xxhash';
  if (l.includes('sanitize')) return 'sanitize-html';
  if (l.includes('csv')) return 'csv';
  return 'other';
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
  renderFooter();
  renderPicker();
  renderAllSlabs();
  wireSortChips();
  cycleHeroTagline();
  wireCursorGlow();
  wireKeyboard();

  // initial active from hash (name-based so it survives sort changes)
  const hash = (location.hash || '').replace('#', '');
  const hashIdx = state.sortedList.findIndex(p => p.name === hash);
  state.activeIdx = hashIdx >= 0 ? hashIdx : 0;
  state.activeName = state.sortedList[state.activeIdx].name;

  // initial render: mark active slab, scroll only if deep-linked
  requestAnimationFrame(() => {
    updateActiveClass();
    updateInView();
    if (hashIdx > 0) snapTo(state.activeIdx, false);
    playSlabAnimations(state.activeName);
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

function renderFooter() { /* merged into renderBrand */ }

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
    <li id="pkg-opt-${p.name}" role="option" data-idx="${i}" data-name="${p.name}" aria-selected="false">
      <span>${p.name}</span>
      <span class="arrow">&larr;</span>
    </li>
  `).join('');

  // mobile-only: pad left/right so first/last chip can center-snap
  const updatePadding = () => {
    const isMobile = window.innerWidth <= 900;
    if (isMobile) {
      picker.style.paddingLeft = '50%';
      picker.style.paddingRight = '50%';
    } else {
      picker.style.paddingLeft = '';
      picker.style.paddingRight = '';
    }
  };
  updatePadding();
  window.addEventListener('resize', updatePadding);

  // click to select
  picker.querySelectorAll('li').forEach(li => {
    li.addEventListener('click', () => {
      const idx = parseInt(li.dataset.idx, 10);
      snapTo(idx, true);
    });
  });

  // mobile horizontal swipe -> page-scroll to the matching slab
  let scrollTimer = null;
  picker.addEventListener('scroll', () => {
    if (state.isSnapping) return;
    if (window.innerWidth > 900) return; // only mobile picker scrolls
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(() => {
      const idx = nearestCenterIdx();
      if (idx !== state.activeIdx) snapTo(idx, true);
    }, 80);
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
  const p = state.sortedList[idx];
  if (!p) return;
  state.activeIdx = idx;
  state.activeName = p.name;

  const slab = document.getElementById('slab-' + p.name);
  if (!slab) return;

  // horizontal center on mobile picker strip
  const isMobile = window.innerWidth <= 900;
  if (isMobile) {
    const picker = $('#picker');
    const li = picker.querySelectorAll('li')[idx];
    if (li) {
      const target = li.offsetLeft - (picker.clientWidth - li.offsetWidth) / 2;
      picker.scrollTo({ left: target, behavior: smooth ? 'smooth' : 'auto' });
    }
  }

  // suppress observer-driven updates during programmatic page scroll
  state.isSnapping = true;
  clearTimeout(state.snapTimer);
  slab.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'start' });
  state.snapTimer = setTimeout(() => { state.isSnapping = false; }, smooth ? 700 : 0);

  updateActiveClass();
  updateInView();
  updateHash();
  playSlabAnimations(p.name);
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

function updateHash() {
  const p = state.sortedList[state.activeIdx];
  if (p) history.replaceState(null, '', '#' + p.name);
}

// --- slabs (all rendered vertically) ---
function renderAllSlabs() {
  const host = $('#slabs');
  host.innerHTML = state.sortedList.map(p => buildSlabHTML(p)).join('');
  state.sortedList.forEach(p => animateSlab(p));
  observeSlabs();
}

function buildSlabHTML(p) {
  const cmdText = 'npm install @amigo-labs/' + p.name;
  return `
    <article class="slab" id="slab-${p.name}" data-name="${p.name}" aria-labelledby="slab-name-${p.name}">
      <div class="slab-head">
        <div class="slab-name" id="slab-name-${p.name}"><span class="scope">@amigo-labs/</span>${p.name}</div>
        <div class="slab-speedup" data-speedup="${p.speedup}"></div>
      </div>
      <p class="slab-desc" data-desc="${escapeAttr(p.description)}"></p>
      <div class="slab-install">
        <div class="dots" aria-hidden="true">
          <span class="dot"></span><span class="dot"></span><span class="dot hot"></span>
        </div>
        <span class="prefix">$</span>
        <span class="cmd" data-cmd="${cmdText}"></span><span class="caret" aria-hidden="true"></span>
        <button class="copy-btn" type="button" data-copy="${cmdText}">Copy</button>
      </div>
      <div class="slab-grid">
        <div class="slab-col">
          <div class="slab-col-head">Benchmarks (ops/s)</div>
          <div class="slab-bench"></div>
        </div>
        <div class="slab-col">
          <div class="slab-col-head">Install footprint</div>
          <div class="slab-sizes"></div>
        </div>
      </div>
      <div class="slab-links">
        <a href="${p.npmUrl}" target="_blank" rel="noopener">npm &nearr;</a>
        <a href="${p.sourceUrl}" target="_blank" rel="noopener">source &nearr;</a>
        <a href="${p.readmeUrl}" target="_blank" rel="noopener">readme &nearr;</a>
      </div>
    </article>
  `;
}

function escapeAttr(s) {
  return String(s).replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

function animateSlab(p) {
  const slab = document.getElementById('slab-' + p.name);
  if (!slab) return;

  const speedupEl = slab.querySelector('.slab-speedup');
  const descEl = slab.querySelector('.slab-desc');
  const cmdEl = slab.querySelector('.cmd');
  speedupEl.textContent = speedupEl.dataset.speedup;
  descEl.textContent = descEl.dataset.desc;
  cmdEl.textContent = cmdEl.dataset.cmd;

  const copyBtn = slab.querySelector('.copy-btn');
  copyBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(copyBtn.dataset.copy);
    const prev = copyBtn.textContent;
    copyBtn.textContent = 'Copied';
    setTimeout(() => { copyBtn.textContent = prev; }, 1500);
  });

  renderBench(p, slab.querySelector('.slab-bench'));
  renderSizes(p, slab.querySelector('.slab-sizes'));
}

function playSlabAnimations(name) {
  const slab = document.getElementById('slab-' + name);
  if (!slab || slab.dataset.animated === '1') return;
  slab.dataset.animated = '1';
  const p = state.sortedList.find(x => x.name === name) || state.pkgs.packages.find(x => x.name === name);
  if (!p) return;

  if (reducedMotion()) return; // values are already written

  const speedupEl = slab.querySelector('.slab-speedup');
  const descEl = slab.querySelector('.slab-desc');
  const cmdEl = slab.querySelector('.cmd');
  typeInto(speedupEl, p.speedup, 18);
  typeInto(descEl, p.description, 6);
  typeInto(cmdEl, 'npm install @amigo-labs/' + p.name, 18);

  slab.querySelectorAll('.slab-bench .fill, .slab-sizes .fill').forEach(el => {
    const pct = el.dataset.pct;
    el.style.width = '0%';
    requestAnimationFrame(() => { el.style.width = pct + '%'; });
  });
  slab.querySelectorAll('.slab-bench .val[data-hz]').forEach(el => {
    countUp(el, 0, parseFloat(el.dataset.hz), 500, v => formatOps(v));
  });
  slab.querySelectorAll('.slab-sizes .val[data-bytes]').forEach(el => {
    countUp(el, 0, parseFloat(el.dataset.bytes), 500, v => formatBytes(v));
  });
}

// --- IntersectionObserver: sync active state with page scroll ---
let slabObserver = null;
function observeSlabs() {
  if (slabObserver) slabObserver.disconnect();
  slabObserver = new IntersectionObserver((entries) => {
    if (state.isSnapping) return;
    // choose the entry closest to the viewport center
    const vh = window.innerHeight;
    const center = vh / 2;
    let best = null, bestDist = Infinity;
    entries.forEach(e => {
      if (!e.isIntersecting) return;
      const r = e.target.getBoundingClientRect();
      const itemCenter = r.top + r.height / 2;
      const dist = Math.abs(itemCenter - center);
      if (dist < bestDist) { bestDist = dist; best = e.target; }
    });
    if (!best) return;
    const name = best.dataset.name;
    if (name === state.activeName) return;
    const idx = state.sortedList.findIndex(p => p.name === name);
    if (idx < 0) return;
    state.activeIdx = idx;
    state.activeName = name;
    updateActiveClass();
    updateInView();
    updateHash();
    playSlabAnimations(name);
  }, { threshold: [0, 0.25, 0.5, 0.75, 1] });

  document.querySelectorAll('.slab').forEach(el => slabObserver.observe(el));
}

function updateInView() {
  document.querySelectorAll('.slab').forEach(el => {
    el.classList.toggle('in-view', el.dataset.name === state.activeName);
  });
}

function renderBench(pkg, host) {
  if (!host) return;
  if (!state.data?.benchmarks?.suites) {
    host.innerHTML = '<div style="color:var(--text-tertiary);font-size:.75rem">No benchmark data available.</div>';
    return;
  }
  const suites = state.data.benchmarks.suites.filter(s => detectCrate(s.name) === pkg.name);
  if (!suites.length) {
    host.innerHTML = '<div style="color:var(--text-tertiary);font-size:.75rem">No benchmarks for this package yet.</div>';
    return;
  }
  let html = '';
  for (const suite of suites) {
    const entries = suite.entries.filter(e => e.hz > 0);
    if (!entries.length) continue;
    const maxHz = Math.max(...entries.map(e => e.hz));
    const scenario = suite.name.split(' - ').slice(1).join(' - ') || suite.name;
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
      html += `
        <div class="bar-row">
          <span class="label${labelCls}">${entry.name}</span>
          <span class="val" data-hz="${entry.hz}">0</span>${ratio}
          <div class="track"><div class="fill ${fillCls}" data-pct="${pct}" style="width:0%"></div></div>
        </div>`;
    }
  }
  host.innerHTML = html;
  // if reduced-motion, fill immediately; otherwise wait for playSlabAnimations
  if (reducedMotion()) {
    host.querySelectorAll('.fill').forEach(el => { el.style.width = el.dataset.pct + '%'; });
    host.querySelectorAll('.val[data-hz]').forEach(el => { el.textContent = formatOps(parseFloat(el.dataset.hz)); });
  }
}

function renderSizes(pkg, host) {
  if (!host) return;
  const sizes = state.data?.sizes?.[pkg.name];
  if (!sizes) {
    host.innerHTML = '<div style="color:var(--text-tertiary);font-size:.75rem">No size data.</div>';
    return;
  }
  const amigoKey = '@amigo-labs/' + pkg.name;
  const amigoSize = sizes[amigoKey]?.installSize || 0;
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
    html += `
      <div class="bar-row">
        <span class="label${labelCls}">${name}</span>
        <span class="val" data-bytes="${size}">0</span>${ratio}
        <div class="track"><div class="fill ${fillCls}" data-pct="${pct}" style="width:0%"></div></div>
      </div>`;
  }
  host.innerHTML = html;
  if (reducedMotion()) {
    host.querySelectorAll('.fill').forEach(el => { el.style.width = el.dataset.pct + '%'; });
    host.querySelectorAll('.val[data-bytes]').forEach(el => { el.textContent = formatBytes(parseFloat(el.dataset.bytes)); });
  }
}

// --- cursor glow ---
function wireCursorGlow() {
  const glow = $('#cursorGlow');
  if (!glow) return;
  document.addEventListener('mousemove', e => {
    glow.style.transform = `translate(calc(${e.clientX}px - 50%), calc(${e.clientY}px - 50%))`;
  }, { passive: true });
}

// --- keyboard ---
function wireSortChips() {
  document.querySelectorAll('.sort-chips .chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const mode = chip.dataset.sort;
      if (mode === state.sortMode) return;
      state.sortMode = mode;
      document.querySelectorAll('.sort-chips .chip').forEach(c => {
        c.setAttribute('aria-selected', c.dataset.sort === mode ? 'true' : 'false');
      });
      const keepName = state.activeName;
      computeSortedList();
      renderPicker();
      renderAllSlabs();
      const newIdx = Math.max(0, state.sortedList.findIndex(p => p.name === keepName));
      state.activeIdx = newIdx;
      state.activeName = state.sortedList[newIdx].name;
      requestAnimationFrame(() => {
        updateActiveClass();
        updateInView();
        snapTo(newIdx, false);
      });
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
      e.preventDefault();
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft' || e.key === 'k') {
      snapTo((state.activeIdx - 1 + n) % n, true);
      e.preventDefault();
    } else if (e.key === 'c') {
      const activeSlab = document.getElementById('slab-' + state.activeName);
      const btn = activeSlab?.querySelector('.copy-btn');
      if (btn) btn.click();
    } else if (e.key === 'Home') {
      snapTo(0, true); e.preventDefault();
    } else if (e.key === 'End') {
      snapTo(n - 1, true); e.preventDefault();
    }
  });
}

// --- go ---
boot().catch(err => {
  console.error('amigo-native boot failed:', err);
  document.body.innerHTML = '<div style="padding:40px;font-family:monospace;color:#E8E6E2">Failed to load. Check console.</div>';
});
