// SPDX-License-Identifier: Apache-2.0
/**
 * Property tests for the human <-> smallest-unit conversion.
 *
 * This is the money math, and this codebase's recurring failure mode is a
 * helper that pads instead of rejecting: `buildApprovalTx` emitted a literal
 * `-` in calldata and a 65-character ABI word before it was range-checked.
 * Worked examples do not find that class of bug; boundary sweeps do.
 */
import { describe, expect, it } from 'vitest'
import {
  fromSmallestUnit,
  toSmallestUnit,
  toSmallestUnitNonZero,
} from '../src/build-deposit-quote.js'

// Every decimal count the live fleet actually uses, plus the extremes.
const DECIMALS = [0, 1, 2, 6, 8, 9, 12, 18, 24, 27]

describe('toSmallestUnit / fromSmallestUnit round-trip', () => {
  it('round-trips every representable amount at every decimal count', () => {
    const amounts = [
      '0',
      '1',
      '2',
      '9',
      '10',
      '100',
      '1000',
      '0.1',
      '0.5',
      '0.9',
      '1.5',
      '123.456',
      '999999999',
      '1000000.000001',
      '0.000000000000000001',
      '115792089237316195423570985008687907853269984665640564039457',
    ]
    for (const d of DECIMALS) {
      for (const a of amounts) {
        const raw = toSmallestUnit(a, d)
        // Raw output is always a canonical non-negative integer string.
        expect(raw).toMatch(/^\d+$/)
        expect(raw === '0' || !raw.startsWith('0')).toBe(true)
        // Round-tripping is lossless for anything that survives truncation.
        const back = fromSmallestUnit(raw, d)
        expect(toSmallestUnit(back, d)).toBe(raw)
      }
    }
  })

  it('truncates rather than rounds, so a deposit never exceeds what was typed', () => {
    // Rounding up here would spend more of the user's money than they asked.
    expect(toSmallestUnit('1.9999999', 6)).toBe('1999999')
    expect(toSmallestUnit('0.9999999', 6)).toBe('999999')
    expect(toSmallestUnit('1.999999999999999999999', 2)).toBe('199')
  })

  it('never emits a negative or sign character', () => {
    for (const bad of [
      '-1',
      '-0.5',
      '+1',
      '1e6',
      '1E6',
      '0x10',
      'Infinity',
      'NaN',
    ]) {
      for (const d of DECIMALS) {
        expect(() => toSmallestUnit(bad, d)).toThrow(/Invalid amount/)
      }
    }
  })

  it('rejects the shapes a UI actually produces', () => {
    for (const bad of ['', ' ', '.', '1.', '.5', '1.2.3', '1,000', '1 000']) {
      expect(() => toSmallestUnit(bad, 6)).toThrow(/Invalid amount/)
    }
  })

  it('refuses an amount that rounds away to nothing, naming the precision', () => {
    // A quote for zero is not a quote; Composer answers with an opaque
    // isBigNumberish error, so the SDK has to say why itself.
    expect(() => toSmallestUnitNonZero('0.0000001', 6)).toThrow(
      /zero at 6 decimals/
    )
    expect(() => toSmallestUnitNonZero('0', 18)).toThrow(/zero at 18 decimals/)
    expect(toSmallestUnitNonZero('0.000001', 6)).toBe('1')
  })

  it('stays exact well past IEEE-754 range', () => {
    // The entire reason this is string math: Number() loses this at 2^53.
    const big = '90071992547409910'
    expect(toSmallestUnit(big, 18)).toBe(`${big}${'0'.repeat(18)}`)
    expect(fromSmallestUnit(`${big}${'0'.repeat(18)}`, 18)).toBe(big)
  })

  it('handles 0 decimals, where whole and raw are the same string', () => {
    expect(toSmallestUnit('123', 0)).toBe('123')
    expect(fromSmallestUnit('123', 0)).toBe('123')
  })

  it('produces a value BigInt always accepts', () => {
    // Everything downstream — approvals, preflight, calldata — does
    // BigInt(raw). A single non-canonical output would throw there instead.
    for (const d of DECIMALS) {
      for (const a of ['0', '1', '0.000001', '123456.789', '999999999999']) {
        expect(() => BigInt(toSmallestUnit(a, d))).not.toThrow()
      }
    }
  })
})
