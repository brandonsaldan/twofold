import { chromosomeHref, chromosomeOf, genotypeSlug, kindPath, loadCatalog, snpHref, topicHref } from './catalog'
import { chromosomeOrder } from './report'

export const sitemapNames = ['pages', 'topics', 'snps', 'genotypes'] as const
export type SitemapName = (typeof sitemapNames)[number]

export function sitemapPaths(name: SitemapName): Array<{ path: string; lastmod: string }> {
  const catalog = loadCatalog()
  const lastmod = catalog.snapshotAt.slice(0, 10)
  const indexed = catalog.snps.filter(entry => entry.indexed)
  if (name === 'pages') {
    const chromosomes = [...new Set(indexed.map(entry => chromosomeOrder.includes(chromosomeOf(entry.snp)) ? chromosomeOf(entry.snp) : ''))].map(chromosomeHref)
    return [
      ...['/', '/get-data/', '/privacy/', '/about/', '/support/', '/promethease-alternative/'].map(path => ({ path, lastmod: '' })),
      ...['/explore/', '/snps/', ...chromosomes, kindPath('condition'), kindPath('medicine'), kindPath('gene')].map(path => ({ path, lastmod }))
    ]
  }
  if (name === 'topics') return catalog.topics.filter(topic => topic.indexed).map(topic => ({ path: topicHref(topic.kind, topic.slug), lastmod }))
  if (name === 'snps') return indexed.map(entry => ({ path: snpHref(entry.snp.rsid), lastmod }))
  return indexed.flatMap(entry => [...new Set(entry.snp.genotypes.map(genotype => `${snpHref(entry.snp.rsid)}${genotypeSlug(entry.snp, genotype.alleles)}/`))].map(path => ({ path, lastmod })))
}

export function xml(body: string): Response {
  return new Response(`<?xml version="1.0" encoding="UTF-8"?>\n${body}\n`, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } })
}
