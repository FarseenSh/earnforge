// SPDX-License-Identifier: Apache-2.0
import { afterEach, describe, expect, it, vi } from 'vitest'
import vaultsBase from '../../../fixtures/src/vaults-base.json'
import { EarnDataClient } from '../../src/clients/index.js'

/**
 * Pitfall #20 — unknown query parameters are silently dropped.
 *
 * The vault list filter is `minTvlUsd`. We sent `minTvl`. The API did not
 * reject it, did not warn, and did not 400 — it returned the entire unfiltered
 * fleet with HTTP 200.
 *
 * The consequence for a yield tool is specific and bad: asking for "vaults with
 * at least $100M TVL" returned the entire fleet including sub-$20k dust, and
 * every downstream consumer — `suggest()`, strategy presets, the CLI's
 * `--min-tvl` — happily operated on the wrong candidate set. Verified live:
 * `minTvl=100000000` yields all 711 results, `minTvlUsd=100000000` yields 41.
 *
 * The lesson generalises past this one parameter. A filter that fails open is
 * worse than one that throws, because the result still looks plausible. Any
 * parameter name we send has to be pinned by a test.
 */
describe('Pitfall #20: unknown query params fail open', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  /** Capture the URL the client actually requests. */
  async function capture(
    fn: (client: EarnDataClient) => Promise<unknown>
  ): Promise<URL> {
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(JSON.stringify(vaultsBase), { status: 200 })
    )
    vi.stubGlobal('fetch', fetchMock)
    const client = new EarnDataClient({ apiKey: 'test' })
    await fn(client)
    const url = fetchMock.mock.calls[0]?.[0]
    return new URL(String(url), 'https://earn.li.fi')
  }

  it('maps the public minTvl option to the API-correct minTvlUsd', async () => {
    const url = await capture((c) => c.listVaults({ minTvl: 100_000_000 }))
    expect(url.searchParams.get('minTvlUsd')).toBe('100000000')
    // The name the API ignores must never appear on the wire.
    expect(url.searchParams.has('minTvl')).toBe(false)
  })

  it('sends the documented names for every supported filter', async () => {
    const url = await capture((c) =>
      c.listVaults({
        chainId: 8453,
        asset: 'USDC',
        protocol: 'morpho',
        minTvl: 1_000_000,
        sortBy: 'apy',
        isTransactional: true,
        isRedeemable: true,
        isComposerSupported: true,
      })
    )
    const expected = [
      'chainId',
      'asset',
      'protocol',
      'minTvlUsd',
      'sortBy',
      'isTransactional',
      'isRedeemable',
      'isComposerSupported',
      'limit',
    ]
    for (const key of expected) {
      expect(url.searchParams.has(key), `missing ${key}`).toBe(true)
    }
  })

  it('sends no parameter the API does not define', async () => {
    const url = await capture((c) =>
      c.listVaults({ chainId: 8453, minTvl: 1_000_000 })
    )
    const documented = new Set([
      'chainId',
      'asset',
      'protocol',
      'minTvlUsd',
      'isTransactional',
      'isRedeemable',
      'isComposerSupported',
      'sortBy',
      'limit',
      'cursor',
    ])
    for (const key of url.searchParams.keys()) {
      expect(documented.has(key), `undocumented param "${key}"`).toBe(true)
    }
  })

  it('requests the maximum page size by default', async () => {
    // The default is 50; 100 halves the round trips needed to walk the fleet.
    const url = await capture((c) => c.listVaults())
    expect(url.searchParams.get('limit')).toBe('100')
  })
})
