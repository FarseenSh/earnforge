// SPDX-License-Identifier: Apache-2.0
import { ComposerError } from '../errors.js'
import { TokenBucketRateLimiter } from '../rate-limiter.js'
import { type RetryOptions, withRetry } from '../retry.js'
import { type QuoteResponse, QuoteResponseSchema } from '../schemas/index.js'

/**
 * Composer base URL: li.quest (Pitfall #1).
 * Requires x-lifi-api-key header (Pitfall #3).
 * Endpoint is GET, not POST (Pitfall #4).
 */
const DEFAULT_BASE_URL = 'https://li.quest'

/**
 * Identifies the caller to LI.FI on every quote.
 *
 * `integrator` is how LI.FI attributes traffic, and the Composer response
 * echoes it back — the schema has parsed it since day one while the request
 * never sent it, so every EarnForge quote arrived anonymous. Downstream
 * projects should pass their own name rather than shipping under this one.
 */
export const DEFAULT_INTEGRATOR = 'earnforge'

/** Composer requests permitted per minute when the caller sets no ceiling. */
export const DEFAULT_COMPOSER_MAX_PER_MINUTE = 60

export interface ComposerClientOptions {
  apiKey: string
  baseUrl?: string
  retry?: RetryOptions
  /** Integrator string sent on every quote. Defaults to `earnforge`. */
  integrator?: string
  /**
   * Composer request ceiling, per minute.
   *
   * The Earn Data client has had a token bucket since the beginning; this one
   * had none, while `optimizeGasRoutes` fans out one quote per source chain
   * through `Promise.all`. Across a 17-chain fleet that is 17 simultaneous
   * requests to LI.FI's most expensive endpoint from a single user action.
   */
  maxPerMinute?: number
}

export interface QuoteParams {
  fromChain: number
  toChain: number
  fromToken: string
  toToken: string
  fromAddress: string
  toAddress: string
  fromAmount: string
  slippage?: number
  fromAmountForGas?: string
  /**
   * Request gasless execution. The response then carries signable typed data
   * instead of a `transactionRequest`, plus a `LIFI Gasless Relay Fee` entry
   * in `feeCosts`. Unserved pairs are excluded rather than refused, so this
   * can turn a working quote into a 404: probe with `probeGasless()` before
   * wiring it into a user flow. See PITFALLS.md #25.
   */
  gasless?: boolean
  /**
   * Request a destination-side deposit after the bridge leg (Smart Deposits).
   * Cross-chain EVM routes only, and `toToken` must equal the vault's
   * underlying asset. Both fields are sent together or not at all: the API
   * returns 400 if only one is present. Unlisted vaults are excluded rather
   * than refused, so probe with `probeSmartDeposit()`. See PITFALLS.md #25.
   */
  destinationAction?: { kind: 'erc4626_deposit'; vault: string }
}

export class ComposerClient {
  private readonly baseUrl: string
  private readonly apiKey: string
  private readonly retryOpts: RetryOptions
  private readonly integrator: string
  private readonly rateLimiter: TokenBucketRateLimiter

  constructor(options: ComposerClientOptions) {
    if (!options.apiKey) {
      throw new ComposerError(
        'Missing Composer API key. Set LIFI_API_KEY environment variable or pass composerApiKey to createEarnForge().',
        401
      )
    }
    this.apiKey = options.apiKey
    this.baseUrl = options.baseUrl ?? DEFAULT_BASE_URL
    this.retryOpts = options.retry ?? {}
    this.integrator = options.integrator ?? DEFAULT_INTEGRATOR
    this.rateLimiter = new TokenBucketRateLimiter(
      options.maxPerMinute ?? DEFAULT_COMPOSER_MAX_PER_MINUTE
    )
  }

  /**
   * Get a deposit/swap/bridge quote.
   * Uses GET, not POST (Pitfall #4).
   * Sends x-lifi-api-key header (Pitfall #3).
   */
  async getQuote(params: QuoteParams): Promise<QuoteResponse> {
    return withRetry(async () => {
      // Acquired inside the retry so a retried request spends a token too:
      // a burst that is being retried is exactly the burst worth throttling.
      this.rateLimiter.acquire()

      const searchParams = new URLSearchParams({
        integrator: this.integrator,
        fromChain: String(params.fromChain),
        toChain: String(params.toChain),
        fromToken: params.fromToken,
        toToken: params.toToken,
        fromAddress: params.fromAddress,
        toAddress: params.toAddress,
        fromAmount: params.fromAmount,
      })

      if (params.slippage !== undefined) {
        searchParams.set('slippage', String(params.slippage))
      }
      if (params.fromAmountForGas) {
        searchParams.set('fromAmountForGas', params.fromAmountForGas)
      }
      if (params.gasless) {
        searchParams.set('gasless', 'true')
      }
      // Sent as a pair or not at all: the API rejects a lone kind with a 400.
      if (params.destinationAction) {
        searchParams.set('destinationActionKind', params.destinationAction.kind)
        searchParams.set(
          'destinationActionVault',
          params.destinationAction.vault
        )
      }

      const url = `${this.baseUrl}/v1/quote?${searchParams.toString()}`

      // GET, not POST (Pitfall #4)
      const res = await globalThis.fetch(url, {
        method: 'GET',
        headers: {
          'x-lifi-api-key': this.apiKey,
        },
      })

      if (!res.ok) {
        const body = await res.text().catch(() => '')
        throw new ComposerError(
          `Composer error: ${res.status} ${res.statusText}. ${body}`,
          res.status
        )
      }

      const json = await res.json()
      return QuoteResponseSchema.parse(json)
    }, this.retryOpts)
  }
}
