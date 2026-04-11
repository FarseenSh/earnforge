// SPDX-License-Identifier: Apache-2.0
import { EarnApiError } from '../errors.js';
import { TokenBucketRateLimiter } from '../rate-limiter.js';
import { LRUCache } from '../cache.js';
import { withRetry, type RetryOptions } from '../retry.js';
import {
  VaultListResponseSchema,
  VaultSchema,
  ChainListResponseSchema,
  ProtocolListResponseSchema,
  PortfolioResponseSchema,
  type Vault,
  type VaultListResponse,
  type Chain,
  type ProtocolDetail,
  type PortfolioResponse,
} from '../schemas/index.js';

/**
 * Earn Data API base URL — earn.li.fi (Pitfall #1).
 * No auth required (Pitfall #2).
 */
const DEFAULT_BASE_URL = 'https://earn.li.fi';

export interface EarnDataClientOptions {
  baseUrl?: string;
  cache?: { ttl?: number; maxSize?: number };
  rateLimiter?: { maxPerMinute?: number };
  retry?: RetryOptions;
}

export interface VaultListParams {
  chainId?: number;
  asset?: string;
  minTvl?: number;
  sortBy?: string;
  cursor?: string;
}

export class EarnDataClient {
  private readonly baseUrl: string;
  private readonly cache: LRUCache<unknown>;
  private readonly rateLimiter: TokenBucketRateLimiter;
  private readonly retryOpts: RetryOptions;

  constructor(options: EarnDataClientOptions = {}) {
    this.baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
    this.cache = new LRUCache(options.cache);
    this.rateLimiter = new TokenBucketRateLimiter(options.rateLimiter?.maxPerMinute ?? 100);
    this.retryOpts = options.retry ?? {};
  }

  /**
   * Low-level fetch with rate limiting, caching, retry.
   * No auth header — Earn Data API is public (Pitfall #2).
   */
  private async fetch<T>(path: string, cacheKey: string, parse: (data: unknown) => T): Promise<T> {
    const cached = this.cache.get(cacheKey) as T | undefined;
    if (cached !== undefined) return cached;

    await this.rateLimiter.acquireAsync();

    const result = await withRetry(async () => {
      const url = `${this.baseUrl}${path}`;
      const res = await globalThis.fetch(url);
      if (!res.ok) {
        throw new EarnApiError(
          `Earn API error: ${res.status} ${res.statusText}`,
          res.status,
          url,
        );
      }
      const json = await res.json();
      return parse(json);
    }, this.retryOpts);

    this.cache.set(cacheKey, result);
    return result;
  }

  /** Fetch a single page of vaults */
  async listVaults(params: VaultListParams = {}): Promise<VaultListResponse> {
    const searchParams = new URLSearchParams();
    if (params.chainId !== undefined) searchParams.set('chainId', String(params.chainId));
    if (params.asset) searchParams.set('asset', params.asset);
    if (params.minTvl !== undefined) searchParams.set('minTvl', String(params.minTvl));
    if (params.sortBy) searchParams.set('sortBy', params.sortBy);
    if (params.cursor) searchParams.set('cursor', params.cursor);

    const qs = searchParams.toString();
    const path = `/v1/earn/vaults${qs ? `?${qs}` : ''}`;
    return this.fetch(path, `vaults:${qs}`, (data) => VaultListResponseSchema.parse(data));
  }

  /**
   * Async iterator for all vaults with auto-pagination via nextCursor.
   * Page size is 50 (API default).
   * (Pitfall #6)
   */
  async *listAllVaults(params: Omit<VaultListParams, 'cursor'> = {}): AsyncIterable<Vault> {
    let cursor: string | undefined;
    do {
      const response = await this.listVaults({ ...params, cursor });
      for (const vault of response.data) {
        yield vault;
      }
      cursor = response.nextCursor ?? undefined;
    } while (cursor);
  }

  /**
   * Get a single vault by chainId + address.
   * chainId MUST be a number, not chain name (Pitfall — /vaults/Base/0x... returns 400).
   */
  async getVault(chainId: number, address: string): Promise<Vault> {
    const path = `/v1/earn/vaults/${chainId}/${address}`;
    return this.fetch(path, `vault:${chainId}:${address}`, (data) => VaultSchema.parse(data));
  }

  /** Get a vault by slug (e.g., "8453-0xbeef...") */
  async getVaultBySlug(slug: string): Promise<Vault> {
    const dashIdx = slug.indexOf('-');
    if (dashIdx === -1) throw new EarnApiError('Invalid slug format', 400, slug);
    const chainId = Number(slug.slice(0, dashIdx));
    const address = slug.slice(dashIdx + 1);
    if (Number.isNaN(chainId)) throw new EarnApiError('Invalid chainId in slug', 400, slug);
    return this.getVault(chainId, address);
  }

  /** List supported chains */
  async listChains(): Promise<Chain[]> {
    return this.fetch('/v1/earn/chains', 'chains', (data) => ChainListResponseSchema.parse(data));
  }

  /** List supported protocols */
  async listProtocols(): Promise<ProtocolDetail[]> {
    return this.fetch('/v1/earn/protocols', 'protocols', (data) =>
      ProtocolListResponseSchema.parse(data),
    );
  }

  /** Get portfolio positions for a wallet */
  async getPortfolio(walletAddress: string): Promise<PortfolioResponse> {
    const path = `/v1/earn/portfolio/${walletAddress}/positions`;
    return this.fetch(path, `portfolio:${walletAddress}`, (data) =>
      PortfolioResponseSchema.parse(data),
    );
  }

  /** Rate limiter remaining tokens */
  get rateLimitRemaining(): number {
    return this.rateLimiter.remaining;
  }

  /** Clear cache */
  clearCache(): void {
    this.cache.clear();
  }
}
