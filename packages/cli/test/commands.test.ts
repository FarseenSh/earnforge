// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { program, setForge, resetForge } from '../src/index.js'
import type { EarnForge } from '@earnforge/sdk'
import {
  makeVault,
  makeVault2,
  MOCK_CHAINS,
  MOCK_PROTOCOLS,
  MOCK_PORTFOLIO,
  MOCK_RISK_SCORE,
  MOCK_SUGGEST_RESULT,
  MOCK_QUOTE_RESULT,
  MOCK_GAS_ROUTES,
} from './fixtures.js'

// ── Mock forge factory ──

function createMockForge(overrides: Partial<EarnForge> = {}): EarnForge {
  const vaults = [makeVault(), makeVault2()]

  return {
    vaults: {
      list: vi
        .fn()
        .mockResolvedValue({ data: vaults, nextCursor: null, total: 2 }),
      listAll: vi.fn().mockImplementation(async function* () {
        for (const v of vaults) yield v
      }),
      get: vi.fn().mockResolvedValue(makeVault()),
      top: vi.fn().mockResolvedValue(vaults),
    },
    chains: { list: vi.fn().mockResolvedValue(MOCK_CHAINS) },
    protocols: { list: vi.fn().mockResolvedValue(MOCK_PROTOCOLS) },
    portfolio: { get: vi.fn().mockResolvedValue(MOCK_PORTFOLIO) },
    buildDepositQuote: vi.fn().mockResolvedValue(MOCK_QUOTE_RESULT),
    preflight: vi
      .fn()
      .mockReturnValue({
        ok: true,
        issues: [],
        vault: makeVault(),
        wallet: '0x',
      }),
    riskScore: vi.fn().mockReturnValue(MOCK_RISK_SCORE),
    suggest: vi.fn().mockResolvedValue(MOCK_SUGGEST_RESULT),
    optimizeGasRoutes: vi.fn().mockResolvedValue(MOCK_GAS_ROUTES),
    watch: vi.fn().mockImplementation(async function* () {
      yield {
        type: 'update',
        vault: makeVault(),
        previous: { apy: 0.05, tvlUsd: 50000000 },
        current: { apy: 0.048, tvlUsd: 49000000 },
        timestamp: new Date('2026-04-11T12:00:00Z'),
      }
    }),
    getApyHistory: vi.fn().mockResolvedValue([]),
    earnDataClient: {} as any,
    composerClient: null,
    ...overrides,
  } as EarnForge
}

// ── Helpers ──

let consoleOutput: string[]
let originalLog: typeof console.log
let originalError: typeof console.error

function captureConsole(): void {
  consoleOutput = []
  originalLog = console.log
  originalError = console.error
  console.log = (...args: unknown[]) => {
    consoleOutput.push(args.map(String).join(' '))
  }
  console.error = (...args: unknown[]) => {
    consoleOutput.push(args.map(String).join(' '))
  }
}

function restoreConsole(): void {
  console.log = originalLog
  console.error = originalError
}

function getOutput(): string {
  return consoleOutput.join('\n')
}

async function runCommand(args: string[]): Promise<string> {
  captureConsole()
  try {
    // Reset exitOverride each time
    program.exitOverride()
    await program.parseAsync(['node', 'earnforge', ...args])
  } catch {
    // Commander throws on exitOverride; that's fine
  }
  restoreConsole()
  return getOutput()
}

// ── Tests ──

describe('CLI commands', () => {
  let forge: EarnForge

  beforeEach(() => {
    forge = createMockForge()
    setForge(forge)
    process.exitCode = undefined
  })

  afterEach(() => {
    resetForge()
  })

  // ── list ──

  describe('list', () => {
    it('outputs JSON array when --json flag is set', async () => {
      const output = await runCommand(['list', '--json'])
      const parsed = JSON.parse(output)
      expect(Array.isArray(parsed)).toBe(true)
      expect(parsed.length).toBe(2)
      expect(parsed[0]).toHaveProperty('slug')
      expect(parsed[0]).toHaveProperty('apy')
      expect(parsed[0]).toHaveProperty('tvlUsd')
    })

    it('outputs table format by default', async () => {
      const output = await runCommand(['list'])
      expect(output).toContain('Test USDC Vault')
    })

    it('passes chain filter to SDK', async () => {
      await runCommand(['list', '--chain', '8453', '--json'])
      expect(forge.vaults.listAll).toHaveBeenCalledWith(
        expect.objectContaining({ chainId: 8453 })
      )
    })

    it('passes asset filter to SDK', async () => {
      await runCommand(['list', '--asset', 'USDC', '--json'])
      expect(forge.vaults.listAll).toHaveBeenCalledWith(
        expect.objectContaining({ asset: 'USDC' })
      )
    })

    it('respects --limit option', async () => {
      const output = await runCommand(['list', '--limit', '1', '--json'])
      const parsed = JSON.parse(output)
      expect(parsed.length).toBe(1)
    })

    it('includes protocol name in output', async () => {
      const output = await runCommand(['list', '--json'])
      const parsed = JSON.parse(output)
      const protocols = parsed.map((v: { protocol: string }) => v.protocol)
      expect(protocols).toContain('aave-v3')
    })

    it('includes tags in output', async () => {
      const output = await runCommand(['list', '--json'])
      const parsed = JSON.parse(output)
      const allTags = parsed.flatMap((v: { tags: string[] }) => v.tags)
      expect(allTags).toContain('stablecoin')
    })
  })

  // ── top ──

  describe('top', () => {
    it('outputs JSON when --json flag is set', async () => {
      const output = await runCommand(['top', '--asset', 'USDC', '--json'])
      const parsed = JSON.parse(output)
      expect(Array.isArray(parsed)).toBe(true)
      expect(parsed[0]).toHaveProperty('slug')
    })

    it('passes asset and limit to SDK', async () => {
      await runCommand(['top', '--asset', 'USDC', '--limit', '5', '--json'])
      expect(forge.vaults.top).toHaveBeenCalledWith(
        expect.objectContaining({ asset: 'USDC', limit: 5 })
      )
    })

    it('outputs table format by default', async () => {
      const output = await runCommand(['top', '--asset', 'USDC'])
      expect(output).toContain('Top USDC vaults')
    })

    it('passes chain filter', async () => {
      await runCommand(['top', '--asset', 'USDC', '--chain', '8453', '--json'])
      expect(forge.vaults.top).toHaveBeenCalledWith(
        expect.objectContaining({ chainId: 8453 })
      )
    })
  })

  // ── vault ──

  describe('vault', () => {
    it('outputs JSON for a single vault', async () => {
      const output = await runCommand(['vault', '8453-0xbeef0001', '--json'])
      const parsed = JSON.parse(output)
      expect(parsed.slug).toBe('8453-0xbeef0001')
      expect(parsed.name).toBe('Test USDC Vault')
    })

    it('outputs detailed view by default', async () => {
      const output = await runCommand(['vault', '8453-0xbeef0001'])
      expect(output).toContain('Test USDC Vault')
      expect(output).toContain('aave-v3')
      expect(output).toContain('Analytics')
    })

    it('calls SDK with correct slug', async () => {
      await runCommand(['vault', '8453-0xbeef0001', '--json'])
      expect(forge.vaults.get).toHaveBeenCalledWith('8453-0xbeef0001')
    })
  })

  // ── portfolio ──

  describe('portfolio', () => {
    it('outputs JSON for portfolio', async () => {
      const output = await runCommand(['portfolio', '0xwallet', '--json'])
      const parsed = JSON.parse(output)
      expect(parsed.positions).toHaveLength(2)
      expect(parsed.positions[0].asset.symbol).toBe('USDC')
    })

    it('outputs table by default', async () => {
      const output = await runCommand(['portfolio', '0xwallet'])
      expect(output).toContain('Portfolio')
      expect(output).toContain('USDC')
    })

    it('calls SDK with wallet address', async () => {
      await runCommand(['portfolio', '0xwallet123', '--json'])
      expect(forge.portfolio.get).toHaveBeenCalledWith('0xwallet123')
    })
  })

  // ── quote ──

  describe('quote', () => {
    it('outputs JSON quote', async () => {
      const output = await runCommand([
        'quote',
        '--vault',
        '8453-0xbeef0001',
        '--amount',
        '10',
        '--wallet',
        '0xwallet',
        '--json',
      ])
      const parsed = JSON.parse(output)
      expect(parsed.vault).toBe('8453-0xbeef0001')
      expect(parsed.humanAmount).toBe('10')
      expect(parsed.rawAmount).toBe('10000000')
      expect(parsed.decimals).toBe(6)
    })

    it('outputs human-readable quote by default', async () => {
      const output = await runCommand([
        'quote',
        '--vault',
        '8453-0xbeef0001',
        '--amount',
        '10',
        '--wallet',
        '0xwallet',
      ])
      expect(output).toContain('Deposit Quote')
      expect(output).toContain('10')
    })

    it('calls SDK with correct parameters', async () => {
      await runCommand([
        'quote',
        '--vault',
        '8453-0xbeef0001',
        '--amount',
        '10',
        '--wallet',
        '0xw',
        '--json',
      ])
      expect(forge.vaults.get).toHaveBeenCalledWith('8453-0xbeef0001')
      expect(forge.buildDepositQuote).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ fromAmount: '10', wallet: '0xw' })
      )
    })

    it('supports --from-token override', async () => {
      await runCommand([
        'quote',
        '--vault',
        '8453-0xbeef0001',
        '--amount',
        '10',
        '--wallet',
        '0xw',
        '--from-token',
        '0xdai',
        '--json',
      ])
      expect(forge.buildDepositQuote).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ fromToken: '0xdai' })
      )
    })

    it('supports --from-chain override', async () => {
      await runCommand([
        'quote',
        '--vault',
        '8453-0xbeef0001',
        '--amount',
        '10',
        '--wallet',
        '0xw',
        '--from-chain',
        '1',
        '--json',
      ])
      expect(forge.buildDepositQuote).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ fromChain: 1 })
      )
    })

    it('calls optimizeGasRoutes with --optimize-gas', async () => {
      const output = await runCommand([
        'quote',
        '--vault',
        '8453-0xbeef0001',
        '--amount',
        '10',
        '--wallet',
        '0xw',
        '--optimize-gas',
        '--json',
      ])
      expect(forge.optimizeGasRoutes).toHaveBeenCalled()
      const parsed = JSON.parse(output)
      expect(Array.isArray(parsed)).toBe(true)
      expect(parsed[0]).toHaveProperty('fromChain')
      expect(parsed[0]).toHaveProperty('totalCostUsd')
    })
  })

  // ── risk ──

  describe('risk', () => {
    it('outputs JSON risk score', async () => {
      const output = await runCommand(['risk', '8453-0xbeef0001', '--json'])
      const parsed = JSON.parse(output)
      expect(parsed.score).toBe(7.8)
      expect(parsed.label).toBe('low')
      expect(parsed.breakdown).toHaveProperty('tvl')
      expect(parsed.breakdown).toHaveProperty('apyStability')
    })

    it('outputs risk table by default', async () => {
      const output = await runCommand(['risk', '8453-0xbeef0001'])
      expect(output).toContain('Risk Score')
      expect(output).toContain('TVL Magnitude')
    })

    it('calls riskScore with vault', async () => {
      await runCommand(['risk', '8453-0xbeef0001', '--json'])
      expect(forge.riskScore).toHaveBeenCalled()
    })
  })

  // ── suggest ──

  describe('suggest', () => {
    it('outputs JSON allocations', async () => {
      const output = await runCommand([
        'suggest',
        '--amount',
        '10000',
        '--asset',
        'USDC',
        '--json',
      ])
      const parsed = JSON.parse(output)
      expect(parsed.totalAmount).toBe(10000)
      expect(parsed.expectedApy).toBe(0.06)
      expect(parsed.allocations).toHaveLength(2)
      expect(parsed.allocations[0]).toHaveProperty('vault')
      expect(parsed.allocations[0]).toHaveProperty('percentage')
    })

    it('outputs table by default', async () => {
      const output = await runCommand([
        'suggest',
        '--amount',
        '10000',
        '--asset',
        'USDC',
      ])
      expect(output).toContain('Allocation Suggestion')
    })

    it('passes params to SDK', async () => {
      await runCommand([
        'suggest',
        '--amount',
        '5000',
        '--asset',
        'WETH',
        '--max-chains',
        '3',
        '--json',
      ])
      expect(forge.suggest).toHaveBeenCalledWith(
        expect.objectContaining({ amount: 5000, asset: 'WETH', maxChains: 3 })
      )
    })

    it('supports strategy preset', async () => {
      await runCommand([
        'suggest',
        '--amount',
        '10000',
        '--asset',
        'USDC',
        '--strategy',
        'conservative',
        '--json',
      ])
      expect(forge.suggest).toHaveBeenCalledWith(
        expect.objectContaining({ strategy: 'conservative' })
      )
    })
  })

  // ── watch ──

  describe('watch', () => {
    it('outputs JSON events', async () => {
      const output = await runCommand([
        'watch',
        '--vault',
        '8453-0xbeef0001',
        '--json',
      ])
      const parsed = JSON.parse(output)
      expect(parsed.type).toBe('update')
      expect(parsed.vault).toBe('8453-0xbeef0001')
      expect(parsed.current).toHaveProperty('apy')
    })

    it('outputs human-readable events by default', async () => {
      const output = await runCommand(['watch', '--vault', '8453-0xbeef0001'])
      expect(output).toContain('UPDATE')
    })

    it('passes threshold options', async () => {
      await runCommand([
        'watch',
        '--vault',
        '8453-0xbeef0001',
        '--apy-drop',
        '10',
        '--tvl-drop',
        '15',
        '--json',
      ])
      expect(forge.watch).toHaveBeenCalledWith(
        '8453-0xbeef0001',
        expect.objectContaining({ apyDropPercent: 10, tvlDropPercent: 15 })
      )
    })
  })

  // ── chains ──

  describe('chains', () => {
    it('outputs JSON chain list', async () => {
      const output = await runCommand(['chains', '--json'])
      const parsed = JSON.parse(output)
      expect(Array.isArray(parsed)).toBe(true)
      expect(parsed).toHaveLength(3)
      expect(parsed[0]).toHaveProperty('chainId')
      expect(parsed[0]).toHaveProperty('name')
    })

    it('outputs chain table by default', async () => {
      const output = await runCommand(['chains'])
      expect(output).toContain('Supported Chains')
      expect(output).toContain('Ethereum')
      expect(output).toContain('Base')
    })
  })

  // ── protocols ──

  describe('protocols', () => {
    it('outputs JSON protocol list', async () => {
      const output = await runCommand(['protocols', '--json'])
      const parsed = JSON.parse(output)
      expect(Array.isArray(parsed)).toBe(true)
      expect(parsed).toHaveLength(3)
      expect(parsed[0]).toHaveProperty('name')
      expect(parsed[0]).toHaveProperty('url')
    })

    it('outputs protocol table by default', async () => {
      const output = await runCommand(['protocols'])
      expect(output).toContain('Supported Protocols')
      expect(output).toContain('aave-v3')
    })
  })

  // ── compare ──

  describe('compare', () => {
    it('outputs JSON array for two vaults', async () => {
      const mockGet = vi.fn().mockImplementation(async (slug: string) => {
        if (slug === '42161-0xbeef0002') return makeVault2()
        return makeVault()
      })
      forge.vaults.get = mockGet

      const output = await runCommand([
        'compare',
        '8453-0xbeef0001',
        '42161-0xbeef0002',
        '--json',
      ])
      const parsed = JSON.parse(output)
      expect(Array.isArray(parsed)).toBe(true)
      expect(parsed).toHaveLength(2)
      expect(parsed[0].slug).toBe('8453-0xbeef0001')
      expect(parsed[1].slug).toBe('42161-0xbeef0002')
    })

    it('fetches each vault by slug', async () => {
      const mockGet = vi.fn().mockImplementation(async (slug: string) => {
        if (slug === '42161-0xbeef0002') return makeVault2()
        return makeVault()
      })
      forge.vaults.get = mockGet

      await runCommand([
        'compare',
        '8453-0xbeef0001',
        '42161-0xbeef0002',
        '--json',
      ])
      expect(mockGet).toHaveBeenCalledTimes(2)
      expect(mockGet).toHaveBeenCalledWith('8453-0xbeef0001')
      expect(mockGet).toHaveBeenCalledWith('42161-0xbeef0002')
    })

    it('computes risk for each vault', async () => {
      const mockGet = vi.fn().mockImplementation(async (slug: string) => {
        if (slug === '42161-0xbeef0002') return makeVault2()
        return makeVault()
      })
      forge.vaults.get = mockGet

      await runCommand([
        'compare',
        '8453-0xbeef0001',
        '42161-0xbeef0002',
        '--json',
      ])
      expect(forge.riskScore).toHaveBeenCalledTimes(2)
    })

    it('outputs comparison table in human format', async () => {
      const mockGet = vi.fn().mockImplementation(async (slug: string) => {
        if (slug === '42161-0xbeef0002') return makeVault2()
        return makeVault()
      })
      forge.vaults.get = mockGet

      const output = await runCommand([
        'compare',
        '8453-0xbeef0001',
        '42161-0xbeef0002',
      ])
      expect(output).toContain('Test USDC Vault')
      expect(output).toContain('Test WETH Vault')
    })

    it('errors when only one slug provided', async () => {
      const output = await runCommand(['compare', '8453-0xbeef0001'])
      expect(output).toContain('at least 2')
    })
  })

  // ── doctor (via command) ──

  describe('doctor', () => {
    it('outputs JSON report for a vault', async () => {
      const output = await runCommand([
        'doctor',
        '--vault',
        '8453-0xbeef0001',
        '--json',
      ])
      const parsed = JSON.parse(output)
      expect(parsed.total).toBe(18)
      expect(parsed.checks).toHaveLength(18)
      expect(parsed.riskScore).toBeDefined()
    })

    it('outputs human-readable report by default', async () => {
      const output = await runCommand(['doctor', '--vault', '8453-0xbeef0001'])
      expect(output).toContain('Doctor')
      expect(output).toContain('Summary')
    })

    it('runs env checks with --env flag', async () => {
      const output = await runCommand(['doctor', '--env', '--json'])
      const parsed = JSON.parse(output)
      expect(parsed.total).toBeGreaterThan(0)
      expect(parsed.checks.length).toBeGreaterThan(0)
    })

    it('errors when neither --vault nor --env is given', async () => {
      const output = await runCommand(['doctor'])
      expect(output).toContain('--vault')
    })
  })
})
