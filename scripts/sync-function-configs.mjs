#!/usr/bin/env node
/**
 * Copies supabase/functions/deno.json into every function's own folder.
 *
 * Why this exists: `supabase functions deploy` used to take
 * `--import-map supabase/functions/deno.json`. Current CLIs reject that flag
 * ("Please use deno.json instead"), and server-side bundling (`--use-api`,
 * the only mode that works without a container) only picks up a deno.json that
 * sits inside the function's own folder. Without it, `import 'zod'` cannot
 * resolve and the bundle fails.
 *
 * The per-function copies are generated, not edited — supabase/functions/
 * deno.json stays the one source of truth, and the copies are gitignored, the
 * same way _shared/gen is. Run by `pnpm functions:deploy`.
 */
import { copyFile, readdir, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const FUNCTIONS = join(dirname(fileURLToPath(import.meta.url)), '..', 'supabase', 'functions')
const SOURCE = join(FUNCTIONS, 'deno.json')

if (!(await stat(SOURCE).catch(() => null))) {
  console.error(`sync-function-configs — source not found: ${SOURCE}`)
  process.exit(1)
}

const copied = []
for (const entry of await readdir(FUNCTIONS, { withFileTypes: true })) {
  // _shared is a library folder, not a deployable function.
  if (!entry.isDirectory() || entry.name.startsWith('_')) continue
  if (!(await stat(join(FUNCTIONS, entry.name, 'index.ts')).catch(() => null))) continue
  await copyFile(SOURCE, join(FUNCTIONS, entry.name, 'deno.json'))
  copied.push(entry.name)
}

if (copied.length === 0) {
  console.error('sync-function-configs — found no functions to configure')
  process.exit(1)
}
console.log(`sync-function-configs — deno.json written for ${copied.length} functions: ${copied.join(', ')}`)
