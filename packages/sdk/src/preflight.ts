// SPDX-License-Identifier: Apache-2.0

import { toSmallestUnit } from './build-deposit-quote.js'
import type { PreflightIssue } from './errors.js'
import type { Vault } from './schemas/index.js'

export interface PreflightReport {
  ok: boolean
  issues: PreflightIssue[]
  /**
   * Checks that could not run because their input was not supplied.
   *
   * Balance and chain checks need on-chain reads this function deliberately
   * does not perform. It stays pure so callers can supply values from wagmi,
   * viem, a cache, or a test. The cost is that `ok: true` on its own is
   * ambiguous: it means "nothing I could check failed", not "safe to deposit".
   * A caller that omits every balance got a clean report for a wallet with no
   * gas and no tokens, which is the exact false-green this library exists to
   * prevent. Naming the gaps makes the difference visible without forcing a
   * network call into a pure function.
   */
  skipped: PreflightSkippedCheck[]
  vault: Vault
  wallet: string
}

/** A check that was not performed, and the input that would enable it. */
export interface PreflightSkippedCheck {
  code: 'GAS_BALANCE' | 'GAS_SUFFICIENCY' | 'TOKEN_BALANCE' | 'CHAIN_MATCH'
  needs: string
}

export interface PreflightOptions {
  walletChainId?: number
  nativeBalance?: bigint
  /**
   * What the transaction is estimated to cost in native token, smallest unit.
   *
   * Without it the gas check can only catch a balance of exactly zero, which
   * is the one case a user is least likely to be in. Sum
   * `quote.estimate.gasCosts[].amount` to supply it.
   */
  estimatedGasCost?: bigint
  tokenBalance?: bigint
  tokenDecimals?: number
  depositAmount?: string
  /** If true, cross-chain deposit is intended: skip chain mismatch error */
  crossChain?: boolean
}

/**
 * Run preflight checks before a deposit:
 * - isTransactional check (Pitfall #13)
 * - Chain mismatch check (Pitfall #12): warning for cross-chain, error for same-chain
 * - Gas token balance check (Pitfall #11), and gas sufficiency when an
 *   estimated cost is supplied
 * - Token balance check (uses string-based toSmallestUnit to avoid float precision loss)
 * - underlyingTokens existence (Pitfall #15)
 * - isRedeemable warning
 */
export function preflight(
  vault: Vault,
  wallet: string,
  options: PreflightOptions = {}
): PreflightReport {
  const issues: PreflightIssue[] = []

  // Pitfall #13
  if (!vault.isTransactional) {
    issues.push({
      code: 'NOT_TRANSACTIONAL',
      message: `Vault ${vault.slug} is not transactional: cannot deposit.`,
      severity: 'error',
    })
  }

  // Pitfall #12: chain mismatch is a warning for cross-chain (Composer bridges)
  if (
    options.walletChainId !== undefined &&
    options.walletChainId !== vault.chainId
  ) {
    issues.push({
      code: 'CHAIN_MISMATCH',
      message: `Wallet is on chain ${options.walletChainId} but vault is on chain ${vault.chainId}. ${options.crossChain ? 'Composer will handle cross-chain bridging.' : 'Switch network or use cross-chain deposit.'}`,
      severity: 'warning',
    })
  }

  // Pitfall #11: no gas token
  if (options.nativeBalance !== undefined && options.nativeBalance === 0n) {
    issues.push({
      code: 'NO_GAS',
      message: 'Wallet has 0 native gas token. Transaction will fail.',
      severity: 'error',
    })
  } else if (
    options.nativeBalance !== undefined &&
    options.estimatedGasCost !== undefined &&
    options.nativeBalance < options.estimatedGasCost
  ) {
    // A balance of exactly zero was the only gas failure this caught, so a
    // wallet holding 1 wei passed a check named "no gas" and then reverted
    // anyway. Given what the transaction is actually estimated to cost, the
    // shortfall is knowable, and `quote.estimate.gasCosts` already carries it.
    issues.push({
      code: 'INSUFFICIENT_GAS',
      message:
        `Wallet holds ${options.nativeBalance} wei of the native gas token but ` +
        `the transaction is estimated to cost ${options.estimatedGasCost}. ` +
        `Short by ${options.estimatedGasCost - options.nativeBalance} wei.`,
      severity: 'error',
    })
  }

  // Pitfall #15: empty underlyingTokens
  if (vault.underlyingTokens.length === 0) {
    issues.push({
      code: 'NO_UNDERLYING_TOKENS',
      message:
        'Vault has no underlyingTokens metadata. You must specify fromToken manually.',
      severity: 'warning',
    })
  }

  // Token balance check: uses string-based conversion to avoid float precision loss
  if (
    options.tokenBalance !== undefined &&
    options.depositAmount !== undefined
  ) {
    const decimals =
      options.tokenDecimals ?? vault.underlyingTokens[0]?.decimals ?? 18
    const requiredRaw = BigInt(toSmallestUnit(options.depositAmount, decimals))
    if (options.tokenBalance < requiredRaw) {
      issues.push({
        code: 'INSUFFICIENT_BALANCE',
        message: `Insufficient token balance. Have: ${options.tokenBalance}, need: ${requiredRaw}`,
        severity: 'error',
      })
    }
  }

  // Redeemability warning
  if (!vault.isRedeemable) {
    issues.push({
      code: 'NOT_REDEEMABLE',
      message: 'Vault is not redeemable. You may not be able to withdraw.',
      severity: 'warning',
    })
  }

  const skipped: PreflightSkippedCheck[] = []
  if (options.nativeBalance === undefined) {
    skipped.push({ code: 'GAS_BALANCE', needs: 'nativeBalance' })
  } else if (options.estimatedGasCost === undefined) {
    // The balance was checked against zero and nothing more. Saying so keeps
    // `ok: true` from reading as "this wallet can afford the transaction".
    skipped.push({ code: 'GAS_SUFFICIENCY', needs: 'estimatedGasCost' })
  }
  if (
    options.tokenBalance === undefined ||
    options.depositAmount === undefined
  ) {
    skipped.push({
      code: 'TOKEN_BALANCE',
      needs:
        options.depositAmount === undefined
          ? 'tokenBalance and depositAmount'
          : 'tokenBalance',
    })
  }
  if (options.walletChainId === undefined) {
    skipped.push({ code: 'CHAIN_MATCH', needs: 'walletChainId' })
  }

  return {
    ok: issues.filter((i) => i.severity === 'error').length === 0,
    issues,
    skipped,
    vault,
    wallet,
  }
}
