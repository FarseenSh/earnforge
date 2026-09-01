// SPDX-License-Identifier: Apache-2.0
/**
 * Live integration tests against the real LI.FI Composer API.
 *
 * These exist because of a failure the mocked suite structurally could not
 * catch. `buildDepositFlow` composed a swap from the zero address on every
 * plain deposit, and Composer refused the program with:
 *
 *   422 preparation_error: no_route_error on op `swap`
 *   "No route available for swap 0x0000…0000 → 0x8335…2913"
 *
 * That is every vault, every wallet, every call. It shipped in a published
 * release and stayed there, because `composer-flows.test.ts` stubs compilation
 *. It asserts the request we compose, which proves we still send what we meant
 * to send, not that LI.FI still accepts it.
 *
 * The daily drift job did not help either: until this file existed, the entire
 * live suite talked to `earn.li.fi` and nothing at all talked to `li.quest`.
 * A blind spot that large is not a gap in coverage, it is a gap in the map.
 *
 * Excluded from the default run. Run with:
 *   LIFI_API_KEY=... pnpm --filter @earnforge/sdk test:live
 *
 * These cost Composer quota, so the set is deliberately small: one assertion
 * per thing that can independently break, and no fleet walks.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { buildDepositQuote } from '../../src/build-deposit-quote.js'
import { ComposerClient, EarnDataClient } from '../../src/clients/index.js'
import { createComposerFlows } from '../../src/composer-flows.js'
import type { Vault } from '../../src/schemas/index.js'

const PLACEHOLDER_KEY = 'test-key-not-a-real-credential'
const ENV_KEY = process.env.LIFI_API_KEY

if (!ENV_KEY || ENV_KEY === PLACEHOLDER_KEY) {
  throw new Error(
    'No real LIFI_API_KEY in the environment. Every Composer test would fail ' +
      'with an auth error that reads like an outage.\n' +
      'Run:  set -a && . ./.env && set +a && pnpm verify:live'
  )
}

const KEY = ENV_KEY

/** A funded, well-known address. Nothing is signed or sent: compile only. */
const WALLET = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045'

/** WETH on Base, used to force a real swap leg. */
const WETH_BASE = '0x4200000000000000000000000000000000000006'

const earn = new EarnDataClient()
const flows = createComposerFlows({ apiKey: KEY })

/**
 * Resolved at run time rather than hardcoded.
 *
 * A pinned vault slug is a snapshot, and snapshots are what turned the Earn
 * live suite red twice. This picks a large, transactional, unflagged
 * stablecoin vault on Base: if none exists the fleet has changed in a way
 * worth failing on.
 */
let vault: Vault

beforeAll(async () => {
  const page = await earn.listVaults({ chainId: 8453, limit: 50 })
  const candidate = page.data.find(
    (v) =>
      v.isTransactional &&
      v.verificationStatus !== 'flagged' &&
      (v.underlyingTokens?.length ?? 0) > 0 &&
      Number(v.analytics.tvl.usd) > 1_000_000
  )
  if (!candidate) {
    throw new Error(
      'No transactional, unflagged, >$1M vault with a known underlying token ' +
        'on Base. The fleet shape changed.'
    )
  }
  vault = candidate
}, 60_000)

describe('Live Composer: routing reads', () => {
  it('returns routing edges for indexed protocols', async () => {
    const edges = await flows.routingEdges()
    expect(edges.length).toBeGreaterThan(0)
    expect(edges.some((e) => e.protocol === 'aave')).toBe(true)
  })

  it('reports a blue-chip vault as enterable', async () => {
    const r = await flows.vaultRoutability(vault)
    expect(r.canEnter).toBe(true)
    expect(r.edgeCount).toBeGreaterThan(0)
  })
})

describe('Live Composer: deposit flows compile', () => {
  /**
   * The regression this file was written for.
   *
   * Omitting `fromToken` means "I hold the vault's own asset", so the program
   * is a single zap. Composing a swap here is what produced the
   * `no_route_error`, and because it failed at *prepare*, `allowRevert` could
   * not surface it either.
   */
  it('compiles a plain deposit with no fromToken', async () => {
    const sim = await flows.buildDepositFlow({
      vault,
      wallet: WALLET,
      amount: '100000000',
      slippageBps: 100,
    })
    expect(sim.ok).toBe(true)
    const tx = sim.transaction as { to?: string } | null
    expect(tx?.to).toMatch(/^0x[0-9a-fA-F]{40}$/)
  }, 90_000)

  it('compiles a deposit that needs a real swap leg', async () => {
    const sim = await flows.buildDepositFlow({
      vault,
      wallet: WALLET,
      amount: '50000000000000000',
      fromToken: WETH_BASE,
      slippageBps: 100,
    })
    expect(sim.ok).toBe(true)
  }, 90_000)

  /**
   * A malformed program must fail loudly rather than compiling into calldata.
   * Depositing the vault's own share token is the case Composer rejects with
   * "No routing edge found from erc20:<vault> to erc20:<vault>".
   */
  it('rejects a share-to-share program instead of signing it', async () => {
    await expect(
      flows.buildDepositFlow({
        vault,
        wallet: WALLET,
        amount: '100000000',
        fromToken: vault.address,
        slippageBps: 100,
      })
    ).rejects.toThrow(/Failed to compose/)
  }, 90_000)
})

describe('Live Composer. The /v1/quote path', () => {
  /**
   * Flows and `/v1/quote` are different endpoints on different hosts, and only
   * one of them was ever covered. Both ship, so both are checked.
   */
  it('builds a deposit quote for the same vault', async () => {
    const composer = new ComposerClient({ apiKey: KEY })
    const quote = await buildDepositQuote(
      vault,
      { fromAmount: '100', wallet: WALLET },
      composer
    )
    expect(quote.rawAmount).toMatch(/^\d+$/)
    expect(quote.decimals).toBeGreaterThan(0)
    expect(quote.quote.transactionRequest).toBeDefined()
  }, 90_000)
})
