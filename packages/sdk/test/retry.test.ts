// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect, vi } from 'vitest'
import { withRetry, isRetryable } from '../src/retry.js'
import { EarnApiError, ComposerError } from '../src/errors.js'

describe('withRetry', () => {
  it('returns result on first success', async () => {
    const fn = vi.fn().mockResolvedValue('ok')
    const result = await withRetry(fn, { maxRetries: 3, baseDelay: 10 })
    expect(result).toBe('ok')
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('retries on retryable error and eventually succeeds', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new EarnApiError('rate limited', 429, '/test'))
      .mockResolvedValue('ok')
    const result = await withRetry(fn, {
      maxRetries: 3,
      baseDelay: 10,
      maxDelay: 20,
    })
    expect(result).toBe('ok')
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('throws immediately on non-retryable error', async () => {
    const fn = vi
      .fn()
      .mockRejectedValue(new EarnApiError('bad request', 400, '/test'))
    await expect(
      withRetry(fn, { maxRetries: 3, baseDelay: 10 })
    ).rejects.toThrow('bad request')
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('gives up after maxRetries', async () => {
    const fn = vi
      .fn()
      .mockRejectedValue(new EarnApiError('server error', 500, '/test'))
    await expect(
      withRetry(fn, { maxRetries: 2, baseDelay: 10, maxDelay: 20 })
    ).rejects.toThrow('server error')
    expect(fn).toHaveBeenCalledTimes(3) // initial + 2 retries
  })

  it('respects custom maxRetries of 0', async () => {
    const fn = vi.fn().mockRejectedValue(new EarnApiError('error', 500, '/'))
    await expect(
      withRetry(fn, { maxRetries: 0, baseDelay: 10 })
    ).rejects.toThrow()
    expect(fn).toHaveBeenCalledTimes(1)
  })
})

describe('isRetryable', () => {
  it('returns true for EarnApiError with status 429', () => {
    expect(isRetryable(new EarnApiError('rate limited', 429, '/'))).toBe(true)
  })

  it('returns true for EarnApiError with status 500', () => {
    expect(isRetryable(new EarnApiError('server error', 500, '/'))).toBe(true)
  })

  it('returns false for EarnApiError with status 400', () => {
    expect(isRetryable(new EarnApiError('bad request', 400, '/'))).toBe(false)
  })

  it('returns true for ComposerError with status 429', () => {
    expect(isRetryable(new ComposerError('rate limited', 429))).toBe(true)
  })

  it('returns true for ComposerError with status 502', () => {
    expect(isRetryable(new ComposerError('bad gateway', 502))).toBe(true)
  })

  it('returns false for ComposerError with status 401', () => {
    expect(isRetryable(new ComposerError('unauthorized', 401))).toBe(false)
  })

  it('returns true for network errors', () => {
    expect(isRetryable(new Error('fetch failed'))).toBe(true)
    expect(isRetryable(new Error('ECONNRESET'))).toBe(true)
    expect(isRetryable(new Error('network error'))).toBe(true)
  })

  it('returns false for generic errors', () => {
    expect(isRetryable(new Error('something else'))).toBe(false)
    expect(isRetryable(new TypeError('invalid'))).toBe(false)
  })

  it('returns false for non-Error values', () => {
    expect(isRetryable('string error')).toBe(false)
    expect(isRetryable(null)).toBe(false)
    expect(isRetryable(42)).toBe(false)
  })
})
