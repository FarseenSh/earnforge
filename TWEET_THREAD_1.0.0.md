# EarnForge 1.0.0 — launch thread

Supersedes `TWEET_THREAD.md` (Apr 2026 hackathon draft — every number in it is
now wrong: 623 vaults, 16 chains, 18 pitfalls, Telegram bot).

First person. LI.FI framed as collaborator, since PR #561 is open with them.
Every figure verified against the live API on Aug 4, 2026.

---

**1/**

EarnForge 1.0.0 is out.

A TypeScript toolkit for the LI.FI Earn API — the layer that tells you *which*
vault to pick, not just which ones exist.

SDK · CLI · React hooks · MCP server · Agent Skill
573 tests, all green.

npm i @earnforge/sdk

---

**2/**

Why 1.0.0 and not 0.2?

Because 0.1.x doesn't work.

LI.FI rewrote the Earn API in April, days after I last shipped. Every path
moved, auth became mandatory, two fields vanished, one changed type.

This release is the repair.

---

**3/**

The part that stung: I had 474 passing tests and didn't notice for three months.

All mocked against April fixtures. Live tests excluded from CI. And the
`test:live` script used a flag that doesn't exist in Vitest 4 — so it had never
once run.

Green tests. Dead API.

---

**4/**

So 1.0.0 ships the thing that would have caught it.

`detectDrift()` diffs three sources — the live API, LI.FI's OpenAPI spec, and my
own schemas — and reports *which pair* disagrees.

A vendor doc bug looks different from my bug. CI runs it daily.

---

**5/**

Risk scoring across 7 dimensions:

TVL · APY stability · protocol maturity · redeemability · asset type ·
verification status · reward dependency

0–10 composite plus plain-language flags, calibrated on all 711 live vaults.
Real scores span 4.1 to 9.7.

---

**6/**

The question no yield UI answers: *is this real, or an incentive that ends?*

Highest APY in the entire fleet right now — USP on Pendle, 106.16%:

  base    13.76%
  reward  92.40%

87% of that headline is emissions. `rewardSustainability()` says so.

---

**7/**

New in 1.0.0 — Composer Flows.

Swap → deposit as one atomic transaction, at the exact amount the swap
returned. Not two transactions where the second has to guess.

Plus `vaultRoutability()`: the vault list is a *superset* of what can actually
be executed.

---

**8/**

Two ways to give an agent this.

As an Agent Skill:
npx skills add FarseenSh/earnforge

Or the hosted MCP server — zero install, current 2026-07-28 revision:
earnforge-mcp.papermind-ai.workers.dev/mcp

12 tools, plus the skill served as MCP resources.

---

**9/**

Rebuilding against the live API turned up things worth sharing.

The docs say APY is a decimal. The quickstart does `apy.total * 100`.

It's already a percentage. Follow the official example and you render 2919%
where you mean 29.19%.

Checked across 711 vaults.

---

**10/**

Four more, verified live:

▸ `tvl.usd` documented as string — it's a number
▸ `caps`/`timeLock`/`kyc`/`lpTokens` documented — zero vaults send them
▸ 15-min analytics refresh — observed floor 87 min
▸ a stale protocol slug returns 200 and zero results, never an error

---

**11/**

And one that isn't written down anywhere:

`verificationStatus` — undocumented, on every vault, flagging 68 of 711 as
suspect. USP is one: `apy_outlier`.

So the top APY in the fleet is 87% emissions *and* flagged — and nothing shows
you either. EarnForge scores it 5.5/10, high.

---

**12/**

All 23 documented in PITFALLS.md, each with a regression test.

I've also opened a PR adding Earn types to @lifi/types — every discrepancy
noted inline at the field it affects, so the correction travels with the type:

github.com/lifinance/types/pull/561

---

**13/**

Docs → earnforge-docs.vercel.app
Studio → earnforge-studio.vercel.app
Code → github.com/FarseenSh/earnforge

Apache-2.0. Built on the LI.FI Earn API.

npm i @earnforge/sdk

---

## Posting notes

**Decisions you may want to flip**

- Written first person. Swap to "we" if posting from a project account.
- LI.FI is framed as collaborator, not target — tweet 12 leads with the PR
  deliberately, so 9–11 read as contributed-back rather than gotcha.
- No @-mentions included. The April draft tagged @lifiprotocol and @kenny_io.
  Tagging them on tweet 12 (the PR) is the natural place if you want to —
  attaching it to tweet 9 would make the doc criticism feel pointed.
- Hackathon framing dropped. Add it back on tweet 1 if the DeFi Mullet
  audience still matters.

**Which tweets carry weight**

- **9** is the most shareable — useful to any LI.FI integrator whether or not
  they touch EarnForge. If one tweet travels, it's this.
- **8** is the lowest-friction ask: an endpoint someone can paste into a config
  right now. Good candidate to re-post standalone later.
- **3** is the vulnerable one, and it's why anyone believes 4–11. Keep it.

**Media**

- Strongest visual is `earnforge risk` on a flagged vault, or `earnforge doctor`
  output — both show the judgment layer better than a code block.
- Don't screenshot download counts. The spread across packages is flat enough
  to read as registry mirrors, and it's a claim anyone can check in one click.

**Verified before writing** (Aug 4, 2026)

The fleet moves. 66 → 67 → 68 flagged within one day, and 710 → 711 vaults.
Re-verify tweets 5, 9 and 11 before posting if it has been more than a day:

```bash
LIFI_API_KEY=... pnpm --filter @earnforge/sdk test:live   # asserts the shape
```


711 vaults · 19 chains · 27 protocols · 68 flagged · 573 mocked tests · 34 live
scores 4.10–9.70 · all 5 packages at 1.0.0

USP (pendle:1:_:0xc83f...86cb) — 106.16% total / 13.76% base / 92.40% reward,
rank 1 of 711 by APY, $216k TVL, flagged apy_outlier, EarnForge score 5.5 high.
