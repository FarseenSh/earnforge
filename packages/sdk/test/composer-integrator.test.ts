// SPDX-License-Identifier: Apache-2.0
/**
 * Integrator attribution and Composer request throttling.
 *
 * `integrator` is how LI.FI attributes traffic. The response schema has parsed
 * it since day one while the request never sent it, so every quote arrived
 * under LI.FI's generic `lifi-api` default — verified live: omitting the param
 * echoes back `"lifi-api"`, sending it echoes back `"earnforge"`.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ComposerClient,
  DEFAULT_COMPOSER_MAX_PER_MINUTE,
  DEFAULT_INTEGRATOR,
} from '../src/clients/composer-client.js'

const QUOTE = {
  type: 'lifi',
  id: 'q1',
  tool: 'across',
  action: {
    fromToken: {
      address: '0xa',
      chainId: 42161,
      symbol: 'USDC',
      decimals: 6,
      name: 'USD Coin',
    },
    fromAmount: '10000000',
    toToken: {
      address: '0xb',
      chainId: 8453,
      symbol: 'USDC',
      decimals: 6,
      name: 'USD Coin',
    },
    fromChainId: 42161,
    toChainId: 8453,
    slippage: 0.005,
    fromAddress: '0xw',
    toAddress: '0xw',
  },
  estimate: {
    tool: 'across',
    toAmountMin: '9950000',
    toAmount: '10000000',
    fromAmount: '10000000',
    executionDuration: 30,
  },
  transactionRequest: {
    to: '0xrouter',
    data: '0xdata',
    value: '0',
    chainId: 42161,
  },
}

const PARAMS = {
  fromChain: 42161,
  toChain: 8453,
  fromToken: '0xa',
  toToken: '0xb',
  fromAddress: '0xw',
  toAddress: '0xw',
  fromAmount: '10000000',
}

function stubOk(): ReturnType<typeof vi.fn> {
  const f = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.resolve(QUOTE),
  })
  vi.stubGlobal('fetch', f)
  return f
}

function urlOf(f: ReturnType<typeof vi.fn>, call = 0): URL {
  return new URL(f.mock.calls[call]![0] as string)
}

describe('Composer identifies the caller', () => {
  beforeEach(() => vi.unstubAllGlobals())

  it('sends the default integrator on every quote', async () => {
    const f = stubOk()
    await new ComposerClient({ apiKey: 'k' }).getQuote(PARAMS)
    expect(urlOf(f).searchParams.get('integrator')).toBe(DEFAULT_INTEGRATOR)
  })

  it('lets a downstream project attribute traffic to itself', async () => {
    const f = stubOk()
    await new ComposerClient({
      apiKey: 'k',
      integrator: 'acme-yield',
    }).getQuote(PARAMS)
    expect(urlOf(f).searchParams.get('integrator')).toBe('acme-yield')
  })

  it('never sends an empty integrator, which reads as anonymous upstream', async () => {
    const f = stubOk()
    await new ComposerClient({ apiKey: 'k' }).getQuote(PARAMS)
    expect(urlOf(f).searchParams.get('integrator')).toBeTruthy()
  })
})

describe('Composer requests are throttled', () => {
  beforeEach(() => vi.unstubAllGlobals())

  it('refuses past the per-minute ceiling instead of flooding LI.FI', async () => {
    stubOk()
    // retry off: withRetry backs off on a rate-limit error, which is right in
    // production and just slow here.
    const c = new ComposerClient({
      apiKey: 'k',
      maxPerMinute: 3,
      retry: { maxRetries: 0 },
    })
    await c.getQuote(PARAMS)
    await c.getQuote(PARAMS)
    await c.getQuote(PARAMS)
    // The Earn Data client has always had a token bucket; this one had none.
    await expect(c.getQuote(PARAMS)).rejects.toThrow(/rate limit/i)
  })

  it('installs a throttle even when no ceiling is configured', async () => {
    // The behavioural guarantee is covered above with an explicit ceiling.
    // This pins that a client built with no options still gets a bucket:
    // the regression worth catching is the default going missing, not its
    // exact value, and exhausting 60 real requests measures the test
    // machine's speed rather than the limit.
    stubOk()
    const c = new ComposerClient({ apiKey: 'k' })
    expect(
      (c as unknown as { rateLimiter?: unknown }).rateLimiter
    ).toBeDefined()
    expect(DEFAULT_COMPOSER_MAX_PER_MINUTE).toBe(60)
  })
})
