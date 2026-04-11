// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock grammy before any import ──

const mockReply = vi.fn().mockResolvedValue(undefined);

const registeredHandlers = new Map<string, (...args: unknown[]) => Promise<void>>();

const mockCommand = vi.fn((name: string, handler: (ctx: unknown) => Promise<void>) => {
  registeredHandlers.set(name, handler as (...args: unknown[]) => Promise<void>);
});

const mockStart = vi.fn();

vi.mock('grammy', () => {
  function MockBot() {
    return { command: mockCommand, start: mockStart };
  }
  return { Bot: MockBot, Context: vi.fn() };
});

// ── Test fixture vault ──

function makeVault(overrides: Record<string, unknown> = {}) {
  return {
    address: '0xbeef0e0834849acc03f0089f01f4f1eeb06873c9',
    chainId: 8453,
    name: 'STEAKUSDC',
    slug: '8453-0xbeef0e0834849acc03f0089f01f4f1eeb06873c9',
    network: 'Base',
    protocol: { name: 'morpho-v1', url: 'https://app.morpho.org' },
    provider: 'DEFILLAMA_PRO',
    syncedAt: '2026-04-11T08:12:09.113Z',
    tags: ['stablecoin', 'single'],
    underlyingTokens: [
      { symbol: 'USDC', address: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', decimals: 6 },
    ],
    lpTokens: [],
    analytics: {
      apy: { base: 3.84705, total: 3.84705, reward: 0 },
      tvl: { usd: '33833688' },
      apy1d: 4.18039,
      apy7d: 3.72156,
      apy30d: 3.80036,
      updatedAt: '2026-04-11T07:01:41.187Z',
    },
    isRedeemable: true,
    isTransactional: true,
    depositPacks: [{ name: 'morpho-zaps', stepsType: 'instant' }],
    redeemPacks: [{ name: 'morpho-zaps', stepsType: 'instant' }],
    ...overrides,
  };
}

function makeVault2() {
  return makeVault({
    name: 'Aave USDC',
    slug: '1-0xaave',
    chainId: 1,
    network: 'Ethereum',
    protocol: { name: 'aave-v3', url: 'https://app.aave.com' },
    analytics: {
      apy: { base: 5.2, total: 5.2, reward: 0 },
      tvl: { usd: '150000000' },
      apy1d: 5.1,
      apy7d: 5.15,
      apy30d: 5.18,
      updatedAt: '2026-04-11T07:01:41.187Z',
    },
  });
}

// ── Mock forge ──

function createMockForge() {
  const vault = makeVault();
  const vault2 = makeVault2();
  return {
    vaults: {
      list: vi.fn().mockResolvedValue({ data: [vault, vault2], nextCursor: null, total: 2 }),
      listAll: vi.fn(),
      get: vi.fn().mockResolvedValue(vault),
      top: vi.fn().mockResolvedValue([vault, vault2]),
    },
    chains: { list: vi.fn().mockResolvedValue([]) },
    protocols: { list: vi.fn().mockResolvedValue([]) },
    portfolio: { get: vi.fn().mockResolvedValue({ positions: [] }) },
    buildDepositQuote: vi.fn(),
    preflight: vi.fn().mockReturnValue({
      ok: true,
      issues: [],
      vault,
      wallet: '0x0000000000000000000000000000000000000000',
    }),
    riskScore: vi.fn().mockReturnValue({
      score: 7.8,
      breakdown: { tvl: 8, apyStability: 8, protocol: 9, redeemability: 10, assetType: 9 },
      label: 'low' as const,
    }),
    suggest: vi.fn().mockResolvedValue({
      totalAmount: 10000,
      expectedApy: 4.52,
      allocations: [
        {
          vault,
          risk: {
            score: 7.8,
            breakdown: { tvl: 8, apyStability: 8, protocol: 9, redeemability: 10, assetType: 9 },
            label: 'low' as const,
          },
          percentage: 60.0,
          amount: 6000,
          apy: 3.85,
        },
        {
          vault: vault2,
          risk: {
            score: 8.5,
            breakdown: { tvl: 10, apyStability: 9, protocol: 9, redeemability: 10, assetType: 9 },
            label: 'low' as const,
          },
          percentage: 40.0,
          amount: 4000,
          apy: 5.2,
        },
      ],
    }),
    optimizeGasRoutes: vi.fn(),
    watch: vi.fn(),
    getApyHistory: vi.fn(),
    earnDataClient: {},
    composerClient: null,
  };
}

// ── Import bot creation ──

import { createBot } from '../src/index.js';

// ── Helpers ──

function makeCtx(text: string) {
  return {
    message: { text },
    reply: mockReply,
  };
}

async function runCommand(name: string, text: string) {
  const handler = registeredHandlers.get(name);
  if (!handler) throw new Error(`No handler registered for /${name}`);
  const ctx = makeCtx(text);
  await handler(ctx);
  return mockReply;
}

// ── Tests ──

describe('EarnForge Telegram Bot', () => {
  let forge: ReturnType<typeof createMockForge>;

  beforeEach(() => {
    vi.clearAllMocks();
    registeredHandlers.clear();
    forge = createMockForge();
    // Cast forge as EarnForge — the mock matches the interface well enough
    createBot('test-token', forge as never);
  });

  it('registers all 6 commands', () => {
    expect(registeredHandlers.has('start')).toBe(true);
    expect(registeredHandlers.has('yield')).toBe(true);
    expect(registeredHandlers.has('top')).toBe(true);
    expect(registeredHandlers.has('risk')).toBe(true);
    expect(registeredHandlers.has('suggest')).toBe(true);
    expect(registeredHandlers.has('doctor')).toBe(true);
  });

  describe('/start', () => {
    it('sends a welcome message with command list', async () => {
      await runCommand('start', '/start');
      expect(mockReply).toHaveBeenCalledOnce();
      const text = mockReply.mock.calls[0][0] as string;
      expect(text).toContain('Welcome to EarnForge Bot');
      expect(text).toContain('/yield');
      expect(text).toContain('/top');
      expect(text).toContain('/risk');
      expect(text).toContain('/suggest');
      expect(text).toContain('/doctor');
    });

    it('uses MarkdownV2 parse mode', async () => {
      await runCommand('start', '/start');
      const opts = mockReply.mock.calls[0][1] as Record<string, string>;
      expect(opts.parse_mode).toBe('MarkdownV2');
    });
  });

  describe('/yield', () => {
    it('shows usage when no asset provided', async () => {
      await runCommand('yield', '/yield');
      const text = mockReply.mock.calls[0][0] as string;
      expect(text).toContain('Usage');
    });

    it('returns top vaults for USDC', async () => {
      await runCommand('yield', '/yield USDC');
      expect(forge.vaults.top).toHaveBeenCalledWith({ asset: 'USDC', limit: 5 });
      const text = mockReply.mock.calls[0][0] as string;
      expect(text).toContain('STEAKUSDC');
      expect(text).toContain('Aave USDC');
    });

    it('displays risk score emoji indicators', async () => {
      await runCommand('yield', '/yield USDC');
      const text = mockReply.mock.calls[0][0] as string;
      // low risk = green circle
      expect(text).toContain('\u{1F7E2}');
      expect(text).toContain('7.8/10');
    });

    it('handles empty results', async () => {
      forge.vaults.top.mockResolvedValueOnce([]);
      await runCommand('yield', '/yield XYZ');
      const text = mockReply.mock.calls[0][0] as string;
      expect(text).toContain('No vaults found');
    });

    it('handles API errors gracefully', async () => {
      forge.vaults.top.mockRejectedValueOnce(new Error('API timeout'));
      await runCommand('yield', '/yield USDC');
      const text = mockReply.mock.calls[0][0] as string;
      expect(text).toContain('Error');
    });
  });

  describe('/top', () => {
    it('shows usage when no chain provided', async () => {
      await runCommand('top', '/top');
      const text = mockReply.mock.calls[0][0] as string;
      expect(text).toContain('Usage');
    });

    it('maps chain name to chainId and fetches vaults', async () => {
      await runCommand('top', '/top base');
      expect(forge.vaults.top).toHaveBeenCalledWith({ chainId: 8453, limit: 5 });
    });

    it('rejects unknown chain names', async () => {
      await runCommand('top', '/top foochain');
      const text = mockReply.mock.calls[0][0] as string;
      expect(text).toContain('Unknown chain');
      expect(text).toContain('Supported');
    });

    it('is case insensitive for chain names', async () => {
      await runCommand('top', '/top Arbitrum');
      expect(forge.vaults.top).toHaveBeenCalledWith({ chainId: 42161, limit: 5 });
    });
  });

  describe('/risk', () => {
    it('shows usage when no slug provided', async () => {
      await runCommand('risk', '/risk');
      const text = mockReply.mock.calls[0][0] as string;
      expect(text).toContain('Usage');
    });

    it('displays full risk breakdown', async () => {
      await runCommand('risk', '/risk 8453-0xbeef0e0834849acc03f0089f01f4f1eeb06873c9');
      expect(forge.vaults.get).toHaveBeenCalledWith('8453-0xbeef0e0834849acc03f0089f01f4f1eeb06873c9');
      const text = mockReply.mock.calls[0][0] as string;
      expect(text).toContain('Risk Score for');
      expect(text).toContain('TVL Magnitude');
      expect(text).toContain('APY Stability');
      expect(text).toContain('Protocol Maturity');
      expect(text).toContain('Redeemability');
      expect(text).toContain('Asset Type');
    });

    it('includes risk label and emoji', async () => {
      await runCommand('risk', '/risk 8453-0xbeef');
      const text = mockReply.mock.calls[0][0] as string;
      expect(text).toContain('\u{1F7E2}');
      expect(text).toContain('7.8/10');
      expect(text).toContain('low');
    });
  });

  describe('/suggest', () => {
    it('shows usage when args missing', async () => {
      await runCommand('suggest', '/suggest');
      const text = mockReply.mock.calls[0][0] as string;
      expect(text).toContain('Usage');
    });

    it('shows usage when only amount given', async () => {
      await runCommand('suggest', '/suggest 10000');
      const text = mockReply.mock.calls[0][0] as string;
      expect(text).toContain('Usage');
    });

    it('rejects non-numeric amount', async () => {
      await runCommand('suggest', '/suggest abc USDC');
      const text = mockReply.mock.calls[0][0] as string;
      expect(text).toContain('positive number');
    });

    it('returns portfolio allocation with expected APY', async () => {
      await runCommand('suggest', '/suggest 10000 USDC');
      expect(forge.suggest).toHaveBeenCalledWith({ amount: 10000, asset: 'USDC', maxVaults: 5 });
      const text = mockReply.mock.calls[0][0] as string;
      expect(text).toContain('Portfolio Suggestion');
      expect(text).toContain('Expected APY');
      expect(text).toContain('STEAKUSDC');
      expect(text).toContain('60.0%');
      expect(text).toContain('$6000.00');
    });
  });

  describe('/doctor', () => {
    it('shows usage when no slug provided', async () => {
      await runCommand('doctor', '/doctor');
      const text = mockReply.mock.calls[0][0] as string;
      expect(text).toContain('Usage');
    });

    it('shows all-clear when no issues', async () => {
      await runCommand('doctor', '/doctor 8453-0xbeef');
      const text = mockReply.mock.calls[0][0] as string;
      expect(text).toContain('All checks passed');
    });

    it('shows issues when preflight fails', async () => {
      forge.preflight.mockReturnValueOnce({
        ok: false,
        issues: [
          { code: 'NOT_TRANSACTIONAL', message: 'Vault is not transactional', severity: 'error' },
          { code: 'NOT_REDEEMABLE', message: 'Vault is not redeemable', severity: 'warning' },
        ],
        vault: makeVault(),
        wallet: '0x0000000000000000000000000000000000000000',
      });
      await runCommand('doctor', '/doctor some-slug');
      const text = mockReply.mock.calls[0][0] as string;
      expect(text).toContain('Issues found');
      expect(text).toContain('NOT_TRANSACTIONAL');
      expect(text).toContain('NOT_REDEEMABLE');
      // Red for error, yellow for warning
      expect(text).toContain('\u{1F534}');
      expect(text).toContain('\u{1F7E1}');
    });

    it('handles vault not found gracefully', async () => {
      forge.vaults.get.mockRejectedValueOnce(new Error('Vault not found'));
      await runCommand('doctor', '/doctor nonexistent-slug');
      const text = mockReply.mock.calls[0][0] as string;
      expect(text).toContain('Error');
    });
  });
});
