import type { Dataset, DnaCall } from './types'
import type { FileFacts } from './file'

export type FrequencyTable = Record<string, Record<string, number[]>>

export const sampleChip = '23andMe v5'

const complement: Record<string, string> = { A: 'T', T: 'A', C: 'G', G: 'C' }
const pairKey = (alleles: string[]) => [...alleles].map(allele => allele.toUpperCase()).sort().join(';')
const split = (canonical: string) => canonical.replace(/[()]/g, '').toUpperCase().split(';').filter(Boolean)

function seeded(seed: number): () => number {
  let state = seed
  return () => {
    state = (state + 0x6d2b79f5) | 0
    let value = Math.imul(state ^ (state >>> 15), 1 | state)
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}

function weightedIndex(weights: number[], roll: number): number {
  const total = weights.reduce((sum, weight) => sum + weight, 0)
  let remaining = roll * total
  for (let index = 0; index < weights.length; index += 1) {
    remaining -= weights[index]
    if (remaining < 0) return index
  }
  return weights.length - 1
}

export function synthesizeSample(dataset: Dataset, frequencies: FrequencyTable): { calls: DnaCall[]; facts: FileFacts } {
  const random = seeded(20261015)
  const calls: DnaCall[] = []
  for (const snp of dataset.snps) {
    if (!snp.chips.includes(sampleChip) || !snp.canonical.length) continue
    const weights = frequencies[snp.rsid]?.CEU
    let alleles: string[] = []
    if (weights && weights.length === snp.canonical.length && weights.some(weight => weight > 0)) {
      alleles = split(snp.canonical[weightedIndex(weights, random())])
    } else if (snp.genotypes.length) {
      const calmest = [...snp.genotypes].sort((a, b) => a.magnitude - b.magnitude)[0]
      alleles = snp.canonical.map(split).find(entry => pairKey(entry) === pairKey(calmest.alleles)) || calmest.alleles.map(allele => allele.toUpperCase())
    } else {
      alleles = split(snp.canonical[0])
    }
    if (!alleles.length) continue
    const reported = snp.stabilizedOrientation.toLowerCase() === 'minus' ? alleles.map(allele => complement[allele] || allele) : alleles
    calls.push({ id: snp.rsid, chromosome: snp.chromosome, position: snp.position, alleles: reported })
  }
  return {
    calls,
    facts: {
      provider: 'Sample genome',
      build: '23andMe v5 layout',
      snpCount: calls.length,
      calledCount: calls.length,
      callRate: 1,
      chromosomalSex: 'Not inferred for the sample'
    }
  }
}
