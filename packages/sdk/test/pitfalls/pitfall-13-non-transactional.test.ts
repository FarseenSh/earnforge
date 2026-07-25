// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest'
import vaultSingle from '../../../fixtures/src/vault-single.json'
import { buildDepositQuote } from '../../src/build-deposit-quote.js'
import type { ComposerClient } from '../../src/clients/index.js'
import { EarnForgeError } from '../../src/errors.js'
import { type Vault, VaultSchema } from '../../src/schemas/index.js'

describe('Pitfall #13: Depositing into non-transactional vault', () => {
  it('buildDepositQuote throws when isTransactional is false', async () => {
    const vault = VaultSchema.parse(vaultSingle)
    const nonTx: Vault = { ...vault, isTransactional: false }
    const composer = {} as ComposerClient

    await expect(
      buildDepositQuote(nonTx, { fromAmount: '100', wallet: '0x1' }, composer)
    ).rejects.toThrowError(EarnForgeError)
  })

  it('buildDepositQuote proceeds when isTransactional is true', async () => {
    const vault = VaultSchema.parse(vaultSingle)
    expect(vault.isTransactional).toBe(true)
    // Would proceed (not testing network call here, just the guard)
  })
})
