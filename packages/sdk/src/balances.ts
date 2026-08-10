// SPDX-License-Identifier: Apache-2.0

/**
 * Native and ERC-20 balance reads.
 *
 * `preflight()` is deliberately pure — it checks whatever balances you hand it
 * and skips the rest. That is the right shape for a browser caller, which
 * already has balances from wagmi and should not pay for a second round trip.
 * It is the wrong shape for a CLI, which has no wallet connection and was
 * therefore calling `preflight()` with no balances at all: the gas check and
 * the token check never ran, and every wallet came back `ok: true`.
 *
 * This supplies the missing inputs. Raw `fetch` against JSON-RPC, matching
 * `allowance.ts`, so the SDK stays free of a viem dependency.
 */

/** `balanceOf(address)` */
const BALANCE_OF_SELECTOR = '0x70a08231'

/**
 * Fallback RPC per Earn chain.
 *
 * The CLI previously defaulted to `https://rpc.li.fi/v1/chain/{id}`, which does
 * not resolve — the host has no DNS record at all. `earnforge allowance` was
 * therefore broken out of the box and only worked if you passed `--rpc`, and
 * the failure surfaced as a bare "fetch failed".
 *
 * Every URL below was verified by calling `eth_chainId` and confirming the
 * reply matched the key, which is the check that would have caught the original
 * mistake. Robinhood Chain (4663) is deliberately absent: no public endpoint
 * answered, and a guess here is exactly what caused this bug. Callers should
 * always be able to override with their own RPC — these are a floor, not a
 * recommendation, and public endpoints rate-limit.
 */
const DEFAULT_RPC_URLS: Record<number, string> = {
  1: 'https://ethereum-rpc.publicnode.com',
  10: 'https://mainnet.optimism.io',
  56: 'https://bsc-dataseed.binance.org',
  100: 'https://rpc.gnosischain.com',
  137: 'https://polygon-bor-rpc.publicnode.com',
  143: 'https://rpc.monad.xyz',
  999: 'https://rpc.hyperliquid.xyz/evm',
  5000: 'https://rpc.mantle.xyz',
  8453: 'https://mainnet.base.org',
  9745: 'https://rpc.plasma.to',
  42161: 'https://arb1.arbitrum.io/rpc',
  42220: 'https://forno.celo.org',
  43114: 'https://api.avax.network/ext/bc/C/rpc',
  59144: 'https://rpc.linea.build',
  98866: 'https://rpc.plume.org',
  747474: 'https://rpc.katana.network',
}

/**
 * A public RPC for a chain, or `undefined` when none is known.
 *
 * Returning `undefined` rather than a guessed URL lets callers say "pass
 * --rpc" instead of failing with a DNS error the user cannot interpret.
 */
export function defaultRpcUrl(chainId: number): string | undefined {
  return DEFAULT_RPC_URLS[chainId]
}

export interface WalletBalances {
  /** Native gas token, in wei. */
  native: bigint
  /** ERC-20 balance in the token's smallest unit; absent if no token was asked for. */
  token?: bigint
}

async function rpc(
  rpcUrl: string,
  method: string,
  params: unknown[]
): Promise<string> {
  const res = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  })
  if (!res.ok) {
    throw new Error(`RPC ${method} failed: HTTP ${res.status}`)
  }
  const body = (await res.json()) as {
    result?: string
    error?: { message?: string }
  }
  if (body.error) {
    throw new Error(`RPC ${method} failed: ${body.error.message ?? 'unknown'}`)
  }
  return body.result ?? '0x0'
}

/**
 * Read a wallet's native balance, and optionally one ERC-20 balance.
 *
 * @param rpcUrl - JSON-RPC endpoint for the chain the vault is on
 * @param wallet - Address to read
 * @param tokenAddress - ERC-20 to read alongside the native balance
 */
export async function fetchWalletBalances(
  rpcUrl: string,
  wallet: string,
  tokenAddress?: string
): Promise<WalletBalances> {
  const native = BigInt(await rpc(rpcUrl, 'eth_getBalance', [wallet, 'latest']))

  if (!tokenAddress) {
    return { native }
  }

  // The zero address is how the API denotes the native token, and it is not an
  // ERC-20 — calling balanceOf on it returns empty rather than a balance.
  if (/^0x0{40}$/i.test(tokenAddress)) {
    return { native, token: native }
  }

  const data =
    BALANCE_OF_SELECTOR + wallet.slice(2).toLowerCase().padStart(64, '0')
  const raw = await rpc(rpcUrl, 'eth_call', [
    { to: tokenAddress, data },
    'latest',
  ])

  return { native, token: raw && raw !== '0x' ? BigInt(raw) : 0n }
}
