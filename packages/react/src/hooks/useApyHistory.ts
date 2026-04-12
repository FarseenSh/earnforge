// SPDX-License-Identifier: Apache-2.0
import { useQuery } from '@tanstack/react-query';
import type { ApyDataPoint, Vault } from '@earnforge/sdk';
import { useEarnForge } from '../context.js';

export interface UseApyHistoryReturn {
  data: ApyDataPoint[] | undefined;
  isLoading: boolean;
  error: Error | null;
}

/**
 * Fetch 30-day APY history for a vault from DeFiLlama.
 *
 * Accepts a full Vault object for accurate matching (uses protocol name,
 * chain, underlying tokens, symbol, and TVL proximity). Falls back to
 * the less accurate address+chainId matching when only primitives are given.
 *
 * ```tsx
 * // Preferred: pass the full vault object for accurate DeFiLlama matching
 * const { data: history } = useApyHistory(vault);
 *
 * // Legacy: address + chainId (less accurate matching)
 * const { data: history } = useApyHistory('0xabc...', 8453);
 * ```
 */
export function useApyHistory(vault: Vault | undefined): UseApyHistoryReturn;
export function useApyHistory(vaultAddress: string | undefined, chainId: number | undefined): UseApyHistoryReturn;
export function useApyHistory(
  vaultOrAddress: Vault | string | undefined,
  chainId?: number | undefined,
): UseApyHistoryReturn {
  const sdk = useEarnForge();

  // Determine if we received a Vault object or address+chainId
  const isVaultObject = typeof vaultOrAddress === 'object' && vaultOrAddress !== null;
  const vault = isVaultObject ? (vaultOrAddress as Vault) : undefined;
  const address = typeof vaultOrAddress === 'string' ? vaultOrAddress : undefined;

  const enabled = isVaultObject
    ? !!vault
    : !!address && !!chainId;

  // Use vault slug + chainId as cache key for vault objects, address + chainId for legacy
  const queryKey = isVaultObject
    ? ['earnforge', 'apyHistory', vault?.slug, vault?.chainId]
    : ['earnforge', 'apyHistory', address, chainId];

  const query = useQuery<ApyDataPoint[], Error>({
    queryKey,
    queryFn: () => {
      if (vault) {
        // Full vault object — accurate DeFiLlama matching via protocol+chain+tokens
        return sdk.getApyHistory(vault);
      }
      // Legacy: address + chainId
      return sdk.getApyHistory(address!, chainId!);
    },
    enabled,
  });

  return {
    data: query.data,
    isLoading: query.isLoading,
    error: query.error,
  };
}
