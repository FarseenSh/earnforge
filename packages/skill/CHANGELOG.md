# @earnforge/skill

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

- Pitfall reference updated to 23 pitfalls, re-verified against 710 live vaults
  on Aug 4, 2026 — including the two that inverted (#2 auth, #8 TVL type) and
  #15, retained as a synthesised case rather than deleted since the shape is
  still legal.
