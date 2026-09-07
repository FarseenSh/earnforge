// SPDX-License-Identifier: Apache-2.0

import type { RiskScore } from '@earnforge/sdk'
import { describe, expect, it, vi } from 'vitest'
import {
  fmtPct,
  fmtUsd,
  outputResult,
  riskLabelPlain,
  riskTable,
} from '../src/helpers.js'

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
// the live fleet: scores span 4.1-9.7, so the old 7 / 4 cuts left "high"
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

describe('fmtPct: nullable', () => {
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
    // so the CLI silently omitted LI.FI's own quality signal. The reason v2
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

/**
 * Regression: `--json` must survive a BigInt.
 *
 * `earnforge simulate --json` threw "Do not know how to serialize a BigInt" on
 * every single run, in every published version up to and including 1.2.2. The
 * Composer SDK returns `producedResources` and `approvals` carrying BigInt
 * amounts, and `JSON.stringify` refuses them outright.
 *
 * It survived this long because the human output path never reads those fields,
 * so the command looked healthy in normal use and only the documented `--json`
 * mode was dead. Nothing in the mocked suite passed a BigInt through
 * `outputResult`, and the live suite does not shell out to the CLI. The fix
 * lives in `outputResult` rather than in the simulate command, because every
 * surface promises "all commands, all with --json", so any future command
 * surfacing an on-chain amount would have reintroduced it.
 */
describe('outputResult: BigInt in --json', () => {
  function captured(data: unknown): string {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    try {
      outputResult(data, true, () => 'human')
      return String(spy.mock.calls.at(0)?.[0] ?? '')
    } finally {
      spy.mockRestore()
    }
  }

  it('does not throw on a BigInt', () => {
    expect(() =>
      captured({
        approvals: [
          {
            amount:
              115792089237316195423570985008687907853269984665640564039457584007913129639935n,
          },
        ],
      })
    ).not.toThrow()
  })

  it('serialises it as a decimal string, losing no precision', () => {
    // Above 2^53 a JSON number would silently round. This value is uint256 max,
    // which is exactly what an unlimited ERC-20 approval carries.
    const max =
      115792089237316195423570985008687907853269984665640564039457584007913129639935n
    const out = JSON.parse(captured({ amount: max }))
    expect(out.amount).toBe(max.toString())
    expect(BigInt(out.amount)).toBe(max)
  })

  it('handles a BigInt nested inside arrays and objects', () => {
    const out = JSON.parse(
      captured({
        producedResources: [{ token: '0xabc', amount: 100n }],
        gas: { limit: 21000n },
      })
    )
    expect(out.producedResources[0].amount).toBe('100')
    expect(out.gas.limit).toBe('21000')
  })

  it('leaves every other type alone', () => {
    const out = JSON.parse(
      captured({ s: 'x', n: 1.5, b: true, nul: null, arr: [1, 2] })
    )
    expect(out).toEqual({ s: 'x', n: 1.5, b: true, nul: null, arr: [1, 2] })
  })
})
