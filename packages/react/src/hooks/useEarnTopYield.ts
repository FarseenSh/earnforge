// SPDX-License-Identifier: Apache-2.0
import { useQuery } from '@tanstack/react-query'
import type { Vault } from '@earnforge/sdk'
import type { StrategyPreset } from '@earnforge/sdk'
import { useEarnForge } from '../context.js'

export interface UseEarnTopYieldParams {
  asset?: string
  chainId?: number
  limit?: number
  strategy?: StrategyPreset
  minTvl?: number
}

export interface UseEarnTopYieldReturn {
  data: Vault[] | undefined
  isLoading: boolean
  error: Error | null
}

/**
 * Fetch top-yielding vaults sorted by APY.
 *
 * ```tsx
 * const { data } = useEarnTopYield({ asset: 'USDC', limit: 5 });
 * ```
 */
export function useEarnTopYield(
  params: UseEarnTopYieldParams = {}
): UseEarnTopYieldReturn {
  const sdk = useEarnForge()

  const query = useQuery<Vault[], Error>({
    queryKey: ['earnforge', 'topYield', params],
    queryFn: () =>
      sdk.vaults.top({
        asset: params.asset,
        chainId: params.chainId,
        limit: params.limit,
        strategy: params.strategy,
        minTvl: params.minTvl,
      }),
  })

  return {
    data: query.data,
    isLoading: query.isLoading,
    error: query.error,
  }
}
