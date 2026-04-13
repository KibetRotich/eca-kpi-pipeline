'use client'

import { Bar } from 'react-chartjs-2'
import {
  Chart as ChartJS,
  CategoryScale, LinearScale, BarElement,
  Title, Tooltip, Legend,
} from 'chart.js'

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend)

interface TrendRow {
  year: number
  s61:  number
  s62:  number
  s21:  number
}

export default function TrendChart({ trendByYear }: { trendByYear: TrendRow[] }) {
  const labels = trendByYear.map(r => String(r.year))

  const data = {
    labels,
    datasets: [
      {
        label: 'S6.1 Resilience',
        data: trendByYear.map(r => r.s61),
        backgroundColor: '#1a6b3c',
        borderRadius: 4,
      },
      {
        label: 'S6.2 Viability',
        data: trendByYear.map(r => r.s62),
        backgroundColor: '#16a34a',
        borderRadius: 4,
      },
      {
        label: 'S2.1 Services',
        data: trendByYear.map(r => r.s21),
        backgroundColor: '#1d4ed8',
        borderRadius: 4,
      },
    ],
  }

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'bottom' as const, labels: { font: { size: 11 }, boxWidth: 12 } },
      title:  { display: false },
    },
    scales: {
      x: { grid: { display: false }, ticks: { font: { size: 11 } } },
      y: {
        beginAtZero: true,
        ticks: { font: { size: 11 }, precision: 0 },
        grid: { color: '#f1f3f5' },
      },
    },
  }

  return (
    <div style={{ background: '#fff', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)', overflow: 'hidden' }}>
      <div style={{ padding: '.85rem 1.1rem', borderBottom: '1px solid var(--grey-2)', fontWeight: 700, fontSize: '.9rem' }}>
        Farmers reached — trend by year
      </div>
      <div style={{ padding: '1rem', height: '260px' }}>
        {trendByYear.length === 0
          ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--grey-3)', fontSize: '.875rem' }}>
              No data yet — import and approve submissions to see trends.
            </div>
          )
          : <Bar data={data} options={options} />
        }
      </div>
    </div>
  )
}
