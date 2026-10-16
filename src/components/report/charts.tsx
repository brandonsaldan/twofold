import type { Repute } from '../../lib/types'
import { reputeLabel, reputes } from '../../lib/report'

export function ReputeBar({ counts, onSelect }: { counts: Record<Repute, number>; onSelect: (repute: Repute) => void }) {
  const total = Math.max(1, reputes.reduce((sum, repute) => sum + counts[repute], 0))
  const present = reputes.filter(repute => counts[repute] > 0)
  const gap = 0.8
  const room = 100 - gap * Math.max(0, present.length - 1)
  let offset = 0
  return (
    <div className="repute-chart">
      <svg className="stack" viewBox="0 0 100 8" preserveAspectRatio="none" aria-hidden="true" focusable="false">
        {present.map(repute => {
          const width = Math.max(0.6, (counts[repute] / total) * room)
          const rect = <rect key={repute} x={offset} y="0" width={width} height="8" className={`fill-${repute}`} />
          offset += width + gap
          return rect
        })}
      </svg>
      <ul className="legend">
        {reputes.map(repute => (
          <li key={repute}>
            <button type="button" onClick={() => onSelect(repute)} aria-label={`${counts[repute]} ${reputeLabel[repute]} findings, show them`}>
              <span className={`swatch fill-${repute}`} aria-hidden="true" />
              <span className="legend-label">{reputeLabel[repute]}</span>
              <span className="legend-value">{counts[repute].toLocaleString()}</span>
              <span className="legend-share">{Math.round((counts[repute] / total) * 100)}%</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

type Column = { key: string; label: string; value: number; description: string }

export function Columns({ columns, onSelect, className = '' }: { columns: Column[]; onSelect: (key: string) => void; className?: string }) {
  const peak = Math.max(1, ...columns.map(column => column.value))
  return (
    <ol className={`columns ${className}`}>
      {columns.map(column => {
        const height = column.value ? Math.max(3, (column.value / peak) * 100) : 0
        return (
          <li key={column.key}>
            <button type="button" onClick={() => onSelect(column.key)} disabled={!column.value} aria-label={column.description}>
              <span className="column-value">{column.value ? column.value.toLocaleString() : ''}</span>
              <span className="column-track">
                <svg className="column-bar" viewBox="0 0 10 100" preserveAspectRatio="none" aria-hidden="true" focusable="false">
                  <rect x="0" y={100 - height} width="10" height={height} />
                </svg>
              </span>
              <span className="column-label">{column.label}</span>
            </button>
          </li>
        )
      })}
    </ol>
  )
}

export function Bar({ value, peak }: { value: number; peak: number }) {
  return (
    <svg className="bar" viewBox="0 0 100 4" preserveAspectRatio="none" aria-hidden="true" focusable="false">
      <rect x="0" y="0" width="100" height="4" className="bar-track" />
      <rect x="0" y="0" width={(value / Math.max(peak, 1)) * 100} height="4" className="bar-fill" />
    </svg>
  )
}
