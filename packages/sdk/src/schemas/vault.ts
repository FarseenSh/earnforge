// SPDX-License-Identifier: Apache-2.0
import { z } from 'zod';

/** Protocol info — always has name + url */
export const ProtocolSchema = z.object({
  name: z.string(),
  url: z.string(),
});

/** Underlying token — symbol, address, decimals */
export const UnderlyingTokenSchema = z.object({
  symbol: z.string(),
  address: z.string(),
  decimals: z.number(),
});

/** Pack (deposit or redeem method) */
export const PackSchema = z.object({
  name: z.string(),
  stepsType: z.string(),
});

/**
 * APY — base and total always present.
 * reward: Morpho returns 0, Euler/Aave return null. Normalize to 0.
 * (Pitfall #17)
 */
export const ApySchema = z.object({
  base: z.number(),
  total: z.number(),
  reward: z.number().nullable().transform((v) => v ?? 0),
});

/**
 * TVL — usd is always a string from the API.
 * We parse it into { raw, parsed, bigint } at the boundary.
 * (Pitfall #8)
 */
export const TvlSchema = z.object({
  usd: z.string(),
});

export type TvlParsed = {
  raw: string;
  parsed: number;
  bigint: bigint;
};

export function parseTvl(tvl: z.infer<typeof TvlSchema>): TvlParsed {
  return {
    raw: tvl.usd,
    parsed: Number(tvl.usd),
    bigint: BigInt(Math.floor(Number(tvl.usd))),
  };
}

/**
 * Analytics — apy1d, apy7d, apy30d can all be null.
 * Fallback chain: apy.total → apy30d → apy7d → apy1d
 * (Pitfalls #7, #18)
 */
export const AnalyticsSchema = z.object({
  apy: ApySchema,
  tvl: TvlSchema,
  apy1d: z.number().nullable(),
  apy7d: z.number().nullable(),
  apy30d: z.number().nullable(),
  updatedAt: z.string(),
});

/**
 * Get best available APY with fallback chain.
 * Order: apy.total → apy30d → apy7d → apy1d
 */
export function getBestApy(analytics: z.infer<typeof AnalyticsSchema>): number {
  // apy.total is always a number (never null after Zod). If it's non-zero, use it.
  // If it's exactly 0, fall through to historical data as a display hint.
  if (analytics.apy.total !== 0) return analytics.apy.total;
  // Fallback chain for null historical values
  return analytics.apy30d ?? analytics.apy7d ?? analytics.apy1d ?? 0;
}

/**
 * Vault schema — generated from real fixture (earn.li.fi, Apr 11 2026).
 *
 * Key edge cases handled:
 * - description is optional (~14% of vaults have it) (Pitfall #16)
 * - underlyingTokens can be empty array (Pitfall #15)
 * - apy.reward null → 0 (Pitfall #17)
 * - apy1d/apy7d/apy30d nullable (Pitfall #18)
 * - tvl.usd is a string (Pitfall #8)
 */
export const VaultSchema = z.object({
  address: z.string(),
  chainId: z.number(),
  name: z.string(),
  slug: z.string(),
  network: z.string(),
  description: z.string().optional(),
  protocol: ProtocolSchema,
  provider: z.string(),
  syncedAt: z.string(),
  tags: z.array(z.string()),
  underlyingTokens: z.array(UnderlyingTokenSchema),
  lpTokens: z.array(z.unknown()),
  analytics: AnalyticsSchema,
  isTransactional: z.boolean(),
  isRedeemable: z.boolean(),
  depositPacks: z.array(PackSchema),
  redeemPacks: z.array(PackSchema),
});

export type Vault = z.infer<typeof VaultSchema>;

/** Paginated vault list response */
export const VaultListResponseSchema = z.object({
  data: z.array(VaultSchema),
  nextCursor: z.string().nullable(),
  total: z.number(),
});

export type VaultListResponse = z.infer<typeof VaultListResponseSchema>;
