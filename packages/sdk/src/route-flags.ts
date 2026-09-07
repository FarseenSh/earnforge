// SPDX-License-Identifier: Apache-2.0
import { ComposerError } from './errors.js'
import type { Vault } from './schemas/index.js'

/**
 * Capability probing for LI.FI's newer route flags.
 *
 * In Aug and Sep 2026 LI.FI added three optional request flags to the quote and
 * route lanes: `destinationActionKind` / `destinationActionVault` (Smart
 * Deposits, which bridge and then deposit into an ERC-4626 vault in one route),
 * `gasless`, and `amountFlexible`. All three are declared in `@lifi/types`
 * 18.4.0 and all three are accepted by the live API today.
 *
 * They share a failure mode that makes them dangerous to adopt blindly: when a
 * flag cannot be honoured, the route is **excluded rather than refused**. The
 * request does not fail with "this flag is unsupported for this pair". It comes
 * back looking exactly like a pair with no liquidity:
 *
 *   - `GET /v1/quote`           -> 404 "No available quotes for the requested transfer"
 *   - `POST /v1/advanced/routes` -> 200 with `routes: []`
 *
 * LI.FI documents this as intentional for Smart Deposits ("routes that cannot
 * execute the action are rejected or excluded rather than silently served
 * without it"), and it is the right call: silently dropping the deposit leg
 * would hand the user raw tokens while they believed they had vault shares.
 * But it leaves the caller unable to tell two very different situations apart,
 * and the naive reaction to a 404 is to retry, widen slippage, or tell the user
 * the vault is unreachable. None of those help.
 *
 * The only way to distinguish them from outside is differentially: run the same
 * request with and without the flag and compare. That is what this module does.
 * It is deliberately an explicit probe rather than an automatic fallback,
 * because quietly retrying without the flag is the exact silent downgrade the
 * exclusion behaviour exists to prevent.
 *
 * Measured on 7 Sep 2026: `gasless` and Smart Deposits are both accepted and
 * validated by the API but serve zero routes on every pair tested, including 25
 * vaults across chains for Smart Deposits. That is expected: Smart Deposits is
 * gated on a curated vault allowlist which is not public, so the probe is the
 * only way to know. Treat a `flag-excluded` verdict as "not yet", not "broken".
 *
 * @see PITFALLS.md #25
 */

/** The one destination action LI.FI currently defines. */
export const DESTINATION_ACTION_KINDS = ['erc4626_deposit'] as const

export type DestinationActionKind = (typeof DESTINATION_ACTION_KINDS)[number]

/**
 * A destination-side action executed after the bridge leg.
 *
 * `vault` is forwarded verbatim to LI.FI, whose Intent Factory allowlist is the
 * enforcement point. We do not maintain a local copy of that allowlist: it is
 * not published, and a stale mirror would be worse than no mirror.
 */
export interface DestinationAction {
  kind: DestinationActionKind
  vault: string
}

/** Which flag a probe is testing. */
export type RouteFlag = 'gasless' | 'smart-deposit'

/**
 * What a probe concluded.
 *
 * The distinction between `flag-excluded` and `route-unavailable` is the whole
 * point of the exercise: the first means the pair is fine and the flag is not
 * yet served, the second means the pair itself has no route and the flag was
 * never the problem.
 */
export type RouteFlagVerdict =
  /** Flag honoured: the route came back carrying it. */
  | 'supported'
  /** Baseline routes, flagged request does not. The flag is the cause. */
  | 'flag-excluded'
  /** Neither routes. The pair is unavailable; the flag is untested. */
  | 'route-unavailable'
  /** The API rejected the request outright, e.g. a malformed flag pair. */
  | 'rejected'

export interface RouteFlagProbe {
  flag: RouteFlag
  verdict: RouteFlagVerdict
  /** True when the same request without the flag does return a route. */
  baselineRoutes: boolean
  /** True when the request with the flag returns a route. */
  flaggedRoutes: boolean
  /** HTTP status of the flagged request, for callers that want to log it. */
  status: number
  /** Human-readable summary, safe to surface directly to a user. */
  detail: string
  /** When the probe ran, so a cached verdict can be aged out. */
  checkedAt: string
}

export interface ProbeParams {
  fromChain: number
  toChain: number
  fromToken: string
  toToken: string
  fromAddress: string
  fromAmount: string
  toAddress?: string
  slippage?: number
}

export interface RouteFlagProbeOptions {
  apiKey: string
  baseUrl?: string
  /** Injected in tests. Defaults to the global fetch. */
  fetchImpl?: typeof globalThis.fetch
}

const DEFAULT_BASE_URL = 'https://li.quest'

function baseSearchParams(params: ProbeParams): URLSearchParams {
  const sp = new URLSearchParams({
    fromChain: String(params.fromChain),
    toChain: String(params.toChain),
    fromToken: params.fromToken,
    toToken: params.toToken,
    fromAddress: params.fromAddress,
    fromAmount: params.fromAmount,
  })
  if (params.toAddress) {
    sp.set('toAddress', params.toAddress)
  }
  if (params.slippage !== undefined) {
    sp.set('slippage', String(params.slippage))
  }
  return sp
}

interface QuoteAttempt {
  ok: boolean
  status: number
  body: unknown
}

async function attempt(
  sp: URLSearchParams,
  options: RouteFlagProbeOptions
): Promise<QuoteAttempt> {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch
  const baseUrl = options.baseUrl ?? DEFAULT_BASE_URL
  const res = await fetchImpl(`${baseUrl}/v1/quote?${sp.toString()}`, {
    method: 'GET',
    headers: { 'x-lifi-api-key': options.apiKey },
  })
  let body: unknown = null
  try {
    body = await res.json()
  } catch {
    body = null
  }
  return { ok: res.ok, status: res.status, body }
}

/**
 * Classify a baseline/flagged pair of attempts into a verdict.
 *
 * A 400 on the flagged request is `rejected` rather than `flag-excluded`: the
 * API validates the shape of the flag (Smart Deposits requires both the kind
 * and the vault) before it ever looks for a route, so a 400 means the request
 * was malformed, not that the flag went unserved.
 */
function classify(
  baseline: QuoteAttempt,
  flagged: QuoteAttempt,
  flag: RouteFlag
): Omit<RouteFlagProbe, 'flag' | 'checkedAt'> {
  const baselineRoutes = baseline.ok
  const flaggedRoutes = flagged.ok
  const label = flag === 'gasless' ? 'gasless execution' : 'Smart Deposits'

  if (flagged.status === 400) {
    const message =
      typeof (flagged.body as { message?: unknown } | null)?.message ===
      'string'
        ? (flagged.body as { message: string }).message
        : 'the API rejected the request'
    return {
      verdict: 'rejected',
      baselineRoutes,
      flaggedRoutes: false,
      status: flagged.status,
      detail: `The request was rejected before routing: ${message}`,
    }
  }

  if (flaggedRoutes) {
    return {
      verdict: 'supported',
      baselineRoutes,
      flaggedRoutes: true,
      status: flagged.status,
      detail: `${label} is served for this pair.`,
    }
  }

  if (baselineRoutes) {
    return {
      verdict: 'flag-excluded',
      baselineRoutes: true,
      flaggedRoutes: false,
      status: flagged.status,
      detail:
        `${label} is not served for this pair yet. The identical request ` +
        `without the flag does return a route, so the pair is fine and the ` +
        `flag is what excluded it. Retrying will not help; retrying without ` +
        `the flag silently gives up the behaviour you asked for.`,
    }
  }

  return {
    verdict: 'route-unavailable',
    baselineRoutes: false,
    flaggedRoutes: false,
    status: flagged.status,
    detail:
      `This pair has no route at all, with or without ${label}. The flag is ` +
      `untested here: fix the pair before drawing any conclusion about it.`,
  }
}

/**
 * Probe whether `gasless=true` is served for a given pair.
 *
 * Costs two quote requests. Both count against the rate limit, so callers
 * probing a fleet should cache the verdict rather than probing per deposit.
 */
export async function probeGasless(
  params: ProbeParams,
  options: RouteFlagProbeOptions
): Promise<RouteFlagProbe> {
  const baseline = await attempt(baseSearchParams(params), options)
  const flaggedParams = baseSearchParams(params)
  flaggedParams.set('gasless', 'true')
  const flagged = await attempt(flaggedParams, options)
  return {
    flag: 'gasless',
    ...classify(baseline, flagged, 'gasless'),
    checkedAt: new Date().toISOString(),
  }
}

/**
 * Probe whether a vault is on LI.FI's Smart Deposits allowlist.
 *
 * LI.FI requires the vault's underlying asset to equal `toToken` and the route
 * to be cross-chain EVM. We check the first of those locally, because getting
 * it wrong produces the same 404 as an unlisted vault and would be scored as
 * `flag-excluded` when it is really caller error.
 */
export async function probeSmartDeposit(
  vault: Vault,
  params: ProbeParams,
  options: RouteFlagProbeOptions
): Promise<RouteFlagProbe> {
  const underlying = vault.underlyingTokens?.[0]?.address
  if (!underlying) {
    throw new ComposerError(
      `Cannot probe Smart Deposits for ${vault.name}: the vault reports no underlying token address, so there is no asset to match against toToken.`,
      400
    )
  }
  if (underlying.toLowerCase() !== params.toToken.toLowerCase()) {
    throw new ComposerError(
      `Cannot probe Smart Deposits for ${vault.name}: LI.FI requires toToken to equal the vault's underlying asset. Expected ${underlying}, got ${params.toToken}. Probing with a mismatched token returns the same 404 as an unlisted vault, which would read as a false negative.`,
      400
    )
  }
  if (params.fromChain === params.toChain) {
    throw new ComposerError(
      `Cannot probe Smart Deposits for ${vault.name}: LI.FI serves destination actions on cross-chain EVM routes only, and fromChain equals toChain (${params.fromChain}). A same-chain probe always reports flag-excluded regardless of the allowlist.`,
      400
    )
  }

  const baseline = await attempt(baseSearchParams(params), options)
  const flaggedParams = baseSearchParams(params)
  flaggedParams.set('destinationActionKind', 'erc4626_deposit')
  flaggedParams.set('destinationActionVault', vault.address)
  const flagged = await attempt(flaggedParams, options)

  return {
    flag: 'smart-deposit',
    ...classify(baseline, flagged, 'smart-deposit'),
    checkedAt: new Date().toISOString(),
  }
}

/**
 * Guard for the round-trip trap on a Smart Deposits step.
 *
 * LI.FI's own type documentation is explicit: a step whose route was requested
 * with a destination action carries that action, and posting the step back to
 * `/v1/advanced/stepTransaction` *without* it "prepares a plain bundle that
 * delivers the raw token instead of the action's output".
 *
 * That is a silent downgrade with real money behind it. The user asked to end
 * up holding vault shares; they end up holding the underlying, with no error
 * anywhere in the flow to tell them. Any code that reserialises a step, strips
 * unknown keys, or round-trips it through a narrower type will cause it.
 *
 * Note on provenance: this one is sourced from LI.FI's type documentation, not
 * from live observation. The allowlist served no routes on 7 Sep 2026, so no
 * step carrying a `destinationAction` could be obtained to test against. The
 * guard is written to be correct when routes appear rather than to encode a
 * behaviour we have watched.
 *
 * @returns the step unchanged, so it can be used inline at the post site
 * @throws ComposerError when the action was dropped between request and post
 */
export function assertDestinationActionPreserved<T extends object>(
  requested: DestinationAction | undefined,
  step: T
): T {
  if (!requested) {
    return step
  }
  // Deliberately not `T extends { destinationAction?: ... }`. The failure this
  // guards against is a step narrowed through a type that no longer declares
  // the field at all, and a signature demanding that declaration would refuse
  // to accept exactly the values worth checking.
  const carried = (step as { destinationAction?: DestinationAction })
    .destinationAction
  if (!carried) {
    throw new ComposerError(
      `The Smart Deposits step lost its destinationAction between the route request and this call. Posting it to /v1/advanced/stepTransaction now would prepare a plain bundle that delivers the raw token instead of depositing into ${requested.vault}, and nothing downstream would report an error. Post the step exactly as LI.FI returned it.`,
      400
    )
  }
  if (carried.vault.toLowerCase() !== requested.vault.toLowerCase()) {
    throw new ComposerError(
      `The Smart Deposits step carries a destinationAction for ${carried.vault} but the deposit was requested for ${requested.vault}. Funds would land in the wrong vault.`,
      400
    )
  }
  return step
}
