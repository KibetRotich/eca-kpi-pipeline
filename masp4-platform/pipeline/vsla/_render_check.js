/*
 * Headless render check for VSLA_Performance_Dashboard.html.
 *
 * No browser/playwright in this environment, so this stubs just enough DOM +
 * Chart.js to actually EXECUTE the dashboard's inline script, boot it, and render
 * every tab. Catches runtime faults a `node --check` parse cannot: null .closest(),
 * missing helpers, bad chart args. Also captures each chart config so the new
 * Performance Ratios tab can be asserted on (series counts, diverging colours,
 * null handling).
 *
 * Usage: node _render_check.js ../../public/VSLA_Performance_Dashboard.html
 */
const fs = require('fs')
const path = require('path')

const file = process.argv[2] || path.join(__dirname, '..', '..', 'public', 'VSLA_Performance_Dashboard.html')
const html = fs.readFileSync(file, 'utf8')
const scripts = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1])
const src = scripts.sort((a, b) => b.length - a.length)[0]

// ── minimal DOM ──────────────────────────────────────────────────────────────
const byId = new Map()
const charts = []

function mkEl(tag = 'div', id = null) {
  const self = {
    tagName: tag,
    id,
    className: '',
    dataset: {},
    style: {},
    value: '', // rQual reads $("#q_search").value.trim() on the filter inputs
    children: [],
    _html: '',
    textContent: '',
    classList: { toggle() {}, add() {}, remove() {}, contains: () => false },
    appendChild(c) { self.children.push(c); return c },
    // registering ids found in assigned markup is what makes $("#rt_mat") resolve
    set innerHTML(v) {
      self._html = String(v)
      for (const m of self._html.matchAll(/id="([^"]+)"/g)) if (!byId.has(m[1])) byId.set(m[1], mkEl('canvas', m[1]))
    },
    get innerHTML() { return self._html },
    closest() { return mkEl('div') },
    querySelector(sel) { return sel === '.note' ? mkEl('div') : mkEl('div') },
    querySelectorAll() { return [] },
    getContext: () => ({}),
  }
  return self
}

for (const id of ['nav', 'main', 'filters', 'secwrap', 'hdrsub', 'ov', 'ovbody']) byId.set(id, mkEl('div', id))

global.document = {
  querySelector(sel) {
    if (sel.startsWith('#')) {
      const id = sel.slice(1)
      if (!byId.has(id)) byId.set(id, mkEl('canvas', id))
      return byId.get(id)
    }
    return mkEl('div')
  },
  querySelectorAll: () => [],
  createElement: (t) => mkEl(t),
}
global.window = { scrollTo() {} }
global.Chart = class {
  constructor(cv, cfg) { this.cv = cv; this.cfg = cfg; charts.push({ id: cv && cv.id, cfg }) }
  destroy() {}
}

// ── execute ──────────────────────────────────────────────────────────────────
let scope
try {
  scope = new Function(`${src}\n; return {SECTIONS, show, GROUPS, rval, filtered};`)()
} catch (e) {
  console.error('BOOT FAILED:', e.message)
  process.exit(1)
}

console.log(`booted OK · ${scope.GROUPS.length} groups · ${scope.SECTIONS.length} sections`)

let failures = 0
for (const s of scope.SECTIONS) {
  charts.length = 0
  try {
    scope.show(s.id)
    console.log(`  [ok]   ${s.id.padEnd(12)} ${charts.length} chart(s)`)
  } catch (e) {
    failures++
    console.log(`  [FAIL] ${s.id.padEnd(12)} ${e.message}`)
  }
}

// ── assertions on the new tab ────────────────────────────────────────────────
charts.length = 0
scope.show('ratios')
const get = (id) => charts.find((c) => c.id === id)
const check = (name, cond, detail = '') => {
  console.log(`  ${cond ? '[ok]  ' : '[FAIL]'} ${name}${detail ? ' — ' + detail : ''}`)
  if (!cond) failures++
}
console.log('\nPerformance Ratios tab:')
check('5 charts rendered', charts.length === 5, `${charts.length} found`)

const mat = get('rt_mat')
const cols = mat ? mat.cfg.data.datasets[0].backgroundColor : []
const uniq = [...new Set(cols)]
check('maturity bars coloured by sign', Array.isArray(cols) && uniq.length >= 2, `hues: ${uniq.join(', ')}`)
check('no green/red sign pair', !uniq.includes('#2e7d32') && !uniq.includes('#c62828'), `hues: ${uniq.join(', ')}`)
const matVals = mat ? mat.cfg.data.datasets[0].data : []
check('maturity ranked descending', matVals.every((v, i) => i === 0 || matVals[i - 1] >= v), `n=${matVals.length}`)
check('zero baseline present', mat && mat.cfg.options.scales.x.beginAtZero === true)

const incl = get('rt_incl')
check('inclusion chart has 2 series', incl && incl.cfg.data.datasets.length === 2)
check('inclusion legend shown', incl && incl.cfg.options.plugins.legend !== false && !!incl.cfg.options.plugins.legend.labels)
const inclCols = incl ? incl.cfg.data.datasets.map((d) => d.backgroundColor) : []
check('inclusion hues are the validated pair', inclCols.join(',') === '#2e7d32,#1565c0', inclCols.join(', '))

const single = ['rt_savmob', 'rt_swf']
for (const id of single) {
  const c = get(id)
  check(`${id}: single series, legend off`, c && c.cfg.data.datasets.length === 1 && c.cfg.options.plugins.legend.display === false)
}
const growth = get('rt_growth')
check('growth axis is percent', growth && typeof growth.cfg.options.scales.x.ticks.callback === 'function')

console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL CHECKS PASS')
process.exit(failures ? 1 : 0)
