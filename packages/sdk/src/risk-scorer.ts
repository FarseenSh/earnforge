// SPDX-License-Identifier: Apache-2.0
import type { Vault } from './schemas/index.js'
import { parseTvl } from './schemas/vault.js'

export interface RiskBreakdown {
  tvl: number
  apyStability: number
  protocol: number
  redeemability: number
  assetType: number
}

export interface RiskScore {
  score: number
  breakdown: RiskBreakdown
  label: 'low' | 'medium' | 'high'
}

/** Blue-chip / mature protocol tiers */
const PROTOCOL_TIERS: Record<string, number> = {
  'aave-v3': 9,
  'morpho-v1': 9,
  'euler-v2': 7,
  pendle: 7,
  maple: 6,
  'ethena-usde': 7,
  'ether.fi-liquid': 7,
  'ether.fi-stake': 7,
  upshift: 5,
  neverland: 4,
  'yo-protocol': 4,
}

/**
 * Compute a composite 0–10 risk score for a vault.
 *
 * Dimensions:
 * - TVL magnitude: higher TVL = lower risk
 * - APY stability: small divergence between apy1d/apy30d/total = more stable
 * - Protocol maturity: known blue-chip protocols score higher
 * - Redeemability: non-redeemable = liquidity risk
 * - Asset type: stablecoin tag = lower asset risk
 */
export function riskScore(vault: Vault): RiskScore {
  const tvlScore = scoreTvl(vault)
  const apyScore = scoreApyStability(vault)
  const protocolScore = scoreProtocol(vault)
  const redeemScore = vault.isRedeemable ? 10 : 3
  const assetScore = vault.tags.includes('stablecoin') ? 9 : 5

  // Weighted average
  const weights = {
    tvl: 0.25,
    apy: 0.2,
    protocol: 0.25,
    redeem: 0.15,
    asset: 0.15,
  }
  const score =
    tvlScore * weights.tvl +
    apyScore * weights.apy +
    protocolScore * weights.protocol +
    redeemScore * weights.redeem +
    assetScore * weights.asset

  const rounded = Math.round(score * 10) / 10

  return {
    score: rounded,
    breakdown: {
      tvl: tvlScore,
      apyStability: apyScore,
      protocol: protocolScore,
      redeemability: redeemScore,
      assetType: assetScore,
    },
    label: rounded >= 7 ? 'low' : rounded >= 4 ? 'medium' : 'high',
  }
}

function scoreTvl(vault: Vault): number {
  const tvl = parseTvl(vault.analytics.tvl)
  if (tvl.parsed >= 100_000_000) return 10
  if (tvl.parsed >= 50_000_000) return 9
  if (tvl.parsed >= 10_000_000) return 8
  if (tvl.parsed >= 5_000_000) return 7
  if (tvl.parsed >= 1_000_000) return 5
  if (tvl.parsed >= 100_000) return 3
  return 1
}

function scoreApyStability(vault: Vault): number {
  const { apy, apy1d, apy30d } = vault.analytics
  const total = apy.total

  // If we don't have historical data, moderate score
  if (apy30d === null && apy1d === null) return 5

  const ref = apy30d ?? apy1d ?? total
  if (ref === 0 || total === 0) return 5

  const divergence = Math.abs(total - ref) / Math.max(total, ref)

  if (divergence < 0.05) return 10
  if (divergence < 0.1) return 8
  if (divergence < 0.2) return 6
  if (divergence < 0.5) return 4
  return 2
}

function scoreProtocol(vault: Vault): number {
  return PROTOCOL_TIERS[vault.protocol.name] ?? 3
}
