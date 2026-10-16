import { useEffect, useRef, type ReactNode } from 'react'
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
