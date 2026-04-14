// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect, vi } from 'vitest'
import { buildDepositQuote } from '../../src/build-deposit-quote.js'
import { ComposerClient } from '../../src/clients/index.js'
import { VaultSchema } from '../../src/schemas/index.js'
import vaultSingle from '../../../fixtures/src/vault-single.json'
import quoteComposer from '../../../fixtures/src/quote-composer.json'

describe('Pitfall #5: Wrong toToken for deposits', () => {
  it('buildDepositQuote sets toToken to vault.address, not underlyingToken', async () => {
    const vault = VaultSchema.parse(vaultSingle)
    const mockGetQuote = vi.fn().mockResolvedValue(quoteComposer)
    const composer = { getQuote: mockGetQuote } as unknown as ComposerClient

    await buildDepositQuote(
      vault,
      {
        fromAmount: '100',
        wallet: '0x1234567890abcdef1234567890abcdef12345678',
      },
      composer
    )

    expect(mockGetQuote).toHaveBeenCalledWith(
      expect.objectContaining({
        toToken: vault.address, // MUST be vault address, NOT underlying token
      })
    )
    // Verify it's NOT the underlying token
    expect(mockGetQuote.mock.calls[0]?.[0].toToken).not.toBe(
      vault.underlyingTokens[0]?.address
    )
  })
})
