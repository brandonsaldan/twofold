import { useRef, useState, type FormEvent } from 'react'
import { Icon, Magnitude, Pair, ReputeTag } from './ui'
import { Bar } from './report/charts'
import type { Repute } from '../lib/types'

type Props = {
  datasetError: string
  saved: boolean
  onFile: (file: File) => void
  onSample: () => void
  onUnlock: (passphrase: string) => Promise<void>
  onForgetSaved: () => Promise<void>
}

const providers = [
  { name: '23andMe', format: 'ZIP', path: ['Settings', 'Request raw data'], anchor: '23andme' },
  { name: 'AncestryDNA', format: 'ZIP or TXT', path: ['DNA Settings', 'Download DNA Data'], anchor: 'ancestrydna' },
  { name: 'MyHeritage', format: 'CSV', path: ['Manage DNA kits', 'Download'], anchor: 'myheritage' },
  { name: 'FamilyTreeDNA', format: 'CSV.GZ', path: ['Autosomal DNA', 'Download Raw Data'], anchor: 'familytreedna' },
  { name: 'Living DNA', format: 'TXT', path: ['Profiles', 'Download'], anchor: 'livingdna' },
  { name: 'Whole genome', format: 'VCF or VCF.GZ', path: ['Files or downloads', 'VCF file'], anchor: 'whole-genome' }
]

const sampleFindings: Array<{ rsid: string; gene: string; alleles: string[]; magnitude: number; repute: Repute; summary: string }> = [
  { rsid: 'rs1805007', gene: 'MC1R', alleles: ['C', 'T'], magnitude: 2.7, repute: 'bad', summary: 'Carrier of a red hair associated variant; higher risk of melanoma' },
  { rsid: 'rs53576', gene: 'OXTR', alleles: ['G', 'G'], magnitude: 2.5, repute: 'good', summary: 'Optimistic and empathetic; handle stress well' },
  { rsid: 'rs12913832', gene: 'HERC2', alleles: ['G', 'G'], magnitude: 2.5, repute: 'unknown', summary: 'Blue eye color, 99% of the time' }
]

const sampleTopics = [
  { name: 'Type-2 diabetes', kind: 'Condition', total: 41 },
  { name: "Crohn's disease", kind: 'Condition', total: 40 },
  { name: 'Coronary artery disease', kind: 'Condition', total: 34 },
  { name: 'CYP2D6', kind: 'Gene', total: 20 }
]

export default function Landing({ datasetError, saved, onFile, onSample, onUnlock, onForgetSaved }: Props) {
  const input = useRef<HTMLInputElement | null>(null)
  const [dragging, setDragging] = useState(false)
  const [passphrase, setPassphrase] = useState('')
  const [unlockError, setUnlockError] = useState('')
  const [unlocking, setUnlocking] = useState(false)

  function choose(file?: File) {
    if (file) onFile(file)
    if (input.current) input.current.value = ''
  }

  async function unlock(event: FormEvent) {
    event.preventDefault()
    setUnlocking(true)
    setUnlockError('')
    try { await onUnlock(passphrase); setPassphrase('') }
    catch (error) { setUnlockError(error instanceof Error ? error.message : String(error)) }
    finally { setUnlocking(false) }
  }

  return (
    <main className="landing" id="main">
      <section className="hero">
        <div className="hero-text">
          <p className="hero-byline">A project by <a className="byline-link" href="https://brandonsaldan.com">Brandon Saldan<span aria-hidden="true"> ↗</span></a></p>
          <h1>Read the rest of your DNA test.</h1>
          <p className="lede">Twofold reads your DNA test's raw data and explains what it says about your susceptibility to health conditions, response to medicines, and traits from metabolism to personality.</p>
          <ul className="hero-facts">
            <li><span>Free and <a className="hero-link" href="https://github.com/brandonsaldan/twofold">open source</a></span></li>
            <li>No account needed</li>
            <li>Nothing leaves your device</li>
          </ul>
        </div>
        <div className="hero-upload">
          <input ref={input} type="file" accept=".txt,.csv,.tsv,.vcf,.gz,.zip" hidden onChange={event => choose(event.target.files?.[0])} aria-label="Choose a raw DNA file" />
          <button
            type="button"
            className={`dropzone${dragging ? ' is-dragging' : ''}`}
            onClick={() => input.current?.click()}
            onDragOver={event => { event.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={event => { event.preventDefault(); setDragging(false); choose(event.dataTransfer.files[0]) }}
          >
            <span className="dropzone-icon"><Icon name="file" /></span>
            <span className="dropzone-title">Drop your raw DNA file here</span>
            <span className="dropzone-sub">or click to choose a file</span>
          </button>
          <div className="upload-actions">
            <button type="button" className="button" onClick={() => input.current?.click()}>Choose a file</button>
            <button type="button" className="button button-quiet" onClick={onSample}>Try a sample report</button>
          </div>
          <p className="hint">Accepts .txt, .csv, .zip, .gz and .vcf files. <a href="/get-data/">How to download your raw data</a></p>
          {datasetError && <p className="callout" role="alert">{datasetError}</p>}
          {saved && (
            <form className="unlock" onSubmit={unlock}>
              <div className="unlock-head">
                <Icon name="lock" />
                <div>
                  <h2>Open your saved report</h2>
                  <p>An encrypted report is stored in this browser.</p>
                </div>
              </div>
              <div className="unlock-row">
                <label className="field">
                  <span>Passphrase</span>
                  <input type="password" value={passphrase} onChange={event => setPassphrase(event.target.value)} autoComplete="current-password" required />
                </label>
                <button type="submit" className="button" disabled={unlocking}>{unlocking ? 'Unlocking' : 'Unlock'}</button>
              </div>
              {unlockError && <p className="callout" role="alert">{unlockError}</p>}
              <button type="button" className="link-button" onClick={onForgetSaved}>Delete the saved report</button>
            </form>
          )}
        </div>
      </section>

      <section className="showcase" aria-labelledby="showcase-title">
        <header className="section-head">
          <h2 id="showcase-title">Your genotypes, ranked and explained.</h2>
          <p>Every match between your file and SNPedia, organized into a dashboard you can sort, filter and search. Nothing to pay for and nothing to sign up for.</p>
        </header>

        <div className="feature">
          <div className="feature-text">
            <h3>Your most notable genotypes, first</h3>
            <p>Findings are ranked by SNPedia's magnitude, so the interesting results rise to the top. Each one explains what your genotype means and whether it is generally good or bad to have.</p>
            <ul className="feature-points">
              <li>Magnitude from 0 to 10</li>
              <li>Population frequencies</li>
              <li>Linked research</li>
            </ul>
          </div>
          <div className="stage" aria-hidden="true">
            <div className="stage-card">
              <div className="stage-stats">
                <span><strong>13,836</strong> matches</span>
                <span><strong>191</strong> notable</span>
                <span><strong>24</strong> genosets</span>
              </div>
              <ul className="preview-findings">
                {sampleFindings.map(finding => (
                  <li key={finding.rsid}>
                    <Magnitude value={finding.magnitude} />
                    <span className="preview-main">
                      <span className="preview-title"><span className="mono">{finding.rsid}</span><span className="preview-gene">{finding.gene}</span><Pair alleles={finding.alleles} /></span>
                      <span className="preview-summary">{finding.summary}</span>
                    </span>
                    <ReputeTag repute={finding.repute} />
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        <div className="feature feature-reverse">
          <div className="feature-text">
            <h3>Patterns that need more than one variant</h3>
            <p>Some traits only appear when several variants line up. Twofold checks every SNPedia genoset against your whole file and shows the combinations you match.</p>
            <ul className="feature-points">
              <li>283 genosets checked</li>
              <li>Criteria you can inspect</li>
            </ul>
          </div>
          <div className="stage" aria-hidden="true">
            <div className="combine">
              <div className="combine-inputs">
                <span className="variant-chip"><span className="mono">rs1801131</span><span className="variant-allele">C</span></span>
                <span className="variant-chip"><span className="mono">rs1801133</span><span className="variant-allele">T</span></span>
              </div>
              <svg className="combine-lines" viewBox="0 0 200 44" preserveAspectRatio="none" focusable="false">
                <path d="M50 0C50 26 100 18 100 44M150 0C150 26 100 18 100 44" />
              </svg>
              <div className="stage-card set-card">
                <div className="set-head">
                  <Magnitude value={2.9} />
                  <span className="mono">Gs192</span>
                  <ReputeTag repute="bad" />
                </div>
                <p className="set-summary">MTHFR polymorphisms affecting homocysteine</p>
              </div>
            </div>
          </div>
        </div>

        <div className="feature">
          <div className="feature-text">
            <h3>Follow a thread through your results</h3>
            <p>Every finding links to the genes, conditions and medicines SNPedia connects it to, so you can move from one result to everything related.</p>
            <ul className="feature-points">
              <li>Genes and conditions</li>
              <li>Medicines and drug response</li>
            </ul>
          </div>
          <div className="stage" aria-hidden="true">
            <div className="stage-card">
              <p className="stage-label">Most Linked Topics</p>
              <ul className="preview-topics">
                {sampleTopics.map(topic => (
                  <li key={topic.name}>
                    <span className="preview-topic-row"><span className="preview-topic-name">{topic.name}</span><span className="preview-topic-kind">{topic.kind}</span><span className="preview-topic-total">{topic.total}</span></span>
                    <Bar value={topic.total} peak={sampleTopics[0].total} />
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        <p className="showcase-note">All examples come from the sample report, which uses a made-up genome. <a href="/report/">Open the sample report<Icon name="arrow" /></a></p>
      </section>

      <section className="providers" aria-labelledby="providers-title">
        <header className="section-head">
          <h2 id="providers-title">Works with the test you already took.</h2>
          <p>Download the raw data file from your testing service and open it here exactly as it comes. ZIP and GZ files do not need to be unzipped.</p>
        </header>
        <ul className="provider-cards">
          {providers.map(provider => (
            <li key={provider.name} className="provider-card">
              <div className="provider-card-head">
                <h3>{provider.name}</h3>
                <span className="provider-format">{provider.format}</span>
              </div>
              <p className="provider-path">
                {provider.path.map((step, index) => <span key={step}>{index > 0 && <span className="path-sep" aria-hidden="true">›</span>}{step}</span>)}
              </p>
              <a className="provider-guide" href={`/get-data/#${provider.anchor}`}>Full guide<Icon name="arrow" /></a>
            </li>
          ))}
        </ul>
      </section>

      <section className="closing" aria-labelledby="closing-title">
        <div>
          <h2 id="closing-title">Your raw data has more to say.</h2>
          <p>It takes a few seconds, and your file never leaves this browser.</p>
        </div>
        <div className="closing-actions">
          <button type="button" className="button button-inverse" onClick={() => input.current?.click()}>Choose a file</button>
          <button type="button" className="button button-inverse-quiet" onClick={onSample}>Try a sample report</button>
        </div>
      </section>
    </main>
  )
}
