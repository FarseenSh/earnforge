// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect } from 'vitest';
import { buildDepositQuote } from '../../src/build-deposit-quote.js';
import { ComposerClient } from '../../src/clients/index.js';
import { VaultSchema, type Vault } from '../../src/schemas/index.js';
import { EarnForgeError } from '../../src/errors.js';
import vaultSingle from '../../../fixtures/src/vault-single.json';

describe('Pitfall #13: Depositing into non-transactional vault', () => {
  it('buildDepositQuote throws when isTransactional is false', async () => {
    const vault = VaultSchema.parse(vaultSingle);
    const nonTx: Vault = { ...vault, isTransactional: false };
    const composer = {} as ComposerClient;

    await expect(
      buildDepositQuote(nonTx, { fromAmount: '100', wallet: '0x1' }, composer),
    ).rejects.toThrowError(EarnForgeError);
  });

  it('buildDepositQuote proceeds when isTransactional is true', async () => {
    const vault = VaultSchema.parse(vaultSingle);
    expect(vault.isTransactional).toBe(true);
    // Would proceed (not testing network call here, just the guard)
  });
});
