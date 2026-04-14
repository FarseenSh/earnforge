// SPDX-License-Identifier: Apache-2.0
import type { Vault } from './schemas/index.js'
import type { PreflightIssue } from './errors.js'
import { toSmallestUnit } from './build-deposit-quote.js'

export interface PreflightReport {
  ok: boolean
  issues: PreflightIssue[]
  vault: Vault
  wallet: string
}

export interface PreflightOptions {
  walletChainId?: number
  nativeBalance?: bigint
  tokenBalance?: bigint
  tokenDecimals?: number
  depositAmount?: string
  /** If true, cross-chain deposit is intended — skip chain mismatch error */
  crossChain?: boolean
}

/**
 * Run preflight checks before a deposit:
 * - isTransactional check (Pitfall #13)
 * - Chain mismatch check (Pitfall #12) — warning for cross-chain, error for same-chain
 * - Gas token balance check (Pitfall #11)
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
      message: `Vault ${vault.slug} is not transactional — cannot deposit.`,
      severity: 'error',
    })
  }

  // Pitfall #12: chain mismatch — warning for cross-chain (Composer handles bridging)
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

  // Token balance check — uses string-based conversion to avoid float precision loss
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
      message: 'Vault is not redeemable — you may not be able to withdraw.',
      severity: 'warning',
    })
  }

  return {
    ok: issues.filter((i) => i.severity === 'error').length === 0,
    issues,
    vault,
    wallet,
  }
}
