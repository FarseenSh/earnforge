// SPDX-License-Identifier: Apache-2.0
import { useQuery } from '@tanstack/react-query'
import type { SuggestResult, StrategyPreset } from '@earnforge/sdk'
import { useEarnForge } from '../context.js'

export interface UseSuggestParams {
  amount: number
  asset?: string
  maxChains?: number
  strategy?: StrategyPreset
}

export interface UseSuggestReturn {
  data: SuggestResult | undefined
  isLoading: boolean
  error: Error | null
}

/**
 * Get a suggested portfolio allocation based on the given parameters.
 *
 * ```tsx
 * const { data } = useSuggest({ amount: 10_000, asset: 'USDC' });
 * // data.allocations — the recommended split
 * ```
 */
export function useSuggest(
  params: UseSuggestParams | undefined
): UseSuggestReturn {
  const sdk = useEarnForge()

  const query = useQuery<SuggestResult, Error>({
    queryKey: ['earnforge', 'suggest', params],
    queryFn: () =>
      sdk.suggest({
        amount: params!.amount,
        asset: params!.asset,
        maxChains: params!.maxChains,
        strategy: params!.strategy,
      }),
    enabled: !!params && params.amount > 0,
  })

  return {
    data: query.data,
    isLoading: query.isLoading,
    error: query.error,
  }
}
