import { readdir, readFile } from 'node:fs/promises'
import { join, extname } from 'node:path'
import ts from 'typescript'

const excluded = new Set(['.git', '.astro', 'node_modules', 'dist', 'data/raw', 'test-results', 'playwright-report'])
const readable = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.astro', '.css', '.json', '.md', '.html', '.svg', '.txt', '.yml', '.yaml'])
const code = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs'])
const failures = []

function comments(source, path) {
  const scanner = ts.createScanner(ts.ScriptTarget.Latest, false, path.endsWith('x') ? ts.LanguageVariant.JSX : ts.LanguageVariant.Standard, source)
  let token = scanner.scan()
  while (token !== ts.SyntaxKind.EndOfFileToken) {
    if (token === ts.SyntaxKind.SingleLineCommentTrivia || token === ts.SyntaxKind.MultiLineCommentTrivia) failures.push(`${path}: code comment at ${scanner.getTokenPos()}`)
    token = scanner.scan()
  }
}

async function walk(directory, relative = '') {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(relative, entry.name)
    if (excluded.has(path) || excluded.has(entry.name)) continue
    const absolute = join(directory, entry.name)
    if (entry.isDirectory()) await walk(absolute, path)
    else if (readable.has(extname(path))) {
      const source = await readFile(absolute, 'utf8')
      if (source.includes('\u2014')) failures.push(`${path}: em dash`)
      if (code.has(extname(path))) comments(source, path)
      if (extname(path) === '.css' && /\/\*|\*\//.test(source)) failures.push(`${path}: CSS comment`)
      if (extname(path) === '.astro') {
        if (/<!--[\s\S]*?-->/.test(source)) failures.push(`${path}: HTML comment`)
        const frontmatter = source.match(/^---\n([\s\S]*?)\n---/)
        if (frontmatter) comments(frontmatter[1], path)
        for (const match of source.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)) comments(match[1], path)
        for (const match of source.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)) if (/\/\*|\*\//.test(match[1])) failures.push(`${path}: CSS comment`)
      }
    }
  }
}

await walk(process.cwd())
if (failures.length) { process.stderr.write(`${failures.join('\n')}\n`); process.exitCode = 1 }
else process.stdout.write('Source checks passed\n')
