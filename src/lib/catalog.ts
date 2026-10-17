import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Dataset, Genoset, Genotype, Snp } from './types'
import { groupOf, populations, topicName, type TopicKind } from './report'

type Notes = { body: string; frequencies: Record<string, number[]>; genotypes: Record<string, { body: string; references: string[] }> }
type TextData = { snps: Record<string, Notes>; genosets: Record<string, { body: string }> }

export type TopicLink = { topic: string; name: string; kind: TopicKind; slug: string | null }

export type SnpBrief = { rsid: string; gene: string; letters: string; pair: string; alleles: string[]; magnitude: number; repute: Genotype['repute']; summary: string }

export type Provider = { name: string; versions: string[] }

export type Share = { population: string; values: number[] }

export type SnpEntry = {
  snp: Snp
  notes: Notes
  top: Genotype
  gene: TopicLink | null
  topics: TopicLink[]
  flipped: boolean
  indexed: boolean
  notable: boolean
  providers: Provider[]
  related: SnpBrief[]
  genosets: Genoset[]
  shares: Share[]
}

export type TopicCount = { name: string; slug: string | null; kind: TopicKind; count: number }

export type TopicEntry = {
  slug: string
  name: string
  kind: TopicKind
  notable: SnpEntry[]
  others: string[]
  genosets: Genoset[]
  indexed: boolean
  documented: number
  notableCount: number
  genes: TopicCount[]
  related: TopicCount[]
}

export type Catalog = {
  snapshotAt: string
  genosetCount: number
  recordCount: number
  genotypeCount: number
  minimum: number
  snps: SnpEntry[]
  topics: TopicEntry[]
}

export const notableMagnitude = 2

const complement: Record<string, string> = { A: 'T', T: 'A', C: 'G', G: 'C' }

function fileAlleles(snp: Snp, alleles: string[]): string[] {
  const minus = snp.stabilizedOrientation.toLowerCase() === 'minus'
  return alleles.map(allele => minus ? complement[allele] || allele : allele).sort()
}

export function fileLetters(snp: Snp, alleles: string[]): string {
  return fileAlleles(snp, alleles).join('')
}

export function filePair(snp: Snp, alleles: string[]): string {
  return fileAlleles(snp, alleles).join(';')
}

export function genotypeSlug(snp: Snp, alleles: string[]): string {
  const parts = fileAlleles(snp, alleles).map(allele => allele === '-' ? 'del' : allele.toLowerCase().replace(/[^a-z0-9]/g, ''))
  return parts.every(part => part.length === 1) ? parts.join('') : parts.join('-')
}

const kindPaths: Record<TopicKind, string> = { gene: 'genes', condition: 'conditions', medicine: 'medicines' }

export function kindPath(kind: TopicKind): string {
  return `/${kindPaths[kind]}/`
}

export function topicHref(kind: TopicKind, slug: string): string {
  return `/${kindPaths[kind]}/${slug}/`
}

export function snpHref(rsid: string): string {
  return `/snps/${rsid}/`
}

export function chromosomeOf(snp: Snp): string {
  const value = snp.chromosome.replace(/^chr/i, '').toUpperCase()
  return value === 'M' ? 'MT' : value
}

export function chromosomeHref(chromosome: string): string {
  return `/snps/chromosomes/${chromosome ? chromosome.toLowerCase() : 'unplaced'}/`
}

export function chromosomeLabel(chromosome: string): string {
  return chromosome ? (chromosome === 'MT' ? 'Mitochondrial DNA' : `Chromosome ${chromosome}`) : 'Unplaced'
}

export function genotypeHref(entry: SnpEntry, alleles: string[]): string {
  const slug = genotypeSlug(entry.snp, alleles)
  return entry.indexed ? `/snps/${entry.snp.rsid}/${slug}/` : `/snps/${entry.snp.rsid}/#${slug}`
}

function substantial(notes: Notes): boolean {
  const length = notes.body.length + Object.values(notes.genotypes).reduce((total, genotype) => total + genotype.body.length, 0)
  return length >= 500 || Object.values(notes.frequencies).some(values => values.some(value => value > 0))
}

export function topicSlug(topic: string): string {
  return topic.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

export function namedGene(gene: string): string {
  return /^LOC\d+$/i.test(gene) ? '' : gene
}

export function clip(text: string, limit: number): string {
  if (text.length <= limit) return text
  const cut = text.slice(0, limit - 1)
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), limit / 2)).replace(/[\s,;:.=(]+$/, '')}…`
}

export function describe(head: string, tail: string, limit = 160): string {
  const room = limit - tail.length - 1
  if (head.length <= room) return `${head} ${tail}`
  const cut = head.slice(0, room - 1)
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), room / 2)).replace(/[\s,;:.]+$/, '')}… ${tail}`
}

const providerNames: Array<[RegExp, string]> = [[/^23andMe v(\d+)$/, '23andMe'], [/^Ancestry (v\w+)$/, 'AncestryDNA'], [/^FTDNA(\d*)$/, 'FamilyTreeDNA'], [/^NatGeo(\d*)$/, 'National Geographic']]

function providersOf(snp: Snp): Provider[] {
  const found = new Map<string, string[]>()
  for (const chip of snp.chips) {
    const known = providerNames.find(([pattern]) => pattern.test(chip))
    const name = known ? known[1] : 'Research arrays'
    const version = known ? chip.match(known[0])![1] : chip
    found.set(name, [...(found.get(name) || []), version].filter(Boolean))
  }
  const order = ['23andMe', 'AncestryDNA', 'FamilyTreeDNA', 'National Geographic', 'Research arrays']
  return [...found.entries()].sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0])).map(([name, versions]) => ({ name, versions: versions.map(version => /^\d+$/.test(version) ? `v${version}` : version) }))
}

export function importance(magnitude: number): string {
  if (magnitude >= 4) return 'Very important'
  if (magnitude >= 3) return 'Important'
  if (magnitude >= 2) return 'Worth knowing'
  if (magnitude >= 1) return 'Minor'
  return 'Typical'
}

export const pairKey = (alleles: string[]) => [...alleles].sort().join(';')

function sharesOf(snp: Snp, notes: Notes): Share[] {
  const columns = snp.canonical.map(value => value.replace(/[()]/g, '').toUpperCase().split(';').sort().join(';'))
  const labels = new Set<string>()
  return Object.entries(notes.frequencies).filter(([population, values]) => {
    const label = populations[population] || population
    if (labels.has(label) || !values.some(value => value > 0)) return false
    labels.add(label)
    return true
  }).map(([population, values]) => ({
    population,
    values: snp.genotypes.map(genotype => { const index = columns.indexOf(pairKey(genotype.alleles)); return index >= 0 && Number.isFinite(values[index]) ? values[index] : 0 })
  }))
}

function brief(snp: Snp, genotype: Genotype): SnpBrief {
  return { rsid: snp.rsid, gene: snp.gene, letters: fileLetters(snp, genotype.alleles), pair: filePair(snp, genotype.alleles), alleles: genotype.alleles, magnitude: genotype.magnitude, repute: genotype.repute, summary: genotype.summary }
}

function strongest(snp: Snp): Genotype {
  return snp.genotypes.reduce((best, genotype) => genotype.magnitude > best.magnitude ? genotype : best, snp.genotypes[0])
}

function displayName(key: string, kind: TopicKind, seen: Map<string, number> | undefined): string {
  if (kind === 'gene' && seen) {
    const cased = [...seen.entries()].filter(([value]) => /[A-Z]/.test(value)).sort((a, b) => b[1] - a[1])[0]
    if (cased) return cased[0]
  }
  const spellings = [...(seen?.keys() || [])]
  const words = key.split(' ').map((word, index) => {
    for (const spelling of spellings) {
      const found = spelling.split(' ')[index]
      if (!found || found.toLowerCase() !== word) continue
      if (found.length > 1 && found === found.toUpperCase() && /[A-Z]/.test(found)) return found
    }
    return word
  }).join(' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}

let cached: Catalog | null = null

export function loadCatalog(): Catalog {
  if (cached) return cached
  const core = JSON.parse(readFileSync(join(process.cwd(), 'public/data/core.json'), 'utf8')) as Dataset
  const text = JSON.parse(readFileSync(join(process.cwd(), 'public/data/text.json'), 'utf8')) as TextData
  const kinds = { ...core.topicKinds } as Record<string, TopicKind>
  const notable = core.snps.filter(snp => snp.genotypes.length > 0 && (snp.genotypes.some(genotype => genotype.magnitude >= notableMagnitude) || substantial(text.snps[snp.rsid] || { body: '', frequencies: {}, genotypes: {} })))
  for (const snp of notable) for (const genotype of snp.genotypes) if (/^(?:none|n\/a)\.?$/i.test(genotype.summary.trim())) genotype.summary = ''
  const notableIds = new Set(notable.map(snp => snp.rsid))
  for (const snp of notable) if (snp.gene && !kinds[snp.gene.toLowerCase()]) kinds[snp.gene.toLowerCase()] = 'gene'
  const linked = (snp: Snp) => [...(snp.gene && kinds[snp.gene.toLowerCase()] === 'gene' ? [snp.gene] : []), ...snp.topics, ...snp.genotypes.flatMap(genotype => genotype.topics)]

  const spellings = new Map<string, Map<string, number>>()
  const members = new Map<string, { notable: Set<string>; others: Set<string> }>()
  for (const snp of core.snps) {
    const keys = new Set<string>()
    for (const topic of linked(snp)) {
      const key = topic.toLowerCase()
      if (!kinds[key]) continue
      const seen = spellings.get(key) || new Map<string, number>()
      seen.set(topic, (seen.get(topic) || 0) + 1)
      spellings.set(key, seen)
      keys.add(key)
    }
    for (const key of keys) {
      const slug = topicSlug(key)
      const entry = members.get(slug) || { notable: new Set<string>(), others: new Set<string>() }
      entry[notableIds.has(snp.rsid) ? 'notable' : 'others'].add(snp.rsid)
      members.set(slug, entry)
    }
  }

  const slugKeys = new Map<string, string[]>()
  for (const key of spellings.keys()) {
    const slug = topicSlug(key)
    slugKeys.set(slug, [...(slugKeys.get(slug) || []), key])
  }
  const topicPages = new Set([...members.entries()].filter(([, entry]) => entry.notable.size > 0).map(([slug]) => slug))

  const setsByRsid = new Map<string, Genoset[]>()
  for (const set of core.genosets) for (const rsid of new Set((set.criteria.toLowerCase().match(/\b(?:rs|i)\d+/g) || []))) setsByRsid.set(rsid, [...(setsByRsid.get(rsid) || []), set])
  const byGene = new Map<string, SnpBrief[]>()
  for (const snp of notable) if (snp.gene) {
    const list = byGene.get(snp.gene.toLowerCase()) || []
    list.push(brief(snp, strongest(snp)))
    byGene.set(snp.gene.toLowerCase(), list)
  }
  for (const list of byGene.values()) list.sort((a, b) => b.magnitude - a.magnitude || a.rsid.localeCompare(b.rsid, 'en', { numeric: true }))

  const entries = new Map<string, SnpEntry>()
  for (const snp of notable) {
    const seen = new Set<string>()
    const topics: TopicLink[] = []
    for (const topic of linked(snp)) {
      const key = topic.toLowerCase()
      if (seen.has(key) || groupOf(key, kinds) === 'collection') continue
      seen.add(key)
      const kind = kinds[key]
      const slug = topicSlug(key)
      topics.push({ topic, name: displayName(key, kind, spellings.get(key)), kind, slug: topicPages.has(slug) ? slug : null })
    }
    const notes = text.snps[snp.rsid] || { body: '', frequencies: {}, genotypes: {} }
    const gene = snp.gene ? topics.find(topic => topic.kind === 'gene' && topic.topic.toLowerCase() === snp.gene.toLowerCase()) || null : null
    const flipped = snp.genotypes.some(genotype => fileLetters(snp, genotype.alleles) !== [...genotype.alleles].sort().join(''))
    const related = (byGene.get(snp.gene.toLowerCase()) || []).slice(0, 9).filter(other => other.rsid !== snp.rsid).slice(0, 8)
    const genosets = (setsByRsid.get(snp.rsid) || []).map(set => ({ ...set, body: '' })).sort((a, b) => b.magnitude - a.magnitude)
    entries.set(snp.rsid, { snp, notes, top: strongest(snp), gene, topics, flipped, indexed: substantial(notes), notable: snp.genotypes.some(genotype => genotype.magnitude >= notableMagnitude), providers: providersOf(snp), related, genosets, shares: sharesOf(snp, notes) })
  }

  const byMagnitude = (a: SnpEntry, b: SnpEntry) => Number(b.indexed) - Number(a.indexed) || b.top.magnitude - a.top.magnitude || a.snp.rsid.localeCompare(b.snp.rsid, 'en', { numeric: true })
  const topics: TopicEntry[] = []
  for (const slug of topicPages) {
    const keys = slugKeys.get(slug) || []
    const main = keys.sort((a, b) => (spellings.get(b)?.size || 0) - (spellings.get(a)?.size || 0))[0]
    const kind = kinds[main]
    const group = members.get(slug)!
    const listed = [...group.notable].map(rsid => entries.get(rsid)!).sort(byMagnitude)
    const genosets = core.genosets.filter(set => set.topics.some(topic => keys.includes(topic.toLowerCase()))).map(set => ({ ...set, body: text.genosets[set.title]?.body || '' })).sort((a, b) => b.magnitude - a.magnitude)
    topics.push({
      slug,
      name: displayName(main, kind, spellings.get(main)),
      kind,
      notable: listed,
      others: [...group.others].sort((a, b) => a.localeCompare(b, 'en', { numeric: true })),
      genosets,
      indexed: listed.some(entry => entry.indexed) || genosets.length > 0 || listed.length >= 5,
      documented: listed.filter(entry => entry.indexed).length,
      notableCount: listed.filter(entry => entry.notable).length,
      genes: [],
      related: []
    })
  }
  topics.sort((a, b) => a.slug.localeCompare(b.slug))
  const tally = (links: TopicLink[]) => {
    const counts = new Map<string, TopicCount>()
    for (const link of links) {
      const id = link.slug || link.name.toLowerCase()
      const current = counts.get(id) || { name: link.name, slug: link.slug, kind: link.kind, count: 0 }
      current.count += 1
      counts.set(id, current)
    }
    return [...counts.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
  }
  for (const topic of topics) {
    const others = topic.notable.flatMap(entry => entry.topics.filter((link, index, all) => link.slug !== topic.slug && all.findIndex(other => other.slug === link.slug && other.name === link.name) === index))
    topic.genes = topic.kind === 'gene' ? [] : tally(others.filter(link => link.kind === 'gene')).slice(0, 12)
    topic.related = tally(others.filter(link => link.kind !== 'gene' && link.slug)).slice(0, 12)
  }

  cached = { snapshotAt: core.snapshotAt, genosetCount: core.genosets.length, recordCount: core.snps.length, genotypeCount: core.snps.reduce((total, snp) => total + snp.genotypes.length, 0), minimum: notableMagnitude, snps: [...entries.values()], topics }
  return cached
}
