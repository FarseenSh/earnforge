// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest'
import worker, { type Env } from '../src/worker.js'

/**
 * The Worker entry is what makes the server hostable, so it needs coverage
 * independent of the MCP protocol tests — a broken health check or a leaked key
 * would not show up there.
 */
describe('Cloudflare Worker entry', () => {
  const env: Env = { LIFI_API_KEY: 'test-key' }

  it('answers a health probe without needing a key', async () => {
    const res = await worker.fetch(new Request('https://x/health'), {} as Env)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toMatchObject({ ok: true, server: 'earnforge-mcp' })
  })

  it('handles CORS preflight', async () => {
    const res = await worker.fetch(
      new Request('https://x/mcp', { method: 'OPTIONS' }),
      env
    )
    expect(res.status).toBe(204)
    expect(res.headers.get('access-control-allow-methods')).toContain('POST')
  })

  it('404s anything that is not /mcp', async () => {
    const res = await worker.fetch(new Request('https://x/other'), env)
    expect(res.status).toBe(404)
  })

  it('refuses to serve without an API key, and says where to get one', async () => {
    const res = await worker.fetch(new Request('https://x/mcp'), {} as Env)
    expect(res.status).toBe(500)
    const body = (await res.json()) as { error: string }
    expect(body.error).toMatch(/portal\.li\.fi/)
  })

  it('serves an MCP initialize over Streamable HTTP', async () => {
    const res = await worker.fetch(
      new Request('https://x/mcp', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json, text/event-stream',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: {
            protocolVersion: '2025-06-18',
            capabilities: {},
            clientInfo: { name: 'test', version: '1.0.0' },
          },
        }),
      }),
      env
    )
    expect(res.status).toBe(200)
    const text = await res.text()
    expect(text).toContain('earnforge-mcp')
  })

  it('never echoes the server key back to the caller', async () => {
    const res = await worker.fetch(new Request('https://x/health'), env)
    expect(await res.text()).not.toContain('test-key')
  })
})
