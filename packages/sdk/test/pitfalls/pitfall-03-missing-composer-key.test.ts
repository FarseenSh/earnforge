// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect } from 'vitest';
import { ComposerClient } from '../../src/clients/index.js';
import { ComposerError } from '../../src/errors.js';

describe('Pitfall #3: Missing Composer API key', () => {
  it('throws ComposerError when API key is empty', () => {
    expect(() => new ComposerClient({ apiKey: '' })).toThrowError(ComposerError);
  });

  it('error message mentions LIFI_API_KEY', () => {
    try {
      new ComposerClient({ apiKey: '' });
    } catch (e) {
      expect((e as Error).message).toContain('LIFI_API_KEY');
    }
  });

  it('accepts a valid API key', () => {
    const client = new ComposerClient({ apiKey: 'test-key-123' });
    expect(client).toBeDefined();
  });
});
