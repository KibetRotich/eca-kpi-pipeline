/**
 * lib/analytics/stats.ts — small, dependency-free inferential statistics.
 *
 * Hand-rolled (no `simple-statistics`) on purpose: the VSLA dataset is tiny
 * (n≈26), the three tests below are self-contained, and avoiding a new npm
 * dependency keeps `npm run build` clean. Every function is pure and never
 * throws on degenerate input — callers get NaN-free numbers or a null-ish
 * result they can guard on.
 *
 * ⚠️ All results are directional at this sample size. The API route attaches a
 * human-readable `note` to each; do not read the raw p-values as confirmatory.
 */

// ── normal distribution helpers ──────────────────────────────────────────────

/** Abramowitz & Stegun 7.1.26 error-function approximation (|err| < 1.5e-7). */
function erf(x: number): number {
  const sign = x < 0 ? -1 : 1
  const ax = Math.abs(x)
  const t = 1 / (1 + 0.3275911 * ax)
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t +
      0.254829592) *
      t *
      Math.exp(-ax * ax)
  return sign * y
}

/** Standard-normal CDF. */
function normalCdf(z: number): number {
  return 0.5 * (1 + erf(z / Math.SQRT2))
}

/** Two-sided p-value from a z-score. */
function twoSidedP(z: number): number {
  return 2 * (1 - normalCdf(Math.abs(z)))
}

// ── ranking (average ranks for ties) ────────────────────────────────────────

function rankAverage(values: number[]): number[] {
  const idx = values.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v)
  const ranks = new Array<number>(values.length)
  let i = 0
  while (i < idx.length) {
    let j = i
    while (j + 1 < idx.length && idx[j + 1].v === idx[i].v) j++
    // ranks are 1-based; tied group shares the average rank
    const avg = (i + j) / 2 + 1
    for (let k = i; k <= j; k++) ranks[idx[k].i] = avg
    i = j + 1
  }
  return ranks
}

// ── public API ───────────────────────────────────────────────────────────────

/**
 * Spearman rank correlation coefficient (rho) for paired samples.
 * Returns NaN only if fewer than 2 pairs or zero variance in either rank set;
 * callers should treat NaN as "not computable".
 */
export function spearmanCorrelation(x: number[], y: number[]): number {
  const n = Math.min(x.length, y.length)
  if (n < 2) return NaN
  const rx = rankAverage(x.slice(0, n))
  const ry = rankAverage(y.slice(0, n))
  const meanX = rx.reduce((a, b) => a + b, 0) / n
  const meanY = ry.reduce((a, b) => a + b, 0) / n
  let sxy = 0
  let sxx = 0
  let syy = 0
  for (let i = 0; i < n; i++) {
    const dx = rx[i] - meanX
    const dy = ry[i] - meanY
    sxy += dx * dy
    sxx += dx * dx
    syy += dy * dy
  }
  const denom = Math.sqrt(sxx * syy)
  return denom === 0 ? NaN : sxy / denom
}

/**
 * Mann–Whitney U for two independent samples, with a normal approximation for
 * the two-sided p-value (continuity-corrected). Reports the smaller U. The
 * p-value is approximate and unreliable below ~5 per group — the caller warns.
 */
export function mannWhitneyU(
  groupA: number[],
  groupB: number[],
): { u: number; pApprox: number } {
  const nA = groupA.length
  const nB = groupB.length
  if (nA === 0 || nB === 0) return { u: NaN, pApprox: NaN }

  const all = [...groupA, ...groupB]
  const ranks = rankAverage(all)
  let rankSumA = 0
  for (let i = 0; i < nA; i++) rankSumA += ranks[i]

  const uA = rankSumA - (nA * (nA + 1)) / 2
  const uB = nA * nB - uA
  const u = Math.min(uA, uB)

  const mu = (nA * nB) / 2
  const sigma = Math.sqrt((nA * nB * (nA + nB + 1)) / 12)
  if (sigma === 0) return { u, pApprox: NaN }
  // continuity correction toward the mean
  const z = (u - mu + 0.5) / sigma
  return { u, pApprox: twoSidedP(z) }
}

/**
 * Fisher's exact test (two-sided) for a 2×2 contingency table:
 *   [ a  b ]
 *   [ c  d ]
 * Sums the hypergeometric probability of every table with the same margins
 * whose probability is ≤ that of the observed table (Freeman–Halton two-sided).
 */
export function fishersExactTest(a: number, b: number, c: number, d: number): number {
  a = Math.max(0, Math.round(a))
  b = Math.max(0, Math.round(b))
  c = Math.max(0, Math.round(c))
  d = Math.max(0, Math.round(d))
  const n = a + b + c + d
  if (n === 0) return NaN

  const rowA = a + b
  const colA = a + c
  const rowB = c + d
  const colB = b + d

  // log of the hypergeometric probability for a table with top-left cell = x
  const constLog =
    logFactorial(rowA) +
    logFactorial(rowB) +
    logFactorial(colA) +
    logFactorial(colB) -
    logFactorial(n)
  const probLog = (x: number): number => {
    const xb = rowA - x
    const xc = colA - x
    const xd = rowB - xc
    if (x < 0 || xb < 0 || xc < 0 || xd < 0) return -Infinity
    return (
      constLog -
      (logFactorial(x) + logFactorial(xb) + logFactorial(xc) + logFactorial(xd))
    )
  }

  const observed = probLog(a)
  const lo = Math.max(0, colA - rowB)
  const hi = Math.min(rowA, colA)
  const eps = 1e-9
  let p = 0
  for (let x = lo; x <= hi; x++) {
    const lp = probLog(x)
    if (lp <= observed + eps) p += Math.exp(lp)
  }
  return Math.min(1, p)
}

// ── log-factorial via log-gamma (Lanczos) ───────────────────────────────────

function logFactorial(n: number): number {
  return logGamma(n + 1)
}

const LANCZOS = [
  0.99999999999980993, 676.5203681218851, -1259.1392167224028,
  771.32342877765313, -176.61502916214059, 12.507343278686905,
  -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
]

function logGamma(z: number): number {
  if (z < 0.5) {
    // reflection formula
    return (
      Math.log(Math.PI / Math.sin(Math.PI * z)) - logGamma(1 - z)
    )
  }
  z -= 1
  let x = LANCZOS[0]
  for (let i = 1; i < LANCZOS.length; i++) x += LANCZOS[i] / (z + i)
  const t = z + LANCZOS.length - 1.5
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x)
}
