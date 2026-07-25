// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest'
import {
  mockHighRiskScore,
  mockHighRiskVault,
  mockMediumRiskScore,
  mockRiskScore,
  mockVault,
} from './helpers'

describe('test helpers', () => {
  it('mockVault creates a valid vault object', () => {
    const vault = mockVault()
    expect(vault.address).toBe('0xabc123')
    expect(vault.chainId).toBe(8453)
    expect(vault.name).toBe('Test Vault USDC')
    expect(vault.tags).toContain('stablecoin')
    expect(vault.analytics.apy.total).toBe(4.5)
    // tvl.usd is a number as of the Apr 2026 API rewrite
    expect(vault.analytics.tvl.usd).toBe(50_000_000)
  })

  it('mockVault accepts overrides', () => {
    const vault = mockVault({ name: 'Custom Vault', chainId: 1 })
    expect(vault.name).toBe('Custom Vault')
    expect(vault.chainId).toBe(1)
  })

  it('mockHighRiskVault creates a risky vault', () => {
    const vault = mockHighRiskVault()
    expect(vault.tags).not.toContain('stablecoin')
    expect(vault.isRedeemable).toBe(false)
    expect(Number(vault.analytics.tvl.usd)).toBeLessThan(100_000)
  })

  it('mockRiskScore returns a low risk score by default', () => {
    const risk = mockRiskScore()
    expect(risk.score).toBe(8.5)
    expect(risk.label).toBe('low')
  })

  it('mockMediumRiskScore returns a medium risk score', () => {
    const risk = mockMediumRiskScore()
    expect(risk.score).toBe(6.5)
    expect(risk.label).toBe('medium')
  })

  it('mockHighRiskScore returns a high risk score', () => {
    const risk = mockHighRiskScore()
    expect(risk.score).toBe(2.5)
    expect(risk.label).toBe('high')
  })
})
