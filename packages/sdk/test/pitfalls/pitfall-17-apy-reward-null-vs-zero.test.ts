// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect } from 'vitest';
import { ApySchema, VaultListResponseSchema } from '../../src/schemas/index.js';
import vaultsBase from '../../../fixtures/src/vaults-base.json';

describe('Pitfall #17: apy.reward null vs 0', () => {
  it('Morpho returns reward: 0 — preserved as 0', () => {
    const apy = ApySchema.parse({ base: 3.5, total: 3.5, reward: 0 });
    expect(apy.reward).toBe(0);
  });

  it('Euler/Aave returns reward: null — normalized to 0', () => {
    const apy = ApySchema.parse({ base: 3.5, total: 3.5, reward: null });
    expect(apy.reward).toBe(0);
  });

  it('all vaults in real fixtures have reward as number after parsing', () => {
    const parsed = VaultListResponseSchema.parse(vaultsBase);
    for (const vault of parsed.data) {
      expect(typeof vault.analytics.apy.reward).toBe('number');
    }
  });
});
