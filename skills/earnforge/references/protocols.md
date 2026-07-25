# Protocols

Protocols with at least one indexed Earn vault. Generated from
`GET https://earn.li.fi/v1/protocols`.

13 protocols as of Jul 25, 2026.

**Ids are UNVERSIONED.** `morpho`, not `morpho-v1`. Filtering on a
versioned slug returns HTTP 200 with zero results, not an error — so a
stale slug is indistinguishable from an empty protocol.

| Id | Risk tier (0-10) | URL |
|---|---|---|
| `aave` | 9 | https://aave.com |
| `avant` | 4 | https://avantprotocol.com |
| `cap` | 4 | https://cap.app |
| `ethena` | 6 | https://ethena.fi |
| `etherfi-staking` | 7 | https://ether.fi |
| `euler` | 7 | https://euler.finance |
| `fluid` | 7 | https://fluid.instadapp.io |
| `morpho` | 9 | https://morpho.org |
| `neverland` | 4 | https://neverland.money |
| `pendle` | 7 | https://pendle.finance |
| `upshift` | 5 | https://upshift.finance |
| `yearn` | 8 | https://yearn.fi |
| `yo` | 4 | https://yo.xyz |

Unlisted protocols default to tier 3. Use `earnforge protocols` to refresh.
