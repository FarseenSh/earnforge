// SPDX-License-Identifier: Apache-2.0
import { z } from 'zod'

/**
 * Output schemas for every tool.
 *
 * Declaring `outputSchema` means the SDK validates `structuredContent` before it
 * leaves the server and advertises the derived JSON Schema in `tools/list`, so a
 * client can validate it too. Without one, an agent has to parse prose out of a
 * text block and guess at the shape — which is how tool calls silently produce
 * wrong numbers.
 *
 * Every tool also returns the human-readable JSON in `content`, so hosts that
 * predate structured output keep working.
 */

/** APY breakdown. All values are percentages — 4.63 means 4.63%. */
export const ApyOut = z.object({
  total: z.number().describe('Total APY as a percentage (4.63 = 4.63%)'),
  base: z.number().nullable().describe('Base APY, null if unreported'),
  reward: z
    .number()
    .nullable()
    .describe(
      'Incentive APY. null means the protocol reported nothing, which is ' +
        'different from 0 meaning it reported no incentives.'
    ),
})

/** LI.FI's vault verification signal — undocumented but present on every vault. */
export const VerificationOut = z.object({
  status: z.string().describe('"none" or "flagged"'),
  flagged: z.boolean(),
  reasons: z
    .array(z.string())
    .describe('e.g. ["zero_apy"] or ["apy_outlier"]. Empty when clean.'),
})

export const VaultSummaryOut = z.object({
  name: z.string(),
  slug: z.string().describe('Format: protocol:chainId:_:address'),
  address: z
    .string()
    .describe(
      'Vault share-token contract. Pass this as toToken (with chainId as ' +
        'toChain) to deposit via Composer.'
    ),
  chainId: z.number(),
  network: z.string(),
  protocol: z
    .string()
    .describe('Unversioned id, e.g. "morpho" not "morpho-v1"'),
  tags: z.array(z.string()),
  apy: ApyOut,
  tvlUsd: z.number(),
  underlyingTokens: z.array(z.string()),
  isTransactional: z.boolean().describe('Composer can deposit'),
  isRedeemable: z.boolean().describe('Composer can withdraw'),
  verification: VerificationOut,
})

export const VaultListOut = z.object({
  count: z.number(),
  vaults: z.array(VaultSummaryOut),
  flaggedCount: z
    .number()
    .describe('How many returned vaults LI.FI flagged as suspect'),
})

export const RiskOut = z.object({
  slug: z.string(),
  name: z.string(),
  score: z.number().describe('0-10, higher is safer'),
  label: z.string().describe('"low" (>=8), "medium" (>=6), "high" (<6)'),
  breakdown: z.object({
    tvl: z.number(),
    apyStability: z.number(),
    protocol: z.number(),
    redeemability: z.number(),
    assetType: z.number(),
    verification: z.number(),
    rewardDependency: z.number(),
  }),
  flags: z
    .array(z.string())
    .describe(
      'Plain-language concerns. Always relay these, not just the score.'
    ),
})

export const ChainListOut = z.object({
  count: z.number(),
  chains: z.array(
    z.object({
      chainId: z.number(),
      name: z.string(),
      networkCaip: z.string(),
    })
  ),
})

export const ProtocolListOut = z.object({
  count: z.number(),
  protocols: z.array(
    z.object({
      id: z.string().describe('Filter key. Unversioned — never "morpho-v1".'),
      name: z.string(),
      url: z.string(),
    })
  ),
})

export const PortfolioOut = z.object({
  positionCount: z.number(),
  totalUsd: z.number().nullable(),
  positions: z.array(
    z.object({
      chainId: z.number(),
      address: z.string().nullable().describe('Vault contract address'),
      protocolName: z.string().nullable(),
      assetSymbol: z.string(),
      balanceUsd: z.number().nullable(),
    })
  ),
})

/** Shared shape for both deposit and redeem quotes. */
export const QuoteOut = z.object({
  vault: z.string(),
  humanAmount: z.string(),
  rawAmount: z.string(),
  decimals: z.number().optional(),
  approvalAddress: z
    .string()
    .nullable()
    .describe('Pass to check-allowance as the spender before depositing'),
  estimate: z.object({
    tool: z.string().optional(),
    toAmount: z.string(),
    toAmountMin: z.string(),
    executionDuration: z.number().optional(),
  }),
  transactionRequest: z.object({
    to: z.string(),
    value: z.string().optional(),
    chainId: z.number(),
  }),
  warnings: z
    .array(z.string())
    .describe('Anything the caller must handle before signing'),
})

export const AllowanceOut = z.object({
  allowance: z.string(),
  requiredAmount: z.string(),
  sufficient: z.boolean(),
  approvalTx: z
    .object({
      to: z.string(),
      data: z.string(),
      chainId: z.number(),
    })
    .nullable()
    .describe('Present only when the allowance is insufficient'),
})

export const AllocationOut = z.object({
  totalAmount: z.number(),
  expectedApy: z.number().describe('Weighted APY as a percentage'),
  excludedFlagged: z
    .boolean()
    .describe('Whether verification-flagged vaults were filtered out'),
  allocations: z.array(
    z.object({
      vault: z.string(),
      slug: z.string(),
      chainId: z.number(),
      protocol: z.string(),
      percentage: z.number(),
      amount: z.number(),
      apy: z.number(),
      riskScore: z.number(),
      riskLabel: z.string(),
    })
  ),
})

export const DoctorOut = z.object({
  ok: z.boolean(),
  vault: z.string(),
  slug: z.string(),
  wallet: z.string(),
  issueCount: z.number(),
  issues: z.array(
    z.object({
      code: z.string(),
      message: z.string(),
      severity: z.string(),
    })
  ),
  riskScore: z.number(),
  riskLabel: z.string(),
  verification: VerificationOut,
})

export const DriftOut = z.object({
  ok: z.boolean().describe('False only when our schema disagrees with the API'),
  checkedVaults: z.number(),
  specFetched: z.boolean(),
  findings: z.array(
    z.object({
      severity: z.string(),
      field: z.string(),
      between: z
        .string()
        .describe(
          'live-vs-schema is our bug; live-vs-spec is a LI.FI docs bug'
        ),
      message: z.string(),
    })
  ),
})
