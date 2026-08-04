// SPDX-License-Identifier: Apache-2.0

import type {
  ApyDataPoint,
  Chain,
  PreflightReport,
  ProtocolDetail,
  RiskScore,
  Vault,
} from '@earnforge/sdk'
import { parseTvl } from '@earnforge/sdk'
import chalk from 'chalk'
import Table from 'cli-table3'

// ── Formatting helpers ──

/**
 * Format an APY percentage.
 *
 * The API returns APY already scaled as a percentage — `3.84` means 3.84%.
 * LI.FI's OpenAPI spec and quickstart both claim these are decimals and show a
 * `* 100`; doing that produces a 100x overstatement. Verified against the live
 * fleet, which spans 0–106%.
 *
 * `null` means the protocol did not report a figure, which is distinct from
 * reporting zero — rendered as `N/A` rather than `0.00%`.
 */
export function fmtPct(n: number | null | undefined): string {
  if (n === null || n === undefined) {
    return 'N/A'
  }
  return `${n.toFixed(2)}%`
}

export function fmtUsd(n: number): string {
  if (n >= 1_000_000_000) {
    return `$${(n / 1_000_000_000).toFixed(2)}B`
  }
  if (n >= 1_000_000) {
    return `$${(n / 1_000_000).toFixed(2)}M`
  }
  if (n >= 1_000) {
    return `$${(n / 1_000).toFixed(2)}K`
  }
  return `$${n.toFixed(2)}`
}

// Thresholds mirror the SDK's riskLabel(): calibrated so no
// verification-flagged vault can reach the "low" band.
export function riskLabel(score: number): string {
  if (score >= 8) {
    return chalk.green(`${score}/10 (low)`)
  }
  if (score >= 6) {
    return chalk.yellow(`${score}/10 (medium)`)
  }
  return chalk.red(`${score}/10 (high)`)
}

export function riskLabelPlain(score: number): string {
  if (score >= 8) {
    return `${score}/10 (low)`
  }
  if (score >= 6) {
    return `${score}/10 (medium)`
  }
  return `${score}/10 (high)`
}

/** Verification badge — flagged vaults must be visible at a glance. */
function verificationBadge(v: Vault): string {
  if (v.verificationStatus !== 'flagged') {
    return chalk.green('verified')
  }
  const reasons = (v.verificationStatusBreakdown ?? [])
    .filter((b) => b.result === 'flagged')
    .map((b) => b.reason)
  return chalk.red(
    `FLAGGED${reasons.length > 0 ? ` (${reasons.join(', ')})` : ''}`
  )
}

// ── Table builders ──

export function vaultTable(vaults: Vault[]): string {
  const table = new Table({
    head: [
      chalk.bold('Name'),
      chalk.bold('Chain'),
      chalk.bold('Protocol'),
      chalk.bold('APY'),
      chalk.bold('TVL'),
      chalk.bold('Tags'),
      chalk.bold('Slug'),
    ],
    colWidths: [30, 8, 14, 10, 12, 16, 20],
    wordWrap: true,
  })

  for (const v of vaults) {
    const tvl = parseTvl(v.analytics.tvl)
    table.push([
      v.name,
      String(v.chainId),
      v.protocol.name,
      chalk.green(fmtPct(v.analytics.apy.total)),
      fmtUsd(tvl.parsed),
      v.tags.join(', '),
      v.slug,
    ])
  }

  return table.toString()
}

export function vaultDetail(v: Vault): string {
  const tvl = parseTvl(v.analytics.tvl)
  const lines = [
    chalk.bold.underline(v.name),
    '',
    `  ${chalk.dim('Slug:')}         ${v.slug}`,
    `  ${chalk.dim('Chain:')}        ${v.chainId} (${v.network})`,
    `  ${chalk.dim('Address:')}      ${v.address}`,
    `  ${chalk.dim('Protocol:')}     ${v.protocol.id ?? v.protocol.name} (${v.protocol.url})`,
    `  ${chalk.dim('Verification:')} ${verificationBadge(v)}`,
    `  ${chalk.dim('Tags:')}         ${v.tags.join(', ') || '(none)'}`,
    '',
    chalk.bold('Analytics'),
    `  ${chalk.dim('APY Total:')}    ${chalk.green(fmtPct(v.analytics.apy.total))}`,
    `  ${chalk.dim('APY Base:')}     ${fmtPct(v.analytics.apy.base)}`,
    `  ${chalk.dim('APY Reward:')}   ${fmtPct(v.analytics.apy.reward)}`,
    `  ${chalk.dim('APY 1d:')}       ${v.analytics.apy1d !== null ? fmtPct(v.analytics.apy1d) : 'N/A'}`,
    `  ${chalk.dim('APY 7d:')}       ${v.analytics.apy7d !== null ? fmtPct(v.analytics.apy7d) : 'N/A'}`,
    `  ${chalk.dim('APY 30d:')}      ${v.analytics.apy30d !== null ? fmtPct(v.analytics.apy30d) : 'N/A'}`,
    `  ${chalk.dim('TVL:')}          ${fmtUsd(tvl.parsed)}`,
    `  ${chalk.dim('Updated:')}      ${v.analytics.updatedAt}`,
    '',
    chalk.bold('Deposit & Redeem'),
    `  ${chalk.dim('Transactional:')} ${v.isTransactional ? chalk.green('Yes') : chalk.red('No')}`,
    `  ${chalk.dim('Redeemable:')}    ${v.isRedeemable ? chalk.green('Yes') : chalk.red('No')}`,
    `  ${chalk.dim('Deposit Packs:')} ${v.depositPacks.map((p) => p.name).join(', ') || '(none)'}`,
    `  ${chalk.dim('Redeem Packs:')}  ${v.redeemPacks.map((p) => p.name).join(', ') || '(none)'}`,
    '',
    chalk.bold('Underlying Tokens'),
    ...v.underlyingTokens.map(
      (t) =>
        `  ${t.symbol ?? '(no symbol)'} (${t.address}) — ${t.decimals ?? '?'} decimals` +
        (t.priceUsd ? ` @ $${t.priceUsd}` : '')
    ),
    ...(v.underlyingTokens.length === 0 ? ['  (none)'] : []),
    '',
    ...(v.rewardTokens && v.rewardTokens.length > 0
      ? [
          chalk.bold('Reward Tokens'),
          ...v.rewardTokens.map(
            (t) => `  ${t.symbol ?? '(unnamed)'} (${t.address})`
          ),
          '',
        ]
      : []),
    ...(v.description
      ? [chalk.bold('Description'), `  ${v.description}`, '']
      : []),
  ]

  return lines.join('\n')
}

export function chainTable(chains: Chain[]): string {
  const table = new Table({
    head: [chalk.bold('Chain ID'), chalk.bold('Name'), chalk.bold('CAIP')],
  })
  for (const c of chains) {
    table.push([String(c.chainId), c.name, c.networkCaip])
  }
  return table.toString()
}

export function protocolTable(protocols: ProtocolDetail[]): string {
  const table = new Table({
    head: [chalk.bold('Name'), chalk.bold('URL')],
  })
  for (const p of protocols) {
    table.push([p.name, p.url])
  }
  return table.toString()
}

/**
 * Render portfolio positions.
 *
 * `protocolName`, `balanceUsd` and `balanceNative` all became nullable in
 * Apr 2026. Formatting a null through `Number()` yields `NaN`, so each is
 * rendered explicitly as `—` when absent.
 */
export function portfolioTable(
  positions: Array<{
    chainId: number
    protocolName: string | null
    asset: { symbol: string; name: string }
    balanceUsd: string | null
    balanceNative: string | null
  }>
): string {
  const table = new Table({
    head: [
      chalk.bold('Chain'),
      chalk.bold('Protocol'),
      chalk.bold('Asset'),
      chalk.bold('Balance (Native)'),
      chalk.bold('Balance (USD)'),
    ],
  })
  for (const p of positions) {
    const usd =
      p.balanceUsd === null || Number.isNaN(Number(p.balanceUsd))
        ? '—'
        : `$${Number(p.balanceUsd).toFixed(2)}`
    table.push([
      String(p.chainId),
      p.protocolName ?? '—',
      `${p.asset.symbol} (${p.asset.name})`,
      p.balanceNative ?? '—',
      usd,
    ])
  }
  return table.toString()
}

/** Colour a dimension so a weak one is visible without reading every row. */
function dimension(score: number): string {
  const text = `${score}/10`
  if (score >= 8) {
    return chalk.green(text)
  }
  if (score >= 5) {
    return chalk.yellow(text)
  }
  return chalk.red(text)
}

export function riskTable(risk: RiskScore): string {
  const table = new Table({
    head: [chalk.bold('Dimension'), chalk.bold('Score')],
  })
  table.push(['TVL Magnitude', dimension(risk.breakdown.tvl)])
  table.push(['APY Stability', dimension(risk.breakdown.apyStability)])
  table.push(['Protocol Maturity', dimension(risk.breakdown.protocol)])
  table.push(['Redeemability', dimension(risk.breakdown.redeemability)])
  table.push(['Asset Type', dimension(risk.breakdown.assetType)])
  // Both of these arrived with risk scorer v2 and were never added here, so
  // the CLI reported five dimensions of a seven-dimension score — omitting
  // LI.FI's own verification signal, which is the whole reason v2 exists.
  table.push(['Verification', dimension(risk.breakdown.verification)])
  table.push(['Reward Dependency', dimension(risk.breakdown.rewardDependency)])
  table.push([chalk.bold('Composite'), chalk.bold(riskLabel(risk.score))])

  // The flags are the actionable part — a number tells you something is wrong,
  // these tell you what. Printing the score without them was the bug.
  if (risk.flags.length === 0) {
    return table.toString()
  }
  const flags = risk.flags.map((f) => chalk.yellow(`  ! ${f}`)).join('\n')
  return `${table.toString()}\n\n${chalk.bold('Flags')}\n${flags}`
}

export function suggestTable(
  allocations: Array<{
    vault: Vault
    risk: RiskScore
    percentage: number
    amount: number
    apy: number
  }>
): string {
  const table = new Table({
    head: [
      chalk.bold('Vault'),
      chalk.bold('Chain'),
      chalk.bold('Protocol'),
      chalk.bold('APY'),
      chalk.bold('Risk'),
      chalk.bold('Allocation'),
      chalk.bold('Amount'),
    ],
  })
  for (const a of allocations) {
    table.push([
      a.vault.name,
      String(a.vault.chainId),
      a.vault.protocol.name,
      chalk.green(fmtPct(a.apy)),
      riskLabel(a.risk.score),
      `${a.percentage.toFixed(1)}%`,
      fmtUsd(a.amount),
    ])
  }
  return table.toString()
}

export function apyHistoryTable(history: ApyDataPoint[]): string {
  const table = new Table({
    head: [chalk.bold('Date'), chalk.bold('APY'), chalk.bold('TVL')],
  })
  for (const d of history) {
    const date = d.timestamp.split('T')[0] ?? d.timestamp
    table.push([date, fmtPct(d.apy), fmtUsd(d.tvlUsd)])
  }
  return table.toString()
}

export function preflightTable(report: PreflightReport): string {
  const lines: string[] = []
  const status = report.ok ? chalk.green('PASS') : chalk.red('FAIL')
  lines.push(chalk.bold(`Preflight — ${report.vault.name}  ${status}`))
  lines.push('')

  if (report.issues.length === 0) {
    lines.push(chalk.green('  All checks passed. Ready to deposit.'))
  } else {
    for (const issue of report.issues) {
      const icon =
        issue.severity === 'error' ? chalk.red('ERROR') : chalk.yellow('WARN')
      lines.push(`  ${icon}  [${issue.code}] ${issue.message}`)
    }
  }

  return lines.join('\n')
}

export function compareTable(vaults: Vault[], risks: RiskScore[]): string {
  const fields: Array<{
    label: string
    value: (v: Vault, r: RiskScore | undefined) => string
  }> = [
    { label: 'Slug', value: (v) => v.slug },
    { label: 'Chain', value: (v) => `${v.network} (${v.chainId})` },
    { label: 'Protocol', value: (v) => v.protocol.id ?? v.protocol.name },
    { label: 'Verification', value: (v) => verificationBadge(v) },
    {
      label: 'APY Total',
      value: (v) => chalk.green(fmtPct(v.analytics.apy.total)),
    },
    { label: 'APY Base', value: (v) => fmtPct(v.analytics.apy.base) },
    { label: 'APY Reward', value: (v) => fmtPct(v.analytics.apy.reward) },
    {
      label: 'APY 7d',
      value: (v) =>
        v.analytics.apy7d !== null ? fmtPct(v.analytics.apy7d) : 'N/A',
    },
    {
      label: 'APY 30d',
      value: (v) =>
        v.analytics.apy30d !== null ? fmtPct(v.analytics.apy30d) : 'N/A',
    },
    { label: 'TVL', value: (v) => fmtUsd(parseTvl(v.analytics.tvl).parsed) },
    { label: 'Risk', value: (_, r) => (r ? riskLabel(r.score) : 'N/A') },
    { label: 'Tags', value: (v) => v.tags.join(', ') || '(none)' },
    {
      label: 'Transactional',
      value: (v) => (v.isTransactional ? chalk.green('Yes') : chalk.red('No')),
    },
    {
      label: 'Redeemable',
      value: (v) => (v.isRedeemable ? chalk.green('Yes') : chalk.red('No')),
    },
    {
      label: 'Underlying',
      value: (v) =>
        v.underlyingTokens.map((t) => t.symbol ?? '?').join(', ') || '(none)',
    },
  ]

  const table = new Table({
    head: [chalk.bold(''), ...vaults.map((v) => chalk.bold(v.name))],
    wordWrap: true,
  })

  for (const field of fields) {
    table.push([
      chalk.dim(field.label),
      ...vaults.map((v, i) => field.value(v, risks[i])),
    ])
  }

  return table.toString()
}

// ── Output helper ──

export function outputResult(
  data: unknown,
  json: boolean,
  humanFn: () => string
): void {
  if (json) {
    // biome-ignore lint/suspicious/noConsole: CLI output
    console.log(JSON.stringify(data, null, 2))
  } else {
    // biome-ignore lint/suspicious/noConsole: CLI output
    console.log(humanFn())
  }
}
