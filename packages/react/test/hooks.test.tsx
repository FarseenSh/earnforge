// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createElement, type ReactNode } from 'react';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { EarnForge, Vault, VaultListResponse, PortfolioResponse, RiskScore, StrategyConfig, SuggestResult, ApyDataPoint, PreflightReport, DepositQuoteResult, RedeemQuoteResult } from '@earnforge/sdk';
import { EarnForgeProvider, useEarnForge } from '../src/context.js';
import { useVaults } from '../src/hooks/useVaults.js';
import { useVault } from '../src/hooks/useVault.js';
import { useEarnTopYield } from '../src/hooks/useEarnTopYield.js';
import { usePortfolio } from '../src/hooks/usePortfolio.js';
import { useRiskScore } from '../src/hooks/useRiskScore.js';
import { useStrategy } from '../src/hooks/useStrategy.js';
import { useSuggest } from '../src/hooks/useSuggest.js';
import { useApyHistory } from '../src/hooks/useApyHistory.js';
import { useEarnDeposit } from '../src/hooks/useEarnDeposit.js';
import { useEarnRedeem } from '../src/hooks/useEarnRedeem.js';

// ── Test fixtures ──

function makeVault(overrides: Partial<Vault> = {}): Vault {
  return {
    address: '0xVAULT',
    chainId: 8453,
    name: 'Test USDC Vault',
    slug: 'test-usdc-vault',
    network: 'base',
    protocol: { name: 'aave-v3', url: 'https://aave.com' },
    provider: 'lifi',
    syncedAt: '2026-04-11T00:00:00Z',
    tags: ['stablecoin'],
    underlyingTokens: [
      { symbol: 'USDC', address: '0xUSDC', decimals: 6 },
    ],
    lpTokens: [],
    analytics: {
      apy: { base: 0.04, total: 0.05, reward: 0.01 },
      tvl: { usd: '50000000' },
      apy1d: 0.048,
      apy7d: 0.049,
      apy30d: 0.051,
      updatedAt: '2026-04-11T00:00:00Z',
    },
    isTransactional: true,
    isRedeemable: true,
    depositPacks: [{ name: 'default', stepsType: 'single' }],
    redeemPacks: [{ name: 'default', stepsType: 'single' }],
    ...overrides,
  } as Vault;
}

function makeVaultListResponse(vaults: Vault[], nextCursor: string | null = null): VaultListResponse {
  return { data: vaults, nextCursor, total: vaults.length };
}

// ── Mock SDK factory ──

function createMockSdk(overrides: Partial<EarnForge> = {}): EarnForge {
  return {
    vaults: {
      list: vi.fn<() => Promise<VaultListResponse>>().mockResolvedValue(makeVaultListResponse([makeVault()])),
      listAll: vi.fn(),
      get: vi.fn<() => Promise<Vault>>().mockResolvedValue(makeVault()),
      top: vi.fn<() => Promise<Vault[]>>().mockResolvedValue([makeVault()]),
    },
    chains: { list: vi.fn().mockResolvedValue([]) },
    protocols: { list: vi.fn().mockResolvedValue([]) },
    portfolio: {
      get: vi.fn<() => Promise<PortfolioResponse>>().mockResolvedValue({ positions: [] }),
    },
    buildDepositQuote: vi.fn<() => Promise<DepositQuoteResult>>().mockResolvedValue({
      quote: {
        type: 'lifi',
        id: 'q1',
        tool: 'aave',
        action: {
          fromToken: { address: '0xUSDC', chainId: 8453, symbol: 'USDC', decimals: 6, name: 'USD Coin' },
          fromAmount: '100000000',
          toToken: { address: '0xVAULT', chainId: 8453, symbol: 'aUSDC', decimals: 6, name: 'Aave USDC' },
          fromChainId: 8453,
          toChainId: 8453,
          slippage: 0.005,
          fromAddress: '0xWALLET',
          toAddress: '0xWALLET',
        },
        estimate: {
          tool: 'aave',
          toAmountMin: '99500000',
          toAmount: '100000000',
          fromAmount: '100000000',
          executionDuration: 30,
        },
        transactionRequest: {
          to: '0xROUTER',
          data: '0xDATA',
          value: '0',
          chainId: 8453,
        },
      },
      vault: makeVault(),
      humanAmount: '100',
      rawAmount: '100000000',
      decimals: 6,
    } as unknown as DepositQuoteResult),
    buildRedeemQuote: vi.fn<() => Promise<RedeemQuoteResult>>().mockResolvedValue({
      quote: {
        type: 'lifi',
        id: 'rq1',
        tool: 'aave',
        action: {
          fromToken: { address: '0xVAULT', chainId: 8453, symbol: 'aUSDC', decimals: 6, name: 'Aave USDC' },
          fromAmount: '100000000',
          toToken: { address: '0xUSDC', chainId: 8453, symbol: 'USDC', decimals: 6, name: 'USD Coin' },
          fromChainId: 8453,
          toChainId: 8453,
          slippage: 0.005,
          fromAddress: '0xWALLET',
          toAddress: '0xWALLET',
        },
        estimate: {
          tool: 'aave',
          toAmountMin: '99500000',
          toAmount: '100000000',
          fromAmount: '100000000',
          executionDuration: 30,
        },
        transactionRequest: {
          to: '0xROUTER',
          data: '0xDATA',
          value: '0',
          chainId: 8453,
        },
      },
      vault: makeVault(),
      humanAmount: '100',
      rawAmount: '100000000',
      decimals: 6,
    } as unknown as RedeemQuoteResult),
    preflight: vi.fn<() => PreflightReport>().mockReturnValue({
      ok: true,
      issues: [],
      vault: makeVault(),
      wallet: '0xWALLET',
    }),
    riskScore: vi.fn<() => RiskScore>().mockReturnValue({
      score: 8.2,
      breakdown: { tvl: 9, apyStability: 8, protocol: 9, redeemability: 10, assetType: 9 },
      label: 'low',
    }),
    suggest: vi.fn<() => Promise<SuggestResult>>().mockResolvedValue({
      totalAmount: 10000,
      expectedApy: 0.05,
      allocations: [],
    }),
    optimizeGasRoutes: vi.fn().mockResolvedValue([]),
    watch: vi.fn(),
    getApyHistory: vi.fn<() => Promise<ApyDataPoint[]>>().mockResolvedValue([
      { timestamp: '2026-04-01', apy: 0.05, tvlUsd: 50000000 },
      { timestamp: '2026-04-02', apy: 0.051, tvlUsd: 50100000 },
    ]),
    earnDataClient: {} as EarnForge['earnDataClient'],
    composerClient: null,
    ...overrides,
  } as unknown as EarnForge;
}

// ── Test wrapper ──

function createWrapper(sdk: EarnForge) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
    },
  });

  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(
      QueryClientProvider,
      { client: queryClient },
      createElement(EarnForgeProvider, { sdk }, children),
    );
  };
}

// ═══════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════

describe('EarnForgeProvider / useEarnForge', () => {
  it('1. throws when used outside provider', () => {
    const queryClient = new QueryClient();
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client: queryClient }, children);

    expect(() => renderHook(() => useEarnForge(), { wrapper })).toThrow(
      /useEarnForge must be used within an <EarnForgeProvider>/,
    );
  });

  it('2. provides SDK instance to children', () => {
    const sdk = createMockSdk();
    const wrapper = createWrapper(sdk);
    const { result } = renderHook(() => useEarnForge(), { wrapper });
    expect(result.current).toBe(sdk);
  });
});

describe('useVaults', () => {
  it('3. returns loading state initially', () => {
    const sdk = createMockSdk();
    (sdk.vaults.list as ReturnType<typeof vi.fn>).mockReturnValue(new Promise(() => {})); // never resolves
    const wrapper = createWrapper(sdk);
    const { result } = renderHook(() => useVaults(), { wrapper });
    expect(result.current.isLoading).toBe(true);
    expect(result.current.data).toBeUndefined();
  });

  it('4. returns vault data on success', async () => {
    const sdk = createMockSdk();
    const wrapper = createWrapper(sdk);
    const { result } = renderHook(() => useVaults(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.data).toHaveLength(1);
    expect(result.current.data![0].slug).toBe('test-usdc-vault');
    expect(result.current.error).toBeNull();
  });

  it('5. returns error on failure', async () => {
    const sdk = createMockSdk();
    (sdk.vaults.list as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Network down'));
    const wrapper = createWrapper(sdk);
    const { result } = renderHook(() => useVaults(), { wrapper });

    await waitFor(() => expect(result.current.error).not.toBeNull());

    expect(result.current.error!.message).toBe('Network down');
    expect(result.current.data).toBeUndefined();
  });

  it('6. passes filter params to SDK', async () => {
    const sdk = createMockSdk();
    const wrapper = createWrapper(sdk);
    renderHook(
      () => useVaults({ chainId: 8453, asset: 'USDC', minTvl: 1000000 }),
      { wrapper },
    );

    await waitFor(() =>
      expect(sdk.vaults.list).toHaveBeenCalledWith(
        expect.objectContaining({
          chainId: 8453,
          asset: 'USDC',
          minTvl: 1000000,
        }),
      ),
    );
  });

  it('7. exposes hasMore and fetchMore', async () => {
    const sdk = createMockSdk();
    const wrapper = createWrapper(sdk);
    const { result } = renderHook(() => useVaults(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // Default mock has nextCursor = null
    expect(result.current.hasMore).toBe(false);
    expect(typeof result.current.fetchMore).toBe('function');
  });
});

describe('useVault', () => {
  it('8. returns loading then vault data', async () => {
    const sdk = createMockSdk();
    const wrapper = createWrapper(sdk);
    const { result } = renderHook(() => useVault('test-usdc-vault'), { wrapper });

    expect(result.current.isLoading).toBe(true);

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.data!.slug).toBe('test-usdc-vault');
    expect(sdk.vaults.get).toHaveBeenCalledWith('test-usdc-vault');
  });

  it('9. does not fetch when slug is undefined', () => {
    const sdk = createMockSdk();
    const wrapper = createWrapper(sdk);
    const { result } = renderHook(() => useVault(undefined), { wrapper });

    expect(result.current.isLoading).toBe(false);
    expect(sdk.vaults.get).not.toHaveBeenCalled();
  });

  it('10. returns error on vault fetch failure', async () => {
    const sdk = createMockSdk();
    (sdk.vaults.get as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Not found'));
    const wrapper = createWrapper(sdk);
    const { result } = renderHook(() => useVault('bad-slug'), { wrapper });

    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.error!.message).toBe('Not found');
  });
});

describe('useEarnTopYield', () => {
  it('11. returns top vaults', async () => {
    const topVaults = [makeVault({ slug: 'top-1' }), makeVault({ slug: 'top-2' })];
    const sdk = createMockSdk();
    (sdk.vaults.top as ReturnType<typeof vi.fn>).mockResolvedValue(topVaults);
    const wrapper = createWrapper(sdk);
    const { result } = renderHook(
      () => useEarnTopYield({ asset: 'USDC', limit: 5 }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.data).toHaveLength(2);
    expect(result.current.data![0].slug).toBe('top-1');
  });

  it('12. passes params to SDK', async () => {
    const sdk = createMockSdk();
    const wrapper = createWrapper(sdk);
    renderHook(
      () => useEarnTopYield({ chainId: 42161, limit: 3, strategy: 'conservative' }),
      { wrapper },
    );

    await waitFor(() =>
      expect(sdk.vaults.top).toHaveBeenCalledWith(
        expect.objectContaining({
          chainId: 42161,
          limit: 3,
          strategy: 'conservative',
        }),
      ),
    );
  });

  it('13. handles error state', async () => {
    const sdk = createMockSdk();
    (sdk.vaults.top as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('API error'));
    const wrapper = createWrapper(sdk);
    const { result } = renderHook(() => useEarnTopYield(), { wrapper });

    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.error!.message).toBe('API error');
  });
});

describe('usePortfolio', () => {
  it('14. fetches portfolio for a wallet', async () => {
    const sdk = createMockSdk();
    (sdk.portfolio.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      positions: [
        { chainId: 8453, protocolName: 'aave', asset: { address: '0x1', name: 'USDC', symbol: 'USDC', decimals: 6 }, balanceUsd: '1000', balanceNative: '1000' },
      ],
    });
    const wrapper = createWrapper(sdk);
    const { result } = renderHook(() => usePortfolio('0xWALLET'), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.data!.positions).toHaveLength(1);
    expect(sdk.portfolio.get).toHaveBeenCalledWith('0xWALLET');
  });

  it('15. does not fetch when wallet is undefined', () => {
    const sdk = createMockSdk();
    const wrapper = createWrapper(sdk);
    const { result } = renderHook(() => usePortfolio(undefined), { wrapper });

    expect(result.current.isLoading).toBe(false);
    expect(sdk.portfolio.get).not.toHaveBeenCalled();
  });

  it('16. handles portfolio error', async () => {
    const sdk = createMockSdk();
    (sdk.portfolio.get as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Unauthorized'));
    const wrapper = createWrapper(sdk);
    const { result } = renderHook(() => usePortfolio('0xBAD'), { wrapper });

    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.error!.message).toBe('Unauthorized');
  });
});

describe('useRiskScore', () => {
  it('17. computes risk score from vault', () => {
    const sdk = createMockSdk();
    const wrapper = createWrapper(sdk);
    const vault = makeVault();
    const { result } = renderHook(() => useRiskScore(vault), { wrapper });

    expect(result.current.data).toBeDefined();
    expect(result.current.data!.score).toBe(8.2);
    expect(result.current.data!.label).toBe('low');
    expect(sdk.riskScore).toHaveBeenCalledWith(vault);
  });

  it('18. returns undefined when vault is undefined', () => {
    const sdk = createMockSdk();
    const wrapper = createWrapper(sdk);
    const { result } = renderHook(() => useRiskScore(undefined), { wrapper });

    expect(result.current.data).toBeUndefined();
    expect(sdk.riskScore).not.toHaveBeenCalled();
  });
});

describe('useStrategy', () => {
  it('19. returns strategy config for a preset', () => {
    const sdk = createMockSdk();
    const wrapper = createWrapper(sdk);
    const { result } = renderHook(() => useStrategy('conservative'), { wrapper });

    expect(result.current.data).toBeDefined();
    expect(result.current.data!.name).toBe('conservative');
    expect(result.current.filters).toBeDefined();
    expect(result.current.sort).toBe('apy');
    expect(result.current.sortDirection).toBe('desc');
  });

  it('20. returns undefined for undefined preset', () => {
    const sdk = createMockSdk();
    const wrapper = createWrapper(sdk);
    const { result } = renderHook(() => useStrategy(undefined), { wrapper });

    expect(result.current.data).toBeUndefined();
    expect(result.current.filters).toBeUndefined();
  });
});

describe('useSuggest', () => {
  it('21. returns allocation suggestion', async () => {
    const sdk = createMockSdk();
    const wrapper = createWrapper(sdk);
    const { result } = renderHook(
      () => useSuggest({ amount: 10000, asset: 'USDC' }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.data).toBeDefined();
    expect(result.current.data!.totalAmount).toBe(10000);
    expect(sdk.suggest).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 10000, asset: 'USDC' }),
    );
  });

  it('22. does not fetch when params are undefined', () => {
    const sdk = createMockSdk();
    const wrapper = createWrapper(sdk);
    const { result } = renderHook(() => useSuggest(undefined), { wrapper });

    expect(result.current.isLoading).toBe(false);
    expect(sdk.suggest).not.toHaveBeenCalled();
  });

  it('23. does not fetch when amount is 0', () => {
    const sdk = createMockSdk();
    const wrapper = createWrapper(sdk);
    const { result } = renderHook(
      () => useSuggest({ amount: 0 }),
      { wrapper },
    );

    expect(result.current.isLoading).toBe(false);
    expect(sdk.suggest).not.toHaveBeenCalled();
  });
});

describe('useApyHistory', () => {
  it('24. fetches APY history', async () => {
    const sdk = createMockSdk();
    const wrapper = createWrapper(sdk);
    const { result } = renderHook(
      () => useApyHistory('0xVAULT', 8453),
      { wrapper },
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.data).toHaveLength(2);
    expect(result.current.data![0].apy).toBe(0.05);
    expect(sdk.getApyHistory).toHaveBeenCalledWith('0xVAULT', 8453);
  });

  it('25. does not fetch when address is undefined', () => {
    const sdk = createMockSdk();
    const wrapper = createWrapper(sdk);
    const { result } = renderHook(
      () => useApyHistory(undefined, 8453),
      { wrapper },
    );

    expect(result.current.isLoading).toBe(false);
    expect(sdk.getApyHistory).not.toHaveBeenCalled();
  });

  it('26. does not fetch when chainId is undefined', () => {
    const sdk = createMockSdk();
    const wrapper = createWrapper(sdk);
    const { result } = renderHook(
      () => useApyHistory('0xVAULT', undefined),
      { wrapper },
    );

    expect(result.current.isLoading).toBe(false);
    expect(sdk.getApyHistory).not.toHaveBeenCalled();
  });
});

describe('useEarnDeposit', () => {
  let sdk: EarnForge;
  let wrapper: ReturnType<typeof createWrapper>;

  beforeEach(() => {
    sdk = createMockSdk();
    wrapper = createWrapper(sdk);
  });

  it('27. starts in idle phase', () => {
    const { result } = renderHook(
      () =>
        useEarnDeposit({
          vault: makeVault(),
          amount: '100',
          wallet: '0xWALLET',
        }),
      { wrapper },
    );

    expect(result.current.state.phase).toBe('idle');
    expect(result.current.state.quote).toBeNull();
    expect(result.current.state.preflightReport).toBeNull();
    expect(result.current.state.txHash).toBeNull();
    expect(result.current.state.error).toBeNull();
  });

  it('28. prepare() transitions through preflight -> quoting -> ready', async () => {
    const { result } = renderHook(
      () =>
        useEarnDeposit({
          vault: makeVault(),
          amount: '100',
          wallet: '0xWALLET',
        }),
      { wrapper },
    );

    await act(async () => {
      await result.current.prepare();
    });

    expect(result.current.state.phase).toBe('ready');
    expect(result.current.state.preflightReport).not.toBeNull();
    expect(result.current.state.preflightReport!.ok).toBe(true);
    expect(result.current.state.quote).not.toBeNull();
    expect(result.current.state.quote!.humanAmount).toBe('100');
    expect(sdk.preflight).toHaveBeenCalled();
    expect(sdk.buildDepositQuote).toHaveBeenCalled();
  });

  it('29. prepare() goes to error when preflight fails', async () => {
    (sdk.preflight as ReturnType<typeof vi.fn>).mockReturnValue({
      ok: false,
      issues: [{ code: 'NOT_TRANSACTIONAL', message: 'Not transactional', severity: 'error' }],
      vault: makeVault(),
      wallet: '0xWALLET',
    });

    const { result } = renderHook(
      () =>
        useEarnDeposit({
          vault: makeVault(),
          amount: '100',
          wallet: '0xWALLET',
        }),
      { wrapper },
    );

    await act(async () => {
      await result.current.prepare();
    });

    expect(result.current.state.phase).toBe('error');
    expect(result.current.state.error!.message).toContain('Preflight failed');
    expect(sdk.buildDepositQuote).not.toHaveBeenCalled();
  });

  it('30. prepare() goes to error when quoting fails', async () => {
    (sdk.buildDepositQuote as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('Composer error'),
    );

    const { result } = renderHook(
      () =>
        useEarnDeposit({
          vault: makeVault(),
          amount: '100',
          wallet: '0xWALLET',
        }),
      { wrapper },
    );

    await act(async () => {
      await result.current.prepare();
    });

    expect(result.current.state.phase).toBe('error');
    expect(result.current.state.error!.message).toBe('Composer error');
  });

  it('31. execute() sends transaction and reaches success', async () => {
    const mockSendTx = vi.fn().mockResolvedValue('0xTXHASH');

    const { result } = renderHook(
      () =>
        useEarnDeposit({
          vault: makeVault(),
          amount: '100',
          wallet: '0xWALLET',
          sendTransactionAsync: mockSendTx,
        }),
      { wrapper },
    );

    // First prepare
    await act(async () => {
      await result.current.prepare();
    });
    expect(result.current.state.phase).toBe('ready');

    // Then execute
    await act(async () => {
      await result.current.execute();
    });
    expect(result.current.state.phase).toBe('success');
    expect(result.current.state.txHash).toBe('0xTXHASH');
    expect(mockSendTx).toHaveBeenCalledWith(
      expect.objectContaining({
        to: '0xROUTER',
        data: '0xDATA',
        chainId: 8453,
      }),
    );
  });

  it('32. execute() errors without sendTransactionAsync', async () => {
    const { result } = renderHook(
      () =>
        useEarnDeposit({
          vault: makeVault(),
          amount: '100',
          wallet: '0xWALLET',
          // no sendTransactionAsync
        }),
      { wrapper },
    );

    await act(async () => {
      await result.current.prepare();
    });

    await act(async () => {
      await result.current.execute();
    });

    expect(result.current.state.phase).toBe('error');
    expect(result.current.state.error!.message).toContain('No sendTransactionAsync');
  });

  it('33. execute() errors when not in ready state', async () => {
    const { result } = renderHook(
      () =>
        useEarnDeposit({
          vault: makeVault(),
          amount: '100',
          wallet: '0xWALLET',
          sendTransactionAsync: vi.fn(),
        }),
      { wrapper },
    );

    // Try execute without prepare
    await act(async () => {
      await result.current.execute();
    });

    expect(result.current.state.phase).toBe('error');
    expect(result.current.state.error!.message).toContain('not in ready state');
  });

  it('34. execute() handles transaction rejection', async () => {
    const mockSendTx = vi.fn().mockRejectedValue(new Error('User rejected'));

    const { result } = renderHook(
      () =>
        useEarnDeposit({
          vault: makeVault(),
          amount: '100',
          wallet: '0xWALLET',
          sendTransactionAsync: mockSendTx,
        }),
      { wrapper },
    );

    await act(async () => {
      await result.current.prepare();
    });

    await act(async () => {
      await result.current.execute();
    });

    expect(result.current.state.phase).toBe('error');
    expect(result.current.state.error!.message).toBe('User rejected');
  });

  it('35. reset() returns to idle state', async () => {
    const { result } = renderHook(
      () =>
        useEarnDeposit({
          vault: makeVault(),
          amount: '100',
          wallet: '0xWALLET',
        }),
      { wrapper },
    );

    await act(async () => {
      await result.current.prepare();
    });
    expect(result.current.state.phase).toBe('ready');

    act(() => {
      result.current.reset();
    });

    expect(result.current.state.phase).toBe('idle');
    expect(result.current.state.quote).toBeNull();
    expect(result.current.state.preflightReport).toBeNull();
  });

  it('36. prepare() errors when vault is undefined', async () => {
    const { result } = renderHook(
      () =>
        useEarnDeposit({
          vault: undefined,
          amount: '100',
          wallet: '0xWALLET',
        }),
      { wrapper },
    );

    await act(async () => {
      await result.current.prepare();
    });

    expect(result.current.state.phase).toBe('error');
    expect(result.current.state.error!.message).toContain('Missing vault');
  });
});

describe('useEarnRedeem', () => {
  let sdk: EarnForge;
  let wrapper: ReturnType<typeof createWrapper>;

  beforeEach(() => {
    sdk = createMockSdk();
    wrapper = createWrapper(sdk);
  });

  it('37. starts in idle phase', () => {
    const { result } = renderHook(
      () =>
        useEarnRedeem({
          vault: makeVault(),
          amount: '100',
          wallet: '0xWALLET',
        }),
      { wrapper },
    );

    expect(result.current.state.phase).toBe('idle');
    expect(result.current.state.quote).toBeNull();
    expect(result.current.state.preflightReport).toBeNull();
    expect(result.current.state.txHash).toBeNull();
    expect(result.current.state.error).toBeNull();
  });

  it('38. prepare() transitions through preflight -> quoting -> ready', async () => {
    const { result } = renderHook(
      () =>
        useEarnRedeem({
          vault: makeVault(),
          amount: '100',
          wallet: '0xWALLET',
        }),
      { wrapper },
    );

    await act(async () => {
      await result.current.prepare();
    });

    expect(result.current.state.phase).toBe('ready');
    expect(result.current.state.preflightReport).not.toBeNull();
    expect(result.current.state.preflightReport!.ok).toBe(true);
    expect(result.current.state.quote).not.toBeNull();
    expect(result.current.state.quote!.humanAmount).toBe('100');
    expect(sdk.preflight).toHaveBeenCalled();
    expect(sdk.buildRedeemQuote).toHaveBeenCalled();
  });

  it('39. prepare() errors when vault is undefined', async () => {
    const { result } = renderHook(
      () =>
        useEarnRedeem({
          vault: undefined,
          amount: '100',
          wallet: '0xWALLET',
        }),
      { wrapper },
    );

    await act(async () => {
      await result.current.prepare();
    });

    expect(result.current.state.phase).toBe('error');
    expect(result.current.state.error!.message).toContain('Missing vault');
  });

  it('40. prepare() errors when vault is not redeemable', async () => {
    const { result } = renderHook(
      () =>
        useEarnRedeem({
          vault: makeVault({ isRedeemable: false }),
          amount: '100',
          wallet: '0xWALLET',
        }),
      { wrapper },
    );

    await act(async () => {
      await result.current.prepare();
    });

    expect(result.current.state.phase).toBe('error');
    expect(result.current.state.error!.message).toContain('not redeemable');
  });

  it('41. prepare() goes to error when preflight fails', async () => {
    (sdk.preflight as ReturnType<typeof vi.fn>).mockReturnValue({
      ok: false,
      issues: [{ code: 'NOT_TRANSACTIONAL', message: 'Not transactional', severity: 'error' }],
      vault: makeVault(),
      wallet: '0xWALLET',
    });

    const { result } = renderHook(
      () =>
        useEarnRedeem({
          vault: makeVault(),
          amount: '100',
          wallet: '0xWALLET',
        }),
      { wrapper },
    );

    await act(async () => {
      await result.current.prepare();
    });

    expect(result.current.state.phase).toBe('error');
    expect(result.current.state.error!.message).toContain('Preflight failed');
    expect(sdk.buildRedeemQuote).not.toHaveBeenCalled();
  });

  it('42. prepare() goes to error when redeem quote fails', async () => {
    (sdk.buildRedeemQuote as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('Composer error'),
    );

    const { result } = renderHook(
      () =>
        useEarnRedeem({
          vault: makeVault(),
          amount: '100',
          wallet: '0xWALLET',
        }),
      { wrapper },
    );

    await act(async () => {
      await result.current.prepare();
    });

    expect(result.current.state.phase).toBe('error');
    expect(result.current.state.error!.message).toBe('Composer error');
  });

  it('43. execute() sends transaction and reaches success', async () => {
    const mockSendTx = vi.fn().mockResolvedValue('0xTXHASH');

    const { result } = renderHook(
      () =>
        useEarnRedeem({
          vault: makeVault(),
          amount: '100',
          wallet: '0xWALLET',
          sendTransactionAsync: mockSendTx,
        }),
      { wrapper },
    );

    // First prepare
    await act(async () => {
      await result.current.prepare();
    });
    expect(result.current.state.phase).toBe('ready');

    // Then execute
    await act(async () => {
      await result.current.execute();
    });
    expect(result.current.state.phase).toBe('success');
    expect(result.current.state.txHash).toBe('0xTXHASH');
    expect(mockSendTx).toHaveBeenCalledWith(
      expect.objectContaining({
        to: '0xROUTER',
        data: '0xDATA',
        chainId: 8453,
      }),
    );
  });

  it('44. execute() errors without sendTransactionAsync', async () => {
    const { result } = renderHook(
      () =>
        useEarnRedeem({
          vault: makeVault(),
          amount: '100',
          wallet: '0xWALLET',
          // no sendTransactionAsync
        }),
      { wrapper },
    );

    await act(async () => {
      await result.current.prepare();
    });

    await act(async () => {
      await result.current.execute();
    });

    expect(result.current.state.phase).toBe('error');
    expect(result.current.state.error!.message).toContain('No sendTransactionAsync');
  });

  it('45. execute() errors when not in ready state', async () => {
    const { result } = renderHook(
      () =>
        useEarnRedeem({
          vault: makeVault(),
          amount: '100',
          wallet: '0xWALLET',
          sendTransactionAsync: vi.fn(),
        }),
      { wrapper },
    );

    // Try execute without prepare
    await act(async () => {
      await result.current.execute();
    });

    expect(result.current.state.phase).toBe('error');
    expect(result.current.state.error!.message).toContain('not in ready state');
  });

  it('46. reset() returns to idle state', async () => {
    const { result } = renderHook(
      () =>
        useEarnRedeem({
          vault: makeVault(),
          amount: '100',
          wallet: '0xWALLET',
        }),
      { wrapper },
    );

    await act(async () => {
      await result.current.prepare();
    });
    expect(result.current.state.phase).toBe('ready');

    act(() => {
      result.current.reset();
    });

    expect(result.current.state.phase).toBe('idle');
    expect(result.current.state.quote).toBeNull();
    expect(result.current.state.preflightReport).toBeNull();
  });
});
