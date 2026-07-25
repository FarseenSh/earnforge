// SPDX-License-Identifier: Apache-2.0

import type { EarnForge } from '@earnforge/sdk'
import { createEarnForge } from '@earnforge/sdk'

let instance: EarnForge | null = null

/**
 * Placeholder key used by the browser instance.
 *
 * `EarnDataClient` refuses to construct without a key, but the browser must
 * never hold the real one. In the browser the client is pointed at our own
 * `/api/earn` proxy, which strips this value and attaches the genuine key
 * server-side — so what is sent from the browser is deliberately worthless.
 */
const PROXIED_KEY_PLACEHOLDER = 'proxied-via-api-route'

/**
 * Returns a singleton EarnForge SDK instance.
 *
 * SECURITY: the Earn Data API requires an `x-lifi-api-key` header as of
 * Apr 2026, so it can no longer be called directly from the browser — doing so
 * would expose the credential in the network tab. Browser calls are routed
 * through `/api/earn`, which injects the key server-side. Server-side callers
 * get a client that talks to earn.li.fi directly.
 *
 * Never use a `NEXT_PUBLIC_` prefix for the key.
 */
export function getEarnForge(): EarnForge {
  if (!instance) {
    const isServer = typeof window === 'undefined'

    instance = isServer
      ? createEarnForge({
          apiKey: process.env.LIFI_API_KEY,
        })
      : createEarnForge({
          apiKey: PROXIED_KEY_PLACEHOLDER,
          earnData: {
            apiKey: PROXIED_KEY_PLACEHOLDER,
            baseUrl: '/api/earn',
          },
        })
  }
  return instance
}

/** Reset the singleton. Test-only. */
export function resetEarnForge(): void {
  instance = null
}
