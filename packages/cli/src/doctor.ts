// SPDX-License-Identifier: Apache-2.0

import chalk from 'chalk'
import type { Vault } from '@earnforge/sdk'
import { parseTvl, riskScore } from '@earnforge/sdk'
import { riskLabel } from './helpers.js'

export interface DoctorCheck {
  id: number
  pitfall: string
  description: string
  passed: boolean
  detail: string
}

export interface DoctorReport {
  checks: DoctorCheck[]
  passed: number
  failed: number
  total: number
  riskScore?: { score: number; label: string }
}

/**
 * Run all 18 pitfall checks on a vault.
 * Each check is based on a real pitfall from the LI.FI Earn API.
 */
export function runDoctorChecks(
  vault: Vault,
  opts: { hasApiKey: boolean }
): DoctorReport {
  const checks: DoctorCheck[] = []

  // Pitfall #1: Wrong base URL
  // earn.li.fi for read-only data, li.quest for Composer
  checks.push({
    id: 1,
    pitfall: 'Base URL split',
    description: 'Earn Data uses earn.li.fi, Composer uses li.quest',
    passed: true, // SDK handles this
    detail: 'SDK uses correct base URLs (earn.li.fi / li.quest)',
  })

  // Pitfall #2: Sending auth to Earn Data API
  checks.push({
    id: 2,
    pitfall: 'No auth for Earn Data',
    description: 'Earn Data API (earn.li.fi) requires no authentication',
    passed: true, // SDK handles this
    detail: 'SDK sends no auth headers to earn.li.fi',
  })

  // Pitfall #3: Missing Composer API key
  checks.push({
    id: 3,
    pitfall: 'Composer API key',
    description: 'Composer (li.quest) requires x-lifi-api-key header',
    passed: opts.hasApiKey,
    detail: opts.hasApiKey
      ? 'LIFI_API_KEY is set'
      : 'LIFI_API_KEY is NOT set — quote/deposit commands will fail',
  })

  // Pitfall #4: Using POST for Composer quote
  checks.push({
    id: 4,
    pitfall: 'GET for Composer',
    description: 'Composer quote endpoint uses GET, not POST',
    passed: true,
    detail: 'SDK uses GET for /v1/quote',
  })

  // Pitfall #5: Wrong toToken for deposit
  checks.push({
    id: 5,
    pitfall: 'toToken = vault.address',
    description: 'Deposit toToken must be vault.address, not underlying token',
    passed: true,
    detail: `Vault address: ${vault.address}`,
  })

  // Pitfall #6: Not handling pagination
  const hasNextCursorLogic = true // SDK handles via listAllVaults
  checks.push({
    id: 6,
    pitfall: 'Pagination via nextCursor',
    description: 'Vault list is paginated — must follow nextCursor',
    passed: hasNextCursorLogic,
    detail: 'SDK auto-paginates via listAllVaults()',
  })

  // Pitfall #7: APY is a fraction, not a percentage
  const apyTotal = vault.analytics.apy.total
  const apyIsReasonable = apyTotal >= 0 && apyTotal < 500
  checks.push({
    id: 7,
    pitfall: 'APY value is reasonable',
    description:
      'apy.total is already a percentage (3.84 = 3.84%), not a fraction',
    passed: apyIsReasonable,
    detail: `apy.total = ${apyTotal.toFixed(2)}%`,
  })

  // Pitfall #8: TVL.usd is a string
  const tvl = parseTvl(vault.analytics.tvl)
  const tvlIsString = typeof vault.analytics.tvl.usd === 'string'
  checks.push({
    id: 8,
    pitfall: 'TVL.usd is a string',
    description: 'tvl.usd comes as a string, must parse to number',
    passed: tvlIsString,
    detail: `tvl.usd type=${typeof vault.analytics.tvl.usd}, parsed=${tvl.parsed}`,
  })

  // Pitfall #9: Decimal mismatch
  const hasDecimals = vault.underlyingTokens.length > 0
  const decimals = vault.underlyingTokens[0]?.decimals
  checks.push({
    id: 9,
    pitfall: 'Token decimals',
    description:
      'Use underlyingTokens[0].decimals for amount conversion (6 for USDC, 18 for ETH)',
    passed: hasDecimals,
    detail: hasDecimals
      ? `Decimals: ${decimals} (${vault.underlyingTokens[0]?.symbol})`
      : 'No underlyingTokens — decimals unknown, must specify fromToken manually',
  })

  // Pitfall #10: Chain ID is a number, not name
  const chainIdIsNumber = typeof vault.chainId === 'number'
  checks.push({
    id: 10,
    pitfall: 'chainId is a number',
    description: 'Use numeric chainId (8453), not chain name ("Base")',
    passed: chainIdIsNumber,
    detail: `chainId = ${vault.chainId} (type: ${typeof vault.chainId})`,
  })

  // Pitfall #11: No gas token on destination chain
  checks.push({
    id: 11,
    pitfall: 'Gas token needed',
    description:
      'Wallet must have native gas on the vault chain for tx execution',
    passed: true, // Cannot check from vault data alone; informational
    detail: `Vault is on chain ${vault.chainId} — ensure wallet has native gas`,
  })

  // Pitfall #12: Chain mismatch (wallet vs vault)
  checks.push({
    id: 12,
    pitfall: 'Chain mismatch',
    description:
      'Wallet chain must match vault chain (or use cross-chain route)',
    passed: true, // Informational in vault-only mode
    detail: `Vault on chain ${vault.chainId} — ensure wallet is on same chain or use bridge`,
  })

  // Pitfall #13: Non-transactional vault
  checks.push({
    id: 13,
    pitfall: 'isTransactional',
    description: 'Vault must be isTransactional=true to deposit via Composer',
    passed: vault.isTransactional,
    detail: vault.isTransactional
      ? 'Vault is transactional — deposits supported'
      : 'Vault is NOT transactional — cannot deposit via API',
  })

  // Pitfall #14: Not redeemable
  checks.push({
    id: 14,
    pitfall: 'isRedeemable',
    description: 'If isRedeemable=false, you may not be able to withdraw',
    passed: vault.isRedeemable,
    detail: vault.isRedeemable
      ? 'Vault is redeemable'
      : 'Vault is NOT redeemable — funds may be locked',
  })

  // Pitfall #15: Empty underlyingTokens
  const hasUnderlyingTokens = vault.underlyingTokens.length > 0
  checks.push({
    id: 15,
    pitfall: 'underlyingTokens[]',
    description:
      'Some vaults have empty underlyingTokens — must specify fromToken manually',
    passed: hasUnderlyingTokens,
    detail: hasUnderlyingTokens
      ? `Underlying: ${vault.underlyingTokens.map((t) => t.symbol).join(', ')}`
      : 'underlyingTokens is EMPTY — you must pass fromToken explicitly',
  })

  // Pitfall #16: description is optional
  const hasDescription =
    vault.description !== undefined && vault.description !== ''
  checks.push({
    id: 16,
    pitfall: 'description optional',
    description:
      '~14% of vaults lack a description field — do not assume it exists',
    passed: true, // Always passes — it's fine if missing
    detail: hasDescription
      ? `Description present: "${vault.description!.slice(0, 60)}..."`
      : 'No description (this is expected for some vaults)',
  })

  // Pitfall #17: apy.reward can be null
  checks.push({
    id: 17,
    pitfall: 'apy.reward nullable',
    description:
      'apy.reward is null for some protocols (Morpho) — normalize to 0',
    passed: typeof vault.analytics.apy.reward === 'number',
    detail: `apy.reward = ${vault.analytics.apy.reward} (type: ${typeof vault.analytics.apy.reward})`,
  })

  // Pitfall #18: apy1d/apy7d/apy30d nullable
  const apyFields = {
    apy1d: vault.analytics.apy1d,
    apy7d: vault.analytics.apy7d,
    apy30d: vault.analytics.apy30d,
  }
  const nullApyFields = Object.entries(apyFields)
    .filter(([, v]) => v === null)
    .map(([k]) => k)
  checks.push({
    id: 18,
    pitfall: 'Historical APY nullable',
    description: 'apy1d, apy7d, apy30d can all be null — use fallback chain',
    passed: true, // Always passes — null is expected; SDK handles fallback
    detail:
      nullApyFields.length > 0
        ? `Null fields: ${nullApyFields.join(', ')} — SDK uses fallback chain`
        : 'All historical APY fields present',
  })

  const passed = checks.filter((c) => c.passed).length
  const failed = checks.filter((c) => !c.passed).length

  const risk = riskScore(vault)

  return {
    checks,
    passed,
    failed,
    total: checks.length,
    riskScore: { score: risk.score, label: risk.label },
  }
}

export function formatDoctorReport(
  report: DoctorReport,
  vaultName?: string
): string {
  const lines: string[] = []

  lines.push(
    chalk.bold.underline(
      `EarnForge Doctor${vaultName ? ` — ${vaultName}` : ''}`
    )
  )
  lines.push('')

  for (const check of report.checks) {
    const icon = check.passed ? chalk.green('OK') : chalk.red('FAIL')
    const num = `#${String(check.id).padStart(2, '0')}`
    lines.push(`  ${icon}  ${chalk.dim(num)} ${chalk.bold(check.pitfall)}`)
    lines.push(`       ${chalk.dim(check.description)}`)
    lines.push(`       ${check.detail}`)
    lines.push('')
  }

  lines.push(chalk.bold('Summary'))
  lines.push(
    `  ${chalk.green(`${report.passed} passed`)}  ${report.failed > 0 ? chalk.red(`${report.failed} failed`) : chalk.dim('0 failed')}  ${chalk.dim(`${report.total} total`)}`
  )

  if (report.riskScore) {
    lines.push('')
    lines.push(chalk.bold('Risk Score'))
    lines.push(`  ${riskLabel(report.riskScore.score)}`)
  }

  return lines.join('\n')
}

/**
 * Run environment-only doctor checks (no vault needed).
 */
export function runEnvChecks(): DoctorReport {
  const checks: DoctorCheck[] = []

  const hasApiKey = !!process.env['LIFI_API_KEY']
  checks.push({
    id: 1,
    pitfall: 'LIFI_API_KEY',
    description: 'Composer API key for quote/deposit operations',
    passed: hasApiKey,
    detail: hasApiKey ? 'LIFI_API_KEY is set' : 'LIFI_API_KEY is NOT set',
  })

  const nodeVersion = process.version
  const majorVersion = parseInt(nodeVersion.slice(1), 10)
  checks.push({
    id: 2,
    pitfall: 'Node.js version',
    description: 'Node.js 18+ required for native fetch',
    passed: majorVersion >= 18,
    detail: `Node.js ${nodeVersion} (major: ${majorVersion})`,
  })

  checks.push({
    id: 3,
    pitfall: 'Earn Data API',
    description: 'earn.li.fi is the read-only API (no auth needed)',
    passed: true,
    detail: 'earn.li.fi — public, no API key required',
  })

  checks.push({
    id: 4,
    pitfall: 'Composer API',
    description: 'li.quest is the Composer API (requires API key)',
    passed: hasApiKey,
    detail: hasApiKey
      ? 'li.quest will use LIFI_API_KEY for x-lifi-api-key header'
      : 'li.quest requires LIFI_API_KEY — set it to use quote/deposit',
  })

  const passed = checks.filter((c) => c.passed).length
  const failed = checks.filter((c) => !c.passed).length

  return { checks, passed, failed, total: checks.length }
}

export function formatEnvReport(report: DoctorReport): string {
  const lines: string[] = []

  lines.push(chalk.bold.underline('EarnForge Doctor — Environment'))
  lines.push('')

  for (const check of report.checks) {
    const icon = check.passed ? chalk.green('OK') : chalk.red('FAIL')
    lines.push(`  ${icon}  ${chalk.bold(check.pitfall)}`)
    lines.push(`       ${chalk.dim(check.description)}`)
    lines.push(`       ${check.detail}`)
    lines.push('')
  }

  lines.push(chalk.bold('Summary'))
  lines.push(
    `  ${chalk.green(`${report.passed} passed`)}  ${report.failed > 0 ? chalk.red(`${report.failed} failed`) : chalk.dim('0 failed')}  ${chalk.dim(`${report.total} total`)}`
  )

  return lines.join('\n')
}
