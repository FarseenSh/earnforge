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
    excludeTags?: string[]
    protocols?: string[]
    minRiskScore?: number
    /** Drop vaults LI.FI's verification pass flagged as suspect */
    excludeFlagged?: boolean
  }
  sort: 'apy' | 'tvl' | 'risk'
  sortDirection: 'asc' | 'desc'
}

/**
 * Protocol ids must be UNVERSIONED — the Apr 2026 rewrite dropped version
 * suffixes, and `?protocol=morpho-v1` now returns an empty set with a 200
 * rather than an error. `maple` was also removed from Earn entirely.
 * Every id here is present in the live GET /v1/protocols response.
 */
const BLUE_CHIP_PROTOCOLS = ['aave', 'morpho', 'euler', 'pendle', 'yearn']

export const STRATEGIES: Record<StrategyPreset, StrategyConfig> = {
  conservative: {
    name: 'conservative',
    description:
      'Stablecoin-tagged, TVL > $50M, blue-chip protocols, no ' +
      'impermanent-loss exposure, verification-flagged vaults excluded',
    filters: {
      tags: ['stablecoin'],
      excludeTags: ['il-risk'],
      minTvlUsd: 50_000_000,
      protocols: BLUE_CHIP_PROTOCOLS,
      excludeFlagged: true,
      isRedeemable: true,
    },
    sort: 'apy',
    sortDirection: 'desc',
  },

  'max-apy': {
    name: 'max-apy',
    description:
      'Sort by APY descending, no TVL floor. Flagged vaults are still ' +
      'excluded — a vault flagged for apy_outlier would otherwise top the list',
    filters: {
      excludeFlagged: true,
    },
    sort: 'apy',
    sortDirection: 'desc',
  },

  diversified: {
    name: 'diversified',
    description:
      'Spread across 3+ chains, 3+ protocols, mix of stablecoin + LST',
    filters: {
      minTvlUsd: 1_000_000,
      excludeFlagged: true,
    },
    sort: 'apy',
    sortDirection: 'desc',
  },

  'risk-adjusted': {
    name: 'risk-adjusted',
    description: 'Filter by risk score >= 7, then sort by APY',
    filters: {
      minRiskScore: 7,
      excludeFlagged: true,
    },
    sort: 'apy',
    sortDirection: 'desc',
  },
}

export function getStrategy(preset: StrategyPreset): StrategyConfig {
  return STRATEGIES[preset]
}
