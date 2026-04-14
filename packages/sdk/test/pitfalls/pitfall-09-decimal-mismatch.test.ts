// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect } from 'vitest'
import { toSmallestUnit } from '../../src/build-deposit-quote.js'

describe('Pitfall #9: Decimal mismatch', () => {
  it('1 USDC (6 decimals) = 1000000, not 1e18', () => {
    expect(toSmallestUnit('1', 6)).toBe('1000000')
    expect(toSmallestUnit('1', 6)).not.toBe('1000000000000000000')
  })

  it('1 ETH (18 decimals) = 1e18', () => {
    expect(toSmallestUnit('1', 18)).toBe('1000000000000000000')
  })

  it('0.01 USDC = 10000', () => {
    expect(toSmallestUnit('0.01', 6)).toBe('10000')
  })

  it('prevents the classic 1e18 bug on 6-decimal tokens', () => {
    // If someone sends "1" with 18 decimals instead of 6, they'd send 1e12 USDC
    const wrong = toSmallestUnit('1', 18)
    const correct = toSmallestUnit('1', 6)
    expect(Number(wrong)).toBeGreaterThan(Number(correct) * 1e6)
  })
})
