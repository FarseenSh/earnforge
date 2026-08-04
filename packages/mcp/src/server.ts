// SPDX-License-Identifier: Apache-2.0

import {
  createEarnForge,
  detectDrift,
  flagReasons,
  isFlagged,
  parseTvl,
  positionBalanceUsd,
  type StrategyPreset,
  totalPortfolioUsd,
  type Vault,
} from '@earnforge/sdk'
import { McpServer } from '@modelcontextprotocol/server'
import { z } from 'zod'
import {
  AllocationOut,
  AllowanceOut,
  ChainListOut,
  DoctorOut,
  DriftOut,
  PortfolioOut,
  ProtocolListOut,
  QuoteOut,
  RiskOut,
  VaultListOut,
  VaultSummaryOut,
} from './output-schemas.js'
import { registerSkillResources } from './resources.js'

/** Slug description reused across tools — the format changed in Apr 2026. */
const SLUG_DESC =
  'Vault slug, format "protocol:chainId:_:address" (e.g. ' +
  '"morpho:8453:_:0xee8f4ec5672f09119b96ab6fb59c27e1b7e44b61"). The legacy ' +
  '"chainId-address" form is also accepted.'

const STRATEGY_DESC =
  'Strategy preset. "conservative" (stablecoins, blue-chip protocols, ' +
  'TVL>$50M, no impermanent-loss exposure), "max-apy" (highest APY), ' +
  '"diversified" (multi-chain spread), "risk-adjusted" (risk score >= 7). ' +
  'All presets exclude verification-flagged vaults.'

/**
 * Return both a human-readable text block and validated structured content.
 *
 * Hosts on older protocol revisions read `content`; anything current reads
 * `structuredContent` and gets a shape it can rely on.
 */
function result<T>(data: T) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }],
    structuredContent: data as Record<string, unknown>,
  }
}

function failure(message: string) {
  return {
    content: [{ type: 'text' as const, text: message }],
    isError: true as const,
  }
}

/** Verification block, surfaced on every vault-shaped response. */
function verificationOf(vault: Vault) {
  return {
    status: vault.verificationStatus ?? 'none',
    flagged: isFlagged(vault),
    reasons: flagReasons(vault),
  }
}

function summarizeVault(vault: Vault) {
  return {
    name: vault.name,
    slug: vault.slug,
    address: vault.address,
    chainId: vault.chainId,
    network: vault.network,
    protocol: vault.protocol.id ?? vault.protocol.name,
    tags: vault.tags,
    apy: {
      total: vault.analytics.apy.total,
      base: vault.analytics.apy.base,
      reward: vault.analytics.apy.reward,
    },
    tvlUsd: parseTvl(vault.analytics.tvl).parsed,
    underlyingTokens: vault.underlyingTokens.map((t) => t.symbol),
    isTransactional: vault.isTransactional,
    isRedeemable: vault.isRedeemable,
    verification: verificationOf(vault),
  }
}

export interface CreateServerOptions {
  /** LI.FI API key. Falls back to LIFI_API_KEY. */
  apiKey?: string
}

/**
 * Build the EarnForge MCP server.
 *
 * Twelve tools, all read-only — nothing here signs or broadcasts. Quote tools
 * return unsigned `transactionRequest` objects for the caller's wallet.
 *
 * Overlaps LI.FI's own hosted server on the five `get-earn-*` tools and adds
 * seven it does not offer: risk scoring, allocation, diagnostics, allowance
 * checking, redeem quoting, and API drift detection. It also differs on quality
 * — LI.FI's tool descriptions still advertise versioned protocol slugs that
 * match nothing, and their server does not expose `verificationStatus`.
 */
export function createServer(options: CreateServerOptions = {}): McpServer {
  const server = new McpServer({
    name: 'earnforge-mcp',
    version: '1.0.0',
  })

  const forge = createEarnForge({
    apiKey: options.apiKey ?? process.env.LIFI_API_KEY,
    cache: { ttl: 60_000, maxSize: 200 },
  })

  /** Annotations shared by every tool: read-only, hitting an external API. */
  const readOnly = {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  }

  // ── get-earn-vaults ─────────────────────────────────────────────────

  server.registerTool(
    'get-earn-vaults',
    {
      title: 'List Earn vaults',
      description:
        'Search yield vaults across every chain LI.FI Earn indexes. THE primary ' +
        'tool for finding yield. APY values are percentages already (4.63 = ' +
        '4.63%) — do not multiply by 100. Each result carries a verification ' +
        'block: LI.FI flags roughly 9% of vaults as suspect, and those should ' +
        'not be recommended without saying so.',
      inputSchema: z.object({
        chainId: z
          .number()
          .optional()
          .describe(
            'EVM chain ID (8453 = Base, 1 = Ethereum). A number, not a name.'
          ),
        asset: z
          .string()
          .optional()
          .describe('Underlying token symbol, e.g. "USDC".'),
        protocol: z
          .string()
          .optional()
          .describe(
            'Protocol id — UNVERSIONED. "morpho", never "morpho-v1". A stale ' +
              'slug returns zero results with no error, so resolve it via ' +
              'get-earn-protocols rather than guessing.'
          ),
        minTvl: z.number().optional().describe('Minimum TVL in USD.'),
        sortBy: z.enum(['apy', 'tvl']).optional(),
        limit: z
          .number()
          .optional()
          .describe('Max vaults to return (default 10).'),
        strategy: z
          .enum(['conservative', 'max-apy', 'diversified', 'risk-adjusted'])
          .optional()
          .describe(STRATEGY_DESC),
        includeFlagged: z
          .boolean()
          .optional()
          .describe('Include verification-flagged vaults. Default false.'),
      }),
      outputSchema: VaultListOut,
      annotations: readOnly,
    },
    async (params) => {
      try {
        const vaults = await forge.vaults.top({
          chainId: params.chainId,
          asset: params.asset,
          minTvl: params.minTvl,
          limit: params.limit ?? 10,
          strategy: params.strategy as StrategyPreset | undefined,
        })
        const filtered = params.includeFlagged
          ? vaults
          : vaults.filter((v) => !isFlagged(v))
        const results = filtered.map(summarizeVault)
        return result({
          count: results.length,
          vaults: results,
          flaggedCount: vaults.filter(isFlagged).length,
        })
      } catch (err) {
        return failure(`Failed to list vaults: ${(err as Error).message}`)
      }
    }
  )

  // ── get-earn-vault ──────────────────────────────────────────────────

  server.registerTool(
    'get-earn-vault',
    {
      title: 'Get one Earn vault',
      description:
        'Full details for a single vault: APY breakdown, TVL, underlying tokens ' +
        'with USD prices, reward tokens, protocol, deposit/redeem support, and ' +
        "LI.FI's verification status. To deposit, pass the vault's address as " +
        'toToken and its chainId as toChain to quote-vault-deposit.',
      inputSchema: z.object({ slug: z.string().describe(SLUG_DESC) }),
      outputSchema: VaultSummaryOut,
      annotations: readOnly,
    },
    async (params) => {
      try {
        const vault = await forge.vaults.get(params.slug)
        return result(summarizeVault(vault))
      } catch (err) {
        return failure(`Failed to get vault: ${(err as Error).message}`)
      }
    }
  )

  // ── get-earn-chains ─────────────────────────────────────────────────

  server.registerTool(
    'get-earn-chains',
    {
      title: 'List Earn chains',
      description:
        'Chains with at least one indexed Earn vault. This is a SUBSET of all ' +
        'LI.FI-supported chains — Composer covers more. Use these chain ids to ' +
        'filter get-earn-vaults rather than hardcoding them.',
      inputSchema: z.object({}),
      outputSchema: ChainListOut,
      annotations: readOnly,
    },
    async () => {
      try {
        const chains = await forge.chains.list()
        return result({ count: chains.length, chains })
      } catch (err) {
        return failure(`Failed to list chains: ${(err as Error).message}`)
      }
    }
  )

  // ── get-earn-protocols ──────────────────────────────────────────────

  server.registerTool(
    'get-earn-protocols',
    {
      title: 'List Earn protocols',
      description:
        'Protocols with at least one indexed vault. Ids are UNVERSIONED — ' +
        '"morpho", "aave", "euler", not "morpho-v1"/"aave-v3"/"euler-v2". ' +
        'Filtering on a versioned slug returns HTTP 200 with zero results ' +
        'rather than an error, so always resolve the id here first.',
      inputSchema: z.object({}),
      outputSchema: ProtocolListOut,
      annotations: readOnly,
    },
    async () => {
      try {
        const protocols = await forge.protocols.list()
        return result({
          count: protocols.length,
          protocols: protocols.map((p) => ({
            id: p.id ?? p.name,
            name: p.name,
            url: p.url,
          })),
        })
      } catch (err) {
        return failure(`Failed to list protocols: ${(err as Error).message}`)
      }
    }
  )

  // ── get-earn-portfolio ──────────────────────────────────────────────

  server.registerTool(
    'get-earn-portfolio',
    {
      title: 'Get wallet portfolio',
      description:
        "A wallet's Earn positions across all protocols. Note that " +
        '`protocolName` and `balanceUsd` are nullable — handle null rather than ' +
        'formatting it into NaN.',
      inputSchema: z.object({
        wallet: z
          .string()
          .describe('Wallet address (0x-prefixed, 40 hex chars).'),
      }),
      outputSchema: PortfolioOut,
      annotations: readOnly,
    },
    async (params) => {
      try {
        const portfolio = await forge.portfolio.get(params.wallet)
        return result({
          positionCount: portfolio.positions.length,
          totalUsd: totalPortfolioUsd(portfolio.positions),
          positions: portfolio.positions.map((p) => ({
            chainId: p.chainId,
            address: p.address ?? null,
            protocolName: p.protocolName,
            assetSymbol: p.asset.symbol,
            balanceUsd: positionBalanceUsd(p),
          })),
        })
      } catch (err) {
        return failure(`Failed to get portfolio: ${(err as Error).message}`)
      }
    }
  )

  // ── get-vault-risk ──────────────────────────────────────────────────

  server.registerTool(
    'get-vault-risk',
    {
      title: 'Score vault risk',
      description:
        'Composite 0-10 risk score across seven dimensions: TVL, APY stability, ' +
        "protocol maturity, redeemability, asset type, LI.FI's verification " +
        'status, and reward dependency. Labels: "low" (>=8), "medium" (>=6), ' +
        '"high" (<6). Higher is safer. Verification is weighted heavily enough ' +
        'that a flagged vault can never be low risk. ALWAYS relay the `flags` ' +
        'array — the score alone hides why.',
      inputSchema: z.object({ slug: z.string().describe(SLUG_DESC) }),
      outputSchema: RiskOut,
      annotations: readOnly,
    },
    async (params) => {
      try {
        const vault = await forge.vaults.get(params.slug)
        const risk = forge.riskScore(vault)
        return result({
          slug: vault.slug,
          name: vault.name,
          score: risk.score,
          label: risk.label,
          breakdown: risk.breakdown,
          flags: risk.flags,
        })
      } catch (err) {
        return failure(
          `Failed to compute risk score: ${(err as Error).message}`
        )
      }
    }
  )

  // ── quote-vault-deposit ─────────────────────────────────────────────

  server.registerTool(
    'quote-vault-deposit',
    {
      title: 'Quote a vault deposit',
      description:
        'Build an UNSIGNED deposit transaction. This does not execute anything ' +
        "— the caller's wallet signs and broadcasts. Check the returned " +
        'approvalAddress with check-allowance first; ERC-20 deposits fail ' +
        'without sufficient approval. Cross-chain flows are NOT atomic: a bridge ' +
        'can succeed while the destination deposit fails.',
      inputSchema: z.object({
        slug: z.string().describe(SLUG_DESC),
        wallet: z.string().describe('Wallet that will execute the deposit.'),
        fromAmount: z
          .string()
          .describe('Human-readable amount, e.g. "100" for 100 USDC.'),
        fromToken: z
          .string()
          .optional()
          .describe(
            "Source token address. Defaults to the vault's first underlying " +
              'token. REQUIRED for cross-chain — the underlying address is on ' +
              "the vault's chain, not the source chain."
          ),
        fromChain: z
          .number()
          .optional()
          .describe("Defaults to the vault's chain."),
        slippage: z.number().optional().describe('e.g. 0.03 for 3%.'),
      }),
      outputSchema: QuoteOut,
      annotations: readOnly,
    },
    async (params) => {
      try {
        const vault = await forge.vaults.get(params.slug)
        const warnings: string[] = []
        if (isFlagged(vault)) {
          warnings.push(
            `LI.FI flagged this vault: ${flagReasons(vault).join(', ')}. ` +
              'Tell the user before they sign.'
          )
        }
        if (params.fromChain && params.fromChain !== vault.chainId) {
          warnings.push(
            'Cross-chain deposit — not atomic. Poll status and handle the ' +
              'failed case, where the bridge succeeds but the deposit does not.'
          )
        }
        const r = await forge.buildDepositQuote(vault, {
          fromAmount: params.fromAmount,
          wallet: params.wallet,
          fromToken: params.fromToken,
          fromChain: params.fromChain,
          slippage: params.slippage,
        })
        warnings.push(
          'Check ERC-20 allowance against approvalAddress before signing.'
        )
        return result({
          vault: r.vault.name,
          humanAmount: r.humanAmount,
          rawAmount: r.rawAmount,
          decimals: r.decimals,
          approvalAddress: r.quote.estimate.approvalAddress ?? null,
          estimate: {
            tool: r.quote.estimate.tool,
            toAmount: r.quote.estimate.toAmount,
            toAmountMin: r.quote.estimate.toAmountMin,
            executionDuration: r.quote.estimate.executionDuration,
          },
          transactionRequest: {
            to: r.quote.transactionRequest.to,
            value: r.quote.transactionRequest.value,
            chainId: r.quote.transactionRequest.chainId,
          },
          warnings,
        })
      } catch (err) {
        return failure(
          `Failed to build deposit quote: ${(err as Error).message}`
        )
      }
    }
  )

  // ── quote-vault-redeem ──────────────────────────────────────────────

  server.registerTool(
    'quote-vault-redeem',
    {
      title: 'Quote a vault withdrawal',
      description:
        'Build an UNSIGNED withdrawal transaction, swapping vault share tokens ' +
        'back to an underlying asset. Verifies isRedeemable first — some ' +
        'protocols support deposits only, and withdrawals there must go through ' +
        "the protocol's own interface.",
      inputSchema: z.object({
        slug: z.string().describe(SLUG_DESC),
        wallet: z.string(),
        fromAmount: z
          .string()
          .describe('Human-readable amount of share tokens to redeem.'),
        toToken: z.string().optional().describe('Destination token address.'),
        toChain: z.number().optional(),
        slippage: z.number().optional(),
      }),
      outputSchema: QuoteOut,
      annotations: readOnly,
    },
    async (params) => {
      try {
        const vault = await forge.vaults.get(params.slug)
        const warnings: string[] = []
        if (!vault.isRedeemable) {
          warnings.push(
            'isRedeemable is false — Composer cannot withdraw from this vault.'
          )
        }
        const r = await forge.buildRedeemQuote(vault, {
          fromAmount: params.fromAmount,
          wallet: params.wallet,
          toToken: params.toToken,
          toChain: params.toChain,
          slippage: params.slippage,
        })
        return result({
          vault: r.vault.name,
          humanAmount: r.humanAmount,
          rawAmount: r.rawAmount,
          approvalAddress: r.quote.estimate.approvalAddress ?? null,
          estimate: {
            toAmount: r.quote.estimate.toAmount,
            toAmountMin: r.quote.estimate.toAmountMin,
            executionDuration: r.quote.estimate.executionDuration,
          },
          transactionRequest: {
            to: r.quote.transactionRequest.to,
            value: r.quote.transactionRequest.value,
            chainId: r.quote.transactionRequest.chainId,
          },
          warnings,
        })
      } catch (err) {
        return failure(
          `Failed to build redeem quote: ${(err as Error).message}`
        )
      }
    }
  )

  // ── check-allowance ─────────────────────────────────────────────────

  server.registerTool(
    'check-allowance',
    {
      title: 'Check ERC-20 allowance',
      description:
        'Read an ERC-20 allowance and build an UNSIGNED approval transaction if ' +
        'it is insufficient. Use the approvalAddress from a deposit quote as the ' +
        'spender. This reads chain state; it does not approve anything.',
      inputSchema: z.object({
        rpcUrl: z.string().describe('JSON-RPC endpoint for the chain.'),
        tokenAddress: z.string(),
        owner: z.string().describe('Token holder.'),
        spender: z.string().describe("From the quote's approvalAddress."),
        requiredAmount: z
          .string()
          .describe("Smallest unit — the quote's rawAmount."),
        chainId: z.number(),
      }),
      outputSchema: AllowanceOut,
      annotations: readOnly,
    },
    async (params) => {
      try {
        const { checkAllowance, buildApprovalTx, MAX_UINT256 } = await import(
          '@earnforge/sdk'
        )
        const required = BigInt(params.requiredAmount)
        const r = await checkAllowance(
          params.rpcUrl,
          params.tokenAddress,
          params.owner,
          params.spender,
          required
        )
        return result({
          allowance: r.allowance.toString(),
          requiredAmount: r.requiredAmount.toString(),
          sufficient: r.sufficient,
          approvalTx: r.sufficient
            ? null
            : buildApprovalTx(
                params.tokenAddress,
                params.spender,
                MAX_UINT256,
                params.chainId
              ),
        })
      } catch (err) {
        return failure(`Failed to check allowance: ${(err as Error).message}`)
      }
    }
  )

  // ── suggest-allocation ──────────────────────────────────────────────

  server.registerTool(
    'suggest-allocation',
    {
      title: 'Suggest a portfolio allocation',
      description:
        'Split an amount across vaults using a risk-adjusted scoring engine. ' +
        'Verification-flagged vaults are excluded by default — roughly 9% of the ' +
        'fleet — because a caller asking for an allocation has not asked to be ' +
        'handed a suspect vault.',
      inputSchema: z.object({
        amount: z.number().describe('Total USD to allocate.'),
        asset: z.string().optional().describe('Underlying token symbol.'),
        maxChains: z.number().optional().describe('Default 5.'),
        maxVaults: z.number().optional().describe('Default 5.'),
        strategy: z
          .enum(['conservative', 'max-apy', 'diversified', 'risk-adjusted'])
          .optional()
          .describe(STRATEGY_DESC),
        includeFlagged: z
          .boolean()
          .optional()
          .describe('Opt in to flagged vaults. Default false.'),
      }),
      outputSchema: AllocationOut,
      annotations: readOnly,
    },
    async (params) => {
      try {
        const r = await forge.suggest({
          amount: params.amount,
          asset: params.asset,
          maxChains: params.maxChains,
          maxVaults: params.maxVaults,
          strategy: params.strategy as StrategyPreset | undefined,
          includeFlagged: params.includeFlagged,
        })
        return result({
          totalAmount: r.totalAmount,
          expectedApy: r.expectedApy,
          excludedFlagged: !params.includeFlagged,
          allocations: r.allocations.map((a) => ({
            vault: a.vault.name,
            slug: a.vault.slug,
            chainId: a.vault.chainId,
            protocol: a.vault.protocol.id ?? a.vault.protocol.name,
            percentage: a.percentage,
            amount: a.amount,
            apy: a.apy,
            riskScore: a.risk.score,
            riskLabel: a.risk.label,
          })),
        })
      } catch (err) {
        return failure(
          `Failed to generate allocation suggestion: ${(err as Error).message}`
        )
      }
    }
  )

  // ── run-doctor ──────────────────────────────────────────────────────

  server.registerTool(
    'run-doctor',
    {
      title: 'Run pre-deposit diagnostics',
      description:
        'Pre-deposit checks on a vault and wallet: isTransactional, chain ' +
        'mismatch, gas balance, token balance, underlying tokens, ' +
        'redeemability. Returns a pass/fail report plus the risk score and ' +
        'verification status, so one call answers "is this safe and will it work".',
      inputSchema: z.object({
        slug: z.string().describe(SLUG_DESC),
        wallet: z.string(),
        walletChainId: z
          .number()
          .optional()
          .describe(
            'Chain the wallet is connected to, for mismatch detection.'
          ),
        depositAmount: z
          .string()
          .optional()
          .describe('Human-readable amount, for the balance check.'),
      }),
      outputSchema: DoctorOut,
      annotations: readOnly,
    },
    async (params) => {
      try {
        const vault = await forge.vaults.get(params.slug)
        const report = forge.preflight(vault, params.wallet, {
          walletChainId: params.walletChainId,
          depositAmount: params.depositAmount,
        })
        const risk = forge.riskScore(vault)
        return result({
          ok: report.ok,
          vault: report.vault.name,
          slug: report.vault.slug,
          wallet: report.wallet,
          issueCount: report.issues.length,
          issues: report.issues,
          riskScore: risk.score,
          riskLabel: risk.label,
          verification: verificationOf(vault),
        })
      } catch (err) {
        return failure(`Failed to run doctor: ${(err as Error).message}`)
      }
    }
  )

  // ── check-api-drift ─────────────────────────────────────────────────

  server.registerTool(
    'check-api-drift',
    {
      title: 'Check for Earn API drift',
      description:
        "Compare the live Earn API against LI.FI's published OpenAPI spec and " +
        "against this SDK's schema, reporting which pair disagrees. Use when a " +
        'call behaves unexpectedly, or to check whether LI.FI has changed ' +
        'something. `live-vs-schema` findings mean the SDK is stale; ' +
        '`live-vs-spec` findings mean the documentation is wrong and will ' +
        'mislead anyone reading it.',
      inputSchema: z.object({
        sampleSize: z
          .number()
          .optional()
          .describe('Vaults to inspect, max 100. Default 100.'),
      }),
      outputSchema: DriftOut,
      annotations: readOnly,
    },
    async (params) => {
      try {
        const report = await detectDrift({
          apiKey: options.apiKey ?? process.env.LIFI_API_KEY,
          sampleSize: params.sampleSize,
        })
        return result({
          ok: report.ok,
          checkedVaults: report.checkedVaults,
          specFetched: report.specFetched,
          findings: report.findings,
        })
      } catch (err) {
        return failure(`Failed to check drift: ${(err as Error).message}`)
      }
    }
  )

  // Serve the Agent Skill over MCP as resources (SEP-2640), so a host gets the
  // workflow instructions and the tools from a single connection.
  registerSkillResources(server)

  return server
}
