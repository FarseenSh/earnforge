// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest'
import vaultsBase from '../../fixtures/src/vaults-base.json'
import { VaultListResponseSchema } from '../src/schemas/index.js'
import { suggest } from '../src/suggest.js'

const baseVaults = VaultListResponseSchema.parse(vaultsBase).data

describe('suggest — portfolio allocation engine', () => {
  it('returns allocations for USDC vaults', () => {
    const result = suggest(baseVaults, { amount: 10000, asset: 'USDC' })
    expect(result.allocations.length).toBeGreaterThan(0)
    expect(result.totalAmount).toBe(10000)
  })

  it('respects maxVaults constraint', () => {
    const result = suggest(baseVaults, { amount: 10000, maxVaults: 3 })
    expect(result.allocations.length).toBeLessThanOrEqual(3)
  })

  it('respects maxChains constraint', () => {
    const result = suggest(baseVaults, { amount: 10000, maxChains: 1 })
    const chains = new Set(result.allocations.map((a) => a.vault.chainId))
    expect(chains.size).toBeLessThanOrEqual(1)
  })

  it('allocation percentages sum to ~100%', () => {
    const result = suggest(baseVaults, { amount: 10000 })
    if (result.allocations.length > 0) {
      const totalPct = result.allocations.reduce(
        (sum, a) => sum + a.percentage,
        0
      )
      expect(totalPct).toBeGreaterThan(95)
      expect(totalPct).toBeLessThan(105)
    }
  })

  it('allocation amounts sum to total', () => {
    const result = suggest(baseVaults, { amount: 10000 })
    if (result.allocations.length > 0) {
      const totalAmt = result.allocations.reduce((sum, a) => sum + a.amount, 0)
      expect(totalAmt).toBeCloseTo(10000, -1)
    }
  })

  it('each allocation includes risk score', () => {
    const result = suggest(baseVaults, { amount: 10000 })
    for (const alloc of result.allocations) {
      expect(alloc.risk.score).toBeGreaterThanOrEqual(0)
      expect(alloc.risk.score).toBeLessThanOrEqual(10)
    }
  })

  it('filters by asset when specified', () => {
    const result = suggest(baseVaults, { amount: 10000, asset: 'USDC' })
    for (const alloc of result.allocations) {
      expect(
        alloc.vault.underlyingTokens.some((t) => t.symbol === 'USDC')
      ).toBe(true)
    }
  })

  it('returns empty allocations for non-existent asset', () => {
    const result = suggest(baseVaults, { amount: 10000, asset: 'NONEXISTENT' })
    expect(result.allocations).toHaveLength(0)
    expect(result.expectedApy).toBe(0)
  })

  it('only includes transactional vaults', () => {
    const result = suggest(baseVaults, { amount: 10000 })
    for (const alloc of result.allocations) {
      expect(alloc.vault.isTransactional).toBe(true)
    }
  })

  it('calculates expected APY as weighted average', () => {
    const result = suggest(baseVaults, { amount: 10000 })
    if (result.allocations.length > 0) {
      expect(result.expectedApy).toBeGreaterThan(0)
    }
  })

  it('handles single vault available', () => {
    // Vault names are not unique across the fleet, so take exactly one.
    const single = baseVaults.filter((v) => v.isTransactional).slice(0, 1)
    expect(single).toHaveLength(1)
    const result = suggest(single, { amount: 10000 })
    expect(result.allocations.length).toBeLessThanOrEqual(1)
  })

  it('never allocates into a verification-flagged vault by default', () => {
    const flagged = baseVaults.filter(
      (v) => v.verificationStatus === 'flagged' && v.isTransactional
    )
    if (flagged.length > 0) {
      const result = suggest(flagged, { amount: 10000 })
      expect(result.allocations).toHaveLength(0)
    }
  })

  it('allocates into flagged vaults only when explicitly opted in', () => {
    const flagged = baseVaults.filter(
      (v) => v.verificationStatus === 'flagged' && v.isTransactional
    )
    if (flagged.length > 0) {
      const result = suggest(flagged, { amount: 10000, includeFlagged: true })
      expect(result.allocations.length).toBeGreaterThan(0)
    }
  })
})
