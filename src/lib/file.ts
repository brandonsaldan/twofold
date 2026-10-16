import type { DnaCall } from './types'
import { Unzip, UnzipInflate } from 'fflate'

export type FileFacts = {
  provider: string
  build: string
  snpCount: number
  calledCount: number
  callRate: number
  chromosomalSex: string
}

export type ParsedFile = { calls: DnaCall[]; facts: FileFacts }

async function* bytes(file: File, progress: (fraction: number) => void): AsyncGenerator<Uint8Array> {
  let bytesRead = 0
  const count = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      bytesRead += chunk.byteLength
      progress(Math.min(0.99, bytesRead / file.size))
      controller.enqueue(chunk)
    }
  })
  const source = file.stream().pipeThrough(count)
  const name = file.name.toLowerCase()
  if (name.endsWith('.zip')) {
    const queue: Uint8Array[] = []
    let selected = false
    let failure: Error | null = null
    const unzip = new Unzip(entry => {
      if (selected || !/\.(txt|csv|vcf)$/i.test(entry.name)) return
      selected = true
      entry.ondata = (error, chunk) => { if (error) failure = error; else queue.push(chunk) }
      entry.start()
    })
    unzip.register(UnzipInflate)
    const reader = source.getReader()
    while (true) {
      const result = await reader.read()
      if (result.done) break
      unzip.push(result.value)
      if (failure) throw failure
      while (queue.length) yield queue.shift()!
    }
    unzip.push(new Uint8Array(), true)
    if (failure) throw failure
    while (queue.length) yield queue.shift()!
    if (!selected) throw new Error('The ZIP file has no supported DNA data file')
  } else {
    const stream = name.endsWith('.gz') ? source.pipeThrough(new DecompressionStream('gzip') as unknown as TransformStream<Uint8Array, Uint8Array>) : source
    const reader = stream.getReader()
    while (true) {
      const result = await reader.read()
      if (result.done) break
      yield result.value
    }
  }
  progress(1)
}

async function* lines(file: File, progress: (fraction: number) => void): AsyncGenerator<string> {
  const decoder = new TextDecoder()
  let remainder = ''
  for await (const chunk of bytes(file, progress)) {
    const text = remainder + decoder.decode(chunk, { stream: true })
    const parts = text.split(/\r?\n/)
    remainder = parts.pop() || ''
    for (const line of parts) yield line
  }
  remainder += decoder.decode()
  if (remainder) yield remainder
}

function alleles(value: string): string[] {
  const normalized = value.trim().toUpperCase()
  if (['--', '00', 'NN', '.', './.', '.|.'].includes(normalized)) return []
  if (normalized.includes('/') || normalized.includes('|')) return normalized.split(/[\/|]/).filter(Boolean)
  return normalized.length <= 2 ? [...normalized] : [normalized]
}

export async function parseDnaFile(file: File, wanted: Set<string>, progress: (fraction: number) => void = () => {}): Promise<ParsedFile> {
  let provider = /family.?finder|ftdna|family.?tree.?dna/i.test(file.name) ? 'FamilyTreeDNA' : /myheritage/i.test(file.name) ? 'MyHeritage' : 'Unknown format'
  let build = 'Not stated'
  let snpCount = 0
  let calledCount = 0
  let xHeterozygous = 0
  let xCalled = 0
  let yCalled = 0
  const calls: DnaCall[] = []
  let delimiter = '\t'
  let header: string[] = []
  for await (const raw of lines(file, progress)) {
    const line = raw.replace(/^\uFEFF/, '').trim()
    if (!line) continue
    if (line.startsWith('#')) {
      if (/synthetic sample/i.test(line)) provider = 'Synthetic sample'
      if (/23andme/i.test(line)) provider = '23andMe'
      if (/ancestrydna/i.test(line)) provider = 'AncestryDNA'
      if (/myheritage/i.test(line)) provider = 'MyHeritage'
      if (/family\s*tree\s*dna|ftdna/i.test(line)) provider = 'FamilyTreeDNA'
      if (/living\s*dna/i.test(line)) provider = 'Living DNA'
      if (/(?:build|assembly)\s*[:=]?\s*(?:GRCh)?\s*(\d{2})/i.test(line)) build = `GRCh${line.match(/(?:build|assembly)\s*[:=]?\s*(?:GRCh)?\s*(\d{2})/i)?.[1]}`
      if (line.startsWith('##reference=')) build = line.slice(12)
      if (line.startsWith('#CHROM')) { provider = 'VCF'; header = line.slice(1).split('\t') }
      else if (/^#\s*(?:rsid|snp\s*id)\b/i.test(line) && /position|allele|genotype|result/i.test(line) && /[\t,]/.test(line)) {
        delimiter = line.includes('\t') ? '\t' : ','
        header = line.replace(/^#\s*/, '').split(delimiter).map(part => part.replaceAll('"', '').trim().toLowerCase())
        if (header.includes('allele1') && header.includes('allele2') && provider === 'Unknown format') provider = 'AncestryDNA or MyHeritage'
      }
      continue
    }
    if (!header.length && /rsid|snp|chromosome|result/i.test(line) && /position|allele|genotype|result/i.test(line)) {
      delimiter = line.includes('\t') ? '\t' : ','
      header = line.split(delimiter).map(part => part.replaceAll('"', '').trim().toLowerCase())
      if ((header.includes('allele1') || header.includes('allele 1')) && (header.includes('allele2') || header.includes('allele 2'))) provider = provider === 'Unknown format' ? 'AncestryDNA or MyHeritage' : provider
      if (delimiter === ',' && provider === 'Unknown format') provider = 'MyHeritage or FamilyTreeDNA CSV'
      continue
    }
    const parts = line.split(delimiter).map(part => part.trim().replace(/^"|"$/g, ''))
    let call: DnaCall | null = null
    if (provider === 'VCF' || (parts.length >= 10 && /^[0-9XYMT]+$/i.test(parts[0]) && /^\d+$/.test(parts[1]) && /^(?:rs|i)\d+$/i.test(parts[2]))) {
      provider = 'VCF'
      const variants = [parts[3], ...parts[4].split(',')]
      const indexes = parts[9]?.split(':')[0].split(/[\/|]/).map(Number) || []
      call = { id: parts[2].toLowerCase(), chromosome: parts[0], position: Number(parts[1]), alleles: indexes.map(index => variants[index]).filter(Boolean) }
    } else if (header.length) {
      const field = (names: string[]) => parts[header.findIndex(part => names.includes(part))] || ''
      const id = field(['rsid', 'snp', 'snpid', 'id']).toLowerCase()
      const first = field(['allele1', 'allele 1'])
      const second = field(['allele2', 'allele 2'])
      call = { id, chromosome: field(['chromosome', 'chr']), position: Number(field(['position', 'pos'])) || null, alleles: first || second ? [first, second].filter(Boolean) : alleles(field(['genotype', 'result', 'alleles'])) }
    } else if (parts.length >= 4 && /^(?:rs|i)\d+$/i.test(parts[0])) {
      provider = provider === 'Unknown format' ? '23andMe format' : provider
      call = { id: parts[0].toLowerCase(), chromosome: parts[1], position: Number(parts[2]) || null, alleles: alleles(parts[3]) }
    }
    if (!call || !/^(?:rs|i)\d+$/i.test(call.id)) continue
    snpCount += 1
    if (call.alleles.length) {
      calledCount += 1
      if (call.chromosome.toUpperCase().replace('CHR', '') === 'X') {
        xCalled += 1
        if (call.alleles.length === 2 && call.alleles[0] !== call.alleles[1]) xHeterozygous += 1
      }
      if (call.chromosome.toUpperCase().replace('CHR', '') === 'Y') yCalled += 1
      if (wanted.has(call.id)) calls.push(call)
    }
  }
  const xHeterozygosity = xHeterozygous / Math.max(xCalled, 1)
  const chromosomalSex = xCalled < 100 ? 'Not enough data' : yCalled >= 10 && xHeterozygosity < 0.02 ? 'Likely XY pattern' : yCalled < 10 && xHeterozygosity > 0.05 ? 'Likely XX pattern' : 'Indeterminate pattern'
  return { calls, facts: { provider, build, snpCount, calledCount, callRate: snpCount ? calledCount / snpCount : 0, chromosomalSex } }
}
