// SPDX-License-Identifier: Apache-2.0
'use client';

import type { StrategyPreset } from '@earnforge/sdk';

const STRATEGY_OPTIONS: { value: StrategyPreset | ''; label: string; description: string }[] = [
  { value: '', label: 'All Vaults', description: 'No strategy filter applied' },
  {
    value: 'conservative',
    label: 'Conservative',
    description: 'Stablecoins, high TVL, blue-chip protocols',
  },
  {
    value: 'max-apy',
    label: 'Max APY',
    description: 'Highest APY, no TVL floor',
  },
  {
    value: 'diversified',
    label: 'Diversified',
    description: 'Spread across chains and protocols',
  },
  {
    value: 'risk-adjusted',
    label: 'Risk-Adjusted',
    description: 'Risk score >= 7, sorted by APY',
  },
];

interface StrategyPickerProps {
  value: StrategyPreset | '';
  onChange: (strategy: StrategyPreset | '') => void;
}

export function StrategyPicker({ value, onChange }: StrategyPickerProps) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor="strategy-picker" className="text-sm font-medium text-[var(--color-text-muted)]">
        Strategy
      </label>
      <select
        id="strategy-picker"
        data-testid="strategy-picker"
        value={value}
        onChange={(e) => onChange(e.target.value as StrategyPreset | '')}
        className="rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] px-3 py-2 text-sm text-[var(--color-text)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
      >
        {STRATEGY_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label} — {opt.description}
          </option>
        ))}
      </select>
    </div>
  );
}
