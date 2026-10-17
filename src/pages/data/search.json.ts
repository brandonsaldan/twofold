import type { APIRoute } from 'astro'
import { loadCatalog } from '../../lib/catalog'

export const GET: APIRoute = () => {
  const catalog = loadCatalog()
  const body = JSON.stringify({
    snps: catalog.snps.map(entry => [entry.snp.rsid, entry.snp.gene]),
    topics: catalog.topics.map(topic => [topic.name, topic.kind, topic.slug, topic.notable.length])
  })
  return new Response(body, { headers: { 'Content-Type': 'application/json; charset=utf-8' } })
}
