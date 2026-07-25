// SPDX-License-Identifier: Apache-2.0

import type { RiskScore, Vault } from '@earnforge/sdk'
import { useMemo } from 'react'
import { useEarnForge } from '../context.js'

export interface UseRiskScoreReturn {
  data: RiskScore | undefined
}

/**
 * Compute a risk score for a vault. This is a synchronous computation
 * wrapped in `useMemo` for referential stability.
 *
 * ```tsx
 * const { data: risk } = useRiskScore(vault);
 * // risk.score, risk.label, risk.breakdown
 * ```
 */
export function useRiskScore(vault: Vault | undefined): UseRiskScoreReturn {
  const sdk = useEarnForge()

  const data = useMemo(() => {
    if (!vault) {
      return undefined
    }
    return sdk.riskScore(vault)
  }, [sdk, vault])

  return { data }
}
