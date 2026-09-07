#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
/**
 * Release verification: is what is PUBLISHED and DEPLOYED actually correct?
 *
 * `pnpm verify` proves the repository is coherent. It cannot prove anything
 * about npm, the Worker, or the docs site, and that gap is where "done" kept
 * being declared prematurely: committing, publishing, and deploying are three
 * separate actions and only the first is covered by CI.
 *
 * Every check here corresponds to something that actually went wrong:
 *
 *   npm version lag      the route-flag work sat unpublished while being
 *                        reported as shipped
 *   workspace: protocol  three packages shipped uninstallable
 *   dist lags version    cli/mcp inline pkg.version at build time
 *   built-binary --json  `simulate --json` threw on every run in every
 *                        published version, because no gate ever ran the
 *                        binary: the mocked suite imports modules and the
 *                        live suite talks to the SDK
 *   worker staleness     the hosted MCP served 12 tools after a 13th shipped
 *   deployed docs        the site is a separate deploy from the commit
 *   dead anchors         a hand-written cross-page link guessed the slug
 *
 * Usage:  set -a && . ./.env && set +a && pnpm ship-check
 * Exit 0 means every published surface matches this working tree.
 */
import { execFile } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { promisify } from 'node:util'

const run = promisify(execFile)
const ROOT = new URL('..', import.meta.url).pathname
const read = (p) => readFileSync(ROOT + p, 'utf8')
const json = (p) => JSON.parse(read(p))

const PKGS = ['sdk', 'cli', 'mcp', 'react', 'skill']
const DOCS = 'https://earnforge-docs.vercel.app'
const STUDIO = 'https://earnforge-studio.vercel.app'
const WORKER = 'https://earnforge-mcp.papermind-ai.workers.dev'

/**
 * Strips the spinner's ANSI escapes so the JSON underneath can be parsed.
 * Built from a char code rather than written as a literal: an escape byte in
 * source is a control character, which Biome rejects outright.
 */
const ANSI = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*[A-Za-z]`, 'g')

let failures = 0
let checks = 0

function ok(label, detail = '') {
  checks++
  console.log(`  \x1b[32mOK\x1b[0m   ${label}${detail ? `  ${detail}` : ''}`)
}
function bad(label, detail) {
  checks++
  failures++
  console.log(`  \x1b[31mFAIL\x1b[0m ${label}  ${detail}`)
}
function section(name) {
  console.log(`\n\x1b[1m${name}\x1b[0m`)
}

// ── npm ──────────────────────────────────────────────────────────────
section('npm: published version matches this tree')
for (const p of PKGS) {
  const local = json(`packages/${p}/package.json`).version
  let latest = null
  try {
    // Read the registry directly: `npm view` can serve a cached answer, and
    // npm's read endpoint lags its write endpoint by a minute or two after a
    // publish, which has already caused one false alarm.
    const res = await fetch(`https://registry.npmjs.org/@earnforge/${p}`)
    latest = (await res.json())['dist-tags']?.latest
  } catch (e) {
    bad(`@earnforge/${p}`, `registry unreachable: ${e.message}`)
    continue
  }
  if (latest === local) {
    ok(`@earnforge/${p}`, local)
  } else {
    bad(`@earnforge/${p}`, `local ${local}, npm ${latest}`)
  }
}

// ── package shape ────────────────────────────────────────────────────
section('package shape')
for (const p of PKGS) {
  const j = json(`packages/${p}/package.json`)
  const deps = { ...(j.dependencies ?? {}), ...(j.peerDependencies ?? {}) }
  const leaked = Object.entries(deps).filter(
    ([n, r]) =>
      n.startsWith('@earnforge/') && !String(r).startsWith('workspace:')
  )
  if (leaked.length) {
    bad(`${p} workspace protocol`, JSON.stringify(leaked))
  }
}
ok('workspace protocol intact in every manifest')

// ── published content, not just the published version ────────────────
section('published content matches this tree')
/**
 * Matching version numbers do not mean matching content.
 *
 * `@earnforge/skill` copies `skills/earnforge/**` in at prepack, and
 * `@earnforge/mcp` embeds the same files in its bundle at build time. Editing
 * those files after a release leaves both packages published at the current
 * version while shipping the previous content, and a version comparison reports
 * that as fine. It already happened once: `earnforge compare` was added to
 * SKILL.md after 1.2.0 went out, so both packages advertised a command their
 * copy did not document.
 */
const SKILL_FILES = [
  'SKILL.md',
  'references/pitfalls.md',
  'references/examples.md',
  'references/strategies.md',
  'references/chains.md',
  'references/protocols.md',
]
const tmp = `${ROOT}node_modules/.cache/ship-check`
try {
  await run('rm', ['-rf', tmp])
  await run('mkdir', ['-p', tmp])
  // Pinned to the exact version and forced online. `@latest` with a warm npm
  // cache resolves the tag from cached metadata and can hand back the previous
  // tarball, which made this check report a correctly-published package as
  // stale. A verification step that lies in the safe direction is still a
  // check that cannot be trusted.
  const skillVersion = json('packages/skill/package.json').version
  await run(
    'npm',
    ['pack', `@earnforge/skill@${skillVersion}`, '--prefer-online', '--silent'],
    { cwd: tmp }
  )
  const [tgz] = (
    await run('sh', ['-c', `ls ${tmp}/earnforge-skill-*.tgz`])
  ).stdout
    .trim()
    .split('\n')
  await run('tar', ['xzf', tgz, '-C', tmp])

  const drifted = []
  for (const f of SKILL_FILES) {
    const mine = read(`skills/earnforge/${f}`).trim()
    let theirs = null
    try {
      theirs = readFileSync(`${tmp}/package/${f}`, 'utf8').trim()
    } catch {
      drifted.push(`${f} (absent)`)
      continue
    }
    if (mine !== theirs) drifted.push(f)
  }
  if (drifted.length) {
    bad(
      '@earnforge/skill content',
      `stale: ${drifted.join(', ')}; needs a republish`
    )
  } else {
    ok(
      '@earnforge/skill ships the current skill files',
      `${SKILL_FILES.length}`
    )
  }

  // The mcp bundle embeds the same content, so it goes stale for the same
  // reason and independently of its own source changing.
  const mcpVersion = json('packages/mcp/package.json').version
  await run(
    'npm',
    ['pack', `@earnforge/mcp@${mcpVersion}`, '--prefer-online', '--silent'],
    { cwd: tmp }
  )
  const [mtgz] = (
    await run('sh', ['-c', `ls ${tmp}/earnforge-mcp-*.tgz`])
  ).stdout
    .trim()
    .split('\n')
  await run('tar', ['xzf', mtgz, '-C', tmp])
  const bundle = (
    await run('sh', ['-c', `cat ${tmp}/package/dist/esm/*.mjs`], {
      maxBuffer: 64 * 1024 * 1024,
    })
  ).stdout
  // Probes are taken from the GENERATED `skill-content.ts`, not from SKILL.md.
  // That file has already escaped the content exactly as the bundle will, so
  // its literals match verbatim; sampling raw markdown instead meant filtering
  // out every line containing a backtick or a backslash, which silently skipped
  // most of the file. A first version did that and failed to notice an appended
  // command, so the check passed while the package was stale.
  let generated = null
  try {
    generated = read('packages/mcp/src/skill-content.ts')
  } catch {
    bad(
      '@earnforge/mcp embedded skill',
      'skill-content.ts absent; run pnpm --filter @earnforge/mcp generate'
    )
  }
  if (generated) {
    // The markdown is stored JSON-escaped, so `\n` appears throughout and
    // filtering chunks containing a backslash discards essentially the whole
    // file. Split ON the escaped newlines instead and keep the prose between
    // them, which is what actually has to survive into the bundle verbatim.
    const chunks = generated
      .split('\\n')
      .map((c) => c.trim())
      .filter((c) => c.length >= 50 && !/[\\'"`]/.test(c))
    // Every chunk, not a sample. Sampling every Nth chunk passed while the
    // published bundle was genuinely stale, because the one line that had
    // changed fell between two sampled points. A drift check that can miss a
    // single-line drift is not a check.
    const probes = [...new Set(chunks)]
    const missing = probes.filter((c) => !bundle.includes(c))
    if (probes.length < 20) {
      bad(
        '@earnforge/mcp embedded skill',
        `only ${probes.length} probes extracted; the generated file shape changed`
      )
    } else if (missing.length) {
      bad(
        '@earnforge/mcp embedded skill',
        `stale (${missing.length}/${probes.length} absent, e.g. "${missing[0].slice(0, 40)}..."); regenerate, rebuild, republish`
      )
    } else {
      ok(
        '@earnforge/mcp embeds the current skill content',
        `${probes.length} probes`
      )
    }
  }
} catch (e) {
  bad('published content check', String(e.message).slice(0, 80))
}

// ── the built binary ─────────────────────────────────────────────────
section('built CLI binary: every command emits parseable JSON')
const BIN = `${ROOT}packages/cli/dist/esm/bin.mjs`
const V = 'morpho:8453:_:0xbeef0e0834849acc03f0089f01f4f1eeb06873c9'
const W = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045'
const USDC = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913'
const SPENDER = '0xbeef0e0834849acc03f0089f01f4f1eeb06873c9'

/**
 * Commands are exercised through the built binary on purpose. Importing the
 * module would not have caught the BigInt serialisation fault: it only appears
 * once a real Composer response reaches `JSON.stringify`.
 *
 * `init` scaffolds a directory and `watch` is a long-running stream; both are
 * covered by the mocked CLI suite instead.
 */
const CMDS = [
  ['chains', ['chains']],
  ['protocols', ['protocols']],
  ['list', ['list', '--chain', '8453']],
  ['top', ['top', '--asset', 'USDC', '--limit', '3']],
  ['vault', ['vault', V]],
  ['risk', ['risk', V]],
  [
    'compare',
    ['compare', V, 'aave:8453:_:0x4e65fe4dba92790696d040ac24aa414708f5c0ab'],
  ],
  ['apy-history', ['apy-history', V]],
  ['suggest', ['suggest', '--amount', '10000', '--asset', 'USDC']],
  ['portfolio', ['portfolio', W]],
  ['preflight', ['preflight', '--vault', V, '--wallet', W]],
  ['doctor', ['doctor', '--vault', V]],
  ['doctor --env', ['doctor', '--env']],
  ['quote', ['quote', '--vault', V, '--amount', '100', '--wallet', W]],
  ['withdraw', ['withdraw', '--vault', V, '--amount', '1', '--wallet', W]],
  [
    'allowance',
    [
      'allowance',
      '--token',
      USDC,
      '--owner',
      W,
      '--spender',
      SPENDER,
      '--amount',
      '1000000',
      '--chain',
      '8453',
    ],
  ],
  [
    'approve',
    [
      'approve',
      '--token',
      USDC,
      '--spender',
      SPENDER,
      '--chain',
      '8453',
      '--amount',
      '1000000',
    ],
  ],
  [
    'simulate',
    [
      'simulate',
      '--vault',
      V,
      '--amount',
      '100',
      '--wallet',
      W,
      '--allow-revert',
    ],
  ],
  [
    'probe',
    [
      'probe',
      '--flag',
      'smart-deposit',
      '--vault',
      V,
      '--from-chain',
      '42161',
      '--from-token',
      '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
      '--wallet',
      W,
    ],
  ],
]

if (!process.env.LIFI_API_KEY) {
  bad('LIFI_API_KEY', 'not set; every command check would fail as auth')
} else {
  for (const [label, args] of CMDS) {
    let out = ''
    try {
      const r = await run('node', [BIN, ...args, '--json'], {
        maxBuffer: 32 * 1024 * 1024,
      })
      out = r.stdout
    } catch (e) {
      // A non-zero exit is legitimate for some commands (a reverting
      // simulation), so stdout is still parsed rather than failing outright.
      out = e.stdout ?? ''
      if (!out) {
        bad(
          `cli ${label}`,
          String(e.stderr ?? e.message)
            .split('\n')[0]
            .slice(0, 70)
        )
        continue
      }
    }
    const clean = out.replace(ANSI, '')
    const start = ['{', '['].map((t) => clean.indexOf(t)).filter((i) => i >= 0)
    if (!start.length) {
      bad(`cli ${label}`, 'no JSON in stdout')
      continue
    }
    try {
      JSON.parse(clean.slice(Math.min(...start)))
      ok(`cli ${label} --json`)
    } catch (e) {
      bad(`cli ${label} --json`, String(e.message).slice(0, 70))
    }
  }
}

// ── hosted Worker ────────────────────────────────────────────────────
section('hosted MCP Worker')
const registered = [
  ...read('packages/mcp/src/server.ts').matchAll(
    /registerTool\(\s*'([a-z0-9-]+)'/g
  ),
].map((m) => m[1])
try {
  const h = await fetch(`${WORKER}/health`)
  h.ok
    ? ok('worker /health', String(h.status))
    : bad('worker /health', String(h.status))

  const res = await fetch(`${WORKER}/mcp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/list',
      params: {},
    }),
  })
  const text = await res.text()
  const line = text
    .split('\n')
    .map((l) => l.replace(/^data: /, ''))
    .filter((l) => l.startsWith('{'))
    .pop()
  const served = (JSON.parse(line).result?.tools ?? [])
    .map((t) => t.name)
    .sort()
  const want = [...registered].sort()
  if (JSON.stringify(served) === JSON.stringify(want)) {
    ok('worker serves exactly the tools in source', `${served.length}`)
  } else {
    bad(
      'worker tool list is stale',
      `missing ${want.filter((t) => !served.includes(t)).join(',') || 'none'}; deploy from packages/mcp`
    )
  }
} catch (e) {
  bad('worker', e.message.slice(0, 70))
}

// ── deployed docs ────────────────────────────────────────────────────
section('deployed docs and studio')
const PAGES = [
  '/',
  '/sdk/',
  '/cli/',
  '/react/',
  '/mcp/',
  '/skill/',
  '/risk/',
  '/pitfalls/',
  '/llms.txt',
]
const html = {}
for (const p of PAGES) {
  try {
    const r = await fetch(DOCS + p)
    html[p] = await r.text()
    r.ok
      ? ok(`docs ${p}`, String(r.status))
      : bad(`docs ${p}`, String(r.status))
  } catch (e) {
    bad(`docs ${p}`, e.message.slice(0, 60))
  }
}
try {
  const r = await fetch(STUDIO)
  r.ok ? ok('studio /', String(r.status)) : bad('studio /', String(r.status))
} catch (e) {
  bad('studio /', e.message.slice(0, 60))
}

// deployed content must match this tree, not merely exist
section('deployed content matches this tree')
const vaultFigure = read('llms.txt').match(/\b(\d{3,4}) vaults\b/)?.[1]
if (vaultFigure && html['/llms.txt']?.includes(`${vaultFigure} vaults`)) {
  ok('deployed llms.txt carries the current fleet figure', vaultFigure)
} else {
  bad(
    'deployed llms.txt is stale',
    `repo says ${vaultFigure}; redeploy the docs`
  )
}
const missingOnPage = registered.filter((t) => !html['/mcp/']?.includes(t))
if (missingOnPage.length) {
  bad(
    'deployed MCP page is behind this tree',
    `missing ${missingOnPage.join(', ')}`
  )
} else {
  ok(
    'deployed MCP page documents every registered tool',
    `${registered.length}`
  )
}

// ── internal anchors ─────────────────────────────────────────────────
section('cross-page anchors resolve')
const ids = {}
for (const p of PAGES) {
  ids[p] = new Set(
    [...(html[p] ?? '').matchAll(/id="([^"]+)"/g)].map((m) => m[1])
  )
}
let anchorsChecked = 0
for (const [from, body] of Object.entries(html)) {
  for (const m of (body ?? '').matchAll(/href="(\/[^"#]*\/?)(#[^"]+)"/g)) {
    const [, path, hash] = m
    if (!PAGES.includes(path) || !ids[path]) {
      continue
    }
    anchorsChecked++
    if (!ids[path].has(hash.slice(1))) {
      bad('dead anchor', `${from} -> ${path}${hash}`)
    }
  }
}
ok('internal anchors resolve', `${anchorsChecked} checked`)

// ── verdict ──────────────────────────────────────────────────────────
console.log(
  failures === 0
    ? `\n\x1b[32mship-check passed\x1b[0m: ${checks} checks, 0 failures\n`
    : `\n\x1b[31mship-check FAILED\x1b[0m: ${failures} of ${checks} checks\n`
)
process.exit(failures === 0 ? 0 : 1)
