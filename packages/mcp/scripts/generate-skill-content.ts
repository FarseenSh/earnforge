// SPDX-License-Identifier: Apache-2.0
/**
 * Inline the Agent Skill files into a TypeScript module.
 *
 * The MCP server serves the skill as Resources (SEP-2640) and must work in a
 * Cloudflare Worker, which has no filesystem — so the content is bundled at
 * build time rather than read at runtime. `skills/earnforge/` remains the single
 * source of truth; this file is generated and should never be hand-edited.
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const SKILL_DIR = join(import.meta.dirname, '../../../skills/earnforge')
const OUT = join(import.meta.dirname, '../src/skill-content.ts')

const files: Record<string, string> = {
  'SKILL.md': readFileSync(join(SKILL_DIR, 'SKILL.md'), 'utf-8'),
}

for (const ref of readdirSync(join(SKILL_DIR, 'references')).sort()) {
  if (!ref.endsWith('.md')) {
    continue
  }
  files[`references/${ref}`] = readFileSync(
    join(SKILL_DIR, 'references', ref),
    'utf-8'
  )
}

const index = {
  name: 'earnforge',
  entries: Object.keys(files).map((name) => ({
    type: 'mcp-resource',
    name,
    url: `skill://earnforge/${name}`,
    mimeType: 'text/markdown',
  })),
}

const body = `// SPDX-License-Identifier: Apache-2.0
// GENERATED FILE — do not edit.
// Source: skills/earnforge/  ·  Regenerate: pnpm --filter @earnforge/mcp generate

export const SKILL_NAME = 'earnforge'

export type SkillFileName = ${Object.keys(files)
  .map((n) => `'${n}'`)
  .join(' | ')}

/** Discovery index, per MCP SEP-2640. */
export const SKILL_INDEX = ${JSON.stringify(index, null, 2)} as const

export const SKILL_FILES: Record<SkillFileName, string> = {
${Object.entries(files)
  .map(([name, content]) => `  '${name}': ${JSON.stringify(content)},`)
  .join('\n')}
}
`

writeFileSync(OUT, body)
console.log(
  `generated src/skill-content.ts — ${Object.keys(files).length} files, ` +
    `${(body.length / 1024).toFixed(1)} kB`
)
