// SPDX-License-Identifier: Apache-2.0
import { useQuery } from '@tanstack/react-query';
import type { PortfolioResponse } from '@earnforge/sdk';
import { useEarnForge } from '../context.js';

export interface UsePortfolioReturn {
  data: PortfolioResponse | undefined;
  isLoading: boolean;
  error: Error | null;
}

/**
 * Fetch portfolio positions for a wallet address.
 *
 * ```tsx
 * const { data } = usePortfolio('0xabc...');
 * ```
 */
export function usePortfolio(wallet: string | undefined): UsePortfolioReturn {
  const sdk = useEarnForge();

  const query = useQuery<PortfolioResponse, Error>({
    queryKey: ['earnforge', 'portfolio', wallet],
    queryFn: () => sdk.portfolio.get(wallet!),
    enabled: !!wallet,
  });

  return {
    data: query.data,
    isLoading: query.isLoading,
    error: query.error,
  };
}
