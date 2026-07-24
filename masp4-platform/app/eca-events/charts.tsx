'use client'

/**
 * Reusable chart.js + card primitives for the ECA Events dashboard.
 * Solidaridad theme: yellow #FFC800, black #111, grey #888.
 */
import { Bar, Line, Doughnut, Scatter } from 'react-chartjs-2'
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement, PointElement,
  LineElement, ArcElement, Tooltip, Legend, Filler,
} from 'chart.js'

ChartJS.register(CategoryScale, LinearScale, BarElement, PointElement,
  LineElement, ArcElement, Tooltip, Legend, Filler)

export const PALETTE = ['#FFC800', '#111111', '#888888', '#c79a00', '#555555',
  '#e0b400', '#333333', '#aaaaaa']

const FONT = { family: 'Open Sans', size: 10 }
const fmt = (v: any) => Number(v).toLocaleString()

const baseOpts = (opts: any = {}) => ({
  responsive: true, maintainAspectRatio: false,
  plugins: {
    legend: { position: 'bottom' as const, labels: { font: FONT, boxWidth: 10, padding: 8, color: '#555' } },
    tooltip: { callbacks: { label: (c: any) => ` ${c.dataset.label ? c.dataset.label + ': ' : ''}${fmt(c.raw)}` } },
    ...(opts.plugins ?? {}),
  },
  scales: opts.scales,
})

const numScales = {
  x: { grid: { display: false }, ticks: { font: FONT, color: '#888' } },
  y: { beginAtZero: true, grid: { color: '#f5f5f5' },
       ticks: { font: FONT, color: '#aaa', precision: 0, maxTicksLimit: 5,
                callback: (v: any) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v) } },
}

// ── Card shell ────────────────────────────────────────────────────────────────

export function Card({ title, children, height, note }:
  { title: string; children: React.ReactNode; height?: number; note?: string }) {
  return (
    <div className="cc" style={{ padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <div style={{ background: '#111', color: '#fff', padding: '.5rem .8rem',
        fontSize: '.58rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1.2px' }}>
        {title}
      </div>
      <div style={{ padding: '.6rem', height: height ?? 220 }}>{children}</div>
      {note && <Caption>{note}</Caption>}
    </div>
  )
}

export function Caption({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ padding: '.35rem .7rem .5rem', fontSize: '.56rem', color: '#999',
      lineHeight: 1.5, borderTop: '1px solid #f2f2f2' }}>
      {children}
    </div>
  )
}

export function Empty() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center',
      height: '100%', color: '#ccc', fontSize: '.62rem' }}>
      No data for the current filters
    </div>
  )
}

// ── KPI stat card ───────────────────────────────────────────────────────────

export function Kpi({ label, value, sub, accent }:
  { label: string; value: string | number; sub?: string; accent?: boolean }) {
  return (
    <div className="cc" style={{ borderTop: `3px solid ${accent ? '#FFC800' : '#111'}`, padding: '.55rem .75rem' }}>
      <div style={{ fontSize: '1.5rem', fontWeight: 800, color: accent ? '#c79a00' : '#111',
        lineHeight: 1, marginBottom: 4, fontVariantNumeric: 'tabular-nums' }}>
        {typeof value === 'number' ? value.toLocaleString() : value}
      </div>
      <div style={{ fontSize: '.6rem', fontWeight: 700, textTransform: 'uppercase',
        letterSpacing: '.6px', color: '#888' }}>{label}</div>
      {sub && <div style={{ fontSize: '.56rem', color: '#aaa', marginTop: 2 }}>{sub}</div>}
    </div>
  )
}

// ── Charts ────────────────────────────────────────────────────────────────────

export function BarChart({ labels, series, horizontal, stacked }:
  { labels: string[]; series: { label?: string; data: number[]; color?: string }[]; horizontal?: boolean; stacked?: boolean }) {
  if (!labels.length) return <Empty />
  const data = {
    labels,
    datasets: series.map((s, i) => ({
      label: s.label, data: s.data,
      backgroundColor: s.color ?? PALETTE[i % PALETTE.length], borderRadius: 0,
      categoryPercentage: 0.8, barPercentage: 0.7,
    })),
  }
  const opts: any = baseOpts({ scales: numScales })
  opts.indexAxis = horizontal ? 'y' : 'x'
  if (horizontal) opts.scales = { x: numScales.y, y: { ...numScales.x, ticks: { ...numScales.x.ticks } } }
  if (stacked) { opts.scales.x = { ...opts.scales.x, stacked: true }; opts.scales.y = { ...opts.scales.y, stacked: true } }
  if (series.length < 2 && !series[0]?.label) opts.plugins.legend.display = false
  return <Bar data={data} options={opts} />
}

export function LineChart({ labels, series }:
  { labels: string[]; series: { label: string; data: number[]; color?: string }[] }) {
  if (!labels.length) return <Empty />
  const data = {
    labels,
    datasets: series.map((s, i) => ({
      label: s.label, data: s.data,
      borderColor: s.color ?? PALETTE[i % PALETTE.length],
      backgroundColor: (s.color ?? PALETTE[i % PALETTE.length]) + '33',
      fill: true, tension: 0.3, pointRadius: 2, borderWidth: 2,
    })),
  }
  return <Line data={data} options={baseOpts({ scales: numScales }) as any} />
}

export function ScatterChart({ points, xLabel, yLabel }:
  { points: { x: number; y: number }[]; xLabel?: string; yLabel?: string }) {
  if (!points.length) return <Empty />
  return (
    <Scatter
      data={{ datasets: [{ data: points, pointRadius: 2, backgroundColor: '#c79a00' }] }}
      options={{
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c: any) => ` ${c.parsed.y.toFixed(3)}, ${c.parsed.x.toFixed(3)}` } } },
        scales: {
          x: { title: { display: !!xLabel, text: xLabel, font: FONT }, ticks: { font: FONT, color: '#aaa' }, grid: { color: '#f5f5f5' } },
          y: { title: { display: !!yLabel, text: yLabel, font: FONT }, ticks: { font: FONT, color: '#aaa' }, grid: { color: '#f5f5f5' } },
        },
      } as any}
    />
  )
}

export function DoughnutChart({ labels, data }: { labels: string[]; data: number[] }) {
  if (!labels.length) return <Empty />
  return (
    <Doughnut
      data={{ labels, datasets: [{ data, backgroundColor: labels.map((_, i) => PALETTE[i % PALETTE.length]), borderWidth: 1, borderColor: '#fff' }] }}
      options={baseOpts({ plugins: { legend: { position: 'right' as const, labels: { font: FONT, boxWidth: 10, padding: 6, color: '#555' } } } }) as any}
    />
  )
}
