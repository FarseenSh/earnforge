// SPDX-License-Identifier: Apache-2.0

// ── Re-exports ──
export * from './schemas/index.js';
export * from './errors.js';
export * from './rate-limiter.js';
export * from './cache.js';
export * from './retry.js';
export { EarnDataClient, type EarnDataClientOptions, type VaultListParams } from './clients/index.js';
export { ComposerClient, type ComposerClientOptions, type QuoteParams } from './clients/index.js';
export { buildDepositQuote, toSmallestUnit, fromSmallestUnit, type DepositQuoteOptions, type DepositQuoteResult } from './build-deposit-quote.js';
export { buildRedeemQuote, type RedeemQuoteOptions, type RedeemQuoteResult } from './build-redeem-quote.js';
export { preflight, type PreflightReport, type PreflightOptions } from './preflight.js';
export { riskScore, type RiskScore, type RiskBreakdown } from './risk-scorer.js';
export { suggest, type SuggestParams, type SuggestResult, type Allocation } from './suggest.js';
export { STRATEGIES, getStrategy, type StrategyPreset, type StrategyConfig } from './strategies.js';
export { optimizeGasRoutes, type GasRoute, type GasOptimizeOptions } from './gas-optimizer.js';
export { watch, type WatchOptions, type WatchEvent, type WatchEventType } from './watch.js';
export { getApyHistory, type ApyDataPoint } from './apy-history.js';
export { parseTvl, getBestApy, type TvlParsed } from './schemas/vault.js';
export { checkAllowance, buildApprovalTx, MAX_UINT256, type AllowanceResult, type ApprovalTx } from './allowance.js';

// ── Factory ──
import { EarnDataClient, type EarnDataClientOptions } from './clients/index.js';
import { ComposerClient } from './clients/index.js';
import { buildDepositQuote, type DepositQuoteOptions } from './build-deposit-quote.js';
import { buildRedeemQuote, type RedeemQuoteOptions } from './build-redeem-quote.js';
import { preflight, type PreflightOptions, type PreflightReport } from './preflight.js';
import { riskScore, type RiskScore } from './risk-scorer.js';
import { suggest, type SuggestParams, type SuggestResult } from './suggest.js';
import { STRATEGIES, type StrategyPreset } from './strategies.js';
import { optimizeGasRoutes, type GasOptimizeOptions, type GasRoute } from './gas-optimizer.js';
import { watch, type WatchOptions, type WatchEvent } from './watch.js';
import { getApyHistory, type ApyDataPoint } from './apy-history.js';
import { parseTvl } from './schemas/vault.js';
import type { Vault, Chain, ProtocolDetail, PortfolioResponse, VaultListResponse } from './schemas/index.js';

export interface EarnForgeOptions {
  composerApiKey?: string;
  earnData?: EarnDataClientOptions;
  composerBaseUrl?: string;
  cache?: { ttl?: number; maxSize?: number };
}

export interface EarnForge {
  vaults: {
    list: (params?: VaultListQueryParams) => Promise<VaultListResponse>;
    listAll: (params?: Omit<VaultListQueryParams, 'cursor'>) => AsyncIterable<Vault>;
    get: (slug: string) => Promise<Vault>;
    top: (params?: TopVaultsParams) => Promise<Vault[]>;
  };
  chains: {
    list: () => Promise<Chain[]>;
  };
  protocols: {
    list: () => Promise<ProtocolDetail[]>;
  };
  portfolio: {
    get: (wallet: string) => Promise<PortfolioResponse>;
  };
  buildDepositQuote: (vault: Vault, options: DepositQuoteOptions) => Promise<import('./build-deposit-quote.js').DepositQuoteResult>;
  buildRedeemQuote: (vault: Vault, options: RedeemQuoteOptions) => Promise<import('./build-redeem-quote.js').RedeemQuoteResult>;
  preflight: (vault: Vault, wallet: string, options?: PreflightOptions) => PreflightReport;
  riskScore: (vault: Vault) => RiskScore;
  suggest: (params: SuggestParams & { vaults?: Vault[] }) => Promise<SuggestResult>;
  optimizeGasRoutes: (vault: Vault, options: GasOptimizeOptions) => Promise<GasRoute[]>;
  watch: (vaultSlug: string, options?: WatchOptions) => AsyncGenerator<WatchEvent>;
  getApyHistory: (vaultAddress: string, chainId: number) => Promise<ApyDataPoint[]>;
  earnDataClient: EarnDataClient;
  composerClient: ComposerClient | null;
}

interface VaultListQueryParams {
  chainId?: number;
  asset?: string;
  minTvl?: number;
  sortBy?: string;
  cursor?: string;
  strategy?: StrategyPreset;
}

interface TopVaultsParams {
  asset?: string;
  chainId?: number;
  limit?: number;
  strategy?: StrategyPreset;
  minTvl?: number;
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
    cache: options.cache,
    ...options.earnData,
  });

  const composer = options.composerApiKey
    ? new ComposerClient({
        apiKey: options.composerApiKey,
        baseUrl: options.composerBaseUrl,
      })
    : null;

  function requireComposer(): ComposerClient {
    if (!composer) {
      throw new Error(
        'Composer API key required. Pass composerApiKey to createEarnForge() or set LIFI_API_KEY.',
      );
    }
    return composer;
  }

  async function getTopVaults(params: TopVaultsParams = {}): Promise<Vault[]> {
    const limit = params.limit ?? 10;
    const strategy = params.strategy ? STRATEGIES[params.strategy] : null;
    const vaults: Vault[] = [];

    for await (const vault of earnData.listAllVaults({
      chainId: params.chainId,
      asset: params.asset,
      minTvl: params.minTvl,
    })) {
      // Apply strategy filters
      if (strategy) {
        const tvlUsd = parseTvl(vault.analytics.tvl).parsed;
        if (strategy.filters.minTvlUsd && tvlUsd < strategy.filters.minTvlUsd) continue;
        if (strategy.filters.tags && !strategy.filters.tags.some((t) => vault.tags.includes(t))) continue;
        if (strategy.filters.protocols && !strategy.filters.protocols.includes(vault.protocol.name)) continue;
        if (strategy.filters.minRiskScore && riskScore(vault).score < strategy.filters.minRiskScore) continue;
      }

      vaults.push(vault);
      if (vaults.length >= limit * 3) break; // Fetch extra for sorting
    }

    // Sort
    vaults.sort((a, b) => b.analytics.apy.total - a.analytics.apy.total);

    return vaults.slice(0, limit);
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
    buildDepositQuote: (vault, opts) => buildDepositQuote(vault, opts, requireComposer()),
    buildRedeemQuote: (vault, opts) => buildRedeemQuote(vault, opts, requireComposer()),
    preflight: (vault, wallet, opts) => preflight(vault, wallet, opts),
    riskScore: (vault) => riskScore(vault),
    suggest: async (params) => {
      const vaults = params.vaults ?? [];
      if (vaults.length === 0) {
        // Fetch vaults if not provided
        const allVaults: Vault[] = [];
        for await (const v of earnData.listAllVaults({ asset: params.asset })) {
          allVaults.push(v);
        }
        return suggest(allVaults, params);
      }
      return suggest(vaults, params);
    },
    optimizeGasRoutes: (vault, opts) => optimizeGasRoutes(vault, requireComposer(), opts),
    watch: (slug, opts) => watch(earnData, slug, opts),
    getApyHistory,
    earnDataClient: earnData,
    composerClient: composer,
  };
}
