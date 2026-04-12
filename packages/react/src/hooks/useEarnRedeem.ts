// SPDX-License-Identifier: Apache-2.0
import { useState, useCallback, useRef } from 'react';
import type {
  Vault,
  PreflightReport,
  RedeemQuoteResult,
} from '@earnforge/sdk';
import { useEarnForge } from '../context.js';

/**
 * Redeem state machine:
 *
 *   idle  -->  preflight  -->  quoting  -->  ready  -->  sending  -->  success
 *     \           |              |            |            |
 *      \__________|______________|____________|____________|-->  error
 */
export type RedeemPhase =
  | 'idle'
  | 'preflight'
  | 'quoting'
  | 'ready'
  | 'sending'
  | 'success'
  | 'error';

export interface RedeemState {
  phase: RedeemPhase;
  preflightReport: PreflightReport | null;
  quote: RedeemQuoteResult | null;
  txHash: string | null;
  error: Error | null;
}

export interface UseEarnRedeemParams {
  vault: Vault | undefined;
  /** Amount of vault share tokens to redeem (human-readable) */
  amount: string;
  wallet: string;
  /** Token to receive. Defaults to underlying token on vault chain. */
  toToken?: string;
  /** Destination chain. Defaults to vault chain. */
  toChain?: number;
  slippage?: number;
  /** wagmi's sendTransactionAsync function — pass from useSendTransaction() */
  sendTransactionAsync?: (params: { to: `0x${string}`; data: `0x${string}`; value: bigint; chainId: number }) => Promise<`0x${string}`>;
}

export interface UseEarnRedeemReturn {
  state: RedeemState;
  /** Kick off the preflight -> quote -> ready flow */
  prepare: () => Promise<void>;
  /** Execute the redeem transaction (requires sendTransactionAsync) */
  execute: () => Promise<void>;
  /** Reset back to idle */
  reset: () => void;
}

const INITIAL_STATE: RedeemState = {
  phase: 'idle',
  preflightReport: null,
  quote: null,
  txHash: null,
  error: null,
};

/**
 * Withdrawal/redeem state machine hook.
 *
 * Flow: idle -> preflight -> quoting -> ready
 * Then call `execute()` to send: ready -> sending -> success
 *
 * ```tsx
 * const { state, prepare, execute, reset } = useEarnRedeem({
 *   vault,
 *   amount: '100',
 *   wallet: address,
 *   sendTransactionAsync,
 * });
 * ```
 */
export function useEarnRedeem(params: UseEarnRedeemParams): UseEarnRedeemReturn {
  const sdk = useEarnForge();
  const [state, setState] = useState<RedeemState>(INITIAL_STATE);
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

    if (!params.vault.isRedeemable) {
      setState({
        ...INITIAL_STATE,
        phase: 'error',
        error: new Error(`Vault ${params.vault.slug} is not redeemable — withdrawals are not supported.`),
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

      const quote = await sdk.buildRedeemQuote(params.vault, {
        fromAmount: params.amount,
        wallet: params.wallet,
        toToken: params.toToken,
        toChain: params.toChain,
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
  }, [sdk, params.vault, params.wallet, params.amount, params.toToken, params.toChain, params.slippage]);

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
