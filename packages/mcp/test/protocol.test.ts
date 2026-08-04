// SPDX-License-Identifier: Apache-2.0
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { beforeEach, describe, expect, it } from 'vitest'
import { createServer } from '../src/server.js'
import { SKILL_FILES, SKILL_INDEX } from '../src/skill-content.js'

/**
 * Protocol-surface tests: what the server advertises, rather than what any one
 * tool returns.
 *
 * These matter because the previous server declared no output schemas and no
 * annotations, so a host had no way to validate a result or to know which tools
 * were safe to auto-approve — it had to parse prose and guess.
 */
describe('MCP protocol surface', () => {
  let client: Client

  beforeEach(async () => {
    const server = createServer({ apiKey: 'test-key' })
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair()
    client = new Client({ name: 'test', version: '1.0.0' })
    await Promise.all([
      server.connect(serverTransport),
      client.connect(clientTransport),
    ])
  })

  describe('tools', () => {
    it('advertises all twelve tools', async () => {
      const { tools } = await client.listTools()
      expect(tools.map((t) => t.name).sort()).toEqual([
        'check-allowance',
        'check-api-drift',
        'get-earn-chains',
        'get-earn-portfolio',
        'get-earn-protocols',
        'get-earn-vault',
        'get-earn-vaults',
        'get-vault-risk',
        'quote-vault-deposit',
        'quote-vault-redeem',
        'run-doctor',
        'suggest-allocation',
      ])
    })

    it('declares an output schema on every tool', async () => {
      // Without one, structuredContent is unvalidated and the client has to
      // parse the text block and hope.
      const { tools } = await client.listTools()
      for (const tool of tools) {
        expect(
          tool.outputSchema,
          `${tool.name} has no outputSchema`
        ).toBeDefined()
      }
    })

    it('declares a title and description on every tool', async () => {
      const { tools } = await client.listTools()
      for (const tool of tools) {
        expect(tool.title, `${tool.name} has no title`).toBeTruthy()
        expect(tool.description?.length ?? 0).toBeGreaterThan(40)
      }
    })

    it('marks every tool read-only and non-destructive', async () => {
      // Nothing here signs or broadcasts — quote tools return unsigned
      // transactions. A host can auto-approve all of them safely, and that is
      // only knowable from the annotations.
      const { tools } = await client.listTools()
      for (const tool of tools) {
        expect(tool.annotations?.readOnlyHint, tool.name).toBe(true)
        expect(tool.annotations?.destructiveHint, tool.name).toBe(false)
        expect(tool.annotations?.openWorldHint, tool.name).toBe(true)
      }
    })

    it('warns about the API-key requirement in no tool description', async () => {
      // The key is a server-level concern, surfaced as a construction error and
      // in the Worker's 500 body — not something each tool should repeat.
      const { tools } = await client.listTools()
      const noisy = tools.filter((t) =>
        /set LIFI_API_KEY env var/i.test(t.description ?? '')
      )
      expect(noisy).toHaveLength(0)
    })

    it('tells agents that APY is already a percentage', async () => {
      // LI.FI's own docs get this wrong, and an agent following them overstates
      // every yield 100x, so the correction belongs in the tool description.
      const { tools } = await client.listTools()
      const vaults = tools.find((t) => t.name === 'get-earn-vaults')
      expect(vaults?.description).toMatch(/percentage/i)
      expect(vaults?.description).toMatch(/do not multiply/i)
    })

    it('warns against hardcoding versioned protocol slugs', async () => {
      const { tools } = await client.listTools()
      const protocols = tools.find((t) => t.name === 'get-earn-protocols')
      expect(protocols?.description).toMatch(/unversioned/i)
      expect(protocols?.description).toMatch(/zero results/i)
    })
  })

  describe('skill served over MCP (SEP-2640)', () => {
    it('exposes the skill files as resources under skill://', async () => {
      const { resources } = await client.listResources()
      const uris = resources.map((r) => r.uri)
      expect(uris).toContain('skill://earnforge/index.json')
      expect(uris).toContain('skill://earnforge/SKILL.md')
      for (const name of Object.keys(SKILL_FILES)) {
        expect(uris, `missing resource for ${name}`).toContain(
          `skill://earnforge/${name}`
        )
      }
    })

    it('serves a discovery index enumerating every file', async () => {
      const res = await client.readResource({
        uri: 'skill://earnforge/index.json',
      })
      const index = JSON.parse(res.contents[0]?.text as string)
      expect(index.name).toBe('earnforge')
      expect(index.entries).toHaveLength(SKILL_INDEX.entries.length)
      for (const entry of index.entries) {
        expect(entry.url).toMatch(/^skill:\/\/earnforge\//)
      }
    })

    it('serves SKILL.md with its frontmatter intact', async () => {
      const res = await client.readResource({
        uri: 'skill://earnforge/SKILL.md',
      })
      const text = res.contents[0]?.text as string
      expect(text).toMatch(/^---\n/)
      expect(text).toContain('name: earnforge')
      expect(text).toContain('LIFI_API_KEY')
    })

    it('serves each reference file as markdown', async () => {
      for (const name of Object.keys(SKILL_FILES)) {
        const res = await client.readResource({
          uri: `skill://earnforge/${name}`,
        })
        const content = res.contents[0]
        expect(content?.mimeType).toBe('text/markdown')
        // Casting the optional chain to `string` and dereferencing it would
        // throw a TypeError instead of failing the assertion when a reference
        // is missing entirely — the case most worth reporting clearly.
        expect(String(content?.text ?? '').length).toBeGreaterThan(50)
      }
    })

    it('carries the corrected risk thresholds in the skill content', async () => {
      // An agent reading stale thresholds reports labels that no longer exist.
      const res = await client.readResource({
        uri: 'skill://earnforge/SKILL.md',
      })
      const text = res.contents[0]?.text as string
      expect(text).toContain('>= 8 is low risk')
      expect(text).not.toContain('>= 7 is low risk')
    })
  })
})
