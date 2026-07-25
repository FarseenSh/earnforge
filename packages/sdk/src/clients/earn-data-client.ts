// SPDX-License-Identifier: Apache-2.0

import { LRUCache } from '../cache.js'
import {
  EarnApiError,
  type EarnApiFieldError,
  MissingApiKeyError,
} from '../errors.js'
import { TokenBucketRateLimiter } from '../rate-limiter.js'
import { type RetryOptions, withRetry } from '../retry.js'
import {
  type Chain,
  ChainListResponseSchema,
  type PortfolioResponse,
  PortfolioResponseSchema,
  type ProtocolDetail,
  ProtocolListResponseSchema,
  parseVaultSlug,
  type Vault,
  type VaultListResponse,
  VaultListResponseSchema,
  VaultSchema,
} from '../schemas/index.js'

/**
 * Earn Data API base URL — earn.li.fi, distinct from Composer's li.quest.
 *
 * Paths dropped the `/earn` segment in Apr 2026: `/v1/earn/vaults` is now
 * `/v1/vaults`. The old paths return 404, not a redirect.
 */
const DEFAULT_BASE_URL = 'https://earn.li.fi'

/**
 * Maximum page size the API accepts. The default is 50; requesting 100 halves
 * the number of round trips needed to walk the full vault set.
 */
const MAX_PAGE_SIZE = 100

export interface EarnDataClientOptions {
  /**
   * LI.FI API key. Required — the Earn Data API 401s without one. Falls back
   * to `process.env.LIFI_API_KEY` when omitted.
   */
  apiKey?: string
  baseUrl?: string
  cache?: { ttl?: number; maxSize?: number }
  rateLimiter?: { maxPerMinute?: number }
  retry?: RetryOptions
}

export interface VaultListParams {
  chainId?: number
  asset?: string
  protocol?: string
  minTvl?: number
  sortBy?: string
  cursor?: string
  limit?: number
  /** Only vaults Composer can deposit into */
  isTransactional?: boolean
  /** Only vaults Composer can withdraw from */
  isRedeemable?: boolean
  /** Only vaults with full end-to-end Composer support */
  isComposerSupported?: boolean
}

/** Extract field-level errors from a 400 body, if present. */
function parseFieldErrors(body: string): EarnApiFieldError[] {
  try {
    const parsed = JSON.parse(body) as { errors?: EarnApiFieldError[] }
    return Array.isArray(parsed.errors) ? parsed.errors : []
  } catch {
    return []
  }
}

/** Human-readable summary of a structured error body. */
function describeError(status: number, body: string): string {
  const fields = parseFieldErrors(body)
  if (fields.length > 0) {
    const detail = fields
      .map((f) => `${f.path.join('.') || '(root)'}: ${f.message}`)
      .join('; ')
    return `${status} validation failed — ${detail}`
  }
  try {
    const parsed = JSON.parse(body) as { message?: string }
    if (parsed.message) {
      return `${status} ${parsed.message}`
    }
  } catch {
    // fall through to the raw body
  }
  return `${status} ${body}`.trim()
}

export class EarnDataClient {
  private readonly apiKey: string
  private readonly baseUrl: string
  private readonly cache: LRUCache<unknown>
  private readonly rateLimiter: TokenBucketRateLimiter
  private readonly retryOpts: RetryOptions

  constructor(options: EarnDataClientOptions = {}) {
    const key =
      options.apiKey ??
      (typeof process !== 'undefined'
        ? process.env?.LIFI_API_KEY
        : undefined) ??
      ''
    if (!key) {
      throw new MissingApiKeyError()
    }
    this.apiKey = key
    this.baseUrl = options.baseUrl ?? DEFAULT_BASE_URL
    this.cache = new LRUCache(options.cache)
    this.rateLimiter = new TokenBucketRateLimiter(
      options.rateLimiter?.maxPerMinute ?? 100
    )
    this.retryOpts = options.retry ?? {}
  }

  /**
   * Low-level fetch with auth, rate limiting, caching and retry.
   * The `x-lifi-api-key` header is mandatory on every Earn Data API call.
   */
  private async fetch<T>(
    path: string,
    cacheKey: string,
    parse: (data: unknown) => T
  ): Promise<T> {
    const cached = this.cache.get(cacheKey) as T | undefined
    if (cached !== undefined) {
      return cached
    }

    await this.rateLimiter.acquireAsync()

    const result = await withRetry(async () => {
      const url = `${this.baseUrl}${path}`
      const res = await globalThis.fetch(url, {
        headers: { 'x-lifi-api-key': this.apiKey },
      })
      if (!res.ok) {
        const body = await res.text().catch(() => '')
        throw new EarnApiError(
          `Earn API error: ${describeError(res.status, body)}`,
          res.status,
          url,
          parseFieldErrors(body)
        )
      }
      const json = await res.json()
      return parse(json)
    }, this.retryOpts)

    this.cache.set(cacheKey, result)
    return result
  }

  /** Fetch a single page of vaults */
  async listVaults(params: VaultListParams = {}): Promise<VaultListResponse> {
    const searchParams = new URLSearchParams()
    if (params.chainId !== undefined) {
      searchParams.set('chainId', String(params.chainId))
    }
    if (params.asset) {
      searchParams.set('asset', params.asset)
    }
    if (params.protocol) {
      searchParams.set('protocol', params.protocol)
    }
    if (params.minTvl !== undefined) {
      searchParams.set('minTvlUsd', String(params.minTvl))
    }
    if (params.sortBy) {
      searchParams.set('sortBy', params.sortBy)
    }
    if (params.cursor) {
      searchParams.set('cursor', params.cursor)
    }
    searchParams.set('limit', String(params.limit ?? MAX_PAGE_SIZE))
    if (params.isTransactional !== undefined) {
      searchParams.set('isTransactional', String(params.isTransactional))
    }
    if (params.isRedeemable !== undefined) {
      searchParams.set('isRedeemable', String(params.isRedeemable))
    }
    if (params.isComposerSupported !== undefined) {
      searchParams.set(
        'isComposerSupported',
        String(params.isComposerSupported)
      )
    }

    const qs = searchParams.toString()
    const path = `/v1/vaults${qs ? `?${qs}` : ''}`
    return this.fetch(path, `vaults:${qs}`, (data) =>
      VaultListResponseSchema.parse(data)
    )
  }

  /**
   * Async iterator over every vault, auto-paginating via `nextCursor`.
   * `nextCursor` is absent from the JSON on the final page, so the loop must
   * treat missing and null identically.
   */
  async *listAllVaults(
    params: Omit<VaultListParams, 'cursor'> = {}
  ): AsyncIterable<Vault> {
    let cursor: string | undefined
    do {
      const response = await this.listVaults({ ...params, cursor })
      for (const vault of response.data) {
        yield vault
      }
      cursor = response.nextCursor ?? undefined
    } while (cursor)
  }

  /**
   * Get a single vault by chainId + address.
   * chainId must be the numeric id — a chain name returns 400.
   */
  async getVault(chainId: number, address: string): Promise<Vault> {
    if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
      throw new EarnApiError(
        `Invalid vault address format: "${address}"`,
        400,
        address
      )
    }
    const path = `/v1/vaults/${chainId}/${encodeURIComponent(address)}`
    return this.fetch(path, `vault:${chainId}:${address}`, (data) =>
      VaultSchema.parse(data)
    )
  }

  /**
   * Get a vault by slug. Live slugs look like
   * `morpho:8453:_:0xee8f...`; the legacy `8453-0xee8f...` form is also
   * accepted so stored slugs keep resolving.
   */
  async getVaultBySlug(slug: string): Promise<Vault> {
    const parsed = parseVaultSlug(slug)
    if (!parsed) {
      throw new EarnApiError(
        `Invalid slug format: "${slug}". Expected ` +
          '"protocol:chainId:_:address".',
        400,
        slug
      )
    }
    return this.getVault(parsed.chainId, parsed.address)
  }

  /** List chains that have at least one indexed vault */
  async listChains(): Promise<Chain[]> {
    return this.fetch('/v1/chains', 'chains', (data) =>
      ChainListResponseSchema.parse(data)
    )
  }

  /** List protocols that have at least one indexed vault */
  async listProtocols(): Promise<ProtocolDetail[]> {
    return this.fetch('/v1/protocols', 'protocols', (data) =>
      ProtocolListResponseSchema.parse(data)
    )
  }

  /** Get portfolio positions for a wallet */
  async getPortfolio(walletAddress: string): Promise<PortfolioResponse> {
    if (!/^0x[0-9a-fA-F]{40}$/.test(walletAddress)) {
      throw new EarnApiError(
        `Invalid wallet address format: "${walletAddress}"`,
        400,
        walletAddress
      )
    }
    const path = `/v1/portfolio/${walletAddress}/positions`
    return this.fetch(path, `portfolio:${walletAddress}`, (data) =>
      PortfolioResponseSchema.parse(data)
    )
  }

  /** Rate limiter remaining tokens */
  get rateLimitRemaining(): number {
    return this.rateLimiter.remaining
  }

  /** Clear cache */
  clearCache(): void {
    this.cache.clear()
  }
}
