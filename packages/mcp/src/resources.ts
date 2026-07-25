// SPDX-License-Identifier: Apache-2.0
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import {
  SKILL_FILES,
  SKILL_INDEX,
  SKILL_NAME,
  type SkillFileName,
} from './skill-content.js'

/**
 * Serve the EarnForge Agent Skill over MCP as Resources.
 *
 * Follows the convention in MCP SEP-2640 (`io.modelcontextprotocol/skills`),
 * which binds the Agent Skills format to MCP's existing Resources primitive:
 * each file in a skill directory is exposed under a `skill://` URI, and a
 * well-known `skill://index.json` enumerates what is available.
 *
 * The point is that a host connecting to this server gets both halves at once —
 * the tools it can call, and the workflow instructions describing when and how
 * to call them. Previously those shipped as two separate packages, one of which
 * had to be installed by hand.
 *
 * Progressive disclosure still applies. `SKILL.md` is the entry point; the
 * reference files are pulled in only when a task actually needs them, which is
 * why they are individually addressable rather than concatenated.
 */
export function registerSkillResources(server: McpServer): void {
  // Discovery index. A host reads this first to learn what the skill contains.
  server.registerResource(
    'skill-index',
    `skill://${SKILL_NAME}/index.json`,
    {
      title: 'EarnForge skill index',
      description:
        'Discovery index for the EarnForge Agent Skill. Lists SKILL.md and every ' +
        'reference file, per MCP SEP-2640.',
      mimeType: 'application/json',
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: 'application/json',
          text: JSON.stringify(SKILL_INDEX, null, 2),
        },
      ],
    })
  )

  // The skill itself, plus each reference file as its own resource.
  for (const [name, content] of Object.entries(SKILL_FILES) as [
    SkillFileName,
    string,
  ][]) {
    const isEntry = name === 'SKILL.md'
    server.registerResource(
      isEntry ? 'skill' : `skill-${name.replace(/^references\/|\.md$/g, '')}`,
      `skill://${SKILL_NAME}/${name}`,
      {
        title: isEntry ? 'EarnForge SKILL.md' : `EarnForge — ${name}`,
        description: isEntry
          ? 'Entry point for the EarnForge skill: commands, rules, and the ' +
            'API behaviours that will otherwise bite you.'
          : (REFERENCE_DESCRIPTIONS[name] ?? `Reference file: ${name}`),
        mimeType: 'text/markdown',
      },
      async (uri) => ({
        contents: [{ uri: uri.href, mimeType: 'text/markdown', text: content }],
      })
    )
  }
}

const REFERENCE_DESCRIPTIONS: Partial<Record<SkillFileName, string>> = {
  'references/pitfalls.md':
    "23 Earn API pitfalls, including six where LI.FI's documentation " +
    'contradicts the API — read before writing integration code.',
  'references/protocols.md':
    'Indexed protocols with risk tiers. Ids are unversioned; a stale slug ' +
    'returns zero results with no error.',
  'references/chains.md': 'Chains with at least one indexed Earn vault.',
  'references/examples.md':
    'Worked end-to-end examples: discovery, allowance, deposit, withdrawal.',
  'references/strategies.md':
    'The four yield strategy presets and what each filters for.',
}
