# @earnforge/react

## 1.1.0

### Minor Changes

- **`useEarnDeposit` approved the wrong contract.** It checked the allowance
  before quoting and hardcoded `vault.address` as the spender, approving
  `MaxUint256` to it. That granted a standing unlimited allowance to a contract
  that never needed one, and the deposit still failed because
  `quote.estimate.approvalAddress` — the router that does need it — was never
  approved.

  The cause was ordering: the spender only exists once the quote does. The
  phase sequence is now `preflight -> quoting -> checking-allowance ->
  approving -> ready`. Code driving UI off `state.phase` should expect
  `quoting` before `checking-allowance`.

- **Approvals are exact by default.** An unlimited allowance outlives the
  deposit and lets the spender move that token until it is revoked. Opt in with
  `unlimitedApproval: true`.

- **A failed allowance read is an error, not an approval.** The hook used to
  approve on an unreadable allowance; it now surfaces the RPC failure instead
  of signing against a spender it could not verify.

- Reading `fromToken` and the raw amount back off the quote also fixes a
  decimals bug in the same block: it used `underlyingTokens[0].decimals` even
  when `fromToken` overrode to a different token.

## 1.0.2

### Patch Changes

- Package description wording only. No runtime change.

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
