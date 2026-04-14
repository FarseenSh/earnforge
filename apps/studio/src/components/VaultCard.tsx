// SPDX-License-Identifier: Apache-2.0
'use client'

import type { Vault, RiskScore } from '@earnforge/sdk'
import { parseTvl } from '@earnforge/sdk'
import { RiskBadge } from './RiskBadge'

interface VaultCardProps {
  vault: Vault
  risk: RiskScore
  isSelected: boolean
  onClick: () => void
  apyHistory?: number[]
}

function formatTvl(tvlUsd: number): string {
  if (tvlUsd >= 1_000_000_000) return `$${(tvlUsd / 1_000_000_000).toFixed(2)}B`
  if (tvlUsd >= 1_000_000) return `$${(tvlUsd / 1_000_000).toFixed(2)}M`
  if (tvlUsd >= 1_000) return `$${(tvlUsd / 1_000).toFixed(2)}K`
  return `$${tvlUsd.toFixed(2)}`
}

function formatApy(apy: number): string {
  // API returns APY as percentage already (3.84 = 3.84%)
  return `${apy.toFixed(2)}%`
}

/** Tiny inline SVG sparkline — no chart library needed */
function Sparkline({ data }: { data: number[] }) {
  if (data.length < 2) return null
  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1
  const w = 80
  const h = 24
  const points = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * w
      const y = h - ((v - min) / range) * h
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')

  return (
    <svg
      width={w}
      height={h}
      className="inline-block opacity-60"
      aria-label="APY trend"
    >
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="text-green-400"
      />
    </svg>
  )
}

export function VaultCard({
  vault,
  risk,
  isSelected,
  onClick,
  apyHistory,
}: VaultCardProps) {
  const tvl = parseTvl(vault.analytics.tvl)
  const isStablecoin = vault.tags.includes('stablecoin')

  return (
    <button
      type="button"
      onClick={onClick}
      data-testid="vault-card"
      className={`w-full rounded-xl border p-4 text-left transition-all hover:border-[var(--color-primary)]/50 hover:shadow-lg hover:shadow-[var(--color-primary)]/5 ${
        isSelected
          ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/5'
          : 'border-[var(--color-border)] bg-[var(--color-card)]'
      }`}
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <h3 className="text-sm font-semibold text-[var(--color-text)] leading-tight">
          {vault.name}
        </h3>
        <RiskBadge score={risk.score} label={risk.label} />
      </div>

      <div className="mb-3 flex items-center gap-2">
        <span className="rounded-md bg-[var(--color-primary)]/10 px-2 py-0.5 text-xs font-medium text-[var(--color-primary)]">
          {vault.protocol.name}
        </span>
        <span className="text-xs text-[var(--color-text-muted)]">
          Chain {vault.chainId}
        </span>
        {isStablecoin && (
          <span
            data-testid="stablecoin-tag"
            className="rounded-md bg-blue-500/10 px-2 py-0.5 text-xs font-medium text-blue-400"
          >
            Stablecoin
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <p className="text-xs text-[var(--color-text-muted)]">APY</p>
          <p className="text-lg font-bold text-green-400">
            {formatApy(vault.analytics.apy.total)}
          </p>
        </div>
        <div>
          <p className="text-xs text-[var(--color-text-muted)]">TVL</p>
          <p className="text-lg font-bold text-[var(--color-text)]">
            {formatTvl(tvl.parsed)}
          </p>
        </div>
      </div>

      {apyHistory && apyHistory.length > 1 && (
        <div className="mt-2 flex items-center gap-2">
          <span className="text-xs text-[var(--color-text-muted)]">30d</span>
          <Sparkline data={apyHistory} />
        </div>
      )}

      {vault.description && (
        <p className="mt-2 text-xs text-[var(--color-text-muted)] line-clamp-2">
          {vault.description}
        </p>
      )}
    </button>
  )
}
