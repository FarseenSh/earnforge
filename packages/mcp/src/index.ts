#!/usr/bin/env node

// SPDX-License-Identifier: Apache-2.0

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { createServer } from './server.js'

export * from './output-schemas.js'
export { registerSkillResources } from './resources.js'
export { type CreateServerOptions, createServer } from './server.js'

/** Run the server over stdio — the transport local MCP clients use. */
export async function main(): Promise<void> {
  const server = createServer()
  const transport = new StdioServerTransport()
  await server.connect(transport)
}

// Only auto-start when invoked as a CLI, not when imported by tests.
const entrypoint = process.argv[1] ?? ''
const isMain =
  import.meta.url === `file://${entrypoint}` ||
  entrypoint.endsWith('earnforge-mcp')

if (isMain) {
  main().catch((err) => {
    console.error('EarnForge MCP server failed to start:', err)
    process.exit(1)
  })
}
