// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it, vi, beforeEach } from 'vitest';

// We need to test the singleton pattern, so we dynamically import
describe('getEarnForge', () => {
  beforeEach(() => {
    // Reset the module cache so we get a fresh singleton each test
    vi.resetModules();
  });

  it('returns an object with vaults, chains, and protocols methods', async () => {
    const { getEarnForge } = await import('@/lib/earnforge');
    const forge = getEarnForge();
    expect(forge).toBeDefined();
    expect(forge.vaults).toBeDefined();
    expect(forge.vaults.list).toBeTypeOf('function');
    expect(forge.vaults.listAll).toBeTypeOf('function');
    expect(forge.vaults.get).toBeTypeOf('function');
    expect(forge.chains).toBeDefined();
    expect(forge.chains.list).toBeTypeOf('function');
    expect(forge.protocols).toBeDefined();
    expect(forge.protocols.list).toBeTypeOf('function');
  });

  it('returns the same instance on subsequent calls (singleton)', async () => {
    const { getEarnForge } = await import('@/lib/earnforge');
    const a = getEarnForge();
    const b = getEarnForge();
    expect(a).toBe(b);
  });

  it('has riskScore method', async () => {
    const { getEarnForge } = await import('@/lib/earnforge');
    const forge = getEarnForge();
    expect(forge.riskScore).toBeTypeOf('function');
  });

  it('has suggest method', async () => {
    const { getEarnForge } = await import('@/lib/earnforge');
    const forge = getEarnForge();
    expect(forge.suggest).toBeTypeOf('function');
  });
});
