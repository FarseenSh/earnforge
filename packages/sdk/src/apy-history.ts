// SPDX-License-Identifier: Apache-2.0

export interface ApyDataPoint {
  timestamp: string;
  apy: number;
  tvlUsd: number;
}

/**
 * Fetch 30-day APY history from DeFiLlama's free yields API.
 * Maps LI.FI vault address + chainId to DeFiLlama pool UUID.
 *
 * DeFiLlama API: GET https://yields.llama.fi/pools
 * Chart API: GET https://yields.llama.fi/chart/{poolId}
 */
export async function getApyHistory(
  vaultAddress: string,
  chainId: number,
): Promise<ApyDataPoint[]> {
  try {
    // Step 1: Find the DeFiLlama pool UUID by matching address
    const poolsRes = await globalThis.fetch('https://yields.llama.fi/pools');
    if (!poolsRes.ok) return [];

    const poolsData = (await poolsRes.json()) as { data: Array<{ pool: string; chain: string; project: string; underlyingTokens: string[]; symbol: string }> };
    const chainName = CHAIN_ID_TO_LLAMA[chainId];
    if (!chainName) return [];

    const pool = poolsData.data.find(
      (p) =>
        p.pool.toLowerCase().includes(vaultAddress.toLowerCase()) ||
        p.underlyingTokens?.some((t: string) => t.toLowerCase() === vaultAddress.toLowerCase()),
    );

    if (!pool) return [];

    // Step 2: Fetch chart data
    const chartRes = await globalThis.fetch(`https://yields.llama.fi/chart/${pool.pool}`);
    if (!chartRes.ok) return [];

    const chartData = (await chartRes.json()) as { data: Array<{ timestamp: string; apy: number; tvlUsd: number }> };
    return (chartData.data ?? []).slice(-30).map((d) => ({
      timestamp: d.timestamp,
      apy: d.apy ?? 0,
      tvlUsd: d.tvlUsd ?? 0,
    }));
  } catch {
    return [];
  }
}

const CHAIN_ID_TO_LLAMA: Record<number, string> = {
  1: 'Ethereum',
  10: 'Optimism',
  56: 'BSC',
  100: 'Gnosis',
  137: 'Polygon',
  146: 'Sonic',
  5000: 'Mantle',
  8453: 'Base',
  42161: 'Arbitrum',
  42220: 'Celo',
  43114: 'Avalanche',
  59144: 'Linea',
  80094: 'Berachain',
};
