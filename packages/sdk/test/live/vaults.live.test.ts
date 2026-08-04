// SPDX-License-Identifier: Apache-2.0
/**
 * Live integration tests against the real LI.FI Earn Data API.
 *
 * These exist because the mocked suite cannot catch the failure that actually
 * happened: LI.FI moved every path, made auth mandatory, removed two fields and
 * flipped the type of a third, and 474 green tests noticed none of it. Fixtures
 * only ever prove that we still agree with a snapshot of the past.
 *
 * Excluded from the default run. Run with:
 *   LIFI_API_KEY=... pnpm --filter @earnforge/sdk test:live
 *
 * Assertions are structural rather than exact wherever the fleet moves on its
 * own — counts drift as LI.FI indexes new protocols, and a test that fails
 * every time a vault is added trains people to ignore it.
 */
import { describe, expect, it } from 'vitest'
import { getAaveAccountData } from '../../src/aave-lifecycle.js'
import { LIFI_TO_LLAMA_PROJECT } from '../../src/apy-history.js'
import { EarnDataClient } from '../../src/clients/index.js'
import { PROTOCOL_TIERS, riskScore } from '../../src/risk-scorer.js'
import { VaultSchema } from '../../src/schemas/index.js'
import { isFlagged, parseTvl, parseVaultSlug } from '../../src/schemas/vault.js'

const client = new EarnDataClient()
const KEY = process.env.LIFI_API_KEY ?? ''

describe('Live API — Auth', () => {
  it('rejects a request with no API key', async () => {
    const res = await fetch('https://earn.li.fi/v1/chains')
    expect(res.status).toBe(401)
  })

  it('rejects a request with a bogus API key', async () => {
    // Proves the header is validated, not merely required.
    const res = await fetch('https://earn.li.fi/v1/chains', {
      headers: { 'x-lifi-api-key': 'not-a-real-key' },
    })
    expect(res.status).toBe(401)
  })

  it('rejects the pre-Apr-2026 /v1/earn/* paths', async () => {
    const res = await fetch('https://earn.li.fi/v1/earn/vaults?chainId=8453', {
      headers: { 'x-lifi-api-key': KEY },
    })
    expect(res.status).toBe(404)
  })
})

describe('Live API — Chains', () => {
  it('returns a non-empty chain list', async () => {
    const chains = await client.listChains()
    expect(chains.length).toBeGreaterThan(10)
  })

  it('includes Ethereum, Base, Arbitrum', async () => {
    const chains = await client.listChains()
    const ids = chains.map((c) => c.chainId)
    expect(ids).toContain(1)
    expect(ids).toContain(8453)
    expect(ids).toContain(42161)
  })

  it('every chain has numeric chainId and CAIP format', async () => {
    const chains = await client.listChains()
    for (const c of chains) {
      expect(typeof c.chainId).toBe('number')
      expect(c.networkCaip).toMatch(/^eip155:\d+$/)
    }
  })
})

describe('Live API — Protocols', () => {
  it('returns a non-empty protocol list', async () => {
    const protocols = await client.listProtocols()
    expect(protocols.length).toBeGreaterThan(5)
  })

  it('includes aave, morpho and euler under unversioned ids', async () => {
    const protocols = await client.listProtocols()
    const ids = protocols.map((p) => p.id ?? p.name)
    expect(ids).toContain('aave')
    expect(ids).toContain('morpho')
    expect(ids).toContain('euler')
  })

  it('every protocol id we ship still resolves upstream', async () => {
    // This replaces an assertion that no protocol id carries a version suffix.
    // That held in Jul 2026, when LI.FI had retired every versioned slug — and
    // stopped holding in Aug, when `spark-v2` appeared. The rule was never
    // "versioned ids do not exist"; it is "do not hardcode an id without
    // checking it", because a stale one returns zero results rather than an
    // error, and an unknown one silently drops to risk tier 3.
    const live = new Set(
      (await client.listProtocols()).map((p) => p.id ?? p.name)
    )
    const shipped = new Set([
      ...Object.keys(PROTOCOL_TIERS),
      ...Object.keys(LIFI_TO_LLAMA_PROJECT),
    ])
    // `maple` left the Earn index in Jul 2026. The mapping is kept so stored
    // vault references still resolve, but it is not expected to be live.
    shipped.delete('maple')

    const vanished = [...shipped].filter((id) => !live.has(id))
    expect(vanished, `protocol ids we score/map that no longer exist`).toEqual(
      []
    )
  })

  it('reports which live protocols have no risk tier', async () => {
    // Not a failure — new protocols appear constantly and default to tier 3.
    // But an unscored protocol is a silent quality gap, so it should be visible
    // rather than discovered by a user wondering why everything scores the same.
    const live = (await client.listProtocols()).map((p) => p.id ?? p.name)
    const untiered = live.filter((id) => !(id in PROTOCOL_TIERS))
    if (untiered.length > 0) {
      console.warn(
        `[coverage] ${untiered.length}/${live.length} live protocols have no ` +
          `risk tier and default to 3: ${untiered.join(', ')}`
      )
    }
    // The blue-chips must always be tiered; everything else is best-effort.
    for (const id of ['aave', 'morpho', 'euler']) {
      expect(untiered, `${id} lost its risk tier`).not.toContain(id)
    }
  })

  it('a versioned slug silently returns zero results, not an error', async () => {
    // The trap: no 400, no signal — just a 200 with nothing in it, so a stale
    // hardcoded slug is indistinguishable from "no vaults exist".
    const stale = await client.listVaults({ protocol: 'morpho-v1', limit: 1 })
    expect(stale.total).toBe(0)

    const current = await client.listVaults({ protocol: 'morpho', limit: 1 })
    expect(current.total).toBeGreaterThan(0)
  })
})

describe('Live API — Vault List', () => {
  it('returns a page of vaults for Base', async () => {
    const page = await client.listVaults({ chainId: 8453 })
    expect(page.data.length).toBeGreaterThan(0)
    expect(page.total).toBeGreaterThan(0)
  })

  it('every vault in the page parses through VaultSchema', async () => {
    const page = await client.listVaults({ chainId: 8453 })
    for (const vault of page.data) {
      expect(() => VaultSchema.parse(vault)).not.toThrow()
    }
  })

  it('has no provider or lpTokens field', async () => {
    // Both were removed in Apr 2026 and both were required in our schema,
    // which is what made every parse throw.
    const page = await client.listVaults({ chainId: 8453, limit: 5 })
    for (const vault of page.data) {
      expect('provider' in vault).toBe(false)
      expect('lpTokens' in vault).toBe(false)
    }
  })

  it('tvl.usd is a number, despite the spec documenting a string', async () => {
    const page = await client.listVaults({ chainId: 8453, limit: 5 })
    for (const vault of page.data) {
      expect(typeof vault.analytics.tvl.usd).toBe('number')
      expect(parseTvl(vault.analytics.tvl).parsed).toBeGreaterThanOrEqual(0)
    }
  })

  it('APY is a percentage, not a decimal fraction', async () => {
    // The OpenAPI spec, the quickstart and how-it-works all say decimal. They
    // are wrong: a top-of-fleet APY above 1 is only coherent as a percentage.
    const page = await client.listVaults({ sortBy: 'apy', limit: 20 })
    const top = page.data[0]
    expect(top).toBeDefined()
    expect(top!.analytics.apy.total).toBeGreaterThan(1)
  })

  it('apy.reward appears as null somewhere in the fleet', async () => {
    const page = await client.listVaults({ limit: 100 })
    const rewards = page.data.map((v) => v.analytics.apy.reward)
    expect(rewards.some((r) => r === null)).toBe(true)
  })

  it('some vaults have no description', async () => {
    const page = await client.listVaults({ limit: 100 })
    expect(page.data.some((v) => v.description === undefined)).toBe(true)
  })

  it('exposes verificationStatus on every vault', async () => {
    const page = await client.listVaults({ limit: 100 })
    for (const vault of page.data) {
      expect(typeof vault.verificationStatus).toBe('string')
    }
  })

  it('flags a meaningful minority of vaults', async () => {
    // Around 9% of the fleet is flagged. If this hits zero, either LI.FI stopped
    // emitting the field or we stopped reading it — both worth knowing.
    const page = await client.listVaults({ limit: 100 })
    const flagged = page.data.filter(isFlagged)
    expect(flagged.length).toBeGreaterThan(0)
    expect(flagged.length).toBeLessThan(page.data.length)
  })

  it('minTvlUsd actually filters, unlike the minTvl we used to send', async () => {
    // An unknown query param is silently ignored rather than rejected, so the
    // old `minTvl` returned the entire fleet while appearing to work.
    const all = await client.listVaults({ limit: 1 })
    const filtered = await client.listVaults({ limit: 1, minTvl: 100_000_000 })
    expect(filtered.total).toBeGreaterThan(0)
    expect(filtered.total).toBeLessThan(all.total)
  })

  it('accepts a page size of 100', async () => {
    const page = await client.listVaults({ limit: 100 })
    expect(page.data.length).toBeLessThanOrEqual(100)
    expect(page.data.length).toBeGreaterThan(50)
  })

  it('pagination works via nextCursor and omits it on the last page', async () => {
    const first = await client.listVaults({ chainId: 8453, limit: 50 })
    expect(first.nextCursor).toBeTruthy()

    const second = await client.listVaults({
      chainId: 8453,
      limit: 50,
      cursor: first.nextCursor ?? undefined,
    })
    expect(second.data.length).toBeGreaterThan(0)
    // Base fits in two pages, so the second omits the cursor entirely.
    expect(second.nextCursor ?? undefined).toBeUndefined()
    expect(first.data.length + second.data.length).toBe(first.total)
  })

  it('the capability filters narrow the result set', async () => {
    const all = await client.listVaults({ limit: 1 })
    const transactional = await client.listVaults({
      limit: 1,
      isTransactional: true,
    })
    expect(transactional.total).toBeLessThanOrEqual(all.total)
  })
})

describe('Live API — Single Vault', () => {
  it('fetches a vault by chainId + address', async () => {
    const page = await client.listVaults({ chainId: 8453, limit: 1 })
    const target = page.data[0]
    expect(target).toBeDefined()

    const vault = await client.getVault(target!.chainId, target!.address)
    expect(vault.address.toLowerCase()).toBe(target!.address.toLowerCase())
    expect(vault.chainId).toBe(8453)
  })

  it('fetches the same vault by its live slug', async () => {
    const page = await client.listVaults({ chainId: 8453, limit: 1 })
    const target = page.data[0]!
    // Slug format is protocol:chainId:_:address as of Apr 2026.
    expect(parseVaultSlug(target.slug)).not.toBeNull()

    const vault = await client.getVaultBySlug(target.slug)
    expect(vault.address.toLowerCase()).toBe(target.address.toLowerCase())
  })

  it('404s on an unknown vault with no errors[] array', async () => {
    // The changelog announced structured 400s and 404s. Only 400 got one.
    await expect(
      client.getVault(8453, '0x0000000000000000000000000000000000000000')
    ).rejects.toMatchObject({ status: 404, fieldErrors: [] })
  })

  it('returns a structured errors[] array on a 400', async () => {
    const res = await fetch('https://earn.li.fi/v1/vaults?chainId=notanumber', {
      headers: { 'x-lifi-api-key': KEY },
    })
    expect(res.status).toBe(400)
    const body = (await res.json()) as {
      errors?: Array<{ code: string; path: string[] }>
    }
    expect(Array.isArray(body.errors)).toBe(true)
    expect(body.errors?.[0]?.path).toContain('chainId')
  })
})

describe('Live API — Portfolio', () => {
  it('returns positions for a known address', async () => {
    const portfolio = await client.getPortfolio(
      '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045'
    )
    expect(Array.isArray(portfolio.positions)).toBe(true)
    for (const p of portfolio.positions) {
      // protocolName and balanceUsd are nullable as of Apr 2026.
      expect(p.chainId).toBeTypeOf('number')
      expect(p.asset.symbol).toBeTruthy()
    }
  })
})

describe('Live API — Risk Score', () => {
  it('computes a risk score for real vaults', async () => {
    const page = await client.listVaults({ chainId: 8453, limit: 20 })
    for (const vault of page.data) {
      const score = riskScore(vault)
      expect(score.score).toBeGreaterThanOrEqual(0)
      expect(score.score).toBeLessThanOrEqual(10)
      expect(['low', 'medium', 'high']).toContain(score.label)
    }
  })

  it('never labels a flagged vault as low risk', async () => {
    const page = await client.listVaults({ limit: 100 })
    for (const vault of page.data.filter(isFlagged)) {
      expect(riskScore(vault).label).not.toBe('low')
    }
  })

  it('scores a large blue-chip vault as low risk', async () => {
    const page = await client.listVaults({
      protocol: 'aave',
      sortBy: 'tvl',
      limit: 5,
    })
    const biggest = page.data.find((v) => !isFlagged(v))
    if (biggest) {
      expect(riskScore(biggest).score).toBeGreaterThan(7)
    }
  })
})

describe('Live API — Async Iterator', () => {
  it('listAllVaults walks every page for Base', async () => {
    const page = await client.listVaults({ chainId: 8453, limit: 50 })
    let count = 0
    for await (const _vault of client.listAllVaults({ chainId: 8453 })) {
      count++
    }
    expect(count).toBe(page.total)
  })
})

describe('Live chain — Aave v3 Pool ABI', () => {
  // Aave v3 Pool, Ethereum mainnet.
  const POOL = '0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2'
  const RPC = 'https://ethereum-rpc.publicnode.com'

  it('getUserAccountData still returns the six words we decode', async () => {
    // `getAaveAccountData` reads this by raw selector rather than through an
    // ABI, so a signature change would not fail to compile — it would decode
    // whatever came back and hand the caller a plausible, wrong health factor.
    // This is the only thing standing between that and a liquidation.
    const data = await getAaveAccountData(
      RPC,
      POOL,
      '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045'
    )
    expect(typeof data.totalCollateralBase).toBe('bigint')
    expect(typeof data.currentLiquidationThreshold).toBe('bigint')
    // Basis points, so a sane threshold is 0 (no position) or under 100%.
    expect(Number(data.currentLiquidationThreshold)).toBeLessThanOrEqual(10_000)
    // Either a real ratio or null for a debt-free account — never uint256 max
    // leaking through as 1.16e59.
    expect(
      data.healthFactor === null || Number.isFinite(data.healthFactor)
    ).toBe(true)
    if (data.healthFactor !== null) {
      expect(data.healthFactor).toBeLessThan(1e6)
    }
  })
})
