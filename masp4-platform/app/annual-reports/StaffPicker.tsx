'use client'

/**
 * "Responsible" picker for the report tracker (Sprint 64): a type-to-search dropdown of @solidaridadnetwork.org
 * staff from /api/staff-directory, with the chosen people shown as removable chips. A full staff address that is
 * not in the list can be added as typed; it is saved to the directory when the tracker row is saved.
 */
import { useEffect, useId, useMemo, useState } from 'react'
import styles from './annual.module.css'

export interface Person { name: string; email: string }   // email '' = name only (legacy rows)

const STAFF_EMAIL = /^[a-z0-9._%+-]+@solidaridadnetwork\.org$/

function nameFromEmail(email: string) {
  return email.split('@')[0].split(/[._-]+/).filter(Boolean).map(w => w[0].toUpperCase() + w.slice(1)).join(' ')
}

export default function StaffPicker({ value, onChange }: { value: Person[]; onChange: (p: Person[]) => void }) {
  const [directory, setDirectory] = useState<Person[]>([])
  const [loadError, setLoadError] = useState(false)
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const listId = useId()

  useEffect(() => {
    fetch('/api/staff-directory').then(r => (r.ok ? r.json() : Promise.reject()))
      .then(d => Array.isArray(d) && setDirectory(d)).catch(() => setLoadError(true))
  }, [])

  const chosen = new Set(value.map(p => p.email).filter(Boolean))
  const q = query.trim().toLowerCase()
  const options = useMemo(() => {
    const matches = directory
      .filter(p => !chosen.has(p.email) && (!q || p.name.toLowerCase().includes(q) || p.email.includes(q)))
      .slice(0, 8)
    // A full staff address that is not in the directory yet can be added as typed.
    if (STAFF_EMAIL.test(q) && !chosen.has(q) && !directory.some(p => p.email === q)) {
      matches.push({ email: q, name: nameFromEmail(q) })
    }
    return matches
  }, [directory, q, value])

  function add(p: Person) {
    onChange([...value, p])
    setQuery(''); setActive(0)
  }

  function onKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive(a => Math.min(a + 1, options.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(a - 1, 0)) }
    else if (e.key === 'Enter') { if (open && options[active]) { e.preventDefault(); add(options[active]) } }
    else if (e.key === 'Escape') { if (open) { e.stopPropagation(); setOpen(false) } }
    else if (e.key === 'Backspace' && !query && value.length) onChange(value.slice(0, -1))
  }

  return (
    <div className={styles.picker}>
      <div className={styles.chips}>
        {value.map((p, i) => (
          <span key={(p.email || p.name) + i} className={styles.chip} title={p.email || 'No email: only M&E can update this row for them'}>
            {p.name}{!p.email && ' (no email)'}
            <button type="button" aria-label={`Remove ${p.name}`} onClick={() => onChange(value.filter((_, j) => j !== i))}>×</button>
          </span>
        ))}
        <input
          type="text" value={query} role="combobox" aria-expanded={open && options.length > 0} aria-controls={listId}
          aria-autocomplete="list" placeholder={value.length ? 'Add another…' : 'Type a name or email…'}
          onChange={e => { setQuery(e.target.value); setOpen(true); setActive(0) }}
          onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)} onKeyDown={onKey}
        />
      </div>
      {open && options.length > 0 && (
        <ul id={listId} role="listbox" className={styles.options}>
          {options.map((p, i) => (
            <li key={p.email} role="option" aria-selected={i === active}
                className={i === active ? styles.optionOn : undefined}
                onMouseDown={e => { e.preventDefault(); add(p) }} onMouseEnter={() => setActive(i)}>
              {directory.some(d => d.email === p.email)
                ? <><strong>{p.name}</strong> <span>{p.email}</span></>
                : <>Add <strong>{p.email}</strong> <span>(new to the list)</span></>}
            </li>
          ))}
        </ul>
      )}
      {loadError && <span className={styles.hint}>The staff list could not be loaded; type the full @solidaridadnetwork.org address.</span>}
      {open && q && !options.length && !loadError && (
        <span className={styles.hint}>No match. Type the person’s full @solidaridadnetwork.org address to add them.</span>
      )}
    </div>
  )
}
