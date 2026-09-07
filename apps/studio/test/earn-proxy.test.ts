// SPDX-License-Identifier: Apache-2.0
/**
 * The Earn proxy is the only route in the Studio that holds a credential, and
 * it is publicly reachable, so what it forwards is a security property rather
 * than a detail. It had no test.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GET } from '../src/app/api/earn/[...path]/route'

const KEY = 'test-key'

function ctx(path: string[]) {
  return { params: Promise.resolve({ path }) }
}

function req(url: string) {
  return new Request(url)
}

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  process.env.LIFI_API_KEY = KEY
  fetchMock = vi.fn().mockResolvedValue({
    status: 200,
    text: () => Promise.resolve('{"data":[]}'),
  })
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const upstream = () => new URL(fetchMock.mock.calls[0]![0] as string)

describe('path allowlist', () => {
  it('forwards a permitted path', async () => {
    const res = await GET(
      req('http://x/api/earn/v1/vaults'),
      ctx(['v1', 'vaults'])
    )
    expect(res.status).toBe(200)
    expect(upstream().pathname).toBe('/v1/vaults')
  })

  it('refuses to act as a general-purpose forwarder', async () => {
    const res = await GET(
      req('http://x/api/earn/v1/quote'),
      ctx(['v1', 'quote'])
    )
    expect(res.status).toBe(400)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('credential handling', () => {
  it('attaches the key server-side', async () => {
    await GET(req('http://x/api/earn/v1/chains'), ctx(['v1', 'chains']))
    const init = fetchMock.mock.calls[0]![1] as {
      headers: Record<string, string>
    }
    expect(init.headers['x-lifi-api-key']).toBe(KEY)
  })

  it('never echoes the key back to the caller', async () => {
    const res = await GET(
      req('http://x/api/earn/v1/chains'),
      ctx(['v1', 'chains'])
    )
    const body = await res.text()
    expect(body).not.toContain(KEY)
    expect(JSON.stringify([...res.headers])).not.toContain(KEY)
  })

  it('reports a missing key without leaking environment detail', async () => {
    process.env.LIFI_API_KEY = ''
    const res = await GET(
      req('http://x/api/earn/v1/chains'),
      ctx(['v1', 'chains'])
    )
    expect(res.status).toBe(500)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('query forwarding cannot be used to bust the cache', () => {
  it('forwards known filters', async () => {
    await GET(
      req('http://x/api/earn/v1/vaults?chainId=8453&limit=50&minTvlUsd=1000'),
      ctx(['v1', 'vaults'])
    )
    const p = upstream().searchParams
    expect(p.get('chainId')).toBe('8453')
    expect(p.get('limit')).toBe('50')
    expect(p.get('minTvlUsd')).toBe('1000')
  })

  it('drops unknown parameters, which is what makes the 60s cache effective', async () => {
    // `next.revalidate` keys on the resolved URL, so a loop over ?_=1, ?_=2
    // used to miss the cache every time and spend this deployment's quota.
    await GET(
      req('http://x/api/earn/v1/vaults?chainId=8453&_=99&cachebust=abc'),
      ctx(['v1', 'vaults'])
    )
    const p = upstream().searchParams
    expect(p.get('_')).toBeNull()
    expect(p.get('cachebust')).toBeNull()
    expect(p.get('chainId')).toBe('8453')
  })

  it('collapses cache-busted variants onto one upstream URL', async () => {
    for (const bust of ['?_=1', '?_=2', '?nonsense=x']) {
      await GET(
        req(`http://x/api/earn/v1/chains${bust}`),
        ctx(['v1', 'chains'])
      )
    }
    const urls = new Set(fetchMock.mock.calls.map((c) => c[0] as string))
    expect(urls.size).toBe(1)
  })
})
