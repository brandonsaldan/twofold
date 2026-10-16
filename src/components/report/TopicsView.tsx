import { useMemo, useState } from 'react'
import { groupLabel, groupOf, groupPlural, topicName, topicsOf, type TopicGroup } from '../../lib/report'
import { Hint, Icon } from '../ui'
import { Bar } from './charts'
import type { ReportContext } from './Dashboard'

const groups: TopicGroup[] = ['condition', 'medicine', 'collection', 'gene']
const pageSize = 120

export default function TopicsView({ context }: { context: ReportContext }) {
  const { report, meta, go } = context
  const visible = report.findings
  const [group, setGroup] = useState<TopicGroup | ''>('')
  const [query, setQuery] = useState('')
  const [limit, setLimit] = useState(pageSize)

  const topics = useMemo(() => {
    const totals = new Map<string, { total: number; bad: number; good: number }>()
    for (const finding of visible) for (const topic of topicsOf(finding)) {
      const entry = totals.get(topic) || { total: 0, bad: 0, good: 0 }
      entry.total += 1
      if (finding.genotype.repute === 'bad') entry.bad += 1
      if (finding.genotype.repute === 'good') entry.good += 1
      totals.set(topic, entry)
    }
    return [...totals.entries()].map(([topic, entry]) => ({ topic, name: topicName(topic, meta.topicKinds), group: groupOf(topic, meta.topicKinds), ...entry })).sort((a, b) => Number(a.group === 'collection') - Number(b.group === 'collection') || b.total - a.total || a.name.localeCompare(b.name))
  }, [visible, meta.topicKinds])

  const counts = useMemo(() => Object.fromEntries(groups.map(value => [value, topics.filter(topic => topic.group === value).length])) as Record<TopicGroup, number>, [topics])
  const shown = topics.filter(topic => (!group || topic.group === group) && (!query || topic.name.toLowerCase().includes(query.trim().toLowerCase())))
  const peak = shown[0]?.total || 1

  return (
    <>
      <header className="view-head">
        <div>
          <h1>Topics</h1>
          <p>{topics.length.toLocaleString()} genes, conditions, medicines and collections linked to your findings</p>
        </div>
      </header>

      <div className="toolbar">
        <label className="search">
          <Icon name="search" />
          <span className="visually-hidden">Filter topics</span>
          <input type="search" value={query} onChange={event => { setQuery(event.target.value); setLimit(pageSize) }} placeholder="Filter topics" />
        </label>
        <div className="segmented" role="group" aria-label="Topic type">
          <button type="button" aria-pressed={group === ''} onClick={() => { setGroup(''); setLimit(pageSize) }}>All</button>
          {groups.map(value => <button key={value} type="button" aria-pressed={group === value} onClick={() => { setGroup(value); setLimit(pageSize) }}>{groupPlural[value]} <span className="segment-count">{counts[value]}</span></button>)}
        </div>
      </div>

      <Hint>Topics come from links inside SNPedia entries. Collections are hand-picked groups, such as appearance or drug response, carried over from GeneCodex.</Hint>

      {shown.length ? (
        <>
          <ul className="topic-grid">
            {shown.slice(0, limit).map(topic => (
              <li key={topic.topic}>
                <button type="button" onClick={() => go({ name: 'topic', topic: topic.topic })}>
                  <span className="topic-row">
                    <span className="topic-name">{topic.name}</span>
                    <span className="topic-total">{topic.total.toLocaleString()}</span>
                  </span>
                  <Bar value={topic.total} peak={peak} />
                  <span className="topic-meta">{groupLabel[topic.group]}{topic.bad ? ` · ${topic.bad} bad` : ''}{topic.good ? ` · ${topic.good} good` : ''}</span>
                </button>
              </li>
            ))}
          </ul>
          {shown.length > limit && <button type="button" className="button button-quiet more" onClick={() => setLimit(value => value + pageSize)}>Show {Math.min(pageSize, shown.length - limit)} more of {shown.length - limit} remaining</button>}
        </>
      ) : (
        <div className="empty">
          <h2>No topics match</h2>
          <p>Try another name or switch the topic type to All.</p>
        </div>
      )}
    </>
  )
}
