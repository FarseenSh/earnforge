// SPDX-License-Identifier: Apache-2.0
/**
 * Live tests for LI.FI's newer route flags: `gasless` and Smart Deposits.
 *
 * Both flags are declared in `@lifi/types` 18.4.0 and both are accepted by the
 * live API. Neither served a single route on 7 Sep 2026. That is not a defect
 * on either side: Smart Deposits is gated on a curated vault allowlist that
 * LI.FI has not published, and gasless relay coverage is evidently still
 * rolling out.
 *
 * The temptation is to write `expect(verdict).toBe('flag-excluded')` and be
 * done. That is exactly the mistake this repo has made before: an assertion
 * that encodes today's fleet state rather than a rule, which then turns the
 * daily job red the moment LI.FI ships something. A flag going live is good
 * news, and good news must not look like a build failure.
 *
 * So these assert the invariant instead: whatever the API is doing today, the
 * probe must reach a coherent verdict about it, and the two failure modes must
 * stay distinguishable. The verdict itself is logged rather than asserted, so a
 * human reading the job output sees the day it flips without CI going red.
 *
 * Excluded from the default run. Run with:
 *   set -a && . ./.env && set +a && pnpm verify:live
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { EarnDataClient } from '../../src/clients/index.js'
import { probeGasless, probeSmartDeposit } from '../../src/route-flags.js'
import type { Vault } from '../../src/schemas/index.js'

const PLACEHOLDER_KEY = 'test-key-not-a-real-credential'
const ENV_KEY = process.env.LIFI_API_KEY

if (!ENV_KEY || ENV_KEY === PLACEHOLDER_KEY) {
  throw new Error(
    'No real LIFI_API_KEY in the environment. Every route-flag probe would ' +
      'fail with an auth error that reads like an unserved flag.\n' +
      'Run:  set -a && . ./.env && set +a && pnpm verify:live'
  )
}

const KEY = ENV_KEY

/** A funded, well-known address. Nothing is signed or sent: quote only. */
const WALLET = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045'

/** USDC on Arbitrum, used as the source asset for cross-chain probes. */
const USDC_ARBITRUM = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831'
const ARBITRUM = 42161
const BASE = 8453

/** Every verdict the probe is allowed to reach. */
const VERDICTS = ['supported', 'flag-excluded', 'route-unavailable', 'rejected']

describe('live: gasless', () => {
  it('reaches a coherent verdict, whichever way the API is behaving', async () => {
    const probe = await probeGasless(
      {
        fromChain: ARBITRUM,
        toChain: BASE,
        fromToken: USDC_ARBITRUM,
        toToken: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
        fromAddress: WALLET,
        fromAmount: '10000000',
      },
      { apiKey: KEY }
    )

    console.log(`[live] gasless verdict: ${probe.verdict} (${probe.detail})`)
    expect(VERDICTS).toContain(probe.verdict)

    // The invariant that actually matters: a verdict of `flag-excluded` is only
    // ever reached when the baseline routes. Otherwise the probe would be
    // blaming the flag for a pair that has no route either way, which is the
    // false negative this whole module exists to avoid.
    if (probe.verdict === 'flag-excluded') {
      expect(probe.baselineRoutes).toBe(true)
      expect(probe.flaggedRoutes).toBe(false)
    }
    if (probe.verdict === 'supported') {
      expect(probe.flaggedRoutes).toBe(true)
    }
  })
})

describe('live: Smart Deposits', () => {
  let vault: Vault

  beforeAll(async () => {
    const client = new EarnDataClient({ apiKey: KEY })
    const page = await client.listVaults({ chainId: BASE, limit: 50 })
    // Any transactional, unflagged vault whose underlying we can source. The
    // specific vault does not matter: we are probing the allowlist, and no
    // vault is guaranteed to be on it.
    const candidate = page.data.find(
      (v) =>
        v.isTransactional &&
        v.verificationStatus !== 'flagged' &&
        Boolean(v.underlyingTokens[0]?.address)
    )
    if (!candidate) {
      throw new Error(
        'No transactional, unflagged Base vault with an underlying token. ' +
          'That is a real change in the fleet, not a flake.'
      )
    }
    vault = candidate
  })

  it('reaches a coherent verdict about the allowlist', async () => {
    const probe = await probeSmartDeposit(
      vault,
      {
        fromChain: ARBITRUM,
        toChain: vault.chainId,
        fromToken: USDC_ARBITRUM,
        toToken: vault.underlyingTokens[0]?.address as string,
        fromAddress: WALLET,
        fromAmount: '10000000',
      },
      { apiKey: KEY }
    )

    console.log(
      `[live] smart-deposit verdict for ${vault.name}: ${probe.verdict}`
    )
    expect(VERDICTS).toContain(probe.verdict)

    if (probe.verdict === 'flag-excluded') {
      expect(probe.baselineRoutes).toBe(true)
    }

    // A `rejected` verdict here would mean we built a request the API refuses
    // on shape, which is our bug rather than an allowlist miss. The probe
    // guards against the two known causes (mismatched toToken, same-chain)
    // before sending, so reaching this state means a third has appeared.
    expect(probe.verdict).not.toBe('rejected')
  })

  it('refuses to probe a pair that would produce a false negative', async () => {
    // Same-chain and mismatched-token probes both return the same 404 as an
    // unlisted vault. Recording either as `flag-excluded` would put a wrong
    // fact about LI.FI's allowlist into a caller's cache.
    await expect(
      probeSmartDeposit(
        vault,
        {
          fromChain: vault.chainId,
          toChain: vault.chainId,
          fromToken: USDC_ARBITRUM,
          toToken: vault.underlyingTokens[0]?.address as string,
          fromAddress: WALLET,
          fromAmount: '10000000',
        },
        { apiKey: KEY }
      )
    ).rejects.toThrow(/cross-chain/i)
  })
})
