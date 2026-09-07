// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it, vi } from 'vitest'
import vaultSingle from '../../fixtures/src/vault-single.json'
import type { ComposerClient } from '../src/clients/index.js'
import { optimizeGasRoutes } from '../src/gas-optimizer.js'
import { type QuoteResponse, VaultSchema } from '../src/schemas/index.js'

const vault = VaultSchema.parse(vaultSingle)

function mockComposer(
  gasCosts: Array<{ amountUSD: string }>,
  feeCosts: Array<{ amountUSD: string }> = []
): ComposerClient {
  return {
    getQuote: vi.fn(
      async () =>
        ({
          estimate: {
            gasCosts,
            feeCosts,
            executionDuration: 30,
            toAmountMin: '1000000',
            toAmount: '1000000',
            fromAmount: '1000000',
            tool: 'composer',
          },
          transactionRequest: {
            to: '0x1',
            data: '0x',
            value: '0x0',
            chainId: 8453,
          },
        }) as unknown as QuoteResponse
    ),
  } as unknown as ComposerClient
}

describe('optimizeGasRoutes', () => {
  it('returns routes sorted by total cost ascending', async () => {
    const composer = {
      getQuote: vi
        .fn()
        .mockResolvedValueOnce({
          estimate: {
            gasCosts: [{ amountUSD: '2.00' }],
            feeCosts: [{ amountUSD: '0.10' }],
            executionDuration: 30,
            toAmountMin: '1',
            toAmount: '1',
            fromAmount: '1',
            tool: 'test',
          },
          transactionRequest: {
            to: '0x1',
            data: '0x',
            value: '0x0',
            chainId: 8453,
          },
        })
        .mockResolvedValueOnce({
          estimate: {
            gasCosts: [{ amountUSD: '0.02' }],
            feeCosts: [{ amountUSD: '0.01' }],
            executionDuration: 15,
            toAmountMin: '1',
            toAmount: '1',
            fromAmount: '1',
            tool: 'test',
          },
          transactionRequest: {
            to: '0x1',
            data: '0x',
            value: '0x0',
            chainId: 8453,
          },
        }),
    } as unknown as ComposerClient

    const routes = await optimizeGasRoutes(vault, composer, {
      fromAmount: '100',
      wallet: '0x1234567890abcdef1234567890abcdef12345678',
      fromChains: [1, 8453],
      fromTokens: {
        1: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
        8453: vault.underlyingTokens[0]!.address,
      },
    })

    expect(routes.length).toBe(2)
    expect(routes[0]!.totalCostUsd).toBeLessThanOrEqual(routes[1]!.totalCostUsd)
  })

  it('returns empty array when no fromToken available', async () => {
    const emptyVault = { ...vault, underlyingTokens: [] }
    const composer = mockComposer([])
    const routes = await optimizeGasRoutes(emptyVault, composer, {
      fromAmount: '100',
      wallet: '0x1234567890abcdef1234567890abcdef12345678',
    })
    expect(routes).toEqual([])
  })

  it('silently drops chains where getQuote throws', async () => {
    const composer = {
      getQuote: vi.fn().mockRejectedValue(new Error('network failure')),
    } as unknown as ComposerClient

    const routes = await optimizeGasRoutes(vault, composer, {
      fromAmount: '100',
      wallet: '0x1234567890abcdef1234567890abcdef12345678',
      fromChains: [8453],
    })
    expect(routes).toEqual([])
  })

  it('uses vault.chainId as default fromChain', async () => {
    const composer = mockComposer([{ amountUSD: '0.01' }])
    const routes = await optimizeGasRoutes(vault, composer, {
      fromAmount: '100',
      wallet: '0x1234567890abcdef1234567890abcdef12345678',
    })
    expect(routes.length).toBe(1)
    expect(routes[0]!.fromChain).toBe(vault.chainId)
  })

  it('skips cross-chain routes without fromTokens mapping', async () => {
    const composer = mockComposer([{ amountUSD: '0.01' }])
    const routes = await optimizeGasRoutes(vault, composer, {
      fromAmount: '100',
      wallet: '0x1234567890abcdef1234567890abcdef12345678',
      fromChains: [1, 8453], // Chain 1 has no mapping
    })
    // Only 8453 (same-chain) should succeed
    expect(routes.length).toBe(1)
    expect(routes[0]!.fromChain).toBe(8453)
  })
})

describe('gas optimizer under load', () => {
  /**
   * This used to be `Promise.all` over every source chain: one simultaneous
   * request per chain to LI.FI's most expensive endpoint, from a single user
   * action. The bound is now the thing standing between a user and a 429, so
   * it needs a test that would notice if it came off — the previous version
   * had none, direct or indirect.
   */
  function trackingComposer(
    opts: { failChains?: number[]; delayMs?: number } = {}
  ) {
    let inFlight = 0
    let peak = 0
    const seen: number[] = []
    const composer = {
      getQuote: vi.fn(async (p: { fromChain: number }) => {
        inFlight++
        peak = Math.max(peak, inFlight)
        seen.push(p.fromChain)
        await new Promise((r) => setTimeout(r, opts.delayMs ?? 1))
        inFlight--
        if (opts.failChains?.includes(p.fromChain)) {
          throw new Error(`no route from ${p.fromChain}`)
        }
        return {
          estimate: {
            gasCosts: [{ amountUSD: String(p.fromChain / 1000) }],
            feeCosts: [],
            executionDuration: 30,
            toAmountMin: '1000000',
            toAmount: '1000000',
            fromAmount: '1000000',
            tool: 'composer',
          },
          transactionRequest: {
            to: '0x1',
            data: '0x',
            value: '0x0',
            chainId: p.fromChain,
          },
        } as unknown as QuoteResponse
      }),
    } as unknown as ComposerClient
    return { composer, peak: () => peak, seen: () => seen }
  }

  const CHAINS = [
    1, 10, 56, 100, 130, 137, 143, 146, 232, 480, 999, 8453, 42161, 43114,
    59144, 80094, 747474,
  ]
  const tokens = Object.fromEntries(
    CHAINS.map((c) => [c, '0xaf88d065e77c8cC2239327C5EDb3A432268e5831'])
  )

  it('never exceeds 4 concurrent quotes, even across the whole fleet', async () => {
    const t = trackingComposer()
    await optimizeGasRoutes(vault, t.composer, {
      fromAmount: '100',
      wallet: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
      fromChains: CHAINS,
      fromTokens: tokens,
    })
    expect(t.seen()).toHaveLength(CHAINS.length) // every chain still attempted
    expect(t.peak()).toBeLessThanOrEqual(4)
    expect(t.peak()).toBeGreaterThan(1) // and it is genuinely parallel
  })

  it('one dead route does not take the batch down', async () => {
    const t = trackingComposer({ failChains: [56, 137, 43114] })
    const routes = await optimizeGasRoutes(vault, t.composer, {
      fromAmount: '100',
      wallet: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
      fromChains: CHAINS,
      fromTokens: tokens,
    })
    expect(routes).toHaveLength(CHAINS.length - 3)
    expect(routes.map((r) => r.fromChain)).not.toContain(56)
    expect(t.peak()).toBeLessThanOrEqual(4)
  })

  it('keeps each route attached to the chain it was quoted for', async () => {
    // A worker pool that shares an index is the classic way to get results
    // silently transposed: cheapest route reported, wrong chain named.
    const t = trackingComposer()
    const routes = await optimizeGasRoutes(vault, t.composer, {
      fromAmount: '100',
      wallet: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
      fromChains: CHAINS,
      fromTokens: tokens,
    })
    for (const r of routes) {
      expect(r.quote.transactionRequest?.chainId).toBe(r.fromChain)
      expect(r.gasCostUsd).toBeCloseTo(r.fromChain / 1000, 6)
    }
  })

  it('returns routes sorted cheapest first', async () => {
    const t = trackingComposer()
    const routes = await optimizeGasRoutes(vault, t.composer, {
      fromAmount: '100',
      wallet: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
      fromChains: CHAINS,
      fromTokens: tokens,
    })
    const costs = routes.map((r) => r.totalCostUsd)
    expect([...costs].sort((a, b) => a - b)).toEqual(costs)
  })

  it('handles a single chain without deadlocking the pool', async () => {
    const t = trackingComposer()
    const routes = await optimizeGasRoutes(vault, t.composer, {
      fromAmount: '100',
      wallet: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
      fromChains: [vault.chainId],
    })
    expect(routes).toHaveLength(1)
    expect(t.peak()).toBe(1)
  })

  it('returns immediately for an empty chain list', async () => {
    const t = trackingComposer()
    const routes = await optimizeGasRoutes(vault, t.composer, {
      fromAmount: '100',
      wallet: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
      fromChains: [],
    })
    expect(routes).toEqual([])
    expect(t.seen()).toHaveLength(0)
  })
})
