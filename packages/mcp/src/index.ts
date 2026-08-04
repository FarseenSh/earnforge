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
  try {
    main()
  } catch (err) {
    console.error('EarnForge MCP server failed to start:', err)
    process.exit(1)
  }
}
