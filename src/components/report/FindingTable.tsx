import { useEffect, useState } from 'react'
import type { Finding } from '../../lib/types'
import { Magnitude, Pair, ReputeTag } from '../ui'
import type { ReportContext } from './Dashboard'

type Props = { context: ReportContext; findings: Finding[]; pageSize?: number; label: string; compact?: boolean }

export default function FindingTable({ context, findings, pageSize = 50, label, compact = false }: Props) {
  const [page, setPage] = useState(0)
  const pages = Math.max(1, Math.ceil(findings.length / pageSize))
  const rows = findings.slice(page * pageSize, page * pageSize + pageSize)

  useEffect(() => { setPage(0) }, [findings])

  return (
    <div className="table-wrap">
      <table className={`findings${compact ? ' findings-compact' : ''}`} aria-label={label}>
        <thead>
          <tr>
            <th scope="col" className="col-magnitude">Magnitude</th>
            <th scope="col" className="col-variant">Variant</th>
            <th scope="col" className="col-genotype">Genotype</th>
            <th scope="col" className="col-summary">Summary</th>
            <th scope="col" className="col-repute">Repute</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(finding => (
            <tr key={finding.rsid} className="row" onClick={event => { if (!(event.target as HTMLElement).closest('button, a')) context.open(finding) }}>
              <td className="col-magnitude"><Magnitude value={finding.genotype.magnitude} /></td>
              <td className="col-variant">
                <button type="button" className="row-open" onClick={() => context.open(finding)}>{finding.rsid}</button>
                <span className="row-gene">{finding.snp.gene || 'No gene listed'}</span>
              </td>
              <td className="col-genotype"><Pair alleles={finding.genotype.alleles} /></td>
              <td className="col-summary">
                <span className="summary-text">{finding.genotype.summary || 'SNPedia has an entry for this genotype without a summary.'}</span>
                {finding.rareVariantCaution && <span className="caution">Rare variant. Chip calls like this are often wrong, so confirm with a clinical test.</span>}
              </td>
              <td className="col-repute"><ReputeTag repute={finding.genotype.repute} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      {pages > 1 && (
        <nav className="pager" aria-label={`${label} pages`}>
          <button type="button" className="button button-quiet button-small" disabled={page === 0} onClick={() => setPage(value => value - 1)}>Previous</button>
          <span>Page {page + 1} of {pages.toLocaleString()}</span>
          <button type="button" className="button button-quiet button-small" disabled={page >= pages - 1} onClick={() => setPage(value => value + 1)}>Next</button>
        </nav>
      )}
    </div>
  )
}
