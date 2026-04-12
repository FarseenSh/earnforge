// SPDX-License-Identifier: Apache-2.0
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Vault, VaultListResponse } from '@earnforge/sdk';
import type { StrategyPreset } from '@earnforge/sdk';
import { useEarnForge } from '../context.js';

export interface UseVaultsParams {
  chainId?: number;
  asset?: string;
  minTvl?: number;
  sortBy?: string;
  limit?: number;
  strategy?: StrategyPreset;
}

export interface UseVaultsReturn {
  data: Vault[] | undefined;
  isLoading: boolean;
  error: Error | null;
  fetchMore: () => void;
  hasMore: boolean;
}

/**
 * Fetch a paginated list of vaults with optional filters.
 * Resets accumulated data when params change.
 *
 * ```tsx
 * const { data, isLoading, fetchMore, hasMore } = useVaults({ chainId: 8453 });
 * ```
 */
export function useVaults(params: UseVaultsParams = {}): UseVaultsReturn {
  const sdk = useEarnForge();
  const queryClient = useQueryClient();
  const cursorRef = useRef<string | null>(null);
  const accumulatedRef = useRef<Vault[]>([]);

  // Stable serialized params key for comparison
  const paramsKey = useMemo(
    () => JSON.stringify({ chainId: params.chainId, asset: params.asset, minTvl: params.minTvl, sortBy: params.sortBy, strategy: params.strategy }),
    [params.chainId, params.asset, params.minTvl, params.sortBy, params.strategy],
  );

  // Reset accumulated data and cursor when params change
  useEffect(() => {
    cursorRef.current = null;
    accumulatedRef.current = [];
  }, [paramsKey]);

  const queryKey = useMemo(
    () => ['earnforge', 'vaults', paramsKey, cursorRef.current] as const,
    [paramsKey],
  );

  const query = useQuery<VaultListResponse, Error>({
    queryKey,
    queryFn: async () => {
      const result = await sdk.vaults.list({
        chainId: params.chainId,
        asset: params.asset,
        minTvl: params.minTvl,
        sortBy: params.sortBy,
        strategy: params.strategy,
        cursor: cursorRef.current ?? undefined,
      });
      cursorRef.current = result.nextCursor;

      if (accumulatedRef.current.length === 0) {
        accumulatedRef.current = result.data;
      } else {
        accumulatedRef.current = [...accumulatedRef.current, ...result.data];
      }

      return {
        ...result,
        data: params.limit
          ? accumulatedRef.current.slice(0, params.limit)
          : accumulatedRef.current,
      };
    },
  });

  const fetchMore = useCallback(() => {
    if (cursorRef.current) {
      queryClient.invalidateQueries({ queryKey });
    }
  }, [queryClient, queryKey]);

  return {
    data: query.data?.data,
    isLoading: query.isLoading,
    error: query.error,
    fetchMore,
    hasMore: cursorRef.current !== null,
  };
}
