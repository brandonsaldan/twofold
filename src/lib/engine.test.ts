import { describe, expect, it } from 'vitest'
import { cleanCriterion, evaluateGenosets, matchCalls, normalizeCall, parseCriterion } from './engine'
import type { Dataset, DnaCall, Snp } from './types'

const snp: Snp = { rsid: 'rs1', gene: 'GENE', chromosome: '1', position: 1, orientation: 'plus', stabilizedOrientation: 'plus', gmaf: 0.005, canonical: ['(A;A)', '(A;G)', '(G;G)'], frequencies: {}, chips: [], collections: [], topics: [], body: '', genotypes: [{ title: 'Rs1(A;G)', rsid: 'rs1', alleles: ['A', 'G'], magnitude: 4, repute: 'unknown', summary: 'Example', body: '', references: [], topics: [] }] }
const call = (alleles: string[]): DnaCall => ({ id: 'rs1', chromosome: '1', position: 1, alleles })
const dataset: Dataset = { version: 1, builtAt: '', snapshotAt: '', source: 'snpedia', snps: [snp], genosets: [] }

describe('genotype matching', () => {
  it('accepts either allele order', () => expect(matchCalls([call(['G', 'A'])], dataset)).toHaveLength(1))
  it('complements a call on a verified minus-strand page', () => expect(normalizeCall(call(['T', 'C']), { ...snp, stabilizedOrientation: 'minus' })).toEqual({ alleles: ['A', 'G'], orientation: 'complemented' }))
  it('rejects no-calls', () => expect(normalizeCall(call(['--']), snp)).toBeNull())
  it('rejects numeric no-calls', () => expect(normalizeCall(call(['00']), snp)).toBeNull())
  it('handles single-letter calls', () => expect(normalizeCall(call(['A']), { ...snp, canonical: ['(A)'] })).toEqual({ alleles: ['A'], orientation: 'direct' }))
  it('normalizes doubled Y placeholders to a single call', () => expect(normalizeCall({ id: 'rs1', chromosome: 'Y', position: 1, alleles: ['A', 'A'] }, { ...snp, chromosome: 'Y', canonical: ['(A)'] })).toEqual({ alleles: ['A'], orientation: 'direct' }))
  it('handles indel codes', () => expect(normalizeCall(call(['D', 'I']), { ...snp, canonical: ['(D;I)'] })).toEqual({ alleles: ['D', 'I'], orientation: 'direct' }))
  it('flags ambiguous palindromic pairs', () => expect(normalizeCall(call(['A', 'T']), { ...snp, canonical: ['(A;T)'] })?.orientation).toBe('ambiguous'))
  it('uses SNPedia stabilized orientation for rs1801133', () => {
    const known: Snp = { ...snp, rsid: 'rs1801133', gene: 'MTHFR', position: 11796321, orientation: 'minus', stabilizedOrientation: 'minus', canonical: ['(C;C)', '(C;T)', '(T;T)'], genotypes: [] }
    expect(normalizeCall({ id: known.rsid, chromosome: known.chromosome, position: known.position, alleles: ['G', 'A'] }, known)).toEqual({ alleles: ['C', 'T'], orientation: 'complemented' })
  })
  it('adds a caution for rare high magnitude findings', () => expect(matchCalls([call(['A', 'G'])], dataset)[0].rareVariantCaution).toBe(true))
})

describe('genoset criteria', () => {
  it('parses nested expressions', () => expect(parseCriterion('and(rs1(A;G),not(rs2(T;T)))')).toEqual({ name: 'and', args: [{ value: 'rs1(A;G)' }, { name: 'not', args: [{ value: 'rs2(T;T)' }] }] }))
  it('removes wiki annotations before reading criteria', () => expect(cleanCriterion('# context\n<!-- hidden -->\nand(rs1(A), rs2(T))')).toBe('and(rs1(A), rs2(T))'))
  it('evaluates nested sets and counts', () => {
    const findings = matchCalls([call(['A', 'G'])], dataset)
    const sets = [
      { title: 'Gs1', criteria: 'rs1(A;G)', magnitude: 1, repute: 'unknown' as const, summary: '', body: '', topics: [] },
      { title: 'Gs2', criteria: 'atleast(1,Gs1,rs2(T;T))', magnitude: 1, repute: 'unknown' as const, summary: '', body: '', topics: [] }
    ]
    expect(evaluateGenosets(sets, findings).matched.map(set => set.title)).toEqual(['Gs1', 'Gs2'])
  })
  it('reports unsupported functions', () => {
    const sets = [{ title: 'Gs3', criteria: 'unknown(rs1(A;G))', magnitude: 1, repute: 'unknown' as const, summary: '', body: '', topics: [] }]
    expect(evaluateGenosets(sets, []).failures.Gs3).toContain('Unsupported function')
  })
  it('does not infer a negated genotype from missing data', () => {
    const sets = [{ title: 'Gs4', criteria: 'not(rs2(T;T))', magnitude: 1, repute: 'unknown' as const, summary: '', body: '', topics: [] }]
    const result = evaluateGenosets(sets, matchCalls([call(['A', 'G'])], dataset))
    expect(result.matched).toHaveLength(0)
    expect(result.failures.Gs4).toBe('Insufficient genotype coverage')
  })
  it('matches single-allele criteria and multi-argument not', () => {
    const sets = [
      { title: 'Gs5', criteria: 'rs1(A)', magnitude: 1, repute: 'unknown' as const, summary: '', body: '', topics: [] },
      { title: 'Gs6', criteria: 'not(rs1(T),rs1(C))', magnitude: 1, repute: 'unknown' as const, summary: '', body: '', topics: [] }
    ]
    expect(evaluateGenosets(sets, matchCalls([call(['A', 'G'])], dataset)).matched.map(set => set.title)).toEqual(['Gs5', 'Gs6'])
  })
  it('evaluates a genotype with no annotation page', () => {
    const normalized: Array<{ rsid: string; alleles: string[] }> = []
    const unannotated = { ...snp, genotypes: snp.genotypes.filter(entry => entry.alleles.join(';') !== 'A;G') }
    const findings = matchCalls([call(['A', 'G'])], { ...dataset, snps: [unannotated] }, () => {}, (rsid, alleles) => normalized.push({ rsid, alleles }))
    const sets = [{ title: 'Gs7', criteria: 'rs1(A;G)', magnitude: 1, repute: 'unknown' as const, summary: '', body: '', topics: [] }]
    expect(findings).toHaveLength(0)
    expect(evaluateGenosets(sets, findings, normalized).matched.map(set => set.title)).toEqual(['Gs7'])
  })
})
