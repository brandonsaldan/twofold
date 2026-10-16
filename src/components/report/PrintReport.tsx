import { createPortal } from 'react-dom'
import { chromosomeOf, formatDate, pair, percent, reputeLabel } from '../../lib/report'
import type { ReportContext } from './Dashboard'

export type PrintOptions = { minimum: number }

export default function PrintReport({ context, options }: { context: ReportContext; options: PrintOptions }) {
  const { report, meta } = context
  const findings = report.findings.filter(finding => finding.genotype.magnitude >= options.minimum).sort((a, b) => b.genotype.magnitude - a.genotype.magnitude)
  const sets = [...report.genosets.matched].sort((a, b) => b.magnitude - a.magnitude)
  const facts = report.facts
  const scope = options.minimum ? `Findings with magnitude ${options.minimum} or higher` : 'All findings'

  return createPortal(
    <div className="print-root">
      <header className="print-cover">
        <p className="print-brand">twofold</p>
        <h1>{meta.sample ? 'Sample Report' : 'DNA Report'}</h1>
        <dl className="print-facts">
          <div><dt>File</dt><dd>{meta.fileName}</dd></div>
          <div><dt>Format</dt><dd>{facts.provider}, {facts.build}</dd></div>
          <div><dt>Variants read</dt><dd>{facts.snpCount.toLocaleString()} ({percent(facts.callRate)} called)</dd></div>
          <div><dt>SNPedia matches</dt><dd>{report.findings.length.toLocaleString()}</dd></div>
          <div><dt>SNPedia data as of</dt><dd>{formatDate(meta.snapshotAt)}</dd></div>
          <div><dt>Printed</dt><dd>{formatDate(new Date().toISOString())}</dd></div>
        </dl>
        <p className="print-note">Twofold makes no guarantee that this report or any entry in it is accurate or complete. Entries come from SNPedia, a community wiki, and describe associations from research, not a diagnosis. Magnitude rates how notable a genotype is from 0 to 10, not how risky. Rare variants reported by consumer chips are often wrong. Talk to a doctor or genetic counselor about anything here before acting on it.</p>
      </header>

      <section className="print-section">
        <h2>{scope} ({findings.length.toLocaleString()})</h2>
        <table className="print-table">
          <thead>
            <tr><th scope="col">Mag.</th><th scope="col">Variant</th><th scope="col">Genotype</th><th scope="col">Repute</th><th scope="col">Summary</th></tr>
          </thead>
          <tbody>
            {findings.map(finding => (
              <tr key={finding.rsid}>
                <td>{finding.genotype.magnitude.toFixed(1)}</td>
                <td><strong>{finding.rsid}</strong><br />{finding.snp.gene || ''} chr {chromosomeOf(finding)}</td>
                <td>{pair(finding.genotype.alleles)}</td>
                <td>{reputeLabel[finding.genotype.repute]}</td>
                <td>{finding.genotype.summary}{finding.rareVariantCaution ? ' (Rare variant, confirm clinically.)' : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {sets.length > 0 && (
        <section className="print-section">
          <h2>Matched genosets ({sets.length})</h2>
          <table className="print-table">
            <thead><tr><th scope="col">Mag.</th><th scope="col">Genoset</th><th scope="col">Repute</th><th scope="col">Summary</th></tr></thead>
            <tbody>
              {sets.map(set => <tr key={set.title}><td>{set.magnitude.toFixed(1)}</td><td><strong>{set.title}</strong></td><td>{reputeLabel[set.repute]}</td><td>{set.summary}</td></tr>)}
            </tbody>
          </table>
        </section>
      )}

      <footer className="print-foot">Made with Twofold. Annotations from SNPedia, licensed CC BY-NC-SA 3.0 US.</footer>
    </div>,
    document.body
  )
}
