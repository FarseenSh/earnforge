// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from 'vitest';
import { fmtPct, fmtUsd, riskLabelPlain } from '../src/helpers.js';

describe('fmtPct', () => {
  it('formats a percentage value as a string (API returns percentages, not fractions)', () => {
    expect(fmtPct(3.84)).toBe('3.84%');
    expect(fmtPct(12.34)).toBe('12.34%');
    expect(fmtPct(0)).toBe('0.00%');
    expect(fmtPct(100)).toBe('100.00%');
  });
});

describe('fmtUsd', () => {
  it('formats billions', () => {
    expect(fmtUsd(2_500_000_000)).toBe('$2.50B');
  });

  it('formats millions', () => {
    expect(fmtUsd(50_000_000)).toBe('$50.00M');
  });

  it('formats thousands', () => {
    expect(fmtUsd(1_234)).toBe('$1.23K');
  });

  it('formats small values', () => {
    expect(fmtUsd(42.5)).toBe('$42.50');
  });
});

describe('riskLabelPlain', () => {
  it('returns low for score >= 7', () => {
    expect(riskLabelPlain(7)).toContain('low');
    expect(riskLabelPlain(9.5)).toContain('low');
  });

  it('returns medium for score 4-6.9', () => {
    expect(riskLabelPlain(5)).toContain('medium');
  });

  it('returns high for score < 4', () => {
    expect(riskLabelPlain(2)).toContain('high');
  });
});
