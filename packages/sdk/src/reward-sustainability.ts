// SPDX-License-Identifier: Apache-2.0
import { type ApyDataPoint, getApyHistory } from './apy-history.js'
import { rewardShareOfTotal } from './risk-scorer.js'
import type { Vault } from './schemas/vault.js'

/**
 * Reward sustainability — "is this 12% real, or an incentive that ends?"
 *
 * A vault advertising 12% where 10 points are a token emission is a different
 * asset from one earning 12% organically, and no LI.FI surface distinguishes
 * them: the vault list, the hosted MCP server, and the official quickstart all
 * present `apy.total` as a single number.
 *
 * The distinction rests on `apy.reward` being *three*-valued, which is why the
 * schema deliberately does not coerce it:
 *
 * - `null` — the protocol reported nothing. Unknown, not zero. 143 of Aave's
 *   160 vaults are null.
 * - `0` — the protocol reported that there are no incentives. Genuinely
 *   organic. 160 of Morpho's 210 vaults are zero.
 * - `> 0` — incentives, and `rewardShareOfTotal` says how much of the headline
 *   depends on them.
 *
 * Collapsing null into 0 — which is what a `?? 0` transform does — destroys
 * exactly the signal this module needs, and makes every Aave vault look
 * confidently organic when nothing is actually known about it.
 */

export type SustainabilityLabel =
  | 'organic'
  | 'mostly-organic'
  | 'incentive-heavy'
  | 'incentive-dependent'
  | 'unknown'

export interface RewardSustainability {
  /** 0–10. Higher means more of the yield survives incentives ending. */
  score: number
  label: SustainabilityLabel
  /** Fraction of total APY that comes from incentives. `null` if unreported. */
  rewardShare: number | null
  /** APY that remains if every incentive stops. `null` if unknowable. */
  organicApy: number | null
  /** Distinct reward tokens the vault emits. */
  rewardTokenCount: number
  /** Human-readable justifications, in the order they were applied. */
  reasons: string[]
  /** Populated only by {@link analyzeRewardSustainability}. */
  trend?: RewardTrend
}

export interface RewardTrend {
  /** Direction of total APY across the observed window. */
  direction: 'rising' | 'flat' | 'decaying'
  /** Fractional change from the start of the window to the end. */
  change: number
  /** Number of observations the trend is based on. */
  samples: number
}

/** Below this share of total APY, incentives are a rounding error. */
const NEGLIGIBLE_SHARE = 0.05
const MOSTLY_ORGANIC_SHARE = 0.3
const HEAVY_SHARE = 0.6

/**
 * Score a vault from its own reported data alone. Synchronous, no network.
 *
 * Use {@link analyzeRewardSustainability} when a DeFiLlama history lookup is
 * acceptable — a decaying APY curve is the strongest available evidence that
 * an emission is winding down.
 */
export function rewardSustainability(vault: Vault): RewardSustainability {
  const share = rewardShareOfTotal(vault)
  const { base, total, reward } = vault.analytics.apy
  const rewardTokenCount = vault.rewardTokens?.length ?? 0
  const reasons: string[] = []

  // `rewardTokens` is absent rather than empty when there are none, so its
  // presence is independent corroboration of a non-zero `apy.reward`.
  if (reward === null) {
    // Unknown is not a failing grade. It is scored neutrally and labelled
    // honestly, so a caller can choose to exclude rather than be misled.
    reasons.push(
      'Protocol does not report a reward APY, so the split between organic ' +
        'yield and incentives is unknown — not zero.'
    )
    if (rewardTokenCount > 0) {
      reasons.push(
        `Vault does emit ${rewardTokenCount} reward token(s), so some of the ` +
          'headline APY is very likely incentive-driven.'
      )
      return {
        score: 4,
        label: 'unknown',
        rewardShare: null,
        organicApy: null,
        rewardTokenCount,
        reasons,
      }
    }
    return {
      score: 5,
      label: 'unknown',
      rewardShare: null,
      organicApy: null,
      rewardTokenCount,
      reasons,
    }
  }

  const organicApy = base ?? Math.max(0, total - reward)
  if (base === null) {
    reasons.push(
      'Base APY is unreported; organic yield inferred as total minus reward.'
    )
  }

  const resolvedShare = share ?? 0
  let score: number
  let label: SustainabilityLabel

  if (resolvedShare <= NEGLIGIBLE_SHARE) {
    score = 10
    label = 'organic'
    reasons.push(
      reward === 0
        ? 'Protocol explicitly reports no incentives — the yield is organic.'
        : `Incentives are ${pct(resolvedShare)} of total APY, a negligible share.`
    )
  } else if (resolvedShare <= MOSTLY_ORGANIC_SHARE) {
    score = 8
    label = 'mostly-organic'
    reasons.push(
      `Incentives are ${pct(resolvedShare)} of total APY; ${fmt(organicApy)}% ` +
        'would remain if they stopped.'
    )
  } else if (resolvedShare <= HEAVY_SHARE) {
    score = 5
    label = 'incentive-heavy'
    reasons.push(
      `Incentives are ${pct(resolvedShare)} of total APY; the headline roughly ` +
        `halves to ${fmt(organicApy)}% without them.`
    )
  } else {
    score = 2
    label = 'incentive-dependent'
    reasons.push(
      `Incentives are ${pct(resolvedShare)} of total APY. Organic yield is ` +
        `only ${fmt(organicApy)}%.`
    )
  }

  if (rewardTokenCount > 1) {
    reasons.push(
      `${rewardTokenCount} distinct reward tokens — each is an independent ` +
        'emission that can end on its own schedule.'
    )
  }

  return {
    score,
    label,
    rewardShare: share,
    organicApy,
    rewardTokenCount,
    reasons,
  }
}

/**
 * Score a vault and fold in its DeFiLlama APY history.
 *
 * A decaying curve on an incentive-heavy vault is the difference between "this
 * emission exists" and "this emission is ending", which is the actual question.
 * History is advisory: if DeFiLlama has no match the base score stands
 * unchanged rather than the call failing.
 */
export async function analyzeRewardSustainability(
  vault: Vault
): Promise<RewardSustainability> {
  const base = rewardSustainability(vault)

  let history: ApyDataPoint[]
  try {
    history = await getApyHistory(vault)
  } catch {
    // DeFiLlama coverage is ~97%, not 100%, and it is a third-party service.
    // An unmatched or unreachable pool must not fail the whole assessment.
    return base
  }

  const trend = trendOf(history)
  if (!trend) {
    return base
  }

  const reasons = [...base.reasons]
  let score = base.score

  if (trend.direction === 'decaying' && base.label !== 'organic') {
    score = Math.max(0, score - 2)
    reasons.push(
      `APY has fallen ${pct(Math.abs(trend.change))} across ${trend.samples} ` +
        'observations, consistent with an emission winding down.'
    )
  } else if (trend.direction === 'rising' && base.label === 'organic') {
    reasons.push(
      `APY is rising (${pct(trend.change)}) on organic yield — demand-driven ` +
        'rather than incentive-driven.'
    )
  }

  return { ...base, score, reasons, trend }
}

/** Compare the first and last thirds of the window, ignoring single spikes. */
function trendOf(history: ApyDataPoint[]): RewardTrend | undefined {
  if (history.length < 6) {
    return undefined
  }
  const third = Math.floor(history.length / 3)
  const head = mean(history.slice(0, third).map((p) => p.apy))
  const tail = mean(history.slice(-third).map((p) => p.apy))
  if (head <= 0) {
    return undefined
  }

  const change = (tail - head) / head
  const direction =
    change < -0.25 ? 'decaying' : change > 0.25 ? 'rising' : 'flat'
  return { direction, change, samples: history.length }
}

function mean(values: number[]): number {
  return values.length === 0
    ? 0
    : values.reduce((a, b) => a + b, 0) / values.length
}

function pct(fraction: number): string {
  return `${Math.round(fraction * 100)}%`
}

function fmt(apy: number | null): string {
  return apy === null ? 'an unknown amount' : apy.toFixed(2)
}
