// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest'
import vaultsBase from '../../../fixtures/src/vaults-base.json'
import { VaultListResponseSchema } from '../../src/schemas/index.js'
import { parseVaultSlug } from '../../src/schemas/vault.js'

/**
 * Pitfall #23 — the vault slug format changed, and it doubles as the cursor.
 *
 * Slugs used to look like `8453-0xee8f...`. They now look like
 * `morpho:8453:_:0xee8f...` — protocol, chain id, a reserved segment, address.
 *
 * Two things broke. Any code splitting on `-` to recover a chain id and address
 * mis-parses every slug; ours threw `Invalid slug format` on input the API had
 * just handed it. And because `nextCursor` is a slug, anything that validated
 * cursors against the old shape rejected valid pagination tokens.
 *
 * The parser accepts both forms deliberately. Slugs get stored in bookmarks,
 * config files and databases, so the old shape keeps arriving from callers long
 * after the API stopped producing it.
 */
describe('Pitfall #23: vault slug format changed', () => {
  const page = VaultListResponseSchema.parse(vaultsBase)

  it('every live slug uses the protocol:chainId:_:address form', () => {
    for (const vault of page.data) {
      expect(vault.slug).toMatch(/^[a-z0-9-]+:\d+:.*0x[0-9a-fA-F]{40}$/)
    }
  })

  it('parses a live slug back to its chain and address', () => {
    for (const vault of page.data) {
      const parsed = parseVaultSlug(vault.slug)
      expect(parsed).not.toBeNull()
      expect(parsed?.chainId).toBe(vault.chainId)
      expect(parsed?.address).toBe(vault.address.toLowerCase())
    }
  })

  it('still parses the legacy chainId-address form', () => {
    // Stored slugs outlive API changes, so the old shape must keep resolving.
    const parsed = parseVaultSlug(
      '8453-0xee8f4ec5672f09119b96ab6fb59c27e1b7e44b61'
    )
    expect(parsed).toEqual({
      chainId: 8453,
      address: '0xee8f4ec5672f09119b96ab6fb59c27e1b7e44b61',
    })
  })

  it('naive splitting on "-" would mis-parse a live slug', () => {
    // The exact bug: the protocol segment contains no dash, so the first dash
    // in a hyphenated protocol name lands in the wrong place — and for
    // dash-free names there is no dash at all and the parse simply fails.
    const slug =
      'etherfi-staking:1:_:0x35fa164735182de50811e8e2e824cfb9b6118ac2'
    const dashIdx = slug.indexOf('-')
    const naiveChainId = Number(slug.slice(0, dashIdx))
    expect(Number.isNaN(naiveChainId)).toBe(true)

    // The real parser handles it.
    expect(parseVaultSlug(slug)).toEqual({
      chainId: 1,
      address: '0x35fa164735182de50811e8e2e824cfb9b6118ac2',
    })
  })

  it('rejects genuinely malformed slugs', () => {
    expect(parseVaultSlug('not-a-slug')).toBeNull()
    expect(parseVaultSlug('morpho:8453:_:0xnothex')).toBeNull()
    expect(parseVaultSlug('')).toBeNull()
  })

  it('nextCursor is itself a slug and round-trips through the parser', () => {
    // Pagination breaks if cursor validation assumes the old shape.
    expect(page.nextCursor).toBeTruthy()
    expect(parseVaultSlug(page.nextCursor!)).not.toBeNull()
  })
})
