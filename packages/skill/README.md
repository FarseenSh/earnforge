# @earnforge/skill

Agent Skill for the [LI.FI Earn API](https://docs.li.fi/earn/overview),
conforming to the [Agent Skills specification](https://agentskills.io).

Wraps the `earnforge` CLI so an agent can discover vaults, score risk, and build
deposit and withdrawal quotes.

## Install

```bash
npx skills add FarseenSh/earnforge
```

Requires the CLI and an API key:

```bash
npm i -g @earnforge/cli
export LIFI_API_KEY=...   # create one at https://portal.li.fi
```

## Contents

| File | Purpose |
|---|---|
| `SKILL.md` | Rules, command reference, and workflow |
| `references/pitfalls.md` | API behaviours that contradict LI.FI's docs |
| `references/protocols.md` | Indexed protocols with risk tiers |
| `references/chains.md` | Chains with indexed vaults |
| `references/examples.md` | Worked examples including allowance and withdrawal |
| `references/strategies.md` | Yield strategy presets |

## License

Apache-2.0
