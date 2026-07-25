// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest'
import protocols from '../../../fixtures/src/protocols.json'
import { ProtocolListResponseSchema } from '../../src/schemas/index.js'
import { STRATEGIES } from '../../src/strategies.js'

/**
 * Pitfall #19 — protocol slugs went unversioned, and the old ones fail silently.
 *
 * The Apr 2026 rewrite dropped version suffixes: `morpho-v1` became `morpho`,
 * `aave-v3` became `aave`, `euler-v2` became `euler`. `maple` left the index
 * entirely.
 *
 * What makes this dangerous is the failure mode. Filtering on a slug that no
 * longer exists does not 400 and does not signal an unknown value — it returns
 * HTTP 200 with `total: 0`. So a stale hardcoded slug is indistinguishable from
 * "this protocol genuinely has no vaults", and a strategy preset silently
 * matches nothing while every test still passes.
 *
 * Our own code shipped this bug: the risk scorer's protocol tiers were keyed on
 * versioned slugs, so every Aave and Morpho vault fell through to the unknown-
 * protocol default of 3 — scoring the two largest, most audited protocols on
 * the platform as if nobody had heard of them.
 *
 * LI.FI's hosted MCP server still advertises the versioned slugs to agents.
 */
describe('Pitfall #19: stale protocol slugs return zero results, not an error', () => {
  const live = ProtocolListResponseSchema.parse(protocols)
  const liveIds = new Set(live.map((p) => p.id ?? p.name))

  it('no live protocol carries a version suffix', () => {
    for (const p of live) {
      expect(p.id ?? p.name).not.toMatch(/-v\d+$/)
    }
  })

  it('the pre-Apr-2026 slugs are all absent', () => {
    for (const stale of ['morpho-v1', 'aave-v3', 'euler-v2', 'ethena-usde']) {
      expect(liveIds.has(stale)).toBe(false)
    }
  })

  it('their unversioned replacements are present', () => {
    for (const current of ['morpho', 'aave', 'euler', 'ethena']) {
      expect(liveIds.has(current)).toBe(true)
    }
  })

  it('every protocol id in every strategy preset exists upstream', () => {
    // The guard that would have caught the original bug. A typo or a stale slug
    // here produces an empty strategy rather than an error, so this assertion is
    // the only thing standing between the two.
    for (const [name, preset] of Object.entries(STRATEGIES)) {
      for (const id of preset.filters.protocols ?? []) {
        expect(
          liveIds.has(id),
          `strategy "${name}" references unknown protocol "${id}"`
        ).toBe(true)
      }
    }
  })

  it('maple is no longer indexed by Earn', () => {
    // Retained in the risk tiers and the DeFiLlama map for vaults cached before
    // it left, but it must not be referenced by any active filter.
    expect(liveIds.has('maple')).toBe(false)
  })
})
