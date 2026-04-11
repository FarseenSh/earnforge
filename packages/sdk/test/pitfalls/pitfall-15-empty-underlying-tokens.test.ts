// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect } from 'vitest';
import { buildDepositQuote } from '../../src/build-deposit-quote.js';
import { preflight } from '../../src/preflight.js';
import { ComposerClient } from '../../src/clients/index.js';
import { VaultSchema, type Vault } from '../../src/schemas/index.js';
import { EarnForgeError } from '../../src/errors.js';
import vaultSingle from '../../../fixtures/src/vault-single.json';

describe('Pitfall #15: Empty underlyingTokens array', () => {
  const vault = VaultSchema.parse(vaultSingle);
  const emptyUtVault: Vault = { ...vault, underlyingTokens: [] };

  it('buildDepositQuote throws clear error when no underlyingTokens and no fromToken', async () => {
    const composer = {} as ComposerClient;
    await expect(
      buildDepositQuote(emptyUtVault, { fromAmount: '100', wallet: '0x1' }, composer),
    ).rejects.toThrowError(EarnForgeError);
  });

  it('buildDepositQuote accepts explicit fromToken even with empty underlyingTokens', async () => {
    const mockComposer = {
      getQuote: async () => ({ transactionRequest: { to: '0x1', data: '0x', value: '0x0', chainId: 8453 } }),
    } as unknown as ComposerClient;

    // Should not throw — fromToken is explicitly provided
    const result = await buildDepositQuote(
      emptyUtVault,
      { fromAmount: '100', wallet: '0x1', fromToken: '0xusdc' },
      mockComposer,
    );
    expect(result).toBeDefined();
  });

  it('preflight warns about empty underlyingTokens', () => {
    const report = preflight(emptyUtVault, '0x1');
    expect(report.issues.some((i) => i.code === 'NO_UNDERLYING_TOKENS')).toBe(true);
  });
});
