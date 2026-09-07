// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it, vi } from 'vitest'
import vaultBase from '../../../fixtures/src/vault-single.json'
import { ComposerError } from '../../src/errors.js'
import {
  assertDestinationActionPreserved,
  probeGasless,
  probeSmartDeposit,
} from '../../src/route-flags.js'
import type { Vault } from '../../src/schemas/index.js'
import { VaultSchema } from '../../src/schemas/index.js'

/**
 * Pitfall #25: LI.FI's newer route flags fail by exclusion, not by error.
 *
 * `@lifi/types` 18.4.0 added `gasless`, `destinationActionKind` /
 * `destinationActionVault` (Smart Deposits) and `amountFlexible`. Every one of
 * them is accepted and validated by the live API. None of them errors when it
 * cannot be honoured: the route is dropped instead, and the caller sees a
 * response indistinguishable from a pair with no liquidity.
 *
 *   GET  /v1/quote            -> 404 "No available quotes for the requested transfer"
 *   POST /v1/advanced/routes  -> 200 with routes: []
 *
 * Verified on 7 Sep 2026. `gasless=true` turned a working 200 into a 404 on
 * every pair tried, same-chain and cross-chain, on Arbitrum and Ethereum.
 * Smart Deposits returned zero routes across 25 vaults on multiple chains,
 * because the Intent Factory allowlist gating it is not public and currently
 * matches nothing we can reach.
 *
 * Exclusion is the right behaviour on LI.FI's side. Serving a Smart Deposits
 * route with the deposit leg quietly removed would hand the user raw tokens
 * while they believed they held vault shares. The pitfall is what it does to
 * the caller: a 404 reads as "this vault is unreachable", and the instinctive
 * responses (retry, widen slippage, drop the flag) are all wrong. Dropping the
 * flag is the worst of them, because it silently abandons the behaviour the
 * user asked for and succeeds while doing it.
 *
 * The only way to tell "flag unserved" from "pair dead" from outside is to run
 * both requests and compare, which is what the probes here do.
 */
describe('Pitfall #25: route flags fail by exclusion, not by error', () => {
  const vault = VaultSchema.parse(vaultBase) as Vault
  const underlying = vault.underlyingTokens[0]?.address as string

  const params = {
    fromChain: 42161,
    toChain: vault.chainId,
    fromToken: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
    toToken: underlying,
    fromAddress: '0x552008c0f6870c2f77e5cC1d2eb9bdff03e30Ea0',
    fromAmount: '10000000',
  }

  /** A fetch that answers the baseline request and the flagged one differently. */
  function stubFetch(baseline: number, flagged: number, body: unknown = {}) {
    return vi.fn(async (url: string | URL) => {
      const href = String(url)
      const isFlagged =
        href.includes('gasless=true') || href.includes('destinationActionKind')
      const status = isFlagged ? flagged : baseline
      return new Response(
        JSON.stringify(status === 200 ? { tool: 'across' } : body),
        {
          status,
          headers: { 'content-type': 'application/json' },
        }
      )
    }) as unknown as typeof globalThis.fetch
  }

  const opts = (fetchImpl: typeof globalThis.fetch) => ({
    apiKey: 'test-key',
    fetchImpl,
  })

  it('separates a flag that is not served from a pair that has no route', async () => {
    // The 404 is identical in both cases. Only the baseline tells them apart.
    const excluded = await probeGasless(
      params,
      opts(stubFetch(200, 404, { message: 'No available quotes' }))
    )
    expect(excluded.verdict).toBe('flag-excluded')
    expect(excluded.baselineRoutes).toBe(true)

    const dead = await probeGasless(
      params,
      opts(stubFetch(404, 404, { message: 'No available quotes' }))
    )
    expect(dead.verdict).toBe('route-unavailable')
    expect(dead.baselineRoutes).toBe(false)

    // Same status, opposite meaning. This is the whole pitfall.
    expect(excluded.status).toBe(dead.status)
    expect(excluded.verdict).not.toBe(dead.verdict)
  })

  it('reports support when the flag is actually served', async () => {
    const probe = await probeGasless(params, opts(stubFetch(200, 200)))
    expect(probe.verdict).toBe('supported')
    expect(probe.flaggedRoutes).toBe(true)
  })

  it('does not read a 400 as exclusion', async () => {
    // The API validates the flag pair before routing. A 400 means the request
    // was malformed, which is a caller bug, not an unserved capability.
    const probe = await probeGasless(
      params,
      opts(
        stubFetch(200, 400, {
          message:
            'querystring must have destinationActionVault when destinationActionKind is set',
        })
      )
    )
    expect(probe.verdict).toBe('rejected')
    expect(probe.detail).toContain('destinationActionVault')
  })

  it('never silently retries without the flag', async () => {
    // A probe reports; it does not fall back. Falling back would succeed while
    // abandoning the behaviour the caller asked for, which is the failure this
    // whole module exists to prevent.
    const probe = await probeGasless(params, opts(stubFetch(200, 404)))
    expect(probe.verdict).toBe('flag-excluded')
    expect(probe.detail).toContain('silently gives up')
  })

  it('rejects a Smart Deposit probe whose toToken is not the underlying', async () => {
    // A mismatched toToken produces the same 404 as an unlisted vault, so
    // probing anyway would record a false negative against the allowlist.
    await expect(
      probeSmartDeposit(
        vault,
        { ...params, toToken: '0x0000000000000000000000000000000000000001' },
        opts(stubFetch(200, 404))
      )
    ).rejects.toThrow(ComposerError)
  })

  it('rejects a same-chain Smart Deposit probe', async () => {
    // Destination actions are cross-chain only, so a same-chain probe always
    // reports flag-excluded no matter what the allowlist says.
    await expect(
      probeSmartDeposit(
        vault,
        { ...params, fromChain: vault.chainId },
        opts(stubFetch(200, 404))
      )
    ).rejects.toThrow(/cross-chain/i)
  })

  it('sends both destination action params together', async () => {
    const spy = vi.fn(
      async () => new Response(JSON.stringify({ tool: 'x' }), { status: 200 })
    ) as unknown as typeof globalThis.fetch
    await probeSmartDeposit(vault, params, opts(spy))
    const flaggedCall = (
      spy as unknown as { mock: { calls: [string][] } }
    ).mock.calls
      .map((c) => String(c[0]))
      .find((u) => u.includes('destinationActionKind'))
    expect(flaggedCall).toBeDefined()
    expect(flaggedCall).toContain('destinationActionVault')
  })
})

/**
 * The second half of the trap, and the more expensive one.
 *
 * A step returned for a Smart Deposits route carries its `destinationAction`,
 * and LI.FI's type documentation states that posting the step back without it
 * "prepares a plain bundle that delivers the raw token instead of the action's
 * output". Any code that reserialises a step, strips unknown keys, or narrows
 * it through a stricter type will drop the field, and the resulting flow
 * succeeds: the user ends up holding the underlying asset rather than vault
 * shares, with no error raised anywhere.
 *
 * Provenance matters here, so it is stated plainly: this is sourced from
 * LI.FI's type documentation, not from live observation. On 7 Sep 2026 the
 * allowlist served no routes, so no step carrying a real `destinationAction`
 * could be obtained to test against. The guard is written to be right when
 * routes appear, not to encode behaviour we have watched.
 */
describe('Pitfall #25b: a stripped destinationAction downgrades silently', () => {
  const action = { kind: 'erc4626_deposit', vault: '0xBEEF' } as const

  it('catches a step that lost the action in a round-trip', () => {
    const fromApi = { id: 'step-1', destinationAction: { ...action } }
    // JSON round-trip through a narrower type is the realistic way this happens.
    const reserialised = { id: fromApi.id }
    expect(() =>
      assertDestinationActionPreserved(action, reserialised)
    ).toThrow(ComposerError)
    expect(() =>
      assertDestinationActionPreserved(action, reserialised)
    ).toThrow(/raw token/)
  })

  it('catches an action pointing at a different vault', () => {
    expect(() =>
      assertDestinationActionPreserved(action, {
        destinationAction: {
          kind: 'erc4626_deposit' as const,
          vault: '0xC0FFEE',
        },
      })
    ).toThrow(/wrong vault/)
  })

  it('passes an intact step through unchanged', () => {
    const step = { id: 's', destinationAction: { ...action } }
    expect(assertDestinationActionPreserved(action, step)).toBe(step)
  })

  it('is a no-op when no action was requested', () => {
    const step = { id: 's' }
    expect(assertDestinationActionPreserved(undefined, step)).toBe(step)
  })

  it('matches the vault case-insensitively', () => {
    // Checksummed vs lowercase addresses are both common in the wild; a case
    // difference is not a mismatch.
    const step = {
      destinationAction: { kind: 'erc4626_deposit' as const, vault: '0xbeef' },
    }
    expect(() => assertDestinationActionPreserved(action, step)).not.toThrow()
  })
})
