// SPDX-License-Identifier: Apache-2.0
import { EarnForgeError } from './errors.js'

/**
 * Aave v3 lifecycle operations — borrow, repay, eMode, rewards.
 *
 * Everything else in EarnForge deals in deposits and withdrawals, where the
 * worst outcome is a failed transaction. Borrowing is different: a position can
 * be liquidated while you do nothing at all, so the operations here are paired
 * with a health-factor projection rather than offered bare.
 *
 * ## On where the health-factor check runs
 *
 * `@lifi/composer-sdk` ships an `AaveGetHealthFactorConfig` type, which implies
 * a `aave.getHealthFactor` op that could be read mid-flow and asserted with
 * `invariant.gte`, baking a liquidation floor into the calldata itself.
 *
 * That op is **not in the live Compose manifest** (verified Aug 2026: the
 * backend exposes `aave.borrow`, `aave.repay`, `aave.repayWithATokens`,
 * `aave.claimRewards`, `aave.setEMode` — and nothing that reads a health
 * factor). The published types describe an operation the service will reject.
 *
 * So the floor here is enforced **before signing, not on-chain**. That is a
 * weaker guarantee and it is stated rather than glossed: the projection is made
 * against current oracle prices, and a price move between the check and
 * inclusion can still land the position below the floor. It prevents the
 * common mistake — borrowing more than the position can carry — not an adverse
 * market. When `aave.getHealthFactor` reaches the manifest, this becomes an
 * on-chain invariant and the distinction goes away.
 */

/** `getUserAccountData(address)` */
const USER_ACCOUNT_DATA_SELECTOR = '0xbf92857c'

/** Aave reports health factor scaled by 1e18. */
const HF_SCALE = 10n ** 18n

/** Aave returns this for a position with no debt — division by zero, in effect. */
const HF_NO_DEBT = 2n ** 256n - 1n

/**
 * Below this, a position is liquidatable. Aave's own threshold is exactly 1.0;
 * the default floor sits above it because arriving at 1.0 is arriving too late.
 */
export const LIQUIDATION_THRESHOLD = 1.0

/** Default floor for {@link projectBorrow}. */
export const DEFAULT_HEALTH_FACTOR_FLOOR = 1.5

export interface AaveAccountData {
  /** Total collateral, in the oracle's base units (8 decimals, USD). */
  totalCollateralBase: bigint
  totalDebtBase: bigint
  availableBorrowsBase: bigint
  /** Liquidation threshold in basis points (8250 = 82.5%). */
  currentLiquidationThreshold: bigint
  ltv: bigint
  /**
   * Health factor as a number. `null` when the account has no debt, which Aave
   * encodes as uint256 max — reporting that as 1.157e59 would be technically
   * true and useless.
   */
  healthFactor: number | null
}

export class AaveLifecycleError extends EarnForgeError {
  constructor(message: string) {
    super(message, 'AAVE_LIFECYCLE_ERROR')
    this.name = 'AaveLifecycleError'
  }
}

/**
 * Read a wallet's Aave position directly from the Pool contract.
 *
 * Raw `eth_call` rather than viem, so the SDK keeps no on-chain dependency —
 * the same approach `checkAllowance` takes.
 */
export async function getAaveAccountData(
  rpcUrl: string,
  poolAddress: string,
  user: string
): Promise<AaveAccountData> {
  const userPadded = user.slice(2).toLowerCase().padStart(64, '0')
  const calldata = `${USER_ACCOUNT_DATA_SELECTOR}${userPadded}`

  const res = await globalThis.fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'eth_call',
      params: [{ to: poolAddress, data: calldata }, 'latest'],
      id: 1,
    }),
  })

  const json = (await res.json()) as {
    result?: string
    error?: { message: string }
  }
  if (json.error || !json.result) {
    throw new AaveLifecycleError(
      `Could not read the Aave position: ${json.error?.message ?? 'no result'}`
    )
  }

  const words = decodeWords(json.result, 6)
  if (!words) {
    throw new AaveLifecycleError(
      'Aave Pool returned a short response — check that the pool address is ' +
        'the Pool contract for this chain, not the PoolAddressesProvider.'
    )
  }

  const rawHf = words[5] as bigint
  return {
    totalCollateralBase: words[0] as bigint,
    totalDebtBase: words[1] as bigint,
    availableBorrowsBase: words[2] as bigint,
    currentLiquidationThreshold: words[3] as bigint,
    ltv: words[4] as bigint,
    healthFactor:
      rawHf === HF_NO_DEBT ? null : Number(rawHf) / Number(HF_SCALE),
  }
}

export interface BorrowProjection {
  /** Health factor before the borrow. `null` when there is no existing debt. */
  before: number | null
  /** Projected health factor after it. */
  after: number
  /** The floor the projection was checked against. */
  floor: number
  /** Whether the borrow keeps the position above the floor. */
  safe: boolean
  /** Largest borrow, in base units, that would still respect the floor. */
  maxSafeBorrowBase: bigint
  reason: string
}

/**
 * Project the health factor that would result from borrowing `amountBase`.
 *
 * Health factor is `collateral * liquidationThreshold / debt`, so borrowing
 * moves only the denominator. Both amounts are in Aave's oracle base units,
 * which is what `getUserAccountData` reports — no token decimals involved.
 */
export function projectBorrow(
  account: AaveAccountData,
  amountBase: bigint,
  floor: number = DEFAULT_HEALTH_FACTOR_FLOOR
): BorrowProjection {
  if (amountBase <= 0n) {
    throw new AaveLifecycleError('Borrow amount must be positive.')
  }
  if (floor <= LIQUIDATION_THRESHOLD) {
    throw new AaveLifecycleError(
      `A health-factor floor of ${floor} is at or below Aave's liquidation ` +
        `threshold of ${LIQUIDATION_THRESHOLD}. Choose a floor above it — ` +
        'a position that reaches 1.0 is already liquidatable.'
    )
  }
  if (account.totalCollateralBase === 0n) {
    throw new AaveLifecycleError(
      'This account has no Aave collateral, so it cannot borrow. Supply ' +
        'collateral first.'
    )
  }

  // Scaled by 1e4 because the liquidation threshold is in basis points.
  const weightedCollateral =
    account.totalCollateralBase * account.currentLiquidationThreshold
  const newDebt = account.totalDebtBase + amountBase
  const after = Number(weightedCollateral) / (Number(newDebt) * 10_000)

  // The largest debt the floor permits, converted back to a borrowable delta.
  const maxDebt = BigInt(
    Math.floor(Number(weightedCollateral) / (floor * 10_000))
  )
  const maxSafeBorrowBase =
    maxDebt > account.totalDebtBase ? maxDebt - account.totalDebtBase : 0n

  const safe = after >= floor
  return {
    before: account.healthFactor,
    after,
    floor,
    safe,
    maxSafeBorrowBase,
    reason: safe
      ? `Health factor would be ${after.toFixed(2)}, above the ${floor} floor.`
      : `Health factor would fall to ${after.toFixed(2)}, below the ${floor} ` +
        `floor. The largest borrow that respects it is ${maxSafeBorrowBase} ` +
        '(oracle base units, 8 decimals).',
  }
}

/**
 * Assert a borrow is safe, or throw explaining how much would be.
 *
 * Preferred over checking {@link BorrowProjection.safe} by hand: an ignored
 * boolean is the failure mode this is trying to prevent.
 */
export function assertBorrowSafe(
  account: AaveAccountData,
  amountBase: bigint,
  floor: number = DEFAULT_HEALTH_FACTOR_FLOOR
): BorrowProjection {
  const projection = projectBorrow(account, amountBase, floor)
  if (!projection.safe) {
    throw new AaveLifecycleError(projection.reason)
  }
  return projection
}

/** Decode `count` consecutive uint256 words from an eth_call result. */
function decodeWords(hex: string, count: number): bigint[] | null {
  const body = hex.startsWith('0x') ? hex.slice(2) : hex
  if (body.length < count * 64) {
    return null
  }
  const words: bigint[] = []
  for (let i = 0; i < count; i++) {
    words.push(BigInt(`0x${body.slice(i * 64, (i + 1) * 64)}`))
  }
  return words
}
