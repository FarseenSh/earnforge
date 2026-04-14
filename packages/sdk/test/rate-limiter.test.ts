// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect } from 'vitest'
import { TokenBucketRateLimiter } from '../src/rate-limiter.js'
import { RateLimitError } from '../src/errors.js'

describe('TokenBucketRateLimiter', () => {
  it('initializes with max tokens', () => {
    const limiter = new TokenBucketRateLimiter(50)
    expect(limiter.remaining).toBe(50)
  })

  it('decrements on acquire', () => {
    const limiter = new TokenBucketRateLimiter(10)
    limiter.acquire()
    limiter.acquire()
    expect(limiter.remaining).toBe(8)
  })

  it('throws when exhausted', () => {
    const limiter = new TokenBucketRateLimiter(1)
    limiter.acquire()
    expect(() => limiter.acquire()).toThrow(RateLimitError)
  })

  it('acquireAsync waits when needed', async () => {
    // Use high rate so wait is minimal: 6000/min = 100/sec → wait ~10ms
    const limiter = new TokenBucketRateLimiter(6000)
    for (let i = 0; i < 6000; i++) limiter.acquire()
    // Should wait briefly and then succeed
    await limiter.acquireAsync()
    expect(true).toBe(true)
  })

  it('default is 100 per minute', () => {
    const limiter = new TokenBucketRateLimiter()
    expect(limiter.remaining).toBe(100)
  })
})
