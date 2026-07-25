// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest'
import vaultsBase from '../../../fixtures/src/vaults-base.json'
import { VaultListResponseSchema } from '../../src/schemas/index.js'
import { parseTvl, TvlSchema } from '../../src/schemas/vault.js'

/**
 * Pitfall #8 — INVERTED as of Apr 2026.
 *
 * `tvl.usd` used to arrive as a decimal string, so the original guard parsed it
 * to a number. It is now a JSON number on every live vault — while LI.FI's
 * OpenAPI spec still documents it as a string.
 *
 * Because both representations are attested by some source, `TvlSchema` accepts
 * either and `parseTvl` normalises. A schema pinned to one type breaks whenever
 * LI.FI flips, and it has already flipped once.
 */
describe('Pitfall #8: TVL type flips between string and number', () => {
  it('accepts a number, which is what the live API sends today', () => {
    const tvl = TvlSchema.parse({ usd: 270595698 })
    expect(typeof tvl.usd).toBe('number')
  })

  it('still accepts a string, which the OpenAPI spec documents', () => {
    const tvl = TvlSchema.parse({ usd: '270595698' })
    expect(typeof tvl.usd).toBe('string')
  })

  it('parseTvl yields an identical result for both representations', () => {
    const fromNumber = parseTvl({ usd: 270595698 })
    const fromString = parseTvl({ usd: '270595698' })
    expect(fromNumber).toEqual(fromString)
    expect(fromNumber.parsed).toBe(270595698)
    expect(fromNumber.bigint).toBe(270595698n)
    expect(fromNumber.raw).toBe('270595698')
  })

  it('keeps precision on values beyond Number.MAX_SAFE_INTEGER', () => {
    // bigint is derived from the integer part of the raw string rather than
    // from Number(), so large values survive intact.
    const parsed = parseTvl({ usd: '9007199254740993' })
    expect(parsed.bigint).toBe(9007199254740993n)
  })

  it('drops the fractional part for bigint but keeps it for parsed', () => {
    const parsed = parseTvl({ usd: '12500000.75' })
    expect(parsed.bigint).toBe(12500000n)
    expect(parsed.parsed).toBeCloseTo(12500000.75)
  })

  it('every vault in the live fixture parses to a usable number', () => {
    const result = VaultListResponseSchema.parse(vaultsBase)
    for (const vault of result.data) {
      const tvl = parseTvl(vault.analytics.tvl)
      expect(Number.isNaN(tvl.parsed)).toBe(false)
      expect(tvl.parsed).toBeGreaterThanOrEqual(0)
    }
  })

  it('optional tvl.native is tolerated in either representation', () => {
    expect(TvlSchema.parse({ usd: 1, native: '123' }).native).toBe('123')
    expect(TvlSchema.parse({ usd: 1, native: 123 }).native).toBe(123)
    expect(TvlSchema.parse({ usd: 1 }).native).toBeUndefined()
  })
})
