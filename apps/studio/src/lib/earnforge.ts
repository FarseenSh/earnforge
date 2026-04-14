// SPDX-License-Identifier: Apache-2.0
import { createEarnForge } from '@earnforge/sdk'
import type { EarnForge } from '@earnforge/sdk'

let instance: EarnForge | null = null

/**
 * Returns a singleton EarnForge SDK instance.
 *
 * SECURITY: The Studio only uses the Earn Data API (no auth needed) for vault
 * browsing, risk scoring, and exploration. The Composer API key is NOT exposed
 * to the client — it is only used server-side for quote generation.
 * Never use NEXT_PUBLIC_ prefix for API keys.
 */
export function getEarnForge(): EarnForge {
  if (!instance) {
    instance = createEarnForge({
      // Only set Composer key server-side — never expose via NEXT_PUBLIC_
      composerApiKey:
        typeof window === 'undefined'
          ? (process.env.LIFI_API_KEY ?? undefined)
          : undefined,
    })
  }
  return instance
}
