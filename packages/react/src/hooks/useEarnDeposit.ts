// SPDX-License-Identifier: Apache-2.0

import type {
  AllowanceResult,
  ApprovalTx,
  DepositQuoteResult,
  PreflightReport,
  Vault,
} from '@earnforge/sdk'
import { buildApprovalTx, checkAllowance, MAX_UINT256 } from '@earnforge/sdk'
import { useCallback, useRef, useState } from 'react'
import { useEarnForge } from '../context.js'

/**
 * Deposit state machine:
 *
 *   idle --> preflight --> quoting --> checking-allowance --> approving --> ready --> sending --> success
 *     \         |             |              |                   |           |          |
 *      \________|_____________|______________|___________________|___________|__________|-->  error
 *
 * Quoting precedes the allowance check because the spender to approve is
 * `quote.estimate.approvalAddress`, which only exists once the quote does.
 * "checking-allowance" reads the ERC-20 allowance for that spender; if it is
 * insufficient, "approving" sends an approval tx before the deposit is ready.
 */
export type DepositPhase =
  | 'idle'
  | 'preflight'
  | 'checking-allowance'
  | 'approving'
  | 'quoting'
  | 'ready'
  | 'sending'
  | 'success'
  | 'error'

export interface DepositState {
  phase: DepositPhase
  preflightReport: PreflightReport | null
  allowance: AllowanceResult | null
  approvalTx: ApprovalTx | null
  quote: DepositQuoteResult | null
  txHash: string | null
  error: Error | null
}

export interface UseEarnDepositParams {
  vault: Vault | undefined
  amount: string
  wallet: string
  fromToken?: string
  fromChain?: number
  slippage?: number
  /** JSON-RPC URL for the source chain: needed for allowance checking */
  rpcUrl?: string
  /**
   * Approve MaxUint256 instead of exactly what this deposit needs.
   *
   * Saves an approval on every later deposit of the same token, at the cost of
   * leaving a standing allowance the spender can draw on until it is revoked.
   * Off by default: the convenience is the caller's to opt into, not ours to
   * assume on their behalf.
   */
  unlimitedApproval?: boolean
  /** wagmi's sendTransactionAsync function: pass from useSendTransaction() */
  sendTransactionAsync?: (params: {
    to: `0x${string}`
    data: `0x${string}`
    value: bigint
    chainId: number
  }) => Promise<`0x${string}`>
}

export interface UseEarnDepositReturn {
  state: DepositState
  /** Kick off the preflight -> quote -> ready flow */
  prepare: () => Promise<void>
  /** Execute the deposit transaction (requires sendTransactionAsync or sendTransaction) */
  execute: () => Promise<void>
  /** Reset back to idle */
  reset: () => void
}

const INITIAL_STATE: DepositState = {
  phase: 'idle',
  preflightReport: null,
  allowance: null,
  approvalTx: null,
  quote: null,
  txHash: null,
  error: null,
}

/**
 * Deposit state machine hook.
 *
 * Flow: idle -> preflight -> quoting -> ready
 * Then call `execute()` to send: ready -> sending -> success
 *
 * ```tsx
 * const { state, prepare, execute, reset } = useEarnDeposit({
 *   vault,
 *   amount: '100',
 *   wallet: address,
 *   sendTransactionAsync,
 * });
 * ```
 */
export function useEarnDeposit(
  params: UseEarnDepositParams
): UseEarnDepositReturn {
  const sdk = useEarnForge()
  const [state, setState] = useState<DepositState>(INITIAL_STATE)
  const abortRef = useRef(false)

  const prepare = useCallback(async () => {
    if (!params.vault || !params.wallet || !params.amount) {
      setState({
        ...INITIAL_STATE,
        phase: 'error',
        error: new Error('Missing vault, wallet, or amount'),
      })
      return
    }

    abortRef.current = false

    try {
      // Phase: preflight
      setState({ ...INITIAL_STATE, phase: 'preflight' })

      const report = sdk.preflight(params.vault, params.wallet)
      if (abortRef.current) {
        return
      }

      if (!report.ok) {
        setState({
          ...INITIAL_STATE,
          phase: 'error',
          preflightReport: report,
          error: new Error(
            `Preflight failed: ${report.issues.map((i) => i.message).join('; ')}`
          ),
        })
        return
      }

      // Phase: quoting
      //
      // Quoting comes before the allowance check, and the order is the whole
      // point. The spender for an ERC-20 approval is
      // `quote.estimate.approvalAddress` — LI.FI's router — which does not
      // exist until the quote does. This hook used to check and approve first
      // and hardcode the vault address as the spender, which was wrong twice:
      // it granted an allowance to a contract that never needed one, and the
      // deposit then still failed because the router it does need was never
      // approved. Every other surface (CLI, MCP, SKILL.md, the SDK's own
      // JSDoc) already said to use `approvalAddress`; only this file didn't.
      setState({
        ...INITIAL_STATE,
        phase: 'quoting',
        preflightReport: report,
      })

      const quote = await sdk.buildDepositQuote(params.vault, {
        fromAmount: params.amount,
        wallet: params.wallet,
        fromToken: params.fromToken,
        fromChain: params.fromChain,
        slippage: params.slippage,
      })
      if (abortRef.current) {
        return
      }

      // Phase: checking-allowance (needs an rpcUrl to read the chain)
      let allowanceResult: AllowanceResult | null = null
      let approval: ApprovalTx | null = null

      // Absent when the source asset is native: there is nothing to approve.
      const spender = quote.quote.estimate.approvalAddress
      // The token actually being spent, as resolved by the quote. Reading it
      // back from the quote rather than re-deriving it is what keeps the
      // decimals right: `rawAmount` is computed against the matching token,
      // not blindly against `underlyingTokens[0]`.
      const fromToken = quote.quote.action.fromToken.address

      if (params.rpcUrl && spender && fromToken) {
        setState({
          ...INITIAL_STATE,
          phase: 'checking-allowance',
          preflightReport: report,
          quote,
        })

        const requiredAmount = BigInt(quote.rawAmount)

        allowanceResult = await checkAllowance(
          params.rpcUrl,
          fromToken,
          params.wallet,
          spender,
          requiredAmount
        )
        if (abortRef.current) {
          return
        }

        // A read that failed is not a read that returned zero. Approving on a
        // failed read would send an approval the wallet may not need, to a
        // spender we could not verify.
        if (allowanceResult.error) {
          setState({
            ...INITIAL_STATE,
            phase: 'error',
            preflightReport: report,
            quote,
            allowance: allowanceResult,
            error: new Error(
              `Could not read the ERC-20 allowance: ${allowanceResult.error}`
            ),
          })
          return
        }

        // If allowance insufficient, build approval tx and wait for it
        if (!allowanceResult.sufficient) {
          approval = buildApprovalTx(
            fromToken,
            spender,
            // Exact by default. An unlimited allowance outlives the deposit and
            // lets the spender move that token until it is revoked, so it is
            // opt-in rather than the silent default it used to be.
            params.unlimitedApproval ? MAX_UINT256 : requiredAmount,
            quote.quote.action.fromChainId
          )

          setState({
            ...INITIAL_STATE,
            phase: 'approving',
            preflightReport: report,
            quote,
            allowance: allowanceResult,
            approvalTx: approval,
          })

          // Send approval tx if sendTransactionAsync is available
          const sendFn = params.sendTransactionAsync
          if (sendFn) {
            await sendFn({
              to: approval.to as `0x${string}`,
              data: approval.data as `0x${string}`,
              value: 0n,
              chainId: approval.chainId,
            })
            if (abortRef.current) {
              return
            }
          } else {
            // Cannot auto-approve without sendTransactionAsync: expose the tx for manual sending
            // The caller should check state.approvalTx and handle it
            return
          }
        }
      }

      // Phase: ready
      setState({
        ...INITIAL_STATE,
        phase: 'ready',
        preflightReport: report,
        allowance: allowanceResult,
        approvalTx: approval,
        quote,
      })
    } catch (err) {
      if (abortRef.current) {
        return
      }
      setState({
        ...INITIAL_STATE,
        phase: 'error',
        error: err instanceof Error ? err : new Error(String(err)),
      })
    }
  }, [
    sdk,
    params.vault,
    params.wallet,
    params.amount,
    params.fromToken,
    params.fromChain,
    params.slippage,
    params.rpcUrl,
    params.sendTransactionAsync,
  ])

  const execute = useCallback(async () => {
    if (state.phase !== 'ready' || !state.quote) {
      setState((prev) => ({
        ...prev,
        phase: 'error',
        error: new Error(
          'Cannot execute: not in ready state. Call prepare() first.'
        ),
      }))
      return
    }

    const sendFn = params.sendTransactionAsync
    if (!sendFn) {
      setState((prev) => ({
        ...prev,
        phase: 'error',
        error: new Error(
          'No sendTransactionAsync provided. Pass it from wagmi useSendTransaction().'
        ),
      }))
      return
    }

    try {
      setState((prev) => ({ ...prev, phase: 'sending' }))

      const tx = state.quote.quote.transactionRequest
      const hash = await sendFn({
        to: tx.to as `0x${string}`,
        data: tx.data as `0x${string}`,
        value: BigInt(tx.value),
        chainId: tx.chainId,
      })

      setState((prev) => ({
        ...prev,
        phase: 'success',
        txHash: hash,
      }))
    } catch (err) {
      setState((prev) => ({
        ...prev,
        phase: 'error',
        error: err instanceof Error ? err : new Error(String(err)),
      }))
    }
  }, [state.phase, state.quote, params.sendTransactionAsync])

  const reset = useCallback(() => {
    abortRef.current = true
    setState(INITIAL_STATE)
  }, [])

  return { state, prepare, execute, reset }
}
