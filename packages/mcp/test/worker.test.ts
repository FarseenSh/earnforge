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

  it('serves a 2025-era initialize, so older hosts keep working', async () => {
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

/**
 * The `2026-07-28` revision, exercised over the real Worker fetch handler.
 *
 * This is the part that could not be verified before the spec was final: the
 * previous server was *designed* for the stateless model but made no
 * compliance claim, because nothing could check one. These assertions are that
 * check — they read the actual bytes the Worker puts on the wire.
 *
 * A modern request is distinguished purely by carrying the per-request `_meta`
 * envelope; without it the handler routes to the 2025-era path instead, which
 * is what the `initialize` test above covers.
 */
describe('MCP 2026-07-28 over the Worker', () => {
  const env: Env = { LIFI_API_KEY: 'test-key' }

  const ENVELOPE = {
    'io.modelcontextprotocol/protocolVersion': '2026-07-28',
    'io.modelcontextprotocol/clientCapabilities': {},
    'io.modelcontextprotocol/clientInfo': { name: 'test', version: '1.0.0' },
  }

  async function rpc(method: string, params: Record<string, unknown> = {}) {
    const res = await worker.fetch(
      new Request('https://x/mcp', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json, text/event-stream',
          // SEP-2243 requires the standard request headers on Streamable HTTP.
          'mcp-method': method,
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method,
          params: { ...params, _meta: ENVELOPE },
        }),
      }),
      env
    )
    expect(res.status).toBe(200)
    return (await res.json()) as {
      result?: Record<string, unknown>
      error?: { code: number; message: string }
    }
  }

  it('implements server/discover and advertises the revision', async () => {
    // The spec makes this a MUST — it is how a client selects an era without
    // the `initialize` handshake that no longer exists.
    const { result } = await rpc('server/discover')
    expect(result?.supportedVersions).toContain('2026-07-28')
    expect(result?.capabilities).toMatchObject({ tools: {}, resources: {} })
  })

  it('identifies the server in result _meta, not the result body', async () => {
    // Spec PR #3002 moved serverInfo out of the DiscoverResult body. Asserting
    // the location catches a regression to the pre-final shape.
    const { result } = await rpc('server/discover')
    expect(
      (result?._meta as Record<string, unknown>)?.[
        'io.modelcontextprotocol/serverInfo'
      ]
    ).toMatchObject({ name: 'earnforge-mcp' })
  })

  it('marks every result complete rather than input-required', async () => {
    // `resultType` is required on all results as of this revision; a client
    // treating a missing value as `complete` only works for older servers.
    for (const method of ['server/discover', 'tools/list', 'resources/list']) {
      const { result } = await rpc(method)
      expect(result?.resultType, method).toBe('complete')
    }
  })

  it('returns cache hints on every list result', async () => {
    // SEP-2549 requires ttlMs and cacheScope on list results so clients can
    // cache instead of polling.
    for (const method of ['tools/list', 'resources/list']) {
      const { result } = await rpc(method)
      expect(typeof result?.ttlMs, `${method} ttlMs`).toBe('number')
      expect(['public', 'private']).toContain(result?.cacheScope)
    }
  })

  /**
   * Read a list off a result, failing the assertion rather than throwing a
   * TypeError when the RPC returned an error instead of a result.
   */
  function listOf(
    res: { result?: Record<string, unknown> },
    key: string
  ): unknown[] {
    const value = res.result?.[key]
    return Array.isArray(value) ? value : []
  }

  it('serves all twelve tools and the skill resources on the modern wire', async () => {
    expect(listOf(await rpc('tools/list'), 'tools')).toHaveLength(12)

    const resources = listOf(await rpc('resources/list'), 'resources')
    expect(resources.map((r) => (r as { uri: string }).uri)).toContain(
      'skill://earnforge/SKILL.md'
    )
  })

  it('needs no session id — two requests share no server state', async () => {
    // Statelessness is the property that makes a Worker viable at all. If any
    // per-connection state survived, the second call would need the first.
    const a = listOf(await rpc('tools/list'), 'tools')
    const b = listOf(await rpc('tools/list'), 'tools')
    expect(a).toHaveLength(12)
    expect(b).toHaveLength(a.length)
  })
})
