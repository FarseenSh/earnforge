# @earnforge/skill

## 1.1.0

### Minor Changes

- **Six documented commands could not run.** An agent following this skill got
  `error: unknown command` or a missing-option error, with no way to tell "I
  used it wrong" from "this tool is broken":

  | Documented | Reality |
  |---|---|
  | `earnforge gas-optimize …` | no such command; it is `quote --optimize-gas` |
  | `allowance --rpc-url --chain-id` | `--rpc` and `--chain` |
  | `approve --chain-id` | `--chain`, plus `--amount` or `--unlimited` |
  | `quote <slug> <amount> <wallet>` | flag-based |
  | `suggest <amount> <asset>` | flag-based |
  | `withdraw <slug> <amount> <wallet>` | flag-based |

  `top --strategy` and `suggest --max-vaults` were documented and do not exist.
  A CI test now parses every command in this skill against the real commander
  program, so a documented invocation that cannot run fails the build.

- **The risk model was documented with five dimensions and the wrong weights.**
  It has seven. `verification` carries 0.22, which is what makes a flagged vault
  cap at 7.96 and never read as low risk.

- Fleet figures re-measured: 799 vaults, 75 flagged, 27 protocols, 17 chains.
  `nest` left the index and `maple` returned.

## 1.0.4

### Patch Changes

- **`references/chains.md` listed Unichain and Scroll after LI.FI de-indexed
  them.** Both return zero vaults now, and `/v1/chains` no longer reports them,
  so the shipped table named two chains an agent could not use. Regenerated
  from live: 17 chains, 27 protocols unchanged.
- `references/pitfalls.md` re-measured against 703 vaults: `verificationStatus`
  flags 74 (~10%, up from 68/~9%), the `minTvl` fail-open example returns 703
  instead of 39, and `description` is present on ~23% of vaults rather than 18%.

## 1.0.3

### Patch Changes

- Package metadata declares `repository`, `homepage`, `bugs` and `author`. The
  npm page had no link back to the source or the docs.

## 1.0.2

### Patch Changes

- `references/pitfalls.md` counted 710 vaults and 66 flagged. Both moved before
  publish; the live fleet reads 711 and 68. An agent quoting the flagged share
  to a user would have been quoting a stale figure.

## 1.0.1

### Patch Changes

- `references/pitfalls.md` reported that an unfiltered `minTvl` query returned
  33 results where the measurement was 41. The two copies of that figure had
  drifted apart.

## 1.0.0

### Major Changes

- Conforms to the [Agent Skills specification](https://agentskills.io). The
  frontmatter gained `license`, `compatibility`, `allowed-tools`, and the
  `LIFI_API_KEY` declaration whose absence would have failed ClawdHub's
  security review — the skill required a credential it never declared.

- The skill now lives at `skills/earnforge/` in the repository, because the
  spec requires the directory name to match the skill name and
  `npx skills add` discovers it that way. The npm package copies from that
  single source at pack time, so the two cannot drift.

### Minor Changes

- Also served over MCP by `@earnforge/mcp` as resources under
  `skill://earnforge/*`, so an agent can obtain the tools and the instructions
  for using them over one connection.

- `references/chains.md` and `references/protocols.md` are generated from the
  live endpoints. They previously *claimed* to be generated while no generator
  existed, and had gone stale — 16 chains and 13 protocols where there are now
  19 and 27.

### Patch Changes

- Two content corrections that would have made an agent wrong:

  `SKILL.md` stated risk thresholds of 7/4, so an agent would have reported
  labels that no longer exist. It also led with *"the Earn Data API has no
  auth"* — the exact claim the April rewrite inverted.

- `simulate` is described as compiling through Composer against the chain head,
  which is what it now does. It was documented as a dry run "via eth_call".

- Pitfall reference updated to 23 pitfalls, re-verified against 711 live vaults
  on Aug 4, 2026 — including the two that inverted (#2 auth, #8 TVL type) and
  #15, retained as a synthesised case rather than deleted since the shape is
  still legal.
