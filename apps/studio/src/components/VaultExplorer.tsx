// SPDX-License-Identifier: Apache-2.0
'use client';

import type { Vault, Chain, StrategyPreset, RiskScore } from '@earnforge/sdk';
import { riskScore, parseTvl } from '@earnforge/sdk';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { getEarnForge } from '@/lib/earnforge';
import { CodeGenerator } from './CodeGenerator';
import { StrategyPicker } from './StrategyPicker';
import { VaultCard } from './VaultCard';

async function fetchAllVaults(): Promise<Vault[]> {
  const forge = getEarnForge();
  const vaults: Vault[] = [];
  for await (const vault of forge.vaults.listAll()) {
    vaults.push(vault);
  }
  return vaults;
}

async function fetchChains(): Promise<Chain[]> {
  const forge = getEarnForge();
  return forge.chains.list();
}

function applyStrategyFilter(
  vaults: Vault[],
  strategy: StrategyPreset,
  scores: Map<string, RiskScore>,
): Vault[] {
  switch (strategy) {
    case 'conservative':
      return vaults.filter((v) => {
        const tvl = parseTvl(v.analytics.tvl).parsed;
        return (
          v.tags.includes('stablecoin') &&
          tvl >= 50_000_000
        );
      });
    case 'max-apy':
      return [...vaults].sort(
        (a, b) => b.analytics.apy.total - a.analytics.apy.total,
      );
    case 'diversified':
      return vaults.filter((v) => parseTvl(v.analytics.tvl).parsed >= 1_000_000);
    case 'risk-adjusted':
      return vaults.filter((v) => {
        const r = scores.get(v.address + v.chainId);
        return r != null && r.score >= 7;
      });
    default:
      return vaults;
  }
}

export function VaultExplorer() {
  const [chainFilter, setChainFilter] = useState<number | ''>('');
  const [assetFilter, setAssetFilter] = useState('');
  const [strategy, setStrategy] = useState<StrategyPreset | ''>('');
  const [selectedVault, setSelectedVault] = useState<Vault | null>(null);

  const { data: vaults, isLoading: vaultsLoading, error: vaultsError } = useQuery({
    queryKey: ['vaults'],
    queryFn: fetchAllVaults,
  });

  const { data: chains } = useQuery({
    queryKey: ['chains'],
    queryFn: fetchChains,
  });

  // Compute risk scores for all vaults
  const riskScores = useMemo(() => {
    const map = new Map<string, RiskScore>();
    if (!vaults) return map;
    for (const vault of vaults) {
      map.set(vault.address + vault.chainId, riskScore(vault));
    }
    return map;
  }, [vaults]);

  // Filter vaults
  const filteredVaults = useMemo(() => {
    if (!vaults) return [];

    let result = vaults;

    // Chain filter
    if (chainFilter !== '') {
      result = result.filter((v) => v.chainId === chainFilter);
    }

    // Asset filter (search by name or underlying token symbol)
    if (assetFilter.trim()) {
      const term = assetFilter.toLowerCase();
      result = result.filter(
        (v) =>
          v.name.toLowerCase().includes(term) ||
          v.underlyingTokens.some((t) =>
            t.symbol.toLowerCase().includes(term),
          ),
      );
    }

    // Strategy filter
    if (strategy) {
      result = applyStrategyFilter(result, strategy, riskScores);
    }

    return result;
  }, [vaults, chainFilter, assetFilter, strategy, riskScores]);

  // Stats
  const totalVaults = vaults?.length ?? 0;
  const uniqueChains = useMemo(() => {
    if (!vaults) return 0;
    return new Set(vaults.map((v) => v.chainId)).size;
  }, [vaults]);
  const uniqueProtocols = useMemo(() => {
    if (!vaults) return 0;
    return new Set(vaults.map((v) => v.protocol.name)).size;
  }, [vaults]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-[var(--color-text)]">
          <span className="text-[var(--color-primary)]">EarnForge</span> Studio
        </h1>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">
          Explore LI.FI Earn vaults, analyze risk, and generate integration code.
        </p>
      </div>

      {/* Stats Bar */}
      <div data-testid="stats-bar" className="mb-6 grid grid-cols-3 gap-4">
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-4">
          <p className="text-xs text-[var(--color-text-muted)]">Total Vaults</p>
          <p className="text-2xl font-bold text-[var(--color-text)]">
            {vaultsLoading ? '...' : totalVaults}
          </p>
        </div>
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-4">
          <p className="text-xs text-[var(--color-text-muted)]">Chains</p>
          <p className="text-2xl font-bold text-[var(--color-text)]">
            {vaultsLoading ? '...' : uniqueChains}
          </p>
        </div>
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-4">
          <p className="text-xs text-[var(--color-text-muted)]">Protocols</p>
          <p className="text-2xl font-bold text-[var(--color-text)]">
            {vaultsLoading ? '...' : uniqueProtocols}
          </p>
        </div>
      </div>

      {/* Filters */}
      <div data-testid="filter-controls" className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {/* Chain Filter */}
        <div className="flex flex-col gap-1">
          <label htmlFor="chain-filter" className="text-sm font-medium text-[var(--color-text-muted)]">
            Chain
          </label>
          <select
            id="chain-filter"
            data-testid="chain-filter"
            value={chainFilter}
            onChange={(e) =>
              setChainFilter(e.target.value === '' ? '' : Number(e.target.value))
            }
            className="rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] px-3 py-2 text-sm text-[var(--color-text)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
          >
            <option value="">All Chains</option>
            {chains?.map((chain) => (
              <option key={chain.chainId} value={chain.chainId}>
                {chain.name} ({chain.chainId})
              </option>
            ))}
          </select>
        </div>

        {/* Asset Filter */}
        <div className="flex flex-col gap-1">
          <label htmlFor="asset-filter" className="text-sm font-medium text-[var(--color-text-muted)]">
            Asset
          </label>
          <input
            id="asset-filter"
            data-testid="asset-filter"
            type="text"
            placeholder="Search by name or token symbol..."
            value={assetFilter}
            onChange={(e) => setAssetFilter(e.target.value)}
            className="rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] px-3 py-2 text-sm text-[var(--color-text)] placeholder:text-[var(--color-text-muted)]/50 focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
          />
        </div>

        {/* Strategy Picker */}
        <StrategyPicker value={strategy} onChange={setStrategy} />
      </div>

      {/* Loading State */}
      {vaultsLoading && (
        <div data-testid="loading-spinner" className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--color-primary)] border-t-transparent" />
          <span className="ml-3 text-sm text-[var(--color-text-muted)]">
            Loading vaults...
          </span>
        </div>
      )}

      {/* Error State */}
      {vaultsError && (
        <div data-testid="error-message" className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400">
          Failed to load vaults: {vaultsError.message}
        </div>
      )}

      {/* Results count */}
      {!vaultsLoading && vaults && (
        <p className="mb-4 text-sm text-[var(--color-text-muted)]">
          Showing {filteredVaults.length} of {totalVaults} vaults
        </p>
      )}

      {/* Vault Grid */}
      {!vaultsLoading && (
        <div data-testid="vault-grid" className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredVaults.map((vault) => {
            const risk = riskScores.get(vault.address + vault.chainId)!;
            return (
              <VaultCard
                key={vault.address + vault.chainId}
                vault={vault}
                risk={risk}
                isSelected={
                  selectedVault?.address === vault.address &&
                  selectedVault?.chainId === vault.chainId
                }
                onClick={() =>
                  setSelectedVault(
                    selectedVault?.address === vault.address &&
                      selectedVault?.chainId === vault.chainId
                      ? null
                      : vault,
                  )
                }
              />
            );
          })}
        </div>
      )}

      {/* Empty state */}
      {!vaultsLoading && filteredVaults.length === 0 && vaults && (
        <div className="py-12 text-center text-sm text-[var(--color-text-muted)]">
          No vaults match your filters. Try adjusting the chain, asset, or strategy.
        </div>
      )}

      {/* Code Generator */}
      {selectedVault && (
        <CodeGenerator
          vault={selectedVault}
          onClose={() => setSelectedVault(null)}
        />
      )}
    </div>
  );
}
