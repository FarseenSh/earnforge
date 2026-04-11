// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect } from 'vitest';
import { toSmallestUnit, fromSmallestUnit } from '../src/build-deposit-quote.js';

describe('toSmallestUnit (Pitfall #9 — decimal mismatch)', () => {
  it('converts 1 USDC (6 decimals) to 1000000', () => {
    expect(toSmallestUnit('1', 6)).toBe('1000000');
  });

  it('converts 1 ETH (18 decimals) to 1000000000000000000', () => {
    expect(toSmallestUnit('1', 18)).toBe('1000000000000000000');
  });

  it('converts 0.5 USDC to 500000', () => {
    expect(toSmallestUnit('0.5', 6)).toBe('500000');
  });

  it('converts 100 USDC to 100000000', () => {
    expect(toSmallestUnit('100', 6)).toBe('100000000');
  });

  it('handles amounts with more decimals than token (truncates)', () => {
    expect(toSmallestUnit('1.123456789', 6)).toBe('1123456');
  });

  it('handles whole numbers with no decimal', () => {
    expect(toSmallestUnit('500', 6)).toBe('500000000');
  });

  it('handles 0', () => {
    expect(toSmallestUnit('0', 6)).toBe('0');
  });

  it('handles very small amounts', () => {
    expect(toSmallestUnit('0.000001', 6)).toBe('1');
  });
});

describe('fromSmallestUnit', () => {
  it('converts 1000000 to 1 USDC', () => {
    expect(fromSmallestUnit('1000000', 6)).toBe('1');
  });

  it('converts 500000 to 0.5 USDC', () => {
    expect(fromSmallestUnit('500000', 6)).toBe('0.5');
  });

  it('converts 1 to 0.000001 USDC', () => {
    expect(fromSmallestUnit('1', 6)).toBe('0.000001');
  });

  it('converts 0 to 0', () => {
    expect(fromSmallestUnit('0', 6)).toBe('0');
  });
});
