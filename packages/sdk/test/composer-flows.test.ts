// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it, vi } from 'vitest'
import {
  ComposerFlowError,
  createComposerFlows,
  routableProtocols,
} from '../src/composer-flows.js'

/**
 * Composer Flow tests.
 *
 * These assert the request EarnForge composes and the guarantees it enforces
 * before anything reaches the network — the input validation, the guard
 * placement, and the routability read. Compilation itself is the backend's
 * job and is stubbed; what matters here is that we never hand it something
 * malformed and never sign something unsimulated.
 */

const USDC = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913'

/**
 * `underlyingTokens` is load-bearing here, not decoration. The fixture used to
 * omit it, which no live vault does — and that omission hid a bug for a whole
 * release: the swap was composed to output the vault SHARE token, so the zap
 * ran share -> share and Composer refused the program with "No routing edge
 * found". Compilation is stubbed in these tests, so the flow "passed" while
 * being impossible to compile for any vault, from any input.
 */
const VAULT = {
  chainId: 8453,
  address: '0xee8f4ec5672f09119b96ab6fb59c27e1b7e44b61',
  name: 'Morpho USDC',
  protocol: { id: 'morpho', name: 'Morpho', url: 'https://morpho.org' },
  underlyingTokens: [{ address: USDC }],
}

const WALLET = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045'

/**
 * Every Compose API response is wrapped in a `{ data }` envelope — the client
 * rejects a bare payload with "Unexpected response format".
 */
function envelope(data: unknown): Response {
  return {
    ok: true,
    status: 200,
    headers: new Headers({ 'content-type': 'application/json' }),
    json: async () => ({ data }),
    text: async () => '',
  } as unknown as Response
}

/** Minimal successful compile response. */
async function okResponse(): Promise<Response> {
  return envelope({
    transactionRequest: { to: '0xabc', data: '0xdead', gasLimit: '210000' },
    userProxy: '0xproxy',
    producedResources: [],
    priceImpact: { bps: 12 },
  })
}

describe('ComposerFlows', () => {
  it('requires an API key — the Compose API rejects anonymous callers', () => {
    expect(() => createComposerFlows({ apiKey: '' })).toThrow(ComposerFlowError)
    expect(() => createComposerFlows({ apiKey: '' })).toThrow(/portal\.li\.fi/)
  })

  describe('input validation', () => {
    const flows = () =>
      createComposerFlows({
        apiKey: 'k',
        fetch: vi.fn(okResponse) as unknown as typeof globalThis.fetch,
      })

    it('rejects a decimal amount rather than sending it', async () => {
      // "1.5" would reach the backend as a malformed uint256. Catching it here
      // names the mistake; catching it there returns a validation error about
      // a field the caller never set.
      await expect(
        flows().buildDepositFlow({
          vault: VAULT,
          wallet: WALLET,
          amount: '1.5',
        })
      ).rejects.toThrow(/smallest unit/)
    })

    it('rejects a malformed wallet address', async () => {
      await expect(
        flows().buildDepositFlow({
          vault: VAULT,
          wallet: 'not-an-address',
          amount: '1000000',
        })
      ).rejects.toThrow(/wallet address/)
    })

    it('rejects a malformed fromToken', async () => {
      await expect(
        flows().buildDepositFlow({
          vault: VAULT,
          wallet: WALLET,
          fromToken: '0x123',
          amount: '1000000',
        })
      ).rejects.toThrow(/fromToken address/)
    })

    it('accepts a well-formed base-unit amount', async () => {
      const result = await flows().buildDepositFlow({
        vault: VAULT,
        wallet: WALLET,
        fromToken: USDC,
        amount: '1000000',
      })
      expect(result.ok).toBe(true)
      expect(result.transaction).toMatchObject({ to: '0xabc' })
    })
  })

  describe('the composed request', () => {
    async function capture() {
      const fetchMock = vi.fn(okResponse)
      await createComposerFlows({
        apiKey: 'k',
        fetch: fetchMock as unknown as typeof globalThis.fetch,
      }).buildDepositFlow({
        vault: VAULT,
        wallet: WALLET,
        // WETH rather than the vault's own USDC: these assertions are about the
        // swap leg, and depositing the vault asset correctly composes no swap.
        fromToken: '0x4200000000000000000000000000000000000006',
        amount: '1000000000000000000',
        slippageBps: 250,
      })
      const call = fetchMock.mock.calls[0] as unknown as [
        string,
        { body: string },
      ]
      return JSON.parse(call[1].body) as Record<string, unknown>
    }

    it('binds the swap output into the deposit input', async () => {
      // This is the whole point of a Flow: the deposit uses the exact amount
      // the swap returned, not an estimate made before it ran. If these are
      // not linked the flow is just two independent quotes in a trench coat.
      const body = JSON.stringify(await capture())
      expect(body).toContain('swap')
      expect(body).toContain('deposit')
      expect(body).toMatch(/amountOut/)
    })

    it('guards the zap, not the swap', async () => {
      // lifi.swap's amountOut declares providesMinimum — the aggregator bakes
      // minOut in from its own slippage config. A second guard there is a
      // compile-time guard_error, so the guard belongs on the zap.
      const body = await capture()
      const flow = JSON.stringify(body)
      expect(flow).toContain('slippage')
      expect(flow).not.toMatch(
        /"guards":\s*\[[^\]]*\][^}]*"op":\s*"lifi\.swap"/
      )
    })

    it('swaps into the vault asset, not into the share token', async () => {
      // The bug this pins: pointing the swap at `vault.address` makes the zap's
      // input and output the same resource, and Composer rejects the program
      // with "No routing edge found from erc20:<vault> to erc20:<vault>". It is
      // not a routing edge case — the flow cannot compile for any vault.
      const fetchMock = vi.fn(okResponse)
      await createComposerFlows({
        apiKey: 'k',
        fetch: fetchMock as unknown as typeof globalThis.fetch,
      }).buildDepositFlow({
        vault: VAULT,
        wallet: WALLET,
        // A token that is neither the vault asset nor the share token, so the
        // swap leg has somewhere real to go.
        fromToken: '0x4200000000000000000000000000000000000006',
        amount: '1000000000000000000',
      })
      const call = fetchMock.mock.calls[0] as unknown as [
        string,
        { body: string },
      ]
      const body = JSON.parse(call[1].body) as Record<string, unknown>
      const flow = JSON.stringify(body)

      // The swap's declared output must be the underlying asset.
      expect(flow.toLowerCase()).toContain(USDC.toLowerCase())

      // And the swap must not be pointed at the share token. Locate the swap
      // op and assert the vault address does not appear as its resourceOut.
      const swapOp = flow.slice(flow.indexOf('lifi.swap'))
      const swapResourceOut = swapOp.slice(0, swapOp.indexOf('lifi.zap'))
      expect(swapResourceOut.toLowerCase()).not.toContain(
        VAULT.address.toLowerCase()
      )
    })

    it('omits the swap entirely when the input already is the vault asset', async () => {
      // Depositing USDC into a USDC vault needs no swap. Composing one anyway
      // asks the router for a USDC -> USDC edge, which does not exist.
      const fetchMock = vi.fn(okResponse)
      await createComposerFlows({
        apiKey: 'k',
        fetch: fetchMock as unknown as typeof globalThis.fetch,
      }).buildDepositFlow({
        vault: VAULT,
        wallet: WALLET,
        fromToken: USDC,
        amount: '1000000',
      })
      const call = fetchMock.mock.calls[0] as unknown as [
        string,
        { body: string },
      ]
      const flow = JSON.stringify(JSON.parse(call[1].body))
      expect(flow).not.toContain('lifi.swap')
      expect(flow).toContain('lifi.zap')
    })

    it('sweeps leftovers back to the sender', async () => {
      // Without this, dust rests in the user's execution proxy instead of
      // returning to them.
      expect(JSON.stringify(await capture())).toContain('sweepTo')
    })

    it('does not opt into partial results by default', async () => {
      // A reverting deposit is a bug to surface, not calldata to hand over.
      const body = await capture()
      expect(body.simulationPolicy).toBeUndefined()
    })
  })

  describe('routability — the Earn list is a superset of what Composer runs', () => {
    function flowsWithPacks(packs: unknown) {
      const fetchMock = vi.fn(async () => envelope(packs))
      return createComposerFlows({
        apiKey: 'k',
        fetch: fetchMock as unknown as typeof globalThis.fetch,
      })
    }

    it('reports a vault enterable and exitable when both edges exist', async () => {
      const r = await flowsWithPacks([
        {
          protocol: 'morpho',
          edges: [
            {
              type: 'enter-position',
              in: { address: USDC, chainId: 8453 },
              out: { address: VAULT.address, chainId: 8453 },
            },
            {
              type: 'exit-position',
              in: { address: VAULT.address, chainId: 8453 },
              out: { address: USDC, chainId: 8453 },
            },
          ],
        },
      ]).vaultRoutability(VAULT)
      expect(r).toEqual({ canEnter: true, canExit: true, edgeCount: 2 })
    })

    it('reports a deposit-only vault as not exitable', async () => {
      // Seven protocols are deposit-only. buildRedeemQuote will happily build
      // a withdrawal for those and it fails on-chain; this is how a caller
      // finds out first.
      const r = await flowsWithPacks([
        {
          protocol: 'morpho',
          edges: [
            {
              type: 'enter-position',
              in: { address: USDC, chainId: 8453 },
              out: { address: VAULT.address, chainId: 8453 },
            },
          ],
        },
      ]).vaultRoutability(VAULT)
      expect(r.canEnter).toBe(true)
      expect(r.canExit).toBe(false)
    })

    it('reports an unroutable vault even though Earn indexes it', async () => {
      // Protocols ingested from DeFiLlama appear in the vault list with no
      // Composer routing at all.
      const r = await flowsWithPacks([
        { protocol: 'morpho', edges: [] },
      ]).vaultRoutability(VAULT)
      expect(r).toEqual({ canEnter: false, canExit: false, edgeCount: 0 })
    })

    it('matches addresses case-insensitively', async () => {
      // Earn returns lowercase; Composer returns checksummed. A case-sensitive
      // compare silently reports every vault unroutable.
      const r = await flowsWithPacks([
        {
          protocol: 'morpho',
          edges: [
            {
              type: 'enter-position',
              in: { address: USDC, chainId: 8453 },
              out: {
                address: VAULT.address.toUpperCase().replace('0X', '0x'),
                chainId: 8453,
              },
            },
          ],
        },
      ]).vaultRoutability(VAULT)
      expect(r.canEnter).toBe(true)
    })

    it('does not match an edge on another chain', async () => {
      const r = await flowsWithPacks([
        {
          protocol: 'morpho',
          edges: [
            {
              type: 'enter-position',
              in: { address: USDC, chainId: 1 },
              out: { address: VAULT.address, chainId: 1 },
            },
          ],
        },
      ]).vaultRoutability(VAULT)
      expect(r.edgeCount).toBe(0)
    })
  })

  describe('routableProtocols', () => {
    it('keeps only protocols with at least one edge', () => {
      const set = routableProtocols([
        { protocol: 'morpho', edges: [{}] },
        { protocol: 'aave', edges: [] },
      ] as never)
      expect([...set]).toEqual(['morpho'])
    })
  })
})
