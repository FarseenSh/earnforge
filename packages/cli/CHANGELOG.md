# @earnforge/cli

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
