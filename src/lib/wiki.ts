import type { Genoset, Genotype, Repute, Snp } from './types'

type Template = { name: string; fields: Record<string, string>; values: string[]; start: number; end: number }

const clean = (value: string) => value.replaceAll('\u2014', ' - ').replace(/\s+/g, ' ').trim()
const key = (value: string) => value.trim().toLowerCase().replace(/[\s_]+/g, '')

function topLevelParts(value: string): string[] {
  const parts: string[] = []
  let start = 0
  let templates = 0
  let links = 0
  for (let index = 0; index < value.length; index += 1) {
    const pair = value.slice(index, index + 2)
    if (pair === '{{') { templates += 1; index += 1 }
    else if (pair === '}}') { templates -= 1; index += 1 }
    else if (pair === '[[') { links += 1; index += 1 }
    else if (pair === ']]') { links -= 1; index += 1 }
    else if (value[index] === '|' && templates === 0 && links === 0) {
      parts.push(value.slice(start, index))
      start = index + 1
    }
  }
  parts.push(value.slice(start))
  return parts
}

export function templates(value: string): Template[] {
  const found: Template[] = []
  for (let index = 0; index < value.length - 1; index += 1) {
    if (value.slice(index, index + 2) !== '{{') continue
    const start = index
    let depth = 1
    index += 2
    while (index < value.length - 1 && depth > 0) {
      const pair = value.slice(index, index + 2)
      if (pair === '{{') { depth += 1; index += 2 }
      else if (pair === '}}') { depth -= 1; index += 2 }
      else index += 1
    }
    if (depth !== 0) break
    const end = index
    const parts = topLevelParts(value.slice(start + 2, end - 2))
    const fields: Record<string, string> = {}
    const values: string[] = []
    for (const part of parts.slice(1)) {
      const separator = part.indexOf('=')
      if (separator < 0) values.push(clean(part))
      else fields[key(part.slice(0, separator))] = clean(part.slice(separator + 1))
    }
    found.push({ name: key(parts[0]), fields, values, start, end })
    index = end - 1
  }
  return found
}

export function readable(value: string): string {
  return clean(value.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, title, label) => label || title)
    .replace(/\{\{[^{}]*\}\}/g, '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\[https?:\/\/[^\s\]]+\s+([^\]]+)\]/g, '$1'))
}

export function links(value: string): string[] {
  return [...new Set([...value.matchAll(/\[\[([^\]|#]+)(?:[^\]]*)\]\]/g)].map(match => clean(match[1])))].filter(Boolean)
}

export function references(value: string): string[] {
  const refs = [...value.matchAll(/(?:PMID\s*\|?\s*|PMID\s+)(\d{5,9})|(?:doi\s*\|\s*|doi:\s*)(10\.\d{4,9}\/[\w.()\/:;-]+)/gi)]
  return [...new Set(refs.map(match => match[1] ? `PMID ${match[1]}` : `DOI ${match[2]}`))]
}

function repute(value: string): Repute {
  const normalized = value.toLowerCase()
  return normalized === 'good' || normalized === 'bad' ? normalized : 'unknown'
}

function number(value: string): number | null {
  const parsed = Number(value)
  return value && Number.isFinite(parsed) ? parsed : null
}

export function parseSnp(title: string, source: string): Omit<Snp, 'chips' | 'collections' | 'topics' | 'genotypes'> | null {
  const parsed = templates(source)
  const main = parsed.find(template => template.name === 'rsnum' || template.name === '23andmesnp')
  if (!main) return null
  const frequency = parsed.find(template => template.name === 'populationdiversity')
  const canonical = Object.entries(main.fields).filter(([name]) => /^geno\d+$/.test(name)).sort(([a], [b]) => Number(a.slice(4)) - Number(b.slice(4))).map(([, value]) => value)
  const frequencies: Record<string, number[]> = {}
  if (frequency) {
    const raw = source.slice(frequency.start, frequency.end)
    for (const line of raw.split('\n')) {
      const parts = line.split('|').map(item => item.trim())
      if (parts.length > 2 && /^[A-Z]{2,5}$/.test(parts[1])) frequencies[parts[1]] = parts.slice(2).map(Number).filter(Number.isFinite)
    }
  }
  return {
    rsid: /^(?:rs|i)\d+$/i.test(title) ? title.toLowerCase() : /^(?:rs|i)\d+$/i.test(main.fields.rsid || '') ? main.fields.rsid.toLowerCase() : `rs${main.fields.rsid || title.match(/\d+/)?.[0] || ''}`.toLowerCase(),
    gene: main.fields.gene || main.fields.genes || '',
    chromosome: main.fields.chromosome || '',
    position: number(main.fields.position),
    orientation: main.fields.orientation || '',
    stabilizedOrientation: main.fields.stabilizedorientation || '',
    gmaf: number(main.fields.gmaf),
    canonical,
    frequencies,
    body: readable(source.slice(main.end))
  }
}

export function parseGenotype(title: string, source: string): Genotype | null {
  const main = templates(source).find(template => template.name === 'genotype')
  if (!main) return null
  const candidate = title.match(/^(?:rs|i)\d+\(/i)?.[0].slice(0, -1) || main.fields.rsid || title.match(/(?:rs|i)\d+/i)?.[0] || ''
  const rsid = /^(?:rs|i)\d+$/i.test(candidate) ? candidate.toLowerCase() : `rs${candidate}`.toLowerCase()
  const titleAlleles = title.match(/\(([^;)]*)(?:;([^)]*))?\)\s*$/)
  const alleles = titleAlleles ? [titleAlleles[1], titleAlleles[2]].filter(Boolean) : [main.fields.allele1, main.fields.allele2].filter(Boolean)
  if (!/^(?:rs|i)\d+$/.test(rsid) || !alleles.length) return null
  return {
    title,
    rsid,
    alleles: alleles.map(allele => allele.toUpperCase()),
    magnitude: number(main.fields.magnitude) ?? 0,
    repute: repute(main.fields.repute || ''),
    summary: readable(main.fields.summary || ''),
    body: readable(source.slice(main.end)),
    references: references(source),
    topics: links(source)
  }
}

export function parseGenoset(title: string, source: string, criteria = ''): Genoset | null {
  const main = templates(source).find(template => template.name === 'genoset')
  if (!main) return null
  return {
    title,
    magnitude: number(main.fields.magnitude) ?? 0,
    repute: repute(main.fields.repute || ''),
    summary: readable(main.fields.summary || ''),
    body: readable(source.slice(main.end)),
    criteria: clean(criteria),
    topics: links(source)
  }
}
