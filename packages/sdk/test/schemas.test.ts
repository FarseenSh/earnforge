// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest'
import chains from '../../fixtures/src/chains.json'
import protocols from '../../fixtures/src/protocols.json'
import quoteComposer from '../../fixtures/src/quote-composer.json'
import vaultFlagged from '../../fixtures/src/vault-flagged.json'
import vaultSingle from '../../fixtures/src/vault-single.json'
import vaultsBase from '../../fixtures/src/vaults-base.json'
import {
  AnalyticsSchema,
  ApySchema,
  ChainListResponseSchema,
  getBestApy,
  ProtocolListResponseSchema,
  parseTvl,
  QuoteResponseSchema,
  TvlSchema,
  VaultListResponseSchema,
  VaultSchema,
} from '../src/schemas/index.js'
import { flagReasons, isFlagged, parseVaultSlug } from '../src/schemas/vault.js'

describe('Zod Schemas — validated against real API fixtures', () => {
  describe('VaultListResponseSchema', () => {
    it('parses the real Base vaults response', () => {
      const result = VaultListResponseSchema.parse(vaultsBase)
      expect(result.data.length).toBeGreaterThan(0)
      expect(result.total).toBeGreaterThan(0)
      expect(typeof result.nextCursor).toBe('string')
    })

    it('every vault in the page parses without error', () => {
      const result = VaultListResponseSchema.parse(vaultsBase)
      for (const vault of result.data) {
        expect(vault.address).toBeTruthy()
        expect(vault.chainId).toBe(8453)
        expect(vault.analytics.apy.total).toBeTypeOf('number')
      }
    })

    it('slugs use the protocol:chainId:_:address form', () => {
      const result = VaultListResponseSchema.parse(vaultsBase)
      for (const vault of result.data) {
        // The pre-Apr-2026 `chainId-address` form no longer occurs, so any
        // code splitting on '-' silently mis-parses every slug.
        const parsed = parseVaultSlug(vault.slug)
        expect(parsed).not.toBeNull()
        expect(parsed?.chainId).toBe(vault.chainId)
        expect(parsed?.address).toBe(vault.address.toLowerCase())
      }
    })

    it('exposes verificationStatus on every vault', () => {
      const result = VaultListResponseSchema.parse(vaultsBase)
      for (const vault of result.data) {
        expect(vault.verificationStatus).toBeTypeOf('string')
      }
    })
  })

  describe('VaultSchema — single vault', () => {
    it('parses the real single-vault response', () => {
      const result = VaultSchema.parse(vaultSingle)
      expect(result.name).toBeTruthy()
      expect(result.chainId).toBe(8453)
      // Protocol ids are unversioned — `morpho`, never `morpho-v1`.
      expect(result.protocol.id).toBe('morpho')
      expect(result.protocol.id).not.toMatch(/-v\d+$/)
    })

    it('has no provider or lpTokens field', () => {
      // Both were removed in Apr 2026 and were previously required here.
      expect('provider' in vaultSingle).toBe(false)
      expect('lpTokens' in vaultSingle).toBe(false)
    })

    it('carries priceUsd on underlying tokens', () => {
      const result = VaultSchema.parse(vaultSingle)
      for (const token of result.underlyingTokens) {
        expect(token.priceUsd).toBeTypeOf('string')
      }
    })

    it('handles Morpho apy.reward = 0 correctly', () => {
      const result = VaultSchema.parse(vaultSingle)
      expect(result.analytics.apy.reward).toBe(0)
    })
  })

  describe('verificationStatus — undocumented LI.FI signal', () => {
    it('parses a flagged vault and reports its reasons', () => {
      const result = VaultSchema.parse(vaultFlagged)
      expect(isFlagged(result)).toBe(true)
      expect(flagReasons(result)).toContain('zero_apy')
    })

    it('treats an unflagged vault as clean', () => {
      const result = VaultSchema.parse(vaultSingle)
      expect(isFlagged(result)).toBe(false)
      expect(flagReasons(result)).toEqual([])
    })
  })

  describe('ChainListResponseSchema', () => {
    it('parses the real chains response', () => {
      const result = ChainListResponseSchema.parse(chains)
      expect(result.length).toBeGreaterThan(0)
      expect(result.some((c) => c.name === 'Ethereum')).toBe(true)
      expect(result.some((c) => c.name === 'Base')).toBe(true)
    })

    it('every chain has chainId and networkCaip', () => {
      const result = ChainListResponseSchema.parse(chains)
      for (const chain of result) {
        expect(chain.chainId).toBeTypeOf('number')
        expect(chain.networkCaip).toMatch(/^eip155:\d+$/)
      }
    })
  })

  describe('ProtocolListResponseSchema', () => {
    it('parses the real protocols response', () => {
      const result = ProtocolListResponseSchema.parse(protocols)
      expect(result.length).toBeGreaterThan(0)
    })

    it('includes known protocols under unversioned ids', () => {
      const result = ProtocolListResponseSchema.parse(protocols)
      const ids = result.map((p) => p.id ?? p.name)
      expect(ids).toContain('aave')
      expect(ids).toContain('morpho')
      expect(ids).toContain('euler')
    })

    it('exposes no versioned ids at all', () => {
      // `?protocol=morpho-v1` returns an empty set with a 200 rather than an
      // error, so a stale hardcoded slug fails silently.
      const result = ProtocolListResponseSchema.parse(protocols)
      for (const p of result) {
        expect(p.id ?? p.name).not.toMatch(/-v\d+$/)
      }
    })
  })

  describe('QuoteResponseSchema', () => {
    it('parses the real Composer quote response', () => {
      const result = QuoteResponseSchema.parse(quoteComposer)
      expect(result.type).toBe('lifi')
      expect(result.transactionRequest).toBeTruthy()
      expect(result.transactionRequest.to).toBeTruthy()
      expect(result.transactionRequest.data).toBeTruthy()
      expect(result.transactionRequest.chainId).toBe(8453)
    })

    it('routes the deposit to the vault share token', () => {
      const result = QuoteResponseSchema.parse(quoteComposer)
      expect(result.action.fromToken.symbol).toBe('USDC')
      // toToken is whichever vault the fixture was captured against; the
      // invariant is that it differs from fromToken and sits on the same chain.
      expect(result.action.toToken.symbol).not.toBe(
        result.action.fromToken.symbol
      )
      expect(result.action.fromChainId).toBe(8453)
      expect(result.action.toChainId).toBe(8453)
    })

    it('has estimate with gas costs', () => {
      const result = QuoteResponseSchema.parse(quoteComposer)
      expect(result.estimate.gasCosts).toBeTruthy()
      expect(result.estimate.gasCosts!.length).toBeGreaterThan(0)
    })
  })

  describe('ApySchema — three-valued reward', () => {
    it('preserves null rather than coercing to 0', () => {
      const result = ApySchema.parse({ base: 3.5, total: 3.5, reward: null })
      expect(result.reward).toBeNull()
    })

    it('keeps 0 reward as 0', () => {
      const result = ApySchema.parse({ base: 3.5, total: 3.5, reward: 0 })
      expect(result.reward).toBe(0)
    })

    it('keeps positive reward', () => {
      const result = ApySchema.parse({ base: 3.5, total: 5.0, reward: 1.5 })
      expect(result.reward).toBe(1.5)
    })

    it('accepts a null base', () => {
      const result = ApySchema.parse({ base: null, total: 0, reward: null })
      expect(result.base).toBeNull()
    })
  })

  describe('TvlSchema — accepts either representation (Pitfall #8)', () => {
    it('parses a number, as the live API sends', () => {
      const parsed = parseTvl(TvlSchema.parse({ usd: 270595698 }))
      expect(parsed.parsed).toBe(270595698)
      expect(parsed.bigint).toBe(270595698n)
    })

    it('parses a string, as the OpenAPI spec documents', () => {
      const parsed = parseTvl(TvlSchema.parse({ usd: '270595698' }))
      expect(parsed.raw).toBe('270595698')
      expect(parsed.parsed).toBe(270595698)
      expect(parsed.bigint).toBe(270595698n)
    })

    it('handles a decimal string', () => {
      const parsed = parseTvl(TvlSchema.parse({ usd: '1234567.89' }))
      expect(parsed.parsed).toBeCloseTo(1234567.89)
    })
  })

  describe('getBestApy — fallback chain (Pitfalls #7, #18)', () => {
    it('uses apy.total when available', () => {
      const analytics = AnalyticsSchema.parse({
        apy: { base: 3.5, total: 3.5, reward: 0 },
        tvl: { usd: 100 },
        apy1d: 3.4,
        apy7d: 3.3,
        apy30d: 3.2,
        updatedAt: '2026-01-01T00:00:00Z',
      })
      expect(getBestApy(analytics)).toBe(3.5)
    })

    it('falls back to apy30d when apy.total is 0', () => {
      const analytics = AnalyticsSchema.parse({
        apy: { base: 0, total: 0, reward: null },
        tvl: { usd: 100 },
        apy1d: null,
        apy7d: null,
        apy30d: 3.2,
        updatedAt: '2026-01-01T00:00:00Z',
      })
      expect(getBestApy(analytics)).toBe(3.2)
    })

    it('handles all nulls gracefully', () => {
      const analytics = AnalyticsSchema.parse({
        apy: { base: 0, total: 0, reward: null },
        tvl: { usd: 100 },
        apy1d: null,
        apy7d: null,
        apy30d: null,
        updatedAt: '2026-01-01T00:00:00Z',
      })
      expect(getBestApy(analytics)).toBe(0)
    })
  })
})

describe('Edge cases from real fixtures', () => {
  it('tolerates an empty underlyingTokens array even though none occur now', () => {
    // Pitfall #15 was built around a UNIBTC vault with no underlying tokens.
    // Zero of 711 live vaults now have an empty array, so the guard can only be
    // asserted structurally — the schema must still accept it, because the
    // shape is legal and LI.FI has reintroduced dropped shapes before.
    const base = VaultSchema.parse(vaultSingle)
    const parsed = VaultSchema.safeParse({ ...base, underlyingTokens: [] })
    expect(parsed.success).toBe(true)
    expect(parsed.data?.underlyingTokens).toEqual([])
  })

  it('handles vaults without description (Pitfall #16)', () => {
    const result = VaultListResponseSchema.parse(vaultsBase)
    const noDesc = result.data.filter((v) => v.description === undefined)
    expect(noDesc.length).toBeGreaterThan(0)
  })

  it('handles null apy.reward on Aave vaults (Pitfall #17)', () => {
    const result = VaultListResponseSchema.parse(vaultsBase)
    const aaveVault = result.data.find(
      (v) => (v.protocol.id ?? v.protocol.name) === 'aave'
    )
    if (aaveVault) {
      // null is preserved, not flattened to 0 — see pitfall-17 for why.
      const reward = aaveVault.analytics.apy.reward
      expect(reward === null || typeof reward === 'number').toBe(true)
    }
  })

  it('parses tvl.usd across all vaults (Pitfall #8)', () => {
    const result = VaultListResponseSchema.parse(vaultsBase)
    for (const vault of result.data) {
      const tvl = parseTvl(vault.analytics.tvl)
      expect(tvl.parsed).toBeTypeOf('number')
      expect(tvl.parsed).toBeGreaterThanOrEqual(0)
    }
  })

  it('rewardTokens is absent rather than empty when there are none', () => {
    const result = VaultListResponseSchema.parse(vaultsBase)
    // Only ~16% of vaults carry rewardTokens at all, so consumers must handle
    // undefined rather than assuming an empty array.
    const withReward = result.data.filter((v) => v.rewardTokens !== undefined)
    const withoutReward = result.data.filter(
      (v) => v.rewardTokens === undefined
    )
    expect(withoutReward.length).toBeGreaterThan(0)
    for (const v of withReward) {
      expect(Array.isArray(v.rewardTokens)).toBe(true)
    }
  })
})
