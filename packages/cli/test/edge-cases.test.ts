// SPDX-License-Identifier: Apache-2.0

/**
 * Edge case tests: empty results, errors, special vault shapes.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { program, setForge, resetForge } from '../src/index.js'
import { runDoctorChecks } from '../src/doctor.js'
import type { EarnForge } from '@earnforge/sdk'
import {
  makeVault,
  makeNonTransactionalVault,
  makeHighRiskVault,
  MOCK_RISK_SCORE,
} from './fixtures.js'

function createEmptyForge(): EarnForge {
  return {
    vaults: {
      list: vi.fn().mockResolvedValue({ data: [], nextCursor: null, total: 0 }),
      listAll: vi.fn().mockImplementation(async function* () {
        /* empty */
      }),
      get: vi.fn().mockRejectedValue(new Error('Vault not found')),
      top: vi.fn().mockResolvedValue([]),
    },
    chains: { list: vi.fn().mockResolvedValue([]) },
    protocols: { list: vi.fn().mockResolvedValue([]) },
    portfolio: { get: vi.fn().mockResolvedValue({ positions: [] }) },
    buildDepositQuote: vi.fn().mockRejectedValue(new Error('No composer key')),
    preflight: vi
      .fn()
      .mockReturnValue({
        ok: true,
        issues: [],
        vault: makeVault(),
        wallet: '0x',
      }),
    riskScore: vi.fn().mockReturnValue(MOCK_RISK_SCORE),
    suggest: vi
      .fn()
      .mockResolvedValue({ totalAmount: 0, expectedApy: 0, allocations: [] }),
    optimizeGasRoutes: vi.fn().mockResolvedValue([]),
    watch: vi.fn().mockImplementation(async function* () {
      /* empty */
    }),
    getApyHistory: vi.fn().mockResolvedValue([]),
    earnDataClient: {} as any,
    composerClient: null,
  } as EarnForge
}

let consoleOutput: string[]
let originalLog: typeof console.log
let originalError: typeof console.error

function captureConsole(): void {
  consoleOutput = []
  originalLog = console.log
  originalError = console.error
  console.log = (...args: unknown[]) =>
    consoleOutput.push(args.map(String).join(' '))
  console.error = (...args: unknown[]) =>
    consoleOutput.push(args.map(String).join(' '))
}

function restoreConsole(): void {
  console.log = originalLog
  console.error = originalError
}

async function runCommand(args: string[]): Promise<string> {
  captureConsole()
  try {
    program.exitOverride()
    await program.parseAsync(['node', 'earnforge', ...args])
  } catch {
    // Commander exitOverride
  }
  restoreConsole()
  return consoleOutput.join('\n')
}

describe('edge cases', () => {
  beforeEach(() => {
    process.exitCode = undefined
  })

  afterEach(() => {
    resetForge()
  })

  describe('empty result sets', () => {
    beforeEach(() => setForge(createEmptyForge()))

    it('list --json returns empty array when no vaults', async () => {
      const output = await runCommand(['list', '--json'])
      const parsed = JSON.parse(output)
      expect(parsed).toEqual([])
    })

    it('top --json returns empty array when no vaults', async () => {
      const output = await runCommand(['top', '--asset', 'USDC', '--json'])
      const parsed = JSON.parse(output)
      expect(parsed).toEqual([])
    })

    it('chains --json returns empty array', async () => {
      const output = await runCommand(['chains', '--json'])
      expect(JSON.parse(output)).toEqual([])
    })

    it('protocols --json returns empty array', async () => {
      const output = await runCommand(['protocols', '--json'])
      expect(JSON.parse(output)).toEqual([])
    })

    it('portfolio --json returns empty positions', async () => {
      const output = await runCommand(['portfolio', '0xwallet', '--json'])
      const parsed = JSON.parse(output)
      expect(parsed.positions).toEqual([])
    })

    it('suggest --json returns empty allocations', async () => {
      const output = await runCommand([
        'suggest',
        '--amount',
        '1000',
        '--asset',
        'USDC',
        '--json',
      ])
      const parsed = JSON.parse(output)
      expect(parsed.allocations).toEqual([])
    })
  })

  describe('doctor with problematic vaults', () => {
    it('non-transactional vault fails checks 13, 14, 15', () => {
      const vault = makeNonTransactionalVault()
      const report = runDoctorChecks(vault, { hasApiKey: true })
      expect(report.checks.find((c) => c.id === 13)?.passed).toBe(false)
      expect(report.checks.find((c) => c.id === 14)?.passed).toBe(false)
      expect(report.checks.find((c) => c.id === 15)?.passed).toBe(false)
    })

    it('high-risk vault has risk score in report', () => {
      const vault = makeHighRiskVault()
      const report = runDoctorChecks(vault, { hasApiKey: true })
      expect(report.riskScore).toBeDefined()
      expect(report.riskScore!.score).toBeLessThan(7)
    })

    it('vault with description=undefined passes check 16', () => {
      const vault = makeVault({ description: undefined })
      const report = runDoctorChecks(vault, { hasApiKey: true })
      const check16 = report.checks.find((c) => c.id === 16)
      expect(check16?.passed).toBe(true)
    })

    it('vault with empty tags still passes check 8 (TVL string)', () => {
      const vault = makeVault({ tags: [] })
      const report = runDoctorChecks(vault, { hasApiKey: true })
      const check8 = report.checks.find((c) => c.id === 8)
      expect(check8?.passed).toBe(true)
    })
  })

  describe('TVL string parsing via doctor', () => {
    it('parses large TVL string correctly', () => {
      const vault = makeVault({
        analytics: {
          apy: { base: 0.04, total: 0.05, reward: 0.01 },
          tvl: { usd: '1234567890.12' },
          apy1d: 0.05,
          apy7d: 0.05,
          apy30d: 0.05,
          updatedAt: '2026-04-11T12:00:00Z',
        },
      })
      const report = runDoctorChecks(vault, { hasApiKey: true })
      const check8 = report.checks.find((c) => c.id === 8)
      expect(check8?.passed).toBe(true)
      expect(check8?.detail).toContain('string')
    })

    it('parses zero TVL string', () => {
      const vault = makeVault({
        analytics: {
          apy: { base: 0, total: 0, reward: 0 },
          tvl: { usd: '0' },
          apy1d: null,
          apy7d: null,
          apy30d: null,
          updatedAt: '2026-04-11T12:00:00Z',
        },
      })
      const report = runDoctorChecks(vault, { hasApiKey: true })
      const check8 = report.checks.find((c) => c.id === 8)
      expect(check8?.passed).toBe(true)
    })
  })

  describe('risk score dimensions', () => {
    it('healthy vault has high risk score', () => {
      const vault = makeVault()
      const report = runDoctorChecks(vault, { hasApiKey: true })
      expect(report.riskScore!.score).toBeGreaterThanOrEqual(6)
    })

    it('non-redeemable vault penalty is reflected', () => {
      const vault = makeVault({ isRedeemable: false })
      const report = runDoctorChecks(vault, { hasApiKey: true })
      // Score should be lower due to redeemability penalty
      const healthyReport = runDoctorChecks(makeVault(), { hasApiKey: true })
      expect(report.riskScore!.score).toBeLessThanOrEqual(
        healthyReport.riskScore!.score
      )
    })
  })
})
