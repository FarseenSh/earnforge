// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest'
import vaultSingle from '../../fixtures/src/vault-single.json'
import { rewardSustainability } from '../src/reward-sustainability.js'
import { VaultSchema } from '../src/schemas/index.js'
import type { Vault } from '../src/schemas/vault.js'

const base = VaultSchema.parse(vaultSingle)

/** Real vault, with the reward fields under test overridden. */
function withApy(
  apy: { base: number | null; total: number; reward: number | null },
  rewardTokens?: Vault['rewardTokens']
): Vault {
  return {
    ...base,
    analytics: { ...base.analytics, apy },
    ...(rewardTokens === undefined ? {} : { rewardTokens }),
  }
}

describe('rewardSustainability', () => {
  describe('the three-valued apy.reward', () => {
    it('treats reward=0 as genuinely organic, not merely unreported', () => {
      // Morpho reports 0 on 160 of 210 vaults. That is a statement, and it
      // is the strongest sustainability signal available.
      const r = rewardSustainability(
        withApy({ base: 4.6, total: 4.6, reward: 0 })
      )
      expect(r.label).toBe('organic')
      expect(r.score).toBe(10)
      expect(r.reasons[0]).toMatch(/explicitly reports no incentives/)
    })

    it('treats reward=null as unknown, never as zero', () => {
      // This is the whole reason the schema does not coerce null to 0. Aave
      // returns null on 143 of 160 vaults; scoring those as organic would be
      // confidently wrong about most of the protocol.
      const r = rewardSustainability(
        withApy({ base: 4.6, total: 4.6, reward: null })
      )
      expect(r.label).toBe('unknown')
      expect(r.rewardShare).toBeNull()
      expect(r.organicApy).toBeNull()
      expect(r.reasons[0]).toMatch(/not zero/)
    })

    it('scores null-with-reward-tokens below null-alone', () => {
      // Emitting reward tokens while reporting no reward APY is evidence the
      // headline is incentive-driven even though the split is unreported.
      const bare = rewardSustainability(
        withApy({ base: 4.6, total: 4.6, reward: null })
      )
      const emitting = rewardSustainability(
        withApy({ base: 4.6, total: 4.6, reward: null }, [
          { address: '0xreward' },
        ])
      )
      expect(emitting.score).toBeLessThan(bare.score)
      expect(emitting.label).toBe('unknown')
    })
  })

  describe('grading by incentive share', () => {
    it('calls a 2% incentive share organic', () => {
      const r = rewardSustainability(
        withApy({ base: 9.8, total: 10, reward: 0.2 })
      )
      expect(r.label).toBe('organic')
    })

    it('calls a 20% share mostly organic', () => {
      const r = rewardSustainability(withApy({ base: 8, total: 10, reward: 2 }))
      expect(r.label).toBe('mostly-organic')
      expect(r.organicApy).toBe(8)
    })

    it('calls a 50% share incentive-heavy', () => {
      const r = rewardSustainability(withApy({ base: 5, total: 10, reward: 5 }))
      expect(r.label).toBe('incentive-heavy')
    })

    it('calls an 80% share incentive-dependent', () => {
      // The headline case: 12% that is really 2.4%.
      const r = rewardSustainability(
        withApy({ base: 2.4, total: 12, reward: 9.6 })
      )
      expect(r.label).toBe('incentive-dependent')
      expect(r.score).toBe(2)
      expect(r.organicApy).toBe(2.4)
      expect(r.reasons.join(' ')).toMatch(/only 2\.40%/)
    })

    it('orders the labels monotonically by score', () => {
      const scores = [
        withApy({ base: 10, total: 10, reward: 0 }),
        withApy({ base: 8, total: 10, reward: 2 }),
        withApy({ base: 5, total: 10, reward: 5 }),
        withApy({ base: 2, total: 10, reward: 8 }),
      ].map((v) => rewardSustainability(v).score)
      expect(scores).toEqual([...scores].sort((a, b) => b - a))
    })
  })

  describe('inference when base APY is missing', () => {
    it('derives organic yield from total minus reward, and says so', () => {
      // apy.base is null on at least one live vault while total is present.
      const r = rewardSustainability(
        withApy({ base: null, total: 10, reward: 4 })
      )
      expect(r.organicApy).toBe(6)
      expect(r.reasons.join(' ')).toMatch(/inferred/)
    })

    it('never infers a negative organic yield', () => {
      // reward > total is nonsense, but it is reported data, not ours.
      const r = rewardSustainability(
        withApy({ base: null, total: 3, reward: 5 })
      )
      expect(r.organicApy).toBe(0)
    })
  })

  describe('reward token count', () => {
    it('flags multiple emissions as independently expiring', () => {
      const r = rewardSustainability(
        withApy({ base: 5, total: 10, reward: 5 }, [
          { address: '0xa' },
          { address: '0xb' },
        ])
      )
      expect(r.rewardTokenCount).toBe(2)
      expect(r.reasons.join(' ')).toMatch(/independent emission/)
    })

    it('reports zero when rewardTokens is absent rather than empty', () => {
      // The field is omitted, not [], on the 510 vaults without rewards.
      const r = rewardSustainability(withApy({ base: 5, total: 5, reward: 0 }))
      expect(r.rewardTokenCount).toBe(0)
    })
  })

  it('handles a zero-APY vault without dividing by zero', () => {
    // 55 of 609 vaults are flagged specifically for zero_apy.
    const r = rewardSustainability(withApy({ base: 0, total: 0, reward: 0 }))
    expect(Number.isFinite(r.score)).toBe(true)
    expect(r.rewardShare).toBe(0)
  })

  it('scores the real fixture vault without throwing', () => {
    const r = rewardSustainability(base)
    expect(r.score).toBeGreaterThanOrEqual(0)
    expect(r.score).toBeLessThanOrEqual(10)
    expect(r.reasons.length).toBeGreaterThan(0)
  })
})
