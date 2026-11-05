'use client'

/**
 * Bar (back link, title, Full screen) + the dashboard iframe. "Full screen" uses the browser's
 * fullscreen on the frame — no new window; Esc comes back.
 */
import Link from 'next/link'
import { useRef } from 'react'
import styles from './view.module.css'

export default function DashboardFrame({ src, title }: { src: string; title: string }) {
  const ref = useRef<HTMLIFrameElement>(null)
  return (
    <div>
      <div className={styles.bar}>
        <Link href="/output-insights" className={styles.back}>← Granular Data</Link>
        <h1 className={styles.title}>{title}</h1>
        <button type="button" className={styles.full} onClick={() => ref.current?.requestFullscreen?.()}
                title="Show the dashboard full screen — press Esc to come back">
          ⤢ Full screen
        </button>
      </div>
      <iframe ref={ref} src={src} title={title} className={styles.frame} allowFullScreen />
    </div>
  )
}
