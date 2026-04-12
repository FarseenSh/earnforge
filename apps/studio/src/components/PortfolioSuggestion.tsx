// SPDX-License-Identifier: Apache-2.0
'use client';

import { useState, useCallback } from 'react';
import { type SuggestResult, type StrategyPreset, type Vault } from '@earnforge/sdk';
import { getEarnForge } from '@/lib/earnforge';
import { RiskBadge } from './RiskBadge';

const STRATEGIES: { value: StrategyPreset | ''; label: string }[] = [
  { value: '', label: 'No strategy' },
  { value: 'conservative', label: 'Conservative' },
  { value: 'max-apy', label: 'Max APY' },
  { value: 'diversified', label: 'Diversified' },
  { value: 'risk-adjusted', label: 'Risk-Adjusted' },
];

function formatUsd(n: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(n);
}

export function PortfolioSuggestion() {
  const [amount, setAmount] = useState('');
  const [asset, setAsset] = useState('USDC');
  const [strategy, setStrategy] = useState<StrategyPreset | ''>('');
  const [maxChains, setMaxChains] = useState('3');
  const [result, setResult] = useState<SuggestResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSuggest = useCallback(async () => {
    const amt = Number(amount);
    if (!amt || amt <= 0) {
      setError('Enter a positive amount.');
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const forge = getEarnForge();

      // Fetch vaults for the asset
      const vaults: Vault[] = [];
      for await (const v of forge.vaults.listAll({ asset })) {
        vaults.push(v);
      }

      const suggestion = await forge.suggest({
        amount: amt,
        asset: asset.toUpperCase(),
        maxChains: Number(maxChains) || 3,
        strategy: strategy || undefined,
        vaults,
      });

      setResult(suggestion);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [amount, asset, strategy, maxChains]);

  return (
    <div
      data-testid="portfolio-suggestion"
      className="mt-8 rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-6"
    >
      <h2 className="mb-4 text-lg font-bold text-[var(--color-text)]">
        Portfolio Suggestion
      </h2>
      <p className="mb-4 text-sm text-[var(--color-text-muted)]">
        Enter your budget and asset — the engine recommends an optimal allocation with risk scores and chain diversification.
      </p>

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div>
          <label className="mb-1 block text-xs text-[var(--color-text-muted)]">Amount (USD)</label>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="10000"
            className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm text-[var(--color-text)]"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-[var(--color-text-muted)]">Asset</label>
          <input
            type="text"
            value={asset}
            onChange={(e) => setAsset(e.target.value)}
            placeholder="USDC"
            className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm text-[var(--color-text)]"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-[var(--color-text-muted)]">Strategy</label>
          <select
            value={strategy}
            onChange={(e) => setStrategy(e.target.value as StrategyPreset | '')}
            className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm text-[var(--color-text)]"
          >
            {STRATEGIES.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs text-[var(--color-text-muted)]">Max Chains</label>
          <input
            type="number"
            value={maxChains}
            onChange={(e) => setMaxChains(e.target.value)}
            min="1"
            max="16"
            className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm text-[var(--color-text)]"
          />
        </div>
      </div>

      <button
        type="button"
        onClick={handleSuggest}
        disabled={loading}
        className="rounded-lg bg-[var(--color-primary)] px-6 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--color-primary)]/80 disabled:opacity-50"
      >
        {loading ? 'Calculating...' : 'Get Suggestion'}
      </button>

      {error && (
        <p className="mt-3 text-sm text-red-400">{error}</p>
      )}

      {result && result.allocations.length > 0 && (
        <div className="mt-6">
          <div className="mb-3 flex items-baseline gap-4">
            <span className="text-sm text-[var(--color-text-muted)]">
              Total: {formatUsd(result.totalAmount)}
            </span>
            <span className="text-sm font-medium text-green-400">
              Expected APY: {result.expectedApy.toFixed(2)}%
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)]">
                  <th className="pb-2 text-xs font-medium text-[var(--color-text-muted)]">Vault</th>
                  <th className="pb-2 text-xs font-medium text-[var(--color-text-muted)]">Chain</th>
                  <th className="pb-2 text-xs font-medium text-[var(--color-text-muted)]">Protocol</th>
                  <th className="pb-2 text-xs font-medium text-[var(--color-text-muted)] text-right">APY</th>
                  <th className="pb-2 text-xs font-medium text-[var(--color-text-muted)] text-right">Risk</th>
                  <th className="pb-2 text-xs font-medium text-[var(--color-text-muted)] text-right">%</th>
                  <th className="pb-2 text-xs font-medium text-[var(--color-text-muted)] text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {result.allocations.map((alloc) => (
                  <tr
                    key={alloc.vault.slug}
                    className="border-b border-[var(--color-border)]/50"
                  >
                    <td className="py-2 font-medium text-[var(--color-text)]">
                      {alloc.vault.name}
                    </td>
                    <td className="py-2 text-[var(--color-text-muted)]">
                      {alloc.vault.network}
                    </td>
                    <td className="py-2 text-[var(--color-text-muted)]">
                      {alloc.vault.protocol.name}
                    </td>
                    <td className="py-2 text-right text-green-400">
                      {alloc.apy.toFixed(2)}%
                    </td>
                    <td className="py-2 text-right">
                      <RiskBadge score={alloc.risk.score} label={alloc.risk.label} />
                    </td>
                    <td className="py-2 text-right text-[var(--color-text)]">
                      {alloc.percentage.toFixed(1)}%
                    </td>
                    <td className="py-2 text-right font-medium text-[var(--color-text)]">
                      {formatUsd(alloc.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {result && result.allocations.length === 0 && (
        <p className="mt-4 text-sm text-[var(--color-text-muted)]">
          No vaults found matching your criteria. Try a different asset or strategy.
        </p>
      )}
    </div>
  );
}
