import { useMemo } from 'react'
import type { Finding, Repute } from '../../lib/types'
import { chromosomeOf, chromosomeOrder, groupOf, groupPlural, reputeLabel, reputes, topicName, topicsOf, type TopicGroup } from '../../lib/report'
import { Dropdown, Hint, Icon } from '../ui'
import FindingTable from './FindingTable'
import type { ReportContext } from './Dashboard'

export type Filters = {
  query: string
  repute: Repute | ''
  minimum: number
  maximum: number | null
  chromosome: string
  topic: string
  showZero: boolean
  rare: boolean
  sort: 'magnitude' | 'position' | 'rsid'
}

export const emptyFilters: Filters = { query: '', repute: '', minimum: 0, maximum: null, chromosome: '', topic: '', showZero: false, rare: false, sort: 'magnitude' }

type Props = { context: ReportContext; filters: Filters; setFilters: (filters: Filters) => void }

function matches(finding: Finding, filters: Filters, query: string): boolean {
  const magnitude = finding.genotype.magnitude
  if (!filters.showZero && magnitude === 0 && filters.maximum === null) return false
  if (magnitude < filters.minimum) return false
  if (filters.maximum !== null && magnitude >= filters.maximum) return false
  if (filters.repute && finding.genotype.repute !== filters.repute) return false
  if (filters.rare && !finding.rareVariantCaution) return false
  if (filters.chromosome && chromosomeOf(finding) !== filters.chromosome) return false
  if (filters.topic && !topicsOf(finding).includes(filters.topic)) return false
  if (query && !`${finding.rsid} ${finding.snp.gene} ${topicsOf(finding).join(' ')} ${finding.genotype.summary}`.toLowerCase().includes(query)) return false
  return true
}

export function applyFilters(findings: Finding[], filters: Filters): Finding[] {
  const query = filters.query.trim().toLowerCase()
  const result = findings.filter(finding => matches(finding, filters, query))
  const position = (finding: Finding) => chromosomeOrder.indexOf(chromosomeOf(finding)) * 1e10 + (finding.snp.position || 0)
  if (filters.sort === 'position') return result.sort((a, b) => position(a) - position(b))
  if (filters.sort === 'rsid') return result.sort((a, b) => Number(a.rsid.replace(/\D/g, '')) - Number(b.rsid.replace(/\D/g, '')))
  return result.sort((a, b) => b.genotype.magnitude - a.genotype.magnitude || position(a) - position(b))
}

export default function FindingsView({ context, filters, setFilters }: Props) {
  const { report, meta } = context
  const visible = report.findings
  const results = useMemo(() => applyFilters(visible, filters), [visible, filters])
  const chromosomes = useMemo(() => chromosomeOrder.filter(value => report.findings.some(finding => chromosomeOf(finding) === value)), [report])
  const topicOptions = useMemo(() => {
    const groups: Record<TopicGroup, Map<string, number>> = { gene: new Map(), condition: new Map(), medicine: new Map(), collection: new Map() }
    const query = filters.query.trim().toLowerCase()
    const others = { ...filters, topic: '' }
    for (const finding of visible) {
      if (!matches(finding, others, query)) continue
      for (const topic of topicsOf(finding)) {
        const group = groups[groupOf(topic, meta.topicKinds)]
        group.set(topic, (group.get(topic) || 0) + 1)
      }
    }
    if (filters.topic) {
      const group = groups[groupOf(filters.topic, meta.topicKinds)]
      if (!group.has(filters.topic)) group.set(filters.topic, 0)
    }
    return (['condition', 'medicine', 'collection', 'gene'] as TopicGroup[]).map(group => ({ group, topics: [...groups[group].entries()].sort((a, b) => topicName(a[0], meta.topicKinds).localeCompare(topicName(b[0], meta.topicKinds))) })).filter(entry => entry.topics.length)
  }, [visible, filters, meta.topicKinds])
  const update = (patch: Partial<Filters>) => setFilters({ ...filters, ...patch })
  const active = filters.query || filters.repute || filters.minimum || filters.maximum !== null || filters.chromosome || filters.topic || filters.showZero || filters.rare

  return (
    <>
      <header className="view-head">
        <div>
          <h1>Findings</h1>
          <p>{results.length.toLocaleString()} of {visible.length.toLocaleString()} findings shown</p>
        </div>
      </header>

      <div className="toolbar" role="search">
        <label className="search">
          <Icon name="search" />
          <span className="visually-hidden">Search findings</span>
          <input type="search" value={filters.query} onChange={event => update({ query: event.target.value })} placeholder="Search by rsID, gene, condition or summary" />
        </label>
        <div className="segmented" role="group" aria-label="Repute">
          <button type="button" aria-pressed={filters.repute === ''} onClick={() => update({ repute: '' })}>All</button>
          {reputes.map(repute => <button key={repute} type="button" aria-pressed={filters.repute === repute} onClick={() => update({ repute })}>{reputeLabel[repute]}</button>)}
        </div>
        <div className="toolbar-row">
          <div className="select">
            <span aria-hidden="true">Magnitude</span>
            <Dropdown label="Magnitude" value={filters.maximum === null ? String(filters.minimum) : ''} onChange={value => update({ minimum: Number(value), maximum: null })} options={[
              ...(filters.maximum !== null ? [{ value: '', label: filters.minimum < 1 ? 'Under 1' : `${filters.minimum} to ${filters.maximum - 0.1}` }] : []),
              { value: '0', label: 'Any' },
              ...[1, 2, 3, 4, 5, 6].map(value => ({ value: String(value), label: `${value} and up` }))
            ]} />
          </div>
          <div className="select">
            <span aria-hidden="true">Chromosome</span>
            <Dropdown label="Chromosome" value={filters.chromosome} onChange={value => update({ chromosome: value })} options={[{ value: '', label: 'All' }, ...chromosomes.map(value => ({ value, label: value }))]} />
          </div>
          <div className="select select-wide">
            <span aria-hidden="true">Topic</span>
            <Dropdown label="Topic" value={filters.topic} onChange={value => update({ topic: value })} options={[
              { value: '', label: 'All topics' },
              ...topicOptions.flatMap(entry => entry.topics.map(([topic, total]) => ({ value: topic, label: `${topicName(topic, meta.topicKinds)} (${total})`, group: groupPlural[entry.group] })))
            ]} />
          </div>
          <div className="select">
            <span aria-hidden="true">Sort</span>
            <Dropdown label="Sort" value={filters.sort} onChange={value => update({ sort: value as Filters['sort'] })} options={[{ value: 'magnitude', label: 'Magnitude' }, { value: 'position', label: 'Position' }, { value: 'rsid', label: 'rsID' }]} />
          </div>
          <label className="check">
            <input type="checkbox" checked={filters.showZero} onChange={event => update({ showZero: event.target.checked })} />
            <span>Include magnitude 0</span>
          </label>
          <label className="check">
            <input type="checkbox" checked={filters.rare} onChange={event => update({ rare: event.target.checked })} />
            <span>Rare variants only</span>
          </label>
          {active && <button type="button" className="link-button" onClick={() => setFilters(emptyFilters)}>Clear filters</button>}
        </div>
      </div>

      <Hint>Magnitude is SNPedia's 0 to 10 rating of how notable a genotype is, not how risky it is. Repute is SNPedia's label for whether the genotype is generally good or bad to have. Magnitude 0 means common and unremarkable, so those are hidden unless you include them. Rare variants are high-magnitude findings on variants under 1% frequency, which consumer chips often get wrong.</Hint>

      {results.length ? <FindingTable context={context} findings={results} label="Findings" /> : (
        <div className="empty">
          <h2>No findings match these filters</h2>
          <p>Try a broader search, or include magnitude 0 findings.</p>
          <button type="button" className="button button-quiet" onClick={() => setFilters(emptyFilters)}>Clear filters</button>
        </div>
      )}
    </>
  )
}
