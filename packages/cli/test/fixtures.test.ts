// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from 'vitest'
import {
  makeVault,
  makeVault2,
  makeNonTransactionalVault,
  makeHighRiskVault,
  MOCK_CHAINS,
  MOCK_PROTOCOLS,
  MOCK_PORTFOLIO,
  MOCK_RISK_SCORE,
} from './fixtures.js'

describe('test fixtures', () => {
  it('makeVault returns a valid Vault-like object', () => {
    const v = makeVault()
    expect(v.slug).toBe('8453-0xbeef0001')
    expect(v.chainId).toBe(8453)
    expect(v.isTransactional).toBe(true)
    expect(v.isRedeemable).toBe(true)
    expect(v.underlyingTokens).toHaveLength(1)
    expect(v.underlyingTokens[0]!.symbol).toBe('USDC')
  })

  it('makeVault2 is on Arbitrum with WETH', () => {
    const v = makeVault2()
    expect(v.chainId).toBe(42161)
    expect(v.underlyingTokens[0]!.symbol).toBe('WETH')
    expect(v.protocol.name).toBe('euler-v2')
  })

  it('makeNonTransactionalVault is not transactional', () => {
    const v = makeNonTransactionalVault()
    expect(v.isTransactional).toBe(false)
    expect(v.isRedeemable).toBe(false)
    expect(v.underlyingTokens).toHaveLength(0)
  })

  it('makeHighRiskVault has low TVL and small-cap protocol', () => {
    const v = makeHighRiskVault()
    expect(Number(v.analytics.tvl.usd)).toBeLessThan(100000)
    expect(v.protocol.name).toBe('yo-protocol')
    expect(v.analytics.apy.total).toBeGreaterThan(0.5)
  })

  it('MOCK_CHAINS has 3 entries', () => {
    expect(MOCK_CHAINS).toHaveLength(3)
    expect(MOCK_CHAINS[0]!.chainId).toBe(1)
  })

  it('MOCK_PROTOCOLS has 3 entries', () => {
    expect(MOCK_PROTOCOLS).toHaveLength(3)
    expect(MOCK_PROTOCOLS[0]!.name).toBe('aave-v3')
  })

  it('MOCK_PORTFOLIO has 2 positions', () => {
    expect(MOCK_PORTFOLIO.positions).toHaveLength(2)
    expect(MOCK_PORTFOLIO.positions[0]!.asset.symbol).toBe('USDC')
  })

  it('MOCK_RISK_SCORE has correct structure', () => {
    expect(MOCK_RISK_SCORE.score).toBe(7.8)
    expect(MOCK_RISK_SCORE.label).toBe('low')
    expect(MOCK_RISK_SCORE.breakdown).toHaveProperty('tvl')
    expect(MOCK_RISK_SCORE.breakdown).toHaveProperty('apyStability')
    expect(MOCK_RISK_SCORE.breakdown).toHaveProperty('protocol')
    expect(MOCK_RISK_SCORE.breakdown).toHaveProperty('redeemability')
    expect(MOCK_RISK_SCORE.breakdown).toHaveProperty('assetType')
  })

  it('makeVault allows overrides', () => {
    const v = makeVault({ name: 'Custom Vault', chainId: 1 })
    expect(v.name).toBe('Custom Vault')
    expect(v.chainId).toBe(1)
  })
})
