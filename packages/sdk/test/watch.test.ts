// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect, vi } from 'vitest';
import { watch } from '../src/watch.js';
import type { EarnDataClient } from '../src/clients/index.js';
import { VaultSchema } from '../src/schemas/index.js';
import vaultSingle from '../../fixtures/src/vault-single.json';

const baseVault = VaultSchema.parse(vaultSingle);

function mockClient(vaultOverrides: Array<Partial<typeof baseVault>> = [{}]): EarnDataClient {
  let callIdx = 0;
  return {
    getVaultBySlug: vi.fn(async () => {
      const overrides = vaultOverrides[callIdx % vaultOverrides.length] ?? {};
      callIdx++;
      return { ...baseVault, ...overrides } as typeof baseVault;
    }),
  } as unknown as EarnDataClient;
}

describe('watch', () => {
  it('yields initial update event with previous: null', async () => {
    const client = mockClient();
    const gen = watch(client, '8453-0xbeef', { interval: 10, maxIterations: 1 });
    const first = await gen.next();
    expect(first.done).toBe(false);
    expect(first.value.type).toBe('update');
    expect(first.value.previous).toBeNull();
    expect(first.value.current.apy).toBe(baseVault.analytics.apy.total);
  });

  it('yields apy-drop event when APY drops by threshold', async () => {
    const highApy = { analytics: { ...baseVault.analytics, apy: { ...baseVault.analytics.apy, total: 10 } } };
    const lowApy = { analytics: { ...baseVault.analytics, apy: { ...baseVault.analytics.apy, total: 5 } } };
    const client = mockClient([highApy, lowApy]);
    const gen = watch(client, '8453-0xbeef', { interval: 10, apyDropPercent: 20, maxIterations: 3 });

    const events = [];
    for await (const event of gen) {
      events.push(event);
    }

    const drops = events.filter((e) => e.type === 'apy-drop');
    expect(drops.length).toBeGreaterThanOrEqual(1);
    expect(drops[0]?.current.apy).toBe(5);
  });

  it('yields tvl-drop event when TVL drops by threshold', async () => {
    const highTvl = { analytics: { ...baseVault.analytics, tvl: { usd: '100000000' } } };
    const lowTvl = { analytics: { ...baseVault.analytics, tvl: { usd: '50000000' } } };
    const client = mockClient([highTvl, lowTvl]);
    const gen = watch(client, '8453-0xbeef', { interval: 10, tvlDropPercent: 30, maxIterations: 3 });

    const events = [];
    for await (const event of gen) {
      events.push(event);
    }

    const drops = events.filter((e) => e.type === 'tvl-drop');
    expect(drops.length).toBeGreaterThanOrEqual(1);
  });

  it('respects maxIterations', async () => {
    const client = mockClient();
    const gen = watch(client, '8453-0xbeef', { interval: 10, maxIterations: 3 });

    const events = [];
    for await (const event of gen) {
      events.push(event);
    }

    expect(events.length).toBe(3);
  });

  it('respects AbortSignal', async () => {
    const controller = new AbortController();
    const client = mockClient();
    const gen = watch(client, '8453-0xbeef', { interval: 100, signal: controller.signal });

    const first = await gen.next();
    expect(first.done).toBe(false);

    controller.abort();
    const second = await gen.next();
    expect(second.done).toBe(true);
  });

  it('does not yield apy-drop when previous APY is 0', async () => {
    const zeroApy = { analytics: { ...baseVault.analytics, apy: { ...baseVault.analytics.apy, total: 0 } } };
    const client = mockClient([zeroApy, zeroApy]);
    const gen = watch(client, '8453-0xbeef', { interval: 10, apyDropPercent: 10, maxIterations: 2 });

    const events = [];
    for await (const event of gen) {
      events.push(event);
    }

    const drops = events.filter((e) => e.type === 'apy-drop');
    expect(drops.length).toBe(0);
  });
});
