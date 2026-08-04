// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it, vi } from 'vitest'
import {
  type AaveAccountData,
  AaveLifecycleError,
  assertBorrowSafe,
  getAaveAccountData,
  projectBorrow,
} from '../src/aave-lifecycle.js'

/**
 * Borrowing is the one place in this toolkit where doing nothing can still lose
 * money, so these tests are mostly about the refusals.
 */

/** $10,000 collateral at an 82.5% liquidation threshold, no debt. */
const HEALTHY: AaveAccountData = {
  totalCollateralBase: 1_000_000_000_000n, // 10,000 * 1e8
  totalDebtBase: 0n,
  availableBorrowsBase: 800_000_000_000n,
  currentLiquidationThreshold: 8250n,
  ltv: 8000n,
  healthFactor: null,
}

/** Same collateral, already carrying $5,000 of debt. */
const LEVERAGED: AaveAccountData = {
  ...HEALTHY,
  totalDebtBase: 500_000_000_000n,
  healthFactor: 1.65,
}

const USD = (n: number) => BigInt(Math.round(n * 1e8))

describe('projectBorrow', () => {
  it('projects the health factor of a first borrow', () => {
    // 10,000 * 0.825 / 2,000 = 4.125
    const p = projectBorrow(HEALTHY, USD(2000))
    expect(p.after).toBeCloseTo(4.125, 3)
    expect(p.before).toBeNull()
    expect(p.safe).toBe(true)
  })

  it('accounts for debt already outstanding', () => {
    // 10,000 * 0.825 / (5,000 + 1,000) = 1.375
    const p = projectBorrow(LEVERAGED, USD(1000))
    expect(p.after).toBeCloseTo(1.375, 3)
    expect(p.before).toBe(1.65)
    expect(p.safe).toBe(false)
  })

  it('refuses a borrow that would breach the floor, and says how much fits', () => {
    const p = projectBorrow(LEVERAGED, USD(5000))
    expect(p.safe).toBe(false)
    // Floor 1.5 permits total debt of 10,000*0.825/1.5 = 5,500, so 500 more.
    expect(p.maxSafeBorrowBase).toBe(USD(500))
    expect(p.reason).toMatch(/largest borrow that respects it/)
  })

  it('reports zero headroom when already past the floor', () => {
    const underwater: AaveAccountData = {
      ...HEALTHY,
      totalDebtBase: USD(9000),
      healthFactor: 0.91,
    }
    expect(projectBorrow(underwater, USD(1)).maxSafeBorrowBase).toBe(0n)
  })

  it('borrowing exactly the maximum lands on the floor, not through it', () => {
    const p = projectBorrow(LEVERAGED, USD(500))
    expect(p.after).toBeCloseTo(1.5, 6)
    expect(p.safe).toBe(true)
  })
})

describe('projectBorrow — refusals', () => {
  it('rejects a floor at or below the liquidation threshold', () => {
    // A floor of 1.0 means "warn me once I am already liquidatable".
    expect(() => projectBorrow(HEALTHY, USD(100), 1.0)).toThrow(
      /at or below Aave's liquidation threshold/
    )
    expect(() => projectBorrow(HEALTHY, USD(100), 0.9)).toThrow(
      AaveLifecycleError
    )
  })

  it('rejects borrowing against no collateral', () => {
    const empty = { ...HEALTHY, totalCollateralBase: 0n }
    expect(() => projectBorrow(empty, USD(100))).toThrow(/no Aave collateral/)
  })

  it('rejects a non-positive amount', () => {
    expect(() => projectBorrow(HEALTHY, 0n)).toThrow(/must be positive/)
    expect(() => projectBorrow(HEALTHY, -1n)).toThrow(/must be positive/)
  })
})

describe('assertBorrowSafe', () => {
  it('returns the projection when the borrow is safe', () => {
    expect(assertBorrowSafe(HEALTHY, USD(2000)).safe).toBe(true)
  })

  it('throws rather than returning a boolean nobody checks', () => {
    expect(() => assertBorrowSafe(LEVERAGED, USD(5000))).toThrow(
      AaveLifecycleError
    )
  })
})

describe('getAaveAccountData', () => {
  const POOL = '0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2'
  const USER = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045'

  const word = (v: bigint) => v.toString(16).padStart(64, '0')
  const reply = (words: bigint[]) =>
    ({
      json: async () => ({ result: `0x${words.map(word).join('')}` }),
    }) as unknown as Response

  it('decodes all six words of getUserAccountData', async () => {
    const fetchMock = vi.fn(async () =>
      reply([
        1_000_000_000_000n,
        500_000_000_000n,
        300_000_000_000n,
        8250n,
        8000n,
        1_650_000_000_000_000_000n,
      ])
    )
    vi.stubGlobal('fetch', fetchMock)

    const d = await getAaveAccountData('https://rpc', POOL, USER)
    expect(d.totalCollateralBase).toBe(1_000_000_000_000n)
    expect(d.currentLiquidationThreshold).toBe(8250n)
    expect(d.healthFactor).toBeCloseTo(1.65, 6)
    vi.unstubAllGlobals()
  })

  it('reports no-debt as null rather than 1.16e59', async () => {
    // Aave encodes "no debt" as uint256 max. Surfacing that number verbatim is
    // accurate and completely useless to a caller.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => reply([1n, 0n, 0n, 8250n, 8000n, 2n ** 256n - 1n]))
    )
    const d = await getAaveAccountData('https://rpc', POOL, USER)
    expect(d.healthFactor).toBeNull()
    vi.unstubAllGlobals()
  })

  it('explains a short response instead of decoding garbage', async () => {
    // The classic mistake is passing PoolAddressesProvider instead of Pool.
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          ({ json: async () => ({ result: '0x00' }) }) as unknown as Response
      )
    )
    await expect(getAaveAccountData('https://rpc', POOL, USER)).rejects.toThrow(
      /PoolAddressesProvider/
    )
    vi.unstubAllGlobals()
  })

  it('surfaces an RPC error rather than returning an empty position', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          ({
            json: async () => ({ error: { message: 'execution reverted' } }),
          }) as unknown as Response
      )
    )
    await expect(getAaveAccountData('https://rpc', POOL, USER)).rejects.toThrow(
      /execution reverted/
    )
    vi.unstubAllGlobals()
  })
})
