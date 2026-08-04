// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest'
import pkg from '../package.json' with { type: 'json' }
import { createServer } from '../src/server.js'
import { SERVER_VERSION } from '../src/version.js'

/**
 * `serverInfo.version` was hardcoded to '1.0.0' in two places and stayed there
 * across three releases, so the hosted Worker told every client it was 1.0.0
 * while npm served 1.0.2. Nothing caught it because the literal agreed with
 * itself everywhere it appeared — the only thing it disagreed with was
 * package.json, which nothing compared it to.
 */
describe('server version', () => {
  it('is read from package.json rather than written out', () => {
    expect(SERVER_VERSION).toBe(pkg.version)
  })

  it('is what the server actually advertises to clients', () => {
    const server = createServer({ apiKey: 'test-key' })

    // Reaching into `_serverInfo` deliberately: what a client receives is the
    // only thing that matters, and asserting the exported constant alone would
    // still pass if it stopped being wired in. No public accessor exposes it,
    // so this is unguarded on purpose — if the field is ever renamed the test
    // should fail loudly rather than quietly skip, which is how the hardcoded
    // version survived three releases in the first place.
    const info = (server as unknown as { server: { _serverInfo: unknown } })
      .server._serverInfo as { name: string; version: string }

    expect(info, 'McpServer no longer exposes _serverInfo').toBeDefined()
    expect(info.name).toBe('earnforge-mcp')
    expect(info.version).toBe(pkg.version)
  })
})
