// SPDX-License-Identifier: Apache-2.0

import { toSmallestUnitNonZero } from './build-deposit-quote.js'
import type { ComposerClient } from './clients/index.js'
import type { QuoteResponse, Vault } from './schemas/index.js'

export interface GasRoute {
  fromChain: number
  fromChainName: string
  quote: QuoteResponse
  totalCostUsd: number
  gasCostUsd: number
  feeCostUsd: number
  executionDuration: number
}

export interface GasOptimizeOptions {
  fromAmount: string
  wallet: string
  /** Token address on the vault's chain (used for same-chain route) */
  fromToken?: string
  /** Map of chainId → token address for cross-chain routes */
  fromTokens?: Record<number, string>
  fromChains?: number[]
  fromAmountForGas?: string
}

const CHAIN_NAMES: Record<number, string> = {
  1: 'Ethereum',
  10: 'Optimism',
  56: 'BSC',
  100: 'Gnosis',
  130: 'Unichain',
  137: 'Polygon',
  143: 'Monad',
  146: 'Sonic',
  5000: 'Mantle',
  8453: 'Base',
  42161: 'Arbitrum',
  42220: 'Celo',
  43114: 'Avalanche',
  59144: 'Linea',
  80094: 'Berachain',
  747474: 'Katana',
}

/**
 * How many Composer quotes `optimizeGasRoutes` may have in flight at once.
 *
 * This used to be `Promise.all` over every source chain, so a single
 * "where is this cheapest from?" question opened one simultaneous connection
 * per chain — 17 against the current fleet, to LI.FI's most expensive
 * endpoint. Four keeps the comparison fast while leaving the burst small
 * enough that the client's own rate limiter is a backstop rather than the
 * only thing standing between a user and a 429.
 */
const MAX_CONCURRENT_QUOTES = 4

/** Map over `items` with at most `limit` workers running concurrently. */
async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length)
  let next = 0
  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      while (next < items.length) {
        const i = next++
        results[i] = await fn(items[i] as T)
      }
    }
  )
  await Promise.all(workers)
  return results
}

/**
 * Compare deposit routes from multiple source chains.
 * Returns routes sorted by total cost (cheapest first).
 * Integrates LI.Fuel via fromAmountForGas parameter.
 */
export async function optimizeGasRoutes(
  vault: Vault,
  composer: ComposerClient,
  options: GasOptimizeOptions
): Promise<GasRoute[]> {
  const fromChains = options.fromChains ?? [vault.chainId]
  const decimals = vault.underlyingTokens[0]?.decimals ?? 18
  const rawAmount = toSmallestUnitNonZero(options.fromAmount, decimals)

  const defaultFromToken =
    options.fromToken ?? vault.underlyingTokens[0]?.address

  if (!defaultFromToken && !options.fromTokens) {
    return []
  }

  const quoteChain = async (fromChain: number): Promise<GasRoute | null> => {
    try {
      // For cross-chain routes, use the chain-specific token address if available
      const fromToken =
        options.fromTokens?.[fromChain] ??
        (fromChain === vault.chainId ? defaultFromToken : undefined)

      if (!fromToken) {
        return null // Skip chains without a known fromToken
      }

      const quote = await composer.getQuote({
        fromChain,
        toChain: vault.chainId,
        fromToken,
        toToken: vault.address,
        fromAddress: options.wallet,
        toAddress: options.wallet,
        fromAmount: rawAmount,
        fromAmountForGas: options.fromAmountForGas,
      })

      const gasCostUsd = (quote.estimate.gasCosts ?? []).reduce(
        (sum, g) => sum + Number(g.amountUSD),
        0
      )
      const feeCostUsd = (quote.estimate.feeCosts ?? []).reduce(
        (sum, f) => sum + Number(f.amountUSD),
        0
      )

      return {
        fromChain,
        fromChainName: CHAIN_NAMES[fromChain] ?? `Chain ${fromChain}`,
        quote,
        totalCostUsd: gasCostUsd + feeCostUsd,
        gasCostUsd,
        feeCostUsd,
        executionDuration: quote.estimate.executionDuration,
      }
    } catch {
      return null
    }
  }

  const results = await mapWithConcurrency(
    fromChains,
    MAX_CONCURRENT_QUOTES,
    quoteChain
  )
  return results
    .filter((r): r is GasRoute => r !== null)
    .sort((a, b) => a.totalCostUsd - b.totalCostUsd)
}
