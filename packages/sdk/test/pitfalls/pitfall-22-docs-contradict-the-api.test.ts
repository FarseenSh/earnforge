// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest'
import vaultsBase from '../../../fixtures/src/vaults-base.json'
import vaultsEthereum from '../../../fixtures/src/vaults-ethereum.json'
import { VaultListResponseSchema } from '../../src/schemas/index.js'
import { parseTvl } from '../../src/schemas/vault.js'

/**
 * Pitfall #22 — LI.FI's documentation contradicts LI.FI's API.
 *
 * This is the pitfall that subsumes the rest, and the reason our schemas are
 * generated from live responses rather than from the spec. Measured against the
 * real API, the published OpenAPI document is wrong in six places and silent
 * about three fields that exist:
 *
 *   WRONG
 *   - APY is "expressed as a decimal (e.g. 0.0534 = 5.34%)" — it is already a
 *     percentage. The quickstart compounds this by multiplying by 100, so
 *     following the official example overstates every yield 100x.
 *   - `tvl.usd` is declared a string; it is a number.
 *   - `caps`, `timeLock`, `kyc` and `lpTokens` are documented; no vault sends
 *     any of them.
 *
 *   MISSING
 *   - `verificationStatus`, `verificationStatusBreakdown`,
 *     `underlyingTokens[].priceUsd` — all present on every vault.
 *
 * Two further contradictions sit outside the spec: the changelog announces
 * structured error bodies for 400 *and* 404, but only 400 carries an `errors[]`
 * array; and the docs state analytics refresh every 15 minutes, while the
 * fleet refreshes in one hourly batch, putting the freshest reading over an
 * hour old.
 *
 * These assertions pin the *actual* behaviour. If one starts failing, either
 * LI.FI fixed a documentation bug or changed the API — and `pnpm drift` says
 * which.
 */
describe('Pitfall #22: the docs contradict the API', () => {
  const all = [
    ...VaultListResponseSchema.parse(vaultsBase).data,
    ...VaultListResponseSchema.parse(vaultsEthereum).data,
  ]

  it('APY is a percentage, not the decimal the spec claims', () => {
    const totals = all.map((v) => v.analytics.apy.total)
    // A decimal-fraction fleet would sit entirely below 1. This one does not.
    expect(Math.max(...totals)).toBeGreaterThan(1)
  })

  it('a naive spec-following x100 would produce absurd yields', () => {
    // Demonstrates the cost concretely rather than asserting a rule.
    const top = Math.max(...all.map((v) => v.analytics.apy.total))
    expect(top * 100).toBeGreaterThan(500)
  })

  it('tvl.usd is a number, not the string the spec declares', () => {
    for (const vault of all) {
      expect(typeof vault.analytics.tvl.usd).toBe('number')
      // Our parser accepts both, so the flip is a non-event for callers.
      expect(Number.isNaN(parseTvl(vault.analytics.tvl).parsed)).toBe(false)
    }
  })

  it('sends none of the four fields the spec documents', () => {
    for (const field of ['caps', 'timeLock', 'kyc', 'lpTokens']) {
      expect(
        all.some((v) => field in v),
        `spec documents "${field}" but no vault sends it`
      ).toBe(false)
    }
  })

  it('sends three fields the spec never mentions', () => {
    for (const vault of all) {
      expect('verificationStatus' in vault).toBe(true)
      expect('verificationStatusBreakdown' in vault).toBe(true)
    }
    expect(
      all.some((v) => v.underlyingTokens.some((t) => t.priceUsd !== undefined))
    ).toBe(true)
  })

  it('tolerates the documented-but-absent fields if they ever ship', () => {
    // Declared optional rather than omitted, so the day LI.FI implements the
    // spec we bind the fields automatically instead of ignoring them.
    const withExtras = VaultListResponseSchema.parse({
      ...VaultListResponseSchema.parse(vaultsBase),
      data: [
        {
          ...all[0],
          caps: { totalCap: '1', maxCap: '2' },
          timeLock: 86_400,
          kyc: true,
        },
      ],
    })
    const vault = withExtras.data[0]
    expect(vault?.timeLock).toBe(86_400)
    expect(vault?.kyc).toBe(true)
    expect(vault?.caps?.totalCap).toBe('1')
  })
})
