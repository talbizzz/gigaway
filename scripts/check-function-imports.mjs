#!/usr/bin/env node
/**
 * Fails if an Edge Function imports a file that does not exist.
 *
 * Run AFTER `pnpm sync:shared`: functions import their shared code from
 * supabase/functions/_shared/gen, a gitignored copy of packages/shared. If
 * someone renames or deletes a shared file that a function still imports, nothing
 * complains until `supabase functions deploy` fails to bundle — which happens
 * in the deploy job, after the migrations have already been applied to prod.
 * This finds it on every push instead.
 *
 * It only follows relative imports (`./x.ts`, `../_shared/http.ts`); bare
 * specifiers such as `zod` are mapped by deno.json and are not this script's
 * business. The generated copies themselves are not scanned — they are copies
 * of packages/shared, which the normal typecheck already covers.
 */
import { readdir, readFile, stat } from 'node:fs/promises'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const FUNCTIONS = join(ROOT, 'supabase', 'functions')
const GENERATED = join(FUNCTIONS, '_shared', 'gen')

async function tsFiles(dir, out = []) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (full === GENERATED || entry.name === 'node_modules') continue
    if (entry.isDirectory()) await tsFiles(full, out)
    else if (entry.name.endsWith('.ts')) out.push(full)
  }
  return out
}

// `from '…'` (covers multi-line named imports) and bare `import '…'`.
const SPECIFIER = /\b(?:from|import)\s+['"](\.{1,2}\/[^'"]+)['"]/g

const problems = []
let checked = 0

for (const file of await tsFiles(FUNCTIONS)) {
  const source = await readFile(file, 'utf8')
  for (const match of source.matchAll(SPECIFIER)) {
    checked++
    const target = resolve(dirname(file), match[1])
    if (!(await stat(target).catch(() => null))?.isFile()) {
      const line = source.slice(0, match.index).split('\n').length
      problems.push(`${relative(ROOT, file)}:${line} imports ${match[1]}, which does not exist`)
    }
  }
}

if (checked === 0) {
  console.error('check-function-imports — found no relative imports to check; the scan itself is broken')
  process.exit(1)
}
if (problems.length > 0) {
  console.error('check-function-imports — broken imports:')
  for (const p of problems) console.error(`  ${p}`)
  console.error('\nIf it points into _shared/gen, the shared file was renamed or deleted in packages/shared/src.')
  process.exit(1)
}
console.log(`check-function-imports — ${checked} relative imports, all resolve`)
