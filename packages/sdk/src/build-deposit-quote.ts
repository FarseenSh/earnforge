// SPDX-License-Identifier: Apache-2.0
import type { ComposerClient, QuoteParams } from './clients/index.js'
import type { Vault, QuoteResponse } from './schemas/index.js'
import { EarnForgeError } from './errors.js'

export interface DepositQuoteOptions {
  fromAmount: string
  wallet: string
  fromToken?: string
  fromChain?: number
  slippage?: number
  fromAmountForGas?: string
}

export interface DepositQuoteResult {
  quote: QuoteResponse
  vault: Vault
  humanAmount: string
  rawAmount: string
  decimals: number
}

/**
 * Build a deposit quote with all 18 pitfalls handled:
 *
 * - toToken = vault.address (Pitfall #5)
 * - Uses correct decimals from underlyingTokens (Pitfall #9)
 * - Validates isTransactional (Pitfall #13)
 * - Validates underlyingTokens is non-empty (Pitfall #15)
 * - GET request via ComposerClient (Pitfall #4)
 * - API key in header via ComposerClient (Pitfall #3)
 */
export async function buildDepositQuote(
  vault: Vault,
  options: DepositQuoteOptions,
  composer: ComposerClient
): Promise<DepositQuoteResult> {
  // Validate wallet address format
  if (!/^0x[0-9a-fA-F]{40}$/.test(options.wallet)) {
    throw new EarnForgeError(
      `Invalid wallet address: "${options.wallet}". Must be a 0x-prefixed 40-hex-char address.`,
      'INVALID_WALLET'
    )
  }

  // Pitfall #13: non-transactional vault
  if (!vault.isTransactional) {
    throw new EarnForgeError(
      `Vault ${vault.slug} is not transactional — deposits are not supported.`,
      'NOT_TRANSACTIONAL'
    )
  }

  // Pitfall #15: empty underlyingTokens
  if (vault.underlyingTokens.length === 0 && !options.fromToken) {
    throw new EarnForgeError(
      `Vault ${vault.slug} has no underlyingTokens. You must specify fromToken explicitly.`,
      'NO_UNDERLYING_TOKENS'
    )
  }

  // Determine fromToken: explicit override or first underlying token (Pitfall #5 helper)
  const fromTokenAddr = options.fromToken ?? vault.underlyingTokens[0]?.address

  if (!fromTokenAddr) {
    throw new EarnForgeError(
      'Cannot determine fromToken — vault has no underlyingTokens and none was provided.',
      'NO_FROM_TOKEN'
    )
  }

  // Cross-chain guard: vault's underlyingToken address is on vault's chain, not source chain
  const fromChain = options.fromChain ?? vault.chainId
  if (fromChain !== vault.chainId && !options.fromToken) {
    throw new EarnForgeError(
      `Cross-chain deposits require an explicit fromToken. The vault's underlyingTokens are on chain ${vault.chainId}, not chain ${fromChain}.`,
      'CROSS_CHAIN_FROM_TOKEN_REQUIRED'
    )
  }

  // Determine decimals for amount conversion (Pitfall #9)
  const decimals =
    vault.underlyingTokens.find(
      (t) => t.address.toLowerCase() === fromTokenAddr.toLowerCase()
    )?.decimals ?? 18

  // Convert human amount to smallest unit
  const rawAmount = toSmallestUnit(options.fromAmount, decimals)

  const quoteParams: QuoteParams = {
    fromChain,
    toChain: vault.chainId,
    fromToken: fromTokenAddr,
    toToken: vault.address, // Pitfall #5: toToken = vault address, NOT underlying
    fromAddress: options.wallet,
    toAddress: options.wallet,
    fromAmount: rawAmount,
    slippage: options.slippage,
    fromAmountForGas: options.fromAmountForGas,
  }

  const quote = await composer.getQuote(quoteParams)

  return {
    quote,
    vault,
    humanAmount: options.fromAmount,
    rawAmount,
    decimals,
  }
}

/**
 * Convert a human-readable amount to the smallest unit.
 * e.g., "1" with 6 decimals → "1000000" (Pitfall #9)
 */
export function toSmallestUnit(amount: string, decimals: number): string {
  if (!amount || !/^\d+(\.\d+)?$/.test(amount)) {
    throw new EarnForgeError(
      `Invalid amount "${amount}". Must be a positive numeric string (e.g., "100" or "1.5").`,
      'INVALID_AMOUNT'
    )
  }

  const parts = amount.split('.')
  const whole = parts[0] ?? '0'
  let fractional = parts[1] ?? ''

  // Pad or truncate fractional part
  if (fractional.length > decimals) {
    fractional = fractional.slice(0, decimals)
  } else {
    fractional = fractional.padEnd(decimals, '0')
  }

  // Remove leading zeros
  const raw = `${whole}${fractional}`.replace(/^0+/, '') || '0'
  return raw
}

/**
 * Convert smallest unit to human-readable amount.
 */
export function fromSmallestUnit(rawAmount: string, decimals: number): string {
  if (decimals === 0) return rawAmount
  const padded = rawAmount.padStart(decimals + 1, '0')
  const whole = padded.slice(0, padded.length - decimals)
  const fractional = padded.slice(padded.length - decimals).replace(/0+$/, '')
  return fractional ? `${whole}.${fractional}` : whole
}
