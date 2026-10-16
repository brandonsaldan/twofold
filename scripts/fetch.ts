import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const root = new URL('../data/raw/', import.meta.url)
const endpoint = 'https://bots.snpedia.com/api.php'
const userAgent = 'Twofold/0.1 (https://github.com/brandonsaldan/codex; public SNPedia snapshot builder)'
const refresh = process.argv.includes('--refresh') || process.argv.includes('--refresh-categories')
const refreshCategories = process.argv.includes('--refresh-categories')
const baseCategories = [
  'Is a snp',
  'Is a genotype',
  'Is a genoset',
  'Is a gene',
  'Is a medical condition',
  'Is a medicine'
]
const pause = (milliseconds: number) => new Promise(resolve => setTimeout(resolve, milliseconds))
let lastRequest = 0

async function request(parameters: Record<string, string>): Promise<any> {
  const url = new URL(endpoint)
  Object.entries({ action: 'query', format: 'json', ...parameters }).forEach(([key, value]) => url.searchParams.set(key, value))
  for (let attempt = 0; attempt < 8; attempt += 1) {
    await pause(Math.max(0, 1050 - (Date.now() - lastRequest)))
    lastRequest = Date.now()
    try {
      const response = await fetch(url, { headers: { 'User-Agent': userAgent }, signal: AbortSignal.timeout(45000) })
      const body = await response.text()
      if (!response.ok || !body.trimStart().startsWith('{')) throw new Error(`HTTP ${response.status}, ${body.slice(0, 80)}`)
      const result = JSON.parse(body)
      if (result.error) throw new Error(JSON.stringify(result.error))
      return result
    } catch (error) {
      if (attempt === 7) throw error
      await pause(Math.min(60000, 1200 * 2 ** attempt))
    }
  }
}

async function cached(name: string, parameters: Record<string, string>, force = false): Promise<any> {
  const path = new URL(name, root)
  if (!force) try { return JSON.parse(await readFile(path, 'utf8')) } catch {}
  const result = await request(parameters)
  await mkdir(new URL('.', path), { recursive: true })
  await writeFile(path, JSON.stringify(result))
  return result
}

function revisionIds(response: any): string {
  return JSON.stringify(Object.values(response.query?.pages || {}).map((page: any) => [page.title, page.revisions?.[0]?.revid || 0]).sort(([a]: any, [b]: any) => a.localeCompare(b)))
}

async function cachedPage(name: string, parameters: Record<string, string>): Promise<any> {
  if (!refresh) return cached(name, parameters)
  const path = new URL(name, root)
  let previous: any
  try { previous = JSON.parse(await readFile(path, 'utf8')) } catch { return cached(name, parameters) }
  const latest = await request({ ...parameters, rvprop: 'timestamp|ids' })
  if (revisionIds(previous) === revisionIds(latest)) return previous
  return cached(name, parameters, true)
}

async function onChipCategories(): Promise<string[]> {
  const categories: string[] = []
  let continuation: string | undefined
  do {
    const result = await cached(`categories/on-chip-${continuation ?? 'first'}.json`, {
      list: 'allcategories', acprefix: 'On chip', aclimit: '500', ...(continuation ? { acfrom: continuation } : {})
    }, refreshCategories)
    categories.push(...result.query.allcategories.map((entry: { '*': string }) => entry['*']))
    continuation = result.continue?.accontinue
  } while (continuation)
  return categories
}

async function categoryTitles(category: string): Promise<string[]> {
  const titles: string[] = []
  let continuation: string | undefined
  let page = 0
  do {
    const result = await cached(`categories/${encodeURIComponent(category)}-${page}.json`, {
      list: 'categorymembers', cmtitle: `Category:${category}`, cmlimit: '500', cmtype: 'page',
      ...(continuation ? { cmcontinue: continuation } : {})
    }, refreshCategories)
    titles.push(...result.query.categorymembers.map((entry: { title: string }) => entry.title))
    continuation = result.continue?.cmcontinue
    page += 1
  } while (continuation)
  return titles
}

async function main() {
  await mkdir(root, { recursive: true })
  const categories = [...baseCategories, ...await onChipCategories()]
  const memberships: Record<string, string[]> = {}
  const titles = new Set<string>()
  for (const category of categories) {
    const members = await categoryTitles(category)
    memberships[category] = members
    members.forEach(title => titles.add(title))
    process.stdout.write(`Category ${category}: ${members.length} pages\n`)
  }
  for (const title of memberships['Is a genoset']) titles.add(`${title}/criteria`)
  await writeFile(new URL('memberships.json', root), JSON.stringify(memberships))
  const allTitles = [...titles].sort()
  const total = Math.ceil(allTitles.length / 50)
  for (let index = 0; index < total; index += 1) {
    const batch = allTitles.slice(index * 50, index * 50 + 50)
    const hash = createHash('sha256').update(batch.join('\n')).digest('hex').slice(0, 20)
    const result = await cachedPage(`pages/${hash}.json`, {
      prop: 'revisions', rvprop: 'content|timestamp|ids', rvslots: 'main', redirects: '1', titles: batch.join('|')
    })
    if (!result.query?.pages) throw new Error(`No pages in batch ${index}`)
    if (index % 25 === 0 || index === total - 1) process.stdout.write(`Pages: ${Math.min((index + 1) * 50, allTitles.length)}/${allTitles.length}\n`)
  }
  await writeFile(new URL('snapshot.json', root), JSON.stringify({ fetchedAt: new Date().toISOString(), categories, titleCount: allTitles.length, batches: total }))
}

main().catch(error => { process.stderr.write(`${error}\n`); process.exitCode = 1 })
