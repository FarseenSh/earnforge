// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from 'vitest';
import { runDoctorChecks, formatDoctorReport, runEnvChecks, formatEnvReport } from '../src/doctor.js';
import { makeVault, makeNonTransactionalVault, makeHighRiskVault } from './fixtures.js';

describe('runDoctorChecks', () => {
  it('runs 18 checks total', () => {
    const vault = makeVault();
    const report = runDoctorChecks(vault, { hasApiKey: true });
    expect(report.total).toBe(18);
    expect(report.checks).toHaveLength(18);
  });

  it('all checks pass for a healthy vault with API key', () => {
    const vault = makeVault();
    const report = runDoctorChecks(vault, { hasApiKey: true });
    expect(report.passed).toBe(18);
    expect(report.failed).toBe(0);
  });

  it('fails pitfall #3 when no API key', () => {
    const vault = makeVault();
    const report = runDoctorChecks(vault, { hasApiKey: false });
    const check3 = report.checks.find((c) => c.id === 3);
    expect(check3?.passed).toBe(false);
    expect(check3?.detail).toContain('NOT set');
  });

  it('fails pitfall #13 for non-transactional vault', () => {
    const vault = makeNonTransactionalVault();
    const report = runDoctorChecks(vault, { hasApiKey: true });
    const check13 = report.checks.find((c) => c.id === 13);
    expect(check13?.passed).toBe(false);
  });

  it('fails pitfall #14 for non-redeemable vault', () => {
    const vault = makeNonTransactionalVault(); // also not redeemable
    const report = runDoctorChecks(vault, { hasApiKey: true });
    const check14 = report.checks.find((c) => c.id === 14);
    expect(check14?.passed).toBe(false);
  });

  it('fails pitfall #15 for empty underlyingTokens', () => {
    const vault = makeNonTransactionalVault();
    const report = runDoctorChecks(vault, { hasApiKey: true });
    const check15 = report.checks.find((c) => c.id === 15);
    expect(check15?.passed).toBe(false);
    expect(check15?.detail).toContain('EMPTY');
  });

  it('fails pitfall #9 for vaults with no underlyingTokens', () => {
    const vault = makeNonTransactionalVault();
    const report = runDoctorChecks(vault, { hasApiKey: true });
    const check9 = report.checks.find((c) => c.id === 9);
    expect(check9?.passed).toBe(false);
  });

  it('detects high APY as suspicious for pitfall #7', () => {
    const vault = makeHighRiskVault(); // apy.total = 0.9 which is valid
    const report = runDoctorChecks(vault, { hasApiKey: true });
    const check7 = report.checks.find((c) => c.id === 7);
    expect(check7?.passed).toBe(true); // 0.9 < 5, looks like a fraction
  });

  it('flags impossibly high APY values', () => {
    const vault = makeVault({
      analytics: {
        apy: { base: 100, total: 500, reward: 400 },
        tvl: { usd: '1000000' },
        apy1d: null,
        apy7d: null,
        apy30d: null,
        updatedAt: '2026-04-11T12:00:00Z',
      },
    });
    const report = runDoctorChecks(vault, { hasApiKey: true });
    const check7 = report.checks.find((c) => c.id === 7);
    expect(check7?.passed).toBe(false);
  });

  it('includes risk score in report', () => {
    const vault = makeVault();
    const report = runDoctorChecks(vault, { hasApiKey: true });
    expect(report.riskScore).toBeDefined();
    expect(report.riskScore!.score).toBeGreaterThan(0);
    expect(report.riskScore!.label).toBeDefined();
  });

  it('handles null APY fields (pitfall #18)', () => {
    const vault = makeVault({
      analytics: {
        apy: { base: 0.04, total: 0.05, reward: 0.01 },
        tvl: { usd: '50000000' },
        apy1d: null,
        apy7d: null,
        apy30d: null,
        updatedAt: '2026-04-11T12:00:00Z',
      },
    });
    const report = runDoctorChecks(vault, { hasApiKey: true });
    const check18 = report.checks.find((c) => c.id === 18);
    expect(check18?.passed).toBe(true);
    expect(check18?.detail).toContain('apy1d');
    expect(check18?.detail).toContain('apy7d');
    expect(check18?.detail).toContain('apy30d');
  });
});

describe('formatDoctorReport', () => {
  it('produces string output with OK/FAIL markers', () => {
    const vault = makeVault();
    const report = runDoctorChecks(vault, { hasApiKey: true });
    const output = formatDoctorReport(report, vault.name);
    expect(output).toContain('OK');
    expect(output).toContain('Doctor');
    expect(output).toContain('Summary');
    expect(output).toContain('Risk Score');
  });

  it('shows FAIL markers for failing checks', () => {
    const vault = makeNonTransactionalVault();
    const report = runDoctorChecks(vault, { hasApiKey: false });
    const output = formatDoctorReport(report);
    expect(output).toContain('FAIL');
    expect(output).toContain('failed');
  });
});

describe('runEnvChecks', () => {
  it('returns env-only checks', () => {
    const report = runEnvChecks();
    expect(report.total).toBeGreaterThan(0);
    expect(report.checks.length).toBeGreaterThan(0);
  });

  it('checks Node.js version', () => {
    const report = runEnvChecks();
    const nodeCheck = report.checks.find((c) => c.pitfall === 'Node.js version');
    expect(nodeCheck).toBeDefined();
    expect(nodeCheck!.passed).toBe(true); // We are running on Node 18+
  });
});

describe('formatEnvReport', () => {
  it('produces readable output', () => {
    const report = runEnvChecks();
    const output = formatEnvReport(report);
    expect(output).toContain('Environment');
    expect(output).toContain('Summary');
  });
});
