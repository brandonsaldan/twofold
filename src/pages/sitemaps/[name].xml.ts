import type { APIRoute, GetStaticPaths } from 'astro'
import { sitemapNames, sitemapPaths, xml, type SitemapName } from '../../lib/sitemap'

export const getStaticPaths: GetStaticPaths = () => sitemapNames.map(name => ({ params: { name } }))

export const GET: APIRoute = ({ params, site }) => {
  const urls = sitemapPaths(params.name as SitemapName).map(({ path, lastmod }) => `<url><loc>${new URL(path, site)}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ''}</url>`)
  return xml(`<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>`)
}
