import type { APIRoute } from 'astro'
import { loadCatalog } from '../lib/catalog'
import { sitemapNames, xml } from '../lib/sitemap'

export const GET: APIRoute = ({ site }) => {
  const lastmod = loadCatalog().snapshotAt.slice(0, 10)
  const entries = sitemapNames.map(name => `<sitemap><loc>${new URL(`/sitemaps/${name}.xml`, site)}</loc><lastmod>${lastmod}</lastmod></sitemap>`)
  return xml(`<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries.join('\n')}\n</sitemapindex>`)
}
