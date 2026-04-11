// SPDX-License-Identifier: Apache-2.0
import { useQuery } from '@tanstack/react-query';
import type { ApyDataPoint } from '@earnforge/sdk';
import { useEarnForge } from '../context.js';

export interface UseApyHistoryReturn {
  data: ApyDataPoint[] | undefined;
  isLoading: boolean;
  error: Error | null;
}

/**
 * Fetch 30-day APY history for a vault from DeFiLlama.
 *
 * ```tsx
 * const { data: history } = useApyHistory('0xabc...', 8453);
 * ```
 */
export function useApyHistory(
  vaultAddress: string | undefined,
  chainId: number | undefined,
): UseApyHistoryReturn {
  const sdk = useEarnForge();

  const query = useQuery<ApyDataPoint[], Error>({
    queryKey: ['earnforge', 'apyHistory', vaultAddress, chainId],
    queryFn: () => sdk.getApyHistory(vaultAddress!, chainId!),
    enabled: !!vaultAddress && !!chainId,
  });

  return {
    data: query.data,
    isLoading: query.isLoading,
    error: query.error,
  };
}
