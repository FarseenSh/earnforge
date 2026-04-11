// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect } from 'vitest';
import {
  VaultSchema,
  VaultListResponseSchema,
  ChainListResponseSchema,
  ProtocolListResponseSchema,
  QuoteResponseSchema,
  ApySchema,
  TvlSchema,
  parseTvl,
  getBestApy,
  AnalyticsSchema,
} from '../src/schemas/index.js';

import vaultsBase from '../../fixtures/src/vaults-base.json';
import vaultSingle from '../../fixtures/src/vault-single.json';
import chains from '../../fixtures/src/chains.json';
import protocols from '../../fixtures/src/protocols.json';
import quoteComposer from '../../fixtures/src/quote-composer.json';

describe('Zod Schemas — validated against real API fixtures', () => {
  describe('VaultListResponseSchema', () => {
    it('parses the real Base vaults response', () => {
      const result = VaultListResponseSchema.parse(vaultsBase);
      expect(result.data.length).toBeGreaterThan(0);
      expect(result.total).toBeGreaterThan(0);
      expect(typeof result.nextCursor).toBe('string');
    });

    it('every vault in the page parses without error', () => {
      const result = VaultListResponseSchema.parse(vaultsBase);
      for (const vault of result.data) {
        expect(vault.address).toBeTruthy();
        expect(vault.chainId).toBe(8453);
        expect(vault.slug).toContain('8453-');
        expect(vault.analytics.apy.total).toBeTypeOf('number');
      }
    });
  });

  describe('VaultSchema — single vault', () => {
    it('parses the real single-vault response', () => {
      const result = VaultSchema.parse(vaultSingle);
      expect(result.name).toBe('STEAKUSDC');
      expect(result.chainId).toBe(8453);
      expect(result.protocol.name).toBe('morpho-v1');
    });

    it('handles Morpho apy.reward = 0 correctly', () => {
      const result = VaultSchema.parse(vaultSingle);
      expect(result.analytics.apy.reward).toBe(0);
    });
  });

  describe('ChainListResponseSchema', () => {
    it('parses the real chains response', () => {
      const result = ChainListResponseSchema.parse(chains);
      expect(result.length).toBe(16);
      expect(result.some((c) => c.name === 'Ethereum')).toBe(true);
      expect(result.some((c) => c.name === 'Base')).toBe(true);
    });

    it('every chain has chainId and networkCaip', () => {
      const result = ChainListResponseSchema.parse(chains);
      for (const chain of result) {
        expect(chain.chainId).toBeTypeOf('number');
        expect(chain.networkCaip).toMatch(/^eip155:\d+$/);
      }
    });
  });

  describe('ProtocolListResponseSchema', () => {
    it('parses the real protocols response', () => {
      const result = ProtocolListResponseSchema.parse(protocols);
      expect(result.length).toBe(11);
    });

    it('includes known protocols', () => {
      const result = ProtocolListResponseSchema.parse(protocols);
      const names = result.map((p) => p.name);
      expect(names).toContain('aave-v3');
      expect(names).toContain('morpho-v1');
      expect(names).toContain('euler-v2');
    });
  });

  describe('QuoteResponseSchema', () => {
    it('parses the real Composer quote response', () => {
      const result = QuoteResponseSchema.parse(quoteComposer);
      expect(result.type).toBe('lifi');
      expect(result.transactionRequest).toBeTruthy();
      expect(result.transactionRequest.to).toBeTruthy();
      expect(result.transactionRequest.data).toBeTruthy();
      expect(result.transactionRequest.chainId).toBe(8453);
    });

    it('has action with correct fromToken and toToken', () => {
      const result = QuoteResponseSchema.parse(quoteComposer);
      expect(result.action.fromToken.symbol).toBe('USDC');
      expect(result.action.toToken.symbol).toBe('steakUSDC');
      expect(result.action.fromChainId).toBe(8453);
      expect(result.action.toChainId).toBe(8453);
    });

    it('has estimate with gas costs', () => {
      const result = QuoteResponseSchema.parse(quoteComposer);
      expect(result.estimate.gasCosts).toBeTruthy();
      expect(result.estimate.gasCosts!.length).toBeGreaterThan(0);
    });
  });

  describe('ApySchema — null normalization', () => {
    it('normalizes null reward to 0 (Pitfall #17)', () => {
      const result = ApySchema.parse({ base: 3.5, total: 3.5, reward: null });
      expect(result.reward).toBe(0);
    });

    it('keeps 0 reward as 0', () => {
      const result = ApySchema.parse({ base: 3.5, total: 3.5, reward: 0 });
      expect(result.reward).toBe(0);
    });

    it('keeps positive reward', () => {
      const result = ApySchema.parse({ base: 3.5, total: 5.0, reward: 1.5 });
      expect(result.reward).toBe(1.5);
    });
  });

  describe('TvlSchema — string parsing (Pitfall #8)', () => {
    it('parses string TVL to number and bigint', () => {
      const result = TvlSchema.parse({ usd: '270595698' });
      const parsed = parseTvl(result);
      expect(parsed.raw).toBe('270595698');
      expect(parsed.parsed).toBe(270595698);
      expect(parsed.bigint).toBe(270595698n);
    });

    it('handles decimal string TVL', () => {
      const result = TvlSchema.parse({ usd: '1234567.89' });
      const parsed = parseTvl(result);
      expect(parsed.parsed).toBeCloseTo(1234567.89);
    });
  });

  describe('getBestApy — fallback chain (Pitfalls #7, #18)', () => {
    it('uses apy.total when available', () => {
      const analytics = AnalyticsSchema.parse({
        apy: { base: 3.5, total: 3.5, reward: 0 },
        tvl: { usd: '100' },
        apy1d: 3.4,
        apy7d: 3.3,
        apy30d: 3.2,
        updatedAt: '2026-01-01T00:00:00Z',
      });
      expect(getBestApy(analytics)).toBe(3.5);
    });

    it('falls back to apy30d when apy.total is 0', () => {
      const analytics = AnalyticsSchema.parse({
        apy: { base: 0, total: 0, reward: null },
        tvl: { usd: '100' },
        apy1d: null,
        apy7d: null,
        apy30d: 3.2,
        updatedAt: '2026-01-01T00:00:00Z',
      });
      // apy.total is 0 which is falsy, falls through
      expect(getBestApy(analytics)).toBe(3.2);
    });

    it('handles all nulls gracefully', () => {
      const analytics = AnalyticsSchema.parse({
        apy: { base: 0, total: 0, reward: null },
        tvl: { usd: '100' },
        apy1d: null,
        apy7d: null,
        apy30d: null,
        updatedAt: '2026-01-01T00:00:00Z',
      });
      expect(getBestApy(analytics)).toBe(0);
    });
  });
});

describe('Edge cases from real fixtures', () => {
  it('handles vaults with empty underlyingTokens (Pitfall #15)', () => {
    const result = VaultListResponseSchema.parse(vaultsBase);
    const emptyUt = result.data.find((v) => v.underlyingTokens.length === 0);
    expect(emptyUt).toBeTruthy();
    expect(emptyUt!.name).toBe('UNIBTC');
  });

  it('handles vaults without description (Pitfall #16)', () => {
    const result = VaultListResponseSchema.parse(vaultsBase);
    const noDesc = result.data.filter((v) => v.description === undefined);
    expect(noDesc.length).toBeGreaterThan(0);
  });

  it('handles null apy.reward on Aave vaults (Pitfall #17)', () => {
    const result = VaultListResponseSchema.parse(vaultsBase);
    const aaveVault = result.data.find((v) => v.protocol.name === 'aave-v3');
    if (aaveVault) {
      // Should have been normalized from null to 0
      expect(aaveVault.analytics.apy.reward).toBe(0);
    }
  });

  it('handles string tvl.usd across all vaults (Pitfall #8)', () => {
    const result = VaultListResponseSchema.parse(vaultsBase);
    for (const vault of result.data) {
      const tvl = parseTvl(vault.analytics.tvl);
      expect(tvl.parsed).toBeTypeOf('number');
      expect(tvl.parsed).toBeGreaterThanOrEqual(0);
    }
  });
});
