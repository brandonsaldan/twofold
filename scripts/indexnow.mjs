import { readdirSync } from 'node:fs'

const site = 'https://twofold.brandonsaldan.com'
const batchSize = 10000
const submitAll = process.argv.includes('--all')
const since = process.env.SINCE ? process.env.SINCE.slice(0, 10) : null

const keyFile = readdirSync(new URL('../public/', import.meta.url)).find(file => /^[a-f0-9]{32}\.txt$/.test(file))
if (!keyFile) throw new Error('No IndexNow key file found in public/')
const key = keyFile.replace('.txt', '')

async function fetchText(url) {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`${url} returned ${response.status}`)
  return response.text()
}

const index = await fetchText(`${site}/sitemap.xml`)
const sitemaps = [...index.matchAll(/<sitemap><loc>(.*?)<\/loc>/g)].map(([, loc]) => loc)
const entries = (await Promise.all(sitemaps.map(async sitemap => {
  const xml = await fetchText(sitemap)
  return [...xml.matchAll(/<url><loc>(.*?)<\/loc>(?:<lastmod>(.*?)<\/lastmod>)?<\/url>/g)].map(([, loc, lastmod]) => ({ loc, lastmod }))
}))).flat()

const changed = entries.filter(({ lastmod }) => submitAll || !since || !lastmod || lastmod >= since).map(({ loc }) => loc)
console.log(`${changed.length} of ${entries.length} URLs to submit${submitAll ? ' (all)' : since ? ` (changed since ${since})` : ''}`)

for (let start = 0; start < changed.length; start += batchSize) {
  const urlList = changed.slice(start, start + batchSize)
  const response = await fetch('https://api.indexnow.org/indexnow', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ host: new URL(site).host, key, keyLocation: `${site}/${keyFile}`, urlList })
  })
  console.log(`IndexNow responded ${response.status} for ${urlList.length} URLs`)
  if (!response.ok) process.exit(1)
}
