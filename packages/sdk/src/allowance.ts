// SPDX-License-Identifier: Apache-2.0

import { assertAddress, encodeAddressArg } from './address.js'
import { EarnForgeError } from './errors.js'

/**
 * ERC-20 allowance checking and approval transaction building.
 *
 * Uses the standard ERC-20 ABI for allowance() and approve().
 * Works with any EVM JSON-RPC provider via raw fetch. No viem dependency required.
 * The approval address comes from the Composer quote's estimate.approvalAddress.
 */

export interface AllowanceResult {
  allowance: bigint
  sufficient: boolean
  requiredAmount: bigint
  /**
   * Why the allowance could not be read, when it could not be read.
   *
   * A failed read reports `allowance: 0n, sufficient: false`, which is the
   * safe direction but the wrong fact: "the RPC is unreachable" and "this
   * wallet has approved nothing" produced identical results, so a caller
   * behind a dead node prompted for an approval it already had. Callers that
   * ignore this field still fail closed; callers that check it can tell the
   * difference and say so.
   */
  error?: string
}

export interface ApprovalTx {
  to: string
  data: string
  value: '0x0'
  chainId: number
}

// ERC-20 function signatures
const ALLOWANCE_SELECTOR = '0xdd62ed3e' // allowance(address,address)
const APPROVE_SELECTOR = '0x095ea7b3' // approve(address,uint256)

/**
 * Check the ERC-20 allowance for a token.
 *
 * @param rpcUrl - JSON-RPC endpoint for the chain
 * @param tokenAddress - ERC-20 token contract address
 * @param owner - Wallet address (token holder)
 * @param spender - Address to check allowance for (from quote.estimate.approvalAddress)
 * @param requiredAmount - Amount needed in smallest unit
 */
export async function checkAllowance(
  rpcUrl: string,
  tokenAddress: string,
  owner: string,
  spender: string,
  requiredAmount: bigint
): Promise<AllowanceResult> {
  // Encode allowance(owner, spender) call
  assertAddress(tokenAddress, 'token')
  const ownerPadded = encodeAddressArg(owner, 'owner')
  const spenderPadded = encodeAddressArg(spender, 'spender')
  const calldata = `${ALLOWANCE_SELECTOR}${ownerPadded}${spenderPadded}`

  const res = await globalThis.fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'eth_call',
      params: [{ to: tokenAddress, data: calldata }, 'latest'],
      id: 1,
    }),
  })

  const json = (await res.json()) as {
    result?: string
    error?: { message: string }
  }
  if (json.error || !json.result) {
    return {
      allowance: 0n,
      sufficient: false,
      requiredAmount,
      error: json.error?.message ?? 'RPC returned no result',
    }
  }

  // `eth_call` against an address with no code returns `0x` rather than an
  // error, and `BigInt('0x')` throws a bare SyntaxError. A mistyped token
  // address therefore crashed the caller instead of reporting a bad address.
  if (!/^0x[0-9a-fA-F]+$/.test(json.result)) {
    return {
      allowance: 0n,
      sufficient: false,
      requiredAmount,
      error:
        `Expected a uint256 from allowance(), got "${json.result}". ` +
        `Is ${tokenAddress} an ERC-20 contract on this chain?`,
    }
  }

  const allowance = BigInt(json.result)
  return {
    allowance,
    sufficient: allowance >= requiredAmount,
    requiredAmount,
  }
}

/**
 * Build an ERC-20 approve transaction.
 *
 * @param tokenAddress - ERC-20 token contract
 * @param spender - Address to approve (from quote.estimate.approvalAddress)
 * @param amount - Amount to approve in smallest unit (use MaxUint256 for unlimited)
 * @param chainId - Chain ID for the transaction
 */
export function buildApprovalTx(
  tokenAddress: string,
  spender: string,
  amount: bigint,
  chainId: number
): ApprovalTx {
  assertAddress(tokenAddress, 'token')
  const spenderPadded = encodeAddressArg(spender, 'spender')

  // Range-checked for the same reason addresses are: `padStart` pads, it never
  // rejects. A negative amount produced a literal `-` inside the calldata
  // (`…00000-1`), and anything above MaxUint256 produced a 65-character word
  // that shifted every byte after it while still looking like a valid hex
  // string. Both were reachable straight from `earnforge approve --amount`,
  // and both exited 0.
  if (amount < 0n) {
    throw new EarnForgeError(
      `Approval amount cannot be negative: ${amount}. ` +
        'ERC-20 allowances are uint256. To remove an allowance, approve 0.',
      'INVALID_AMOUNT'
    )
  }
  if (amount > MAX_UINT256) {
    throw new EarnForgeError(
      `Approval amount ${amount} exceeds uint256. ` +
        `The maximum is MAX_UINT256 (${MAX_UINT256}).`,
      'INVALID_AMOUNT'
    )
  }

  const amountHex = amount.toString(16).padStart(64, '0')
  const data = `${APPROVE_SELECTOR}${spenderPadded}${amountHex}`

  return {
    to: tokenAddress,
    data,
    value: '0x0',
    chainId,
  }
}

/** MaxUint256 for unlimited approval */
export const MAX_UINT256: bigint = 2n ** 256n - 1n
