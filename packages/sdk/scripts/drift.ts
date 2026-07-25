// SPDX-License-Identifier: Apache-2.0
/**
 * CI entry point for the schema drift check.
 *
 * Exits non-zero only on breaking drift — a mismatch between the live API and
 * our schema. Discrepancies between the live API and LI.FI's own documentation
 * are printed but do not fail the build, because they are not ours to fix.
 */
import { detectDrift, formatDriftReport } from '../src/drift.js'

const report = await detectDrift()

console.log(formatDriftReport(report))

process.exit(report.ok ? 0 : 1)
