#!/usr/bin/env node
/**
 * Publishes a folder to a Cloudflare Pages project.
 *
 *   publish-pages.mjs <directory> <project-name> [--create]
 *
 * Needs CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID in the environment.
 * With --create it first tries to create the project (a no-op failure if it
 * already exists), so the first deploy of a new site needs no manual setup.
 * Writes `deployment-url` to $GITHUB_OUTPUT when that is set.
 *
 * Why this exists instead of cloudflare/wrangler-action: that action installs
 * wrangler with the repo's package manager, and in a pnpm workspace that is
 * `pnpm add wrangler` at the workspace root, which pnpm refuses
 * (ERR_PNPM_ADDING_TO_ROOT) — the deploy died before it started. This runs
 * wrangler through npx instead: nothing is added to the repo, and npm (unlike
 * pnpm 11) runs the install scripts wrangler's dependencies expect.
 *
 * The version is pinned. Bump it deliberately, and check the flags used below
 * with `npx wrangler@<version> pages deploy --help` first.
 */
import { spawnSync } from 'node:child_process'
import { appendFileSync, existsSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const WRANGLER_VERSION = '4.136.1'

const args = process.argv.slice(2)
const create = args.includes('--create')
const [directory, project] = args.filter((a) => !a.startsWith('--'))

function fail(message) {
  console.error(`::error::publish-pages — ${message}`)
  process.exit(1)
}

if (!directory || !project) fail('usage: publish-pages.mjs <directory> <project-name> [--create]')
if (!existsSync(directory)) fail(`the directory "${directory}" does not exist — was the build step skipped?`)
for (const name of ['CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID']) {
  // An unset repository secret arrives as an empty string, not as "missing".
  if (!process.env[name]) {
    fail(`${name} is empty. Add it under repo Settings → Secrets and variables → Actions as a repository secret.`)
  }
}

function wrangler(wranglerArgs, env = {}) {
  return spawnSync('npx', ['--yes', `wrangler@${WRANGLER_VERSION}`, ...wranglerArgs], {
    stdio: 'inherit',
    env: { ...process.env, ...env },
  })
}

if (create) {
  // Idempotent bootstrap. Allowed to fail so "already exists" is not an error;
  // a real problem (bad token) resurfaces on the deploy below.
  const made = wrangler(['pages', 'project', 'create', project, '--production-branch', 'main'])
  console.log(made.status === 0 ? `created Pages project ${project}` : `(project ${project} was not created — assuming it already exists)`)
}

// --branch main is load-bearing. Without it wrangler infers the branch from
// git, files the deploy as a preview, and the site keeps serving the previous
// version while the run reports success.
const outputFile = join(mkdtempSync(join(tmpdir(), 'publish-pages-')), 'wrangler-output.ndjson')
const deployed = wrangler(['pages', 'deploy', directory, '--project-name', project, '--branch', 'main'], {
  WRANGLER_OUTPUT_FILE_PATH: outputFile,
})
if (deployed.status !== 0) fail(`wrangler pages deploy failed (exit ${deployed.status ?? deployed.signal})`)

// wrangler writes one JSON object per line; the deploy entry carries the URL.
const entries = existsSync(outputFile)
  ? readFileSync(outputFile, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line))
  : []
const url = entries.find((e) => e.type === 'pages-deploy')?.url
if (!url) fail('the deploy finished but wrangler reported no deployment URL, so it cannot be verified')

console.log(`deployment-url: ${url}`)
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `deployment-url=${url}\n`)
