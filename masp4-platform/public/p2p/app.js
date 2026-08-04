/* Pathways to Prosperity — Results Dashboard
 * Client-side only: SheetJS reads the workbook, Chart.js draws.
 * Metrics used throughout: Net Achievement (actual) and Net annual target.
 * Results/Targets (New|Continued) are never read.
 * Layout + chart grammar mirror ECA_Dashboard.html. */
'use strict';

const WORKBOOK_URL = 'AP AR 2023-26.xlsx';
const BLANK = '(Not specified)';
const Y = '#FFC800';       // Net Achievement
const K = '#111111';       // Net annual target
const YD = '#B38F00';      // datalabel ink over yellow bars

/* Pillars are keyed on Indicator Id — stable even if a KPI is reworded.
   Pillar membership supplied by the programme team; anything unlisted falls
   into "Other Programme KPIs" rather than being silently reassigned. */
const PILLARS = [
  { key: 'p1', name: 'Viable and Resilient Production Systems', color: Y, ink: '#000',
    tag: 'Jobs · Working Conditions · Knowledge & Skills', ids: ['G051', 'S1.5', 'G054'] },
  { key: 'p2', name: 'Inclusive Service Delivery Systems', color: '#2e7d32', ink: '#fff',
    tag: 'Producer Services · Service Providers', ids: ['G055', 'S2.1', 'S2.2', 'G041'] },
  { key: 'p3', name: 'Market Connection', color: '#1565c0', ink: '#fff',
    tag: 'Market Access · Private Sector Partners · Sustainable Sourcing', ids: ['G058', 'S3.5', 'S6.4', 'S6.5'] },
  { key: 'other', name: 'Other Programme KPIs', color: '#888888', ink: '#fff',
    tag: 'Not mapped to a pillar', ids: null },
];
const TABS = [
  ...PILLARS.map((p) => ({ key: p.key, label: p.name, color: p.color })),
  { key: 'geo', label: 'Countries & Portfolio', color: '#e65100' },
  { key: 'stake', label: 'Stakeholders', color: '#7b1fa2' },
];

const COLS = [
  ['indicatorId', 'Indicator Id'], ['kpi', 'KPI Name'], ['commodity', 'Commodity'],
  ['stakeholder', 'Stakeholders'], ['disaggregation', 'Stakeholder Disaggregation'],
  ['year', 'Year'], ['achievement', 'Net Achievement'], ['target', 'Net annual target'],
  ['projectRaw', 'Project Name'],
];
const DIMS = [
  ['country', 'Country'], ['project', 'Project'], ['commodity', 'Commodity'],
  ['stakeholder', 'Stakeholder'], ['disaggregation', 'Disaggregation'],
  ['kpi', 'KPI'], ['year', 'Year'],
];

/* The KPI dropdown lists only the nine P2P programme KPIs, under the
   programme's own wording. Each is keyed on Indicator Id — stable even if a
   KPI is reworded in the workbook — and one entry can cover several ids
   (e.g. farmer and miner service access both roll up to producer services).
   Rows outside these nine are still counted in the panels; they are simply
   not offered as a filter choice. */
const KPI_GROUPS = [
  { label: '# of producers who report income improvement', ids: ['G050'] },
  { label: '# of direct jobs provided by targeted producers', ids: ['G051'] },
  { label: '# of workers under improved working conditions', ids: ['S1.5'] },
  { label: '# of producers supported with knowledge and skills', ids: ['G054'] },
  { label: '# of producers with new or improved access to services', ids: ['G055', 'S2.1', 'S2.2'] },
  { label: '# of service providers supported', ids: ['G041'] },
  { label: '# of targeted producers with access to new or improved markets', ids: ['G058'] },
  { label: '# (and type of impact) of private sector partners that have improved their sustainability policies/practices and/or implement inclusive business models', ids: ['S3.5'] },
  { label: '# of private sector supply chain companies Solidaridad has a running partnership with in support of the development and implementation of sustainable sourcing, traceability and payment for sustainability models', ids: ['S6.4', 'S6.5'] },
];
const KPI_BY_ID = new Map(KPI_GROUPS.flatMap((g) => g.ids.map((i) => [i, g.label])));

const S = { rows: [], missing: [], notes: [], source: '', sel: new Map(), tab: 'p1' };
let charts = {};

/* ── helpers ──────────────────────────────────────────────────────────── */
const $ = (id) => document.getElementById(id);
const nk = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = (s) => String(s).replace(/\W+/g, '_').toLowerCase().slice(0, 44);

/** Compact figure, as used on bubbles, datalabels and axes. */
function fmt(n) {
  if (n == null || !isFinite(n)) return '—';
  const a = Math.abs(n);
  if (a >= 1e6) return (n / 1e6).toFixed(a >= 1e7 ? 0 : 1) + 'M';
  if (a >= 1e3) return (n / 1e3).toFixed(a >= 1e4 ? 0 : 1) + 'K';
  return String(Math.round(n));
}
const full = (n) => (n == null || !isFinite(n) ? '—' : Math.round(n).toLocaleString());
const pctOf = (a, t) => (t > 0 ? Math.round((a / t) * 100) + '%' : '—');

function pN(v) {
  if (v == null || v === '') return 0;
  if (typeof v === 'number') return isFinite(v) ? v : 0;
  const n = parseFloat(String(v).replace(/[^0-9.,\-]/g, '').replace(/,(?=\d{3}\b)/g, '').replace(/,/g, '.'));
  return isFinite(n) ? n : 0;
}
const uniq = (v) => [...new Set(v.filter((x) => x != null && x !== ''))].sort((a, b) => {
  const x = +a, y = +b; return isFinite(x) && isFinite(y) ? x - y : String(a).localeCompare(String(b), undefined, { numeric: true });
});

/** Trim boilerplate off KPI names so they fit a small card title. */
function shortName(s) {
  return String(s)
    .replace(/\(kg\/ha\)\)/g, '(kg/ha)')
    .replace(/^#\s+targeted\s+/i, '# of targeted ')
    .replace(/^#\s+of\s+/i, '').replace(/^#\s+/, '')
    .replace(/\s+as a result of Solidaridad('s)? support/i, '')
    .replace(/\s+in a given year/i, '')
    .replace(/\s+supported (to provide services and inputs|by Solidaridad)/i, '')
    .replace(/\s+through Solidaridad's projects/i, '')
    .replace(/\s+/g, ' ').trim();
}

/* ── load & shape ─────────────────────────────────────────────────────── */
function splitProject(raw) {
  const s = String(raw ?? '').trim();
  if (!s) return { project: BLANK, country: BLANK };
  const m = s.match(/^(.*\S)\s*[-–—|]\s*([^-–—|]+)$/);
  if (!m) return { project: s, country: BLANK };
  const head = m[1].trim(), tail = m[2].trim();
  const looksCountry = /^[A-Za-zÀ-ÿ'’.\s]+$/.test(tail) && tail.split(/\s+/).length <= 3 && tail.length <= 28;
  return looksCountry && head ? { project: head, country: tail } : { project: s, country: BLANK };
}

/** Match sheet headers to expected columns: exact first, then substring. */
function mapCols(headers) {
  const map = {}, used = new Set(), n = headers.map(nk);
  COLS.forEach(([k, l]) => { const i = n.findIndex((h, j) => !used.has(j) && h === nk(l)); if (i >= 0) { map[k] = headers[i]; used.add(i); } });
  COLS.forEach(([k, l]) => { if (map[k]) return; const i = n.findIndex((h, j) => !used.has(j) && h.includes(nk(l))); if (i >= 0) { map[k] = headers[i]; used.add(i); } });
  return map;
}

function ingest(p) {
  const wb = XLSX.read(p.data, { type: p.b64 ? 'base64' : 'array' });
  const sh = wb.Sheets[wb.SheetNames[0]];
  if (!sh) throw new Error('The workbook contains no readable worksheet.');
  const raw = XLSX.utils.sheet_to_json(sh, { defval: null });
  if (!raw.length) throw new Error('The first worksheet has no data rows.');

  const map = mapCols(Object.keys(raw[0]));
  S.missing = COLS.filter(([k]) => !map[k]).map(([, l]) => l);
  const g = (r, k) => (map[k] ? r[map[k]] : undefined);
  const cl = (v) => { const s = String(v ?? '').trim(); return !s || /^(null|none)$/i.test(s) ? BLANK : s; };

  S.rows = raw.map((r) => {
    const { project, country } = splitProject(g(r, 'projectRaw'));
    const y = g(r, 'year');
    return {
      indicatorId: cl(g(r, 'indicatorId')), kpi: cl(g(r, 'kpi')), commodity: cl(g(r, 'commodity')),
      stakeholder: cl(g(r, 'stakeholder')), disaggregation: cl(g(r, 'disaggregation')),
      year: y == null || y === '' ? BLANK : String(Math.round(pN(y)) || y).trim(),
      achievement: pN(g(r, 'achievement')), target: pN(g(r, 'target')),
      projectFull: cl(g(r, 'projectRaw')), project, country,
    };
  });
  S.source = p.name;

  S.notes = [];
  if (S.missing.length) S.notes.push(`<b>Missing column(s):</b> ${esc(S.missing.join(', '))} — everything not depending on them still renders.`);
  if (p.via === 'embedded') S.notes.push('Reading the embedded copy of the workbook — a page opened from <code>file://</code> cannot fetch local files. Use <b>Load workbook</b>, or serve this folder over HTTP, to read an updated file.');
}

async function loadBytes() {
  try {
    const res = await fetch(WORKBOOK_URL, { cache: 'no-store' });
    if (res.ok) { const b = await res.arrayBuffer(); if (b.byteLength) return { data: b, name: WORKBOOK_URL, via: 'fetch' }; }
  } catch (_) { /* file:// blocks fetch — fall through to the embedded copy */ }
  if (window.EMBEDDED_WORKBOOK_B64) return { data: window.EMBEDDED_WORKBOOK_B64, b64: true, via: 'embedded', name: window.EMBEDDED_WORKBOOK_NAME || WORKBOOK_URL };
  return null;
}

/* ── filtering ────────────────────────────────────────────────────────── */
const initSel = () => { S.sel = new Map(DIMS.map(([k]) => [k, new Set()])); };

/* A row's value on a filter dimension. KPI is the one dimension where the
   filter value is the P2P grouping rather than the raw cell — rows outside
   the nine KPIs have no value and so match no KPI selection. */
const valOf = (r, dim) => (dim === 'kpi' ? KPI_BY_ID.get(r.indicatorId) : r[dim]);
/* Choices offered for a dimension: the fixed nine for KPI, otherwise whatever
   the workbook contains. */
const dimVals = (dim) => (dim === 'kpi' ? KPI_GROUPS.map((g) => g.label) : uniq(S.rows.map((r) => r[dim])));

function match(r, except) {
  for (const [k] of DIMS) {
    if (k === except) continue;
    const s = S.sel.get(k);
    if (s.size && !s.has(valOf(r, k))) return false;
  }
  return true;
}
const getFiltered = () => S.rows.filter((r) => match(r, null));
const reach = (dim) => new Set(S.rows.filter((r) => match(r, dim)).map((r) => valOf(r, dim)));

/* ── aggregation ──────────────────────────────────────────────────────── */
/** Totals of both metrics for rows grouped by one field. */
function agg(rows, field) {
  const m = new Map();
  for (const r of rows) {
    let g = m.get(r[field]); if (!g) m.set(r[field], (g = { key: r[field], ach: 0, tgt: 0, n: 0 }));
    g.ach += r.achievement; g.tgt += r.target; g.n++;
  }
  return [...m.values()];
}
const sortKey = (a, b) => String(a.key).localeCompare(String(b.key), undefined, { numeric: true });
const sortAch = (a, b) => b.ach - a.ach || sortKey(a, b);
const totals = (rows) => rows.reduce((a, r) => ({ ach: a.ach + r.achievement, tgt: a.tgt + r.target, n: a.n + 1 }), { ach: 0, tgt: 0, n: 0 });

/** KPIs belonging to a pillar, in the order the programme listed them. */
function pillarKpis(rows, pillar) {
  const byId = new Map();
  rows.forEach((r) => { if (!byId.has(r.indicatorId)) byId.set(r.indicatorId, r.kpi); });
  const assigned = new Set(PILLARS.flatMap((p) => p.ids || []));
  const ids = pillar.ids
    ? pillar.ids.filter((i) => byId.has(i))
    : [...byId.keys()].filter((i) => !assigned.has(i)).sort();
  return ids.map((id) => ({ id, kpi: byId.get(id) }));
}

/* ── Chart.js setup ───────────────────────────────────────────────────── */
Chart.defaults.font.family = "'Open Sans',sans-serif";
Chart.defaults.font.size = 10;
Chart.defaults.color = '#555';
Chart.register(ChartDataLabels);

const DL = (align) => ({
  display: (c) => c.dataset.data[c.dataIndex] > 0,
  anchor: 'end', align: 'end', offset: align === 'h' ? 2 : 1,
  font: { size: 7, weight: 'bold', family: "'Open Sans',sans-serif" },
  formatter: (v) => fmt(v),
  color: (c) => (c.dataset.backgroundColor === K ? '#111' : YD),
});

/* Options are built fresh per chart — Chart.js mutates them, and the variants
   below need to override callbacks without cloning (a JSON clone would drop
   every function). */
const legendCfg = () => ({ display: true, position: 'top', labels: { boxWidth: 10, font: { size: 8 }, padding: 6 } });
const tipCfg = () => ({ mode: 'index', intersect: false, callbacks: { label: (c) => ' ' + c.dataset.label + ': ' + full(c.raw) } });
const valAxis = () => ({ grid: { color: '#f2f2f2' }, ticks: { callback: (v) => fmt(v), maxTicksLimit: 5, font: { size: 9 } } });
const catAxis = () => ({ grid: { display: false }, ticks: { font: { size: 9 }, maxRotation: 0 } });

const optsV = () => ({
  responsive: true, maintainAspectRatio: false, layout: { padding: { top: 18 } },
  plugins: { legend: legendCfg(), tooltip: tipCfg(), datalabels: DL('v') },
  scales: { y: valAxis(), x: catAxis() },
});
const optsH = () => ({
  responsive: true, maintainAspectRatio: false, indexAxis: 'y', layout: { padding: { right: 40 } },
  plugins: { legend: legendCfg(), tooltip: tipCfg(), datalabels: DL('h') },
  scales: { x: valAxis(), y: catAxis() },
});
/** Rate charts: single yellow series, % axis and % labels. */
function optsPct(horiz) {
  const o = horiz ? optsH() : optsV();
  (horiz ? o.scales.x : o.scales.y).ticks.callback = (v) => v + '%';
  o.plugins.legend.display = false;
  o.plugins.tooltip = { callbacks: { label: (c) => ' Achievement rate: ' + c.raw + '%' } };
  o.plugins.datalabels = { ...DL(horiz ? 'h' : 'v'), formatter: (v) => v + '%', color: YD };
  return o;
}

/** Target + achievement datasets, target omitted when nothing is targeted. */
function pairDs(tgt, ach) {
  const ds = [];
  if (tgt.some((v) => v > 0)) ds.push({ label: 'Net Annual Target', data: tgt, backgroundColor: K, borderRadius: 2 });
  ds.push({ label: 'Net Achievement', data: ach, backgroundColor: Y, borderRadius: 2 });
  return ds;
}

const dc = (id) => { if (charts[id]) { charts[id].destroy(); delete charts[id]; } };
function mkChart(id, cfg) { dc(id); const el = $(id); if (el) charts[id] = new Chart(el, cfg); }

/** Chart card: title + badge + hover PNG button + fixed-height canvas. */
function card(host, title, badge, h, id, build) {
  const w = document.createElement('div');
  w.className = 'cc';
  w.innerHTML = `<div class="cct"><span class="cct-main">${esc(title)}</span><span class="cct-badge">${esc(badge)}</span></div>
    <button class="cc-dl" onclick="downloadChart(this)" title="Download chart">&#8595; PNG</button>
    <div class="${h}"><canvas id="${id}"></canvas></div>`;
  host.appendChild(w);
  setTimeout(() => build(id), 0);
}

/** Compose the canvas onto a white sheet with its title, then download. */
function downloadChart(btn) {
  const cc = btn.closest('.cc'), cv = cc.querySelector('canvas');
  if (!cv) return;
  const title = (cc.querySelector('.cct-main') || {}).textContent || 'chart';
  const badge = (cc.querySelector('.cct-badge') || {}).textContent || '';
  const pad = 28, th = 32;
  const out = document.createElement('canvas');
  out.width = cv.width + pad * 2; out.height = cv.height + th + pad;
  const x = out.getContext('2d');
  x.fillStyle = '#fff'; x.fillRect(0, 0, out.width, out.height);
  x.fillStyle = '#222'; x.font = "bold 11px 'Open Sans',sans-serif";
  x.fillText(title.trim() + (badge ? '  —  ' + badge.trim() : ''), pad, 18);
  x.drawImage(cv, pad, th);
  const a = document.createElement('a');
  a.href = out.toDataURL('image/png');
  a.download = (title.trim() + '_' + badge.trim()).replace(/[^a-z0-9_\- ]/gi, '_').slice(0, 60) + '.png';
  a.click();
}

/* ── reusable chart builders ──────────────────────────────────────────── */
/** Grouped target/achievement bars over a dimension. */
function barsBy(rows, field, id, { horiz = false, limit = 12, order = 'key' } = {}) {
  let gs = agg(rows, field).sort(order === 'ach' ? sortAch : sortKey);
  if (gs.length > limit) gs = gs.sort(sortAch).slice(0, limit).sort(order === 'ach' ? sortAch : sortKey);
  if (!gs.length) return empty(id);
  mkChart(id, {
    type: 'bar',
    data: { labels: gs.map((g) => trimLabel(g.key)), datasets: pairDs(gs.map((g) => g.tgt), gs.map((g) => g.ach)) },
    options: horiz ? optsH() : optsV(),
  });
}

/** Single-series achievement-rate bars. */
function rateBy(rows, field, id, { horiz = false, limit = 12 } = {}) {
  const gs = agg(rows, field).filter((g) => g.tgt > 0).sort(sortAch).slice(0, limit);
  if (!gs.length) return empty(id);
  mkChart(id, {
    type: 'bar',
    data: {
      labels: gs.map((g) => trimLabel(g.key)),
      datasets: [{ label: 'Achievement rate', data: gs.map((g) => Math.round((g.ach / g.tgt) * 100)), backgroundColor: Y, borderRadius: 2 }],
    },
    options: optsPct(horiz),
  });
}

/** Achievement stacked by a second dimension across years. */
function stackBy(rows, outer, stackField, id) {
  const cats = uniq(rows.map((r) => r[outer]));
  const keys = agg(rows, stackField).sort(sortAch).slice(0, 8).map((g) => g.key);
  if (!cats.length || !keys.length) return empty(id);
  const shades = ['#FFC800', '#111111', '#2e7d32', '#1565c0', '#e65100', '#7b1fa2', '#00838f', '#c2185b'];
  const o = optsV();
  o.scales.x.stacked = true; o.scales.y.stacked = true;
  o.plugins.datalabels = { display: false };   // stacked segments are too small to label
  o.plugins.legend.labels.font.size = 9;
  mkChart(id, {
    type: 'bar',
    data: {
      labels: cats.map(trimLabel),
      datasets: keys.map((k, i) => ({
        label: trimLabel(k), backgroundColor: shades[i % shades.length], borderRadius: 2, stack: 's',
        data: cats.map((c) => rows.filter((r) => r[outer] === c && r[stackField] === k).reduce((a, r) => a + r.achievement, 0)),
      })),
    },
    options: o,
  });
}

const trimLabel = (s) => { const t = String(s); return t.length <= 26 ? t : t.slice(0, 25) + '…'; };
function empty(id) {
  const cv = $(id); if (!cv) return;
  const box = cv.parentElement;
  box.innerHTML = '<div class="cc-empty">No data</div>';
}

/* ── panel rendering ──────────────────────────────────────────────────── */
function bubble(host, label, value, sub, pct, color) {
  const d = document.createElement('div');
  d.className = 'bubble';
  d.style.setProperty('--bc', color);
  d.innerHTML = `<div class="bubble-val">${esc(fmt(value))}</div>
    <div class="bubble-lbl">${esc(label)}</div>
    <div class="bubble-pct">${esc(pct)} of target</div>
    <div class="bubble-sub">${esc(sub)}</div>`;
  host.appendChild(d);
}

/** A pillar tab: bubble strip + per-KPI "by year" and "by country" charts. */
function renderPillar(p, rows) {
  const bub = $(`bub-${p.key}`), chr = $(`chr-${p.key}`);
  bub.innerHTML = ''; chr.innerHTML = '';
  const kpis = pillarKpis(rows, p);
  if (!kpis.length) {
    chr.innerHTML = '<div class="cc"><div class="cc-empty" style="height:80px">No KPIs in this pillar for the current filters</div></div>';
    return;
  }
  kpis.forEach(({ id, kpi }) => {
    const sub = rows.filter((r) => r.indicatorId === id);
    const t = totals(sub);
    bubble(bub, shortName(kpi), t.ach, `${id} · ${full(t.n)} obs`, pctOf(t.ach, t.tgt), p.color);
  });
  kpis.forEach(({ id, kpi }) => {
    const sub = rows.filter((r) => r.indicatorId === id);
    card(chr, shortName(kpi), 'By Year', 'ch170', `c-${p.key}-y-${uid(id)}`, (cid) => barsBy(sub, 'year', cid));
    card(chr, shortName(kpi), 'By Country', 'ch170', `c-${p.key}-c-${uid(id)}`, (cid) => barsBy(sub, 'country', cid));
  });
}

/** Countries & portfolio tab. */
function renderGeo(rows) {
  const cards = $('geo-cards'), g1 = $('geo-charts'), g2 = $('geo-charts2');
  cards.innerHTML = ''; g1.innerHTML = ''; g2.innerHTML = '';

  agg(rows, 'country').sort(sortAch).forEach((c) => {
    const sub = rows.filter((r) => r.country === c.key);
    const row = (l, v, acc) => `<div class="out-stat"><span class="out-stat-lbl">${l}</span><span class="out-stat-val${acc ? ' accent' : ''}">${v}</span></div>`;
    const d = document.createElement('div');
    d.className = 'out-card';
    d.innerHTML = `<div class="out-card-top"><div class="out-card-name">${esc(c.key)}</div></div>`
      + row('Net Achievement', full(c.ach))
      + row('Net Annual Target', full(c.tgt))
      + row('Achievement Rate', pctOf(c.ach, c.tgt), true)
      + row('Achievement Gap', full(c.ach - c.tgt))
      + row('KPIs Reported', full(new Set(sub.map((r) => r.kpi)).size))
      + row('Projects', full(new Set(sub.map((r) => r.project)).size))
      + row('Commodities', full(new Set(sub.map((r) => r.commodity)).size))
      + row('Observations', full(c.n));
    cards.appendChild(d);
  });

  card(g1, 'Portfolio performance', 'By Year', 'ch190', 'g-year', (id) => barsBy(rows, 'year', id));
  card(g1, 'Net Achievement vs Target', 'By Country', 'ch190', 'g-country', (id) => barsBy(rows, 'country', id));
  card(g1, 'Net Achievement vs Target', 'By Project', 'ch190', 'g-project', (id) => barsBy(rows, 'project', id, { horiz: true, limit: 8, order: 'ach' }));
  card(g1, 'Net Achievement vs Target', 'By Commodity', 'ch190', 'g-commodity', (id) => barsBy(rows, 'commodity', id));

  card(g2, 'Achievement rate', 'By Country', 'ch190', 'g-rc', (id) => rateBy(rows, 'country', id));
  card(g2, 'Achievement rate', 'By Project', 'ch190', 'g-rp', (id) => rateBy(rows, 'project', id, { horiz: true, limit: 8 }));
  card(g2, 'Achievement rate', 'By Commodity', 'ch190', 'g-rm', (id) => rateBy(rows, 'commodity', id));
  card(g2, 'Top KPIs by Net Achievement', 'All Pillars', 'ch190', 'g-kpi', (id) => barsBy(rows, 'kpi', id, { horiz: true, limit: 8, order: 'ach' }));
}

/** Stakeholder tab. */
function renderStake(rows) {
  const bub = $('stk-bubbles'), g1 = $('stk-charts'), g2 = $('stk-charts2');
  bub.innerHTML = ''; g1.innerHTML = ''; g2.innerHTML = '';

  agg(rows, 'stakeholder').sort(sortAch).forEach((s) => {
    const sub = rows.filter((r) => r.stakeholder === s.key);
    bubble(bub, s.key, s.ach, `${new Set(sub.map((r) => r.kpi)).size} KPIs · ${full(s.n)} obs`, pctOf(s.ach, s.tgt), '#7b1fa2');
  });

  card(g1, 'Net Achievement vs Target', 'By Stakeholder', 'ch190', 's-grp', (id) => barsBy(rows, 'stakeholder', id, { order: 'ach' }));
  card(g1, 'Net Achievement vs Target', 'By Disaggregation', 'ch190', 's-dis', (id) => barsBy(rows, 'disaggregation', id, { horiz: true, limit: 10, order: 'ach' }));
  card(g1, 'Achievement rate', 'By Stakeholder', 'ch190', 's-rate', (id) => rateBy(rows, 'stakeholder', id));
  card(g1, 'Achievement rate', 'By Disaggregation', 'ch190', 's-rdis', (id) => rateBy(rows, 'disaggregation', id, { horiz: true, limit: 10 }));

  card(g2, 'Net Achievement by year', 'Stacked by Stakeholder', 'ch220', 's-stk-year', (id) => stackBy(rows, 'year', 'stakeholder', id));
  card(g2, 'Net Achievement by stakeholder', 'Stacked by Disaggregation', 'ch220', 's-stk-dis', (id) => stackBy(rows, 'stakeholder', 'disaggregation', id));
}

/* ── panels & tabs ────────────────────────────────────────────────────── */
function buildPanels() {
  $('tab-bar').innerHTML = TABS.map((t, i) =>
    `<button class="tab-btn${i === 0 ? ' active' : ''}" id="tb-${t.key}" style="--tc:${t.color}" onclick="showTab('${t.key}')">${esc(t.label)}</button>`).join('');

  const legend = `<div class="leg-row">
      <div class="leg"><div class="ld" style="background:${K}"></div>Net Annual Target</div>
      <div class="leg"><div class="ld" style="background:${Y}"></div>Net Achievement</div></div>`;
  const head = (c, ink, name, tag) => `<div class="s-hdr"><div class="s-hdr-bar" style="background:${c}"></div>
      <div class="s-hdr-text">${esc(name)}</div>
      <div class="s-hdr-tag" style="background:${c};color:${ink}">${esc(tag)}</div></div>`;

  $('panels').innerHTML =
    PILLARS.map((p, i) => `<div class="tab-panel${i === 0 ? ' active' : ''}" id="pnl-${p.key}">
        ${head(p.color, p.ink, p.name, p.tag)}${legend}
        <div class="g6" id="bub-${p.key}"></div>
        <div class="g4" id="chr-${p.key}"></div></div>`).join('')
    + `<div class="tab-panel" id="pnl-geo">
        ${head('#e65100', '#fff', 'Countries & Portfolio', 'Country · Project · Commodity')}${legend}
        <div class="out-cards" id="geo-cards"></div>
        <div class="out-grp-hdr">Delivery against target</div>
        <div class="g4" id="geo-charts"></div>
        <div class="out-grp-hdr">Achievement rate &amp; leading KPIs</div>
        <div class="g4" id="geo-charts2"></div></div>`
    + `<div class="tab-panel" id="pnl-stake">
        ${head('#7b1fa2', '#fff', 'Stakeholders', 'Groups · Disaggregation')}${legend}
        <div class="g6" id="stk-bubbles"></div>
        <div class="g4" id="stk-charts"></div>
        <div class="out-grp-hdr" style="color:#7b1fa2;border-color:#7b1fa2">Composition</div>
        <div class="g2" id="stk-charts2"></div></div>`;
}

function showTab(key) {
  S.tab = key;
  document.querySelectorAll('.tab-btn').forEach((b) => b.classList.toggle('active', b.id === 'tb-' + key));
  document.querySelectorAll('.tab-panel').forEach((p) => p.classList.toggle('active', p.id === 'pnl-' + key));
  renderTab();
}

/** Draw only the visible tab — 24 KPIs × 2 charts is too many canvases at once. */
function renderTab() {
  const rows = getFiltered();
  const p = PILLARS.find((x) => x.key === S.tab);
  if (p) renderPillar(p, rows);
  else if (S.tab === 'geo') renderGeo(rows);
  else if (S.tab === 'stake') renderStake(rows);
}

/* ── filter bar ───────────────────────────────────────────────────────── */
function buildFilters() {
  const html = DIMS.map(([k, l]) => `<span class="fl">${esc(l)}</span>
    <div class="ms-wrap" id="ms-${k}">
      <button class="ms-btn" id="mbtn-${k}" type="button" onclick="toggleMS('${k}')">All ${esc(l)}s</button>
      <div class="ms-dd" id="mdd-${k}">
        <input class="ms-dd-search" placeholder="Search…" autocomplete="off" oninput="filterMS('${k}',this.value)">
        <div class="ms-dd-actions"><button onclick="selAllMS('${k}')">All</button><button onclick="clrMS('${k}')">None</button></div>
        <div id="mopts-${k}"></div>
      </div>
    </div>`).join('');
  $('fbar').insertAdjacentHTML('afterbegin', html);
  DIMS.forEach(([k]) => renderOpts(k));
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.ms-wrap')) closeAllMS();
  });
}

function renderOpts(dim) {
  const host = $('mopts-' + dim), sel = S.sel.get(dim), ok = reach(dim);
  host.innerHTML = dimVals(dim).map((v) => `
    <label class="ms-opt${!ok.has(v) && !sel.has(v) ? ' off' : ''}" data-v="${esc(String(v).toLowerCase())}" title="${esc(v)}">
      <input type="checkbox" value="${esc(v)}" ${sel.has(v) ? 'checked' : ''} onchange="togSel('${dim}',this.value,this.checked)">${esc(v)}</label>`).join('');
}

function filterMS(dim, q) {
  const ql = q.toLowerCase();
  document.querySelectorAll('#mopts-' + dim + ' .ms-opt').forEach((el) => {
    el.style.display = el.dataset.v.includes(ql) ? 'flex' : 'none';
  });
}
function toggleMS(dim) {
  const dd = $('mdd-' + dim), was = dd.classList.contains('open');
  closeAllMS(); if (!was) dd.classList.add('open');
}
const closeAllMS = () => document.querySelectorAll('.ms-dd').forEach((d) => d.classList.remove('open'));

function togSel(dim, v, on) {
  const s = S.sel.get(dim);
  on ? s.add(v) : s.delete(v);
  applyFilters();
}
function selAllMS(dim) {        // tick everything — same result set as no restriction
  dimVals(dim).forEach((v) => S.sel.get(dim).add(v));
  renderOpts(dim);
  applyFilters();
}
function clrMS(dim) {           // clear the restriction
  S.sel.get(dim).clear();
  renderOpts(dim);
  applyFilters();
}
function resetFilters() { initSel(); DIMS.forEach(([k]) => renderOpts(k)); applyFilters(); }

function updChrome(rows) {
  DIMS.forEach(([k, l]) => {
    const s = S.sel.get(k), b = $('mbtn-' + k);
    b.textContent = s.size === 0 ? `All ${l}s` : s.size === 1 ? [...s][0] : `${s.size} selected`;
    b.classList.toggle('on', s.size > 0);
  });
  // Values go in data-attributes, never interpolated into inline JS.
  const chips = DIMS.flatMap(([k, l]) => [...S.sel.get(k)].map((v) =>
    `<span class="chip"><b>${esc(l)}</b>${esc(v)}<button title="Remove" data-k="${esc(k)}" data-v="${esc(v)}">×</button></span>`));
  $('chips').innerHTML = chips.join('');
  $('chips').querySelectorAll('button').forEach((b) => {
    b.onclick = () => { S.sel.get(b.dataset.k).delete(b.dataset.v); renderOpts(b.dataset.k); applyFilters(); };
  });
  const t = totals(rows);
  $('rec-count').textContent = `${full(rows.length)} of ${full(S.rows.length)} records · ${full(t.ach)} vs ${full(t.tgt)} · ${pctOf(t.ach, t.tgt)}`;
  const act = DIMS.filter(([k]) => S.sel.get(k).size).map(([k, l]) => `${l}: ${[...S.sel.get(k)].join(', ')}`);
  $('print-context').textContent = 'Filters — ' + (act.join('  ·  ') || 'none (all records)');
}

function applyFilters() {
  const rows = getFiltered();
  updChrome(rows);
  // Refresh availability marks on closed dropdowns only — never yank the list
  // out from under a dropdown the user is currently working in.
  DIMS.forEach(([k]) => { if (!$('mdd-' + k).classList.contains('open')) renderOpts(k); });
  renderTab();
}

/* ── export & notices ─────────────────────────────────────────────────── */
const cell = (v) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
function exportCSV() {
  const head = ['Indicator Id', 'KPI Name', 'Commodity', 'Stakeholders', 'Stakeholder Disaggregation', 'Year',
    'Project Name (full)', 'Project', 'Country', 'Net Achievement', 'Net annual target', 'Achievement Rate (%)', 'Achievement Gap'];
  const body = getFiltered().map((r) => [r.indicatorId, r.kpi, r.commodity, r.stakeholder, r.disaggregation, r.year,
    r.projectFull, r.project, r.country, r.achievement, r.target,
    r.target ? ((r.achievement / r.target) * 100).toFixed(2) : '', r.achievement - r.target].map(cell).join(','));
  const blob = new Blob(['\uFEFF' + [head.join(','), ...body].join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'p2p-filtered-data.csv';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

function notice(list, isErr) {
  const n = $('notice');
  n.classList.toggle('show', !!list.length);
  n.classList.toggle('err', !!isErr);
  $('notice-msg').innerHTML = list.map((t) => `<div>${t}</div>`).join('');
}

/* ── boot ─────────────────────────────────────────────────────────────── */
function start() {
  initSel();
  Object.keys(charts).forEach(dc);
  document.querySelectorAll('.ms-wrap').forEach((e) => e.remove());
  document.querySelectorAll('#fbar .fl').forEach((e) => e.remove());
  buildFilters();
  buildPanels();
  notice(S.notes, false);
  $('src-note').textContent = `${S.source} · ${full(S.rows.length)} records`;
  showTab(S.tab in { p1: 1, p2: 1, p3: 1, other: 1, geo: 1, stake: 1 } ? S.tab : 'p1');
  applyFilters();
  $('loader').classList.add('gone');
}

async function init() {
  document.getElementById('file-input').onchange = async (e) => {
    const f = e.target.files && e.target.files[0]; if (!f) return;
    try { ingest({ data: await f.arrayBuffer(), name: f.name, via: 'upload' }); start(); }
    catch (err) { notice([`<b>Could not read that file.</b> ${esc(err.message || err)}`], true); }
  };
  try {
    const p = await loadBytes();
    if (!p) throw new Error(`“${WORKBOOK_URL}” was not found next to this page and no embedded copy is available.`);
    ingest(p);
    start();
  } catch (err) {
    console.error(err);
    $('loader').classList.add('gone');
    notice([`<b>The workbook could not be loaded.</b> ${esc(err.message || err)}<br>
      Use <b>Load workbook</b> in the filter bar, or serve this folder over HTTP (<code>python -m http.server 8080</code>) and reload.`], true);
  }
}

document.addEventListener('DOMContentLoaded', init);
