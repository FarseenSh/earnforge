// SPDX-License-Identifier: Apache-2.0
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Command } from 'commander'
import { describe, expect, it } from 'vitest'
import { program } from '../src/index.js'

/**
 * Every `earnforge ...` command printed in the docs must exist and parse.
 *
 * This is a regression test for a whole class of bug rather than one instance.
 * The agent-facing skill — published as `@earnforge/skill` and served live by
 * the MCP Worker as `skill://earnforge/references/*` — accumulated four
 * invocations that could never work:
 *
 *   earnforge gas-optimize <slug> <amount> <wallet>   no such command
 *   earnforge allowance --rpc-url --chain-id          real flags: --rpc / --chain
 *   earnforge approve --chain-id                      real flag:  --chain
 *   earnforge quote <slug> <amount> <wallet>          quote is flag-based
 *   earnforge suggest <amount> <asset>                suggest is flag-based
 *   earnforge withdraw <slug> <amount> <wallet>       withdraw is flag-based
 *
 * Nothing caught them because documentation is prose to a test suite. An agent
 * following the skill got `error: unknown command` and could not tell "I used
 * it wrong" from "this tool is broken" — the worst failure mode for the one
 * surface whose entire audience is machines.
 *
 * Commander is the oracle: the same `program` the binary runs. Flags and
 * command names are read off it rather than duplicated here, so this cannot
 * drift from the CLI the way the docs did.
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')

/** Docs whose shell blocks are contractual. */
const SOURCES = [
  'skills/earnforge/SKILL.md',
  'skills/earnforge/references/examples.md',
  'skills/earnforge/references/strategies.md',
  'skills/earnforge/references/pitfalls.md',
  'README.md',
  'llms.txt',
]

interface Invocation {
  file: string
  line: number
  raw: string
  command: string
  flags: string[]
}

/**
 * Pull `earnforge <cmd> ...` lines out of markdown.
 *
 * Placeholders (`0xbeef...`, `<slug>`) are never executed — only the command
 * name and flag names are checked, which is what actually rots.
 */
function collect(): Invocation[] {
  const out: Invocation[] = []
  for (const file of SOURCES) {
    let text: string
    try {
      text = readFileSync(resolve(ROOT, file), 'utf8')
    } catch {
      continue // a doc may legitimately not exist in a partial checkout
    }
    text.split('\n').forEach((line, i) => {
      const m = line.match(/(?:^|\$ |`)earnforge ([a-z][a-z-]*)((?: [^`|#]*)?)/)
      if (!m) {
        return
      }
      const command = m[1] as string
      // `earnforge init my-app` and prose like "earnforge doctor" are fine.
      const rest = (m[2] ?? '').split('|')[0] ?? ''
      const flags = [...rest.matchAll(/--[a-z][a-z-]*/g)].map((f) => f[0])
      out.push({ file, line: i + 1, raw: line.trim(), command, flags })
    })
  }
  return out
}

const invocations = collect()
const commands = new Map<string, Command>(
  program.commands.map((c) => [c.name(), c as Command])
)

/** Every long flag commander accepts for a command, including globals. */
function knownFlags(cmd: Command): Set<string> {
  const set = new Set<string>(['--help'])
  for (const o of cmd.options) {
    const long = o.long
    if (long) {
      set.add(long)
    }
  }
  return set
}

describe('documented CLI commands', () => {
  it('finds invocations to check', () => {
    // Guards against the extractor silently matching nothing and the whole
    // suite passing vacuously.
    expect(invocations.length).toBeGreaterThan(15)
  })

  it('every documented command exists', () => {
    const unknown = invocations
      .filter((i) => !commands.has(i.command))
      .map((i) => `${i.file}:${i.line} — "${i.command}" :: ${i.raw}`)

    expect(unknown, 'documented commands that do not exist').toEqual([])
  })

  it('every documented flag exists on its command', () => {
    const bad: string[] = []
    for (const inv of invocations) {
      const cmd = commands.get(inv.command)
      if (!cmd) {
        continue // reported by the test above
      }
      const known = knownFlags(cmd)
      for (const flag of inv.flags) {
        if (!known.has(flag)) {
          bad.push(
            `${inv.file}:${inv.line} — "${inv.command}" has no ${flag} :: ${inv.raw}`
          )
        }
      }
    }
    expect(bad, 'documented flags that do not exist').toEqual([])
  })

  it('commands that take no positional arguments are not given one', () => {
    // The `quote <slug> <amount> <wallet>` class of error: commander accepts
    // the parse and then fails at runtime on a missing required option, so the
    // example reads plausible and cannot work.
    const bad: string[] = []
    for (const inv of invocations) {
      const cmd = commands.get(inv.command)
      if (!cmd || cmd.registeredArguments.length > 0) {
        continue
      }
      // Strip the command word, then anything flag-shaped and its value, then
      // the `[optional]` / `(a | b)` notation SKILL.md uses to describe usage.
      // Without that last step every `[--json]` leaves a stray bracket behind
      // and reads as a positional argument.
      const tail = inv.raw
        .replace(/^.*?earnforge\s+[a-z][a-z-]*\s*/, '')
        .replace(/[`|#].*$/, '')
        .replace(/--[a-z][a-z-]*(\s+[^\s`|#\])]+)?/g, '')
        .replace(/[[\]()|]/g, '')
        .trim()
      if (tail.length > 0) {
        bad.push(
          `${inv.file}:${inv.line} — "${inv.command}" takes no positional args but got "${tail}"`
        )
      }
    }
    expect(bad, 'positional arguments passed to flag-only commands').toEqual([])
  })
})
