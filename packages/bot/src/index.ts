// SPDX-License-Identifier: Apache-2.0

import { Bot, Context } from 'grammy';
import {
  createEarnForge,
  type EarnForge,
  type Vault,
  type RiskScore,
  type Allocation,
  type PreflightReport,
  parseTvl,
} from '@earnforge/sdk';

// ── Chain name → chainId mapping ──

const CHAIN_NAME_TO_ID: Record<string, number> = {
  ethereum: 1,
  optimism: 10,
  bsc: 56,
  gnosis: 100,
  unichain: 130,
  polygon: 137,
  monad: 143,
  sonic: 146,
  mantle: 5000,
  base: 8453,
  arbitrum: 42161,
  celo: 42220,
  avalanche: 43114,
  linea: 59144,
  berachain: 80094,
  katana: 747474,
};

const CHAIN_ID_TO_NAME: Record<number, string> = Object.fromEntries(
  Object.entries(CHAIN_NAME_TO_ID).map(([name, id]) => [id, name.charAt(0).toUpperCase() + name.slice(1)]),
);

// ── Formatting helpers ──

function riskEmoji(label: 'low' | 'medium' | 'high'): string {
  if (label === 'low') return '\u{1F7E2}';
  if (label === 'medium') return '\u{1F7E1}';
  return '\u{1F534}';
}

function fmtApy(apy: number): string {
  return `${(apy).toFixed(2)}%`;
}

function fmtTvl(vault: Vault): string {
  const tvl = parseTvl(vault.analytics.tvl).parsed;
  if (tvl >= 1_000_000_000) return `$${(tvl / 1_000_000_000).toFixed(2)}B`;
  if (tvl >= 1_000_000) return `$${(tvl / 1_000_000).toFixed(2)}M`;
  if (tvl >= 1_000) return `$${(tvl / 1_000).toFixed(2)}K`;
  return `$${tvl.toFixed(2)}`;
}

function fmtVaultLine(vault: Vault, risk: RiskScore, index: number): string {
  return (
    `*${index}. ${escMd(vault.name)}*\n` +
    `   APY: \`${fmtApy(vault.analytics.apy.total)}\` | TVL: \`${fmtTvl(vault)}\`\n` +
    `   Protocol: \`${vault.protocol.name}\` | Chain: \`${CHAIN_ID_TO_NAME[vault.chainId] ?? vault.network}\`\n` +
    `   Risk: ${riskEmoji(risk.label)} \`${risk.score}/10\` (${risk.label})\n` +
    `   Slug: \`${vault.slug}\``
  );
}

function fmtRiskBreakdown(risk: RiskScore, vault: Vault): string {
  const b = risk.breakdown;
  return (
    `*Risk Score for* \`${escMd(vault.name)}\`\n\n` +
    `${riskEmoji(risk.label)} *Overall: ${risk.score}/10* (${risk.label})\n\n` +
    `*Breakdown:*\n` +
    `  TVL Magnitude: \`${b.tvl}/10\`\n` +
    `  APY Stability: \`${b.apyStability}/10\`\n` +
    `  Protocol Maturity: \`${b.protocol}/10\`\n` +
    `  Redeemability: \`${b.redeemability}/10\`\n` +
    `  Asset Type: \`${b.assetType}/10\`\n\n` +
    `*Weights:* TVL 25%, APY 20%, Protocol 25%, Redeem 15%, Asset 15%`
  );
}

function fmtAllocation(alloc: Allocation, index: number): string {
  return (
    `*${index}. ${escMd(alloc.vault.name)}*\n` +
    `   Amount: \`$${alloc.amount.toFixed(2)}\` (${alloc.percentage.toFixed(1)}%)\n` +
    `   APY: \`${fmtApy(alloc.apy)}\` | Risk: ${riskEmoji(alloc.risk.label)} \`${alloc.risk.score}/10\`\n` +
    `   Chain: \`${CHAIN_ID_TO_NAME[alloc.vault.chainId] ?? alloc.vault.network}\` | Protocol: \`${alloc.vault.protocol.name}\``
  );
}

function fmtPreflightReport(report: PreflightReport): string {
  const vault = report.vault;
  let text = `*Preflight Check for* \`${escMd(vault.name)}\`\n\n`;

  if (report.ok) {
    text += '\u{2705} *All checks passed*\n\n';
  } else {
    text += '\u{274C} *Issues found:*\n\n';
  }

  for (const issue of report.issues) {
    const icon = issue.severity === 'error' ? '\u{1F534}' : '\u{1F7E1}';
    text += `${icon} \`${issue.code}\`: ${escMd(issue.message)}\n`;
  }

  if (report.issues.length === 0) {
    text += 'No issues detected\\.';
  }

  return text;
}

/**
 * Escape special MarkdownV2 characters.
 * grammy uses MarkdownV2 parse mode.
 */
function escMd(text: string): string {
  return text.replace(/([_*[\]()~`>#+\-=|{}.!\\])/g, '\\$1');
}

// ── Bot setup ──

export function createBot(token: string, forge: EarnForge): Bot {
  const bot = new Bot(token);

  // /start
  bot.command('start', async (ctx: Context) => {
    const text =
      `*Welcome to EarnForge Bot* \u{1F3F0}\n\n` +
      `Discover, compare, and risk\\-score 623\\+ DeFi yield vaults across 16 chains via the LI\\.FI Earn API\\.\n\n` +
      `*Commands:*\n` +
      `/yield \\<asset\\> \\- Top 5 vaults for an asset by APY\n` +
      `/top \\<chain\\> \\- Top 5 vaults on a chain\n` +
      `/risk \\<slug\\> \\- Risk score breakdown for a vault\n` +
      `/suggest \\<amount\\> \\<asset\\> \\- Portfolio allocation suggestion\n` +
      `/doctor \\<slug\\> \\- Run preflight pitfall checks\n\n` +
      `_Powered by @earnforge/sdk and LI\\.FI_`;
    await ctx.reply(text, { parse_mode: 'MarkdownV2' });
  });

  // /yield <asset>
  bot.command('yield', async (ctx: Context) => {
    const args = ctx.message?.text?.split(/\s+/).slice(1) ?? [];
    const asset = args[0];
    if (!asset) {
      await ctx.reply('Usage: `/yield <asset>`\nExample: `/yield USDC`', { parse_mode: 'MarkdownV2' });
      return;
    }

    try {
      const vaults = await forge.vaults.top({ asset: asset.toUpperCase(), limit: 5 });
      if (vaults.length === 0) {
        await ctx.reply(`No vaults found for asset \`${escMd(asset.toUpperCase())}\`\\.`, { parse_mode: 'MarkdownV2' });
        return;
      }

      const lines = vaults.map((v, i) => fmtVaultLine(v, forge.riskScore(v), i + 1));
      const text = `*Top ${vaults.length} vaults for ${escMd(asset.toUpperCase())}:*\n\n${lines.join('\n\n')}`;
      await ctx.reply(text, { parse_mode: 'MarkdownV2' });
    } catch (err) {
      await ctx.reply(`Error fetching vaults: \`${escMd(String(err))}\``, { parse_mode: 'MarkdownV2' });
    }
  });

  // /top <chain>
  bot.command('top', async (ctx: Context) => {
    const args = ctx.message?.text?.split(/\s+/).slice(1) ?? [];
    const chainName = args[0]?.toLowerCase();
    if (!chainName) {
      const supported = Object.keys(CHAIN_NAME_TO_ID).join(', ');
      await ctx.reply(
        `Usage: \`/top <chain>\`\nExample: \`/top base\`\n\nSupported: \`${escMd(supported)}\``,
        { parse_mode: 'MarkdownV2' },
      );
      return;
    }

    const chainId = CHAIN_NAME_TO_ID[chainName];
    if (chainId === undefined) {
      const supported = Object.keys(CHAIN_NAME_TO_ID).join(', ');
      await ctx.reply(
        `Unknown chain \`${escMd(chainName)}\`\\. Supported: \`${escMd(supported)}\``,
        { parse_mode: 'MarkdownV2' },
      );
      return;
    }

    try {
      const vaults = await forge.vaults.top({ chainId, limit: 5 });
      if (vaults.length === 0) {
        await ctx.reply(`No vaults found on \`${escMd(chainName)}\`\\.`, { parse_mode: 'MarkdownV2' });
        return;
      }

      const lines = vaults.map((v, i) => fmtVaultLine(v, forge.riskScore(v), i + 1));
      const header = CHAIN_ID_TO_NAME[chainId] ?? chainName;
      const text = `*Top ${vaults.length} vaults on ${escMd(header)}:*\n\n${lines.join('\n\n')}`;
      await ctx.reply(text, { parse_mode: 'MarkdownV2' });
    } catch (err) {
      await ctx.reply(`Error fetching vaults: \`${escMd(String(err))}\``, { parse_mode: 'MarkdownV2' });
    }
  });

  // /risk <slug>
  bot.command('risk', async (ctx: Context) => {
    const args = ctx.message?.text?.split(/\s+/).slice(1) ?? [];
    const slug = args[0];
    if (!slug) {
      await ctx.reply('Usage: `/risk <slug>`\nExample: `/risk 8453\\-0xbeef\\.\\.\\.`', { parse_mode: 'MarkdownV2' });
      return;
    }

    try {
      const vault = await forge.vaults.get(slug);
      const risk = forge.riskScore(vault);
      const text = fmtRiskBreakdown(risk, vault);
      await ctx.reply(text, { parse_mode: 'MarkdownV2' });
    } catch (err) {
      await ctx.reply(`Error: \`${escMd(String(err))}\``, { parse_mode: 'MarkdownV2' });
    }
  });

  // /suggest <amount> <asset>
  bot.command('suggest', async (ctx: Context) => {
    const args = ctx.message?.text?.split(/\s+/).slice(1) ?? [];
    const amountStr = args[0];
    const asset = args[1];

    if (!amountStr || !asset) {
      await ctx.reply(
        'Usage: `/suggest <amount> <asset>`\nExample: `/suggest 10000 USDC`',
        { parse_mode: 'MarkdownV2' },
      );
      return;
    }

    const amount = Number(amountStr);
    if (Number.isNaN(amount) || amount <= 0) {
      await ctx.reply('Amount must be a positive number\\.', { parse_mode: 'MarkdownV2' });
      return;
    }

    try {
      const result = await forge.suggest({ amount, asset: asset.toUpperCase(), maxVaults: 5 });

      if (result.allocations.length === 0) {
        await ctx.reply(
          `No suitable vaults found for \`${escMd(asset.toUpperCase())}\`\\.`,
          { parse_mode: 'MarkdownV2' },
        );
        return;
      }

      const lines = result.allocations.map((a, i) => fmtAllocation(a, i + 1));
      const text =
        `*Portfolio Suggestion for $${escMd(amount.toLocaleString())} ${escMd(asset.toUpperCase())}:*\n\n` +
        `Expected APY: \`${fmtApy(result.expectedApy)}\`\n\n` +
        lines.join('\n\n');
      await ctx.reply(text, { parse_mode: 'MarkdownV2' });
    } catch (err) {
      await ctx.reply(`Error: \`${escMd(String(err))}\``, { parse_mode: 'MarkdownV2' });
    }
  });

  // /doctor <slug>
  bot.command('doctor', async (ctx: Context) => {
    const args = ctx.message?.text?.split(/\s+/).slice(1) ?? [];
    const slug = args[0];
    if (!slug) {
      await ctx.reply('Usage: `/doctor <slug>`\nExample: `/doctor 8453\\-0xbeef\\.\\.\\.`', { parse_mode: 'MarkdownV2' });
      return;
    }

    try {
      const vault = await forge.vaults.get(slug);
      const report = forge.preflight(vault, '0x0000000000000000000000000000000000000000');
      const text = fmtPreflightReport(report);
      await ctx.reply(text, { parse_mode: 'MarkdownV2' });
    } catch (err) {
      await ctx.reply(`Error: \`${escMd(String(err))}\``, { parse_mode: 'MarkdownV2' });
    }
  });

  return bot;
}

// ── Main entry point ──

export async function main(): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.error('TELEGRAM_BOT_TOKEN env var is required');
    process.exit(1);
  }

  const forge = createEarnForge({
    composerApiKey: process.env.LIFI_API_KEY,
  });

  const bot = createBot(token, forge);

  console.log('EarnForge Bot starting...');
  bot.start();
}

// Auto-start when run directly (not when imported for testing)
const isMainModule =
  typeof process !== 'undefined' &&
  process.argv[1] &&
  import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'));

if (isMainModule) {
  main().catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
}
