// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest'
import vaultFlagged from '../../../fixtures/src/vault-flagged.json'
import vaultsBase from '../../../fixtures/src/vaults-base.json'
import vaultsEthereum from '../../../fixtures/src/vaults-ethereum.json'
import { riskScore } from '../../src/risk-scorer.js'
import {
  VaultListResponseSchema,
  VaultSchema,
} from '../../src/schemas/index.js'
import { flagReasons, isFlagged } from '../../src/schemas/vault.js'
import { suggest } from '../../src/suggest.js'

/**
 * Pitfall #21 — `verificationStatus` exists, matters, and is documented nowhere.
 *
 * Every vault carries `verificationStatus` and `verificationStatusBreakdown`.
 * Neither appears in the OpenAPI spec, the changelog, the quickstart, or the
 * NormalizedVault reference. LI.FI's own hosted MCP server does not expose them.
 *
 * They are not cosmetic. Roughly 9% of the fleet is `flagged` — mostly
 * `zero_apy`, occasionally `apy_outlier`. A tool that ignores the field will
 * happily rank a flagged vault top of a max-APY list and recommend depositing
 * into it, which is precisely the case the flag exists to prevent.
 *
 * The lesson is about method rather than this one field: schemas derived from
 * documentation miss whatever the vendor forgot to write down. Deriving from
 * real responses is how this was found at all.
 */
describe('Pitfall #21: verificationStatus is undocumented but load-bearing', () => {
  const base = VaultListResponseSchema.parse(vaultsBase)
  const eth = VaultListResponseSchema.parse(vaultsEthereum)
  const all = [...base.data, ...eth.data]
  const flagged = VaultSchema.parse(vaultFlagged)

  it('is present on every vault', () => {
    for (const vault of all) {
      expect(vault.verificationStatus).toBeTypeOf('string')
    }
  })

  it('flags a real minority of the fleet', () => {
    const count = all.filter(isFlagged).length
    expect(count).toBeGreaterThan(0)
    expect(count).toBeLessThan(all.length)
  })

  it('exposes machine-readable reasons for a flag', () => {
    expect(isFlagged(flagged)).toBe(true)
    expect(flagReasons(flagged)).toContain('zero_apy')
  })

  it('reports no reasons for a clean vault', () => {
    const clean = all.find((v) => !isFlagged(v))
    expect(clean).toBeDefined()
    expect(flagReasons(clean!)).toEqual([])
  })

  it('feeds the risk score rather than being merely informational', () => {
    const score = riskScore(flagged)
    expect(score.breakdown.verification).toBeLessThan(10)
    expect(score.flags.some((f) => f.includes('flagged'))).toBe(true)
  })

  it('caps a flagged vault below the low-risk threshold', () => {
    // Structural, not incidental: verification carries 0.22 of the weight, so a
    // flagged vault cannot reach 8 even scoring perfectly everywhere else.
    for (const vault of all.filter(isFlagged)) {
      expect(riskScore(vault).score).toBeLessThan(8)
      expect(riskScore(vault).label).not.toBe('low')
    }
  })

  it('keeps flagged vaults out of allocations by default', () => {
    const candidates = all.filter((v) => isFlagged(v) && v.isTransactional)
    if (candidates.length > 0) {
      expect(suggest(candidates, { amount: 10_000 }).allocations).toHaveLength(
        0
      )
    }
  })

  it('admits flagged vaults only on an explicit opt-in', () => {
    const candidates = all.filter((v) => isFlagged(v) && v.isTransactional)
    if (candidates.length > 0) {
      const result = suggest(candidates, {
        amount: 10_000,
        includeFlagged: true,
      })
      expect(result.allocations.length).toBeGreaterThan(0)
    }
  })
})
