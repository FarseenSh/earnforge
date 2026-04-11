// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect } from 'vitest';
import { AnalyticsSchema, getBestApy } from '../../src/schemas/vault.js';

describe('Pitfall #18: apy1d null when apy7d exists', () => {
  it('handles null apy1d with valid apy7d', () => {
    const analytics = AnalyticsSchema.parse({
      apy: { base: 5.0, total: 5.0, reward: null },
      tvl: { usd: '1000000' },
      apy1d: null,
      apy7d: 4.8,
      apy30d: 4.5,
      updatedAt: '2026-01-01T00:00:00Z',
    });
    expect(analytics.apy1d).toBeNull();
    expect(analytics.apy7d).toBe(4.8);
    // Fallback chain works correctly
    expect(getBestApy(analytics)).toBe(5.0);
  });

  it('fallback chain: apy.total → apy30d → apy7d → apy1d', () => {
    // When total is 0, should fall through
    const analytics = AnalyticsSchema.parse({
      apy: { base: 0, total: 0, reward: null },
      tvl: { usd: '100' },
      apy1d: null,
      apy7d: 4.8,
      apy30d: null,
      updatedAt: '2026-01-01T00:00:00Z',
    });
    expect(getBestApy(analytics)).toBe(4.8);
  });

  it('uses apy1d as last resort', () => {
    const analytics = AnalyticsSchema.parse({
      apy: { base: 0, total: 0, reward: null },
      tvl: { usd: '100' },
      apy1d: 3.2,
      apy7d: null,
      apy30d: null,
      updatedAt: '2026-01-01T00:00:00Z',
    });
    expect(getBestApy(analytics)).toBe(3.2);
  });
});
