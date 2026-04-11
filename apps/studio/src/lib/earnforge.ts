// SPDX-License-Identifier: Apache-2.0
import { createEarnForge } from '@earnforge/sdk';
import type { EarnForge } from '@earnforge/sdk';

let instance: EarnForge | null = null;

/**
 * Returns a singleton EarnForge SDK instance.
 * Uses NEXT_PUBLIC_LIFI_API_KEY for the Composer API key if available.
 */
export function getEarnForge(): EarnForge {
  if (!instance) {
    instance = createEarnForge({
      composerApiKey:
        typeof window !== 'undefined'
          ? (process.env.NEXT_PUBLIC_LIFI_API_KEY ?? undefined)
          : (process.env.NEXT_PUBLIC_LIFI_API_KEY ?? undefined),
    });
  }
  return instance;
}
