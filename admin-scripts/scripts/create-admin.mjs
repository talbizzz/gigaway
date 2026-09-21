#!/usr/bin/env node
import { parseArgs } from 'node:util'

import { createAdminUser, EmailTakenError } from '../lib/create-admin-user.mjs'
import {
  ask,
  askHidden,
  CancelledError,
  choose,
  confirm,
  confirmByTyping,
  isInteractive,
} from '../lib/prompt.mjs'
import { loadTarget, PROJECTS, serviceClient } from '../lib/target.mjs'

const MIN_PASSWORD_LENGTH = 12
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const USAGE = `Create a GigAway admin account.

  pnpm create-admin

Asks for the project, email, display name and password. Every question can be
answered up front instead, which skips it:

  --env <dev|prod>   Which Supabase project. At the prompt Enter means dev;
                     with no terminal it is required, never assumed.
  --email <email>    The admin's login.
  --name <name>      Shown in the audit log. Defaults to the part before the @.
  --password <pw>    Best avoided: a flag is visible in shell history and
                     process lists. Or set ADMIN_PASSWORD. Min ${MIN_PASSWORD_LENGTH} characters.
  --yes              Skip the final "create this admin?" question (dev only).

With no terminal (a script, a pipe) nothing can be asked, so --env, --email
and a password source are all required.

Creates a NEW account only — it refuses if the email is already registered,
because an existing account may belong to an artist. The admin gets no member
profile: admin_users and profiles stay separate.
`

class UsageError extends Error {}

const normaliseEmail = (value) => value.trim().toLowerCase()
const isValidEmail = (value) => EMAIL_PATTERN.test(normaliseEmail(value))

function checkPassword(password) {
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new UsageError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`)
  }
  return password
}

async function getEnv(values, interactive) {
  if (values.env) return values.env
  if (!interactive) throw new UsageError('--env is required (dev or prod).')
  // Enter means dev — the safe direction. Prod can't be reached by Enter: it has
  // to be typed here, and typed again at the confirmation further down.
  return choose('Which project?', Object.keys(PROJECTS), { defaultOption: 'dev' })
}

async function getEmail(values, interactive) {
  if (values.email !== undefined) {
    if (!isValidEmail(values.email)) throw new UsageError(`"${values.email}" is not a valid email address.`)
    return normaliseEmail(values.email)
  }
  if (!interactive) throw new UsageError('--email is required.')
  for (;;) {
    const answer = await ask('Email')
    if (isValidEmail(answer)) return normaliseEmail(answer)
    console.log('  That does not look like an email address.')
  }
}

async function getName(values, email, interactive) {
  const fallback = email.split('@')[0]
  if (values.name !== undefined) {
    if (!values.name.trim()) throw new UsageError('--name cannot be empty.')
    return values.name.trim()
  }
  if (!interactive) return fallback
  return ask('Display name (shown in the audit log)', { defaultValue: fallback })
}

async function getPassword(values, interactive) {
  if (values.password !== undefined) {
    console.error('warning: a --password flag is visible in shell history and process lists.\n')
    return checkPassword(values.password)
  }
  if (process.env.ADMIN_PASSWORD) return checkPassword(process.env.ADMIN_PASSWORD)
  if (!interactive) {
    throw new UsageError('No terminal to prompt for a password. Set ADMIN_PASSWORD, or run this in a terminal.')
  }

  for (;;) {
    const first = await askHidden(`Password (at least ${MIN_PASSWORD_LENGTH} characters): `)
    if (first.length < MIN_PASSWORD_LENGTH) {
      console.log(`  Too short — at least ${MIN_PASSWORD_LENGTH} characters.`)
      continue
    }
    const second = await askHidden('Password again: ')
    if (first === second) return first
    console.log('  Those did not match — try again.')
  }
}

async function confirmCreation(values, target, interactive) {
  if (target.env === 'prod') {
    // Admin access to real members' data: a typed word, never a stray Enter,
    // and never from a pipe or CI job where nobody is watching. --yes does
    // not apply here.
    if (!interactive) {
      throw new UsageError('Creating a prod admin needs a typed confirmation, and there is no terminal.')
    }
    if (!(await confirmByTyping('This is PRODUCTION. Type "prod" to continue', 'prod'))) {
      throw new UsageError('Not confirmed. Nothing was created.')
    }
    return
  }
  if (interactive && !values.yes && !(await confirm('Create this admin?'))) {
    throw new UsageError('Not confirmed. Nothing was created.')
  }
}

async function main() {
  const { values } = parseArgs({
    options: {
      env: { type: 'string' },
      email: { type: 'string' },
      name: { type: 'string' },
      password: { type: 'string' },
      yes: { type: 'boolean' },
      help: { type: 'boolean', short: 'h' },
    },
    strict: true,
  })

  if (values.help) return console.log(USAGE)

  const interactive = isInteractive()

  // Project first, and load its credentials straight away: if they are missing
  // or point at the wrong project, say so before asking anything else.
  const env = await getEnv(values, interactive)
  const target = loadTarget(env)
  console.log(`\nProject: ${target.name} (${target.ref})${target.env === 'prod' ? '  <-- PRODUCTION' : ''}\n`)

  const email = await getEmail(values, interactive)
  const displayName = await getName(values, email, interactive)
  const password = await getPassword(values, interactive)

  console.log('\nAbout to create:')
  console.log(`  project  ${target.name}`)
  console.log(`  email    ${email}`)
  console.log(`  name     ${displayName}\n`)
  await confirmCreation(values, target, interactive)

  try {
    const { id } = await createAdminUser(serviceClient(target), { email, password, displayName })
    console.log(`\nCreated admin ${email}`)
    console.log(`  id       ${id}`)
    console.log(`  project  ${target.name}`)
    console.log('\nThey can sign in to the admin app now. No member profile was created.')
  } catch (err) {
    if (err instanceof EmailTakenError) {
      throw new UsageError(
        `${err.message}\n` +
          'This script only creates new accounts and will not convert an existing one — it might ' +
          "be an artist's, and making it an admin means deleting its member profile. If it is " +
          'already an admin there is nothing to do.',
      )
    }
    throw err
  }
}

try {
  await main()
} catch (err) {
  if (err instanceof CancelledError) {
    console.error('\nCancelled. Nothing was created.')
  } else {
    console.error(`\nerror: ${err.message}`)
    if (err.code === 'ERR_PARSE_ARGS_UNKNOWN_OPTION' || err.code === 'ERR_PARSE_ARGS_INVALID_OPTION_VALUE') {
      console.error(`\n${USAGE}`)
    }
  }
  process.exit(1)
}
