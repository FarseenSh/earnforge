// SPDX-License-Identifier: Apache-2.0
import type { Vault, RiskScore } from '@earnforge/sdk'

/**
 * Creates a mock Vault object for testing.
 */
export function mockVault(overrides: Partial<Vault> = {}): Vault {
  return {
    address: '0xabc123',
    chainId: 8453,
    name: 'Test Vault USDC',
    slug: 'test-vault-usdc',
    network: 'base',
    protocol: { name: 'aave-v3', url: 'https://aave.com' },
    provider: 'aave',
    syncedAt: '2026-04-11T00:00:00Z',
    tags: ['stablecoin'],
    underlyingTokens: [{ symbol: 'USDC', address: '0xusdc', decimals: 6 }],
    lpTokens: [],
    analytics: {
      apy: { base: 3.5, total: 4.5, reward: 1.0 },
      tvl: { usd: '50000000' },
      apy1d: 4.0,
      apy7d: 4.2,
      apy30d: 4.3,
      updatedAt: '2026-04-11T00:00:00Z',
    },
    isTransactional: true,
    isRedeemable: true,
    depositPacks: [{ name: 'default', stepsType: 'deposit' }],
    redeemPacks: [{ name: 'default', stepsType: 'redeem' }],
    ...overrides,
  }
}

/**
 * Creates a high-risk mock vault for testing.
 */
export function mockHighRiskVault(): Vault {
  return mockVault({
    address: '0xhighrisk',
    name: 'High Risk Degen Vault',
    slug: 'high-risk-degen',
    tags: [],
    protocol: { name: 'unknown-protocol', url: 'https://example.com' },
    analytics: {
      apy: { base: 50, total: 80, reward: 30 },
      tvl: { usd: '50000' },
      apy1d: 20,
      apy7d: null,
      apy30d: null,
      updatedAt: '2026-04-11T00:00:00Z',
    },
    isRedeemable: false,
  })
}

/**
 * Creates a mock RiskScore for testing.
 */
export function mockRiskScore(overrides: Partial<RiskScore> = {}): RiskScore {
  return {
    score: 7.5,
    label: 'low',
    breakdown: {
      tvl: 9,
      apyStability: 8,
      protocol: 9,
      redeemability: 10,
      assetType: 9,
    },
    ...overrides,
  }
}

export function mockHighRiskScore(): RiskScore {
  return {
    score: 2.5,
    label: 'high',
    breakdown: {
      tvl: 1,
      apyStability: 2,
      protocol: 3,
      redeemability: 3,
      assetType: 5,
    },
  }
}

export function mockMediumRiskScore(): RiskScore {
  return {
    score: 5.5,
    label: 'medium',
    breakdown: {
      tvl: 5,
      apyStability: 6,
      protocol: 5,
      redeemability: 10,
      assetType: 5,
    },
  }
}
