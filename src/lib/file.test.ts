import { describe, expect, it } from 'vitest'
import { zipSync, strToU8 } from 'fflate'
import { gzipSync } from 'node:zlib'
import { parseDnaFile } from './file'

const wanted = new Set(['rs42', 'i1000001'])

describe('streamed DNA files', () => {
  it('reads 23andMe calls and omits no-calls', async () => {
    const file = new File(['# 23andMe\n# genome build 37\nrs42\t1\t100\tAG\ni1000001\tY\t200\t--\n'], 'dna.txt')
    const result = await parseDnaFile(file, wanted)
    expect(result.facts.provider).toBe('23andMe')
    expect(result.facts.build).toBe('GRCh37')
    expect(result.facts.callRate).toBe(0.5)
    expect(result.calls).toHaveLength(1)
  })

  it('reads separate Ancestry allele columns', async () => {
    const file = new File(['# AncestryDNA\nrsid\tchromosome\tposition\tallele1\tallele2\nrs42\t1\t100\tA\tG\n'], 'ancestry.txt')
    const result = await parseDnaFile(file, wanted)
    expect(result.calls[0].alleles).toEqual(['A', 'G'])
  })

  it('reads a commented allele header', async () => {
    const file = new File(['#rsid\tchromosome\tposition\tallele1\tallele2\nrs42\t1\t100\tA\tG\n'], 'ancestry.txt')
    const result = await parseDnaFile(file, wanted)
    expect(result.calls[0].alleles).toEqual(['A', 'G'])
  })

  it('reads CSV rows inside a ZIP without loading a full text string', async () => {
    const archive = zipSync({ 'data.csv': strToU8('RSID,CHROMOSOME,POSITION,RESULT\nrs42,1,100,AG\n') })
    const file = new File([archive], 'myheritage.zip')
    const result = await parseDnaFile(file, wanted)
    expect(result.facts.provider).toBe('MyHeritage')
    expect(result.calls[0].alleles).toEqual(['A', 'G'])
  })

  it('reads a gzipped FamilyTreeDNA CSV', async () => {
    const file = new File([gzipSync('RSID,CHROMOSOME,POSITION,RESULT\nrs42,1,100,AG\n')], 'family-finder.csv.gz')
    const result = await parseDnaFile(file, wanted)
    expect(result.facts.provider).toBe('FamilyTreeDNA')
    expect(result.calls[0].alleles).toEqual(['A', 'G'])
  })

  it('reads a VCF genotype', async () => {
    const line = '1\t100\trs42\tA\tG\t.\tPASS\t.\tGT\t0/1'
    const file = new File([`##fileformat=VCFv4.3\n#CHROM\tPOS\tID\tREF\tALT\tQUAL\tFILTER\tINFO\tFORMAT\tSAMPLE\n${line}\n`], 'dna.vcf')
    const result = await parseDnaFile(file, wanted)
    expect(result.facts.provider).toBe('VCF')
    expect(result.calls[0].alleles).toEqual(['A', 'G'])
  })
})
