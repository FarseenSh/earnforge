// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect } from 'vitest';
import { preflight } from '../../src/preflight.js';
import { VaultSchema } from '../../src/schemas/index.js';
import vaultSingle from '../../../fixtures/src/vault-single.json';

describe('Pitfall #12: Chain mismatch', () => {
  const vault = VaultSchema.parse(vaultSingle); // chainId 8453 (Base)

  it('preflight fails when wallet is on Ethereum (1) but vault is on Base (8453)', () => {
    const report = preflight(vault, '0x1', { walletChainId: 1 });
    expect(report.issues.some((i) => i.code === 'CHAIN_MISMATCH')).toBe(true);
  });

  it('preflight passes when wallet chain matches vault chain', () => {
    const report = preflight(vault, '0x1', { walletChainId: 8453 });
    expect(report.issues.some((i) => i.code === 'CHAIN_MISMATCH')).toBe(false);
  });
});
