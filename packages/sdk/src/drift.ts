// SPDX-License-Identifier: Apache-2.0
import { EarnDataClient } from './clients/earn-data-client.js'

/**
 * Schema drift detection.
 *
 * This module exists because of a specific, expensive failure: LI.FI rewrote
 * the Earn API in Apr 2026 — moved every path, made auth mandatory, removed two
 * fields, flipped the type of a third, and quietly added a vault-quality
 * signal. A 474-test suite stayed green throughout, because every test compared
 * our code against a fixture snapshot rather than against the API.
 *
 * The obvious fix — validate our schemas against LI.FI's published OpenAPI spec
 * — does not work either. Measured against the live API, that spec is wrong in
 * six places and silent about three real fields. Failing CI on deviation from
 * it would produce false alarms and miss the true ones.
 *
 * So this compares three sources and reports where they disagree:
 *
 *   1. the live API — what is actually served
 *   2. the OpenAPI spec — what LI.FI documents
 *   3. our Zod schema — what we parse
 *
 * A disagreement between (1) and (3) is our bug. Between (1) and (2) it is
 * LI.FI's, and worth reporting to users because it will mislead anyone reading
 * the docs. That distinction is the point.
 */

const OPENAPI_URL = 'https://docs.li.fi/earn-openapi.yaml'

export type DriftSeverity = 'breaking' | 'warning' | 'info'

export interface DriftFinding {
  severity: DriftSeverity
  field: string
  /** Which pair of sources disagree */
  between: 'live-vs-schema' | 'live-vs-spec' | 'spec-vs-schema'
  message: string
}

export interface DriftReport {
  ok: boolean
  checkedVaults: number
  findings: DriftFinding[]
  specFetched: boolean
}

/**
 * Fields our schema treats as required. If the live API stops sending one, every
 * parse throws — which is precisely what `provider` and `lpTokens` did.
 */
const SCHEMA_REQUIRED_FIELDS = [
  'address',
  'chainId',
  'name',
  'slug',
  'network',
  'protocol',
  'syncedAt',
  'tags',
  'underlyingTokens',
  'analytics',
  'isTransactional',
  'isRedeemable',
  'depositPacks',
  'redeemPacks',
] as const

/**
 * Fields the live API sends that our schema knows about. Anything outside this
 * set is a new field LI.FI added without announcing it — how
 * `verificationStatus` arrived.
 */
const SCHEMA_KNOWN_FIELDS = new Set<string>([
  ...SCHEMA_REQUIRED_FIELDS,
  'description',
  'rewardTokens',
  'verificationStatus',
  'verificationStatusBreakdown',
  'caps',
  'timeLock',
  'kyc',
])

/**
 * Fields the OpenAPI spec documents on a vault. Used to surface the cases where
 * the spec describes something that does not exist, so the discrepancy is
 * reported rather than silently trusted.
 */
const SPEC_DOCUMENTED_FIELDS = ['caps', 'timeLock', 'kyc', 'lpTokens'] as const

/** Fetch and lightly probe the published OpenAPI spec. */
async function fetchSpec(): Promise<string | null> {
  try {
    const res = await fetch(OPENAPI_URL)
    if (!res.ok) {
      return null
    }
    return await res.text()
  } catch {
    return null
  }
}

/**
 * Compare the live API against our schema and against LI.FI's OpenAPI spec.
 *
 * `sampleSize` bounds how many vaults are inspected — field presence and type
 * questions are answered well before the full fleet, and this runs in CI.
 */
export async function detectDrift(
  options: { apiKey?: string; sampleSize?: number } = {}
): Promise<DriftReport> {
  const client = new EarnDataClient({ apiKey: options.apiKey })
  const sampleSize = options.sampleSize ?? 100
  const findings: DriftFinding[] = []

  const page = await client.listVaults({ limit: Math.min(sampleSize, 100) })
  // Deliberately unvalidated: the raw JSON is the subject under test, so
  // parsing it through Zod first would hide exactly what we are looking for.
  const raw = page.data as unknown as Record<string, unknown>[]

  const spec = await fetchSpec()

  // ── (1) vs (3): live API against our schema ──────────────────────────────
  for (const field of SCHEMA_REQUIRED_FIELDS) {
    const missing = raw.filter((v) => !(field in v)).length
    if (missing > 0) {
      findings.push({
        severity: 'breaking',
        field,
        between: 'live-vs-schema',
        message:
          `Our schema requires \`${field}\` but ${missing}/${raw.length} live ` +
          'vaults omit it. Every parse of those vaults throws.',
      })
    }
  }

  const seenFields = new Set<string>()
  for (const vault of raw) {
    for (const key of Object.keys(vault)) {
      seenFields.add(key)
    }
  }

  for (const field of seenFields) {
    if (!SCHEMA_KNOWN_FIELDS.has(field)) {
      findings.push({
        severity: 'info',
        field,
        between: 'live-vs-schema',
        message:
          `The live API sends \`${field}\`, which our schema does not model. ` +
          'Undocumented additions have carried real signal before — ' +
          '`verificationStatus` arrived this way.',
      })
    }
  }

  // TVL type. It was a string, became a number, and the spec still says string,
  // so pinning either type is what breaks on the next flip.
  const tvlTypes = new Set(
    raw.map((v) => {
      const analytics = v.analytics as { tvl?: { usd?: unknown } } | undefined
      return typeof analytics?.tvl?.usd
    })
  )
  if (tvlTypes.size > 1) {
    findings.push({
      severity: 'warning',
      field: 'analytics.tvl.usd',
      between: 'live-vs-schema',
      message:
        `Mixed types across the sample: ${[...tvlTypes].join(', ')}. ` +
        'Anything reading this must normalise rather than assume.',
    })
  }

  // ── APY scale. A silent 100x error if it ever changes. ───────────────────
  const totals = raw
    .map((v) => {
      const analytics = v.analytics as { apy?: { total?: unknown } } | undefined
      return analytics?.apy?.total
    })
    .filter((t): t is number => typeof t === 'number')

  if (totals.length > 0) {
    const max = Math.max(...totals)
    const sorted = [...totals].sort((a, b) => a - b)
    const median = sorted[Math.floor(sorted.length / 2)] ?? 0
    // Percentages produce a median in the low single digits and a maximum well
    // above 1. Decimals would put the entire fleet below 1.
    if (max < 1) {
      findings.push({
        severity: 'breaking',
        field: 'analytics.apy.total',
        between: 'live-vs-schema',
        message:
          `Every APY in the sample is below 1 (max ${max}, median ${median}). ` +
          'The API appears to have switched from percentages to decimal ' +
          'fractions — every displayed APY is now understated 100x.',
      })
    }
  }

  // ── (1) vs (2): live API against LI.FI's own documentation ───────────────
  if (spec) {
    for (const field of SPEC_DOCUMENTED_FIELDS) {
      const documented = spec.includes(`${field}:`)
      const present = raw.some((v) => field in v)
      if (documented && !present) {
        findings.push({
          severity: 'info',
          field,
          between: 'live-vs-spec',
          message:
            `The OpenAPI spec documents \`${field}\` but no live vault ` +
            'sends it. Anyone building from the spec will code against a ' +
            'field that does not exist.',
        })
      }
    }

    // The spec's APY wording is wrong, and it is wrong in the direction that
    // costs money: following it produces a 100x overstatement.
    if (
      /expressed as\s+a?\s*decimal/i.test(spec) &&
      totals.some((t) => t > 1)
    ) {
      findings.push({
        severity: 'warning',
        field: 'analytics.apy',
        between: 'live-vs-spec',
        message:
          'The spec states APY is "expressed as a decimal", but live values ' +
          'exceed 1 and are already percentages. Following the spec (or the ' +
          'quickstart, which multiplies by 100) overstates every APY 100x.',
      })
    }

    if (/usd:\s*\n\s*type:\s*string/i.test(spec) && tvlTypes.has('number')) {
      findings.push({
        severity: 'warning',
        field: 'analytics.tvl.usd',
        between: 'live-vs-spec',
        message:
          'The spec declares tvl.usd a string; the live API sends a number.',
      })
    }
  }

  const breaking = findings.filter((f) => f.severity === 'breaking')

  return {
    // Only our own breakages fail the check. LI.FI documenting a field that
    // does not exist is worth reporting but is not our build's problem.
    ok: breaking.length === 0,
    checkedVaults: raw.length,
    findings,
    specFetched: spec !== null,
  }
}

/** Render a drift report as human-readable lines. */
export function formatDriftReport(report: DriftReport): string {
  const lines: string[] = []
  lines.push(
    `Schema drift check — ${report.checkedVaults} live vaults` +
      (report.specFetched ? ' vs OpenAPI spec' : ' (spec unavailable)')
  )
  lines.push('')

  if (report.findings.length === 0) {
    lines.push('No drift detected.')
    return lines.join('\n')
  }

  const order: DriftSeverity[] = ['breaking', 'warning', 'info']
  for (const severity of order) {
    const group = report.findings.filter((f) => f.severity === severity)
    if (group.length === 0) {
      continue
    }
    lines.push(`${severity.toUpperCase()} (${group.length})`)
    for (const f of group) {
      lines.push(`  [${f.between}] ${f.field}`)
      lines.push(`    ${f.message}`)
    }
    lines.push('')
  }

  lines.push(
    report.ok
      ? 'No breaking drift — our schema still matches the live API.'
      : 'BREAKING drift detected — the SDK will fail against the live API.'
  )
  return lines.join('\n')
}
