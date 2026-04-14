// SPDX-License-Identifier: Apache-2.0
import type { KnipConfig } from 'knip'

const config: KnipConfig = {
  workspaces: {
    '.': {
      ignoreDependencies: ['turbo', 'husky'],
    },
    'packages/sdk': {
      entry: ['src/index.ts'],
      ignoreDependencies: ['msw'],
    },
    'packages/cli': {
      entry: ['src/index.ts', 'src/bin.ts'],
    },
    'packages/react': {
      entry: ['src/index.ts'],
    },
    'packages/mcp': {
      entry: ['src/index.ts'],
    },
    'packages/bot': {
      entry: ['src/index.ts'],
    },
    'packages/skill': {
      entry: ['SKILL.md'],
    },
    'packages/fixtures': {
      entry: ['src/index.ts'],
    },
  },
  ignore: ['apps/**', '.changeset/**'],
}

export default config
