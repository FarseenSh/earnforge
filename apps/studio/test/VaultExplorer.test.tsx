// SPDX-License-Identifier: Apache-2.0
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { mockVault, mockHighRiskVault } from './helpers';

// Mock the earnforge module
vi.mock('@/lib/earnforge', () => {
  const vaults = [
    // We need to import helpers inside the factory since it runs before imports
  ];
  return {
    getEarnForge: () => ({
      vaults: {
        listAll: () => ({
          async *[Symbol.asyncIterator]() {
            // We yield mock vaults inline here
            yield {
              address: '0xabc123',
              chainId: 8453,
              name: 'Test Vault USDC',
              slug: 'test-vault-usdc',
              network: 'base',
              protocol: { name: 'aave-v3', url: 'https://aave.com' },
              provider: 'aave',
              syncedAt: '2026-04-11T00:00:00Z',
              tags: ['stablecoin'],
              underlyingTokens: [{ symbol: 'USDC', address: '0xusdc', decimals: 6 }],
              lpTokens: [],
              analytics: {
                apy: { base: 0.035, total: 0.045, reward: 0.01 },
                tvl: { usd: '50000000' },
                apy1d: 0.04,
                apy7d: 0.042,
                apy30d: 0.043,
                updatedAt: '2026-04-11T00:00:00Z',
              },
              isTransactional: true,
              isRedeemable: true,
              depositPacks: [{ name: 'default', stepsType: 'deposit' }],
              redeemPacks: [{ name: 'default', stepsType: 'redeem' }],
            };
            yield {
              address: '0xdef456',
              chainId: 42161,
              name: 'ETH Yield Vault',
              slug: 'eth-yield-vault',
              network: 'arbitrum',
              protocol: { name: 'euler-v2', url: 'https://euler.finance' },
              provider: 'euler',
              syncedAt: '2026-04-11T00:00:00Z',
              tags: [],
              underlyingTokens: [{ symbol: 'ETH', address: '0xeth', decimals: 18 }],
              lpTokens: [],
              analytics: {
                apy: { base: 0.08, total: 0.12, reward: 0.04 },
                tvl: { usd: '10000000' },
                apy1d: 0.1,
                apy7d: 0.11,
                apy30d: 0.115,
                updatedAt: '2026-04-11T00:00:00Z',
              },
              isTransactional: true,
              isRedeemable: true,
              depositPacks: [{ name: 'default', stepsType: 'deposit' }],
              redeemPacks: [{ name: 'default', stepsType: 'redeem' }],
            };
          },
        }),
      },
      chains: {
        list: async () => [
          { chainId: 8453, name: 'Base', networkCaip: 'eip155:8453' },
          { chainId: 42161, name: 'Arbitrum', networkCaip: 'eip155:42161' },
        ],
      },
    }),
  };
});

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
  );
}

describe('VaultExplorer', () => {
  // Need to dynamically import after the mock is set up
  let VaultExplorer: typeof import('@/components/VaultExplorer').VaultExplorer;

  beforeEach(async () => {
    const mod = await import('@/components/VaultExplorer');
    VaultExplorer = mod.VaultExplorer;
  });

  it('shows loading spinner initially', () => {
    renderWithProviders(<VaultExplorer />);
    expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();
  });

  it('renders stats bar after loading', async () => {
    renderWithProviders(<VaultExplorer />);
    await waitFor(() => {
      expect(screen.getByTestId('stats-bar')).toBeInTheDocument();
    });
    // Should show 2 vaults in stats
    await waitFor(() => {
      expect(screen.getAllByText('2').length).toBeGreaterThanOrEqual(1);
    });
  });

  it('renders vault cards after loading', async () => {
    renderWithProviders(<VaultExplorer />);
    await waitFor(() => {
      expect(screen.getByText('Test Vault USDC')).toBeInTheDocument();
    });
    expect(screen.getByText('ETH Yield Vault')).toBeInTheDocument();
  });

  it('renders filter controls', async () => {
    renderWithProviders(<VaultExplorer />);
    await waitFor(() => {
      expect(screen.getByTestId('filter-controls')).toBeInTheDocument();
    });
    expect(screen.getByTestId('chain-filter')).toBeInTheDocument();
    expect(screen.getByTestId('asset-filter')).toBeInTheDocument();
    expect(screen.getByTestId('strategy-picker')).toBeInTheDocument();
  });

  it('filters by asset text input', async () => {
    renderWithProviders(<VaultExplorer />);
    await waitFor(() => {
      expect(screen.getByText('Test Vault USDC')).toBeInTheDocument();
    });

    const input = screen.getByTestId('asset-filter');
    fireEvent.change(input, { target: { value: 'USDC' } });

    await waitFor(() => {
      expect(screen.getByText('Test Vault USDC')).toBeInTheDocument();
      expect(screen.queryByText('ETH Yield Vault')).not.toBeInTheDocument();
    });
  });

  it('opens code generator when a vault card is clicked', async () => {
    renderWithProviders(<VaultExplorer />);
    await waitFor(() => {
      expect(screen.getByText('Test Vault USDC')).toBeInTheDocument();
    });

    const cards = screen.getAllByTestId('vault-card');
    fireEvent.click(cards[0]);

    await waitFor(() => {
      expect(screen.getByTestId('code-generator')).toBeInTheDocument();
    });
  });

  it('shows vault count in results text', async () => {
    renderWithProviders(<VaultExplorer />);
    await waitFor(() => {
      expect(screen.getByText(/Showing 2 of 2 vaults/)).toBeInTheDocument();
    });
  });
});
