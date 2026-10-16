import type { Dataset, DnaCall, Finding, Genoset, Snp } from './types'

const complement: Record<string, string> = { A: 'T', T: 'A', C: 'G', G: 'C' }
const pairKey = (alleles: string[]) => [...alleles].map(allele => allele.toUpperCase()).sort().join(';')
const isPalindromic = (alleles: string[]) => alleles.length === 2 && alleles.every(allele => Boolean(complement[allele])) && pairKey(alleles) === pairKey(alleles.map(allele => complement[allele]))

export function normalizeCall(call: DnaCall, snp: Snp): { alleles: string[]; orientation: Finding['orientation'] } | null {
  const sourceAlleles = call.alleles.map(allele => allele.toUpperCase()).filter(allele => allele && !['-', '0', 'N', '.'].includes(allele))
  const alleles = /^(?:Y|MT|M)$/i.test(call.chromosome.replace(/^chr/i, '')) && sourceAlleles.length === 2 && sourceAlleles[0] === sourceAlleles[1] && snp.canonical.some(value => !value.includes(';')) ? [sourceAlleles[0]] : sourceAlleles
  if (!alleles.length || call.alleles.some(allele => ['--', '00', './.', '.', 'NN'].includes(allele.toUpperCase()))) return null
  const canonical = new Set(snp.canonical.map(value => value.replace(/[()]/g, '').toUpperCase().split(';').sort().join(';')))
  const direct = pairKey(alleles)
  const flipped = pairKey(alleles.map(allele => complement[allele] || allele))
  const directMatch = canonical.has(direct)
  const flippedMatch = canonical.has(flipped)
  if (isPalindromic(alleles)) return { alleles, orientation: 'ambiguous' }
  if (snp.stabilizedOrientation.toLowerCase() === 'minus') {
    if (flippedMatch) return { alleles: alleles.map(allele => complement[allele] || allele), orientation: 'complemented' }
    if (directMatch) return { alleles, orientation: 'ambiguous' }
    return null
  }
  if (snp.stabilizedOrientation.toLowerCase() === 'plus') {
    if (directMatch) return { alleles, orientation: 'direct' }
    if (flippedMatch) return { alleles, orientation: 'ambiguous' }
    return null
  }
  if (directMatch && flippedMatch && direct !== flipped) return { alleles, orientation: 'ambiguous' }
  if (directMatch) return { alleles, orientation: 'direct' }
  if (flippedMatch) return { alleles: alleles.map(allele => complement[allele] || allele), orientation: 'complemented' }
  return null
}

export function matchCalls(calls: DnaCall[], dataset: Dataset, onAmbiguous: () => void = () => {}, onNormalized: (rsid: string, alleles: string[]) => void = () => {}): Finding[] {
  const snps = new Map(dataset.snps.map(snp => [snp.rsid.toLowerCase(), snp]))
  const findings: Finding[] = []
  for (const call of calls) {
    const snp = snps.get(call.id.toLowerCase())
    if (!snp) continue
    const normalized = normalizeCall(call, snp)
    if (!normalized) continue
    if (normalized.orientation === 'ambiguous') { onAmbiguous(); continue }
    onNormalized(snp.rsid, normalized.alleles)
    const genotype = snp.genotypes.find(entry => pairKey(entry.alleles) === pairKey(normalized.alleles))
    if (!genotype) continue
    findings.push({
      source: 'snpedia',
      rsid: snp.rsid,
      userAlleles: call.alleles,
      genotype,
      snp,
      orientation: normalized.orientation,
      rareVariantCaution: genotype.magnitude >= 3 && snp.gmaf !== null && snp.gmaf < 0.01
    })
  }
  return findings
}

type Criterion = { name: string; args: Criterion[] } | { value: string }

export function cleanCriterion(source: string): string {
  return source.replace(/<!--[\s\S]*?-->/g, '').replace(/^\s*#.*$/gm, '').trim().replace(/^=+|=+$/g, '').replace(/\s+/g, ' ').trim()
}

export function parseCriterion(source: string): Criterion {
  let offset = 0
  const text = cleanCriterion(source)
  const whitespace = () => { while (/\s/.test(text[offset] || '')) offset += 1 }
  function expression(): Criterion {
    whitespace()
    const start = offset
    while (offset < text.length && !/[(),]/.test(text[offset])) offset += 1
    const name = text.slice(start, offset).trim()
    if (text[offset] !== '(' || /^(?:rs|i)\d+$/i.test(name)) {
      if (text[offset] === '(') {
        let depth = 0
        do {
          if (text[offset] === '(') depth += 1
          if (text[offset] === ')') depth -= 1
          offset += 1
        } while (offset < text.length && depth > 0)
      }
      return { value: text.slice(start, offset).trim() }
    }
    offset += 1
    const args: Criterion[] = []
    whitespace()
    while (offset < text.length && text[offset] !== ')') {
      args.push(expression())
      whitespace()
      if (text[offset] === ',') offset += 1
      else if (text[offset] !== ')') throw new Error(`Unexpected criteria token at ${offset}`)
      whitespace()
    }
    if (text[offset] !== ')') throw new Error('Unclosed criteria function')
    offset += 1
    return { name: name.toLowerCase(), args }
  }
  const result = expression()
  if (text.slice(offset).trim()) throw new Error(`Trailing criteria text: ${text.slice(offset)}`)
  return result
}

export function evaluateGenosets(genosets: Genoset[], findings: Finding[], normalizedCalls: Array<{ rsid: string; alleles: string[] }> = []): { matched: Genoset[]; failures: Record<string, string> } {
  const found = new Map([...normalizedCalls.map(call => [call.rsid.toLowerCase(), call.alleles.map(allele => allele.toLowerCase())] as const), ...findings.map(finding => [finding.rsid.toLowerCase(), finding.genotype.alleles.map(allele => allele.toLowerCase())] as const)])
  const indexed = new Map(genosets.map(set => [set.title.toLowerCase(), set]))
  const failures: Record<string, string> = {}
  const cache = new Map<string, boolean | null>()
  const active = new Set<string>()
  function evaluate(set: Genoset): boolean | null {
    const title = set.title.toLowerCase()
    if (cache.has(title)) return cache.get(title)!
    if (active.has(title)) throw new Error(`Circular genoset: ${set.title}`)
    active.add(title)
    try {
      if (!set.criteria.trim()) throw new Error('Criteria page unavailable')
      const result = value(parseCriterion(set.criteria))
      cache.set(title, result)
      return result
    } finally { active.delete(title) }
  }
  function value(node: Criterion): boolean | null {
    if ('value' in node) {
      const literal = node.value.toLowerCase()
      if (indexed.has(literal)) return evaluate(indexed.get(literal)!)
      const genotype = literal.match(/^((?:rs|i)\d+)\(([a-z0-9-]+)(?:;([a-z0-9-]+))?\)$/)
      if (genotype) {
        const alleles = found.get(genotype[1])
        if (!alleles) return null
        return genotype[3] ? pairKey(alleles) === pairKey([genotype[2], genotype[3]]) : alleles.includes(genotype[2])
      }
      if (literal === 'true') return true
      if (literal === 'false') return false
      throw new Error(`Unsupported criterion: ${node.value}`)
    }
    if (node.name === 'and') { const results = node.args.map(value); return results.includes(false) ? false : results.every(result => result === true) ? true : null }
    if (node.name === 'or') { const results = node.args.map(value); return results.includes(true) ? true : results.every(result => result === false) ? false : null }
    if (node.name === 'not') {
      if (!node.args.length) throw new Error('not requires an argument')
      const results = node.args.map(value)
      return results.includes(true) ? false : results.every(result => result === false) ? true : null
    }
    if (node.name === 'atleast') {
      const count = Number('value' in node.args[0] ? node.args[0].value : '')
      if (!Number.isInteger(count)) throw new Error('atleast requires a count')
      const results = node.args.slice(1).map(value)
      const confirmed = results.filter(result => result === true).length
      return confirmed >= count ? true : confirmed + results.filter(result => result === null).length < count ? false : null
    }
    throw new Error(`Unsupported function: ${node.name}`)
  }
  const matched: Genoset[] = []
  for (const set of genosets) {
    try { const result = evaluate(set); if (result === true) matched.push(set); else if (result === null) failures[set.title] = 'Insufficient genotype coverage' }
    catch (error) { failures[set.title] = String(error) }
  }
  return { matched, failures }
}
