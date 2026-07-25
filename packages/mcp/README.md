# @earnforge/mcp

MCP server for the [LI.FI Earn API](https://docs.li.fi/earn/overview) — vault
discovery, risk scoring, allocation, and diagnostics as agent-callable tools.

```bash
npm i -g @earnforge/mcp
```

```json
{
  "mcpServers": {
    "earnforge": {
      "command": "earnforge-mcp",
      "env": { "LIFI_API_KEY": "your_key" }
    }
  }
}
```

## Relationship to LI.FI's own MCP server

LI.FI hosts an MCP server at `https://mcp.li.quest/mcp` with five `get-earn-*`
tools. This package overlaps on those and adds the judgment layer LI.FI does not
provide:

| Tool | LI.FI hosted | EarnForge |
|---|---|---|
| `get-earn-vaults` / `-vault` / `-chains` / `-protocols` / `-portfolio` | yes | yes |
| `get-vault-risk` | — | yes |
| `suggest-allocation` | — | yes |
| `run-doctor` | — | yes |
| `check-allowance` | — | yes |
| `quote-vault-redeem` | — | yes |

Two differences worth knowing: LI.FI's tool descriptions still advertise
versioned protocol slugs (`morpho-v1`, `aave-v3`) which return zero results
against the current API, and they do not expose `verificationStatus`, the
undocumented field that flags ~9% of vaults as suspect. This server surfaces it
on every vault result.

## License

Apache-2.0
