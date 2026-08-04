// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest'
import vaultSingle from '../../../fixtures/src/vault-single.json'
import { buildDepositQuote } from '../../src/build-deposit-quote.js'
import type { ComposerClient } from '../../src/clients/index.js'
import { preflight } from '../../src/preflight.js'
import { type Vault, VaultSchema } from '../../src/schemas/index.js'
import { suggest } from '../../src/suggest.js'

/**
 * Pitfall #24 — `underlyingTokens` entries can be partial, not just absent.
 *
 * Pitfall #15 anticipated an *empty* `underlyingTokens` array. What the API
 * actually sends is stranger: a populated array whose entries carry only an
 * `address`, with no `symbol` and no `decimals`.
 *
 * `morpho:1:_:0xb5ce3ca2c774b72955c25875022fdd91f7a7b938` (KPK-WARS-YIELD) is
 * the live example. One vault out of 712 — and because the schema required
 * both fields, `listAll()` threw a ZodError partway through the fleet. Anything
 * iterating every vault died: the Studio's vault list read zero in production,
 * and `earnforge list` without a chain filter could not complete.
 *
 * It survived every check because nothing iterated the whole fleet through the
 * schema. The drift detector samples 100 vaults; the fixtures stop at two
 * pages; the live tests assert shape on a handful. The bad vault sits at index
 * ~300.
 *
 * The lesson is narrower than "validate less". It is that a field being
 * present on every vault you sampled is not the same as it being required —
 * and the distance between those two claims is one vault in seven hundred.
 */
describe('Pitfall #24: partial underlyingTokens entries', () => {
  const base = VaultSchema.parse(vaultSingle)

  /** Exactly what the live API sends for KPK-WARS-YIELD. */
  const ADDRESS_ONLY = { address: '0x0DC4F92879B7670e5f4e4e6e3c801D229129D90D' }

  it('parses a token carrying nothing but an address', () => {
    const parsed = VaultSchema.safeParse({
      ...vaultSingle,
      underlyingTokens: [ADDRESS_ONLY],
    })
    expect(parsed.success, parsed.error?.message).toBe(true)
    expect(parsed.data?.underlyingTokens[0]?.address).toBe(ADDRESS_ONLY.address)
    expect(parsed.data?.underlyingTokens[0]?.symbol).toBeUndefined()
    expect(parsed.data?.underlyingTokens[0]?.decimals).toBeUndefined()
  })

  const partial: Vault = {
    ...base,
    underlyingTokens: [ADDRESS_ONLY],
  }

  it('quotes against it, falling back to 18 decimals', async () => {
    // The address is present, so a quote can still be built — only the scaling
    // hint is missing, and that already had a documented fallback.
    const composer = {
      getQuote: async () => ({ ok: true }),
    } as unknown as ComposerClient
    const result = await buildDepositQuote(
      partial,
      {
        fromAmount: '1',
        wallet: '0x1234567890abcdef1234567890abcdef12345678',
      },
      composer
    )
    expect(result.decimals).toBe(18)
    expect(result.rawAmount).toBe('1000000000000000000')
  })

  it('preflights without throwing on the missing symbol', () => {
    const report = preflight(
      partial,
      '0x1234567890abcdef1234567890abcdef12345678'
    )
    expect(report).toBeDefined()
    expect(Array.isArray(report.issues)).toBe(true)
  })

  it('does not crash asset filtering, which called .toUpperCase() on it', () => {
    // `suggest` compared `t.symbol.toUpperCase()`. An address-only token made
    // that a TypeError rather than a non-match, so a single malformed vault
    // anywhere in the candidate set took the whole allocation down.
    expect(() =>
      suggest([partial], { amount: 1000, asset: 'USDC' })
    ).not.toThrow()

    // And it should simply not match, rather than matching on a coincidence.
    const result = suggest([partial], { amount: 1000, asset: 'USDC' })
    expect(result.allocations).toHaveLength(0)
  })
})
