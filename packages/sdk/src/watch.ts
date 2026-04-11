// SPDX-License-Identifier: Apache-2.0
import type { EarnDataClient } from './clients/index.js';
import type { Vault } from './schemas/index.js';
import { parseTvl } from './schemas/vault.js';

export interface WatchOptions {
  apyDropPercent?: number;
  tvlDropPercent?: number;
  interval?: number;
}

export type WatchEventType = 'apy-drop' | 'tvl-drop' | 'update';

export interface WatchEvent {
  type: WatchEventType;
  vault: Vault;
  previous: { apy: number; tvlUsd: number };
  current: { apy: number; tvlUsd: number };
  timestamp: Date;
}

/**
 * Watch a vault for APY/TVL changes.
 * Returns an AsyncIterable that yields events.
 */
export async function* watch(
  client: EarnDataClient,
  vaultSlug: string,
  options: WatchOptions = {},
): AsyncGenerator<WatchEvent> {
  const interval = options.interval ?? 60_000;
  const apyThreshold = options.apyDropPercent ?? 20;
  const tvlThreshold = options.tvlDropPercent ?? 30;

  let previous: { apy: number; tvlUsd: number } | null = null;

  while (true) {
    const vault = await client.getVaultBySlug(vaultSlug);
    const currentApy = vault.analytics.apy.total;
    const currentTvl = parseTvl(vault.analytics.tvl).parsed;

    const current = { apy: currentApy, tvlUsd: currentTvl };

    if (previous) {
      // Check APY drop
      if (previous.apy > 0) {
        const apyDrop = ((previous.apy - currentApy) / previous.apy) * 100;
        if (apyDrop >= apyThreshold) {
          yield {
            type: 'apy-drop',
            vault,
            previous,
            current,
            timestamp: new Date(),
          };
        }
      }

      // Check TVL drop
      if (previous.tvlUsd > 0) {
        const tvlDrop = ((previous.tvlUsd - currentTvl) / previous.tvlUsd) * 100;
        if (tvlDrop >= tvlThreshold) {
          yield {
            type: 'tvl-drop',
            vault,
            previous,
            current,
            timestamp: new Date(),
          };
        }
      }

      yield { type: 'update', vault, previous, current, timestamp: new Date() };
    } else {
      yield { type: 'update', vault, previous: current, current, timestamp: new Date() };
    }

    previous = current;
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
}
