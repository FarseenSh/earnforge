// SPDX-License-Identifier: Apache-2.0
import { useState, useCallback, useRef } from 'react';
import type {
  Vault,
  PreflightReport,
  DepositQuoteResult,
} from '@earnforge/sdk';
import { useEarnForge } from '../context.js';

/**
 * Deposit state machine:
 *
 *   idle  -->  preflight  -->  quoting  -->  ready  -->  sending  -->  success
 *     \           |              |            |            |
 *      \__________|______________|____________|____________|-->  error
 */
export type DepositPhase =
  | 'idle'
  | 'preflight'
  | 'quoting'
  | 'ready'
  | 'sending'
  | 'success'
  | 'error';

export interface DepositState {
  phase: DepositPhase;
  preflightReport: PreflightReport | null;
  quote: DepositQuoteResult | null;
  txHash: string | null;
  error: Error | null;
}

export interface UseEarnDepositParams {
  vault: Vault | undefined;
  amount: string;
  wallet: string;
  fromToken?: string;
  fromChain?: number;
  slippage?: number;
  /** wagmi's sendTransactionAsync function — pass from useSendTransaction() */
  sendTransactionAsync?: (params: { to: `0x${string}`; data: `0x${string}`; value: bigint; chainId: number }) => Promise<`0x${string}`>;
}

export interface UseEarnDepositReturn {
  state: DepositState;
  /** Kick off the preflight -> quote -> ready flow */
  prepare: () => Promise<void>;
  /** Execute the deposit transaction (requires sendTransactionAsync or sendTransaction) */
  execute: () => Promise<void>;
  /** Reset back to idle */
  reset: () => void;
}

const INITIAL_STATE: DepositState = {
  phase: 'idle',
  preflightReport: null,
  quote: null,
  txHash: null,
  error: null,
};

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
export function useEarnDeposit(params: UseEarnDepositParams): UseEarnDepositReturn {
  const sdk = useEarnForge();
  const [state, setState] = useState<DepositState>(INITIAL_STATE);
  const abortRef = useRef(false);

  const prepare = useCallback(async () => {
    if (!params.vault || !params.wallet || !params.amount) {
      setState({
        ...INITIAL_STATE,
        phase: 'error',
        error: new Error('Missing vault, wallet, or amount'),
      });
      return;
    }

    abortRef.current = false;

    try {
      // Phase: preflight
      setState({ ...INITIAL_STATE, phase: 'preflight' });

      const report = sdk.preflight(params.vault, params.wallet);
      if (abortRef.current) return;

      if (!report.ok) {
        setState({
          ...INITIAL_STATE,
          phase: 'error',
          preflightReport: report,
          error: new Error(
            `Preflight failed: ${report.issues.map((i) => i.message).join('; ')}`,
          ),
        });
        return;
      }

      // Phase: quoting
      setState({
        ...INITIAL_STATE,
        phase: 'quoting',
        preflightReport: report,
      });

      const quote = await sdk.buildDepositQuote(params.vault, {
        fromAmount: params.amount,
        wallet: params.wallet,
        fromToken: params.fromToken,
        fromChain: params.fromChain,
        slippage: params.slippage,
      });
      if (abortRef.current) return;

      // Phase: ready
      setState({
        ...INITIAL_STATE,
        phase: 'ready',
        preflightReport: report,
        quote,
      });
    } catch (err) {
      if (abortRef.current) return;
      setState({
        ...INITIAL_STATE,
        phase: 'error',
        error: err instanceof Error ? err : new Error(String(err)),
      });
    }
  }, [sdk, params.vault, params.wallet, params.amount, params.fromToken, params.fromChain, params.slippage]);

  const execute = useCallback(async () => {
    if (state.phase !== 'ready' || !state.quote) {
      setState((prev) => ({
        ...prev,
        phase: 'error',
        error: new Error('Cannot execute: not in ready state. Call prepare() first.'),
      }));
      return;
    }

    const sendFn = params.sendTransactionAsync;
    if (!sendFn) {
      setState((prev) => ({
        ...prev,
        phase: 'error',
        error: new Error('No sendTransactionAsync provided. Pass it from wagmi useSendTransaction().'),
      }));
      return;
    }

    try {
      setState((prev) => ({ ...prev, phase: 'sending' }));

      const tx = state.quote.quote.transactionRequest;
      const hash = await sendFn({
        to: tx.to as `0x${string}`,
        data: tx.data as `0x${string}`,
        value: BigInt(tx.value),
        chainId: tx.chainId,
      });

      setState((prev) => ({
        ...prev,
        phase: 'success',
        txHash: hash,
      }));
    } catch (err) {
      setState((prev) => ({
        ...prev,
        phase: 'error',
        error: err instanceof Error ? err : new Error(String(err)),
      }));
    }
  }, [state.phase, state.quote, params.sendTransactionAsync]);

  const reset = useCallback(() => {
    abortRef.current = true;
    setState(INITIAL_STATE);
  }, []);

  return { state, prepare, execute, reset };
}
