// SPDX-License-Identifier: Apache-2.0
import { createMcpHandler } from '@modelcontextprotocol/server'
import { createServer } from './server.js'
import { SERVER_VERSION } from './version.js'

/**
 * Cloudflare Worker entry point.
 *
 * Built on `createMcpHandler`, the v2 HTTP entry that serves the `2026-07-28`
 * revision. That revision is stateless by design — no `initialize` handshake,
 * no `Mcp-Session-Id`, every request carrying its own protocol version in
 * `_meta` — which is the shape a Worker wants anyway: no sticky routing, no
 * session store, no cold-start state to rebuild.
 *
 * The handler's default `legacy: 'stateless'` also serves 2025-era clients from
 * the same factory, so upgrading the protocol does not strand hosts that have
 * not. One endpoint, both eras, one registration path.
 *
 * The API key comes from the Worker environment, so callers never hold a LI.FI
 * credential. A caller may still pass their own via `x-lifi-api-key` to spend
 * their own rate-limit budget instead of the Worker's.
 */

export interface Env {
  /** LI.FI API key. Set with: wrangler secret put LIFI_API_KEY */
  LIFI_API_KEY?: string
}

const CORS_HEADERS: Record<string, string> = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-headers':
    'content-type, mcp-protocol-version, mcp-method, mcp-name, x-lifi-api-key',
  'access-control-expose-headers': 'mcp-protocol-version',
}

function withCors(response: Response): Response {
  const headers = new Headers(response.headers)
  for (const [key, value] of Object.entries(CORS_HEADERS)) {
    headers.set(key, value)
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

/**
 * Built once per isolate rather than per request.
 *
 * The factory itself still runs per request — that is what keeps the endpoint
 * stateless — but the handler around it is reused, which is the arrangement the
 * SDK asks for. The Worker secret only exists inside `fetch`, so construction
 * is deferred to the first request rather than hoisted to module scope.
 */
let handler: ReturnType<typeof createMcpHandler> | undefined

function getHandler(fallbackKey: string | undefined) {
  handler ??= createMcpHandler(
    ({ requestInfo }) => {
      // Read the per-caller override here, inside the factory, so one cached
      // handler still serves callers using their own keys correctly.
      const callerKey = requestInfo?.headers.get('x-lifi-api-key') ?? undefined
      return createServer({ apiKey: callerKey ?? fallbackKey })
    },
    {
      // Resolve the whole result before responding, rather than opening an SSE
      // stream and filling it afterwards.
      //
      // The default upgrades to a stream as soon as a handler might emit a
      // notification, which returns from `fetch()` in ~2ms and then performs
      // the Earn API call from the stream — after the Worker's request scope
      // has ended. Cloudflare tears that down: the client sees error 1042
      // while the Worker's own log records `outcome: ok` with no exception,
      // because from its side nothing failed.
      //
      // `tools/list` and `resources/list` were unaffected precisely because
      // they need no network, which is why the protocol looked healthy while
      // every real tool call died.
      responseMode: 'json',
    }
  )
  return handler
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
        { ok: true, server: 'earnforge-mcp', version: SERVER_VERSION },
        { headers: CORS_HEADERS }
      )
    }

    if (url.pathname !== '/mcp') {
      return Response.json(
        { error: 'Not found. The MCP endpoint is at /mcp.' },
        { status: 404, headers: CORS_HEADERS }
      )
    }

    const apiKey =
      request.headers.get('x-lifi-api-key') ?? env.LIFI_API_KEY ?? undefined

    // Checked here rather than in the factory: a missing key is a deployment
    // fault, and reporting it as a plain HTTP error is far more legible than a
    // JSON-RPC error raised from inside a tool call.
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

    // No Host/Origin guards here on purpose. Those defend a *localhost* bind
    // against DNS rebinding — a browser resolving its own domain to 127.0.0.1
    // to reach a local server as same-origin. A Worker on a public hostname has
    // no such loopback to impersonate, and this endpoint is meant to be
    // reachable cross-origin by design.
    try {
      return withCors(await getHandler(env.LIFI_API_KEY).fetch(request))
    } catch (err) {
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
