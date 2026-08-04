# @earnforge/cli

## 1.0.3

### Patch Changes

- `earnforge simulate` works. It never has: the flow it built could not compile
  for any vault, from any input. Fixed in `@earnforge/sdk` 1.0.3, which this
  release requires.

- `--from-token` reaches the amount resolution, not just the flow. Without it
  the human amount was scaled by the *vault asset's* decimals, so
  `--amount 1 --from-token WETH` meant 1e6 wei of WETH — a millionth of a cent
  — and the simulation failed on dust rather than on anything the caller wrote.

## 1.0.2

### Patch Changes

- Depends on `@earnforge/sdk` as `^1.0.2` rather than an exact pin. The
  workspace protocol was `workspace:*`, which publishes as an exact version —
  so every release of this package hard-pinned one SDK build and no SDK patch
  could ever reach an installed copy. `workspace:^` publishes a caret range,
  which is what a same-repo dependency is meant to express.

- Package metadata declares `repository`, `homepage`, `bugs` and `author`. The
  npm page had no link back to the source or the docs.

## 1.0.1

### Patch Changes

- `earnforge risk` prints all seven dimensions and the flags. It printed five
  and no flags — `verification` and `rewardDependency` arrived with risk scorer
  v2 and were never added to the renderer, so the CLI computed LI.FI's own
  quality signal and discarded it.

  On the worst vault in the fleet it reported `Composite 5.5/10 (high)` and
  stopped, while holding `Verification 1/10`, `Reward Dependency 2/10`, and
  three flags naming the outlier verification status, the 87% emission share,
  and stale analytics. The number said something was wrong; only the flags said
  what.

  It survived because nothing asserted on the output. Three tests do now.

## 1.0.0

### Major Changes

- Requires `LIFI_API_KEY`. Every command hits an API that now returns `401`
  without one. `earnforge doctor` reports a missing key as an actionable error
  rather than a bare authentication failure.

- Risk output reflects the recalibrated thresholds (8/6, was 7/4), so a vault
  previously printed as `low` may now print `medium`.

- Requires TypeScript 7 and commander 15 if consumed as a library.

### Minor Changes

- `earnforge simulate` runs a real simulation. It previously issued a bare
  `eth_call` against a public RPC, which cannot observe allowances, balances or
  protocol state — and reported SUCCESS for transactions that would revert on
  submission. It now compiles through Composer, which simulates against the
  chain head and returns `producedResources`, structured revert diagnostics, a
  real gas estimate and price impact. New flags: `--from-token`,
  `--slippage-bps`, `--allow-revert`. Exits non-zero on a simulated revert.

  Its help text also claimed to require anvil. It never used anvil.

- Flagged vaults are surfaced with their reason inline across `list`, `top`,
  `vault`, `risk` and `suggest`. LI.FI flags roughly 9% of the fleet.

- `DoctorCheck` is exported. It is part of `runDoctorChecks()`'s return shape
  but was previously unreachable by name.

### Patch Changes

- `earnforge init` scaffolds correct patterns. It previously generated a page
  using `composerApiKey` alone — which worked via the env fallback but read as
  though Earn still needed no auth — and rendered APY with no flagged-vault
  filter and no risk score. A scaffolder is the highest-leverage documentation
  in a toolkit; whatever it emits becomes the pattern every new project copies.
  It now uses `apiKey`, explains why a Server Component is the only safe place
  for the key, filters flagged vaults with the reason inline, and shows risk
  alongside APY.

- The scaffold pins `next: ^16.0.0`. It was pinning new projects to `^15.0.0`,
  the previous major.

- `--version` reports the real version. It reported `0.1.0`.

- `--json` is clean on stdout; the spinner writes to stderr, so piping to `jq`
  works.

- Test fixtures no longer use versioned protocol slugs. They were
  self-consistent and therefore passed, while teaching a pattern that now
  silently returns zero results.
