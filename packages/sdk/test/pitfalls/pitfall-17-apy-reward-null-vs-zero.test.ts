// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest'
import vaultsBase from '../../../fixtures/src/vaults-base.json'
import vaultsEthereum from '../../../fixtures/src/vaults-ethereum.json'
import { ApySchema, VaultListResponseSchema } from '../../src/schemas/index.js'
import { getRewardApy, isRewardApyUnknown } from '../../src/schemas/vault.js'

/** Minimal analytics stub for the helper unit tests. */
function analytics(reward: number | null) {
  return {
    apy: { base: 1, total: 1, reward },
    tvl: { usd: 1 },
    apy1d: null,
    apy7d: null,
    apy30d: null,
    updatedAt: '2026-07-25T00:00:00Z',
  }
}

/**
 * Pitfall #17 — apy.reward is three-valued, and the split is per-vault.
 *
 * The original framing was "Morpho returns 0, Euler/Aave return null, so
 * normalise null to 0." Measured across 609 live vaults that is too simple in
 * two ways.
 *
 * First, all three states occur: null, exact 0, and a positive number. Second,
 * the split varies WITHIN a protocol rather than between protocols — morpho
 * shows 160 zeros alongside 50 non-zeros; aave shows 143 nulls alongside 17
 * non-zeros.
 *
 * So collapsing null to 0 destroys real information: "the protocol reported no
 * incentives" and "the protocol reported nothing" are different facts, and
 * reward-sustainability scoring needs to tell them apart. The schema preserves
 * null; `getRewardApy()` is the opt-in coercion.
 */
describe('Pitfall #17: apy.reward null vs 0 vs number', () => {
  it('preserves an explicit 0 as 0', () => {
    const apy = ApySchema.parse({ base: 3.5, total: 3.5, reward: 0 })
    expect(apy.reward).toBe(0)
  })

  it('preserves null as null rather than coercing it to 0', () => {
    const apy = ApySchema.parse({ base: 3.5, total: 3.5, reward: null })
    expect(apy.reward).toBeNull()
  })

  it('preserves a positive reward', () => {
    const apy = ApySchema.parse({ base: 3.5, total: 4.8, reward: 1.3 })
    expect(apy.reward).toBe(1.3)
  })

  it('getRewardApy coerces null to 0 for callers that want a number', () => {
    expect(getRewardApy(analytics(null))).toBe(0)
    expect(getRewardApy(analytics(2))).toBe(2)
  })

  it('isRewardApyUnknown distinguishes unreported from known-zero', () => {
    expect(isRewardApyUnknown(analytics(null))).toBe(true)
    expect(isRewardApyUnknown(analytics(0))).toBe(false)
  })

  it('apy.base is nullable too — a live vault reports null', () => {
    const apy = ApySchema.parse({ base: null, total: 0, reward: null })
    expect(apy.base).toBeNull()
  })

  it('all three states appear across the live fixtures', () => {
    const vaults = [
      ...VaultListResponseSchema.parse(vaultsBase).data,
      ...VaultListResponseSchema.parse(vaultsEthereum).data,
    ]
    const rewards = vaults.map((v) => v.analytics.apy.reward)
    expect(rewards.some((r) => r === null)).toBe(true)
    expect(rewards.some((r) => r === 0)).toBe(true)
    expect(rewards.some((r) => typeof r === 'number' && r > 0)).toBe(true)
  })

  it('the null/zero split is not determined by protocol alone', () => {
    const vaults = [
      ...VaultListResponseSchema.parse(vaultsBase).data,
      ...VaultListResponseSchema.parse(vaultsEthereum).data,
    ]
    // At least one protocol must exhibit more than one reward state, which is
    // what invalidates any per-protocol rule.
    const states = new Map<string, Set<string>>()
    for (const v of vaults) {
      const key = v.protocol.id ?? v.protocol.name
      const r = v.analytics.apy.reward
      const state = r === null ? 'null' : r === 0 ? 'zero' : 'nonzero'
      if (!states.has(key)) {
        states.set(key, new Set())
      }
      states.get(key)?.add(state)
    }
    const mixed = [...states.values()].filter((s) => s.size > 1)
    expect(mixed.length).toBeGreaterThan(0)
  })
})
