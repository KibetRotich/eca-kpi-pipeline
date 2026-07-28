/*
 * Headless render check for Cool_Farm_Dashboard.html.
 *
 * No browser in this environment, so this stubs just enough DOM + Chart.js to
 * actually EXECUTE the dashboard's inline script, boot it, and render every
 * section. Catches runtime faults a `node --check` parse cannot: bad chart args,
 * missing helpers, null element access. Modelled on pipeline/vsla/_render_check.js.
 *
 * It also asserts the dataviz rules that matter for this dashboard:
 *   - the validated categorical palette is the one actually used
 *   - stacked segments carry a 2px surface gap; bars have rounded data-ends
 *   - single-series charts hide the legend, multi-series charts show it
 *   - no chart declares two y-scales (the dual-axis anti-pattern)
 *   - filtering actually changes the active row set
 *
 * Usage: node _render_check.js [path/to/Cool_Farm_Dashboard.html]
 */
const fs = require('fs')
const path = require('path')

const file = process.argv[2] || path.join(__dirname, '..', '..', 'public', 'Cool_Farm_Dashboard.html')
const html = fs.readFileSync(file, 'utf8')
const scripts = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1])
const src = scripts.sort((a, b) => b.length - a.length)[0]

const byId = new Map()
const charts = []

function mkEl(tag = 'div', id = null) {
  const self = {
    tagName: tag, id, className: '', dataset: {}, style: {}, value: '',
    children: [], _html: '', textContent: '',
    classList: { toggle() {}, add() {}, remove() {}, contains: () => false },
    appendChild(c) { self.children.push(c); return c },
    set innerHTML(v) {
      self._html = String(v)
      // Registering ids found in assigned markup is what makes a later
      // getElementById('rs_stack') resolve to a canvas.
      for (const m of self._html.matchAll(/id="([^"]+)"/g)) {
        if (!byId.has(m[1])) byId.set(m[1], mkEl('canvas', m[1]))
      }
      self.firstChild = mkEl('section', 'sec')
    },
    get innerHTML() { return self._html },
    firstChild: null,
    closest: () => mkEl('div'),
    querySelector: () => mkEl('div'),
    querySelectorAll: () => [],
    getContext: () => ({}),
  }
  return self
}

for (const id of ['nav', 'filters', 'sections', 'footer']) byId.set(id, mkEl('div', id))

const getEl = (id) => {
  if (!byId.has(id)) byId.set(id, mkEl('canvas', id))
  return byId.get(id)
}
global.document = {
  getElementById: getEl,
  querySelector: (sel) => (sel.startsWith('#') ? getEl(sel.slice(1)) : mkEl('div')),
  querySelectorAll: () => [],
  createElement: (t) => mkEl(t),
}
global.window = { scrollTo() {} }
global.Chart = class {
  constructor(cv, cfg) { this.cv = cv; this.cfg = cfg; charts.push({ id: cv && cv.id, cfg }) }
  destroy() {}
}
global.Chart.defaults = { font: {}, color: '', maintainAspectRatio: true, animation: true }

let scope
try {
  scope = new Function(`${src}\n; return {SECTIONS, render, state, recompute, CAT,
    get IDX(){return IDX}, F, FILTERS, cat, buildFilters};`)()
} catch (e) {
  console.error('BOOT FAILED:', e.message, '\n', e.stack.split('\n').slice(0, 4).join('\n'))
  process.exit(1)
}

let failures = 0
const check = (name, cond, detail = '') => {
  console.log(`  ${cond ? '[ok]  ' : '[FAIL]'} ${name}${detail ? ' — ' + detail : ''}`)
  if (!cond) failures++
}

console.log(`booted OK · ${scope.SECTIONS.length} sections · ${scope.F.n} farms · ${scope.IDX.length} active\n`)

// ── render every section ─────────────────────────────────────────────────────
const perSection = {}
for (const [id] of scope.SECTIONS) {
  charts.length = 0
  try {
    // drive the real nav path: set current section then render
    const fn = scope.SECTIONS.find((s) => s[0] === id)[2]
    fn(mkEl('section', `sec_${id}`))
    perSection[id] = charts.slice()
    console.log(`  [ok]   ${id.padEnd(13)} ${charts.length} chart(s)`)
  } catch (e) {
    failures++
    console.log(`  [FAIL] ${id.padEnd(13)} ${e.message}`)
    console.log(e.stack.split(String.fromCharCode(10)).slice(1, 4)
      .map((l) => '           ' + l.trim()).join(String.fromCharCode(10)))
  }
}

const all = Object.values(perSection).flat()
console.log(`\ntotal charts: ${all.length}`)

// ── dataviz rule assertions ──────────────────────────────────────────────────
console.log('\nPalette & marks:')
const VALIDATED = ['#3E9B45', '#3A7CC4', '#C89600', '#8E5BB5', '#C62828', '#E2711D']
check('validated palette present in source', VALIDATED.every((c) => src.includes(c)))
check('old grey-heavy palette not used for series',
  !src.includes("'#888888','#c79a00'"), 'legacy palette absent')

const colorsUsed = new Set()
for (const c of all) {
  for (const d of c.cfg.data.datasets || []) {
    const bg = d.backgroundColor
    for (const v of Array.isArray(bg) ? bg : [bg]) {
      if (typeof v === 'string' && v.startsWith('#')) colorsUsed.add(v.toUpperCase())
    }
  }
}
const strays = [...colorsUsed].filter(
  (c) => !VALIDATED.includes(c) && !['#CCCCCC'].includes(c) &&
         !['#FBE9E7', '#F3BFB5', '#E8907F', '#D8604F', '#C62828'].includes(c))
check('no series colour outside the validated palette + ramp', strays.length === 0, strays.join(', ') || 'none')

const stacked = all.filter((c) => c.cfg.options?.scales?.y?.stacked)
check('stacked charts exist (residue flagship)', stacked.length >= 1, `${stacked.length} found`)
for (const c of stacked) {
  const ds = c.cfg.data.datasets
  check(`${c.id}: 2px surface gap between segments`,
    ds.every((d) => d.borderWidth === 2 && d.borderColor === '#fff'))
  check(`${c.id}: ${ds.length} series legend shown`, c.cfg.options.plugins.legend.display !== false)
}

console.log('\nLegend & axis rules:')
let legendBad = 0, dualAxis = 0
for (const c of all) {
  const n = (c.cfg.data.datasets || []).length
  const lg = c.cfg.options?.plugins?.legend
  if (n === 1 && lg && lg.display !== false && c.cfg.type !== 'doughnut') legendBad++
  if (n >= 2 && lg && lg.display === false && c.cfg.type !== 'doughnut') legendBad++
  const sc = c.cfg.options?.scales || {}
  if (Object.keys(sc).filter((k) => k.startsWith('y') || k === 'y1').length > 1) dualAxis++
}
check('legend shown iff >= 2 series', legendBad === 0, `${legendBad} violation(s)`)
check('no dual-axis chart', dualAxis === 0, `${dualAxis} found`)

const rounded = all.filter((c) => c.cfg.type === 'bar')
check('bar charts use 4px rounded data-ends',
  rounded.every((c) => c.cfg.data.datasets.every((d) => d.borderRadius === 4)),
  `${rounded.length} bar chart(s)`)

console.log('\nFiltering:')
const before = scope.IDX.length
const distLevels = scope.F.cats.district.filter(Boolean)
scope.state.district = distLevels[0]
scope.recompute()
const after = scope.IDX.length
check('district filter narrows the selection', after > 0 && after < before,
  `${before} -> ${after} (${distLevels[0]})`)
charts.length = 0
try {
  scope.SECTIONS.find((s) => s[0] === 'residues')[2](mkEl('section'))
  check('flagship re-renders under a filter', charts.length >= 3, `${charts.length} chart(s)`)
} catch (e) { failures++; console.log(`  [FAIL] filtered residues — ${e.message}`) }
scope.state.district = ''
scope.recompute()
check('reset restores full cohort', scope.IDX.length === before, `${scope.IDX.length}`)

console.log('\nDisclosure control:')
check('no raw latitude/longitude in payload', !/"latitude":/.test(html) && !/"longitude":/.test(html))
for (const banned of ['farmer_first_name', 'phone_number', 'village_raw', 'subcounty_raw', 'instanceName']) {
  check(`no ${banned}`, !html.includes(banned))
}

console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL CHECKS PASS')
process.exit(failures ? 1 : 0)
