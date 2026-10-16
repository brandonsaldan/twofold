import { useEffect, useRef, useState } from 'react'
import Landing from './Landing'
import Dashboard from './report/Dashboard'
import { forgetReport, hasSavedReport, unlockReport } from '../lib/storage'
import { type ReportData, type ReportMeta, type SavedReport, type TopicKind } from '../lib/report'

type Stage =
  | { name: 'landing' }
  | { name: 'working'; step: 'loading' | 'reading' | 'sample' | 'matching'; fraction: number | null }
  | { name: 'error'; message: string }
  | { name: 'gate' }
  | { name: 'report' }

type Job = { type: 'process'; file: File } | { type: 'sample' }

const stepText = {
  loading: 'Loading the SNPedia reference data',
  reading: 'Reading your file',
  sample: 'Building the sample genome',
  matching: 'Matching against SNPedia'
}

export default function App({ startWithSample = false }: { startWithSample?: boolean }) {
  const worker = useRef<Worker | null>(null)
  const ready = useRef(false)
  const queued = useRef<Job | null>(null)
  const pendingMeta = useRef<Pick<ReportMeta, 'sample' | 'fileName'>>({ sample: false, fileName: '' })
  const [stage, setStage] = useState<Stage>(startWithSample ? { name: 'working', step: 'loading', fraction: null } : { name: 'landing' })
  const [report, setReport] = useState<ReportData | null>(null)
  const [meta, setMeta] = useState<ReportMeta>({ sample: false, fileName: '', datasetCount: 0, snapshotAt: '', topicKinds: {} })
  const [datasetError, setDatasetError] = useState('')
  const [saved, setSaved] = useState(false)
  const reference = useRef({ datasetCount: 0, snapshotAt: '', topicKinds: {} as Record<string, TopicKind> })

  useEffect(() => { hasSavedReport().then(setSaved).catch(() => setSaved(false)) }, [])

  useEffect(() => {
    const instance = new Worker(new URL('../workers/report.worker.ts', import.meta.url), { type: 'module' })
    worker.current = instance
    instance.onmessage = event => {
      const message = event.data
      if (message.type === 'ready') {
        ready.current = true
        reference.current = { datasetCount: message.count, snapshotAt: message.snapshotAt, topicKinds: message.topicKinds }
        setMeta(current => ({ ...current, ...reference.current }))
        if (queued.current) { instance.postMessage(queued.current); queued.current = null }
      }
      if (message.type === 'stage') setStage({ name: 'working', step: message.stage, fraction: null })
      if (message.type === 'progress') setStage({ name: 'working', step: 'reading', fraction: message.fraction })
      if (message.type === 'error') {
        if (!ready.current && !queued.current) setDatasetError(message.message)
        else setStage({ name: 'error', message: message.message })
        queued.current = null
      }
      if (message.type === 'complete') {
        const data = message as ReportData
        setReport(data)
        setMeta({ ...reference.current, ...pendingMeta.current })
        setStage({ name: 'gate' })
      }
    }
    if (startWithSample) run({ type: 'sample' }, { sample: true, fileName: 'Sample genome' })
    return () => instance.terminate()
  }, [])

  useEffect(() => {
    if (!report || meta.sample) return
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [report, meta.sample])

  useEffect(() => { window.scrollTo(0, 0) }, [stage.name])

  function run(job: Job, details: Pick<ReportMeta, 'sample' | 'fileName'>) {
    pendingMeta.current = details
    setReport(null)
    setStage({ name: 'working', step: ready.current ? (job.type === 'sample' ? 'sample' : 'reading') : 'loading', fraction: null })
    if (ready.current) worker.current?.postMessage(job)
    else queued.current = job
    if (job.type === 'sample' && window.location.pathname !== '/report/') window.history.pushState(null, '', '/report/')
  }

  async function unlock(passphrase: string) {
    const restored = await unlockReport<SavedReport>(passphrase)
    const { sample = false, fileName = 'Saved report', datasetCount, snapshotAt, topicKinds, ...data } = restored
    setReport(data)
    setMeta({ sample, fileName, datasetCount: datasetCount || reference.current.datasetCount, snapshotAt: snapshotAt || reference.current.snapshotAt, topicKinds: topicKinds || reference.current.topicKinds })
    setStage({ name: 'gate' })
  }

  async function forgetSaved() {
    await forgetReport()
    setSaved(false)
  }

  function close() {
    setReport(null)
    setStage({ name: 'landing' })
    window.history.replaceState(null, '', '/')
  }

  if (stage.name === 'landing') {
    return <Landing datasetError={datasetError} saved={saved} onFile={file => run({ type: 'process', file }, { sample: false, fileName: file.name })} onSample={() => run({ type: 'sample' }, { sample: true, fileName: 'Sample genome' })} onUnlock={unlock} onForgetSaved={forgetSaved} />
  }

  if (stage.name === 'working') {
    return (
      <main className="state" id="main">
        <div className="state-body" aria-live="polite">
          <h1>{stage.step === 'sample' || pendingMeta.current.sample ? 'Preparing the sample report' : 'Reading your file'}</h1>
          <p className="state-step">{stepText[stage.step]}{stage.fraction !== null ? `, ${Math.round(stage.fraction * 100)}%` : ''}</p>
          {stage.fraction !== null ? <progress className="progress" max={1} value={stage.fraction} aria-label={stepText[stage.step]} /> : <progress className="progress" aria-label={stepText[stage.step]} />}
          <p className="hint">{stage.step === 'loading' ? 'The reference data downloads once and is then cached on this device.' : 'This runs on your device. Large files take a few seconds.'}</p>
        </div>
      </main>
    )
  }

  if (stage.name === 'error') {
    return (
      <main className="state" id="main">
        <div className="state-body">
          <h1>That file could not be read</h1>
          <p className="callout" role="alert">{stage.message}</p>
          <p>Twofold reads raw data exports from 23andMe, AncestryDNA, MyHeritage, FamilyTreeDNA and Living DNA, plus VCF files from whole genome sequencing. Make sure you chose the raw data file itself, not a PDF or a report summary.</p>
          <div className="upload-actions">
            <button type="button" className="button" onClick={close}>Choose another file</button>
            <a className="button button-quiet" href="/get-data/">How to get your raw data</a>
          </div>
        </div>
      </main>
    )
  }

  if (!report) return null

  if (stage.name === 'gate') {
    return (
      <main className="state" id="main">
        <div className="state-body">
          <h1 className="single-line">Before you open {meta.sample ? 'the sample report' : 'your report'}</h1>
          <p className="lede">{meta.sample ? 'This report' : 'Your report'} may include findings about serious health conditions, such as Alzheimer's disease, cancer and inherited disorders. Some of it may be unexpected or upsetting.</p>
          <p className="acknowledge-intro">By opening the report, you acknowledge that:</p>
          <ul className="acknowledge">
            <li>Twofold makes no guarantee that the report, or any entry in it, is accurate or complete.</li>
            <li>Every entry comes from SNPedia, a community-edited wiki. Entries describe associations found in research and are not a diagnosis.</li>
            <li>Consumer DNA tests sometimes report variants that are not really there, especially rare ones.</li>
            <li>Twofold is not medical advice. Talk to a doctor or genetic counselor about anything in the report before acting on it.</li>
          </ul>
          <div className="upload-actions">
            <button type="button" className="button" onClick={() => setStage({ name: 'report' })}>I understand, open the report</button>
            <button type="button" className="button button-quiet" onClick={close}>Go back</button>
          </div>
        </div>
      </main>
    )
  }

  return <Dashboard report={report} meta={meta} saved={saved} setSaved={setSaved} onClose={close} />
}
