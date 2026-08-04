// SPDX-License-Identifier: Apache-2.0
import {
  type ComposeCompileResult,
  type ComposeSdk,
  createComposeSdk,
  guards,
  type IntegerString,
  materialisers,
  resources,
  type ZapPackOverview,
} from '@lifi/composer-sdk'
import { EarnForgeError } from './errors.js'
import type { Vault } from './schemas/vault.js'

/**
 * Composer Flows — atomic multi-step positions, and the routing truth behind
 * them.
 *
 * Two things this exists for, neither of which the quote endpoint can do.
 *
 * **Atomicity at the received amount.** `/v1/quote` builds one step at a time,
 * so a swap-then-deposit is two transactions and the deposit has to guess what
 * the swap will return. A Flow threads the swap's `amountOut` handle straight
 * into the deposit's `amountIn`, so the exact received amount is deposited, in
 * one transaction, or nothing happens.
 *
 * **Executability.** The Earn vault list is a superset of what Composer can
 * actually route: June 2026 began ingesting protocols from DeFiLlama that have
 * no Composer routing edges at all. So a vault can be listed, carry
 * `isTransactional: true`, and still be impossible to enter. `/compose/zap-packs`
 * is the only thing that knows the difference — see {@link routableProtocols}.
 */

const DEFAULT_BASE_URL = 'https://composer.li.quest'

/** Composer's own slippage default, in basis points. */
const DEFAULT_SLIPPAGE_BPS = 100

export interface ComposerFlowsOptions {
  /** LI.FI API key. Required — the Compose API rejects anonymous callers. */
  apiKey: string
  /** Override the Compose API host. */
  baseUrl?: string
  /** Injectable for tests. */
  fetch?: typeof globalThis.fetch
}

export interface DepositFlowParams {
  /** Target vault. Its `chainId` and `address` define the destination. */
  vault: Pick<Vault, 'chainId' | 'address' | 'name'>
  /** Address that signs and receives the position. */
  wallet: string
  /** Token being spent. Omit for the chain's native asset. */
  fromToken?: string
  /** Amount of `fromToken`, in its smallest unit. */
  amount: string
  /** Slippage tolerance in basis points. Defaults to 100 (1%). */
  slippageBps?: number
  /**
   * Return calldata even when the simulation reverts, with the revert attached.
   * Off by default: a reverting deposit is a bug to surface, not to sign.
   */
  allowRevert?: boolean
}

/** What a simulated flow tells you before anything is signed. */
export interface FlowSimulation {
  /** Did the simulation execute cleanly against the current chain head? */
  ok: boolean
  /** Unsigned transaction. Present even on revert, but without a gas limit. */
  transaction: unknown
  /** Per-leg outputs observed during simulation. */
  producedResources: unknown
  /** Guaranteed minimum out, where a guard established one. */
  approvals?: unknown
  /** Populated only when `ok` is false. */
  revert?: unknown
  /** Price impact, when the router reported one. */
  priceImpact?: unknown
}

/**
 * Validate and narrow to the `0x`-prefixed literal the Composer SDK requires.
 *
 * Worth doing rather than casting: these values are interpolated into a
 * compile request that becomes signable calldata, so a malformed address
 * should fail here with a name attached, not deep inside the backend.
 */
function asAddress(value: string, label: string): `0x${string}` {
  if (!/^0x[0-9a-fA-F]{40}$/.test(value)) {
    throw new ComposerFlowError(
      `Invalid ${label} address: "${value}". Expected a 0x-prefixed 20-byte hex string.`
    )
  }
  return value as `0x${string}`
}

/** Amounts cross the wire as base-unit integer strings, never decimals. */
function asBaseUnitAmount(value: string): IntegerString {
  if (!/^\d+$/.test(value)) {
    throw new ComposerFlowError(
      `Invalid amount: "${value}". Expected an integer in the token's ` +
        'smallest unit (e.g. "1000000" for 1 USDC), not a decimal.'
    )
  }
  return value as IntegerString
}

export class ComposerFlowError extends EarnForgeError {
  constructor(
    message: string,
    public readonly cause?: unknown
  ) {
    super(message, 'COMPOSER_FLOW_ERROR')
    this.name = 'ComposerFlowError'
  }
}

/**
 * Build atomic Earn positions on the Composer API.
 *
 * Deliberately separate from `ComposerClient`, which wraps the older
 * `/v1/quote` endpoint. That endpoint is still current and still correct for
 * single-step deposits and withdrawals; Flows are for the cases it cannot
 * express. Both are exported, and neither replaces the other.
 */
export class ComposerFlows {
  private readonly sdk: ComposeSdk

  constructor(options: ComposerFlowsOptions) {
    if (!options.apiKey) {
      throw new ComposerFlowError(
        'The Compose API requires an API key during its technical preview. ' +
          'Create one at https://portal.li.fi'
      )
    }
    this.sdk = createComposeSdk({
      baseUrl: options.baseUrl ?? DEFAULT_BASE_URL,
      apiKey: options.apiKey,
      ...(options.fetch ? { fetch: options.fetch } : {}),
    })
  }

  /**
   * Swap into the vault's asset and enter the position, atomically.
   *
   * The swap's `amountOut` handle binds directly to the zap's `amountIn`, so
   * the deposit uses the exact amount received rather than an estimate made
   * before the swap ran.
   *
   * The slippage guard goes on the *zap*, not the swap: `lifi.swap`'s
   * `amountOut` port declares `providesMinimum`, because the aggregator already
   * bakes `minOut` into its own calldata. Attaching a second guard there is a
   * compile-time `guard_error`, not a belt-and-braces safety net.
   */
  async buildDepositFlow(params: DepositFlowParams): Promise<FlowSimulation> {
    const { vault, wallet, amount } = params
    const chainId = vault.chainId
    const slippageBps = params.slippageBps ?? DEFAULT_SLIPPAGE_BPS

    const inputResource = params.fromToken
      ? resources.erc20(asAddress(params.fromToken, 'fromToken'), chainId)
      : resources.native(chainId)

    const builder = this.sdk.flow(chainId, {
      name: `earnforge-deposit-${vault.address}`,
      inputs: { amountIn: inputResource },
    })

    const vaultShare = resources.erc20(
      asAddress(vault.address, 'vault'),
      chainId
    )

    const swap = builder.lifi.swap('swap', {
      bind: { amountIn: builder.inputs.amountIn },
      config: {
        resourceOut: vaultShare,
        slippage: slippageBps / 10_000,
      },
    })

    builder.lifi.zap('deposit', {
      bind: { amountIn: swap.amountOut },
      config: { resourceOut: vaultShare },
      guards: [guards.slippage({ port: 'amountOut', bps: slippageBps })],
    })

    try {
      const result = await builder.compile({
        signer: asAddress(wallet, 'wallet'),
        inputs: {
          amountIn: materialisers.directDeposit({
            amount: asBaseUnitAmount(amount),
          }),
        },
        // Anything left over returns to the caller rather than resting in the
        // user's execution proxy.
        sweepTo: builder.context.sender,
        ...(params.allowRevert
          ? { simulationPolicy: 'allow-revert' as const }
          : {}),
      })
      return toSimulation(result)
    } catch (err) {
      throw new ComposerFlowError(
        `Failed to compose a deposit into ${vault.name}: ${
          err instanceof Error ? err.message : String(err)
        }`,
        err
      )
    }
  }

  /**
   * Routing edges the Compose backend will actually execute, by protocol.
   *
   * This is the executability oracle: the Earn Data API indexes vaults, this
   * says which of them can be entered or exited.
   */
  async routingEdges(
    protocols?: string | readonly string[]
  ): Promise<readonly ZapPackOverview[]> {
    try {
      return await this.sdk.client.getZapPacks(
        protocols ? { protocols } : undefined
      )
    } catch (err) {
      throw new ComposerFlowError(
        `Failed to fetch Composer routing edges: ${
          err instanceof Error ? err.message : String(err)
        }`,
        err
      )
    }
  }

  /**
   * Whether a vault can actually be entered and exited, and on which edges.
   *
   * `isTransactional` and `isRedeemable` come from the Earn index and describe
   * intent; this describes capability. They disagree for every protocol
   * ingested from DeFiLlama, and for the deposit-only protocols where a
   * redeem quote will build happily and then fail.
   */
  async vaultRoutability(
    vault: Pick<Vault, 'chainId' | 'address' | 'protocol'>
  ): Promise<{ canEnter: boolean; canExit: boolean; edgeCount: number }> {
    const protocol = vault.protocol.id ?? vault.protocol.name
    const packs = await this.routingEdges(protocol)
    const address = vault.address.toLowerCase()

    const edges = packs
      .flatMap((p) => p.edges)
      .filter(
        (e) =>
          (e.out.address.toLowerCase() === address &&
            e.out.chainId === vault.chainId) ||
          (e.in.address.toLowerCase() === address &&
            e.in.chainId === vault.chainId)
      )

    return {
      canEnter: edges.some(
        (e) => e.type === 'enter-position' || e.type === 'mint'
      ),
      canExit: edges.some(
        (e) => e.type === 'exit-position' || e.type === 'burn'
      ),
      edgeCount: edges.length,
    }
  }
}

/** Normalise the compile result's discriminated union into one flat shape. */
function toSimulation(result: ComposeCompileResult): FlowSimulation {
  const base = {
    transaction: result.transactionRequest,
    producedResources: result.producedResources,
    approvals: result.approvals,
  }
  // `priceImpact` is only carried on the success branch — a reverting
  // simulation never got far enough to measure one.
  return result.status === 'success'
    ? { ok: true, ...base, priceImpact: result.priceImpact }
    : { ok: false, ...base, revert: result.simulationRevert }
}

/** Convenience factory mirroring `createEarnForge`. */
export function createComposerFlows(
  options: ComposerFlowsOptions
): ComposerFlows {
  return new ComposerFlows(options)
}

/**
 * Protocols with any routing edge at all.
 *
 * Useful as a one-shot filter before showing vaults a user could not act on.
 */
export function routableProtocols(
  packs: readonly ZapPackOverview[]
): Set<string> {
  return new Set(packs.filter((p) => p.edges.length > 0).map((p) => p.protocol))
}
