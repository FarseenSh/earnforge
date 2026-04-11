// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect } from 'vitest';
import { VaultSchema, VaultListResponseSchema } from '../../src/schemas/index.js';
import vaultsBase from '../../../fixtures/src/vaults-base.json';

describe('Pitfall #16: Optional description field', () => {
  it('Zod schema marks description as optional', () => {
    // Vault without description should parse
    const vaultData = {
      address: '0x1',
      chainId: 8453,
      name: 'Test',
      slug: '8453-0x1',
      network: 'Base',
      protocol: { name: 'test', url: '' },
      provider: 'TEST',
      syncedAt: '2026-01-01T00:00:00Z',
      tags: [],
      underlyingTokens: [],
      lpTokens: [],
      analytics: {
        apy: { base: 0, total: 0, reward: 0 },
        tvl: { usd: '0' },
        apy1d: null,
        apy7d: null,
        apy30d: null,
        updatedAt: '2026-01-01T00:00:00Z',
      },
      isTransactional: true,
      isRedeemable: true,
      depositPacks: [],
      redeemPacks: [],
    };
    const result = VaultSchema.parse(vaultData);
    expect(result.description).toBeUndefined();
  });

  it('~86% of real vaults have no description', () => {
    const parsed = VaultListResponseSchema.parse(vaultsBase);
    const withDesc = parsed.data.filter((v) => v.description !== undefined);
    const withoutDesc = parsed.data.filter((v) => v.description === undefined);
    expect(withoutDesc.length).toBeGreaterThan(withDesc.length);
  });
});
