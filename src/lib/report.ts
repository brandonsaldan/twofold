import type { Finding, Genoset, Repute } from './types'
import type { FileFacts } from './file'

export type TopicKind = 'gene' | 'condition' | 'medicine'
export type TopicGroup = TopicKind | 'collection'

export type ReportData = {
  findings: Finding[]
  facts: FileFacts
  genosets: { matched: Genoset[]; failures: Record<string, string> }
  ambiguousCount?: number
}

export type ReportMeta = {
  sample: boolean
  fileName: string
  datasetCount: number
  snapshotAt: string
  topicKinds: Record<string, TopicKind>
}

export type SavedReport = ReportData & Partial<ReportMeta>

export const reputes: Repute[] = ['good', 'bad', 'unknown']

export const reputeLabel: Record<Repute, string> = { good: 'Good', bad: 'Bad', unknown: 'Unlabelled' }

export const groupLabel: Record<TopicGroup, string> = { gene: 'Gene', condition: 'Condition', medicine: 'Medicine', collection: 'Collection' }

export const groupPlural: Record<TopicGroup, string> = { gene: 'Genes', condition: 'Conditions', medicine: 'Medicines', collection: 'Collections' }

export const chromosomeOrder = [...Array.from({ length: 22 }, (_, index) => String(index + 1)), 'X', 'Y', 'MT']

export const magnitudeBuckets = [0, 1, 2, 3, 4, 5, 6]

const collectionNames: Record<string, string> = {
  apoe: 'APOE', bche: 'BCHE', cyp: 'CYP enzymes', dcdc2: 'DCDC2', drd4: 'DRD4', g6pd: 'G6PD', gch1: 'GCH1', hla: 'HLA', nat2: 'NAT2',
  gs: 'Genoset variants', medicine: 'Drug response', health: 'General health', drugbank: 'DrugBank', mendeliome: 'Mendeliome', micronutrients: 'Micronutrients', ageing: 'Ageing'
}

export function chromosomeOf(finding: Finding): string {
  const value = finding.snp.chromosome.replace(/^chr/i, '').toUpperCase()
  return value === 'M' ? 'MT' : value
}

export function topicsOf(finding: Finding): string[] {
  return [...new Set([...finding.snp.topics, ...finding.genotype.topics, ...finding.snp.collections])]
}

export function groupOf(topic: string, kinds: Record<string, TopicKind>): TopicGroup {
  return kinds[topic.toLowerCase()] || 'collection'
}

export function topicName(topic: string, kinds: Record<string, TopicKind>): string {
  const group = groupOf(topic, kinds)
  if (group === 'gene') return /[A-Z]/.test(topic) ? topic : topic.toUpperCase()
  if (group === 'collection' && collectionNames[topic.toLowerCase()]) return collectionNames[topic.toLowerCase()]
  return topic.charAt(0).toUpperCase() + topic.slice(1)
}

export function bucketOf(magnitude: number): number {
  return Math.min(Math.floor(magnitude), magnitudeBuckets[magnitudeBuckets.length - 1])
}

export function bucketLabel(bucket: number): string {
  if (bucket === 0) return '<1'
  return bucket === magnitudeBuckets[magnitudeBuckets.length - 1] ? `${bucket}+` : String(bucket)
}

export function pair(alleles: string[]): string {
  return `(${alleles.join(';')})`
}

export function formatDate(iso: string): string {
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? 'Unknown date' : date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
}

export function percent(value: number): string {
  if (value > 0 && value < 0.01) return '<1%'
  return `${Math.round(value * 100)}%`
}

export function count(value: number, singular: string, plural = `${singular}s`): string {
  return `${value.toLocaleString()} ${value === 1 ? singular : plural}`
}

export function snpediaUrl(title: string): string {
  return 'https://www.snpedia.com/index.php/' + encodeURIComponent(title.replaceAll(' ', '_'))
}

export function genotypeUrl(rsid: string, alleles: string[]): string {
  return 'https://www.snpedia.com/index.php/' + rsid.toLowerCase() + '(' + alleles.map(allele => allele.toUpperCase()).join(';') + ')'
}

export function pubmedUrl(id: string): string {
  return 'https://pubmed.ncbi.nlm.nih.gov/' + id + '/'
}

export type Segment = { text: string; href?: string }

export function noteSegments(body: string): Segment[] {
  let text = body
  let previous = ''
  while (previous !== text) {
    previous = text
    text = text.replace(/\{\{[^{}]*\}\}/g, ' ')
  }
  text = text.replace(/'{2,}/g, '').replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2').replace(/\[\[([^\]]+)\]\]/g, '$1').replace(/\s+/g, ' ').trim()
  const segments: Segment[] = []
  const pattern = /\[?PMID:?\s*(\d+)\]?|\[(https?:[^\s\]]+)(?:\s+([^\]]+))?\]/gi
  let cursor = 0
  for (const match of text.matchAll(pattern)) {
    if (match.index > cursor) segments.push({ text: text.slice(cursor, match.index) })
    if (match[1]) segments.push({ text: `PMID ${match[1]}`, href: pubmedUrl(match[1]) })
    else segments.push({ text: match[3] || hostOf(match[2]), href: match[2] })
    cursor = match.index + match[0].length
  }
  if (cursor < text.length) segments.push({ text: text.slice(cursor) })
  return segments
}

function hostOf(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, '') } catch { return 'source' }
}

export function referenceLink(reference: string): Segment {
  const pmid = reference.match(/PMID:?\s*(\d+)/i)
  if (pmid) return { text: `PMID ${pmid[1]}`, href: pubmedUrl(pmid[1]) }
  const doi = reference.match(/(10\.\d{4,9}\/\S+)/)
  if (doi) return { text: `DOI ${doi[1]}`, href: 'https://doi.org/' + doi[1] }
  if (/^https?:/i.test(reference)) return { text: hostOf(reference), href: reference }
  return { text: reference }
}

function csvCell(value: unknown): string {
  return `"${String(value ?? '').replaceAll('"', '""')}"`
}

function exportRows(findings: Finding[]) {
  return findings.map(finding => ({
    source: finding.source,
    rsid: finding.rsid,
    gene: finding.snp.gene,
    chromosome: finding.snp.chromosome,
    position: finding.snp.position,
    genotype: finding.genotype.alleles.join(';'),
    magnitude: finding.genotype.magnitude,
    repute: finding.genotype.repute,
    summary: finding.genotype.summary,
    topics: [...finding.snp.topics, ...finding.genotype.topics].join('; '),
    rareVariantCaution: finding.rareVariantCaution
  }))
}

export function toCsv(findings: Finding[]): string {
  const rows = exportRows(findings)
  const header = ['source', 'rsid', 'gene', 'chromosome', 'position', 'genotype', 'magnitude', 'repute', 'summary', 'topics', 'rareVariantCaution']
  return [header.map(csvCell).join(','), ...rows.map(row => header.map(key => csvCell(row[key as keyof typeof row])).join(','))].join('\n')
}

export function toJson(findings: Finding[], genosets: Genoset[], facts: FileFacts, snapshotAt: string): string {
  return JSON.stringify({ source: 'snpedia', snapshotAt, facts, findings: exportRows(findings), genosets }, null, 2)
}

export function download(name: string, content: string, type: string): void {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = name
  anchor.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
