// SPDX-License-Identifier: Apache-2.0
/**
 * Cross-surface consistency invariants.
 *
 * This file exists because of a failure that repeated roughly fourteen times
 * over a month, always the same shape: a number published on one surface stops
 * matching the code behind it, nobody notices, and it is found later by a human
 * asking "are you sure?". Every individual instance was trivially findable. The
 * problem was never difficulty, it was that each check was improvised, so each
 * pass covered a different subset and the gaps moved around.
 *
 * The rule these encode: **no surface may claim a count that something in the
 * repository does not produce.** Every number below is derived from the code
 * that backs it and compared against every place that quotes it. Nothing here
 * is hand-maintained, so it cannot go stale in the way the numbers it guards
 * did.
 *
 * When one of these fails, the fix is to change the thing that is actually
 * wrong, never to update the expected value here: there is no expected value
 * here, only two sources that have to agree.
 *
 * Deliberately pure: no network, no build output. It runs inside `pnpm verify`
 * and therefore in CI, which is the whole point. `pnpm ship-check` covers what
 * needs a network (published versions, deployed pages, live anchors).
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = new URL('..', import.meta.url).pathname
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')
const count = (s: string, re: RegExp) => (s.match(re) ?? []).length

/**
 * Some surfaces are local-only. `CLAUDE.md` is in `.git/info/exclude`, so it is
 * present on a developer's machine and absent in CI, and reading it
 * unconditionally took the whole suite down on the runner while every local run
 * stayed green. Checked where it exists, skipped where it does not.
 */
function readIfPresent(p: string): string {
  try {
    return read(p)
  } catch {
    return ''
  }
}

/**
 * Every shipped `.ts` under each package's `src` and `test` directories.
 *
 * The documentation surfaces above were the whole list once, and a review found
 * eight `799 vaults` claims living in code comments — including the published
 * rationale for the protocol risk tiers in `risk-scorer.ts` — while every
 * markdown surface said `744`. Both were dated "Sep 2026". The gate built to
 * stop stale figures could not see the stale figures in the code it ships, so
 * it now reads the code too. Comments are documentation that happens to
 * compile.
 */
function codeSurfaces(): string[] {
  const out: string[] = []
  const walk = (rel: string) => {
    let entries: ReturnType<typeof readdirSync>
    try {
      entries = readdirSync(join(ROOT, rel), { withFileTypes: true })
    } catch {
      return
    }
    for (const e of entries) {
      const next = `${rel}/${e.name}`
      if (e.isDirectory()) {
        if (e.name !== 'node_modules' && e.name !== 'dist') walk(next)
      } else if (e.name.endsWith('.ts') || e.name.endsWith('.tsx')) {
        out.push(next)
      }
    }
  }
  for (const pkg of readdirSync(join(ROOT, 'packages'))) {
    walk(`packages/${pkg}/src`)
    walk(`packages/${pkg}/test`)
  }
  return out
}

/** Every surface that quotes a number, and therefore has to be kept honest. */
const SURFACES = [
  'README.md',
  'llms.txt',
  'PITFALLS.md',
  'CLAUDE.md',
  'apps/docs/src/content/docs/index.mdx',
  'apps/docs/src/content/docs/cli.mdx',
  'apps/docs/src/content/docs/mcp.mdx',
  'apps/docs/src/content/docs/pitfalls.mdx',
  'apps/docs/src/content/docs/skill.mdx',
  'apps/docs/astro.config.mjs',
  'skills/earnforge/SKILL.md',
  'skills/earnforge/references/pitfalls.md',
  'packages/mcp/README.md',
  'packages/sdk/README.md',
]

/**
 * Find every place a surface claims "<n> <noun>", so a claim cannot hide in
 * wording the sweep did not anticipate. Four of the fourteen misses were exactly
 * that: "All 23 are documented", "24 Pitfalls Guide", "All 24 tests", and a
 * sidebar label, none of which matched the pattern being grepped at the time.
 *
 * Scans the text with all whitespace flattened, because a claim can wrap across
 * a line break: SKILL.md's frontmatter read "...and 23 documented\n  API
 * pitfalls..." and survived a line-by-line version of this very check.
 * Exclusions therefore apply to a window around each match rather than to a
 * line, which is the same idea at the right granularity.
 */
function claims(text: string, noun: RegExp): number[] {
  const re = new RegExp(
    `(?:\\b|>)(\\d{1,3})\\s*(?:\\w+\\s+){0,2}?${noun.source}`,
    'gi'
  )
  // Percent-encoding in badge URLs fakes a match: `API%20pitfalls-25-red`
  // reads as "20 pitfalls" to any regex that does not decode it first. The
  // badge's real value is asserted separately.
  const flat = text.replace(/%[0-9A-Fa-f]{2}/g, ' ').replace(/\s+/g, ' ')
  const out: number[] = []
  for (const m of flat.matchAll(re)) {
    const at = m.index ?? 0
    const window = flat.slice(Math.max(0, at - 110), at + 110)
    // Skip claims describing someone else's product. CLAUDE.md and llms.txt
    // both state LI.FI's own counts on purpose (their MCP server has 25 tools,
    // their CLI has 13 commands), and those must not be read as claims about
    // this repo.
    if (/LI\.FI's|lifi-cli|mcp\.li\.quest|get-earn-\*/.test(window)) {
      continue
    }
    // `doctor` runs a subset of the pitfalls as runtime checks. That number is
    // legitimately different from the total and is asserted on its own below.
    if (/\d+ checks\b/.test(window)) {
      continue
    }
    out.push(Number(m[1]))
  }
  return out
}

describe('pitfall count agrees everywhere', () => {
  const testFiles = readdirSync(
    join(ROOT, 'packages/sdk/test/pitfalls')
  ).filter((f) => /^pitfall-\d+-.*\.test\.ts$/.test(f))

  it('has one uniquely numbered test file per pitfall, with no gaps', () => {
    const nums = testFiles
      .map((f) => Number(f.match(/^pitfall-(\d+)-/)?.[1]))
      .sort((a, b) => a - b)
    expect(new Set(nums).size).toBe(nums.length)
    // A gap means a pitfall was removed without renumbering, which silently
    // makes every published "N pitfalls" claim wrong.
    expect(nums).toEqual(nums.map((_, i) => i + 1))
  })

  const N = testFiles.length

  it(`PITFALLS.md documents all ${N}`, () => {
    const md = read('PITFALLS.md')
    const rows = count(md, /^\| \d+ \| /gm)
    expect(rows).toBe(N)
  })

  it(`the docs site lists all ${N}`, () => {
    const mdx = read('apps/docs/src/content/docs/pitfalls.mdx')
    expect(count(mdx, /^### Pitfall \d+/gm)).toBe(N)
    expect(count(mdx, /^\| \d+ \| /gm)).toBe(N)
  })

  it(`the agent skill lists all ${N}`, () => {
    expect(
      count(read('skills/earnforge/references/pitfalls.md'), /^\| \d+ \| /gm)
    ).toBe(N)
  })

  it(`the README badge reads ${N}`, () => {
    // Percent-encoded, so it is invisible to every plain-text sweep. It sat
    // stale at 24 through three of them.
    const badge = read('README.md').match(
      /img\.shields\.io\/badge\/API%20pitfalls-(\d+)-/
    )
    expect(badge?.[1]).toBe(String(N))
  })

  it('doctor advertises the number of checks it actually runs', () => {
    // A different number from the total, and the reason the scan above skips
    // "N checks" lines. Asserted here so skipping it does not create a hole.
    const doctor = read('packages/cli/src/doctor.ts')
    const vault = (
      doctor
        .match(/export function runDoctorChecks[\s\S]*?\n}/)?.[0]
        ?.match(/checks\.push\(\{/g) ?? []
    ).length
    const env = (
      doctor
        .match(/export function runEnvChecks[\s\S]*?\n}/)?.[0]
        ?.match(/checks\.push\(\{/g) ?? []
    ).length
    expect(vault).toBeGreaterThan(0)
    expect(env).toBeGreaterThan(0)
    for (const f of SURFACES) {
      for (const m of readIfPresent(f).matchAll(
        /(\d+) checks(?:[^:]*): (\d+) pitfall guards (?:plus|\+) (\d+) environment/g
      )) {
        expect(`${f}: ${m[0]}`).toBe(
          `${f}: ${vault + env} checks${m[0].slice(m[0].indexOf(' checks') + 7, m[0].indexOf(':'))}: ${vault} pitfall guards ${m[0].includes('plus') ? 'plus' : '+'} ${env} environment`
        )
      }
    }
  })

  it(`no surface quotes a pitfall count other than ${N}`, () => {
    const wrong: string[] = []
    for (const f of SURFACES) {
      for (const n of claims(readIfPresent(f), /pitfalls?\b/)) {
        // Ignore ordinals inside prose like "Pitfalls 15-25 were found by...":
        // those name a range, not a total. Only totals are asserted.
        if (n !== N && n > 10) {
          wrong.push(`${f}: claims ${n} pitfalls, actual ${N}`)
        }
      }
    }
    expect(wrong).toEqual([])
  })
})

describe('CLI command count agrees everywhere', () => {
  const src = read('packages/cli/src/index.ts')
  const commands = [...src.matchAll(/\.command\('([a-z0-9:-]+)'/g)].map(
    (m) => m[1] as string
  )
  const N = commands.length

  it('registers each command exactly once', () => {
    expect(new Set(commands).size).toBe(N)
  })

  it(`the CLI reference documents all ${N}`, () => {
    const mdx = read('apps/docs/src/content/docs/cli.mdx')
    const documented = [...mdx.matchAll(/^### earnforge ([a-z0-9:-]+)/gm)].map(
      (m) => m[1] as string
    )
    // Named, not just counted: an equal count with a different set is still wrong.
    expect([...documented].sort()).toEqual([...commands].sort())
  })

  it('the agent skill mentions every command', () => {
    const skill = read('skills/earnforge/SKILL.md')
    const missing = commands.filter(
      (c) => !new RegExp(`earnforge ${c}\\b`).test(skill)
    )
    expect(missing).toEqual([])
  })

  it(`no surface quotes a command count other than ${N}`, () => {
    const wrong: string[] = []
    for (const f of SURFACES) {
      for (const n of claims(readIfPresent(f), /commands?\b/)) {
        if (n !== N && n > 5) {
          wrong.push(`${f}: claims ${n} commands, actual ${N}`)
        }
      }
    }
    expect(wrong).toEqual([])
  })
})

describe('MCP tool count agrees everywhere', () => {
  const src = read('packages/mcp/src/server.ts')
  const tools = [...src.matchAll(/registerTool\(\s*'([a-z0-9-]+)'/g)].map(
    (m) => m[1] as string
  )
  const N = tools.length

  it('registers each tool exactly once', () => {
    expect(N).toBeGreaterThan(0)
    expect(new Set(tools).size).toBe(N)
  })

  it(`the MCP reference documents all ${N}`, () => {
    const mdx = read('apps/docs/src/content/docs/mcp.mdx')
    const documented = [...mdx.matchAll(/^### ([a-z0-9-]+)$/gm)].map(
      (m) => m[1] as string
    )
    expect([...documented].sort()).toEqual([...tools].sort())
  })

  it('llms.txt names every tool', () => {
    const llms = read('llms.txt')
    const missing = tools.filter((t) => !llms.includes(t))
    expect(missing).toEqual([])
  })

  it(`no surface quotes a tool count other than ${N}`, () => {
    const wrong: string[] = []
    for (const f of SURFACES) {
      for (const n of claims(readIfPresent(f), /(?:MCP )?tools?\b/)) {
        if (n !== N && n > 5) {
          wrong.push(`${f}: claims ${n} tools, actual ${N}`)
        }
      }
    }
    expect(wrong).toEqual([])
  })
})

describe('fleet figures are quoted consistently', () => {
  /**
   * These drift daily, so they are not asserted against the live API here (that
   * belongs in the live suite). What is asserted is that every surface quoting
   * one quotes the *same* one: a sweep that updates four of five places is the
   * failure mode, and it has happened repeatedly.
   */
  const FIGURE_SURFACES = [
    ...SURFACES.filter((f) => !f.endsWith('.mjs') && f !== 'CLAUDE.md'),
    ...codeSurfaces(),
  ]

  /**
   * Below this, a "<n> vaults" claim is a subset rather than the fleet.
   *
   * The repo legitimately quotes scoped counts — "Base is ~115 vaults",
   * "160 of Morpho's 210", "the 510 vaults without rewards" — and comparing
   * those against the fleet size is noise, not a finding. The fleet has run
   * 700-800 all year and the live suite fails long before it could approach
   * this floor, so the split is unambiguous today. If the fleet ever really
   * falls under 600, this constant is the thing to revisit.
   */
  const FLEET_SCALE = 600

  it('all surfaces agree on the vault count', () => {
    const seen = new Map<number, string[]>()
    for (const f of FIGURE_SURFACES) {
      for (const line of readIfPresent(f).split('\n')) {
        // The drift detector's sample size is also "<n> vaults" and is a
        // configured constant, not a measurement of the fleet.
        if (/samples?\b|drift check/i.test(line)) {
          continue
        }
        for (const m of line.matchAll(/\b(\d{3,4}) (?:live )?vaults\b/g)) {
          const n = Number(m[1])
          if (n < FLEET_SCALE) {
            continue
          }
          seen.set(n, [...(seen.get(n) ?? []), f])
        }
      }
    }
    // One value, or none. Two different values means a partial sweep, which is
    // the exact shape of every stale-figure incident so far.
    const disagreement = [...seen.entries()].map(
      ([n, files]) => `${n}: ${[...new Set(files)].join(', ')}`
    )
    expect(disagreement.length).toBeLessThanOrEqual(1)
  })

  it('all surfaces agree on the protocol count', () => {
    const seen = new Set<number>()
    for (const f of FIGURE_SURFACES) {
      for (const m of readIfPresent(f).matchAll(/\b(\d{1,3}) protocols\b/g)) {
        seen.add(Number(m[1]))
      }
    }
    expect([...seen].length).toBeLessThanOrEqual(1)
  })

  it('all surfaces agree on the chain count', () => {
    const seen = new Map<number, string[]>()
    for (const f of FIGURE_SURFACES) {
      for (const line of readIfPresent(f).split('\n')) {
        for (const m of line.matchAll(/\b(\d{1,3}) chains\b/g)) {
          const n = Number(m[1])
          // Same split as the vault count: the protocol tier table describes
          // individual protocols as spanning "3 chains" or "4 chains", which
          // says nothing about how many chains the Earn API indexes.
          if (n < 10) {
            continue
          }
          seen.set(n, [...(seen.get(n) ?? []), f])
        }
      }
    }
    const disagreement = [...seen.entries()].map(
      ([n, files]) => `${n}: ${[...new Set(files)].join(', ')}`
    )
    expect(disagreement.length).toBeLessThanOrEqual(1)
  })
})

describe('no published surface quotes a test count', () => {
  /**
   * A test count moves on nearly every commit, and this one went stale in
   * public three times before the rule was written down. The README badge
   * still read "600+ passing" while CLAUDE.md, two lines under the rule
   * forbidding it, quoted an exact figure of its own.
   *
   * Scoped to surfaces that actually ship. The April-era planning documents
   * (UPDATES.md, SUBMISSION.md, the tweet threads) are dated artifacts whose
   * numbers were true when written, and rewriting history is not the goal.
   */
  const PUBLISHED = SURFACES.filter((f) => !f.endsWith('.mjs'))

  it('quotes no test total anywhere it would go stale', () => {
    const offenders: string[] = []
    for (const f of PUBLISHED) {
      const text = readIfPresent(f).replace(/%20/g, ' ')
      for (const line of text.split('\n')) {
        // "22 checks" and "18 pitfall guards" are derived and asserted above;
        // this is about counting the test suite itself. A pitfall test count
        // is pinned to the pitfall count by the invariants at the top of this
        // file, so it cannot drift independently and is not a stale-count risk.
        if (/pitfall/i.test(line)) {
          continue
        }
        for (const m of line.matchAll(
          /\b(\d{2,4})\s*\+?\s*(?:mocked |live |unit |passing )*tests?\b/gi
        )) {
          offenders.push(`${f}: ${m[0].trim()}`)
        }
        for (const m of line.matchAll(/\btests?-(\d{2,4})/gi)) {
          offenders.push(`${f}: badge ${m[0]}`)
        }
      }
    }
    expect(offenders).toEqual([])
  })
})

describe('published package versions are coherent', () => {
  const pkgs = ['sdk', 'cli', 'mcp', 'react', 'skill']

  it('every workspace dependency uses the workspace protocol', () => {
    // npm ships `workspace:^` verbatim; pnpm rewrites it. Three packages were
    // published uninstallable this way. The protocol must be present in source
    // so that pnpm has something to rewrite.
    for (const p of pkgs) {
      const json = JSON.parse(read(`packages/${p}/package.json`))
      for (const [name, range] of Object.entries({
        ...(json.dependencies ?? {}),
        ...(json.peerDependencies ?? {}),
      })) {
        if (name.startsWith('@earnforge/')) {
          expect(`${p}: ${name}=${range}`).toMatch(/workspace:/)
        }
      }
    }
  })

  it('cli and mcp rebuild on pack, so dist cannot lag the version', () => {
    // Both inline pkg.version at build time. A version bumped after the last
    // build ships a dist reporting the old number.
    for (const p of ['cli', 'mcp']) {
      const json = JSON.parse(read(`packages/${p}/package.json`))
      expect(`${p}:${json.scripts?.prepack ?? ''}`).toMatch(/build/)
    }
  })
})
