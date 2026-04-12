// SPDX-License-Identifier: Apache-2.0
import type { EarnDataClient } from './clients/index.js';
import type { Vault } from './schemas/index.js';
import { parseTvl } from './schemas/vault.js';

export interface WatchOptions {
  apyDropPercent?: number;
  tvlDropPercent?: number;
  interval?: number;
  /** AbortSignal to cancel the watcher */
  signal?: AbortSignal;
  /** Maximum number of iterations (0 = unlimited) */
  maxIterations?: number;
}

export type WatchEventType = 'apy-drop' | 'tvl-drop' | 'update';

export interface WatchEvent {
  type: WatchEventType;
  vault: Vault;
  previous: { apy: number; tvlUsd: number } | null;
  current: { apy: number; tvlUsd: number };
  timestamp: Date;
}

/**
 * Watch a vault for APY/TVL changes.
 * Returns an AsyncGenerator that yields events.
 * Supports cancellation via AbortSignal and maxIterations.
 */
export async function* watch(
  client: EarnDataClient,
  vaultSlug: string,
  options: WatchOptions = {},
): AsyncGenerator<WatchEvent> {
  const interval = options.interval ?? 60_000;
  const apyThreshold = options.apyDropPercent ?? 20;
  const tvlThreshold = options.tvlDropPercent ?? 30;
  const maxIter = options.maxIterations ?? 0;

  let previous: { apy: number; tvlUsd: number } | null = null;
  let iteration = 0;

  while (true) {
    // Check abort signal
    if (options.signal?.aborted) return;

    // Check max iterations
    if (maxIter > 0 && iteration >= maxIter) return;
    iteration++;

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
      yield { type: 'update', vault, previous: null, current, timestamp: new Date() };
    }

    previous = current;

    // Abortable sleep
    if (options.signal?.aborted) return;
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, interval);
      options.signal?.addEventListener('abort', () => {
        clearTimeout(timer);
        resolve();
      }, { once: true });
    });
  }
}
