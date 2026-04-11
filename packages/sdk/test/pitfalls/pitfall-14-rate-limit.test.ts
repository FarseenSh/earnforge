// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect } from 'vitest';
import { TokenBucketRateLimiter } from '../../src/rate-limiter.js';
import { RateLimitError } from '../../src/errors.js';

describe('Pitfall #14: Hitting rate limit', () => {
  it('rate limiter starts with 100 tokens', () => {
    const limiter = new TokenBucketRateLimiter(100);
    expect(limiter.remaining).toBe(100);
  });

  it('acquire decrements tokens', () => {
    const limiter = new TokenBucketRateLimiter(100);
    limiter.acquire();
    expect(limiter.remaining).toBe(99);
  });

  it('throws RateLimitError when tokens exhausted', () => {
    const limiter = new TokenBucketRateLimiter(2);
    limiter.acquire();
    limiter.acquire();
    expect(() => limiter.acquire()).toThrowError(RateLimitError);
  });

  it('tokens refill over time', async () => {
    const limiter = new TokenBucketRateLimiter(100);
    for (let i = 0; i < 10; i++) limiter.acquire();
    const after = limiter.remaining;
    await new Promise((r) => setTimeout(r, 700));
    expect(limiter.remaining).toBeGreaterThan(after);
  });
});
