import { useEffect, useState } from 'react'
import type { Finding } from '../../lib/types'
import { chromosomeOf, genotypeUrl, groupLabel, groupOf, noteSegments, pair, populations, referenceLink, topicName, topicsOf } from '../../lib/report'
import { Hint, Icon, Magnitude, Modal, Pair, ReputeTag, Rich } from '../ui'
import type { ReportContext } from './Dashboard'

export type Notes = { body: string; frequencies: Record<string, number[]>; genotypes: Record<string, { body: string; references: string[] }> }

type Props = { finding: Finding | null; context: ReportContext; notes: Record<string, Notes> | null; notesState: 'idle' | 'loading' | 'ready' | 'error'; onClose: () => void; onTopic: (topic: string) => void }

export default function DetailDrawer({ finding, context, notes, notesState, onClose, onTopic }: Props) {
  const [shown, setShown] = useState<Finding | null>(finding)
  useEffect(() => { if (finding) setShown(finding) }, [finding])
  const current = finding || shown
  return (
    <Modal open={Boolean(finding)} onClose={onClose} labelledBy="detail-title" className="drawer">
      {current && <Detail key={current.rsid} finding={current} context={context} notes={notes?.[current.rsid] || null} notesState={notesState} onClose={onClose} onTopic={onTopic} />}
    </Modal>
  )
}

type DetailProps = Omit<Props, 'finding' | 'notes'> & { finding: Finding; notes: Notes | null }

function Detail({ finding, context, notes, notesState, onClose, onTopic }: DetailProps) {
  const { meta } = context
  const ownKey = finding.genotype.title.toLowerCase()
  const genotypeNotes = notes && Object.entries(notes.genotypes).find(([title]) => title.toLowerCase() === ownKey)?.[1]
  const frequencies = notes ? Object.entries(notes.frequencies).filter(([, values]) => values.some(value => value > 0)) : []
  const topics = topicsOf(finding)
  const body = genotypeNotes?.body || ''
  const snpBody = notes?.body || ''

  return (
    <article className="detail">
      <header className="detail-head">
        <div>
          <p className="detail-gene">{[finding.snp.gene || 'No gene listed', chromosomeOf(finding) && `chromosome ${chromosomeOf(finding)}${finding.snp.position ? `, position ${finding.snp.position.toLocaleString()}` : ''}`].filter(Boolean).join(' · ')}</p>
          <h2 id="detail-title"><span className="mono">{finding.rsid}</span> <Pair alleles={finding.genotype.alleles} /></h2>
        </div>
        <button type="button" className="icon-button" onClick={onClose} aria-label="Close"><Icon name="close" /></button>
      </header>

      <p className="detail-summary">{finding.genotype.summary || 'SNPedia has an entry for this genotype without a summary.'}</p>

      <div className="detail-badges">
        <Magnitude value={finding.genotype.magnitude} label />
        <ReputeTag repute={finding.genotype.repute} />
      </div>

      {finding.rareVariantCaution && <p className="callout">This is a rare variant. Consumer chips often report rare variants that are not really there, so confirm it with a clinical test before acting on it.</p>}
      {finding.orientation === 'complemented' && <Hint>Your file reports this variant on the opposite DNA strand from SNPedia, so the letters were flipped to match. Your raw file shows {pair(finding.userAlleles)}.</Hint>}

      <section className="detail-section" aria-labelledby="genotypes-title">
        <h3 id="genotypes-title">Possible genotypes</h3>
        <table className="genotype-table">
          <thead><tr><th scope="col">Genotype</th><th scope="col">Magnitude</th><th scope="col">Summary</th></tr></thead>
          <tbody>
            {finding.snp.genotypes.map(genotype => {
              const own = genotype.title === finding.genotype.title
              return (
                <tr key={genotype.title} className={own ? 'is-own' : ''}>
                  <td><Pair alleles={genotype.alleles} />{own && <span className="own-tag">Yours</span>}</td>
                  <td className="mono">{genotype.magnitude.toFixed(1)}</td>
                  <td>{genotype.summary || 'No summary'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </section>

      {topics.length > 0 && (
        <section className="detail-section" aria-labelledby="links-title">
          <h3 id="links-title">Linked topics</h3>
          <ul className="chips">
            {topics.map(topic => <li key={topic}><button type="button" onClick={() => onTopic(topic)}>{topicName(topic, meta.topicKinds)} <span>{groupLabel[groupOf(topic, meta.topicKinds)]}</span></button></li>)}
          </ul>
        </section>
      )}

      {notesState === 'loading' && <p className="hint" role="status">Loading notes and population data</p>}
      {notesState === 'error' && <p className="callout" role="alert">The longer notes could not be loaded. The summary above is still complete.</p>}

      {frequencies.length > 0 && (
        <section className="detail-section" aria-labelledby="frequency-title">
          <h3 id="frequency-title">How common each genotype is</h3>
          <Hint>Share of people with each genotype in the study groups SNPedia lists. These describe the samples, not you.</Hint>
          <div className="table-scroll">
            <table className="frequency-table">
              <thead><tr><th scope="col">Group</th>{finding.snp.canonical.map(value => <th key={value} scope="col" className="mono">{value}</th>)}</tr></thead>
              <tbody>
                {frequencies.map(([population, values]) => (
                  <tr key={population}>
                    <th scope="row"><abbr title={populations[population] || population}>{population}</abbr></th>
                    {finding.snp.canonical.map((value, index) => <td key={value} className="mono">{values[index] !== undefined ? `${values[index]}%` : ''}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {(body || snpBody) && (
        <section className="detail-section" aria-labelledby="notes-title">
          <h3 id="notes-title">Notes from SNPedia</h3>
          {body && <p className="detail-notes"><Rich segments={noteSegments(body)} /></p>}
          {snpBody && <p className="detail-notes"><Rich segments={noteSegments(snpBody)} /></p>}
        </section>
      )}

      {genotypeNotes && genotypeNotes.references.length > 0 && (
        <section className="detail-section" aria-labelledby="references-title">
          <h3 id="references-title">References</h3>
          <ul className="references">
            {genotypeNotes.references.map(reference => { const link = referenceLink(reference); return <li key={reference}>{link.href ? <a href={link.href} target="_blank" rel="noreferrer">{link.text}</a> : link.text}</li> })}
          </ul>
        </section>
      )}

      <footer className="detail-foot">
        <p>Chips that test this variant: {finding.snp.chips.join(', ') || 'none listed'}.</p>
        <a href={genotypeUrl(finding.rsid, finding.genotype.alleles)} target="_blank" rel="noreferrer">Open this entry on SNPedia</a>
      </footer>
    </article>
  )
}
