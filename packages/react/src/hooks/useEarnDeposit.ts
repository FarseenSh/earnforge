// SPDX-License-Identifier: Apache-2.0
import { useState, useCallback, useRef } from 'react'
import type {
  Vault,
  PreflightReport,
  DepositQuoteResult,
  AllowanceResult,
  ApprovalTx,
} from '@earnforge/sdk'
import {
  checkAllowance,
  buildApprovalTx,
  MAX_UINT256,
  toSmallestUnit,
} from '@earnforge/sdk'
import { useEarnForge } from '../context.js'

/**
 * Deposit state machine:
 *
 *   idle --> preflight --> checking-allowance --> approving --> quoting --> ready --> sending --> success
 *     \         |               |                   |            |          |          |
 *      \________|_______________|___________________|____________|__________|__________|-->  error
 *
 * The "checking-allowance" phase verifies the ERC-20 allowance for the fromToken.
 * If allowance is insufficient, "approving" sends an approval tx before quoting.
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
  /** JSON-RPC URL for the source chain — needed for allowance checking */
  rpcUrl?: string
  /** wagmi's sendTransactionAsync function — pass from useSendTransaction() */
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
      if (abortRef.current) return

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

      // Phase: checking-allowance (if rpcUrl and fromToken are provided)
      const fromToken =
        params.fromToken ?? params.vault.underlyingTokens[0]?.address
      let allowanceResult: AllowanceResult | null = null
      let approval: ApprovalTx | null = null

      if (params.rpcUrl && fromToken) {
        setState({
          ...INITIAL_STATE,
          phase: 'checking-allowance',
          preflightReport: report,
        })

        const decimals = params.vault.underlyingTokens[0]?.decimals ?? 18
        const requiredAmount = BigInt(toSmallestUnit(params.amount, decimals))

        // Spender = vault address (Composer routes through vault contract)
        allowanceResult = await checkAllowance(
          params.rpcUrl,
          fromToken,
          params.wallet,
          params.vault.address,
          requiredAmount
        )
        if (abortRef.current) return

        // If allowance insufficient, build approval tx and wait for it
        if (!allowanceResult.sufficient) {
          approval = buildApprovalTx(
            fromToken,
            params.vault.address,
            MAX_UINT256,
            params.vault.chainId
          )

          setState({
            ...INITIAL_STATE,
            phase: 'approving',
            preflightReport: report,
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
            if (abortRef.current) return
          } else {
            // Cannot auto-approve without sendTransactionAsync — expose the tx for manual sending
            // The caller should check state.approvalTx and handle it
            return
          }
        }
      }

      // Phase: quoting
      setState({
        ...INITIAL_STATE,
        phase: 'quoting',
        preflightReport: report,
        allowance: allowanceResult,
        approvalTx: approval,
      })

      const quote = await sdk.buildDepositQuote(params.vault, {
        fromAmount: params.amount,
        wallet: params.wallet,
        fromToken: params.fromToken,
        fromChain: params.fromChain,
        slippage: params.slippage,
      })
      if (abortRef.current) return

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
      if (abortRef.current) return
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
