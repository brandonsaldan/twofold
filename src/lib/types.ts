export type Repute = 'good' | 'bad' | 'unknown'

export type Genotype = {
  title: string
  rsid: string
  alleles: string[]
  magnitude: number
  repute: Repute
  summary: string
  body: string
  references: string[]
  topics: string[]
}

export type Snp = {
  rsid: string
  gene: string
  chromosome: string
  position: number | null
  orientation: string
  stabilizedOrientation: string
  gmaf: number | null
  canonical: string[]
  frequencies: Record<string, number[]>
  chips: string[]
  collections: string[]
  topics: string[]
  body: string
  genotypes: Genotype[]
}

export type Genoset = {
  title: string
  magnitude: number
  repute: Repute
  summary: string
  body: string
  criteria: string
  topics: string[]
}

export type Dataset = {
  version: number
  builtAt: string
  snapshotAt: string
  source: 'snpedia'
  topicKinds?: Record<string, 'gene' | 'condition' | 'medicine'>
  snps: Snp[]
  genosets: Genoset[]
}

export type DnaCall = {
  id: string
  chromosome: string
  position: number | null
  alleles: string[]
}

export type Finding = {
  source: 'snpedia'
  rsid: string
  userAlleles: string[]
  genotype: Genotype
  snp: Snp
  orientation: 'direct' | 'complemented' | 'ambiguous'
  rareVariantCaution: boolean
}
