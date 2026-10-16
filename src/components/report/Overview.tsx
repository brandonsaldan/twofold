import { useMemo } from 'react'
import type { Repute } from '../../lib/types'
import { bucketLabel, bucketOf, chromosomeOf, chromosomeOrder, count, formatDate, groupLabel, groupOf, magnitudeBuckets, percent, topicName, topicsOf } from '../../lib/report'
import { Hint, Icon, Magnitude, Pair, ReputeTag } from '../ui'
import { Bar, Columns, ReputeBar } from './charts'
import type { ReportContext } from './Dashboard'

export default function Overview({ context }: { context: ReportContext }) {
  const { report, meta, filter, go, open } = context
  const visible = report.findings
  const genosets = report.genosets.matched
  const facts = report.facts

  const stats = useMemo(() => {
    const reputeCounts: Record<Repute, number> = { good: 0, bad: 0, unknown: 0 }
    const buckets = new Map<number, number>()
    const chromosomes = new Map<string, number>()
    const topics = new Map<string, number>()
    for (const finding of visible) {
      reputeCounts[finding.genotype.repute] += 1
      if (finding.genotype.magnitude > 0) {
        const bucket = bucketOf(finding.genotype.magnitude)
        buckets.set(bucket, (buckets.get(bucket) || 0) + 1)
      }
      const chromosome = chromosomeOf(finding)
      chromosomes.set(chromosome, (chromosomes.get(chromosome) || 0) + 1)
      for (const topic of topicsOf(finding)) if (groupOf(topic, meta.topicKinds) !== 'collection') topics.set(topic, (topics.get(topic) || 0) + 1)
    }
    const top = [...visible].filter(finding => finding.genotype.magnitude > 0).sort((a, b) => b.genotype.magnitude - a.genotype.magnitude).slice(0, 8)
    const topTopics = [...topics.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 8)
    const notable = visible.filter(finding => finding.genotype.magnitude >= 2).length
    const rare = visible.filter(finding => finding.rareVariantCaution).length
    const zero = visible.filter(finding => finding.genotype.magnitude === 0).length
    return { reputeCounts, buckets, chromosomes, top, topTopics, notable, rare, zero }
  }, [visible, meta.topicKinds])

  const sets = [...genosets].sort((a, b) => b.magnitude - a.magnitude).slice(0, 5)
  const failures = Object.keys(report.genosets.failures).length

  return (
    <>
      <header className="view-head">
        <div>
          <h1>Overview</h1>
          <p>{facts.provider} · {facts.build} · SNPedia data as of {formatDate(meta.snapshotAt)}</p>
        </div>
      </header>

      <section className="kpis" aria-label="Summary">
        <div className="kpi">
          <p className="kpi-label">Variants read</p>
          <p className="kpi-value">{facts.snpCount.toLocaleString()}</p>
          <p className="kpi-note">{percent(facts.callRate)} called successfully</p>
        </div>
        <button type="button" className="kpi" onClick={() => filter({ showZero: true })}>
          <span className="kpi-label">SNPedia matches</span>
          <span className="kpi-value">{report.findings.length.toLocaleString()}</span>
          <span className="kpi-note">Genotypes with an <span className="kpi-arrow">entry <Icon name="arrow" /></span></span>
        </button>
        <button type="button" className="kpi" onClick={() => filter({ minimum: 2 })}>
          <span className="kpi-label">Notable</span>
          <span className="kpi-value">{stats.notable.toLocaleString()}</span>
          <span className="kpi-note">Magnitude 2 or <span className="kpi-arrow">higher <Icon name="arrow" /></span></span>
        </button>
        <button type="button" className="kpi" onClick={() => go({ name: 'genosets' })}>
          <span className="kpi-label">Genosets</span>
          <span className="kpi-value">{genosets.length.toLocaleString()}</span>
          <span className="kpi-note">Multi-variant <span className="kpi-arrow">patterns <Icon name="arrow" /></span></span>
        </button>
        {stats.rare > 0 ? (
          <button type="button" className="kpi" onClick={() => filter({ rare: true, showZero: true })}>
            <span className="kpi-label">Rare variant flags</span>
            <span className="kpi-value">{stats.rare.toLocaleString()}</span>
            <span className="kpi-note">Confirm <span className="kpi-arrow">clinically <Icon name="arrow" /></span></span>
          </button>
        ) : (
          <div className="kpi">
            <p className="kpi-label">Rare variant flags</p>
            <p className="kpi-value">0</p>
            <p className="kpi-note">None to confirm</p>
          </div>
        )}
      </section>

      <div className="panels">
        <section className="panel span-5" aria-labelledby="repute-title">
          <header className="panel-head"><h2 id="repute-title">Repute</h2></header>
          <ReputeBar counts={stats.reputeCounts} onSelect={repute => filter({ repute, showZero: true })} />
          <Hint>SNPedia marks each genotype as good or bad to have, or leaves it unlabelled. Good often just means the common, expected genotype.</Hint>
        </section>

        <section className="panel span-7" aria-labelledby="magnitude-title">
          <header className="panel-head"><h2 id="magnitude-title">Magnitude</h2></header>
          <Columns
            className="columns-magnitude"
            columns={magnitudeBuckets.map(bucket => {
              const value = stats.buckets.get(bucket) || 0
              const last = bucket === magnitudeBuckets[magnitudeBuckets.length - 1]
              const range = bucket === 0 ? 'above 0 and under 1' : last ? `${bucket} or more` : `${bucket} to ${bucket + 0.9}`
              return { key: String(bucket), label: bucketLabel(bucket), value, description: `${count(value, 'finding')} with magnitude ${range}` }
            })}
            onSelect={key => { const bucket = Number(key); const last = bucket === magnitudeBuckets[magnitudeBuckets.length - 1]; filter({ minimum: bucket || 0.01, maximum: last ? null : bucket + 1 }) }}
          />
          <Hint>Magnitude rates how notable a genotype is from 0 to 10, not how risky it is. The {stats.zero.toLocaleString()} findings at magnitude 0 are common and unremarkable, so they are left out of this chart.</Hint>
        </section>

        <section className="panel span-8" aria-labelledby="top-title">
          <header className="panel-head">
            <h2 id="top-title">Highest Magnitude</h2>
            <button type="button" className="link-button" onClick={() => filter({})}>All Findings</button>
          </header>
          {stats.top.length ? (
            <ul className="top-list">
              {stats.top.map(finding => (
                <li key={finding.rsid}>
                  <button type="button" onClick={() => open(finding)}>
                    <Magnitude value={finding.genotype.magnitude} />
                    <span className="top-main">
                      <span className="top-title"><span className="mono">{finding.rsid}</span>{finding.snp.gene && <span className="top-gene">{finding.snp.gene}</span>}<Pair alleles={finding.genotype.alleles} /></span>
                      <span className="top-summary">{finding.genotype.summary || 'No summary on SNPedia'}</span>
                    </span>
                    <ReputeTag repute={finding.genotype.repute} />
                  </button>
                </li>
              ))}
            </ul>
          ) : <p className="empty-inline">No findings above magnitude 0.</p>}
        </section>

        <section className="panel span-4" aria-labelledby="topics-title">
          <header className="panel-head">
            <h2 id="topics-title">Most Linked Topics</h2>
            <button type="button" className="link-button" onClick={() => go({ name: 'topics' })}>All Topics</button>
          </header>
          {stats.topTopics.length ? (
            <ul className="bar-list">
              {stats.topTopics.map(([topic, total]) => (
                <li key={topic}>
                  <button type="button" onClick={() => go({ name: 'topic', topic })}>
                    <span className="bar-list-row"><span className="bar-list-name">{topicName(topic, meta.topicKinds)}</span><span className="bar-list-kind">{groupLabel[groupOf(topic, meta.topicKinds)]}</span><span className="bar-list-value">{total}</span></span>
                    <Bar value={total} peak={stats.topTopics[0][1]} />
                  </button>
                </li>
              ))}
            </ul>
          ) : <p className="empty-inline">No linked genes or conditions yet.</p>}
        </section>

        <section className="panel span-12" aria-labelledby="chromosome-title">
          <header className="panel-head"><h2 id="chromosome-title">Matches by Chromosome</h2></header>
          <Columns
            className="columns-chromosome"
            columns={chromosomeOrder.map(chromosome => {
              const value = stats.chromosomes.get(chromosome) || 0
              return { key: chromosome, label: chromosome, value, description: `${count(value, 'finding')} on chromosome ${chromosome}` }
            })}
            onSelect={chromosome => filter({ chromosome, showZero: true })}
          />
        </section>

        <section className="panel span-7" aria-labelledby="sets-title">
          <header className="panel-head">
            <h2 id="sets-title">Genosets</h2>
            <button type="button" className="link-button" onClick={() => go({ name: 'genosets' })}>All Genosets</button>
          </header>
          {sets.length ? (
            <ul className="set-list">
              {sets.map(set => (
                <li key={set.title}>
                  <Magnitude value={set.magnitude} />
                  <span className="top-main"><span className="top-title"><span className="mono">{set.title}</span></span><span className="top-summary">{set.summary || 'No summary on SNPedia'}</span></span>
                  <ReputeTag repute={set.repute} />
                </li>
              ))}
            </ul>
          ) : <p className="empty-inline">No genosets matched this file.</p>}
          <Hint>{count(failures, 'genoset')} could not be checked, usually because the file is missing a variant they need.</Hint>
        </section>

        <section className="panel span-5" aria-labelledby="file-title">
          <header className="panel-head"><h2 id="file-title">This File</h2></header>
          <dl className="facts">
            <div><dt>Format</dt><dd>{facts.provider}</dd></div>
            <div><dt>Build</dt><dd>{facts.build}</dd></div>
            <div><dt>Called</dt><dd>{facts.calledCount.toLocaleString()} of {facts.snpCount.toLocaleString()}</dd></div>
            <div><dt>Chromosomal Pattern</dt><dd>{facts.chromosomalSex}</dd></div>
            <div><dt>Strand Unclear</dt><dd>{count(report.ambiguousCount || 0, 'call')} left out</dd></div>
            <div><dt>Reference</dt><dd>{meta.datasetCount.toLocaleString()} SNPedia entries</dd></div>
          </dl>
          <Hint>The chromosomal pattern is a rough guess from X and Y calls. Strand unclear means an A/T or C/G variant where your chip and SNPedia might read opposite DNA strands, so it was skipped rather than guessed.</Hint>
        </section>
      </div>
    </>
  )
}
