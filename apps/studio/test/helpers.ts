// SPDX-License-Identifier: Apache-2.0
import type { RiskScore, Vault } from '@earnforge/sdk'

/**
 * Creates a mock Vault object for testing.
 *
 * Shape matches the live API as of Jul 2026: no `provider` or `lpTokens`,
 * `tvl.usd` is a number, protocol ids are unversioned, and every vault carries
 * a `verificationStatus`.
 */
export function mockVault(overrides: Partial<Vault> = {}): Vault {
  return {
    address: '0xabc123',
    chainId: 8453,
    name: 'Test Vault USDC',
    slug: 'morpho:8453:_:0xabc123',
    network: 'Base',
    protocol: { id: 'aave', name: 'aave', url: 'https://aave.com' },
    syncedAt: '2026-07-25T00:00:00Z',
    tags: ['stablecoin', 'single'],
    underlyingTokens: [
      { symbol: 'USDC', address: '0xusdc', decimals: 6, priceUsd: '1.0' },
    ],
    analytics: {
      apy: { base: 3.5, total: 4.5, reward: 1.0 },
      tvl: { usd: 50_000_000 },
      apy1d: 4.0,
      apy7d: 4.2,
      apy30d: 4.3,
      updatedAt: '2026-07-25T00:00:00Z',
    },
    isTransactional: true,
    isRedeemable: true,
    depositPacks: [{ name: 'aave', stepsType: 'instant' }],
    redeemPacks: [{ name: 'aave', stepsType: 'instant' }],
    verificationStatus: 'none',
    verificationStatusBreakdown: [{ reason: 'none', result: 'none' }],
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
    slug: 'yo:8453:_:0xhighrisk',
    tags: ['il-risk', 'multi'],
    protocol: {
      id: 'unknown-protocol',
      name: 'unknown-protocol',
      url: 'https://example.com',
    },
    analytics: {
      apy: { base: 50, total: 80, reward: 30 },
      tvl: { usd: 50_000 },
      apy1d: 20,
      apy7d: null,
      apy30d: null,
      updatedAt: '2026-07-25T00:00:00Z',
    },
    isRedeemable: false,
  })
}

/**
 * Creates a vault that LI.FI's verification pass flagged. No flagged vault can
 * be labelled low risk, so this is the fixture for asserting that behaviour.
 */
export function mockFlaggedVault(): Vault {
  return mockVault({
    address: '0xflagged',
    name: 'Flagged Vault',
    slug: 'aave:1:_:0xflagged',
    verificationStatus: 'flagged',
    verificationStatusBreakdown: [{ reason: 'zero_apy', result: 'flagged' }],
    analytics: {
      apy: { base: 0, total: 0, reward: null },
      tvl: { usd: 222_832_854 },
      apy1d: 0,
      apy7d: 0,
      apy30d: 0,
      updatedAt: '2026-07-25T00:00:00Z',
    },
  })
}

/**
 * Creates a mock RiskScore for testing.
 */
export function mockRiskScore(overrides: Partial<RiskScore> = {}): RiskScore {
  return {
    score: 8.5,
    label: 'low',
    breakdown: {
      tvl: 9,
      apyStability: 8,
      protocol: 9,
      redeemability: 10,
      assetType: 9,
      verification: 10,
      rewardDependency: 9,
    },
    flags: [],
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
      verification: 2,
      rewardDependency: 2,
    },
    flags: [
      'flagged by LI.FI verification: apy_outlier',
      'withdrawals unavailable via Composer',
    ],
  }
}

export function mockMediumRiskScore(): RiskScore {
  return {
    score: 6.5,
    label: 'medium',
    breakdown: {
      tvl: 5,
      apyStability: 6,
      protocol: 5,
      redeemability: 10,
      assetType: 5,
      verification: 10,
      rewardDependency: 7,
    },
    flags: ['TVL under $100k'],
  }
}
