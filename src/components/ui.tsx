import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import type { Repute } from '../lib/types'
import { reputeLabel, type Segment } from '../lib/report'

export function ReputeTag({ repute }: { repute: Repute }) {
  return <span className={`repute repute-${repute}`}><span className="repute-dot" aria-hidden="true" />{reputeLabel[repute]}</span>
}

export function Magnitude({ value, label = false }: { value: number; label?: boolean }) {
  const filled = Math.round(Math.min(Math.max(value, 0), 10))
  return (
    <span className="magnitude" aria-label={`Magnitude ${value}`}>
      <span className="magnitude-value" aria-hidden="true">{value.toFixed(1)}</span>
      <svg className="magnitude-scale" viewBox="0 0 39 8" aria-hidden="true" focusable="false">
        {Array.from({ length: 10 }, (_, index) => <rect key={index} x={index * 4} y={index < filled ? 0 : 3} width="2" height={index < filled ? 8 : 5} className={index < filled ? 'tick-on' : 'tick-off'} />)}
      </svg>
      {label && <span className="magnitude-label" aria-hidden="true">magnitude</span>}
    </span>
  )
}

export function Pair({ alleles }: { alleles: string[] }) {
  return <span className="pair">({alleles.map((allele, index) => <span key={index}>{index > 0 && <span className="pair-sep">;</span>}{allele}</span>)})</span>
}

export function Hint({ children }: { children: ReactNode }) {
  return <p className="hint">{children}</p>
}

export function Rich({ segments }: { segments: Segment[] }) {
  return <>{segments.map((segment, index) => segment.href ? <a key={index} href={segment.href} target="_blank" rel="noreferrer">{segment.text}</a> : <span key={index}>{segment.text}</span>)}</>
}

export function Modal({ open, onClose, labelledBy, className = '', children }: { open: boolean; onClose: () => void; labelledBy: string; className?: string; children: ReactNode }) {
  const dialog = useRef<HTMLDialogElement | null>(null)
  useEffect(() => {
    const element = dialog.current
    if (!element) return
    if (open && !element.open) { element.showModal(); element.scrollTop = 0 }
    if (!open && element.open) element.close()
  }, [open])
  return (
    <dialog
      ref={dialog}
      className={`modal ${className}`}
      aria-labelledby={labelledBy}
      onClose={onClose}
      onCancel={event => { event.preventDefault(); onClose() }}
      onClick={event => { if (event.target === event.currentTarget) onClose() }}
    >
      <div className="modal-body">{children}</div>
    </dialog>
  )
}

export function Icon({ name }: { name: 'close' | 'search' | 'back' | 'print' | 'download' | 'lock' | 'exit' | 'arrow' | 'file' }) {
  const paths: Record<typeof name, string> = {
    close: 'M5 5l10 10M15 5L5 15',
    search: 'M8.5 14a5.5 5.5 0 1 0 0-11 5.5 5.5 0 0 0 0 11zM12.5 12.5L17 17',
    back: 'M12 4l-6 6 6 6',
    print: 'M5 8V3h10v5M5 14H3V8h14v6h-2M5 11h10v6H5z',
    download: 'M10 3v10M5.5 8.5L10 13l4.5-4.5M4 17h12',
    lock: 'M5 9h10v8H5zM7 9V6.5a3 3 0 0 1 6 0V9',
    exit: 'M8 4H4v12h4M12 6l4 4-4 4M16 10H8',
    arrow: 'M4 10h12M11 5l5 5-5 5',
    file: 'M5 2.5h6.5L15 6v11.5H5zM11.5 2.5V6H15'
  }
  return <svg className="icon" viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d={paths[name]} /></svg>
}

export type DropdownOption = { value: string; label: string; group?: string }

export function Dropdown({ label, value, options, onChange }: { label: string; value: string; options: DropdownOption[]; onChange: (value: string) => void }) {
  const id = useId()
  const root = useRef<HTMLDivElement | null>(null)
  const button = useRef<HTMLButtonElement | null>(null)
  const list = useRef<HTMLUListElement | null>(null)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const typed = useRef({ text: '', at: 0 })
  const current = Math.max(0, options.findIndex(option => option.value === value))

  useEffect(() => {
    if (!open) return
    const close = (event: MouseEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  useEffect(() => {
    if (!open) return
    list.current?.focus()
    list.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [open, active])

  const show = (index = current) => { setActive(index); setOpen(true) }
  const choose = (index: number) => {
    const option = options[index]
    if (option) onChange(option.value)
    setOpen(false)
    button.current?.focus()
  }
  const jump = (key: string) => {
    const now = Date.now()
    typed.current = { text: now - typed.current.at > 700 ? key : typed.current.text + key, at: now }
    const query = typed.current.text.toLowerCase()
    const start = typed.current.text.length > 1 ? active : active + 1
    const order = [...options.keys()].map(offset => (start + offset) % options.length)
    const found = order.find(index => options[index].label.toLowerCase().startsWith(query))
    if (found !== undefined) setActive(found)
  }
  const onButtonKey = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) { event.preventDefault(); show() }
  }
  const onListKey = (event: KeyboardEvent<HTMLUListElement>) => {
    if (event.key === 'ArrowDown') { event.preventDefault(); setActive(index => Math.min(options.length - 1, index + 1)) }
    else if (event.key === 'ArrowUp') { event.preventDefault(); setActive(index => Math.max(0, index - 1)) }
    else if (event.key === 'Home') { event.preventDefault(); setActive(0) }
    else if (event.key === 'End') { event.preventDefault(); setActive(options.length - 1) }
    else if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); choose(active) }
    else if (event.key === 'Escape') { event.preventDefault(); setOpen(false); button.current?.focus() }
    else if (event.key === 'Tab') setOpen(false)
    else if (event.key.length === 1 && !event.metaKey && !event.ctrlKey) jump(event.key)
  }

  return (
    <div className={open ? 'dropdown is-open' : 'dropdown'} ref={root}>
      <button ref={button} type="button" className="dropdown-button" id={`${id}-button`} aria-haspopup="listbox" aria-expanded={open} aria-labelledby={`${id}-label ${id}-button`} onClick={() => (open ? setOpen(false) : show())} onKeyDown={onButtonKey}>
        <span className="visually-hidden" id={`${id}-label`}>{label}</span>
        <span className="dropdown-value">{options[current]?.label}</span>
      </button>
      {open && (
        <ul ref={list} className="dropdown-list" role="listbox" tabIndex={-1} aria-labelledby={`${id}-label`} aria-activedescendant={`${id}-option-${active}`} onKeyDown={onListKey}>
          {options.map((option, index) => (
            <li key={`${option.group || ''}-${option.value}`} role="presentation">
              {option.group && option.group !== options[index - 1]?.group && <span className="dropdown-group" aria-hidden="true">{option.group}</span>}
              <span role="option" id={`${id}-option-${index}`} data-index={index} aria-selected={index === current} className={index === active ? 'dropdown-option is-active' : 'dropdown-option'} onMouseMove={() => active !== index && setActive(index)} onClick={() => choose(index)}>{option.label}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
