// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect } from 'vitest';
import { LRUCache } from '../../src/cache.js';

describe('Pitfall #10: Stale quote', () => {
  it('cache entries expire after TTL', async () => {
    const cache = new LRUCache<string>({ ttl: 100 });
    cache.set('quote', 'data');
    expect(cache.get('quote')).toBe('data');

    await new Promise((r) => setTimeout(r, 150));
    expect(cache.get('quote')).toBeUndefined();
  });

  it('fresh entries are returned', () => {
    const cache = new LRUCache<string>({ ttl: 60_000 });
    cache.set('quote', 'data');
    expect(cache.get('quote')).toBe('data');
  });
});
