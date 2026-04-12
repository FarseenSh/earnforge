// SPDX-License-Identifier: Apache-2.0
import type { Vault } from './schemas/index.js';
import { LRUCache } from './cache.js';

export interface ApyDataPoint {
  timestamp: string;
  apy: number;
  tvlUsd: number;
}

export interface DeFiLlamaPool {
  pool: string;
  chain: string;
  project: string;
  symbol: string;
  tvlUsd: number;
  apy: number;
  underlyingTokens: string[] | null;
  stablecoin: boolean;
}

/**
 * DeFiLlama protocol name mapping.
 * LI.FI uses names like "morpho-v1", DeFiLlama uses the same.
 * Some need explicit mapping.
 */
const LIFI_TO_LLAMA_PROJECT: Record<string, string> = {
  'aave-v3': 'aave-v3',
  'morpho-v1': 'morpho-v1',
  'euler-v2': 'euler-v2',
  'pendle': 'pendle',
  'maple': 'maple-finance',
  'ethena-usde': 'ethena',
  'ether.fi-liquid': 'ether.fi',
  'ether.fi-stake': 'ether.fi-stake',
  'upshift': 'upshift',
  'neverland': 'neverland',
  'yo-protocol': 'yo-protocol',
};

const CHAIN_ID_TO_LLAMA: Record<number, string> = {
  1: 'Ethereum',
  10: 'Optimism',
  56: 'BSC',
  100: 'Gnosis',
  130: 'Unichain',
  137: 'Polygon',
  143: 'Monad',
  146: 'Sonic',
  5000: 'Mantle',
  8453: 'Base',
  42161: 'Arbitrum',
  42220: 'Celo',
  43114: 'Avalanche',
  59144: 'Linea',
  80094: 'Berachain',
  747474: 'Katana',
};

// Cache the full pools list — it's 10MB+ and changes infrequently
const poolsCache = new LRUCache<DeFiLlamaPool[]>({ ttl: 3_600_000, maxSize: 1 });

/**
 * Fetch the DeFiLlama pools list with caching (1 hour TTL).
 * The pools endpoint returns ~16K pools, ~10MB. We cache it to avoid
 * fetching it on every call.
 */
async function fetchPools(): Promise<DeFiLlamaPool[]> {
  const cached = poolsCache.get('all');
  if (cached) return cached;

  const res = await globalThis.fetch('https://yields.llama.fi/pools');
  if (!res.ok) return [];

  const data = (await res.json()) as { data: DeFiLlamaPool[] };
  const pools = data.data ?? [];
  poolsCache.set('all', pools);
  return pools;
}

/**
 * Match a LI.FI vault to a DeFiLlama pool.
 *
 * DeFiLlama pools have UUID IDs (not addresses). Matching strategy:
 * 1. Filter by project name (LI.FI "morpho-v1" → DeFiLlama "morpho-v1")
 * 2. Filter by chain name
 * 3. Filter by underlying token address (the deposit token)
 * 4. Match by symbol (vault name)
 * 5. If multiple matches, pick the one with closest TVL to the LI.FI vault
 */
function matchPool(
  vault: Vault,
  pools: DeFiLlamaPool[],
): DeFiLlamaPool | null {
  const chainName = CHAIN_ID_TO_LLAMA[vault.chainId];
  if (!chainName) return null;

  const llamaProject = LIFI_TO_LLAMA_PROJECT[vault.protocol.name];
  if (!llamaProject) return null;

  // Filter by project + chain
  let candidates = pools.filter(
    (p) => p.project === llamaProject && p.chain === chainName,
  );

  if (candidates.length === 0) return null;

  // Filter by underlying token if available
  if (vault.underlyingTokens.length > 0) {
    const underlyingAddr = vault.underlyingTokens[0]!.address.toLowerCase();
    const withToken = candidates.filter(
      (p) =>
        p.underlyingTokens?.some(
          (t) => t.toLowerCase() === underlyingAddr,
        ),
    );
    if (withToken.length > 0) candidates = withToken;
  }

  // Try to narrow by symbol match
  const vaultName = vault.name.toUpperCase();
  const bySymbol = candidates.filter(
    (p) => p.symbol.toUpperCase() === vaultName,
  );
  if (bySymbol.length > 0) candidates = bySymbol;

  if (candidates.length === 0) return null;

  // Pick the one with closest TVL to our vault
  const vaultTvl = Number(vault.analytics.tvl.usd);
  candidates.sort(
    (a, b) => Math.abs(a.tvlUsd - vaultTvl) - Math.abs(b.tvlUsd - vaultTvl),
  );

  return candidates[0] ?? null;
}

/**
 * Fetch 30-day APY history from DeFiLlama's free yields API.
 *
 * Properly matches LI.FI vaults to DeFiLlama pools using:
 * project name + chain + underlying tokens + symbol + TVL proximity.
 *
 * Caches the 10MB+ pools list for 1 hour to avoid repeated fetches.
 */
export async function getApyHistory(vault: Vault): Promise<ApyDataPoint[]>;
export async function getApyHistory(vaultAddress: string, chainId: number): Promise<ApyDataPoint[]>;
export async function getApyHistory(
  vaultOrAddress: Vault | string,
  chainId?: number,
): Promise<ApyDataPoint[]> {
  try {
    const pools = await fetchPools();
    if (pools.length === 0) return [];

    let pool: DeFiLlamaPool | null = null;

    if (typeof vaultOrAddress === 'string') {
      // Legacy signature: address + chainId — less accurate matching
      const chainName = CHAIN_ID_TO_LLAMA[chainId!];
      if (!chainName) return [];
      const addr = vaultOrAddress.toLowerCase();
      pool = pools.find(
        (p) =>
          p.chain === chainName &&
          p.underlyingTokens?.some((t) => t.toLowerCase() === addr),
      ) ?? null;
    } else {
      // Full vault object — accurate matching
      pool = matchPool(vaultOrAddress, pools);
    }

    if (!pool) return [];

    // Fetch chart data for the matched pool
    const chartRes = await globalThis.fetch(
      `https://yields.llama.fi/chart/${pool.pool}`,
    );
    if (!chartRes.ok) return [];

    const chartData = (await chartRes.json()) as {
      data: Array<{ timestamp: string; apy: number; tvlUsd: number }>;
    };
    return (chartData.data ?? []).slice(-30).map((d) => ({
      timestamp: d.timestamp,
      apy: d.apy ?? 0,
      tvlUsd: d.tvlUsd ?? 0,
    }));
  } catch {
    return [];
  }
}
