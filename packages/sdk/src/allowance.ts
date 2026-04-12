// SPDX-License-Identifier: Apache-2.0

/**
 * ERC-20 allowance checking and approval transaction building.
 *
 * Uses the standard ERC-20 ABI for allowance() and approve().
 * Works with any EVM JSON-RPC provider via raw fetch — no viem dependency required.
 * The approval address comes from the Composer quote's estimate.approvalAddress.
 */

export interface AllowanceResult {
  allowance: bigint;
  sufficient: boolean;
  requiredAmount: bigint;
}

export interface ApprovalTx {
  to: string;
  data: string;
  value: '0x0';
  chainId: number;
}

// ERC-20 function signatures
const ALLOWANCE_SELECTOR = '0xdd62ed3e'; // allowance(address,address)
const APPROVE_SELECTOR = '0x095ea7b3';   // approve(address,uint256)

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
  requiredAmount: bigint,
): Promise<AllowanceResult> {
  // Encode allowance(owner, spender) call
  const ownerPadded = owner.slice(2).toLowerCase().padStart(64, '0');
  const spenderPadded = spender.slice(2).toLowerCase().padStart(64, '0');
  const calldata = `${ALLOWANCE_SELECTOR}${ownerPadded}${spenderPadded}`;

  const res = await globalThis.fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'eth_call',
      params: [{ to: tokenAddress, data: calldata }, 'latest'],
      id: 1,
    }),
  });

  const json = (await res.json()) as { result?: string; error?: { message: string } };
  if (json.error || !json.result) {
    return { allowance: 0n, sufficient: false, requiredAmount };
  }

  const allowance = BigInt(json.result);
  return {
    allowance,
    sufficient: allowance >= requiredAmount,
    requiredAmount,
  };
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
  chainId: number,
): ApprovalTx {
  const spenderPadded = spender.slice(2).toLowerCase().padStart(64, '0');
  const amountHex = amount.toString(16).padStart(64, '0');
  const data = `${APPROVE_SELECTOR}${spenderPadded}${amountHex}`;

  return {
    to: tokenAddress,
    data,
    value: '0x0',
    chainId,
  };
}

/** MaxUint256 for unlimited approval */
export const MAX_UINT256 = 2n ** 256n - 1n;
