// SPDX-License-Identifier: Apache-2.0
import type { Vault } from './schemas/index.js'
import {
  analyticsAgeMs,
  flagReasons,
  hasImpermanentLossRisk,
  isFlagged,
  parseTvl,
} from './schemas/vault.js'

export interface RiskBreakdown {
  tvl: number
  apyStability: number
  protocol: number
  redeemability: number
  assetType: number
  /** LI.FI's own vault verification signal */
  verification: number
  /** How much of the yield depends on token incentives rather than base yield */
  rewardDependency: number
}

export interface RiskScore {
  score: number
  breakdown: RiskBreakdown
  label: 'low' | 'medium' | 'high'
  /** Human-readable reasons this vault carries risk, most severe first */
  flags: string[]
}

/**
 * Protocol maturity tiers, keyed by LI.FI's live protocol id.
 *
 * Every key appears in the live `GET /v1/protocols` response. The versioned
 * keys this table once used (`aave-v3`, `morpho-v1`, `euler-v2`) matched
 * nothing after the Apr 2026 rewrite, so every vault silently fell through to
 * the default of 3 — Aave and Morpho scored as unknown protocols.
 *
 * Note that "always unversioned" is *not* the rule, though it held for a year:
 * `spark-v2` arrived versioned in Aug 2026. The only durable rule is that ids
 * are read from the endpoint, never assumed — which the live suite enforces.
 *
 * Exported so that test can assert every id here still resolves upstream. An
 * id that stops resolving does not error; the vault just quietly scores worse.
 *
 * ## How these were assigned
 *
 * LI.FI's `/v1/protocols` carries only `id`, `name` and `url` — no maturity
 * signal at all — so the tiers are derived from four observable inputs, scored
 * against the live fleet (710 vaults, Aug 2026) and DeFiLlama:
 *
 * 1. **Track record** — how long the protocol has been listed. The single
 *    strongest signal, and the one TVL cannot substitute for.
 * 2. **Audits** — zero published audits is a material caution regardless of
 *    size. It is why `kinetiq` sits at 5 despite $785M, and why `ample` is
 *    below the unknown-protocol default rather than at it.
 * 3. **Scale** — aggregate TVL, cross-checked between the Earn fleet and
 *    DeFiLlama. A large gap between the two means most of the protocol's
 *    capital is not in the vaults being scored, so Earn-side TVL is weighted.
 * 4. **Category risk** — RWA and lottery mechanics carry failure modes that
 *    on-chain lending does not (off-chain counterparty, negative expected
 *    value per position), and are capped accordingly.
 *
 * The scale is deliberately coarse. 9 is reserved for protocols whose failure
 * would be a systemic event; 3 means "we have no basis to judge this"; below 3
 * means we looked and found something concerning. Precision beyond a whole
 * number would imply confidence this data does not support.
 *
 * `maple` is retained for vaults cached before it left the Earn index.
 */
export const PROTOCOL_TIERS: Record<string, number> = {
  // Blue chip — multi-year record, deep audits, systemic scale.
  aave: 9,
  morpho: 9,
  yearn: 8,
  // Established — long record or very large, well audited.
  'spark-v2': 8, // SparkLend, listed 2023-05, 2 audits, $3.6B
  euler: 7,
  fluid: 7,
  pendle: 7,
  'etherfi-staking': 7,
  ethena: 6,
  maple: 6,
  // Mid — real adoption, but young, thin, or unaudited.
  ipor: 5, // listed 2022-10, the longest record in this band
  midas: 5, // 2024-07, 2 audits, RWA across 3 chains
  kinetiq: 5, // $785M but 2025-07 and ZERO audits — size is not safety
  hyperlend: 5, // $437M, 2025-03, 2 audits, single chain
  upshift: 5,
  // Small or young — audited, but short record and limited scale.
  avant: 4,
  cap: 4,
  neverland: 4,
  yo: 4,
  usdai: 4, // 2025-05, RWA lending — off-chain counterparty risk
  nest: 4, // 2024-10, RWA credit
  concrete: 4, // 2025-02; most of its TVL sits outside these vaults
  infinifi: 4, // 2025-05, $52M
  'auto-finance': 4, // 2 audits, $36M, 10 vaults across 4 chains
  ember: 4, // 2025-09 — under a year old
  // Explicitly evaluated and still unknown. Same value as the fallback, but
  // recorded so the coverage check can tell "unexamined" from "examined".
  apyx: 3, // no audits, no DeFiLlama TVL, no listing date
  hypurrfi: 3, // audited but $1.5M across 3 vaults — too thin to judge
  // Below the unknown default: examined, and the findings are adverse.
  ample: 2, // listed 2026-03, ZERO audits, and lottery-style payout mechanics
}

/**
 * Analytics older than this are treated as stale.
 *
 * LI.FI documents a 15-minute refresh for APY and TVL. Measured across 609
 * live vaults the real floor is 87 minutes with a median of 90, so a
 * documentation-derived threshold would flag the entire fleet and mean nothing.
 * Six hours sits well clear of the observed baseline and isolates vaults whose
 * pipeline has genuinely stalled — roughly 2% of the fleet, up to ~92 hours.
 */
const STALE_ANALYTICS_MS = 6 * 60 * 60 * 1000

/**
 * Compute a composite 0–10 risk score for a vault. Higher is safer.
 *
 * Dimensions:
 * - TVL magnitude — higher TVL means deeper liquidity and more scrutiny
 * - APY stability — divergence between current and trailing APY
 * - Protocol maturity — track record and audit surface
 * - Redeemability — can the position be exited via Composer
 * - Asset type — stablecoin exposure vs volatile, plus impermanent-loss tag
 * - Verification — LI.FI flags ~9% of the fleet; a flagged vault is a
 *   near-disqualifying signal and is weighted accordingly
 * - Reward dependency — yield paid in token incentives can stop; yield from
 *   lending fees generally does not
 */
export function riskScore(vault: Vault): RiskScore {
  const breakdown: RiskBreakdown = {
    tvl: scoreTvl(vault),
    apyStability: scoreApyStability(vault),
    protocol: scoreProtocol(vault),
    redeemability: vault.isRedeemable ? 10 : 3,
    assetType: scoreAssetType(vault),
    verification: scoreVerification(vault),
    rewardDependency: scoreRewardDependency(vault),
  }

  const weights: Record<keyof RiskBreakdown, number> = {
    tvl: 0.18,
    apyStability: 0.14,
    protocol: 0.18,
    redeemability: 0.1,
    assetType: 0.1,
    verification: 0.22,
    rewardDependency: 0.08,
  }

  let score = 0
  for (const key of Object.keys(weights) as (keyof RiskBreakdown)[]) {
    score += breakdown[key] * weights[key]
  }

  const rounded = Math.round(score * 10) / 10

  return {
    score: rounded,
    breakdown,
    label: riskLabel(rounded),
    flags: collectFlags(vault),
  }
}

/**
 * Map a composite score to a label.
 *
 * Calibrated against the live fleet, whose scores span 4.1–9.7 with a median of
 * 7.9 — the previous thresholds (low >= 7, high < 4) put 80% of vaults in "low"
 * and made "high" unreachable, so the label carried no information.
 *
 * The 8.0 cut is deliberate: a verification-flagged vault scores at most 7.96
 * even with a perfect showing on every other dimension, so no flagged vault can
 * ever be labelled low risk.
 */
export function riskLabel(score: number): 'low' | 'medium' | 'high' {
  if (score >= 8) {
    return 'low'
  }
  if (score >= 6) {
    return 'medium'
  }
  return 'high'
}

/** Risk flags in rough order of severity. */
function collectFlags(vault: Vault): string[] {
  const flags: string[] = []

  if (isFlagged(vault)) {
    const reasons = flagReasons(vault)
    flags.push(
      `flagged by LI.FI verification${
        reasons.length > 0 ? `: ${reasons.join(', ')}` : ''
      }`
    )
  }
  if (!vault.isTransactional) {
    flags.push('deposits unavailable via Composer')
  }
  if (!vault.isRedeemable) {
    flags.push('withdrawals unavailable via Composer')
  }
  if (hasImpermanentLossRisk(vault)) {
    flags.push('impermanent loss risk')
  }

  const rewardShare = rewardShareOfTotal(vault)
  if (rewardShare !== null && rewardShare >= 0.5) {
    flags.push(
      `${Math.round(rewardShare * 100)}% of APY comes from token incentives`
    )
  }
  if (vault.analytics.apy.reward === null) {
    flags.push('reward APY not reported by the protocol')
  }

  const ageMs = analyticsAgeMs(vault)
  if (ageMs > STALE_ANALYTICS_MS) {
    flags.push(`analytics ${Math.round(ageMs / 60_000)} minutes stale`)
  }

  if (parseTvl(vault.analytics.tvl).parsed < 100_000) {
    flags.push('TVL under $100k')
  }

  return flags
}

/**
 * Share of total APY attributable to token incentives, or null when the
 * protocol did not report a reward figure at all.
 */
export function rewardShareOfTotal(vault: Vault): number | null {
  const { reward, total } = vault.analytics.apy
  if (reward === null) {
    return null
  }
  if (total <= 0) {
    return 0
  }
  return Math.min(1, reward / total)
}

function scoreTvl(vault: Vault): number {
  const tvl = parseTvl(vault.analytics.tvl)
  if (tvl.parsed >= 100_000_000) {
    return 10
  }
  if (tvl.parsed >= 50_000_000) {
    return 9
  }
  if (tvl.parsed >= 10_000_000) {
    return 8
  }
  if (tvl.parsed >= 5_000_000) {
    return 7
  }
  if (tvl.parsed >= 1_000_000) {
    return 5
  }
  if (tvl.parsed >= 100_000) {
    return 3
  }
  return 1
}

function scoreApyStability(vault: Vault): number {
  const { apy, apy1d, apy30d } = vault.analytics
  const total = apy.total

  // Without trailing data there is nothing to compare against
  if (apy30d === null && apy1d === null) {
    return 5
  }

  const ref = apy30d ?? apy1d ?? total
  if (ref === 0 || total === 0) {
    return 5
  }

  const divergence = Math.abs(total - ref) / Math.max(total, ref)

  if (divergence < 0.05) {
    return 10
  }
  if (divergence < 0.1) {
    return 8
  }
  if (divergence < 0.2) {
    return 6
  }
  if (divergence < 0.5) {
    return 4
  }
  return 2
}

function scoreProtocol(vault: Vault): number {
  const key = vault.protocol.id ?? vault.protocol.name
  return PROTOCOL_TIERS[key] ?? PROTOCOL_TIERS[vault.protocol.name] ?? 3
}

function scoreAssetType(vault: Vault): number {
  let score = vault.tags.includes('stablecoin') ? 9 : 5
  // Multi-asset vaults carry impermanent-loss exposure that single-asset
  // vaults do not, and LI.FI tags it explicitly.
  if (hasImpermanentLossRisk(vault)) {
    score -= 3
  }
  return Math.max(1, score)
}

/**
 * Score LI.FI's verification signal. `apy_outlier` is treated as more severe
 * than `zero_apy`: a zero-APY vault is usually a stale-data problem, whereas an
 * outlier APY is exactly what a yield-seeking caller would sort to the top.
 */
function scoreVerification(vault: Vault): number {
  if (!isFlagged(vault)) {
    return 10
  }
  const reasons = flagReasons(vault)
  if (reasons.includes('apy_outlier')) {
    return 1
  }
  return 2
}

function scoreRewardDependency(vault: Vault): number {
  const share = rewardShareOfTotal(vault)
  // Unreported rewards are an opacity penalty, not a sustainability verdict
  if (share === null) {
    return 7
  }
  if (share === 0) {
    return 10
  }
  if (share < 0.2) {
    return 9
  }
  if (share < 0.4) {
    return 7
  }
  if (share < 0.6) {
    return 5
  }
  if (share < 0.8) {
    return 3
  }
  return 2
}
