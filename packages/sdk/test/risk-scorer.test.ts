// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect } from 'vitest';
import { riskScore } from '../src/risk-scorer.js';
import { VaultSchema } from '../src/schemas/index.js';
import vaultSingle from '../../fixtures/src/vault-single.json';
import vaultsBase from '../../fixtures/src/vaults-base.json';

const steakusdc = VaultSchema.parse(vaultSingle);
const baseVaults = vaultsBase.data.map((v: unknown) => VaultSchema.parse(v));

describe('riskScore', () => {
  it('scores STEAKUSDC (Morpho, stablecoin, high TVL) as low risk', () => {
    const result = riskScore(steakusdc);
    expect(result.score).toBeGreaterThanOrEqual(7);
    expect(result.label).toBe('low');
  });

  it('returns breakdown with all dimensions', () => {
    const result = riskScore(steakusdc);
    expect(result.breakdown.tvl).toBeGreaterThan(0);
    expect(result.breakdown.apyStability).toBeGreaterThan(0);
    expect(result.breakdown.protocol).toBeGreaterThan(0);
    expect(result.breakdown.redeemability).toBeGreaterThan(0);
    expect(result.breakdown.assetType).toBeGreaterThan(0);
  });

  it('gives high tvl score to vault with $33M+ TVL', () => {
    const result = riskScore(steakusdc);
    expect(result.breakdown.tvl).toBeGreaterThanOrEqual(8);
  });

  it('gives high protocol score to Morpho', () => {
    const result = riskScore(steakusdc);
    expect(result.breakdown.protocol).toBe(9);
  });

  it('gives high asset score to stablecoin-tagged vault', () => {
    const result = riskScore(steakusdc);
    expect(result.breakdown.assetType).toBe(9);
  });

  it('gives 10 redeemability score to redeemable vault', () => {
    const result = riskScore(steakusdc);
    expect(result.breakdown.redeemability).toBe(10);
  });

  it('penalizes non-redeemable vaults', () => {
    const nonRedeemable = { ...steakusdc, isRedeemable: false };
    const result = riskScore(nonRedeemable);
    expect(result.breakdown.redeemability).toBe(3);
    expect(result.score).toBeLessThan(riskScore(steakusdc).score);
  });

  it('gives lower asset score to non-stablecoin vaults', () => {
    const nonStable = { ...steakusdc, tags: ['single'] };
    const result = riskScore(nonStable);
    expect(result.breakdown.assetType).toBe(5);
  });

  it('handles unknown protocol with default score', () => {
    const unknown = { ...steakusdc, protocol: { name: 'unknown-protocol', url: '' } };
    const result = riskScore(unknown);
    expect(result.breakdown.protocol).toBe(3);
  });

  it('score is always between 0 and 10', () => {
    for (const vault of baseVaults) {
      const result = riskScore(vault);
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(10);
    }
  });

  it('label is consistent with score', () => {
    for (const vault of baseVaults) {
      const result = riskScore(vault);
      if (result.score >= 7) expect(result.label).toBe('low');
      else if (result.score >= 4) expect(result.label).toBe('medium');
      else expect(result.label).toBe('high');
    }
  });

  it('low-TVL vault gets lower tvl score', () => {
    const lowTvl = {
      ...steakusdc,
      analytics: {
        ...steakusdc.analytics,
        tvl: { usd: '50000' },
      },
    };
    const result = riskScore(lowTvl);
    expect(result.breakdown.tvl).toBeLessThanOrEqual(3);
  });

  it('high APY divergence = lower stability score', () => {
    const volatile = {
      ...steakusdc,
      analytics: {
        ...steakusdc.analytics,
        apy: { base: 20, total: 20, reward: 0 },
        apy30d: 5,
      },
    };
    const result = riskScore(volatile);
    expect(result.breakdown.apyStability).toBeLessThanOrEqual(4);
  });

  it('stable APY = high stability score', () => {
    const stable = {
      ...steakusdc,
      analytics: {
        ...steakusdc.analytics,
        apy: { base: 3.8, total: 3.8, reward: 0 },
        apy30d: 3.7,
      },
    };
    const result = riskScore(stable);
    expect(result.breakdown.apyStability).toBeGreaterThanOrEqual(8);
  });

  it('handles vault with null apy1d and apy30d', () => {
    const nullApy = {
      ...steakusdc,
      analytics: {
        ...steakusdc.analytics,
        apy1d: null,
        apy30d: null,
      },
    };
    const result = riskScore(nullApy);
    expect(result.breakdown.apyStability).toBeTypeOf('number');
  });
});
