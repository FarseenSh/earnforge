// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect } from 'vitest';
import { createEarnForge } from '../src/index.js';

describe('createEarnForge factory', () => {
  it('returns an object with all expected methods', () => {
    const forge = createEarnForge();
    expect(forge.vaults.list).toBeTypeOf('function');
    expect(forge.vaults.listAll).toBeTypeOf('function');
    expect(forge.vaults.get).toBeTypeOf('function');
    expect(forge.vaults.top).toBeTypeOf('function');
    expect(forge.chains.list).toBeTypeOf('function');
    expect(forge.protocols.list).toBeTypeOf('function');
    expect(forge.portfolio.get).toBeTypeOf('function');
    expect(forge.buildDepositQuote).toBeTypeOf('function');
    expect(forge.preflight).toBeTypeOf('function');
    expect(forge.riskScore).toBeTypeOf('function');
    expect(forge.suggest).toBeTypeOf('function');
    expect(forge.optimizeGasRoutes).toBeTypeOf('function');
    expect(forge.watch).toBeTypeOf('function');
    expect(forge.getApyHistory).toBeTypeOf('function');
  });

  it('without composerApiKey, composerClient is null', () => {
    const forge = createEarnForge();
    expect(forge.composerClient).toBeNull();
  });

  it('with composerApiKey, composerClient is created', () => {
    const forge = createEarnForge({ composerApiKey: 'test-key' });
    expect(forge.composerClient).not.toBeNull();
  });

  it('without composerApiKey, buildDepositQuote throws', () => {
    const forge = createEarnForge();
    const fakeVault = { isTransactional: true, underlyingTokens: [{ address: '0x1', decimals: 6, symbol: 'USDC' }], address: '0x2', chainId: 8453, slug: '8453-0x2' } as any;
    expect(() =>
      forge.buildDepositQuote(fakeVault, { fromAmount: '100', wallet: '0x3' }),
    ).toThrow('Composer API key required');
  });

  it('without composerApiKey, optimizeGasRoutes throws', () => {
    const forge = createEarnForge();
    const fakeVault = { underlyingTokens: [{ address: '0x1', decimals: 6 }], address: '0x2', chainId: 8453 } as any;
    expect(() =>
      forge.optimizeGasRoutes(fakeVault, { fromAmount: '100', wallet: '0x3' }),
    ).toThrow('Composer API key required');
  });

  it('earnDataClient is always available', () => {
    const forge = createEarnForge();
    expect(forge.earnDataClient).toBeDefined();
  });

  it('accepts cache options', () => {
    const forge = createEarnForge({ cache: { ttl: 30_000, maxSize: 100 } });
    expect(forge).toBeDefined();
  });

  it('riskScore computes from vault data', () => {
    const forge = createEarnForge();
    const vault = {
      analytics: { apy: { base: 4, total: 4, reward: 0 }, tvl: { usd: '50000000' }, apy1d: 4, apy7d: 4, apy30d: 4, updatedAt: '' },
      protocol: { name: 'morpho-v1', url: '' },
      isRedeemable: true,
      tags: ['stablecoin'],
    } as any;
    const risk = forge.riskScore(vault);
    expect(risk.score).toBeGreaterThanOrEqual(7);
    expect(risk.label).toBe('low');
  });
});
