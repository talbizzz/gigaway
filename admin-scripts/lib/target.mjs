import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { createClient } from '@supabase/supabase-js'

/**
 * Every script goes through here with an explicit --env. Nothing is assumed
 * silently: two Supabase projects exist, the service-role key bypasses every
 * safety the app has, and "I forgot which one this was pointed at" is the
 * mistake worth making impossible. (An interactive prompt may offer dev as
 * the Enter default, because the choice is on screen and dev is the safe
 * direction — but that is the prompt's call, not a fallback in here.)
 */
export const PROJECTS = {
  dev: { name: 'gigaway-dev', ref: 'shhgzekofcetdenwpivm' },
  prod: { name: 'gigaway', ref: 'hrhoqmmxgfpyxwncmpjx' },
}

function parseEnvFile(path) {
  if (!existsSync(path)) return {}
  const out = {}
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    if (line.trimStart().startsWith('#')) continue
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)
    if (match) out[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2')
  }
  return out
}

/**
 * Resolves the Supabase project a script is allowed to touch.
 *
 * Reads admin-scripts/.env.<env>, with real environment variables taking
 * precedence. Then refuses unless SUPABASE_URL is actually the project the
 * --env flag names — so a shell that still has prod's URL exported cannot
 * be turned loose on dev, or the other way round.
 */
export function loadTarget(env) {
  const project = PROJECTS[env]
  if (!project) {
    throw new Error(`--env must be one of: ${Object.keys(PROJECTS).join(', ')} (got "${env}")`)
  }

  const file = fileURLToPath(new URL(`../.env.${env}`, import.meta.url))
  const fromFile = parseEnvFile(file)
  const url = process.env.SUPABASE_URL ?? fromFile.SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? fromFile.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceKey) {
    throw new Error(
      `Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY for ${env}. ` +
        `Create admin-scripts/.env.${env} (see .env.example) or export them.`,
    )
  }

  let ref
  try {
    ref = new URL(url).hostname.split('.')[0]
  } catch {
    throw new Error(`SUPABASE_URL is not a valid URL: ${url}`)
  }
  if (ref !== project.ref) {
    throw new Error(
      `SUPABASE_URL points at project "${ref}", but --env ${env} is ${project.name} ` +
        `("${project.ref}"). Refusing to continue — check ${file} and your shell environment.`,
    )
  }

  return { env, ...project, url, serviceKey }
}

export function serviceClient(target) {
  return createClient(target.url, target.serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
