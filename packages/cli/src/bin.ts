#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0

import { program } from './index.js'

program.parseAsync(process.argv).catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
