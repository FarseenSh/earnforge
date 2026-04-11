// SPDX-License-Identifier: Apache-2.0
'use client';

interface RiskBadgeProps {
  score: number;
  label: 'low' | 'medium' | 'high';
}

function getBadgeClasses(score: number): string {
  if (score >= 7) {
    return 'bg-green-500/20 text-green-400 border-green-500/30';
  }
  if (score >= 4) {
    return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
  }
  return 'bg-red-500/20 text-red-400 border-red-500/30';
}

export function RiskBadge({ score, label }: RiskBadgeProps) {
  const classes = getBadgeClasses(score);

  return (
    <span
      data-testid="risk-badge"
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${classes}`}
    >
      <span className="inline-block h-1.5 w-1.5 rounded-full bg-current" />
      {score.toFixed(1)} {label}
    </span>
  );
}
