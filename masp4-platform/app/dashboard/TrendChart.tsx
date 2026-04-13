'use client'

import { Bar } from 'react-chartjs-2'
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend } from 'chart.js'

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend)

interface TrendRow { year: number; s61: number; s62: number; s21: number }

export default function TrendChart({ trendByYear }: { trendByYear: TrendRow[] }) {
  const labels = trendByYear.map(r => String(r.year))

  const data = {
    labels,
    datasets: [
      { label: 'S6.1 Resilience',  data: trendByYear.map(r => r.s61), backgroundColor: '#FFC800', borderRadius: 0 },
      { label: 'S6.2 Viability',   data: trendByYear.map(r => r.s62), backgroundColor: '#111111', borderRadius: 0 },
      { label: 'S2.1 Services',    data: trendByYear.map(r => r.s21), backgroundColor: '#1a3557', borderRadius: 0 },
    ],
  }

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'bottom' as const,
        labels: { font: { family: 'Open Sans', size: 10 }, boxWidth: 12 },
      },
      title: { display: false },
    },
    scales: {
      x: { grid: { display: false }, ticks: { font: { family: 'Open Sans', size: 10 } } },
      y: {
        beginAtZero: true,
        ticks: { font: { family: 'Open Sans', size: 10 }, precision: 0 },
        grid: { color: '#f0f0f0' },
      },
    },
  }

  return (
    <div className="cc" style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{
        background: '#111', color: '#fff',
        padding: '.55rem .9rem',
        fontSize: '.58rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1.5px',
      }}>
        Farmers reached — trend by year
      </div>
      <div style={{ padding: '1rem', height: 240 }}>
        {trendByYear.length === 0
          ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#bbb', fontSize: '.68rem', textAlign: 'center', lineHeight: 1.6 }}>
              No data yet.<br/>Import and approve submissions to see trends.
            </div>
          )
          : <Bar data={data} options={options} />
        }
      </div>
    </div>
  )
}
