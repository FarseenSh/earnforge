// SPDX-License-Identifier: Apache-2.0

import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import pkg from '../package.json' with { type: 'json' }
import { program } from '../src/index.js'

/**
 * `earnforge init` emitted a project that could not start.
 *
 * The page landed at `src/page.tsx` and there was no root layout, so
 * `next build` failed with "Couldn't find any `pages` or `app` directory"
 * before it reached a single line of the generated code. The scaffold printed
 * `npm install && npm run dev` immediately above that.
 *
 * Nothing caught it because no test had ever run the scaffolder, let alone
 * built its output — the generated *content* had been reviewed and corrected
 * in 1.0.0 while the file layout that decides whether any of it runs had not.
 *
 * These assert the structure Next.js requires. They cannot prove the project
 * builds — that needs a real install — but they fail on the specific mistake
 * that shipped.
 */
describe('earnforge init', () => {
  let dir: string
  let cwd: string

  beforeEach(() => {
    cwd = process.cwd()
    dir = mkdtempSync(join(tmpdir(), 'earnforge-scaffold-'))
    process.chdir(dir)
  })

  afterEach(() => {
    process.chdir(cwd)
    rmSync(dir, { recursive: true, force: true })
  })

  async function scaffold(name = 'demo') {
    await program.parseAsync(['node', 'earnforge', 'init', name])
    return join(dir, name)
  }

  it('puts the page where the App Router looks for it', async () => {
    const out = await scaffold()
    expect(existsSync(join(out, 'src', 'app', 'page.tsx'))).toBe(true)
    // The location that made `next build` fail outright.
    expect(existsSync(join(out, 'src', 'page.tsx'))).toBe(false)
  })

  it('emits the root layout the App Router requires', async () => {
    const out = await scaffold()
    const layout = join(out, 'src', 'app', 'layout.tsx')
    expect(existsSync(layout)).toBe(true)
    const src = readFileSync(layout, 'utf8')
    // A root layout must render html and body itself; Next does not add them.
    expect(src).toContain('<html')
    expect(src).toContain('<body')
  })

  it('emits a tsconfig, so the first build is not also a config migration', async () => {
    const out = await scaffold()
    const ts = join(out, 'tsconfig.json')
    expect(existsSync(ts)).toBe(true)
    const cfg = JSON.parse(readFileSync(ts, 'utf8'))
    expect(cfg.compilerOptions.jsx).toBeDefined()
    expect(cfg.include).toContain('**/*.tsx')
  })

  it('scaffolds the patterns it means to teach', async () => {
    const out = await scaffold()
    const page = readFileSync(join(out, 'src', 'app', 'page.tsx'), 'utf8')
    // Whatever a scaffolder emits becomes the pattern every new project copies.
    expect(page).toContain('apiKey')
    expect(page).toContain('isFlagged')
    expect(page).toContain('riskScore')
    // APY is already a percentage; a stray *100 here would propagate forever.
    expect(page).not.toMatch(/apy\.total\s*\*\s*100/)
  })

  it('pins the current Next major', async () => {
    const out = await scaffold()
    const deps = JSON.parse(
      readFileSync(join(out, 'package.json'), 'utf8')
    ).dependencies
    expect(deps.next).toMatch(/\^16\./)
  })
})

/**
 * `--version` was hardcoded '0.1.0', corrected to a hardcoded '1.0.0' in the
 * 1.0.0 release, and had drifted again by 1.0.3. Swapping one literal for
 * another fixes the value and never the cause.
 */
describe('earnforge --version', () => {
  it('reports the package version', () => {
    expect(program.version()).toBe(pkg.version)
  })
})
