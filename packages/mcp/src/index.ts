#!/usr/bin/env node

// SPDX-License-Identifier: Apache-2.0
import { serveStdio } from '@modelcontextprotocol/server/stdio'
import { createServer } from './server.js'

export * from './output-schemas.js'
export { registerSkillResources } from './resources.js'
export { type CreateServerOptions, createServer } from './server.js'

/**
 * Run the server over stdio — the transport local MCP clients use.
 *
 * `serveStdio` owns the era decision for the connection: the opening exchange
 * picks `2026-07-28` or the 2025 revision, one instance is pinned for the
 * connection's lifetime, and the same factory serves either. Hosts that have
 * not moved to the new revision keep working unchanged.
 */
export function main(): { close(): Promise<void> } {
  return serveStdio(() => createServer())
}

// Only auto-start when invoked as a CLI, not when imported by tests.
const entrypoint = process.argv[1] ?? ''
const isMain =
  import.meta.url === `file://${entrypoint}` ||
  entrypoint.endsWith('earnforge-mcp')

if (isMain) {
  /**
   * Check the key before serving, not while handling a request.
   *
   * `serveStdio` calls the factory lazily, per connection, so a
   * `MissingApiKeyError` from `createServer()` was thrown inside the framework's
   * `initialize` handler rather than here. The catch below never saw it and the
   * client received `{"code":-32603,"message":"Internal server error"}` — no
   * mention of a key, on the single most likely first-run mistake. The SDK's own
   * message is good; it just never reached anyone.
   */
  if (!process.env.LIFI_API_KEY?.trim()) {
    console.error(
      'EarnForge MCP: LIFI_API_KEY is not set.\n' +
        '\n' +
        'The LI.FI Earn Data API requires a key. Create one at https://portal.li.fi\n' +
        'then pass it through your MCP client config:\n' +
        '\n' +
        '  "earnforge": {\n' +
        '    "command": "npx",\n' +
        '    "args": ["-y", "@earnforge/mcp"],\n' +
        '    "env": { "LIFI_API_KEY": "your-key" }\n' +
        '  }\n' +
        '\n' +
        'Or use the hosted server, which needs no key of your own:\n' +
        '  https://earnforge-mcp.papermind-ai.workers.dev/mcp\n'
    )
    process.exit(1)
  }

  try {
    main()
  } catch (err) {
    console.error('EarnForge MCP server failed to start:', err)
    process.exit(1)
  }
}
