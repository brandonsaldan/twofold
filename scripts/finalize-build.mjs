import { createHash } from 'node:crypto'
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const pages = []
async function collect(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) await collect(path)
    else if (path.endsWith('.html')) pages.push(path)
  }
}
await collect('dist')
const scripts = new Set()
const styles = new Set()
const hash = source => `'sha256-${createHash('sha256').update(source).digest('base64')}'`
for (const page of pages) {
  const html = await readFile(page, 'utf8')
  for (const match of html.matchAll(/<script(\s[^>]*)?>([\s\S]*?)<\/script>/g)) if (match[2] && !(match[1] || '').includes('application/ld+json')) scripts.add(hash(match[2]))
  for (const match of html.matchAll(/<style(?:\s[^>]*)?>([\s\S]*?)<\/style>/g)) if (match[1]) styles.add(hash(match[1]))
}
const policy = [
  `default-src 'self'`,
  `script-src 'self' ${[...scripts].join(' ')}`,
  `style-src 'self' ${[...styles].join(' ')}`,
  `style-src-attr 'none'`,
  `img-src 'self' data:`,
  `font-src 'self'`,
  `connect-src 'self'`,
  `worker-src 'self'`,
  `object-src 'none'`,
  `base-uri 'self'`,
  `form-action 'self'`,
  `frame-ancestors 'none'`
].join('; ')
for (const page of pages) {
  const html = await readFile(page, 'utf8')
  const metaPolicy = policy.replace("; frame-ancestors 'none'", '')
  const tag = `<meta http-equiv="Content-Security-Policy" content="${metaPolicy.replaceAll('"', '&quot;')}">`
  if (!html.includes('<meta charset="utf-8">')) throw new Error(`No charset meta in ${page}`)
  await writeFile(page, html.replace('<meta charset="utf-8">', `<meta charset="utf-8">${tag}`))
}
const assets = []
async function assetsIn(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) await assetsIn(path)
    else if (!path.endsWith('.map')) assets.push(`/${path.slice(5).replaceAll('\\', '/')}`)
  }
}
const uncached = /^\/(?:snps|explore|conditions|medicines|genes)\/|^\/(?:sitemap\.xml|robots\.txt|data\/search\.json|404\.html)$|^\/sitemaps\//
await assetsIn('dist')
const precached = assets.filter(asset => !uncached.test(asset))
const cacheName = `twofold-${Date.now()}`
const worker = `const CACHE=${JSON.stringify(cacheName)};const ASSETS=${JSON.stringify(precached)};self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting()))});self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim()))});self.addEventListener('fetch',event=>{if(event.request.method!=='GET'||new URL(event.request.url).origin!==self.location.origin)return;const url=new URL(event.request.url);const path=event.request.mode==='navigate'?(url.pathname.endsWith('/')?url.pathname+'index.html':url.pathname+'/index.html'):url.pathname;event.respondWith(caches.match(path).then(cached=>cached||fetch(event.request)))})`
await writeFile('dist/sw.js', worker)
process.stdout.write(`CSP hashes: ${scripts.size} scripts, ${styles.size} styles across ${pages.length} pages, ${precached.length} of ${assets.length} files precached\n`)
