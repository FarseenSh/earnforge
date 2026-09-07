# All five `get-earn-*` tools on the hosted MCP server return 404

**Status:** ready to send, not yet sent. The MCP server has no public repository,
so this needs a person rather than an issue. Re-run the reproduction below before
sending: it is dated, and the whole point of the report is that it is checkable.

**Verified:** 7 Sep 2026, against `https://mcp.li.quest/mcp`.

---

## Summary

Every Earn tool on the hosted MCP server fails. They request the pre-April base
path `li.quest/v1/earn/*`, which the Earn API migrated away from in Apr 2026. The
current base is `earn.li.fi/v1/*`.

`docs.li.fi/llms.txt` records the migration itself:

> **April 2026:** SDK v4 and Widget v4 released. [...] Earn API base path changed
> (`/v1/earn/...` -> `/v1/...`).

The MCP server was not updated with it. The other 20 tools are unaffected: they
target `li.quest` endpoints that did not move.

## Reproduction

```
FAIL get-earn-chains     404 Cannot GET /v1/earn/chains
FAIL get-earn-protocols  404 Cannot GET /v1/earn/protocols
FAIL get-earn-vaults     404 Cannot GET /v1/earn/vaults
FAIL get-earn-vault      404 Cannot GET /v1/earn/vaults/8453/0xbeef0e08…
FAIL get-earn-portfolio  404 Cannot GET /v1/earn/portfolio/0x552008c0…
```

Six calls, six 404s, including `get-earn-vaults` with no arguments at all. There
is no argument combination that works, because the host and path are wrong before
any parameter is read.

Control, same moment, same API key:

```
earn.li.fi/v1/chains    -> HTTP 200
li.quest/v1/earn/chains -> HTTP 404
```

So the data is being served normally. Only the MCP server is looking in the old
place.

## Fix

Point the five Earn tools at `https://earn.li.fi/v1` and drop the `earn` path
segment:

| Tool | Currently requests | Should request |
|---|---|---|
| `get-earn-chains` | `li.quest/v1/earn/chains` | `earn.li.fi/v1/chains` |
| `get-earn-protocols` | `li.quest/v1/earn/protocols` | `earn.li.fi/v1/protocols` |
| `get-earn-vaults` | `li.quest/v1/earn/vaults` | `earn.li.fi/v1/vaults` |
| `get-earn-vault` | `li.quest/v1/earn/vaults/{chainId}/{address}` | `earn.li.fi/v1/vaults/{chainId}/{address}` |
| `get-earn-portfolio` | `li.quest/v1/earn/portfolio/{address}` | `earn.li.fi/v1/portfolio/{address}/positions` |

`get-earn-portfolio` needs the extra `/positions` suffix, so it is two changes
rather than one. The Earn Data API also requires `x-lifi-api-key` on every
request, including the endpoints that were public before April.

## Two things worth fixing while the file is open

Both are visible in the tool descriptions rather than the transport, so they will
survive a base-URL fix.

1. **Versioned protocol slugs.** `get-earn-vaults` and `get-earn-protocols`
   both document the `protocol` parameter as:

   > Filter by protocol name in kebab-case (e.g., 'morpho-v1', 'aave-v3',
   > 'euler-v2', 'pendle'). Use get-earn-protocols to list all available
   > protocol names.

   Three of those four match nothing. The Apr 2026 rewrite made protocol ids
   unversioned, and the live set is `morpho`, `aave`, `euler` (`pendle` is not
   indexed at all right now). The failure is silent:

   ```
   GET /v1/vaults?protocol=morpho-v1  ->  HTTP 200, total: 0
   ```

   An unknown protocol filter returns an empty page with a success status, not an
   error, so an agent following the description gets zero vaults and nothing to
   suggest the filter was the problem. Worth pinning with a test that asserts the
   advertised examples exist in `/v1/protocols`, since the ids drift: `maple`
   left in July and came back in September.

2. **`verificationStatus` is not surfaced.** Every vault carries
   `verificationStatus` and `verificationStatusBreakdown`, and 72 of 744 vaults
   were `flagged` on 7 Sep 2026, all for `zero_apy`. Neither field appears in the
   OpenAPI spec or in the MCP output. An agent sorting by APY will rank flagged
   vaults and recommend depositing into them, which is the case the flag exists
   to prevent. It is a small addition with a large effect on answer quality.

## Where this came from

Found while checking EarnForge against the current LI.FI surface. EarnForge is an
independent Earn toolkit whose MCP server deliberately mirrors these five tool
names, so an agent that knows one knows the other. That is the reason for the
comparison, and it is worth stating plainly rather than leaving implicit.
