// SPDX-License-Identifier: Apache-2.0

/**
 * Tests for --json flag across all commands.
 * Ensures every command produces valid JSON when --json is passed.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { program, setForge, resetForge } from '../src/index.js';
import type { EarnForge } from '@earnforge/sdk';
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
} from './fixtures.js';

function createMockForge(): EarnForge {
  const vaults = [makeVault(), makeVault2()];
  return {
    vaults: {
      list: vi.fn().mockResolvedValue({ data: vaults, nextCursor: null, total: 2 }),
      listAll: vi.fn().mockImplementation(async function* () {
        for (const v of vaults) yield v;
      }),
      get: vi.fn().mockResolvedValue(makeVault()),
      top: vi.fn().mockResolvedValue(vaults),
    },
    chains: { list: vi.fn().mockResolvedValue(MOCK_CHAINS) },
    protocols: { list: vi.fn().mockResolvedValue(MOCK_PROTOCOLS) },
    portfolio: { get: vi.fn().mockResolvedValue(MOCK_PORTFOLIO) },
    buildDepositQuote: vi.fn().mockResolvedValue(MOCK_QUOTE_RESULT),
    preflight: vi.fn().mockReturnValue({ ok: true, issues: [], vault: makeVault(), wallet: '0x' }),
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
      };
    }),
    getApyHistory: vi.fn().mockResolvedValue([]),
    earnDataClient: {} as any,
    composerClient: null,
  } as EarnForge;
}

let consoleOutput: string[];
let originalLog: typeof console.log;
let originalError: typeof console.error;

function captureConsole(): void {
  consoleOutput = [];
  originalLog = console.log;
  originalError = console.error;
  console.log = (...args: unknown[]) => consoleOutput.push(args.map(String).join(' '));
  console.error = (...args: unknown[]) => consoleOutput.push(args.map(String).join(' '));
}

function restoreConsole(): void {
  console.log = originalLog;
  console.error = originalError;
}

async function runJson(args: string[]): Promise<unknown> {
  captureConsole();
  try {
    program.exitOverride();
    await program.parseAsync(['node', 'earnforge', ...args, '--json']);
  } catch {
    // Commander exitOverride
  }
  restoreConsole();
  const output = consoleOutput.join('\n');
  return JSON.parse(output);
}

describe('--json output produces valid JSON', () => {
  beforeEach(() => {
    setForge(createMockForge());
    process.exitCode = undefined;
  });

  afterEach(() => {
    resetForge();
  });

  it('list --json produces array with slug, apy, tvlUsd', async () => {
    const data = (await runJson(['list'])) as any[];
    expect(Array.isArray(data)).toBe(true);
    expect(data[0].slug).toMatch(/\d+-0x/);
    expect(typeof data[0].apy).toBe('number');
    expect(typeof data[0].tvlUsd).toBe('number');
  });

  it('top --json produces array', async () => {
    const data = (await runJson(['top', '--asset', 'USDC'])) as any[];
    expect(Array.isArray(data)).toBe(true);
  });

  it('vault --json produces object with all fields', async () => {
    const data = (await runJson(['vault', '8453-0xbeef0001'])) as any;
    expect(data.address).toBeDefined();
    expect(data.analytics).toBeDefined();
    expect(data.analytics.apy.total).toBeDefined();
  });

  it('portfolio --json produces positions array', async () => {
    const data = (await runJson(['portfolio', '0xwallet'])) as any;
    expect(data.positions).toHaveLength(2);
  });

  it('risk --json produces score and breakdown', async () => {
    const data = (await runJson(['risk', '8453-0xbeef0001'])) as any;
    expect(data.score).toBe(7.8);
    expect(data.breakdown.tvl).toBe(9);
  });

  it('suggest --json produces allocations', async () => {
    const data = (await runJson(['suggest', '--amount', '10000', '--asset', 'USDC'])) as any;
    expect(data.allocations.length).toBeGreaterThan(0);
    expect(data.totalAmount).toBe(10000);
  });

  it('chains --json produces array with chainId and name', async () => {
    const data = (await runJson(['chains'])) as any[];
    expect(data[0].chainId).toBe(1);
    expect(data[0].name).toBe('Ethereum');
  });

  it('protocols --json produces array with name and url', async () => {
    const data = (await runJson(['protocols'])) as any[];
    expect(data[0].name).toBe('aave-v3');
    expect(data[0].url).toContain('http');
  });

  it('doctor --json produces report with checks array', async () => {
    const data = (await runJson(['doctor', '--vault', '8453-0xbeef0001'])) as any;
    expect(data.total).toBe(18);
    expect(data.checks).toHaveLength(18);
    expect(data.riskScore).toBeDefined();
  });

  it('doctor --env --json produces env report', async () => {
    const data = (await runJson(['doctor', '--env'])) as any;
    expect(data.total).toBeGreaterThan(0);
    expect(data.checks.length).toBeGreaterThan(0);
  });

  it('quote --json produces quote details', async () => {
    const data = (await runJson([
      'quote', '--vault', '8453-0xbeef0001', '--amount', '10', '--wallet', '0xw',
    ])) as any;
    expect(data.vault).toBe('8453-0xbeef0001');
    expect(data.humanAmount).toBe('10');
  });

  it('quote --optimize-gas --json produces routes array', async () => {
    const data = (await runJson([
      'quote', '--vault', '8453-0xbeef0001', '--amount', '10', '--wallet', '0xw', '--optimize-gas',
    ])) as any[];
    expect(Array.isArray(data)).toBe(true);
    expect(data[0].fromChain).toBeDefined();
    expect(data[0].totalCostUsd).toBeDefined();
  });
});
