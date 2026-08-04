# @earnforge/react

## 1.0.1

### Patch Changes

- Depends on `@earnforge/sdk` as `^1.0.2` rather than an exact pin. The
  workspace protocol was `workspace:*`, which publishes as an exact version —
  so every release of this package hard-pinned one SDK build and no SDK patch
  could ever reach an installed copy. `workspace:^` publishes a caret range,
  which is what a same-repo dependency is meant to express.

- Package metadata declares `repository`, `homepage`, `bugs` and `author`. The
  npm page had no link back to the source or the docs.

## 1.0.0

### Major Changes

- `EarnForgeProvider` requires an `apiKey`. The Earn Data API returns `401`
  without one as of Apr 2026.

- Hook return shapes follow the corrected SDK schemas: `tvl.usd` is a number,
  `apy.reward` can be `null` (it was previously coerced to `0`), and `provider`
  and `lpTokens` no longer exist on a vault.

- Risk labels reflect the recalibrated 8/6 thresholds, so `useRiskScore` may
  return `medium` where it returned `low`.

- Requires Zod 4 and TypeScript 7. `viem` peer widened to `^2.55`.

### Minor Changes

- `useVaults` and `useEarnTopYield` expose verification state, so a flagged
  vault can be filtered or labelled rather than rendered as a plain
  recommendation.

- `useEarnDeposit` and `useEarnRedeem` surface preflight failures with their
  issue messages rather than a generic error.

### Patch Changes

- Ten hooks, correctly. The package documented nine.

- ESM export paths resolve. The `types` condition was declared after `import`,
  where it can never be selected, and this package had no top-level `types`
  field covering for it.
