// SPDX-License-Identifier: Apache-2.0
import { useQuery } from '@tanstack/react-query'
import type { Vault } from '@earnforge/sdk'
import { useEarnForge } from '../context.js'

export interface UseVaultReturn {
  data: Vault | undefined
  isLoading: boolean
  error: Error | null
}

/**
 * Fetch a single vault by its slug.
 *
 * ```tsx
 * const { data: vault, isLoading } = useVault('aave-v3-usdc-base');
 * ```
 */
export function useVault(slug: string | undefined): UseVaultReturn {
  const sdk = useEarnForge()

  const query = useQuery<Vault, Error>({
    queryKey: ['earnforge', 'vault', slug],
    queryFn: () => sdk.vaults.get(slug!),
    enabled: !!slug,
  })

  return {
    data: query.data,
    isLoading: query.isLoading,
    error: query.error,
  }
}
