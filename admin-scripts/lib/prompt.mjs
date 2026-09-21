import { createInterface } from 'node:readline/promises'

export const isInteractive = () => Boolean(process.stdin.isTTY && process.stdout.isTTY)

/** Shown instead of a stack trace when the operator hits Ctrl-C or Ctrl-D at a prompt. */
export class CancelledError extends Error {
  constructor() {
    super('Cancelled.')
    this.name = 'CancelledError'
  }
}

/** One visible question. Enter accepts `defaultValue` when there is one. */
export async function ask(question, { defaultValue } = {}) {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  try {
    const suffix = defaultValue ? ` [${defaultValue}]` : ''
    const answer = await new Promise((resolve, reject) => {
      rl.once('close', () => reject(new CancelledError()))
      rl.on('SIGINT', () => rl.close())
      rl.question(`${question}${suffix}: `).then(resolve, reject)
    })
    return answer.trim() || defaultValue || ''
  } finally {
    rl.close()
  }
}

/** Asks until the answer is one of `options` (case-insensitive). Enter picks `defaultOption` if given. */
export async function choose(question, options, { defaultOption } = {}) {
  for (;;) {
    const answer = (
      await ask(`${question} (${options.join(' / ')})`, { defaultValue: defaultOption })
    ).toLowerCase()
    if (options.includes(answer)) return answer
    console.log(`  Please type one of: ${options.join(', ')}.`)
  }
}

/** Yes/no, Enter means yes. */
export async function confirm(question) {
  const answer = (await ask(`${question} [Y/n]`)).toLowerCase()
  return answer === '' || answer === 'y' || answer === 'yes'
}

/** For actions that shouldn't happen on a stray Enter: type the exact word to proceed. */
export async function confirmByTyping(prompt, expected) {
  return (await ask(prompt)) === expected
}

/** Reads a line without echoing it — for passwords. Requires a real terminal. */
export function askHidden(question) {
  if (!isInteractive()) {
    return Promise.reject(new Error('Cannot prompt for input without a terminal.'))
  }

  return new Promise((resolve, reject) => {
    const { stdin, stdout } = process
    let value = ''

    const finish = (fn, arg) => {
      stdin.off('data', onData)
      stdin.setRawMode(false)
      stdin.pause()
      stdout.write('\n')
      fn(arg)
    }

    const onData = (chunk) => {
      // A paste arrives as one multi-character chunk, so walk it.
      for (const char of chunk) {
        if (char === '\r' || char === '\n') return finish(resolve, value)
        if (char === '\u0003' || char === '\u0004') return finish(reject, new CancelledError())
        if (char === '\u007f' || char === '\b') value = value.slice(0, -1)
        else value += char
      }
    }

    // Raw mode (echo off) BEFORE the prompt is shown: once the prompt is
    // visible, whatever arrives next — a fast paste included — must not be
    // echoed back by the terminal.
    stdin.setEncoding('utf8')
    stdin.setRawMode(true)
    stdin.resume()
    stdin.on('data', onData)
    stdout.write(question)
  })
}
