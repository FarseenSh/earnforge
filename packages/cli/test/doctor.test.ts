// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest'
import {
  formatDoctorReport,
  formatEnvReport,
  runDoctorChecks,
  runEnvChecks,
} from '../src/doctor.js'
import {
  makeHighRiskVault,
  makeNonTransactionalVault,
  makeVault,
} from './fixtures.js'

describe('runDoctorChecks', () => {
  it('runs 18 checks total', () => {
    const vault = makeVault()
    const report = runDoctorChecks(vault, { hasApiKey: true })
    expect(report.total).toBe(18)
    expect(report.checks).toHaveLength(18)
  })

  /**
   * `doctor` reported a failure on every healthy live vault.
   *
   * Check #8 asserted `typeof tvl.usd === 'string'`, which was true when it was
   * written and has been false since the field flipped to a number. So the
   * diagnostic whose whole job is catching pitfalls told users their vault was
   * broken because the API had been fixed.
   *
   * The mocked suite could not see it: these fixtures still carried the old
   * string form, so the check agreed with a snapshot of the past while
   * disagreeing with production. The fixtures now use numbers, as the live API
   * and the SDK's own fixtures do, and the check no longer pins either type.
   */
  it('passes cleanly on a vault carrying the live number-typed tvl', () => {
    const vault = makeVault()
    expect(typeof vault.analytics.tvl.usd).toBe('number')

    const report = runDoctorChecks(vault, { hasApiKey: true })
    const failures = report.checks.filter((c) => !c.passed)
    expect(failures.map((f) => `#${f.id} ${f.pitfall}`)).toEqual([])
  })

  it('accepts a string tvl too, since the spec still declares one', () => {
    const vault = makeVault()
    const asString = {
      ...vault,
      analytics: { ...vault.analytics, tvl: { usd: '50000000' } },
    } as typeof vault

    const report = runDoctorChecks(asString, { hasApiKey: true })
    expect(report.checks.find((c) => c.id === 8)?.passed).toBe(true)
  })

  it('fails the auth check when no API key is present', () => {
    // Pitfall #2 inverted: this used to pass unconditionally while asserting
    // that earn.li.fi needed no auth.
    const report = runDoctorChecks(makeVault(), { hasApiKey: false })
    const authCheck = report.checks.find((c) => c.id === 2)
    expect(authCheck?.passed).toBe(false)
    expect(authCheck?.detail).toMatch(/401/)
  })

  it('all checks pass for a healthy vault with API key', () => {
    const vault = makeVault()
    const report = runDoctorChecks(vault, { hasApiKey: true })
    expect(report.passed).toBe(18)
    expect(report.failed).toBe(0)
  })

  it('fails pitfall #3 when no API key', () => {
    const vault = makeVault()
    const report = runDoctorChecks(vault, { hasApiKey: false })
    const check3 = report.checks.find((c) => c.id === 3)
    expect(check3?.passed).toBe(false)
    expect(check3?.detail).toContain('NOT set')
  })

  it('fails pitfall #13 for non-transactional vault', () => {
    const vault = makeNonTransactionalVault()
    const report = runDoctorChecks(vault, { hasApiKey: true })
    const check13 = report.checks.find((c) => c.id === 13)
    expect(check13?.passed).toBe(false)
  })

  it('fails pitfall #14 for non-redeemable vault', () => {
    const vault = makeNonTransactionalVault() // also not redeemable
    const report = runDoctorChecks(vault, { hasApiKey: true })
    const check14 = report.checks.find((c) => c.id === 14)
    expect(check14?.passed).toBe(false)
  })

  it('fails pitfall #15 for empty underlyingTokens', () => {
    const vault = makeNonTransactionalVault()
    const report = runDoctorChecks(vault, { hasApiKey: true })
    const check15 = report.checks.find((c) => c.id === 15)
    expect(check15?.passed).toBe(false)
    expect(check15?.detail).toContain('EMPTY')
  })

  it('fails pitfall #9 for vaults with no underlyingTokens', () => {
    const vault = makeNonTransactionalVault()
    const report = runDoctorChecks(vault, { hasApiKey: true })
    const check9 = report.checks.find((c) => c.id === 9)
    expect(check9?.passed).toBe(false)
  })

  it('detects high APY as suspicious for pitfall #7', () => {
    const vault = makeHighRiskVault() // apy.total = 0.9 which is valid
    const report = runDoctorChecks(vault, { hasApiKey: true })
    const check7 = report.checks.find((c) => c.id === 7)
    expect(check7?.passed).toBe(true) // 0.9 < 5, looks like a fraction
  })

  it('flags impossibly high APY values', () => {
    const vault = makeVault({
      analytics: {
        apy: { base: 100, total: 500, reward: 400 },
        tvl: { usd: 1_000_000 },
        apy1d: null,
        apy7d: null,
        apy30d: null,
        updatedAt: '2026-04-11T12:00:00Z',
      },
    })
    const report = runDoctorChecks(vault, { hasApiKey: true })
    const check7 = report.checks.find((c) => c.id === 7)
    expect(check7?.passed).toBe(false)
  })

  it('includes risk score in report', () => {
    const vault = makeVault()
    const report = runDoctorChecks(vault, { hasApiKey: true })
    expect(report.riskScore).toBeDefined()
    expect(report.riskScore!.score).toBeGreaterThan(0)
    expect(report.riskScore!.label).toBeDefined()
  })

  it('handles null APY fields (pitfall #18)', () => {
    const vault = makeVault({
      analytics: {
        apy: { base: 0.04, total: 0.05, reward: 0.01 },
        tvl: { usd: 50_000_000 },
        apy1d: null,
        apy7d: null,
        apy30d: null,
        updatedAt: '2026-04-11T12:00:00Z',
      },
    })
    const report = runDoctorChecks(vault, { hasApiKey: true })
    const check18 = report.checks.find((c) => c.id === 18)
    expect(check18?.passed).toBe(true)
    expect(check18?.detail).toContain('apy1d')
    expect(check18?.detail).toContain('apy7d')
    expect(check18?.detail).toContain('apy30d')
  })
})

describe('formatDoctorReport', () => {
  it('produces string output with OK/FAIL markers', () => {
    const vault = makeVault()
    const report = runDoctorChecks(vault, { hasApiKey: true })
    const output = formatDoctorReport(report, vault.name)
    expect(output).toContain('OK')
    expect(output).toContain('Doctor')
    expect(output).toContain('Summary')
    expect(output).toContain('Risk Score')
  })

  it('shows FAIL markers for failing checks', () => {
    const vault = makeNonTransactionalVault()
    const report = runDoctorChecks(vault, { hasApiKey: false })
    const output = formatDoctorReport(report)
    expect(output).toContain('FAIL')
    expect(output).toContain('failed')
  })
})

describe('runEnvChecks', () => {
  it('returns env-only checks', () => {
    const report = runEnvChecks()
    expect(report.total).toBeGreaterThan(0)
    expect(report.checks.length).toBeGreaterThan(0)
  })

  it('checks Node.js version', () => {
    const report = runEnvChecks()
    const nodeCheck = report.checks.find((c) => c.pitfall === 'Node.js version')
    expect(nodeCheck).toBeDefined()
    expect(nodeCheck!.passed).toBe(true) // We are running on Node 18+
  })
})

describe('formatEnvReport', () => {
  it('produces readable output', () => {
    const report = runEnvChecks()
    const output = formatEnvReport(report)
    expect(output).toContain('Environment')
    expect(output).toContain('Summary')
  })
})
