// SPDX-License-Identifier: Apache-2.0
import { z } from 'zod'

/**
 * Protocol info. `id` is the filter key used by `?protocol=` — it is
 * UNVERSIONED as of the Apr 2026 API rewrite (`morpho`, not `morpho-v1`).
 * Filtering on a versioned slug returns zero results with no error.
 */
export const ProtocolSchema = z.object({
  id: z.string().optional(),
  name: z.string(),
  url: z.string(),
})

/**
 * Underlying token. `priceUsd` is a decimal string, present on every token
 * observed live. `weight` is documented for multi-asset vaults but never
 * actually emitted — accepted optimistically in case it ships.
 */
export const UnderlyingTokenSchema = z.object({
  symbol: z.string(),
  address: z.string(),
  decimals: z.number(),
  priceUsd: z.string().optional(),
  weight: z.number().optional(),
})

/**
 * Reward token distributed by the vault (e.g. governance token).
 *
 * Only `address` is guaranteed. Most entries carry symbol/decimals/priceUsd,
 * but a minority are address-only stubs — the spec declares symbol and
 * decimals required, which would reject those.
 */
export const RewardTokenSchema = z.object({
  address: z.string(),
  symbol: z.string().optional(),
  decimals: z.number().optional(),
  priceUsd: z.string().optional(),
})

/**
 * Pack (deposit or redeem method). Legacy "zap-pack" metadata — the endpoints
 * that served these were decommissioned in Jun 2026, but the vault field still
 * populates. `stepsType` is `instant` on every pack observed; `complex` is
 * documented but unseen.
 */
export const PackSchema = z.object({
  name: z.string(),
  stepsType: z.string(),
})

/**
 * APY breakdown. All values are PERCENTAGES: `4.63439` means 4.63%.
 *
 * LI.FI's OpenAPI spec, quickstart, and NormalizedVault docs all claim these
 * are decimals (`0.0534` = 5.34%) and all three are wrong — following their
 * quickstart's `* 100` yields a 100x overstatement. Verified against 711 live
 * vaults (Aug 4 2026): min 0, max 106.16, median 3.51.
 *
 * `base` is null on a small number of vaults. `reward` is genuinely
 * three-valued — null (unknown), 0 (no rewards), or a number — and the split
 * varies WITHIN a protocol, not just between protocols. We preserve null
 * rather than collapsing it to 0, because "unknown" and "none" are different
 * facts for reward-sustainability analysis. Use `getRewardApy()` when you just
 * want a number.
 */
export const ApySchema = z.object({
  base: z.number().nullable(),
  total: z.number(),
  reward: z.number().nullable(),
})

/**
 * TVL. `usd` is a NUMBER as of the Apr 2026 rewrite — it was a string before,
 * and the OpenAPI spec still says string. We accept both and normalise, so a
 * flip in either direction is a non-event for callers.
 */
export const TvlSchema = z.object({
  usd: z.union([z.number(), z.string()]),
  native: z.union([z.number(), z.string()]).optional(),
})

export type TvlParsed = {
  raw: string
  parsed: number
  bigint: bigint
}

/**
 * Normalise TVL to a stable shape regardless of whether the API sent a number
 * or a string. `bigint` is derived from the integer part only, avoiding
 * Number() precision loss on large values.
 */
export function parseTvl(tvl: z.infer<typeof TvlSchema>): TvlParsed {
  const raw = String(tvl.usd)
  const integerPart = raw.split('.')[0] ?? '0'
  return {
    raw,
    parsed: Number(raw),
    bigint: BigInt(integerPart),
  }
}

/**
 * Analytics. `apy30d` is populated on every live vault; `apy1d` and `apy7d`
 * are null on a handful. `updatedAt` reflects a documented 15-minute refresh
 * cycle for APY/TVL, which makes it usable as a staleness signal.
 */
export const AnalyticsSchema = z.object({
  apy: ApySchema,
  tvl: TvlSchema,
  apy1d: z.number().nullable(),
  apy7d: z.number().nullable(),
  apy30d: z.number().nullable(),
  updatedAt: z.string(),
})

/**
 * Best available APY as a percentage, with a fallback chain for vaults whose
 * current APY has not been computed: apy.total -> apy30d -> apy7d -> apy1d.
 */
export function getBestApy(analytics: z.infer<typeof AnalyticsSchema>): number {
  if (analytics.apy.total !== 0) {
    return analytics.apy.total
  }
  return analytics.apy30d ?? analytics.apy7d ?? analytics.apy1d ?? 0
}

/** Reward APY as a number, treating "unknown" (null) as zero. */
export function getRewardApy(
  analytics: z.infer<typeof AnalyticsSchema>
): number {
  return analytics.apy.reward ?? 0
}

/**
 * Whether the reward APY is unknown rather than known-zero. Preserved because
 * a null reward means the protocol did not report incentives, which is not the
 * same as reporting that there are none.
 */
export function isRewardApyUnknown(
  analytics: z.infer<typeof AnalyticsSchema>
): boolean {
  return analytics.apy.reward === null
}

/**
 * One reason a vault was flagged by LI.FI's verification pass.
 * Observed reasons: `zero_apy`, `apy_outlier`, `none`.
 */
export const VerificationBreakdownSchema = z.object({
  reason: z.string(),
  result: z.string(),
})

/**
 * Deposit capacity limits. Documented in the OpenAPI spec but absent from
 * every live vault — accepted so we pick it up automatically if it ships.
 */
export const CapsSchema = z.object({
  totalCap: z.union([z.number(), z.string()]).optional(),
  maxCap: z.union([z.number(), z.string()]).optional(),
})

/**
 * Vault schema — derived from live vaults, not from docs. Last re-verified
 * against 711 vaults on Aug 4 2026.
 *
 * Removed by LI.FI in the Apr 2026 rewrite: `provider`, `lpTokens`. Both were
 * required here and threw on every vault.
 *
 * Undocumented additions LI.FI never announced: `verificationStatus` and
 * `verificationStatusBreakdown`, present on every vault, flagging 9% of the
 * fleet. Absent from the OpenAPI spec entirely.
 *
 * Documented-but-nonexistent (`caps`, `timeLock`, `kyc`) are declared optional
 * so they bind automatically if LI.FI ever ships them.
 */
export const VaultSchema = z.object({
  address: z.string(),
  chainId: z.number(),
  name: z.string(),
  slug: z.string(),
  network: z.string(),
  description: z.string().optional(),
  protocol: ProtocolSchema,
  syncedAt: z.string(),
  tags: z.array(z.string()),
  underlyingTokens: z.array(UnderlyingTokenSchema),
  rewardTokens: z.array(RewardTokenSchema).optional(),
  analytics: AnalyticsSchema,
  isTransactional: z.boolean(),
  isRedeemable: z.boolean(),
  depositPacks: z.array(PackSchema),
  redeemPacks: z.array(PackSchema),
  verificationStatus: z.string().optional(),
  verificationStatusBreakdown: z.array(VerificationBreakdownSchema).optional(),
  caps: CapsSchema.optional(),
  timeLock: z.number().optional(),
  kyc: z.boolean().optional(),
})

export type Vault = z.infer<typeof VaultSchema>

/** Whether LI.FI's verification pass flagged this vault as suspect. */
export function isFlagged(vault: Vault): boolean {
  return vault.verificationStatus === 'flagged'
}

/** Human-readable reasons a vault was flagged, empty if clean. */
export function flagReasons(vault: Vault): string[] {
  return (vault.verificationStatusBreakdown ?? [])
    .filter((b) => b.result === 'flagged')
    .map((b) => b.reason)
}

/** Whether the vault carries an impermanent-loss risk tag. */
export function hasImpermanentLossRisk(vault: Vault): boolean {
  return vault.tags.includes('il-risk')
}

/** Age of the vault's analytics in milliseconds, relative to `now`. */
export function analyticsAgeMs(vault: Vault, now = Date.now()): number {
  return now - new Date(vault.analytics.updatedAt).getTime()
}

/**
 * Parse a live vault slug. Format is `protocol:chainId:_:address` as of the
 * Apr 2026 rewrite — the previous `chainId-address` form no longer occurs.
 * Both are accepted so cached or user-supplied legacy slugs still resolve.
 */
export function parseVaultSlug(
  slug: string
): { chainId: number; address: string } | null {
  const colonParts = slug.split(':')
  if (colonParts.length >= 4) {
    const chainId = Number(colonParts[1])
    const address = colonParts[colonParts.length - 1] ?? ''
    if (!Number.isNaN(chainId) && /^0x[0-9a-fA-F]{40}$/.test(address)) {
      return { chainId, address }
    }
    return null
  }
  const dashIdx = slug.indexOf('-')
  if (dashIdx === -1) {
    return null
  }
  const chainId = Number(slug.slice(0, dashIdx))
  const address = slug.slice(dashIdx + 1)
  if (Number.isNaN(chainId) || !/^0x[0-9a-fA-F]{40}$/.test(address)) {
    return null
  }
  return { chainId, address }
}

/**
 * Paginated vault list. `nextCursor` is ABSENT from the JSON on the last page
 * — not null, not empty — so it must be both nullable and optional.
 */
export const VaultListResponseSchema = z.object({
  data: z.array(VaultSchema),
  nextCursor: z.string().nullable().optional(),
  total: z.number(),
})

export type VaultListResponse = z.infer<typeof VaultListResponseSchema>
