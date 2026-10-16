import { expect, it } from 'vitest'
import { parseGenotype, parseSnp, templates } from './wiki'

it('reads mixed-case and nested template fields', () => {
  const source = '{{Rsnum\n|RSID=42\n|Gene=TEST\n|geno1=(A;A)\n|geno2=(A;G)\n|StabilizedOrientation=minus\n}} body'
  expect(parseSnp('Rs42', source)?.canonical).toEqual(['(A;A)', '(A;G)'])
  expect(parseSnp('Rs42', source)?.stabilizedOrientation).toBe('minus')
})

it('reads genotype content and normalizes punctuation', () => {
  const source = '{{Genotype|rsid=42|allele1=G|allele2=A|magnitude=2|repute=Good|summary=One\u2014two}} [[TEST]] {{PMID|12345678}}'
  expect(parseGenotype('Rs42(A;G)', source)?.summary).toBe('One - two')
  expect(parseGenotype('Rs42(A;G)', source)?.references).toContain('PMID 12345678')
  expect(templates(source)[0].fields.repute).toBe('Good')
  expect(parseGenotype('Rs34817956(A;G)', '{{Genotype|allele1=A|allele2=|magnitude=3}}')?.alleles).toEqual(['A', 'G'])
})

it('retains 23andMe internal IDs found on SNPedia', () => {
  expect(parseSnp('I1000001', '{{23andMe SNP|Magnitude=}} [[haplogroups]]')?.rsid).toBe('i1000001')
  expect(parseSnp('I5008730', '{{23andMe SNP|iid=5008730|rsid=119483085|geno1=(A;A)}}')?.rsid).toBe('i5008730')
  expect(parseGenotype('I5012079(C;G)', '{{Genotype|rsid=80034486|allele1=C|allele2=G}}')?.rsid).toBe('i5012079')
})
