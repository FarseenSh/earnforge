// SPDX-License-Identifier: Apache-2.0

import type { RiskScore } from '@earnforge/sdk'
import { describe, expect, it } from 'vitest'
import { fmtPct, fmtUsd, riskLabelPlain, riskTable } from '../src/helpers.js'

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

describe('riskTable', () => {
  const risk: RiskScore = {
    score: 5.5,
    label: 'high',
    breakdown: {
      tvl: 3,
      apyStability: 10,
      protocol: 7,
      redeemability: 10,
      assetType: 9,
      verification: 1,
      rewardDependency: 2,
    },
    flags: [
      'flagged by LI.FI verification: apy_outlier',
      '87% of APY comes from token incentives',
    ],
  }

  it('renders every dimension the scorer produces', () => {
    // The table listed five of seven for an entire release: `verification`
    // and `rewardDependency` arrived with risk scorer v2 and were never added,
    // so the CLI silently omitted LI.FI's own quality signal — the reason v2
    // exists. Asserting on the key count means the next added dimension fails
    // here rather than going unnoticed.
    const out = riskTable(risk)
    for (const label of [
      'TVL Magnitude',
      'APY Stability',
      'Protocol Maturity',
      'Redeemability',
      'Asset Type',
      'Verification',
      'Reward Dependency',
    ]) {
      expect(out, `${label} missing from the risk table`).toContain(label)
    }
    expect(Object.keys(risk.breakdown)).toHaveLength(7)
  })

  it('prints the flags, not just the number', () => {
    // A composite of 5.5 says something is wrong; the flags say what. Printing
    // the score alone was the actual defect.
    const out = riskTable(risk)
    expect(out).toContain('apy_outlier')
    expect(out).toContain('87% of APY comes from token incentives')
  })

  it('omits the Flags section entirely when there is nothing to report', () => {
    const clean = riskTable({ ...risk, score: 9.2, label: 'low', flags: [] })
    expect(clean).not.toContain('Flags')
  })
})
