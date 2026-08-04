// SPDX-License-Identifier: Apache-2.0
'use client'

import type { RiskScore } from '@earnforge/sdk'

interface RiskBadgeProps {
  score: number
  label: RiskScore['label']
}

/**
 * Colour comes from the label the SDK already computed, never from the score.
 *
 * This component used to re-derive it with its own `>= 7` / `>= 4` cutoffs.
 * Risk scorer v2 moved the thresholds to 8 and 6, so a vault scoring 7.5 got a
 * green badge reading "medium" — the colour said safe while the word beside it
 * said otherwise. Reading `label` means the two cannot disagree again, whatever
 * the thresholds become next.
 */
const LABEL_CLASSES: Record<RiskScore['label'], string> = {
  low: 'bg-green-500/20 text-green-400 border-green-500/30',
  medium: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  high: 'bg-red-500/20 text-red-400 border-red-500/30',
}

export function RiskBadge({ score, label }: RiskBadgeProps) {
  return (
    <span
      data-testid="risk-badge"
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${LABEL_CLASSES[label]}`}
    >
      <span className="inline-block h-1.5 w-1.5 rounded-full bg-current" />
      {score.toFixed(1)} {label}
    </span>
  )
}
