'use client'

/**
 * Opens a Google Drive report in a preview panel on the page instead of a new window.
 *
 * <PreviewLink> renders a normal link to the Drive file. A plain click opens the panel; Ctrl/⌘-click,
 * middle-click and "Open link in new tab" still work as usual, so staff who want a separate tab keep it.
 * The panel always offers "Open in Google Drive", because Drive only shows the preview to a browser that is
 * signed in to a Google account with access to the file (and some browsers block that inside a page).
 */
import { useCallback, useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import styles from './DocPreview.module.css'

export type DriveFileType = 'pdf' | 'docx' | 'gdoc'

/** Drive's embeddable preview for a file id. */
export function drivePreviewUrl(id: string, fileType: DriveFileType | null): string {
  return fileType === 'gdoc'
    ? `https://docs.google.com/document/d/${id}/preview`
    : `https://drive.google.com/file/d/${id}/preview`
}

interface Props {
  /** Where the link goes when opened outside the panel (new tab, or the panel's "Open in Google Drive"). */
  href: string
  /** Drive file id; without one the link behaves as an ordinary new-tab link. */
  driveId: string | null | undefined
  fileType: DriveFileType | null
  title: string
  className?: string
  linkTitle?: string
  children: ReactNode
}

export default function PreviewLink({ href, driveId, fileType, title, className, linkTitle, children }: Props) {
  const [open, setOpen] = useState(false)
  const close = useCallback(() => setOpen(false), [])

  function onClick(e: MouseEvent<HTMLAnchorElement>) {
    if (!driveId || e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return
    e.preventDefault()
    setOpen(true)
  }

  return (
    <>
      <a href={href} target="_blank" rel="noopener noreferrer" className={className} title={linkTitle} onClick={onClick}>
        {children}
      </a>
      {open && driveId && (
        <PreviewPanel src={drivePreviewUrl(driveId, fileType)} href={href} title={title} onClose={close} />
      )}
    </>
  )
}

function PreviewPanel({ src, href, title, onClose }: { src: string; href: string; title: string; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const prevOverflow = document.body.style.overflow
    const prevFocus = document.activeElement as HTMLElement | null
    document.body.style.overflow = 'hidden'
    closeRef.current?.focus()
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopImmediatePropagation(); onClose() } }
    window.addEventListener('keydown', onKey, true)
    return () => {
      document.body.style.overflow = prevOverflow
      window.removeEventListener('keydown', onKey, true)
      prevFocus?.focus?.()
    }
  }, [onClose])

  return createPortal(
    <div className={styles.overlay} onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className={styles.panel} role="dialog" aria-modal="true" aria-label={`Preview: ${title}`}>
        <div className={styles.head}>
          <h2 className={styles.title} title={title}>{title}</h2>
          <a href={href} target="_blank" rel="noopener noreferrer" className={styles.drive}>
            Open in Google Drive <span aria-hidden="true">↗</span>
          </a>
          <button ref={closeRef} type="button" className={styles.close} onClick={onClose} aria-label="Close preview">
            ✕ Close
          </button>
        </div>
        <iframe src={src} title={title} className={styles.frame} allow="autoplay" />
        <p className={styles.hint}>
          Blank, or asking you to sign in or request access? Use <strong>Open in Google Drive</strong> — the
          preview needs this browser to be signed in to your Solidaridad Google account.
        </p>
      </div>
    </div>,
    document.body,
  )
}
