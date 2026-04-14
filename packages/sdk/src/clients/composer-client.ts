// SPDX-License-Identifier: Apache-2.0
import { ComposerError } from '../errors.js'
import { withRetry, type RetryOptions } from '../retry.js'
import { QuoteResponseSchema, type QuoteResponse } from '../schemas/index.js'

/**
 * Composer base URL — li.quest (Pitfall #1).
 * Requires x-lifi-api-key header (Pitfall #3).
 * Endpoint is GET, not POST (Pitfall #4).
 */
const DEFAULT_BASE_URL = 'https://li.quest'

export interface ComposerClientOptions {
  apiKey: string
  baseUrl?: string
  retry?: RetryOptions
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
}

export class ComposerClient {
  private readonly baseUrl: string
  private readonly apiKey: string
  private readonly retryOpts: RetryOptions

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
  }

  /**
   * Get a deposit/swap/bridge quote.
   * Uses GET, not POST (Pitfall #4).
   * Sends x-lifi-api-key header (Pitfall #3).
   */
  async getQuote(params: QuoteParams): Promise<QuoteResponse> {
    return withRetry(async () => {
      const searchParams = new URLSearchParams({
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
