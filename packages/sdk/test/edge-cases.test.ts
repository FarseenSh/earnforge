// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect } from 'vitest';
import { VaultSchema, VaultListResponseSchema, parseTvl, getBestApy, AnalyticsSchema } from '../src/schemas/index.js';
import { riskScore } from '../src/risk-scorer.js';
import { preflight } from '../src/preflight.js';
import { toSmallestUnit, fromSmallestUnit } from '../src/build-deposit-quote.js';
import vaultsBase from '../../fixtures/src/vaults-base.json';
import vaultsEthereum from '../../fixtures/src/vaults-ethereum.json';

describe('Edge cases — comprehensive', () => {
  const baseParsed = VaultListResponseSchema.parse(vaultsBase);
  const ethParsed = VaultListResponseSchema.parse(vaultsEthereum);

  describe('UNIBTC vault — empty underlyingTokens', () => {
    const unibtc = baseParsed.data.find((v) => v.name === 'UNIBTC');

    it('exists in Base vaults', () => {
      expect(unibtc).toBeDefined();
    });

    it('has empty underlyingTokens array', () => {
      expect(unibtc!.underlyingTokens).toHaveLength(0);
    });

    it('risk score still computes', () => {
      const score = riskScore(unibtc!);
      expect(score.score).toBeGreaterThanOrEqual(0);
      expect(score.score).toBeLessThanOrEqual(10);
    });

    it('preflight warns about missing tokens', () => {
      const report = preflight(unibtc!, '0x1');
      expect(report.issues.some((i) => i.code === 'NO_UNDERLYING_TOKENS')).toBe(true);
    });
  });

  describe('Zero-APY vaults', () => {
    it('handles vault with 0 APY', () => {
      const zeroApy = baseParsed.data.find((v) => v.analytics.apy.total === 0);
      if (zeroApy) {
        const score = riskScore(zeroApy);
        expect(score.score).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe('Description field presence', () => {
    it('most Base vaults have no description', () => {
      const withDesc = baseParsed.data.filter((v) => v.description !== undefined);
      expect(withDesc.length).toBeLessThan(baseParsed.data.length / 2);
    });

    it('most ETH vaults have no description', () => {
      const withDesc = ethParsed.data.filter((v) => v.description !== undefined);
      expect(withDesc.length).toBeLessThan(ethParsed.data.length / 2);
    });
  });

  describe('Cross-fixture consistency', () => {
    it('both Base and ETH fixtures have valid vault data', () => {
      expect(baseParsed.data.length).toBe(50);
      expect(ethParsed.data.length).toBe(50);
    });

    it('Base vaults all have chainId 8453', () => {
      for (const v of baseParsed.data) {
        expect(v.chainId).toBe(8453);
      }
    });

    it('ETH vaults all have chainId 1', () => {
      for (const v of ethParsed.data) {
        expect(v.chainId).toBe(1);
      }
    });
  });

  describe('TVL parsing across fixtures', () => {
    it('all ETH vault TVLs parse to valid numbers', () => {
      for (const v of ethParsed.data) {
        const tvl = parseTvl(v.analytics.tvl);
        expect(tvl.parsed).toBeGreaterThanOrEqual(0);
        expect(Number.isFinite(tvl.parsed)).toBe(true);
      }
    });
  });

  describe('Amount conversion edge cases', () => {
    it('handles amount "0.1" with 18 decimals', () => {
      expect(toSmallestUnit('0.1', 18)).toBe('100000000000000000');
    });

    it('roundtrip: smallest → human → smallest', () => {
      const human = fromSmallestUnit('1500000', 6);
      expect(human).toBe('1.5');
      expect(toSmallestUnit(human, 6)).toBe('1500000');
    });

    it('handles 0 decimals', () => {
      expect(toSmallestUnit('42', 0)).toBe('42');
      expect(fromSmallestUnit('42', 0)).toBe('42');
    });
  });
});
