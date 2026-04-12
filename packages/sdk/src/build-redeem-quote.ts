// SPDX-License-Identifier: Apache-2.0
import type { ComposerClient, QuoteParams } from './clients/index.js';
import type { Vault, QuoteResponse } from './schemas/index.js';
import { EarnForgeError } from './errors.js';
import { toSmallestUnit } from './build-deposit-quote.js';

export interface RedeemQuoteOptions {
  /** Amount of vault tokens to redeem (human-readable) */
  fromAmount: string;
  wallet: string;
  /** Token to receive. Defaults to underlying token on vault chain. */
  toToken?: string;
  /** Destination chain. Defaults to vault chain. */
  toChain?: number;
  slippage?: number;
}

export interface RedeemQuoteResult {
  quote: QuoteResponse;
  vault: Vault;
  humanAmount: string;
  rawAmount: string;
}

/**
 * Build a withdrawal/redeem quote.
 *
 * Withdrawal is the reverse of deposit:
 * - fromToken = vault.address (the vault share token)
 * - toToken = underlying token address (what you get back)
 *
 * Uses the same Composer /v1/quote endpoint — just swapped tokens.
 */
export async function buildRedeemQuote(
  vault: Vault,
  options: RedeemQuoteOptions,
  composer: ComposerClient,
): Promise<RedeemQuoteResult> {
  // Validate wallet
  if (!/^0x[0-9a-fA-F]{40}$/.test(options.wallet)) {
    throw new EarnForgeError(
      `Invalid wallet address: "${options.wallet}".`,
      'INVALID_WALLET',
    );
  }

  if (!vault.isRedeemable) {
    throw new EarnForgeError(
      `Vault ${vault.slug} is not redeemable — withdrawals are not supported.`,
      'NOT_REDEEMABLE',
    );
  }

  // Vault share tokens typically use 18 decimals (confirmed from Composer quote fixture)
  const vaultDecimals = 18;
  const rawAmount = toSmallestUnit(options.fromAmount, vaultDecimals);

  // Determine destination token: explicit or first underlying
  const toToken =
    options.toToken ?? vault.underlyingTokens[0]?.address;

  if (!toToken) {
    throw new EarnForgeError(
      'Cannot determine toToken for redeem — vault has no underlyingTokens and none was provided.',
      'NO_TO_TOKEN',
    );
  }

  const toChain = options.toChain ?? vault.chainId;

  // Cross-chain redeem guard
  if (toChain !== vault.chainId && !options.toToken) {
    throw new EarnForgeError(
      `Cross-chain redeems require an explicit toToken address on the destination chain.`,
      'CROSS_CHAIN_TO_TOKEN_REQUIRED',
    );
  }

  const quoteParams: QuoteParams = {
    fromChain: vault.chainId,
    toChain,
    fromToken: vault.address, // Redeem: fromToken = vault share token
    toToken,                  // Redeem: toToken = underlying (reverse of deposit)
    fromAddress: options.wallet,
    toAddress: options.wallet,
    fromAmount: rawAmount,
    slippage: options.slippage,
  };

  const quote = await composer.getQuote(quoteParams);

  return {
    quote,
    vault,
    humanAmount: options.fromAmount,
    rawAmount,
  };
}
