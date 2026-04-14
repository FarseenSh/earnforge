// SPDX-License-Identifier: Apache-2.0
import { RateLimitError } from './errors.js'

/**
 * Token-bucket rate limiter with queued async acquisition.
 * Default: 100 requests per minute for Earn Data API (Pitfall #14).
 */
export class TokenBucketRateLimiter {
  private tokens: number
  private lastRefill: number
  private readonly maxTokens: number
  private readonly refillRate: number // tokens per ms
  private _queue: Promise<void> = Promise.resolve()

  constructor(maxRequestsPerMinute = 100) {
    this.maxTokens = maxRequestsPerMinute
    this.tokens = maxRequestsPerMinute
    this.refillRate = maxRequestsPerMinute / 60_000
    this.lastRefill = Date.now()
  }

  private refill(): void {
    const now = Date.now()
    const elapsed = now - this.lastRefill
    this.tokens = Math.min(
      this.maxTokens,
      this.tokens + elapsed * this.refillRate
    )
    this.lastRefill = now
  }

  acquire(): void {
    this.refill()
    if (this.tokens < 1) {
      const waitMs = Math.ceil((1 - this.tokens) / this.refillRate)
      throw new RateLimitError(waitMs)
    }
    this.tokens -= 1
  }

  /**
   * Queued async acquire — serializes concurrent callers to prevent
   * race conditions where multiple callers pass the token check simultaneously.
   */
  async acquireAsync(): Promise<void> {
    this._queue = this._queue.then(() => this._acquireInternal())
    return this._queue
  }

  private async _acquireInternal(): Promise<void> {
    this.refill()
    if (this.tokens < 1) {
      const waitMs = Math.ceil((1 - this.tokens) / this.refillRate)
      await new Promise((resolve) => setTimeout(resolve, waitMs))
      this.refill()
    }
    this.tokens -= 1
  }

  get remaining(): number {
    this.refill()
    return Math.floor(this.tokens)
  }
}
