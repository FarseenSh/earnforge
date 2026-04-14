// SPDX-License-Identifier: Apache-2.0

import type {
  Vault,
  Chain,
  ProtocolDetail,
  PortfolioResponse,
  RiskScore,
} from '@earnforge/sdk'

export function makeVault(overrides: Partial<Vault> = {}): Vault {
  return {
    address: '0xbeef0001',
    chainId: 8453,
    name: 'Test USDC Vault',
    slug: '8453-0xbeef0001',
    network: 'base',
    protocol: { name: 'aave-v3', url: 'https://aave.com' },
    provider: 'aave',
    syncedAt: '2026-04-11T00:00:00Z',
    tags: ['stablecoin'],
    underlyingTokens: [{ symbol: 'USDC', address: '0xusdc', decimals: 6 }],
    lpTokens: [],
    analytics: {
      apy: { base: 0.04, total: 0.05, reward: 0.01 },
      tvl: { usd: '50000000' },
      apy1d: 0.048,
      apy7d: 0.049,
      apy30d: 0.051,
      updatedAt: '2026-04-11T12:00:00Z',
    },
    isTransactional: true,
    isRedeemable: true,
    depositPacks: [{ name: 'default', stepsType: 'single' }],
    redeemPacks: [{ name: 'default', stepsType: 'single' }],
    ...overrides,
  }
}

export function makeVault2(overrides: Partial<Vault> = {}): Vault {
  return makeVault({
    address: '0xbeef0002',
    name: 'Test WETH Vault',
    slug: '42161-0xbeef0002',
    chainId: 42161,
    network: 'arbitrum',
    protocol: { name: 'euler-v2', url: 'https://euler.finance' },
    provider: 'euler',
    tags: ['lst'],
    underlyingTokens: [{ symbol: 'WETH', address: '0xweth', decimals: 18 }],
    analytics: {
      apy: { base: 0.03, total: 0.08, reward: 0.05 },
      tvl: { usd: '120000000' },
      apy1d: null,
      apy7d: 0.075,
      apy30d: 0.082,
      updatedAt: '2026-04-11T12:00:00Z',
    },
    ...overrides,
  })
}

export function makeNonTransactionalVault(): Vault {
  return makeVault({
    address: '0xdead0001',
    name: 'Non-Transactional Vault',
    slug: '1-0xdead0001',
    chainId: 1,
    isTransactional: false,
    isRedeemable: false,
    underlyingTokens: [],
    tags: [],
  })
}

export function makeHighRiskVault(): Vault {
  return makeVault({
    address: '0xrisk0001',
    name: 'Risky Yield Vault',
    slug: '137-0xrisk0001',
    chainId: 137,
    network: 'polygon',
    protocol: { name: 'yo-protocol', url: 'https://yo.xyz' },
    provider: 'yo',
    tags: [],
    underlyingTokens: [{ symbol: 'USDT', address: '0xusdt', decimals: 6 }],
    analytics: {
      apy: { base: 0.8, total: 0.9, reward: 0.1 },
      tvl: { usd: '50000' },
      apy1d: 0.5,
      apy7d: null,
      apy30d: null,
      updatedAt: '2026-04-11T12:00:00Z',
    },
    isTransactional: true,
    isRedeemable: false,
  })
}

export const MOCK_CHAINS: Chain[] = [
  { chainId: 1, name: 'Ethereum', networkCaip: 'eip155:1' },
  { chainId: 8453, name: 'Base', networkCaip: 'eip155:8453' },
  { chainId: 42161, name: 'Arbitrum', networkCaip: 'eip155:42161' },
]

export const MOCK_PROTOCOLS: ProtocolDetail[] = [
  { name: 'aave-v3', url: 'https://aave.com' },
  { name: 'euler-v2', url: 'https://euler.finance' },
  { name: 'morpho-v1', url: 'https://morpho.xyz' },
]

export const MOCK_PORTFOLIO: PortfolioResponse = {
  positions: [
    {
      chainId: 8453,
      protocolName: 'aave-v3',
      asset: {
        address: '0xusdc',
        name: 'USD Coin',
        symbol: 'USDC',
        decimals: 6,
      },
      balanceUsd: '10000',
      balanceNative: '10000',
    },
    {
      chainId: 42161,
      protocolName: 'euler-v2',
      asset: {
        address: '0xweth',
        name: 'Wrapped Ether',
        symbol: 'WETH',
        decimals: 18,
      },
      balanceUsd: '5000',
      balanceNative: '2.5',
    },
  ],
}

export const MOCK_RISK_SCORE: RiskScore = {
  score: 7.8,
  breakdown: {
    tvl: 9,
    apyStability: 8,
    protocol: 9,
    redeemability: 10,
    assetType: 9,
  },
  label: 'low',
}

export const MOCK_SUGGEST_RESULT = {
  totalAmount: 10000,
  expectedApy: 0.06,
  allocations: [
    {
      vault: makeVault(),
      risk: MOCK_RISK_SCORE,
      percentage: 60,
      amount: 6000,
      apy: 0.05,
    },
    {
      vault: makeVault2(),
      risk: { ...MOCK_RISK_SCORE, score: 6.5, label: 'medium' as const },
      percentage: 40,
      amount: 4000,
      apy: 0.08,
    },
  ],
}

export const MOCK_QUOTE_RESULT = {
  quote: {
    type: 'lifi',
    id: 'quote-123',
    tool: 'aave',
    action: {
      fromToken: {
        address: '0xusdc',
        chainId: 8453,
        symbol: 'USDC',
        decimals: 6,
        name: 'USD Coin',
      },
      fromAmount: '10000000',
      toToken: {
        address: '0xbeef0001',
        chainId: 8453,
        symbol: 'aUSDC',
        decimals: 6,
        name: 'Aave USDC',
      },
      fromChainId: 8453,
      toChainId: 8453,
      slippage: 0.005,
      fromAddress: '0xwallet',
      toAddress: '0xwallet',
    },
    estimate: {
      tool: 'aave',
      toAmountMin: '9900000',
      toAmount: '10000000',
      fromAmount: '10000000',
      gasCosts: [
        {
          type: 'SEND',
          amount: '50000',
          amountUSD: '0.12',
          token: {
            address: '0x0',
            chainId: 8453,
            symbol: 'ETH',
            decimals: 18,
            name: 'Ether',
          },
        },
      ],
      feeCosts: [],
      executionDuration: 15,
    },
    transactionRequest: {
      to: '0xcontract',
      data: '0xdata',
      value: '0',
      chainId: 8453,
    },
  },
  vault: makeVault(),
  humanAmount: '10',
  rawAmount: '10000000',
  decimals: 6,
}

export const MOCK_GAS_ROUTES = [
  {
    fromChain: 8453,
    fromChainName: 'Base',
    quote: MOCK_QUOTE_RESULT.quote,
    totalCostUsd: 0.12,
    gasCostUsd: 0.1,
    feeCostUsd: 0.02,
    executionDuration: 15,
  },
  {
    fromChain: 42161,
    fromChainName: 'Arbitrum',
    quote: MOCK_QUOTE_RESULT.quote,
    totalCostUsd: 0.35,
    gasCostUsd: 0.25,
    feeCostUsd: 0.1,
    executionDuration: 45,
  },
]
