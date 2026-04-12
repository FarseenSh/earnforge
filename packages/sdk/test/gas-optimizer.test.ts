// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect, vi } from 'vitest';
import { optimizeGasRoutes } from '../src/gas-optimizer.js';
import type { ComposerClient } from '../src/clients/index.js';
import { VaultSchema, type QuoteResponse } from '../src/schemas/index.js';
import vaultSingle from '../../fixtures/src/vault-single.json';

const vault = VaultSchema.parse(vaultSingle);

function mockComposer(gasCosts: Array<{ amountUSD: string }>, feeCosts: Array<{ amountUSD: string }> = []): ComposerClient {
  return {
    getQuote: vi.fn(async () => ({
      estimate: {
        gasCosts,
        feeCosts,
        executionDuration: 30,
        toAmountMin: '1000000',
        toAmount: '1000000',
        fromAmount: '1000000',
        tool: 'composer',
      },
      transactionRequest: { to: '0x1', data: '0x', value: '0x0', chainId: 8453 },
    } as unknown as QuoteResponse)),
  } as unknown as ComposerClient;
}

describe('optimizeGasRoutes', () => {
  it('returns routes sorted by total cost ascending', async () => {
    const composer = {
      getQuote: vi.fn()
        .mockResolvedValueOnce({
          estimate: { gasCosts: [{ amountUSD: '2.00' }], feeCosts: [{ amountUSD: '0.10' }], executionDuration: 30, toAmountMin: '1', toAmount: '1', fromAmount: '1', tool: 'test' },
          transactionRequest: { to: '0x1', data: '0x', value: '0x0', chainId: 8453 },
        })
        .mockResolvedValueOnce({
          estimate: { gasCosts: [{ amountUSD: '0.02' }], feeCosts: [{ amountUSD: '0.01' }], executionDuration: 15, toAmountMin: '1', toAmount: '1', fromAmount: '1', tool: 'test' },
          transactionRequest: { to: '0x1', data: '0x', value: '0x0', chainId: 8453 },
        }),
    } as unknown as ComposerClient;

    const routes = await optimizeGasRoutes(vault, composer, {
      fromAmount: '100',
      wallet: '0x1234567890abcdef1234567890abcdef12345678',
      fromChains: [1, 8453],
      fromTokens: { 1: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', 8453: vault.underlyingTokens[0]!.address },
    });

    expect(routes.length).toBe(2);
    expect(routes[0]!.totalCostUsd).toBeLessThanOrEqual(routes[1]!.totalCostUsd);
  });

  it('returns empty array when no fromToken available', async () => {
    const emptyVault = { ...vault, underlyingTokens: [] };
    const composer = mockComposer([]);
    const routes = await optimizeGasRoutes(emptyVault, composer, {
      fromAmount: '100',
      wallet: '0x1234567890abcdef1234567890abcdef12345678',
    });
    expect(routes).toEqual([]);
  });

  it('silently drops chains where getQuote throws', async () => {
    const composer = {
      getQuote: vi.fn().mockRejectedValue(new Error('network failure')),
    } as unknown as ComposerClient;

    const routes = await optimizeGasRoutes(vault, composer, {
      fromAmount: '100',
      wallet: '0x1234567890abcdef1234567890abcdef12345678',
      fromChains: [8453],
    });
    expect(routes).toEqual([]);
  });

  it('uses vault.chainId as default fromChain', async () => {
    const composer = mockComposer([{ amountUSD: '0.01' }]);
    const routes = await optimizeGasRoutes(vault, composer, {
      fromAmount: '100',
      wallet: '0x1234567890abcdef1234567890abcdef12345678',
    });
    expect(routes.length).toBe(1);
    expect(routes[0]!.fromChain).toBe(vault.chainId);
  });

  it('skips cross-chain routes without fromTokens mapping', async () => {
    const composer = mockComposer([{ amountUSD: '0.01' }]);
    const routes = await optimizeGasRoutes(vault, composer, {
      fromAmount: '100',
      wallet: '0x1234567890abcdef1234567890abcdef12345678',
      fromChains: [1, 8453], // Chain 1 has no mapping
    });
    // Only 8453 (same-chain) should succeed
    expect(routes.length).toBe(1);
    expect(routes[0]!.fromChain).toBe(8453);
  });
});
