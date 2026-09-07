// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it, vi } from 'vitest'
import {
  buildApprovalTx,
  checkAllowance,
  MAX_UINT256,
} from '../src/allowance.js'

describe('checkAllowance', () => {
  it('returns sufficient=true when allowance >= required', async () => {
    // Mock: return 1000000 (1 USDC) allowance
    const mockFetch = vi.fn().mockResolvedValue({
      json: () =>
        Promise.resolve({
          result:
            '0x00000000000000000000000000000000000000000000000000000000000f4240', // 1000000
        }),
    })
    vi.stubGlobal('fetch', mockFetch)

    const result = await checkAllowance(
      'https://rpc.example.com',
      '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
      '0x1234567890abcdef1234567890abcdef12345678',
      '0x1231DEB6f5749EF6cE6943a275A1D3E7486F4EaE',
      500000n // need 0.5 USDC
    )

    expect(result.sufficient).toBe(true)
    expect(result.allowance).toBe(1000000n)
    expect(result.requiredAmount).toBe(500000n)

    // Verify the RPC call was made correctly
    expect(mockFetch).toHaveBeenCalledWith(
      'https://rpc.example.com',
      expect.objectContaining({
        method: 'POST',
      })
    )
    vi.unstubAllGlobals()
  })

  it('returns sufficient=false when allowance < required', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      json: () =>
        Promise.resolve({
          result:
            '0x0000000000000000000000000000000000000000000000000000000000000064', // 100
        }),
    })
    vi.stubGlobal('fetch', mockFetch)

    const result = await checkAllowance(
      'https://rpc.example.com',
      '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
      '0x1234567890abcdef1234567890abcdef12345678',
      '0x1231DEB6f5749EF6cE6943a275A1D3E7486F4EaE',
      1000000n
    )

    expect(result.sufficient).toBe(false)
    expect(result.allowance).toBe(100n)
    vi.unstubAllGlobals()
  })

  it('returns allowance=0 on RPC error', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ error: { message: 'execution reverted' } }),
    })
    vi.stubGlobal('fetch', mockFetch)

    const result = await checkAllowance(
      'https://rpc.example.com',
      '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
      '0x1234567890abcdef1234567890abcdef12345678',
      '0x1231DEB6f5749EF6cE6943a275A1D3E7486F4EaE',
      1000000n
    )

    expect(result.sufficient).toBe(false)
    expect(result.allowance).toBe(0n)
    vi.unstubAllGlobals()
  })

  it('encodes the correct ERC-20 allowance calldata', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ result: `0x${'0'.repeat(64)}` }),
    })
    vi.stubGlobal('fetch', mockFetch)

    await checkAllowance(
      'https://rpc.example.com',
      '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
      '0x1234567890abcdef1234567890abcdef12345678',
      '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      0n
    )

    const call = JSON.parse(mockFetch.mock.calls[0]![1].body)
    const data = call.params[0].data
    // Should start with allowance(address,address) selector
    expect(data).toMatch(/^0xdd62ed3e/)
    // Should contain owner address (padded to 32 bytes)
    expect(data).toContain('1234567890abcdef1234567890abcdef12345678')
    // Should contain spender address (padded to 32 bytes)
    expect(data.toLowerCase()).toContain(
      'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
    )
    vi.unstubAllGlobals()
  })
})

describe('buildApprovalTx', () => {
  it('builds a valid ERC-20 approve transaction', () => {
    const tx = buildApprovalTx(
      '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
      '0x1231DEB6f5749EF6cE6943a275A1D3E7486F4EaE',
      1000000n,
      8453
    )

    expect(tx.to).toBe('0x833589fcd6edb6e08f4c7c32d4f71b54bda02913')
    expect(tx.value).toBe('0x0')
    expect(tx.chainId).toBe(8453)
    // Should start with approve(address,uint256) selector
    expect(tx.data).toMatch(/^0x095ea7b3/)
    // Should contain the spender address
    expect(tx.data.toLowerCase()).toContain(
      '1231deb6f5749ef6ce6943a275a1d3e7486f4eae'
    )
  })

  it('builds unlimited approval with MAX_UINT256', () => {
    const tx = buildApprovalTx(
      '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
      '0x1231DEB6f5749EF6cE6943a275A1D3E7486F4EaE',
      MAX_UINT256,
      8453
    )

    // The amount part should be all f's (max uint256)
    expect(tx.data).toContain(
      'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff'
    )
  })
})

describe('MAX_UINT256', () => {
  it('equals 2^256 - 1', () => {
    expect(MAX_UINT256).toBe(2n ** 256n - 1n)
  })
})

describe('buildApprovalTx: amount is range-checked', () => {
  const TOKEN = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913'
  const SPENDER = '0x1231DEB6f5749EF6cE6943a275A1D3E7486F4EaE'

  // `padStart` pads, it never rejects. Both of these produced calldata that a
  // wallet would happily sign, and both were reachable from
  // `earnforge approve --amount`, which exited 0.
  it('rejects a negative amount instead of emitting "-" in calldata', () => {
    expect(() => buildApprovalTx(TOKEN, SPENDER, -1n, 8453)).toThrow(
      /cannot be negative/i
    )
  })

  it('rejects an amount above uint256 instead of shifting the ABI word', () => {
    expect(() => buildApprovalTx(TOKEN, SPENDER, 2n ** 256n, 8453)).toThrow(
      /exceeds uint256/i
    )
  })

  it('accepts the exact boundaries', () => {
    expect(buildApprovalTx(TOKEN, SPENDER, 0n, 8453).data).toMatch(
      /^0x095ea7b3[0-9a-f]{128}$/
    )
    expect(buildApprovalTx(TOKEN, SPENDER, MAX_UINT256, 8453).data).toMatch(
      /^0x095ea7b3[0-9a-f]{128}$/
    )
  })

  it('always encodes exactly two 32-byte words', () => {
    for (const amt of [0n, 1n, 10n ** 30n, MAX_UINT256]) {
      const { data } = buildApprovalTx(TOKEN, SPENDER, amt, 8453)
      expect(data.length).toBe(2 + 8 + 64 + 64)
    }
  })
})

describe('checkAllowance: a failed read is distinguishable from zero', () => {
  const TOKEN = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913'
  const OWNER = '0x1234567890abcdef1234567890abcdef12345678'
  const SPENDER = '0x1231DEB6f5749EF6cE6943a275A1D3E7486F4EaE'

  it('reports an RPC error rather than silently claiming zero', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        json: () => Promise.resolve({ error: { message: 'node unreachable' } }),
      })
    )
    const r = await checkAllowance('https://rpc.example.com', TOKEN, OWNER, SPENDER, 1n)
    expect(r.sufficient).toBe(false) // still fails closed
    expect(r.error).toMatch(/node unreachable/)
  })

  it('does not throw when the address has no code (eth_call returns "0x")', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ json: () => Promise.resolve({ result: '0x' }) })
    )
    // BigInt('0x') throws a bare SyntaxError; a mistyped token address used to
    // crash the caller instead of reporting a bad address.
    const r = await checkAllowance('https://rpc.example.com', TOKEN, OWNER, SPENDER, 1n)
    expect(r.sufficient).toBe(false)
    expect(r.error).toMatch(/ERC-20 contract/i)
  })

  it('leaves error unset on a successful read', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        json: () =>
          Promise.resolve({
            result:
              '0x00000000000000000000000000000000000000000000000000000000000f4240',
          }),
      })
    )
    const r = await checkAllowance('https://rpc.example.com', TOKEN, OWNER, SPENDER, 1n)
    expect(r.error).toBeUndefined()
    expect(r.allowance).toBe(1000000n)
  })
})
