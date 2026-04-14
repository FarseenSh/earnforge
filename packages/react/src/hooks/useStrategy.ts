// SPDX-License-Identifier: Apache-2.0
import { useMemo } from 'react'
import {
  getStrategy,
  type StrategyPreset,
  type StrategyConfig,
} from '@earnforge/sdk'

export interface UseStrategyReturn {
  data: StrategyConfig | undefined
  filters: StrategyConfig['filters'] | undefined
  sort: StrategyConfig['sort'] | undefined
  sortDirection: StrategyConfig['sortDirection'] | undefined
}

/**
 * Resolve a strategy preset into its filter configuration.
 * Use the returned `filters` to pass into `useVaults` or `useEarnTopYield`.
 *
 * ```tsx
 * const { filters } = useStrategy('conservative');
 * const { data } = useVaults({ ...filters });
 * ```
 */
export function useStrategy(
  preset: StrategyPreset | undefined
): UseStrategyReturn {
  const data = useMemo(() => {
    if (!preset) return undefined
    return getStrategy(preset)
  }, [preset])

  return {
    data,
    filters: data?.filters,
    sort: data?.sort,
    sortDirection: data?.sortDirection,
  }
}
