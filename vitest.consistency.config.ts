// SPDX-License-Identifier: Apache-2.0
import { defineConfig } from 'vitest/config'

/**
 * Root-level suite. Holds cross-surface invariants that belong to no single
 * package: the counts every package's docs quote, and the release-shape rules
 * that only make sense across the workspace.
 *
 * Deliberately NOT named `vitest.config.ts`. Vitest walks up from a package
 * looking for one, and a root config with that name silently overrode the test
 * glob in every package that has none of its own: `@earnforge/mcp` went from 64
 * tests to "No test files found" the moment this file appeared.
 */
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
  },
})
