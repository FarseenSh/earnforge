// SPDX-License-Identifier: Apache-2.0
import { afterEach, describe, expect, it, vi } from 'vitest'
import chains from '../../../fixtures/src/chains.json'
import { EarnDataClient } from '../../src/clients/index.js'
import { MissingApiKeyError } from '../../src/errors.js'

/**
 * Pitfall #2 — INVERTED as of Apr 2026.
 *
 * This pitfall used to be "don't send auth to the Earn Data API," because the
 * endpoint was public. It is now the opposite: earn.li.fi hard-401s without an
 * `x-lifi-api-key` header. Verified live — both an empty key and a garbage key
 * return 401, so the header is genuinely validated, not merely required.
 *
 * The trap is now that LI.FI's own API reference still states "All LI.FI APIs
 * do not require API key. API key is only needed for higher rate limits."
 * That remains true for li.quest and is false for earn.li.fi.
 */
describe('Pitfall #2: Earn Data API requires auth (inverted Apr 2026)', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  /** Run `fn` with LIFI_API_KEY absent, then restore it. */
  function withoutEnvKey(fn: () => void): void {
    const saved = process.env.LIFI_API_KEY
    delete process.env.LIFI_API_KEY
    try {
      fn()
    } finally {
      if (saved === undefined) {
        delete process.env.LIFI_API_KEY
      } else {
        process.env.LIFI_API_KEY = saved
      }
    }
  }

  it('throws a named error when no API key is available', () => {
    withoutEnvKey(() => {
      expect(() => new EarnDataClient()).toThrow(MissingApiKeyError)
    })
  })

  it('fails fast at construction rather than at first request', () => {
    // A late 401 from deep inside a paginated walk is much harder to diagnose
    // than a constructor throw, so the key is validated up front.
    withoutEnvKey(() => {
      expect(() => new EarnDataClient()).toThrow(/requires an API key/)
    })
  })

  it('points the developer at the portal in the error message', () => {
    withoutEnvKey(() => {
      expect(() => new EarnDataClient()).toThrow(/portal\.li\.fi/)
    })
  })

  it('sends the key as the x-lifi-api-key header on every request', async () => {
    // Typed with fetch's own signature: a no-arg implementation makes
    // `mock.calls` an empty tuple, so reading calls[0][1] does not compile.
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(JSON.stringify(chains), { status: 200 })
    )
    vi.stubGlobal('fetch', fetchMock)

    const client = new EarnDataClient({ apiKey: 'sentinel-key' })
    await client.listChains()

    expect(fetchMock).toHaveBeenCalledOnce()
    const headers = (fetchMock.mock.calls[0]?.[1]?.headers ?? {}) as Record<
      string,
      string
    >
    expect(headers['x-lifi-api-key']).toBe('sentinel-key')
  })

  it('accepts the key from LIFI_API_KEY when not passed explicitly', () => {
    const saved = process.env.LIFI_API_KEY
    process.env.LIFI_API_KEY = 'from-env'
    try {
      expect(() => new EarnDataClient()).not.toThrow()
    } finally {
      process.env.LIFI_API_KEY = saved
    }
  })
})
