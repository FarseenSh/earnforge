// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect } from 'vitest'
import { TvlSchema, parseTvl } from '../../src/schemas/vault.js'

describe('Pitfall #8: TVL is a string', () => {
  it('TVL usd field is a string in the API response', () => {
    const tvl = TvlSchema.parse({ usd: '270595698' })
    expect(typeof tvl.usd).toBe('string')
  })

  it('parseTvl converts string to number, string, and bigint', () => {
    const parsed = parseTvl({ usd: '270595698' })
    expect(parsed.raw).toBe('270595698')
    expect(parsed.parsed).toBe(270595698)
    expect(parsed.bigint).toBe(270595698n)
    expect(typeof parsed.parsed).toBe('number')
  })

  it('handles large TVL values', () => {
    const parsed = parseTvl({ usd: '9999999999' })
    expect(parsed.parsed).toBe(9999999999)
  })
})
