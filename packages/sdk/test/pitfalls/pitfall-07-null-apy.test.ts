// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect } from 'vitest'
import { AnalyticsSchema, getBestApy } from '../../src/schemas/vault.js'

describe('Pitfall #7: Null APY values', () => {
  it('handles null apy7d without crashing', () => {
    const analytics = AnalyticsSchema.parse({
      apy: { base: 3.5, total: 3.5, reward: 0 },
      tvl: { usd: '100' },
      apy1d: 3.4,
      apy7d: null,
      apy30d: 3.2,
      updatedAt: '2026-01-01T00:00:00Z',
    })
    expect(analytics.apy7d).toBeNull()
    expect(getBestApy(analytics)).toBe(3.5)
  })

  it('handles null apy30d without crashing', () => {
    const analytics = AnalyticsSchema.parse({
      apy: { base: 3.5, total: 3.5, reward: 0 },
      tvl: { usd: '100' },
      apy1d: 3.4,
      apy7d: 3.3,
      apy30d: null,
      updatedAt: '2026-01-01T00:00:00Z',
    })
    expect(analytics.apy30d).toBeNull()
  })

  it('handles all null apy history', () => {
    const analytics = AnalyticsSchema.parse({
      apy: { base: 0, total: 0, reward: null },
      tvl: { usd: '100' },
      apy1d: null,
      apy7d: null,
      apy30d: null,
      updatedAt: '2026-01-01T00:00:00Z',
    })
    expect(getBestApy(analytics)).toBe(0)
  })
})
