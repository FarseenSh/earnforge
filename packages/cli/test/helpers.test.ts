// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest'
import { fmtPct, fmtUsd, riskLabelPlain } from '../src/helpers.js'

describe('fmtPct', () => {
  it('formats a percentage value as a string (API returns percentages, not fractions)', () => {
    expect(fmtPct(3.84)).toBe('3.84%')
    expect(fmtPct(12.34)).toBe('12.34%')
    expect(fmtPct(0)).toBe('0.00%')
    expect(fmtPct(100)).toBe('100.00%')
  })
})

describe('fmtUsd', () => {
  it('formats billions', () => {
    expect(fmtUsd(2_500_000_000)).toBe('$2.50B')
  })

  it('formats millions', () => {
    expect(fmtUsd(50_000_000)).toBe('$50.00M')
  })

  it('formats thousands', () => {
    expect(fmtUsd(1_234)).toBe('$1.23K')
  })

  it('formats small values', () => {
    expect(fmtUsd(42.5)).toBe('$42.50')
  })
})

// Thresholds are 8 / 6, matching the SDK's riskLabel(). Recalibrated against
// the live fleet — scores span 4.1-9.7, so the old 7 / 4 cuts left "high"
// unreachable. The 8 cut also guarantees no flagged vault reads as low risk.
describe('riskLabelPlain', () => {
  it('returns low for score >= 8', () => {
    expect(riskLabelPlain(8)).toContain('low')
    expect(riskLabelPlain(9.5)).toContain('low')
  })

  it('returns medium for score 6-7.9', () => {
    expect(riskLabelPlain(6)).toContain('medium')
    expect(riskLabelPlain(7.9)).toContain('medium')
  })

  it('returns high for score < 6', () => {
    expect(riskLabelPlain(5.9)).toContain('high')
    expect(riskLabelPlain(2)).toContain('high')
  })
})

describe('fmtPct — nullable', () => {
  it('renders null and undefined as N/A rather than 0.00%', () => {
    // apy.reward is genuinely null on many vaults; showing 0.00% would assert
    // "no incentives" when the protocol reported nothing at all.
    expect(fmtPct(null)).toBe('N/A')
    expect(fmtPct(undefined)).toBe('N/A')
    expect(fmtPct(0)).toBe('0.00%')
  })
})
