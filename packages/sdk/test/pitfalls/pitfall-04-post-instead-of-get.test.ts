// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect, vi } from 'vitest';
import { ComposerClient } from '../../src/clients/index.js';

describe('Pitfall #4: POST instead of GET on /v1/quote', () => {
  it('ComposerClient uses GET for quote requests', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        type: 'lifi',
        id: 'test',
        tool: 'composer',
        action: {
          fromToken: { address: '0x1', chainId: 1, symbol: 'USDC', decimals: 6, name: 'USDC' },
          fromAmount: '1000000',
          toToken: { address: '0x2', chainId: 1, symbol: 'vault', decimals: 18, name: 'Vault' },
          fromChainId: 8453,
          toChainId: 8453,
          slippage: 0.005,
          fromAddress: '0x1',
          toAddress: '0x1',
        },
        estimate: {
          tool: 'composer',
          toAmountMin: '1000000',
          toAmount: '1000000',
          fromAmount: '1000000',
          executionDuration: 30,
        },
        transactionRequest: {
          to: '0x1',
          data: '0x',
          value: '0x0',
          chainId: 8453,
        },
      }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const client = new ComposerClient({ apiKey: 'test' });
    await client.getQuote({
      fromChain: 8453,
      toChain: 8453,
      fromToken: '0x1',
      toToken: '0x2',
      fromAddress: '0x3',
      toAddress: '0x3',
      fromAmount: '1000000',
    });

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/v1/quote'),
      expect.objectContaining({ method: 'GET' }),
    );
    vi.unstubAllGlobals();
  });
});
