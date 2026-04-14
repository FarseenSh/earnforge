// SPDX-License-Identifier: Apache-2.0

import chalk from 'chalk'
import Table from 'cli-table3'
import type {
  Vault,
  Chain,
  ProtocolDetail,
  RiskScore,
  ApyDataPoint,
  PreflightReport,
} from '@earnforge/sdk'
import { parseTvl } from '@earnforge/sdk'

// ── Formatting helpers ──

export function fmtPct(n: number): string {
  // API returns APY as percentage (3.84 = 3.84%), NOT as decimal fraction
  return `${n.toFixed(2)}%`
}

export function fmtUsd(n: number): string {
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}B`
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000) return `$${(n / 1_000).toFixed(2)}K`
  return `$${n.toFixed(2)}`
}

export function riskLabel(score: number): string {
  if (score >= 7) return chalk.green(`${score}/10 (low)`)
  if (score >= 4) return chalk.yellow(`${score}/10 (medium)`)
  return chalk.red(`${score}/10 (high)`)
}

export function riskLabelPlain(score: number): string {
  if (score >= 7) return `${score}/10 (low)`
  if (score >= 4) return `${score}/10 (medium)`
  return `${score}/10 (high)`
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
    `  ${chalk.dim('Protocol:')}     ${v.protocol.name} (${v.protocol.url})`,
    `  ${chalk.dim('Provider:')}     ${v.provider}`,
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
      (t) => `  ${t.symbol} (${t.address}) — ${t.decimals} decimals`
    ),
    ...(v.underlyingTokens.length === 0 ? ['  (none)'] : []),
    '',
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

export function portfolioTable(
  positions: Array<{
    chainId: number
    protocolName: string
    asset: { symbol: string; name: string }
    balanceUsd: string
    balanceNative: string
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
    table.push([
      String(p.chainId),
      p.protocolName,
      `${p.asset.symbol} (${p.asset.name})`,
      p.balanceNative,
      `$${Number(p.balanceUsd).toFixed(2)}`,
    ])
  }
  return table.toString()
}

export function riskTable(risk: RiskScore): string {
  const table = new Table({
    head: [chalk.bold('Dimension'), chalk.bold('Score')],
  })
  table.push(['TVL Magnitude', `${risk.breakdown.tvl}/10`])
  table.push(['APY Stability', `${risk.breakdown.apyStability}/10`])
  table.push(['Protocol Maturity', `${risk.breakdown.protocol}/10`])
  table.push(['Redeemability', `${risk.breakdown.redeemability}/10`])
  table.push(['Asset Type', `${risk.breakdown.assetType}/10`])
  table.push([chalk.bold('Composite'), chalk.bold(riskLabel(risk.score))])
  return table.toString()
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
    value: (v: Vault, r: RiskScore) => string
  }> = [
    { label: 'Slug', value: (v) => v.slug },
    { label: 'Chain', value: (v) => `${v.network} (${v.chainId})` },
    { label: 'Protocol', value: (v) => v.protocol.name },
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
    { label: 'Risk', value: (_, r) => riskLabel(r.score) },
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
        v.underlyingTokens.map((t) => t.symbol).join(', ') || '(none)',
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
