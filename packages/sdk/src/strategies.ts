// SPDX-License-Identifier: Apache-2.0
import type { VaultListParams } from './clients/index.js'

export type StrategyPreset =
  | 'conservative'
  | 'max-apy'
  | 'diversified'
  | 'risk-adjusted'

export interface StrategyConfig {
  name: StrategyPreset
  description: string
  filters: Partial<VaultListParams> & {
    minTvlUsd?: number
    tags?: string[]
    protocols?: string[]
    minRiskScore?: number
  }
  sort: 'apy' | 'tvl' | 'risk'
  sortDirection: 'asc' | 'desc'
}

const BLUE_CHIP_PROTOCOLS = [
  'aave-v3',
  'morpho-v1',
  'euler-v2',
  'pendle',
  'maple',
]

export const STRATEGIES: Record<StrategyPreset, StrategyConfig> = {
  conservative: {
    name: 'conservative',
    description:
      'Stablecoin-tagged, TVL > $50M, APY 3-7%, blue-chip protocols only',
    filters: {
      tags: ['stablecoin'],
      minTvlUsd: 50_000_000,
      protocols: BLUE_CHIP_PROTOCOLS,
    },
    sort: 'apy',
    sortDirection: 'desc',
  },

  'max-apy': {
    name: 'max-apy',
    description: 'Sort by APY descending, no TVL floor',
    filters: {},
    sort: 'apy',
    sortDirection: 'desc',
  },

  diversified: {
    name: 'diversified',
    description:
      'Spread across 3+ chains, 3+ protocols, mix of stablecoin + LST',
    filters: {
      minTvlUsd: 1_000_000,
    },
    sort: 'apy',
    sortDirection: 'desc',
  },

  'risk-adjusted': {
    name: 'risk-adjusted',
    description: 'Filter by risk score >= 7, then sort by APY',
    filters: {
      minRiskScore: 7,
    },
    sort: 'apy',
    sortDirection: 'desc',
  },
}

export function getStrategy(preset: StrategyPreset): StrategyConfig {
  return STRATEGIES[preset]
}
