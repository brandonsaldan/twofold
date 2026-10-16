import { gzipSync } from 'node:zlib'
import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises'
import { resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import { links, parseGenoset, parseGenotype, parseSnp } from '../src/lib/wiki.ts'
import { cleanCriterion, evaluateGenosets } from '../src/lib/engine.ts'
import type { Dataset, Genoset, Genotype, Snp } from '../src/lib/types.ts'

const raw = process.env.TWOFOLD_RAW_DIR ? pathToFileURL(resolve(process.env.TWOFOLD_RAW_DIR) + sep) : new URL('../data/raw/', import.meta.url)
const output = process.env.TWOFOLD_OUTPUT_DIR ? pathToFileURL(resolve(process.env.TWOFOLD_OUTPUT_DIR) + sep) : new URL('../public/data/', import.meta.url)
const membershipSource = await readFile(new URL('memberships.json', raw), 'utf8').catch(() => readFile(new URL('../data/memberships.json', import.meta.url), 'utf8'))
const memberships: Record<string, string[]> = JSON.parse(membershipSource)
const collections: Record<string, string[]> = JSON.parse(await readFile(new URL('../data/collections.json', import.meta.url), 'utf8'))
const expectedTitles = new Set(Object.values(memberships).flat().map(title => title.toLowerCase()))
for (const title of memberships['Is a genoset'] || []) expectedTitles.add(`${title.toLowerCase()}/criteria`)
const snapshot = await readFile(new URL('snapshot.json', raw), 'utf8').then(JSON.parse).catch(() => ({ fetchedAt: '', titleCount: 0 }))
const wanted = (category: string) => memberships[category] || []
const lower = (values: string[]) => new Set(values.map(value => value.toLowerCase()))
const snpTitles = lower(wanted('Is a snp'))
const genotypeTitles = lower(wanted('Is a genotype'))
const genosetTitles = lower(wanted('Is a genoset'))
const topicTitles = lower(['Is a gene', 'Is a medical condition', 'Is a medicine'].flatMap(wanted))
const topicKinds = Object.fromEntries(([
  ['Is a gene', 'gene'], ['Is a medical condition', 'condition'], ['Is a medicine', 'medicine']
] as const).flatMap(([category, kind]) => wanted(category).map(title => [title.toLowerCase(), kind]))) as Record<string, 'gene' | 'condition' | 'medicine'>
const chipMembership = new Map<string, string[]>()
const collectionMembership = new Map<string, string[]>()
const failures: Record<string, number> = {}
const failure = (reason: string) => { failures[reason] = (failures[reason] || 0) + 1 }
function safeParse<T>(kind: string, parse: () => T | null): T | null {
  try {
    const result = parse()
    if (!result) failure(`${kind} template missing or malformed`)
    return result
  } catch (error) {
    failure(`${kind} parse exception: ${error instanceof Error ? error.name : 'unknown'}`)
    return null
  }
}
for (const [category, titles] of Object.entries(memberships)) {
  if (!category.toLowerCase().startsWith('on chip')) continue
  for (const title of titles) {
    const id = title.toLowerCase()
    chipMembership.set(id, [...(chipMembership.get(id) || []), category.replace(/^On chip\s*/i, '')])
  }
}
for (const [collection, ids] of Object.entries(collections)) for (const id of ids) collectionMembership.set(id.toLowerCase(), [...(collectionMembership.get(id.toLowerCase()) || []), collection])
const snps = new Map<string, Snp>()
const genotypes = new Map<string, Genotype>()
const genosets = new Map<string, Genoset>()
const criteria = new Map<string, string>(Object.entries(JSON.parse(await readFile(new URL('../data/criteria.json', import.meta.url), 'utf8'))))
const seen = new Set<string>()
let pagesFetched = 0
const fetchedTitles = new Set<string>()
let topicPages = 0
let pagesMissingRevision = 0
function processPage(title: string, source: string, names: string[]) {
  names.forEach(name => seen.add(name))
  if (names.some(name => topicTitles.has(name))) topicPages += 1
  const snpTitle = names.find(name => snpTitles.has(name))
  if (snpTitle) {
    const parsed = safeParse('SNP', () => parseSnp(title, source))
    if (parsed) snps.set(parsed.rsid, { ...parsed, chips: chipMembership.get(snpTitle) || [], collections: collectionMembership.get(parsed.rsid) || [], topics: links(source).filter(link => topicTitles.has(link.toLowerCase())), genotypes: [] })
  }
  if (names.some(name => genotypeTitles.has(name))) {
    const parsed = safeParse('genotype', () => parseGenotype(title, source))
    if (parsed) { parsed.topics = parsed.topics.filter(link => topicTitles.has(link.toLowerCase())); genotypes.set(parsed.title.toLowerCase(), parsed) }
  }
  if (names.some(name => genosetTitles.has(name))) {
    const parsed = safeParse('genoset', () => parseGenoset(title, source))
    if (parsed) { parsed.topics = parsed.topics.filter(link => topicTitles.has(link.toLowerCase())); genosets.set(parsed.title.toLowerCase(), parsed) }
  }
  if (names.some(name => name.endsWith('/criteria') && genosetTitles.has(name.slice(0, -9)))) criteria.set(title.toLowerCase().slice(0, -9), source)
}
const pageFiles = (await readdir(new URL('pages/', raw)).catch(() => [])).filter(filename => filename.endsWith('.json')).sort()
for (const filename of pageFiles) {
  const response = JSON.parse(await readFile(new URL(`pages/${filename}`, raw), 'utf8'))
  const redirectNames = new Map<string, string[]>()
  for (const redirect of response.query?.redirects || []) redirectNames.set(redirect.to.toLowerCase(), [...(redirectNames.get(redirect.to.toLowerCase()) || []), redirect.from.toLowerCase()])
  for (const page of Object.values(response.query?.pages || {}) as any[]) {
    const title = page.title.toLowerCase()
    const names = [title, ...(redirectNames.get(title) || [])]
    const source = page.revisions?.[0]?.slots?.main?.['*']
    if (typeof source !== 'string') { failure('missing revision'); pagesMissingRevision += 1; continue }
    pagesFetched += 1
    fetchedTitles.add(title)
    processPage(page.title, source, names)
  }
}
for (const title of snpTitles) if (!seen.has(title)) failure('SNP page missing')
for (const title of genotypeTitles) if (!seen.has(title)) failure('genotype page missing')
for (const title of genosetTitles) if (!seen.has(title)) failure('genoset page missing')
for (const title of topicTitles) if (!seen.has(title)) failure('topic page missing')
let syntheticSnps = 0
for (const genotype of genotypes.values()) {
  let snp = snps.get(genotype.rsid)
  if (!snp) {
    snp = {
      rsid: genotype.rsid,
      gene: '',
      chromosome: '',
      position: null,
      orientation: '',
      stabilizedOrientation: '',
      gmaf: null,
      canonical: [],
      frequencies: {},
      chips: chipMembership.get(genotype.rsid) || [],
      collections: collectionMembership.get(genotype.rsid) || [],
      topics: [],
      body: '',
      genotypes: []
    }
    snps.set(genotype.rsid, snp)
    syntheticSnps += 1
  }
  snp.genotypes.push(genotype)
}
const byName = (a: string, b: string) => a.toLowerCase() < b.toLowerCase() ? -1 : a.toLowerCase() > b.toLowerCase() ? 1 : 0
let canonicalDerived = 0
for (const snp of snps.values()) {
  snp.genotypes.sort((a, b) => byName(a.title, b.title))
  const canonical = new Set(snp.canonical.map(value => value.replace(/[()]/g, '').toUpperCase().split(';').sort().join(';')))
  for (const genotype of snp.genotypes) {
    const value = [...genotype.alleles].map(allele => allele.toUpperCase()).sort().join(';')
    if (canonical.has(value)) continue
    snp.canonical.push(`(${value})`)
    canonical.add(value)
    canonicalDerived += 1
  }
}
for (const set of genosets.values()) {
  set.criteria = cleanCriterion(criteria.get(set.title.toLowerCase()) || '').replaceAll('\u2014', ' - ')
  if (!set.criteria) failure('genoset criteria missing')
}
const builtAt = new Date().toISOString()
const dataset: Dataset = { version: 1, builtAt, snapshotAt: snapshot.fetchedAt, source: 'snpedia', topicKinds, snps: [...snps.values()].sort((a, b) => byName(a.rsid, b.rsid)), genosets: [...genosets.values()].sort((a, b) => byName(a.title, b.title)) }
const longText = {
  version: 1,
  builtAt,
  snapshotAt: dataset.snapshotAt,
  source: 'snpedia',
  snps: Object.fromEntries(dataset.snps.map(snp => [snp.rsid, { body: snp.body, frequencies: snp.frequencies, genotypes: Object.fromEntries(snp.genotypes.map(genotype => [genotype.title, { body: genotype.body, references: genotype.references }])) }])),
  genosets: Object.fromEntries(dataset.genosets.map(set => [set.title, { body: set.body }]))
}
const core = { ...dataset, snps: dataset.snps.map(({ body, frequencies, genotypes, ...snp }) => ({ ...snp, genotypes: genotypes.map(({ body, references, ...genotype }) => genotype) })), genosets: dataset.genosets.map(({ body, ...set }) => set) }
await mkdir(output, { recursive: true })
const coreJson = JSON.stringify(core).replaceAll('\u2014', ' - ')
const longJson = JSON.stringify(longText).replaceAll('\u2014', ' - ')
await writeFile(new URL('core.json', output), coreJson)
await writeFile(new URL('text.json', output), longJson)
const genosetEvaluation = evaluateGenosets(dataset.genosets, [])
const criteriaFunctions: Record<string, number> = {}
for (const set of dataset.genosets) for (const match of set.criteria.matchAll(/\b([a-z][a-z0-9_]*)\s*\(/gi)) if (!/^(?:rs|i)\d+$/i.test(match[1])) criteriaFunctions[match[1].toLowerCase()] = (criteriaFunctions[match[1].toLowerCase()] || 0) + 1
const report = {
  pagesFetched,
  pagesFetchedUnique: fetchedTitles.size,
  pagesExpected: expectedTitles.size,
  categoriesEnumerated: Object.keys(memberships).length,
  chipCategories: Object.keys(memberships).filter(category => category.toLowerCase().startsWith('on chip')).length,
  internalSnpIds: wanted('Is a snp').filter(title => /^i\d+$/i.test(title)).length,
  pageBatches: pageFiles.length,
  pagesMissingRevision,
  topicPages,
  snpsParsed: snps.size,
  syntheticSnps,
  canonicalDerived,
  genotypesParsed: genotypes.size,
  genosetsParsed: genosets.size,
  genosetCriteriaFunctions: criteriaFunctions,
  genosetEvaluationFailures: Object.fromEntries(Object.entries(genosetEvaluation.failures).filter(([, reason]) => reason !== 'Insufficient genotype coverage')),
  failures,
  coreGzipBytes: gzipSync(coreJson).byteLength,
  textGzipBytes: gzipSync(longJson).byteLength
}
await writeFile(process.env.TWOFOLD_REPORT_PATH || new URL('../data/build-report.json', import.meta.url), JSON.stringify(report, null, 2).replaceAll('\u2014', ' - '))
process.stdout.write(`${JSON.stringify(report, null, 2).replaceAll('\u2014', ' - ')}\n`)
