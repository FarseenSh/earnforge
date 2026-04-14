#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import {
  createEarnForge,
  type Vault,
  type StrategyPreset,
} from '@earnforge/sdk'

// ── Helpers ─────────────────────────────────────────────────────────

function json(data: unknown): {
  content: Array<{ type: 'text'; text: string }>
} {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }],
  }
}

function error(message: string): {
  content: Array<{ type: 'text'; text: string }>
  isError: true
} {
  return { content: [{ type: 'text' as const, text: message }], isError: true }
}

// ── Forge instance ──────────────────────────────────────────────────

function buildForge() {
  return createEarnForge({
    composerApiKey: process.env.LIFI_API_KEY,
    cache: { ttl: 60_000, maxSize: 200 },
  })
}

// ── Server ──────────────────────────────────────────────────────────

export function createServer(): McpServer {
  const server = new McpServer({
    name: 'earnforge-mcp',
    version: '0.1.0',
  })

  const forge = buildForge()

  // ── get-earn-vaults ───────────────────────────────────────────────

  server.tool(
    'get-earn-vaults',
    'List LI.FI Earn vaults with optional filters. Returns paginated vault data including APY, TVL, protocol info, and tags. Use chainId (number, not chain name), asset symbol, minTvl, sortBy, limit, and strategy preset to narrow results.',
    {
      chainId: z
        .number()
        .optional()
        .describe(
          'EVM chain ID (e.g. 8453 for Base, 1 for Ethereum). Must be a number, not a chain name.'
        ),
      asset: z
        .string()
        .optional()
        .describe('Filter by underlying token symbol (e.g. "USDC", "ETH").'),
      minTvl: z
        .number()
        .optional()
        .describe('Minimum TVL in USD. Vaults below this are excluded.'),
      sortBy: z.string().optional().describe('Sort field (e.g. "apy", "tvl").'),
      limit: z
        .number()
        .optional()
        .describe('Maximum number of vaults to return (default 10).'),
      strategy: z
        .enum(['conservative', 'max-apy', 'diversified', 'risk-adjusted'])
        .optional()
        .describe(
          'Strategy preset filter: "conservative" (stablecoins, blue-chip, TVL>$50M), "max-apy" (highest APY), "diversified" (multi-chain spread), "risk-adjusted" (risk score >= 7).'
        ),
    },
    async (params) => {
      try {
        const limit = params.limit ?? 10
        const vaults = await forge.vaults.top({
          chainId: params.chainId,
          asset: params.asset,
          minTvl: params.minTvl,
          limit,
          strategy: params.strategy as StrategyPreset | undefined,
        })

        const results = vaults.map(summarizeVault)
        return json({ count: results.length, vaults: results })
      } catch (err) {
        return error(`Failed to list vaults: ${(err as Error).message}`)
      }
    }
  )

  // ── get-earn-vault ────────────────────────────────────────────────

  server.tool(
    'get-earn-vault',
    'Get a single LI.FI Earn vault by its slug (format: "<chainId>-<address>", e.g. "8453-0xbeef..."). Returns full vault details including APY breakdown, TVL, underlying tokens, protocol, deposit/redeem packs, and tags.',
    {
      slug: z
        .string()
        .describe(
          'Vault slug in the format "<chainId>-<vaultAddress>" (e.g. "8453-0xbeef0e0834849acc03f0089f01f4f1eeb06873c9").'
        ),
    },
    async (params) => {
      try {
        const vault = await forge.vaults.get(params.slug)
        return json(vault)
      } catch (err) {
        return error(`Failed to get vault: ${(err as Error).message}`)
      }
    }
  )

  // ── get-earn-chains ───────────────────────────────────────────────

  server.tool(
    'get-earn-chains',
    'List all blockchain chains supported by LI.FI Earn. Returns chain IDs, names, and CAIP identifiers. Use the chainId from the results to filter vaults.',
    {},
    async () => {
      try {
        const chains = await forge.chains.list()
        return json({ count: chains.length, chains })
      } catch (err) {
        return error(`Failed to list chains: ${(err as Error).message}`)
      }
    }
  )

  // ── get-earn-protocols ────────────────────────────────────────────

  server.tool(
    'get-earn-protocols',
    'List all DeFi protocols available on LI.FI Earn. Returns protocol names and URLs. Protocol names can be used to understand which vaults belong to which protocol.',
    {},
    async () => {
      try {
        const protocols = await forge.protocols.list()
        return json({ count: protocols.length, protocols })
      } catch (err) {
        return error(`Failed to list protocols: ${(err as Error).message}`)
      }
    }
  )

  // ── get-earn-portfolio ────────────────────────────────────────────

  server.tool(
    'get-earn-portfolio',
    'Get DeFi portfolio positions for a wallet address. Returns all earn positions including chain, protocol, asset, USD balance, and native balance.',
    {
      wallet: z
        .string()
        .describe('Wallet address (0x...) to look up portfolio positions for.'),
    },
    async (params) => {
      try {
        const portfolio = await forge.portfolio.get(params.wallet)
        return json(portfolio)
      } catch (err) {
        return error(`Failed to get portfolio: ${(err as Error).message}`)
      }
    }
  )

  // ── get-vault-risk ────────────────────────────────────────────────

  server.tool(
    'get-vault-risk',
    'Compute a composite 0-10 risk score for a vault. Score dimensions: TVL magnitude, APY stability, protocol maturity, redeemability, and asset type. Labels: "low" (>=7), "medium" (>=4), "high" (<4). Higher score = safer.',
    {
      slug: z
        .string()
        .describe('Vault slug in the format "<chainId>-<vaultAddress>".'),
    },
    async (params) => {
      try {
        const vault = await forge.vaults.get(params.slug)
        const risk = forge.riskScore(vault)
        return json({ slug: params.slug, name: vault.name, ...risk })
      } catch (err) {
        return error(`Failed to compute risk score: ${(err as Error).message}`)
      }
    }
  )

  // ── quote-vault-deposit ───────────────────────────────────────────

  server.tool(
    'quote-vault-deposit',
    "Build a deposit quote for an Earn vault. Requires a LI.FI API key (set LIFI_API_KEY env var). Returns the quote with transaction data ready to sign. IMPORTANT: Before executing the deposit, use check-allowance with the quote's approvalAddress to verify token approval.",
    {
      slug: z
        .string()
        .describe('Vault slug in the format "<chainId>-<vaultAddress>".'),
      wallet: z
        .string()
        .describe('Wallet address (0x...) that will execute the deposit.'),
      fromAmount: z
        .string()
        .describe(
          'Human-readable amount to deposit (e.g. "100" for 100 USDC).'
        ),
      fromToken: z
        .string()
        .optional()
        .describe(
          "Override the from-token address. Defaults to the vault's first underlying token."
        ),
      fromChain: z
        .number()
        .optional()
        .describe(
          "Override the source chain ID. Defaults to the vault's chain."
        ),
      slippage: z
        .number()
        .optional()
        .describe(
          'Slippage tolerance (e.g. 0.03 for 3%). Defaults to API default.'
        ),
    },
    async (params) => {
      try {
        const vault = await forge.vaults.get(params.slug)
        const result = await forge.buildDepositQuote(vault, {
          fromAmount: params.fromAmount,
          wallet: params.wallet,
          fromToken: params.fromToken,
          fromChain: params.fromChain,
          slippage: params.slippage,
        })
        return json({
          vault: result.vault.name,
          humanAmount: result.humanAmount,
          rawAmount: result.rawAmount,
          decimals: result.decimals,
          estimate: {
            tool: result.quote.estimate.tool,
            toAmount: result.quote.estimate.toAmount,
            toAmountMin: result.quote.estimate.toAmountMin,
            executionDuration: result.quote.estimate.executionDuration,
            gasCosts: result.quote.estimate.gasCosts,
            feeCosts: result.quote.estimate.feeCosts,
          },
          transactionRequest: {
            to: result.quote.transactionRequest.to,
            value: result.quote.transactionRequest.value,
            chainId: result.quote.transactionRequest.chainId,
          },
        })
      } catch (err) {
        return error(`Failed to build deposit quote: ${(err as Error).message}`)
      }
    }
  )

  // ── quote-vault-redeem ─────────────────────────────────────────────

  server.tool(
    'quote-vault-redeem',
    'Build a withdrawal/redeem quote for an Earn vault. Withdraws vault share tokens back to the underlying asset. Requires LIFI_API_KEY. Checks isRedeemable before quoting.',
    {
      slug: z.string().describe('Vault slug "<chainId>-<vaultAddress>".'),
      wallet: z.string().describe('Wallet address (0x...).'),
      fromAmount: z
        .string()
        .describe('Amount of vault share tokens to redeem (human-readable).'),
      toToken: z
        .string()
        .optional()
        .describe('Override destination token address.'),
      toChain: z.number().optional().describe('Override destination chain ID.'),
      slippage: z.number().optional().describe('Slippage tolerance.'),
    },
    async (params) => {
      try {
        const vault = await forge.vaults.get(params.slug)
        const result = await forge.buildRedeemQuote(vault, {
          fromAmount: params.fromAmount,
          wallet: params.wallet,
          toToken: params.toToken,
          toChain: params.toChain,
          slippage: params.slippage,
        })
        return json({
          vault: result.vault.name,
          humanAmount: result.humanAmount,
          rawAmount: result.rawAmount,
          isRedeemable: vault.isRedeemable,
          estimate: {
            toAmount: result.quote.estimate.toAmount,
            toAmountMin: result.quote.estimate.toAmountMin,
            executionDuration: result.quote.estimate.executionDuration,
          },
          transactionRequest: {
            to: result.quote.transactionRequest.to,
            value: result.quote.transactionRequest.value,
            chainId: result.quote.transactionRequest.chainId,
          },
        })
      } catch (err) {
        return error(`Failed to build redeem quote: ${(err as Error).message}`)
      }
    }
  )

  // ── check-allowance ───────────────────────────────────────────────

  server.tool(
    'check-allowance',
    'Check ERC-20 token allowance and build an approval tx if needed. Use before depositing — the Composer contract needs token approval. Get the spender from quote.estimate.approvalAddress.',
    {
      rpcUrl: z.string().describe('JSON-RPC endpoint for the chain.'),
      tokenAddress: z.string().describe('ERC-20 token contract address.'),
      owner: z.string().describe('Wallet address (token holder).'),
      spender: z
        .string()
        .describe('Spender address (from quote.estimate.approvalAddress).'),
      requiredAmount: z
        .string()
        .describe('Required amount in smallest unit (from quote rawAmount).'),
      chainId: z.number().describe('Chain ID for the approval transaction.'),
    },
    async (params) => {
      try {
        const { checkAllowance, buildApprovalTx, MAX_UINT256 } = await import(
          '@earnforge/sdk'
        )
        const required = BigInt(params.requiredAmount)
        const result = await checkAllowance(
          params.rpcUrl,
          params.tokenAddress,
          params.owner,
          params.spender,
          required
        )

        const response: Record<string, unknown> = {
          allowance: result.allowance.toString(),
          sufficient: result.sufficient,
          requiredAmount: result.requiredAmount.toString(),
        }

        if (!result.sufficient) {
          response.approvalTx = buildApprovalTx(
            params.tokenAddress,
            params.spender,
            MAX_UINT256,
            params.chainId
          )
          response.note =
            'Allowance insufficient. Sign the approvalTx before depositing.'
        }

        return json(response)
      } catch (err) {
        return error(`Failed to check allowance: ${(err as Error).message}`)
      }
    }
  )

  // ── suggest-allocation ────────────────────────────────────────────

  server.tool(
    'suggest-allocation',
    'Get a portfolio allocation suggestion. Uses a risk-adjusted scoring engine to recommend how to split funds across multiple vaults. Returns allocation percentages, expected APY, and risk scores per vault.',
    {
      amount: z
        .number()
        .describe('Total USD amount to allocate across vaults.'),
      asset: z
        .string()
        .optional()
        .describe('Filter vaults by underlying token symbol (e.g. "USDC").'),
      maxChains: z
        .number()
        .optional()
        .describe(
          'Maximum number of different chains to spread across (default 5).'
        ),
      maxVaults: z
        .number()
        .optional()
        .describe('Maximum number of vaults in the allocation (default 5).'),
      strategy: z
        .enum(['conservative', 'max-apy', 'diversified', 'risk-adjusted'])
        .optional()
        .describe('Strategy preset to guide allocation.'),
    },
    async (params) => {
      try {
        const result = await forge.suggest({
          amount: params.amount,
          asset: params.asset,
          maxChains: params.maxChains,
          maxVaults: params.maxVaults,
          strategy: params.strategy as StrategyPreset | undefined,
        })
        return json({
          totalAmount: result.totalAmount,
          expectedApy: result.expectedApy,
          allocations: result.allocations.map((a) => ({
            vault: a.vault.name,
            slug: a.vault.slug,
            chainId: a.vault.chainId,
            protocol: a.vault.protocol.name,
            percentage: a.percentage,
            amount: a.amount,
            apy: a.apy,
            riskScore: a.risk.score,
            riskLabel: a.risk.label,
          })),
        })
      } catch (err) {
        return error(
          `Failed to generate allocation suggestion: ${(err as Error).message}`
        )
      }
    }
  )

  // ── run-doctor ────────────────────────────────────────────────────

  server.tool(
    'run-doctor',
    'Run preflight / pitfall checks on a vault before depositing. Checks: isTransactional, chain mismatch, gas token balance, token balance sufficiency, underlyingTokens existence, and redeemability. Returns a pass/fail report with detailed issues.',
    {
      slug: z
        .string()
        .describe('Vault slug in the format "<chainId>-<vaultAddress>".'),
      wallet: z
        .string()
        .describe('Wallet address (0x...) to run checks against.'),
      walletChainId: z
        .number()
        .optional()
        .describe(
          'Chain ID the wallet is currently connected to. Used to detect chain mismatch.'
        ),
      depositAmount: z
        .string()
        .optional()
        .describe(
          'Human-readable amount to deposit. Used for balance sufficiency check.'
        ),
    },
    async (params) => {
      try {
        const vault = await forge.vaults.get(params.slug)
        const report = forge.preflight(vault, params.wallet, {
          walletChainId: params.walletChainId,
          depositAmount: params.depositAmount,
        })
        return json({
          ok: report.ok,
          vault: report.vault.name,
          slug: report.vault.slug,
          wallet: report.wallet,
          issueCount: report.issues.length,
          issues: report.issues,
        })
      } catch (err) {
        return error(`Failed to run doctor: ${(err as Error).message}`)
      }
    }
  )

  return server
}

// ── Vault summary helper ────────────────────────────────────────────

function summarizeVault(vault: Vault) {
  return {
    name: vault.name,
    slug: vault.slug,
    chainId: vault.chainId,
    network: vault.network,
    protocol: vault.protocol.name,
    tags: vault.tags,
    apy: {
      total: vault.analytics.apy.total,
      base: vault.analytics.apy.base,
      reward: vault.analytics.apy.reward,
    },
    tvlUsd: vault.analytics.tvl.usd,
    underlyingTokens: vault.underlyingTokens.map((t) => t.symbol),
    isTransactional: vault.isTransactional,
    isRedeemable: vault.isRedeemable,
  }
}

// ── Main ────────────────────────────────────────────────────────────

export async function main(): Promise<void> {
  const server = createServer()
  const transport = new StdioServerTransport()
  await server.connect(transport)
}

// Only auto-start when run directly as CLI, not when imported for testing.
// In vitest, import.meta.url will not match the process entry point.
const entrypoint = process.argv[1] ?? ''
const isMain =
  import.meta.url === `file://${entrypoint}` ||
  entrypoint.endsWith('earnforge-mcp')

if (isMain) {
  main().catch((err) => {
    console.error('EarnForge MCP server failed to start:', err)
    process.exit(1)
  })
}
