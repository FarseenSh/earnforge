// SPDX-License-Identifier: Apache-2.0
import { z } from 'zod';

/** Token info in Composer responses */
export const ComposerTokenSchema = z.object({
  address: z.string(),
  chainId: z.number(),
  symbol: z.string(),
  decimals: z.number(),
  name: z.string(),
  coinKey: z.string().optional(),
  logoURI: z.string().optional(),
  priceUSD: z.string().optional(),
  tags: z.array(z.string()).optional(),
  verificationStatus: z.string().optional(),
  verificationStatusBreakdown: z.array(z.unknown()).optional(),
});

/** Tool details */
export const ToolDetailsSchema = z.object({
  key: z.string(),
  name: z.string(),
  logoURI: z.string().optional(),
});

/** Fee split */
export const FeeSplitSchema = z.object({
  integratorFee: z.string(),
  lifiFee: z.string(),
});

/** Fee cost */
export const FeeCostSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  token: ComposerTokenSchema,
  amount: z.string(),
  amountUSD: z.string(),
  percentage: z.string(),
  included: z.boolean(),
  feeSplit: FeeSplitSchema.optional(),
});

/** Gas cost */
export const GasCostSchema = z.object({
  type: z.string(),
  price: z.string().optional(),
  estimate: z.string().optional(),
  limit: z.string().optional(),
  amount: z.string(),
  amountUSD: z.string(),
  token: ComposerTokenSchema,
});

/** Quote action */
export const QuoteActionSchema = z.object({
  fromToken: ComposerTokenSchema,
  fromAmount: z.string(),
  toToken: ComposerTokenSchema,
  fromChainId: z.number(),
  toChainId: z.number(),
  slippage: z.number(),
  fromAddress: z.string(),
  toAddress: z.string(),
});

/** Quote estimate */
export const QuoteEstimateSchema = z.object({
  tool: z.string(),
  approvalAddress: z.string().optional(),
  toAmountMin: z.string(),
  toAmount: z.string(),
  fromAmount: z.string(),
  feeCosts: z.array(FeeCostSchema).optional(),
  gasCosts: z.array(GasCostSchema).optional(),
  executionDuration: z.number(),
  fromAmountUSD: z.string().optional(),
  toAmountUSD: z.string().optional(),
});

/** Transaction request — ready to sign */
export const TransactionRequestSchema = z.object({
  to: z.string(),
  data: z.string(),
  value: z.string(),
  chainId: z.number(),
  gasPrice: z.string().optional(),
  gasLimit: z.string().optional(),
  from: z.string().optional(),
});

export type TransactionRequest = z.infer<typeof TransactionRequestSchema>;

/** Included step */
export const IncludedStepSchema = z.object({
  id: z.string(),
  type: z.string(),
  tool: z.string(),
  toolDetails: ToolDetailsSchema.optional(),
  action: z.record(z.unknown()),
  estimate: z.record(z.unknown()),
});

/** Full Composer quote response */
export const QuoteResponseSchema = z.object({
  type: z.string(),
  id: z.string(),
  tool: z.string(),
  toolDetails: ToolDetailsSchema.optional(),
  action: QuoteActionSchema,
  estimate: QuoteEstimateSchema,
  includedSteps: z.array(IncludedStepSchema).optional(),
  integrator: z.string().optional(),
  transactionRequest: TransactionRequestSchema,
  transactionId: z.string().optional(),
});

export type QuoteResponse = z.infer<typeof QuoteResponseSchema>;
