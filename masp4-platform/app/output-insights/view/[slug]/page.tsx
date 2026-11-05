/**
 * /output-insights/view/<slug> — shows one standalone Granular Data dashboard (a nightly-built HTML file
 * in /public) inside the platform, so the header, nav and a way back stay on screen and nothing opens a
 * new window. The dashboard files are untouched; their old /<File>.html URLs still work.
 * Same-origin iframe, so the staff-only gate in proxy.ts covers both this page and the file.
 */
import { notFound } from 'next/navigation'
import { DASHBOARDS } from '../../dashboards'
import DashboardFrame from './DashboardFrame'

const find = (slug: string) => DASHBOARDS.find(d => d.slug === slug && d.file)

export function generateStaticParams() {
  return DASHBOARDS.filter(d => d.file).map(d => ({ slug: d.slug }))
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const d = find((await params).slug)
  return { title: `${d?.title ?? 'Dashboard'} — Granular Data — ECA PMEL Platform` }
}

export default async function DashboardViewPage({ params }: { params: Promise<{ slug: string }> }) {
  const d = find((await params).slug)
  if (!d) notFound()

  return <DashboardFrame src={d.file!} title={d.title} />
}
