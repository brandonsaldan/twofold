import { useMemo } from 'react'
import type { Repute } from '../../lib/types'
import { applyFilters, emptyFilters } from './FindingsView'
import { count, groupLabel, groupOf, snpediaUrl, topicName, topicsOf } from '../../lib/report'
import { Hint, Icon, Magnitude, ReputeTag } from '../ui'
import { ReputeBar } from './charts'
import FindingTable from './FindingTable'
import type { ReportContext } from './Dashboard'

const kindSentence = { gene: 'this gene', condition: 'this condition', medicine: 'this medicine', collection: 'this collection' }

export default function TopicView({ context, topic }: { context: ReportContext; topic: string }) {
  const { report, meta, go, filter } = context
  const group = groupOf(topic, meta.topicKinds)
  const name = topicName(topic, meta.topicKinds)
  const findings = useMemo(() => applyFilters(report.findings, { ...emptyFilters, topic, showZero: true }), [report, topic])
  const shown = findings

  const related = useMemo(() => {
    const totals = new Map<string, number>()
    for (const finding of shown) for (const other of topicsOf(finding)) if (other !== topic && groupOf(other, meta.topicKinds) !== 'collection') totals.set(other, (totals.get(other) || 0) + 1)
    return [...totals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12)
  }, [shown, topic, meta.topicKinds])

  const reputeCounts = shown.reduce((totals, finding) => { totals[finding.genotype.repute] += 1; return totals }, { good: 0, bad: 0, unknown: 0 } as Record<Repute, number>)
  const sets = report.genosets.matched.filter(set => set.topics.some(value => value.toLowerCase() === topic.toLowerCase()))
  const notable = shown.filter(finding => finding.genotype.magnitude >= 2).length

  return (
    <>
      <button type="button" className="back" onClick={() => go({ name: 'topics' })}><Icon name="back" />Topics</button>
      <header className="view-head">
        <div>
          <h1>{name}</h1>
          <p>{groupLabel[group]} · {count(shown.length, 'linked finding')} in your report{notable ? `, ${notable} with magnitude 2 or higher` : ''}</p>
        </div>
        {group !== 'collection' && <a className="button button-quiet button-small" href={snpediaUrl(name)} target="_blank" rel="noreferrer">Read on SNPedia</a>}
      </header>

      {shown.length > 0 && (
        <div className="panels">
          <section className="panel span-6" aria-labelledby="topic-repute">
            <header className="panel-head"><h2 id="topic-repute">Repute</h2></header>
            <ReputeBar counts={reputeCounts} onSelect={repute => filter({ topic, repute, showZero: true })} />
          </section>
          <section className="panel span-6" aria-labelledby="topic-related">
            <header className="panel-head"><h2 id="topic-related">Related topics</h2></header>
            {related.length ? (
              <ul className="chips">
                {related.map(([other, total]) => <li key={other}><button type="button" onClick={() => go({ name: 'topic', topic: other })}>{topicName(other, meta.topicKinds)} <span>{total}</span></button></li>)}
              </ul>
            ) : <p className="empty-inline">No other genes, conditions or medicines appear alongside {kindSentence[group]}.</p>}
          </section>
        </div>
      )}

      {sets.length > 0 && (
        <section className="panel" aria-labelledby="topic-sets">
          <header className="panel-head"><h2 id="topic-sets">Matched genosets</h2></header>
          <ul className="set-list">
            {sets.map(set => (
              <li key={set.title}>
                <Magnitude value={set.magnitude} />
                <span className="top-main"><span className="top-title"><span className="mono">{set.title}</span></span><span className="top-summary">{set.summary}</span></span>
                <ReputeTag repute={set.repute} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="section" aria-labelledby="topic-findings">
        <h2 id="topic-findings" className="section-title">Findings</h2>
        <Hint>Every match in your file that SNPedia links to {kindSentence[group]}, including magnitude 0. Select a row for the full entry.</Hint>
        {findings.length ? <FindingTable context={context} findings={findings} label={`Findings for ${name}`} /> : <div className="empty"><h2>Nothing to show</h2><p>No findings in your file link to {kindSentence[group]}.</p></div>}
      </section>
    </>
  )
}
