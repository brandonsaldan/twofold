import { Fragment, useMemo, useState } from 'react'
import type { Genoset } from '../../lib/types'
import { count, snpediaUrl, topicName } from '../../lib/report'
import { Hint, Magnitude, ReputeTag } from '../ui'
import type { ReportContext } from './Dashboard'

export default function GenosetsView({ context }: { context: ReportContext }) {
  const { report } = context
  const [showFailures, setShowFailures] = useState(false)
  const sets = useMemo(() => [...report.genosets.matched].sort((a, b) => b.magnitude - a.magnitude), [report])
  const failures = Object.entries(report.genosets.failures)
  const coverage = failures.filter(([, reason]) => reason === 'Insufficient genotype coverage').length

  return (
    <>
      <header className="view-head">
        <div>
          <h1>Genosets</h1>
          <p>{count(report.genosets.matched.length, 'pattern')} matched your file</p>
        </div>
      </header>

      <Hint>A genoset is a SNPedia pattern that needs several variants at once, so it can say more than any single finding. A match means every condition in its criteria was met by your file.</Hint>

      {sets.length ? (
        <ul className="genosets">
          {sets.map(set => <GenosetItem key={set.title} set={set} context={context} />)}
        </ul>
      ) : (
        <div className="empty">
          <h2>No genosets matched</h2>
          <p>That is common for files with fewer variants, and does not mean anything is wrong.</p>
        </div>
      )}

      {failures.length > 0 && (
        <section className="section" aria-labelledby="unchecked-title">
          <h2 id="unchecked-title" className="section-title">Not checked</h2>
          <Hint>{count(failures.length, 'genoset')} could not be checked. {coverage ? `${count(coverage, 'was', 'were')} missing a variant your file does not include. ` : ''}{failures.length - coverage ? `${failures.length - coverage} use criteria that Twofold cannot read yet.` : ''} Missing criteria are never counted as a match.</Hint>
          <button type="button" className="link-button" aria-expanded={showFailures} onClick={() => setShowFailures(value => !value)}>{showFailures ? 'Hide the list' : 'Show the list'}</button>
          {showFailures && (
            <ul className="failure-list">
              {failures.map(([title, reason]) => <li key={title}><a href={snpediaUrl(title)} target="_blank" rel="noreferrer" className="mono">{title}</a><span>{reason === 'Insufficient genotype coverage' ? 'Missing variants' : reason}</span></li>)}
            </ul>
          )}
        </section>
      )}
    </>
  )
}

function GenosetItem({ set, context }: { set: Genoset; context: ReportContext }) {
  const byRsid = useMemo(() => new Map(context.report.findings.map(finding => [finding.rsid.toLowerCase(), finding])), [context.report])
  const parts = set.criteria.split(/((?:rs|i)\d+(?:\([^)]*\))?)/i)
  return (
    <li className="genoset">
      <div className="genoset-head">
        <Magnitude value={set.magnitude} />
        <h2 className="mono">{set.title}</h2>
        <ReputeTag repute={set.repute} />
      </div>
      <p className="genoset-summary">{set.summary || 'SNPedia has no summary for this genoset.'}</p>
      {set.topics.length > 0 && (
        <ul className="chips">
          {set.topics.map(topic => <li key={topic}><button type="button" onClick={() => context.go({ name: 'topic', topic })}>{topicName(topic, context.meta.topicKinds)}</button></li>)}
        </ul>
      )}
      <details className="criteria">
        <summary>Criteria</summary>
        <code>
          {parts.map((part, index) => {
            const finding = byRsid.get(part.replace(/\(.*$/, '').toLowerCase())
            return finding ? <button key={index} type="button" className="criteria-link" onClick={() => context.open(finding)}>{part}</button> : <Fragment key={index}>{part}</Fragment>
          })}
        </code>
      </details>
    </li>
  )
}
