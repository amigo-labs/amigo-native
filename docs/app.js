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
  wireSortChips();
  cycleHeroTagline();
  wireCursorGlow();
  wireKeyboard();

  // initial active from hash (name-based so it survives sort changes)
  const hash = (location.hash || '').replace('#', '');
  const hashIdx = state.sortedList.findIndex(p => p.name === hash);
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

  // pad top/bottom so first/last can center-snap (desktop only; mobile uses horizontal layout)
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
      const firstItem = picker.querySelector('li');
      if (firstItem) {
        const itemH = firstItem.offsetHeight;
        const pad = Math.max((picker.clientHeight - itemH) / 2, 0);
        picker.style.paddingTop = pad + 'px';
        picker.style.paddingBottom = pad + 'px';
      }
    }
  };
  updatePadding();
  window.addEventListener('resize', () => {
    updatePadding();
    snapTo(state.activeIdx, false);
  });

  // click to select
  picker.querySelectorAll('li').forEach(li => {
    li.addEventListener('click', () => {
      const idx = parseInt(li.dataset.idx, 10);
      snapTo(idx, true);
    });
  });

  // scroll-based active detection (suppressed while programmatic snap is running)
  let scrollTimer = null;
  picker.addEventListener('scroll', () => {
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
    const target = li.offsetTop - (picker.clientHeight - li.offsetHeight) / 2;
    picker.scrollTo({ top: target, behavior: smooth ? 'smooth' : 'auto' });
  }

  // release the flag once scroll has settled (smooth ~500ms worst case)
  state.snapTimer = setTimeout(() => { state.isSnapping = false; }, smooth ? 500 : 0);

  updateActiveClass();
  renderSlab();
  updateHash();
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

// --- slab ---
function renderSlab() {
  const p = state.sortedList[state.activeIdx];
  if (!p) return;
  const slab = $('#slab');
  clearTimers();

  slab.classList.add('fading');
  setTimeout(() => {
    slab.innerHTML = buildSlabHTML(p);
    slab.classList.remove('fading');
    animateSlab(p);
  }, reducedMotion() ? 0 : 120);
}

function buildSlabHTML(p) {
  return `
    <div class="slab-head">
      <div class="slab-name"><span class="scope">@amigo-labs/</span><span id="slabName">${p.name}</span></div>
      <div class="slab-speedup" id="slabSpeedup"></div>
    </div>
    <p class="slab-desc" id="slabDesc"></p>

    <div class="slab-install">
      <div class="dots" aria-hidden="true">
        <span class="dot"></span><span class="dot"></span><span class="dot hot"></span>
      </div>
      <span class="prefix">$</span>
      <span class="cmd" id="slabCmd"></span><span class="caret" aria-hidden="true"></span>
      <button class="copy-btn" type="button" id="slabCopy">Copy</button>
    </div>

    <div class="slab-grid">
      <div class="slab-col">
        <div class="slab-col-head">Benchmarks (ops/s)</div>
        <div id="slabBench"></div>
      </div>
      <div class="slab-col">
        <div class="slab-col-head">Install footprint</div>
        <div id="slabSizes"></div>
      </div>
    </div>

    <div class="slab-links">
      <a href="${p.npmUrl}" target="_blank" rel="noopener">npm &nearr;</a>
      <a href="${p.sourceUrl}" target="_blank" rel="noopener">source &nearr;</a>
      <a href="${p.readmeUrl}" target="_blank" rel="noopener">readme &nearr;</a>
    </div>
  `;
}

function animateSlab(p) {
  const cmd = '$ npm install @amigo-labs/' + p.name;
  const cmdText = 'npm install @amigo-labs/' + p.name;

  typeInto($('#slabSpeedup'), p.speedup, 18);
  typeInto($('#slabDesc'), p.description, 8);
  typeInto($('#slabCmd'), cmdText, 20);

  $('#slabCopy').addEventListener('click', () => {
    navigator.clipboard.writeText(cmdText);
    const btn = $('#slabCopy');
    const prev = btn.textContent;
    btn.textContent = 'Copied';
    setTimeout(() => { btn.textContent = prev; }, 1500);
  });

  renderBench(p);
  renderSizes(p);
}

function renderBench(pkg) {
  const host = $('#slabBench');
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
      e.preventDefault();
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft' || e.key === 'k') {
      snapTo((state.activeIdx - 1 + n) % n, true);
      e.preventDefault();
    } else if (e.key === 'c') {
      const btn = document.getElementById('slabCopy');
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
