'use client'

/**
 * Copy / PNG buttons for a chart or figure block (Sprint 59), so staff can paste charts into Word, PowerPoint or email.
 * Renders the nearest `[data-copy]` ancestor to a 2× PNG on white: "Copy" puts it on the clipboard, "PNG" downloads it.
 * The buttons, hover tooltips and collapsed data tables are left out of the image.
 */
import { useState } from 'react'
import { toBlob } from 'html-to-image'
import styles from './themes.module.css'

function render(node: HTMLElement) {
  return toBlob(node, {
    pixelRatio: 2,
    backgroundColor: '#ffffff',
    filter: n => !(n instanceof HTMLElement &&
      (n.dataset.copyIgnore !== undefined || n.tagName === 'DETAILS' || n.classList.contains(styles.tip))),
  }).then(blob => {
    if (!blob) throw new Error('The chart could not be drawn')
    return blob
  })
}

const fileName = (title: string) =>
  `${title.replace(/[^\w&-]+/g, ' ').trim().replace(/\s+/g, '-').slice(0, 80) || 'chart'}.png`

export default function CopyChart({ title }: { title: string }) {
  const [state, setState] = useState<'idle' | 'busy' | 'copied' | 'error'>('idle')

  const target = (btn: HTMLElement) => btn.closest<HTMLElement>('[data-copy]')

  function flash(s: 'copied' | 'error') {
    setState(s)
    setTimeout(() => setState('idle'), 2000)
  }

  function download(blob: Blob) {
    const url = URL.createObjectURL(blob)
    const a = Object.assign(document.createElement('a'), { href: url, download: fileName(title) })
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  async function copy(e: React.MouseEvent<HTMLButtonElement>) {
    const node = target(e.currentTarget)
    if (!node) return
    setState('busy')
    const blob = render(node)
    try {
      // Pass the promise straight to ClipboardItem so Safari keeps the user gesture.
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
      flash('copied')
    } catch {
      // No image clipboard (older browsers, non-secure origins): fall back to a download.
      try { download(await blob); flash('copied') } catch { flash('error') }
    }
  }

  async function save(e: React.MouseEvent<HTMLButtonElement>) {
    const node = target(e.currentTarget)
    if (!node) return
    setState('busy')
    try { download(await render(node)); setState('idle') } catch { flash('error') }
  }

  const label = state === 'busy' ? '…' : state === 'copied' ? 'Copied' : state === 'error' ? 'Failed' : 'Copy'
  return (
    <span className={styles.copyBtns} data-copy-ignore="">
      <button type="button" onClick={copy} disabled={state === 'busy'} aria-live="polite"
              title="Copy this chart as an image, then paste it into Word, PowerPoint or an email">{label}</button>
      <button type="button" onClick={save} disabled={state === 'busy'} title="Download this chart as a PNG image">PNG</button>
    </span>
  )
}
