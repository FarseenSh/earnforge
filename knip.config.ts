// SPDX-License-Identifier: Apache-2.0
import type { KnipConfig } from 'knip'

// knip 6 derives entry points from each package's `exports`/`bin`, so the
// per-workspace `entry` lists that used to live here are redundant — and a
// stale one silently hides real dead code rather than reporting it.
const config: KnipConfig = {
  workspaces: {
    // msw is loaded by the vitest setup file, never imported by name.
    'packages/sdk': {
      ignoreDependencies: ['msw'],
    },
  },
  ignore: ['apps/**'],
}

export default config
