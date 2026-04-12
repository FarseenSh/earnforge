// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect } from 'vitest';
import { preflight } from '../src/preflight.js';
import { VaultSchema, type Vault } from '../src/schemas/index.js';
import vaultSingle from '../../fixtures/src/vault-single.json';

const vault = VaultSchema.parse(vaultSingle);
const wallet = '0x1234567890abcdef1234567890abcdef12345678';

describe('preflight', () => {
  it('passes for a healthy vault + wallet setup', () => {
    const report = preflight(vault, wallet, {
      walletChainId: 8453,
      nativeBalance: 100000000000000000n,
    });
    expect(report.ok).toBe(true);
    expect(report.issues.filter((i) => i.severity === 'error')).toHaveLength(0);
  });

  it('fails when vault is not transactional (Pitfall #13)', () => {
    const nonTx: Vault = { ...vault, isTransactional: false };
    const report = preflight(nonTx, wallet);
    expect(report.ok).toBe(false);
    expect(report.issues.some((i) => i.code === 'NOT_TRANSACTIONAL')).toBe(true);
  });

  it('warns on chain mismatch — Composer handles cross-chain (Pitfall #12)', () => {
    const report = preflight(vault, wallet, { walletChainId: 1 });
    expect(report.ok).toBe(true); // warning, not error — cross-chain is valid
    expect(report.issues.some((i) => i.code === 'CHAIN_MISMATCH' && i.severity === 'warning')).toBe(true);
  });

  it('fails when no gas token (Pitfall #11)', () => {
    const report = preflight(vault, wallet, {
      walletChainId: 8453,
      nativeBalance: 0n,
    });
    expect(report.ok).toBe(false);
    expect(report.issues.some((i) => i.code === 'NO_GAS')).toBe(true);
  });

  it('warns about empty underlyingTokens (Pitfall #15)', () => {
    const emptyUt: Vault = { ...vault, underlyingTokens: [] };
    const report = preflight(emptyUt, wallet);
    expect(report.issues.some((i) => i.code === 'NO_UNDERLYING_TOKENS')).toBe(true);
  });

  it('warns about non-redeemable vault', () => {
    const nonRedeem: Vault = { ...vault, isRedeemable: false };
    const report = preflight(nonRedeem, wallet);
    expect(report.issues.some((i) => i.code === 'NOT_REDEEMABLE')).toBe(true);
  });

  it('fails on insufficient token balance', () => {
    const report = preflight(vault, wallet, {
      walletChainId: 8453,
      nativeBalance: 100000000000000000n,
      tokenBalance: 100n,
      depositAmount: '1000',
    });
    expect(report.ok).toBe(false);
    expect(report.issues.some((i) => i.code === 'INSUFFICIENT_BALANCE')).toBe(true);
  });

  it('passes with sufficient token balance', () => {
    const report = preflight(vault, wallet, {
      walletChainId: 8453,
      nativeBalance: 100000000000000000n,
      tokenBalance: 2000000000n,
      depositAmount: '1000',
    });
    expect(report.ok).toBe(true);
  });

  it('returns vault and wallet in report', () => {
    const report = preflight(vault, wallet);
    expect(report.vault).toBe(vault);
    expect(report.wallet).toBe(wallet);
  });
});
