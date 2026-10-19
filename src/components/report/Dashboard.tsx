import { useCallback, useEffect, useState, type FormEvent } from 'react'
import type { Finding } from '../../lib/types'
import { forgetReport, saveReport } from '../../lib/storage'
import { download, toCsv, toJson, type ReportData, type ReportMeta } from '../../lib/report'
import { supportCopy, supportLinks, type SupportLink } from '../../lib/support'
import SupportOptions, { SupportNote } from '../SupportOptions'
import { Icon, Modal } from '../ui'
import Overview from './Overview'
import FindingsView, { emptyFilters, type Filters } from './FindingsView'
import TopicsView from './TopicsView'
import TopicView from './TopicView'
import GenosetsView from './GenosetsView'
import DetailDrawer, { type Notes } from './DetailDrawer'
import PrintReport, { type PrintOptions } from './PrintReport'

export type View = { name: 'overview' } | { name: 'findings' } | { name: 'topics' } | { name: 'topic'; topic: string } | { name: 'genosets' }

export type ReportContext = {
  report: ReportData
  meta: ReportMeta
  open: (finding: Finding) => void
  go: (view: View) => void
  filter: (patch: Partial<Filters>) => void
}

type Props = { report: ReportData; meta: ReportMeta; saved: boolean; setSaved: (value: boolean) => void; onClose: () => void }
type DialogName = 'save' | 'print' | 'close' | 'export' | 'support' | null
type ExportFormat = 'csv' | 'json'
type LongText = { snps: Record<string, Notes> }

function viewFromHash(hash: string): View {
  const value = decodeURIComponent(hash.replace(/^#/, ''))
  if (value.startsWith('topic/')) return { name: 'topic', topic: value.slice(6) }
  if (value === 'findings' || value === 'topics' || value === 'genosets') return { name: value }
  return { name: 'overview' }
}

function hashFor(view: View): string {
  if (view.name === 'overview') return window.location.pathname
  if (view.name === 'topic') return `#topic/${encodeURIComponent(view.topic)}`
  return `#${view.name}`
}

export default function Dashboard({ report, meta, saved, setSaved, onClose }: Props) {
  const [view, setView] = useState<View>(() => viewFromHash(window.location.hash))
  const [filters, setFilters] = useState<Filters>(emptyFilters)
  const [selected, setSelected] = useState<Finding | null>(null)
  const [dialog, setDialog] = useState<DialogName>(null)
  const [supportLink, setSupportLink] = useState<SupportLink | null>(null)
  const openSupport = () => { setSupportLink(null); setDialog('support') }
  const closeSupport = () => setDialog(null)
  const [notes, setNotes] = useState<{ state: 'idle' | 'loading' | 'ready' | 'error'; data: LongText | null }>({ state: 'idle', data: null })
  const [printing, setPrinting] = useState<PrintOptions | null>(null)
  const [format, setFormat] = useState<ExportFormat>('csv')

  useEffect(() => {
    const sync = () => {
      const hash = window.location.hash
      if (hash && !/^#(?:findings|topics|genosets|topic\/)/.test(hash)) return
      setView(viewFromHash(hash))
    }
    window.addEventListener('popstate', sync)
    return () => window.removeEventListener('popstate', sync)
  }, [])

  useEffect(() => {
    if (!printing) return
    const done = () => setPrinting(null)
    window.addEventListener('afterprint', done)
    const frame = requestAnimationFrame(() => requestAnimationFrame(() => window.print()))
    return () => { cancelAnimationFrame(frame); window.removeEventListener('afterprint', done) }
  }, [printing])

  const go = useCallback((next: View) => {
    setView(next)
    window.history.pushState(null, '', hashFor(next))
    document.getElementById('report-main')?.focus({ preventScroll: true })
    window.scrollTo(0, 0)
  }, [])

  const filter = useCallback((patch: Partial<Filters>) => {
    setFilters({ ...emptyFilters, ...patch })
    go({ name: 'findings' })
  }, [go])

  const open = useCallback((finding: Finding) => {
    setSelected(finding)
    if (notes.state !== 'idle' && notes.state !== 'error') return
    setNotes({ state: 'loading', data: null })
    fetch('/data/text.json')
      .then(response => { if (!response.ok) throw new Error(String(response.status)); return response.json() as Promise<LongText> })
      .then(data => setNotes({ state: 'ready', data }))
      .catch(() => setNotes({ state: 'error', data: null }))
  }, [notes.state])

  const context: ReportContext = { report, meta, open, go, filter }

  const stem = meta.sample ? 'twofold-sample' : 'twofold-report'
  const tabs: Array<{ view: View; label: string; count?: number }> = [
    { view: { name: 'overview' }, label: 'Overview' },
    { view: { name: 'findings' }, label: 'Findings', count: report.findings.length },
    { view: { name: 'topics' }, label: 'Topics' },
    { view: { name: 'genosets' }, label: 'Genosets', count: report.genosets.matched.length }
  ]
  const current = view.name === 'topic' ? 'topics' : view.name

  const exportFile = (kind: ExportFormat) => {
    if (kind === 'csv') download(`${stem}.csv`, toCsv(report.findings), 'text/csv')
    else download(`${stem}.json`, toJson(report.findings, report.genosets.matched, report.facts, meta.snapshotAt), 'application/json')
  }

  const requestExport = (kind: ExportFormat) => {
    if (meta.sample) { exportFile(kind); return }
    setFormat(kind)
    setDialog('export')
  }

  const actions = (
    <>
      <button type="button" className="rail-action" onClick={() => setDialog('save')}><Icon name="lock" />{saved ? 'Saved on this device' : 'Save on this device'}</button>
      <button type="button" className="rail-action" onClick={() => setDialog('print')}><Icon name="print" />Print</button>
      <button type="button" className="rail-action" onClick={() => requestExport('csv')}><Icon name="download" />Export CSV</button>
      <button type="button" className="rail-action" onClick={() => requestExport('json')}><Icon name="download" />Export JSON</button>
      <button type="button" className="rail-action" onClick={() => meta.sample || saved ? onClose() : setDialog('close')}><Icon name="exit" />Close report</button>
    </>
  )

  return (
    <div className="dash" id="main">
      <aside className="rail" aria-label="Report">
        <div className="rail-head">
          <p className="rail-title">{meta.sample ? 'Sample Report' : 'Your Report'}</p>
          <p className="rail-file" title={meta.fileName}>{meta.fileName}</p>
        </div>
        <nav className="rail-nav" aria-label="Report sections">
          {tabs.map(tab => (
            <button key={tab.label} type="button" className={current === tab.view.name ? 'is-current' : ''} aria-current={current === tab.view.name ? 'page' : undefined} onClick={() => { if (tab.view.name === 'findings') setFilters(emptyFilters); go(tab.view) }}>
              <span>{tab.label}</span>
              {tab.count !== undefined && <span className="rail-count">{tab.count.toLocaleString()}</span>}
            </button>
          ))}
        </nav>
        <div className="rail-actions">{actions}</div>
        <details className="rail-menu">
          <summary>Save, print and export</summary>
          <div className="rail-menu-body">
            {actions}
            {supportLinks.length > 0 && <button type="button" className="rail-action rail-action-support" onClick={openSupport}><Icon name="heart" />Support Twofold</button>}
          </div>
        </details>
        <p className="rail-note">{meta.sample ? 'A made-up genome built from SNPedia population frequencies.' : saved ? 'An encrypted copy is saved in this browser.' : 'Not saved. Closing this tab clears the report.'}</p>
        {supportLinks.length > 0 && (
          <div className="rail-support">
            <p>Twofold is free and open source, with no ads or tracking.</p>
            <button type="button" className="rail-support-button" onClick={openSupport}><Icon name="heart" />Support Twofold</button>
          </div>
        )}
      </aside>

      <main className="dash-main" id="report-main" tabIndex={-1}>
        {view.name === 'overview' && <Overview context={context} />}
        {view.name === 'findings' && <FindingsView context={context} filters={filters} setFilters={setFilters} />}
        {view.name === 'topics' && <TopicsView context={context} />}
        {view.name === 'topic' && <TopicView context={context} topic={view.topic} />}
        {view.name === 'genosets' && <GenosetsView context={context} />}
      </main>

      <DetailDrawer finding={selected} context={context} notes={notes.state === 'ready' ? notes.data?.snps || null : null} notesState={notes.state} onClose={() => setSelected(null)} onTopic={topic => { setSelected(null); go({ name: 'topic', topic }) }} />

      <SaveDialog open={dialog === 'save'} saved={saved} onClose={() => setDialog(null)} onSave={async passphrase => { await saveReport({ ...report, ...meta }, passphrase); setSaved(true) }} onForget={async () => { await forgetReport(); setSaved(false) }} />

      <Modal open={dialog === 'export'} onClose={() => setDialog(null)} labelledBy="export-title" className="modal-small">
        <h2 id="export-title">Export as {format.toUpperCase()}</h2>
        <p>The file will list your genotypes and what SNPedia says about them, which may include findings about health conditions or other sensitive topics. The exported file is not encrypted, so anyone who opens it can read it.</p>
        <ExportNotice />
        <div className="modal-actions">
          <button type="button" className="button" onClick={() => { exportFile(format); setDialog(null) }}>Download {format.toUpperCase()}</button>
          <button type="button" className="button button-quiet" onClick={() => setDialog(null)}>Cancel</button>
        </div>
      </Modal>

      <PrintDialog open={dialog === 'print'} context={context} onClose={() => setDialog(null)} onPrint={options => { setDialog(null); setPrinting(options) }} />

      <Modal open={dialog === 'support'} onClose={closeSupport} labelledBy="support-title" className="modal-small">
        {supportLink ? <SupportNote key={supportLink.href} link={supportLink} titleId="support-title" onBack={() => setSupportLink(null)} onContinue={closeSupport} /> : <>
          <h2 id="support-title">Support Twofold</h2>
          <p>{supportCopy.lead}</p>
          <SupportOptions onLeave={closeSupport} onShared={setSupportLink} />
          <p className="support-note">{supportCopy.note} Links open in a new tab, so your report stays open here.</p>
          <div className="modal-actions">
            <button type="button" className="button button-quiet" onClick={closeSupport}>Not now</button>
          </div>
        </>}
      </Modal>

      <Modal open={dialog === 'close'} onClose={() => setDialog(null)} labelledBy="close-title" className="modal-small">
        <h2 id="close-title">Close this report?</h2>
        <p>The report has not been saved, so closing it clears it from this tab. Your original file is not affected.</p>
        <div className="modal-actions">
          <button type="button" className="button" onClick={onClose}>Close report</button>
          <button type="button" className="button button-quiet" onClick={() => setDialog(null)}>Keep it open</button>
        </div>
      </Modal>

      {printing && <PrintReport context={context} options={printing} />}
    </div>
  )
}

function ExportNotice({ lead = '' }: { lead?: string }) {
  return <p className="callout">{lead}Keep it somewhere private and think before sharing it or uploading it to another service. Once it leaves Twofold, Twofold cannot protect or delete it and is not responsible for how it is stored, shared or used.</p>
}

function SaveDialog({ open, saved, onClose, onSave, onForget }: { open: boolean; saved: boolean; onClose: () => void; onSave: (passphrase: string) => Promise<void>; onForget: () => Promise<void> }) {
  const [passphrase, setPassphrase] = useState('')
  const [confirm, setConfirm] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => { if (open) { setPassphrase(''); setConfirm(''); setMessage('') } }, [open])

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (passphrase.length < 8) { setMessage('Use a passphrase of at least 8 characters.'); return }
    if (passphrase !== confirm) { setMessage('The passphrases do not match.'); return }
    setBusy(true)
    try { await onSave(passphrase); setMessage('Saved. You can unlock it from the start page with this passphrase.'); setPassphrase(''); setConfirm('') }
    catch (error) { setMessage(error instanceof Error ? error.message : String(error)) }
    finally { setBusy(false) }
  }

  return (
    <Modal open={open} onClose={onClose} labelledBy="save-title">
      <form onSubmit={submit}>
        <h2 id="save-title">Save on this device</h2>
        <p>The report is encrypted with your passphrase and stored in this browser only. Your raw DNA file is never saved. If you forget the passphrase, the report cannot be recovered.</p>
        <label className="field"><span>Passphrase</span><input type="password" value={passphrase} onChange={event => setPassphrase(event.target.value)} autoComplete="new-password" minLength={8} required /></label>
        <label className="field"><span>Repeat passphrase</span><input type="password" value={confirm} onChange={event => setConfirm(event.target.value)} autoComplete="new-password" minLength={8} required /></label>
        <p className="form-message" role="status">{message}</p>
        <div className="modal-actions">
          <button type="submit" className="button" disabled={busy}>{busy ? 'Encrypting' : saved ? 'Replace saved copy' : 'Save encrypted copy'}</button>
          <button type="button" className="button button-quiet" onClick={onClose}>Done</button>
          {saved && <button type="button" className="link-button" onClick={async () => { await onForget(); setMessage('The saved copy was deleted from this browser.') }}>Delete saved copy</button>}
        </div>
      </form>
    </Modal>
  )
}

function PrintDialog({ open, context, onClose, onPrint }: { open: boolean; context: ReportContext; onClose: () => void; onPrint: (options: PrintOptions) => void }) {
  const [minimum, setMinimum] = useState(2)
  const choices = [{ value: 3, label: 'Magnitude 3 and up' }, { value: 2, label: 'Magnitude 2 and up' }, { value: 1, label: 'Magnitude 1 and up' }, { value: 0, label: 'Everything' }]
  return (
    <Modal open={open} onClose={onClose} labelledBy="print-title">
      <h2 id="print-title">Print or save as PDF</h2>
      <p>Choose which findings to include. Genosets are always included.</p>
      <fieldset className="choices">
        <legend>Findings</legend>
        {choices.map(choice => {
          const total = context.report.findings.filter(finding => finding.genotype.magnitude >= choice.value).length
          return (
            <label key={choice.value} className="choice">
              <input type="radio" name="print-minimum" checked={minimum === choice.value} onChange={() => setMinimum(choice.value)} />
              <span className="choice-text">{choice.label}</span>
              <span className="choice-count">{total.toLocaleString()}</span>
            </label>
          )
        })}
      </fieldset>
      {!context.meta.sample && <ExportNotice lead="The file will list your genotypes and what SNPedia says about them, which may include findings about health conditions or other sensitive topics. The exported file is not encrypted, so anyone who opens it can read it. " />}
      <div className="modal-actions">
        <button type="button" className="button" onClick={() => onPrint({ minimum })}>Print</button>
        <button type="button" className="button button-quiet" onClick={onClose}>Cancel</button>
      </div>
    </Modal>
  )
}
