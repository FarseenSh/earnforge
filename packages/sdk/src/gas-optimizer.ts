// SPDX-License-Identifier: Apache-2.0
import type { ComposerClient } from './clients/index.js';
import type { Vault, QuoteResponse } from './schemas/index.js';
import { toSmallestUnit } from './build-deposit-quote.js';

export interface GasRoute {
  fromChain: number;
  fromChainName: string;
  quote: QuoteResponse;
  totalCostUsd: number;
  gasCostUsd: number;
  feeCostUsd: number;
  executionDuration: number;
}

export interface GasOptimizeOptions {
  fromAmount: string;
  wallet: string;
  fromToken?: string;
  fromChains?: number[];
  fromAmountForGas?: string;
}

const CHAIN_NAMES: Record<number, string> = {
  1: 'Ethereum',
  10: 'Optimism',
  56: 'BSC',
  100: 'Gnosis',
  137: 'Polygon',
  146: 'Sonic',
  5000: 'Mantle',
  8453: 'Base',
  42161: 'Arbitrum',
  42220: 'Celo',
  43114: 'Avalanche',
  59144: 'Linea',
};

/**
 * Compare deposit routes from multiple source chains.
 * Returns routes sorted by total cost (cheapest first).
 * Integrates LI.Fuel via fromAmountForGas parameter.
 */
export async function optimizeGasRoutes(
  vault: Vault,
  composer: ComposerClient,
  options: GasOptimizeOptions,
): Promise<GasRoute[]> {
  const fromChains = options.fromChains ?? [vault.chainId];
  const decimals = vault.underlyingTokens[0]?.decimals ?? 18;
  const rawAmount = toSmallestUnit(options.fromAmount, decimals);

  const fromToken =
    options.fromToken ?? vault.underlyingTokens[0]?.address;

  if (!fromToken) return [];

  const routePromises = fromChains.map(async (fromChain): Promise<GasRoute | null> => {
    try {
      const quote = await composer.getQuote({
        fromChain,
        toChain: vault.chainId,
        fromToken,
        toToken: vault.address,
        fromAddress: options.wallet,
        toAddress: options.wallet,
        fromAmount: rawAmount,
        fromAmountForGas: options.fromAmountForGas,
      });

      const gasCostUsd = (quote.estimate.gasCosts ?? []).reduce(
        (sum, g) => sum + Number(g.amountUSD),
        0,
      );
      const feeCostUsd = (quote.estimate.feeCosts ?? []).reduce(
        (sum, f) => sum + Number(f.amountUSD),
        0,
      );

      return {
        fromChain,
        fromChainName: CHAIN_NAMES[fromChain] ?? `Chain ${fromChain}`,
        quote,
        totalCostUsd: gasCostUsd + feeCostUsd,
        gasCostUsd,
        feeCostUsd,
        executionDuration: quote.estimate.executionDuration,
      };
    } catch {
      return null;
    }
  });

  const results = await Promise.all(routePromises);
  return results
    .filter((r): r is GasRoute => r !== null)
    .sort((a, b) => a.totalCostUsd - b.totalCostUsd);
}
