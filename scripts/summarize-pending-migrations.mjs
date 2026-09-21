#!/usr/bin/env node
/**
 * Turns `supabase db push --dry-run` output (on stdin) into something a person
 * can read before approving a production deploy.
 *
 *   summarize-pending-migrations.mjs           Markdown review, for the job summary
 *   summarize-pending-migrations.mjs --names   the pending filenames, space-separated
 *
 * It exists because a deploy approval gates the job, and the job used to be
 * the thing that printed the list — so you approved first and saw it after.
 * Now a preview job runs this, then waits; the gated job re-runs it and
 * refuses to continue if the list has changed since you looked.
 *
 * FAILS CLOSED. If the CLI's output is not something it recognises, it exits
 * non-zero rather than reporting "nothing pending" — a summary that silently
 * shows nothing while `db push --yes` goes on to apply everything is worse than
 * no summary. (The workflow pins the CLI version for the same reason.)
 *
 * The flags are a heuristic aimed at the two questions that matter: does this
 * DESTROY DATA, and does it DROP OBJECTS. It cannot judge an UPDATE, so those
 * are only counted. It reads the SQL properly (comments, strings and function
 * bodies are ignored; DO blocks, which really do run at migration time, are
 * not) so that a function body containing `delete from`, or a comment
 * mentioning `drop table`, does not cry wolf — and so a stray `--` inside a
 * string cannot hide a real statement.
 *
 * MIGRATIONS_DIR overrides where the SQL is read from, for tests only.
 */
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const MIGRATIONS = process.env.MIGRATIONS_DIR ?? join(ROOT, 'supabase', 'migrations')

function fail(message) {
  console.error(`summarize-pending-migrations: ${message}`)
  process.exit(1)
}

// ── reading the CLI's output ────────────────────────────────────────────────

const input = readFileSync(0, 'utf8')
const names = [...new Set([...input.matchAll(/\b(\d{14}_[A-Za-z0-9_-]+\.sql)\b/g)].map((m) => m[1]))].sort()
const upToDate = /Remote database is up to date/i.test(input)

if (names.length === 0 && !upToDate) {
  fail(
    "could not tell what is pending: the CLI output listed no migrations and did not say the " +
      'database is up to date. Refusing to guess.\n--- output was ---\n' + input.trim(),
  )
}
if (names.length > 0 && upToDate) fail('the CLI output both lists migrations and says the database is up to date.')

if (process.argv.includes('--names')) {
  console.log(names.join(' '))
  process.exit(0)
}

// ── reading the SQL ─────────────────────────────────────────────────────────

const blank = (text) => text.replace(/[^\n]/g, ' ') // keep line numbers intact

/**
 * Returns the SQL with everything that is not executed at migration time
 * blanked out: comments, string literals, and dollar-quoted bodies (function
 * and trigger definitions) — but NOT DO blocks, which are.
 */
function codeOnly(sql) {
  let out = ''
  let i = 0
  const n = sql.length

  while (i < n) {
    const c = sql[i]
    const d = sql[i + 1]

    if (c === '-' && d === '-') {
      const end = sql.indexOf('\n', i)
      const stop = end === -1 ? n : end
      out += blank(sql.slice(i, stop))
      i = stop
    } else if (c === '/' && d === '*') {
      let depth = 1
      let j = i + 2
      while (j < n && depth > 0) {
        if (sql[j] === '/' && sql[j + 1] === '*') { depth++; j += 2 }
        else if (sql[j] === '*' && sql[j + 1] === '/') { depth--; j += 2 }
        else j++
      }
      out += blank(sql.slice(i, j))
      i = j
    } else if (c === "'") {
      let j = i + 1
      while (j < n) {
        if (sql[j] === "'") {
          if (sql[j + 1] === "'") { j += 2; continue }
          break
        }
        j++
      }
      j = Math.min(j + 1, n)
      out += blank(sql.slice(i, j))
      i = j
    } else if (c === '"') {
      // A quoted identifier is code; copy it through untouched.
      const end = sql.indexOf('"', i + 1)
      const stop = end === -1 ? n : end + 1
      out += sql.slice(i, stop)
      i = stop
    } else if (c === '$') {
      const tag = sql.slice(i).match(/^\$([A-Za-z_][A-Za-z0-9_]*)?\$/)
      const prev = sql[i - 1] ?? ' '
      if (tag && !/[A-Za-z0-9_]/.test(prev)) {
        const open = tag[0]
        const close = sql.indexOf(open, i + open.length)
        const stop = close === -1 ? n : close + open.length
        const isDoBlock = /\bdo\s*(?:language\s+\w+\s*)?$/i.test(out.slice(-40))
        out += isDoBlock
          ? open + codeOnly(sql.slice(i + open.length, close === -1 ? n : close)) + (close === -1 ? '' : open)
          : blank(sql.slice(i, stop))
        i = stop
      } else {
        out += c
        i++
      }
    } else {
      out += c
      i++
    }
  }
  return out
}

const DESTROYS_DATA = [
  [/\bdrop\s+table\s+(?:if\s+exists\s+)?([\w."]+)/gi, (m) => `drops table \`${m[1]}\` and everything in it`],
  [/\bdrop\s+column\s+(?:if\s+exists\s+)?([\w"]+)/gi, (m) => `drops column \`${m[1]}\` and its data`],
  [/\btruncate\s+(?:table\s+)?(?:only\s+)?([\w."]+)/gi, (m) => `empties table \`${m[1]}\``],
  [/\bdelete\s+from\s+(?:only\s+)?([\w."]+)/gi, (m) => `deletes rows from \`${m[1]}\` (read its WHERE)`],
  [/\bdrop\s+schema\b/gi, () => 'drops a schema'],
]
const DROPS_OBJECTS = [
  [
    /\bdrop\s+(function|view|materialized\s+view|trigger|policy|index|type|constraint|extension|sequence)\s+(?:if\s+exists\s+)?([\w."]+)/gi,
    (m) => `drops ${m[1].toLowerCase()} \`${m[2]}\``,
  ],
  [/\bcron\.unschedule\b/gi, () => 'unschedules a scheduled job'],
]

function scan(code, rules) {
  const hits = []
  for (const [pattern, describe] of rules) {
    for (const m of code.matchAll(pattern)) {
      hits.push({ line: code.slice(0, m.index).split('\n').length, text: describe(m) })
    }
  }
  return hits.sort((a, b) => a.line - b.line)
}

function review(name) {
  const file = join(MIGRATIONS, name)
  if (!existsSync(file)) return { name, missing: true }
  const code = codeOnly(readFileSync(file, 'utf8'))
  return {
    name,
    destroys: scan(code, DESTROYS_DATA),
    drops: scan(code, DROPS_OBJECTS),
    updates: [...code.matchAll(/\bupdate\s+(?:only\s+)?[\w."]+\s+(?:(?:as\s+)?(?!set\b)[A-Za-z_]\w*\s+)?set\b/gi)].length,
  }
}

// ── the review ──────────────────────────────────────────────────────────────

const reviews = names.map(review)
const dangerous = reviews.filter((r) => r.destroys?.length > 0)
const lines = []

lines.push('## Production deploy — what will change', '')

if (names.length === 0) {
  lines.push('**No database migrations are pending.** Only the Edge Functions will be redeployed.', '')
} else {
  lines.push(
    `**${names.length} database migration${names.length === 1 ? '' : 's'} will be applied to PRODUCTION, all at once and in order.** ` +
      'There are no backups, so there is no undo.',
    '',
  )
  if (dangerous.length > 0) {
    lines.push(
      `> **${dangerous.length} of them can destroy data.** They are marked DESTROYS DATA below — read those first.`,
      '',
    )
  }

  for (const r of reviews) {
    lines.push(`### \`${r.name}\``)
    if (r.missing) {
      lines.push('- **This file is not in the repository checkout.** Do not approve until you know why.', '')
      continue
    }
    for (const h of r.destroys) lines.push(`- **DESTROYS DATA** (line ${h.line}): ${h.text}`)
    for (const h of r.drops) lines.push(`- drops an object (line ${h.line}): ${h.text}`)
    if (r.updates > 0) {
      lines.push(`- changes existing rows with ${r.updates} \`UPDATE\` statement${r.updates === 1 ? '' : 's'} — the scan cannot judge these, read them`)
    }
    if (!r.destroys.length && !r.drops.length && !r.updates) lines.push('- no drops, deletes or updates found')
    lines.push('')
  }

  lines.push(
    '_This is a heuristic, not a guarantee: it looks for drops, deletes and truncates, and cannot judge whether an UPDATE is safe. ' +
      'It reads the SQL, ignoring comments, strings and function bodies._',
    '',
  )
}

lines.push(
  '### What happens next',
  'Nothing has been applied yet. Use **Review deployments** on this run to approve or reject.',
  'The deploy re-checks this list first and stops if it has changed since this preview.',
  'The order is migrations, then Edge Functions. If the functions step fails, the migrations stay applied — fix it and re-run the workflow; already-applied migrations are skipped.',
)

console.log(lines.join('\n'))
