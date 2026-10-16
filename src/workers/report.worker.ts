import { parseDnaFile, type FileFacts } from '../lib/file'
import { evaluateGenosets, matchCalls } from '../lib/engine'
import { synthesizeSample, type FrequencyTable } from '../lib/sample'
import type { Dataset, DnaCall } from '../lib/types'

type Request = { type: 'process'; file: File } | { type: 'sample' }
type LongText = { snps: Record<string, { frequencies?: Record<string, number[]> }> }

const datasetPromise = fetch('/data/core.json').then(async response => {
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  const dataset = await response.json() as Dataset
  self.postMessage({ type: 'ready', count: dataset.snps.length, snapshotAt: dataset.snapshotAt, topicKinds: dataset.topicKinds || {} })
  return dataset
}).catch(error => {
  self.postMessage({ type: 'error', message: `The SNPedia reference data could not be loaded. ${String(error)}` })
  return null
})

let frequencyPromise: Promise<FrequencyTable> | null = null

function frequencies(): Promise<FrequencyTable> {
  frequencyPromise ??= fetch('/data/text.json').then(async response => {
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const text = await response.json() as LongText
    const table: FrequencyTable = {}
    for (const [rsid, entry] of Object.entries(text.snps)) if (entry.frequencies) table[rsid] = entry.frequencies
    return table
  })
  return frequencyPromise
}

function analyse(dataset: Dataset, calls: DnaCall[], facts: FileFacts) {
  self.postMessage({ type: 'stage', stage: 'matching' })
  let ambiguousCount = 0
  const normalizedCalls: Array<{ rsid: string; alleles: string[] }> = []
  const findings = matchCalls(calls, dataset, () => { ambiguousCount += 1 }, (rsid, alleles) => { normalizedCalls.push({ rsid, alleles }) })
  const genosets = evaluateGenosets(dataset.genosets, findings, normalizedCalls)
  self.postMessage({ type: 'complete', findings, facts, genosets, ambiguousCount })
}

self.onmessage = async (event: MessageEvent<Request>) => {
  try {
    const dataset = await datasetPromise
    if (!dataset) throw new Error('The SNPedia reference data is unavailable.')
    if (event.data.type === 'sample') {
      self.postMessage({ type: 'stage', stage: 'sample' })
      const { calls, facts } = synthesizeSample(dataset, await frequencies())
      analyse(dataset, calls, facts)
      return
    }
    self.postMessage({ type: 'stage', stage: 'reading' })
    const parsed = await parseDnaFile(event.data.file, new Set(dataset.snps.map(snp => snp.rsid)), fraction => self.postMessage({ type: 'progress', fraction }))
    if (!parsed.facts.snpCount) throw new Error('No genotype rows were found in this file.')
    analyse(dataset, parsed.calls, parsed.facts)
  } catch (error) {
    self.postMessage({ type: 'error', message: error instanceof Error ? error.message : String(error) })
  }
}
