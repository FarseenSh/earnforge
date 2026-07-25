// SPDX-License-Identifier: Apache-2.0

export {
  type AllowanceResult,
  type ApprovalTx,
  buildApprovalTx,
  checkAllowance,
  MAX_UINT256,
} from './allowance.js'
export { type ApyDataPoint, getApyHistory } from './apy-history.js'
export {
  buildDepositQuote,
  type DepositQuoteOptions,
  type DepositQuoteResult,
  fromSmallestUnit,
  toSmallestUnit,
} from './build-deposit-quote.js'
export {
  buildRedeemQuote,
  type RedeemQuoteOptions,
  type RedeemQuoteResult,
} from './build-redeem-quote.js'
export * from './cache.js'
export {
  ComposerClient,
  type ComposerClientOptions,
  EarnDataClient,
  type EarnDataClientOptions,
  type QuoteParams,
  type VaultListParams,
} from './clients/index.js'
export * from './errors.js'
export {
  type GasOptimizeOptions,
  type GasRoute,
  optimizeGasRoutes,
} from './gas-optimizer.js'
export {
  type PreflightOptions,
  type PreflightReport,
  preflight,
} from './preflight.js'
export * from './rate-limiter.js'
export * from './retry.js'
export {
  type RiskBreakdown,
  type RiskScore,
  rewardShareOfTotal,
  riskLabel,
  riskScore,
} from './risk-scorer.js'
// ── Re-exports ──
export * from './schemas/index.js'
export { getBestApy, parseTvl, type TvlParsed } from './schemas/vault.js'
export {
  getStrategy,
  STRATEGIES,
  type StrategyConfig,
  type StrategyPreset,
} from './strategies.js'
export {
  type Allocation,
  type SuggestParams,
  type SuggestResult,
  suggest,
} from './suggest.js'
export {
  type WatchEvent,
  type WatchEventType,
  type WatchOptions,
  watch,
} from './watch.js'

import { type ApyDataPoint, getApyHistory } from './apy-history.js'
import {
  buildDepositQuote,
  type DepositQuoteOptions,
} from './build-deposit-quote.js'
import {
  buildRedeemQuote,
  type RedeemQuoteOptions,
} from './build-redeem-quote.js'
// ── Factory ──
import {
  ComposerClient,
  EarnDataClient,
  type EarnDataClientOptions,
} from './clients/index.js'
import {
  type GasOptimizeOptions,
  type GasRoute,
  optimizeGasRoutes,
} from './gas-optimizer.js'
import {
  type PreflightOptions,
  type PreflightReport,
  preflight,
} from './preflight.js'
import { type RiskScore, riskScore } from './risk-scorer.js'
import { isFlagged, parseTvl } from './schemas/vault.js'
import { STRATEGIES, type StrategyPreset } from './strategies.js'
import { type SuggestParams, type SuggestResult, suggest } from './suggest.js'
import { type WatchEvent, type WatchOptions, watch } from './watch.js'

export {
  type DriftFinding,
  type DriftReport,
  type DriftSeverity,
  detectDrift,
  formatDriftReport,
} from './drift.js'

import type {
  Chain,
  PortfolioResponse,
  ProtocolDetail,
  Vault,
  VaultListResponse,
} from './schemas/index.js'

export interface EarnForgeOptions {
  /**
   * LI.FI API key for the Earn Data API. Required — earn.li.fi returns 401
   * without one as of Apr 2026. Falls back to `process.env.LIFI_API_KEY`.
   * The same key works for Composer, so passing `apiKey` alone is enough.
   */
  apiKey?: string
  /** Composer API key. Defaults to `apiKey` when omitted. */
  composerApiKey?: string
  earnData?: EarnDataClientOptions
  composerBaseUrl?: string
  cache?: { ttl?: number; maxSize?: number }
}

export interface EarnForge {
  vaults: {
    list: (params?: VaultListQueryParams) => Promise<VaultListResponse>
    listAll: (
      params?: Omit<VaultListQueryParams, 'cursor'>
    ) => AsyncIterable<Vault>
    get: (slug: string) => Promise<Vault>
    top: (params?: TopVaultsParams) => Promise<Vault[]>
  }
  chains: {
    list: () => Promise<Chain[]>
  }
  protocols: {
    list: () => Promise<ProtocolDetail[]>
  }
  portfolio: {
    get: (wallet: string) => Promise<PortfolioResponse>
  }
  buildDepositQuote: (
    vault: Vault,
    options: DepositQuoteOptions
  ) => Promise<import('./build-deposit-quote.js').DepositQuoteResult>
  buildRedeemQuote: (
    vault: Vault,
    options: RedeemQuoteOptions
  ) => Promise<import('./build-redeem-quote.js').RedeemQuoteResult>
  preflight: (
    vault: Vault,
    wallet: string,
    options?: PreflightOptions
  ) => PreflightReport
  riskScore: (vault: Vault) => RiskScore
  suggest: (
    params: SuggestParams & { vaults?: Vault[] }
  ) => Promise<SuggestResult>
  optimizeGasRoutes: (
    vault: Vault,
    options: GasOptimizeOptions
  ) => Promise<GasRoute[]>
  watch: (
    vaultSlug: string,
    options?: WatchOptions
  ) => AsyncGenerator<WatchEvent>
  getApyHistory: {
    (vault: Vault): Promise<ApyDataPoint[]>
    (vaultAddress: string, chainId: number): Promise<ApyDataPoint[]>
  }
  earnDataClient: EarnDataClient
  composerClient: ComposerClient | null
}

interface VaultListQueryParams {
  chainId?: number
  asset?: string
  minTvl?: number
  sortBy?: string
  cursor?: string
  strategy?: StrategyPreset
}

interface TopVaultsParams {
  asset?: string
  chainId?: number
  limit?: number
  strategy?: StrategyPreset
  minTvl?: number
}

/**
 * Create an EarnForge instance — the main entry point.
 *
 * ```ts
 * const forge = createEarnForge({ composerApiKey: process.env.LIFI_API_KEY });
 * for await (const vault of forge.vaults.listAll({ chainId: 8453 })) {
 *   console.log(vault.name, vault.analytics.apy.total);
 * }
 * ```
 */
export function createEarnForge(options: EarnForgeOptions = {}): EarnForge {
  const earnData = new EarnDataClient({
    apiKey: options.apiKey,
    cache: options.cache,
    ...options.earnData,
  })

  // One LI.FI key authenticates both services, so `apiKey` alone is enough;
  // `composerApiKey` stays available for setups that issue separate keys.
  const composerKey = options.composerApiKey ?? options.apiKey
  const composer = composerKey
    ? new ComposerClient({
        apiKey: composerKey,
        baseUrl: options.composerBaseUrl,
      })
    : null

  function requireComposer(): ComposerClient {
    if (!composer) {
      throw new Error(
        'Composer API key required. Pass composerApiKey to createEarnForge() or set LIFI_API_KEY.'
      )
    }
    return composer
  }

  async function getTopVaults(params: TopVaultsParams = {}): Promise<Vault[]> {
    const limit = params.limit ?? 10
    const strategy = params.strategy ? STRATEGIES[params.strategy] : null
    const vaults: Vault[] = []

    for await (const vault of earnData.listAllVaults({
      chainId: params.chainId,
      asset: params.asset,
      minTvl: params.minTvl,
    })) {
      // Apply strategy filters
      if (strategy) {
        const tvlUsd = parseTvl(vault.analytics.tvl).parsed
        if (strategy.filters.minTvlUsd && tvlUsd < strategy.filters.minTvlUsd) {
          continue
        }
        // Drop vaults LI.FI's verification pass flagged. Without this a vault
        // flagged for apy_outlier sorts straight to the top of max-apy.
        if (strategy.filters.excludeFlagged && isFlagged(vault)) {
          continue
        }
        if (
          strategy.filters.tags &&
          !strategy.filters.tags.some((t) => vault.tags.includes(t))
        ) {
          continue
        }
        if (strategy.filters.excludeTags?.some((t) => vault.tags.includes(t))) {
          continue
        }
        // Match on protocol.id — the unversioned filter key — falling back to
        // name for vaults cached before the id field existed.
        if (
          strategy.filters.protocols &&
          !strategy.filters.protocols.includes(
            vault.protocol.id ?? vault.protocol.name
          )
        ) {
          continue
        }
        if (
          strategy.filters.minRiskScore &&
          riskScore(vault).score < strategy.filters.minRiskScore
        ) {
          continue
        }
      }

      vaults.push(vault)
      if (vaults.length >= limit * 3) {
        break // Fetch extra for sorting
      }
    }

    // Sort
    vaults.sort((a, b) => b.analytics.apy.total - a.analytics.apy.total)

    return vaults.slice(0, limit)
  }

  return {
    vaults: {
      list: (params) => earnData.listVaults(params),
      listAll: (params) => earnData.listAllVaults(params),
      get: (slug) => earnData.getVaultBySlug(slug),
      top: getTopVaults,
    },
    chains: {
      list: () => earnData.listChains(),
    },
    protocols: {
      list: () => earnData.listProtocols(),
    },
    portfolio: {
      get: (wallet) => earnData.getPortfolio(wallet),
    },
    buildDepositQuote: (vault, opts) =>
      buildDepositQuote(vault, opts, requireComposer()),
    buildRedeemQuote: (vault, opts) =>
      buildRedeemQuote(vault, opts, requireComposer()),
    preflight: (vault, wallet, opts) => preflight(vault, wallet, opts),
    riskScore: (vault) => riskScore(vault),
    suggest: async (params) => {
      const vaults = params.vaults ?? []
      if (vaults.length === 0) {
        // Fetch vaults if not provided
        const allVaults: Vault[] = []
        for await (const v of earnData.listAllVaults({ asset: params.asset })) {
          allVaults.push(v)
        }
        return suggest(allVaults, params)
      }
      return suggest(vaults, params)
    },
    optimizeGasRoutes: (vault, opts) =>
      optimizeGasRoutes(vault, requireComposer(), opts),
    watch: (slug, opts) => watch(earnData, slug, opts),
    getApyHistory,
    earnDataClient: earnData,
    composerClient: composer,
  }
}
