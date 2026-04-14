// SPDX-License-Identifier: Apache-2.0
import type { Vault } from './schemas/index.js'
import { parseTvl } from './schemas/vault.js'
import { riskScore, type RiskScore } from './risk-scorer.js'
import { STRATEGIES, type StrategyPreset } from './strategies.js'

export interface SuggestParams {
  amount: number
  asset?: string
  maxChains?: number
  strategy?: StrategyPreset
  maxVaults?: number
}

export interface Allocation {
  vault: Vault
  risk: RiskScore
  percentage: number
  amount: number
  apy: number
}

export interface SuggestResult {
  totalAmount: number
  expectedApy: number
  allocations: Allocation[]
}

/**
 * Portfolio allocation engine.
 * Uses a risk-adjusted score: score = apy / (11 - riskScore)
 * to weight allocations proportionally.
 * Enforces maxChains diversification constraint.
 */
export function suggest(vaults: Vault[], params: SuggestParams): SuggestResult {
  const maxVaults = params.maxVaults ?? 5
  const maxChains = params.maxChains ?? 5

  // Filter by asset if specified
  let candidates = params.asset
    ? vaults.filter((v) =>
        v.underlyingTokens.some(
          (t) => t.symbol.toUpperCase() === params.asset?.toUpperCase()
        )
      )
    : [...vaults]

  // Only transactional vaults
  candidates = candidates.filter((v) => v.isTransactional)

  // Apply strategy filters if specified
  if (params.strategy) {
    const strategy = STRATEGIES[params.strategy]
    if (strategy) {
      if (strategy.filters.minTvlUsd) {
        const minTvl = strategy.filters.minTvlUsd
        candidates = candidates.filter(
          (v) => parseTvl(v.analytics.tvl).parsed >= minTvl
        )
      }
      if (strategy.filters.tags?.length) {
        const requiredTags = strategy.filters.tags
        candidates = candidates.filter((v) =>
          requiredTags.some((t) => v.tags.includes(t))
        )
      }
      if (strategy.filters.protocols?.length) {
        const allowedProtocols = strategy.filters.protocols
        candidates = candidates.filter((v) =>
          allowedProtocols.includes(v.protocol.name)
        )
      }
      if (strategy.filters.minRiskScore) {
        const minScore = strategy.filters.minRiskScore
        candidates = candidates.filter((v) => riskScore(v).score >= minScore)
      }
    }
  }

  // Score each candidate
  const scored = candidates.map((vault) => {
    const risk = riskScore(vault)
    const apy = vault.analytics.apy.total
    // Higher APY + higher risk score = better allocation candidate
    const allocationScore = apy * (risk.score / 10)
    return { vault, risk, apy, allocationScore }
  })

  // Sort by allocation score descending
  scored.sort((a, b) => b.allocationScore - a.allocationScore)

  // Enforce maxChains constraint
  const selectedChains = new Set<number>()
  const selected: typeof scored = []

  for (const item of scored) {
    if (selected.length >= maxVaults) break
    if (
      selectedChains.size >= maxChains &&
      !selectedChains.has(item.vault.chainId)
    ) {
      continue
    }
    selectedChains.add(item.vault.chainId)
    selected.push(item)
  }

  if (selected.length === 0) {
    return { totalAmount: params.amount, expectedApy: 0, allocations: [] }
  }

  // Allocate proportionally by score
  const totalScore = selected.reduce((sum, s) => sum + s.allocationScore, 0)

  const allocations: Allocation[] = selected.map((s) => {
    const percentage =
      totalScore > 0
        ? (s.allocationScore / totalScore) * 100
        : 100 / selected.length
    return {
      vault: s.vault,
      risk: s.risk,
      percentage: Math.round(percentage * 10) / 10,
      amount: Math.round((percentage / 100) * params.amount * 100) / 100,
      apy: s.apy,
    }
  })

  const expectedApy = allocations.reduce(
    (sum, a) => sum + a.apy * (a.percentage / 100),
    0
  )

  return {
    totalAmount: params.amount,
    expectedApy: Math.round(expectedApy * 100) / 100,
    allocations,
  }
}
