// SPDX-License-Identifier: Apache-2.0
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { createServer } from './server.js'

/**
 * Cloudflare Worker entry point.
 *
 * Uses the Web-standard Streamable HTTP transport, which speaks `Request` and
 * `Response` rather than Node streams — the only variant that runs on Workers.
 *
 * Deliberately stateless: a fresh transport and server per request, with no
 * session id. That matches where the protocol is heading — the `2026-07-28`
 * revision removes the `initialize` handshake and `Mcp-Session-Id` entirely, so
 * any request can land on any instance. For a Worker that is not a compromise
 * but the natural shape: no sticky routing, no shared session store, no
 * cold-start state to rebuild.
 *
 * The API key comes from the Worker environment, so callers never hold a LI.FI
 * credential. Clients may still pass their own via `x-lifi-api-key` to use their
 * own rate-limit budget.
 */

export interface Env {
  /** LI.FI API key. Set with: wrangler secret put LIFI_API_KEY */
  LIFI_API_KEY?: string
}

const CORS_HEADERS: Record<string, string> = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-headers':
    'content-type, mcp-protocol-version, x-lifi-api-key',
  'access-control-expose-headers': 'mcp-protocol-version',
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS })
    }

    // Liveness probe that does not require a key, so uptime checks stay cheap.
    if (url.pathname === '/health') {
      return Response.json(
        { ok: true, server: 'earnforge-mcp', version: '1.0.0' },
        { headers: CORS_HEADERS }
      )
    }

    if (url.pathname !== '/mcp') {
      return Response.json(
        { error: 'Not found. The MCP endpoint is at /mcp.' },
        { status: 404, headers: CORS_HEADERS }
      )
    }

    // A caller-supplied key takes precedence, so integrators can spend their own
    // rate limit rather than sharing the Worker's.
    const apiKey =
      request.headers.get('x-lifi-api-key') ?? env.LIFI_API_KEY ?? undefined

    if (!apiKey) {
      return Response.json(
        {
          error:
            'No LI.FI API key. Set LIFI_API_KEY on the Worker, or pass one as ' +
            'the x-lifi-api-key header. The Earn Data API returns 401 without ' +
            'a key — create one at https://portal.li.fi',
        },
        { status: 500, headers: CORS_HEADERS }
      )
    }

    const server = createServer({ apiKey })
    const transport = new WebStandardStreamableHTTPServerTransport({
      // Stateless: no session to resume, so any instance can serve any request.
      sessionIdGenerator: undefined,
    })

    try {
      await server.connect(transport)
      const response = await transport.handleRequest(request)

      // Deliberately no close() here. The response body may still be streaming
      // when this returns, and closing the server tears the transport down
      // mid-stream — which yields a 200 with an empty body, the most
      // confusing possible failure. The Worker's request scope ends on its
      // own, so there is nothing to release manually.
      const headers = new Headers(response.headers)
      for (const [key, value] of Object.entries(CORS_HEADERS)) {
        headers.set(key, value)
      }
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      })
    } catch (err) {
      await server.close().catch(() => {
        // Cleanup failure must not mask the original error.
      })
      return Response.json(
        {
          error: 'MCP request failed',
          detail: err instanceof Error ? err.message : String(err),
        },
        { status: 500, headers: CORS_HEADERS }
      )
    }
  },
}
