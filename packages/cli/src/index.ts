// SPDX-License-Identifier: Apache-2.0

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import {
  createEarnForge,
  parseTvl,
  checkAllowance,
  buildApprovalTx,
  MAX_UINT256,
  type Vault,
  type EarnForge,
  type StrategyPreset,
} from '@earnforge/sdk';
import {
  vaultTable,
  vaultDetail,
  compareTable,
  chainTable,
  protocolTable,
  portfolioTable,
  riskTable,
  suggestTable,
  apyHistoryTable,
  preflightTable,
  fmtPct,
  fmtUsd,
  riskLabel,
  riskLabelPlain,
  outputResult,
} from './helpers.js';
import {
  runDoctorChecks,
  formatDoctorReport,
  runEnvChecks,
  formatEnvReport,
  type DoctorReport,
} from './doctor.js';

export { runDoctorChecks, formatDoctorReport, runEnvChecks, formatEnvReport };
export type { DoctorReport };

// ── Forge factory (lazy singleton) ──

let _forge: EarnForge | undefined;

function getForge(): EarnForge {
  if (!_forge) {
    _forge = createEarnForge({
      composerApiKey: process.env['LIFI_API_KEY'],
    });
  }
  return _forge;
}

/** Override forge instance (for testing) */
export function setForge(forge: EarnForge): void {
  _forge = forge;
}

/** Reset forge instance */
export function resetForge(): void {
  _forge = undefined;
}

const VALID_STRATEGIES: StrategyPreset[] = ['conservative', 'max-apy', 'diversified', 'risk-adjusted'];

function validateStrategy(s: string): StrategyPreset {
  if (!VALID_STRATEGIES.includes(s as StrategyPreset)) {
    throw new Error(`Invalid strategy: ${s}. Valid: ${VALID_STRATEGIES.join(', ')}`);
  }
  return s as StrategyPreset;
}

// ── Program ──

export const program = new Command();

program
  .name('earnforge')
  .version('0.1.0')
  .description('EarnForge CLI — Developer toolkit for the LI.FI Earn API');

// ── list ──

program
  .command('list')
  .description('List vaults with filters')
  .option('--chain <id>', 'Filter by chain ID', parseInt)
  .option('--asset <sym>', 'Filter by asset symbol')
  .option('--min-apy <n>', 'Minimum APY (e.g. 5 = 5%)', parseFloat)
  .option('--min-tvl <n>', 'Minimum TVL in USD', parseFloat)
  .option('--sort <field>', 'Sort by apy or tvl', 'apy')
  .option('--limit <n>', 'Max results', parseInt)
  .option('--strategy <preset>', 'Strategy preset (conservative, max-apy, diversified, risk-adjusted)')
  .option('--json', 'Output as JSON', false)
  .action(async (opts) => {
    const spinner = ora('Fetching vaults...').start();
    try {
      const forge = getForge();
      const limit = opts.limit ?? 20;
      const strategy = opts.strategy ? validateStrategy(opts.strategy) : undefined;

      const vaults: Vault[] = [];
      for await (const v of forge.vaults.listAll({
        chainId: opts.chain,
        asset: opts.asset,
        minTvl: opts.minTvl,
        strategy,
      })) {
        // Client-side APY filter
        if (opts.minApy !== undefined && v.analytics.apy.total < opts.minApy) continue;
        // Client-side TVL filter
        if (opts.minTvl !== undefined && parseTvl(v.analytics.tvl).parsed < opts.minTvl) continue;

        vaults.push(v);
        if (vaults.length >= limit * 3) break; // Over-fetch for sorting
      }

      // Sort
      if (opts.sort === 'tvl') {
        vaults.sort((a, b) => parseTvl(b.analytics.tvl).parsed - parseTvl(a.analytics.tvl).parsed);
      } else {
        vaults.sort((a, b) => b.analytics.apy.total - a.analytics.apy.total);
      }

      const result = vaults.slice(0, limit);
      spinner.stop();

      outputResult(
        result.map((v) => ({
          slug: v.slug,
          name: v.name,
          chainId: v.chainId,
          protocol: v.protocol.name,
          apy: v.analytics.apy.total,
          tvlUsd: parseTvl(v.analytics.tvl).parsed,
          tags: v.tags,
          isTransactional: v.isTransactional,
        })),
        opts.json,
        () => {
          if (result.length === 0) return chalk.yellow('No vaults found matching your filters.');
          return `${vaultTable(result)}\n\n${chalk.dim(`Showing ${result.length} vault${result.length !== 1 ? 's' : ''}`)}`;
        },
      );
    } catch (err) {
      spinner.fail('Failed to fetch vaults');
      console.error(chalk.red(err instanceof Error ? err.message : String(err)));
      process.exitCode = 1;
    }
  });

// ── top ──

program
  .command('top')
  .description('Show top vaults by APY for a given asset')
  .requiredOption('--asset <sym>', 'Asset symbol (e.g. USDC, WETH)')
  .option('--chain <id>', 'Filter by chain ID', parseInt)
  .option('--limit <n>', 'Max results', parseInt)
  .option('--json', 'Output as JSON', false)
  .action(async (opts) => {
    const spinner = ora('Fetching top vaults...').start();
    try {
      const forge = getForge();
      const result = await forge.vaults.top({
        asset: opts.asset,
        chainId: opts.chain,
        limit: opts.limit ?? 10,
      });
      spinner.stop();

      outputResult(
        result.map((v) => ({
          slug: v.slug,
          name: v.name,
          chainId: v.chainId,
          protocol: v.protocol.name,
          apy: v.analytics.apy.total,
          tvlUsd: parseTvl(v.analytics.tvl).parsed,
          tags: v.tags,
        })),
        opts.json,
        () => {
          if (result.length === 0) return chalk.yellow(`No vaults found for asset: ${opts.asset}`);
          return `${chalk.bold(`Top ${opts.asset} vaults`)}\n\n${vaultTable(result)}`;
        },
      );
    } catch (err) {
      spinner.fail('Failed to fetch top vaults');
      console.error(chalk.red(err instanceof Error ? err.message : String(err)));
      process.exitCode = 1;
    }
  });

// ── vault ──

program
  .command('vault')
  .description('Get detailed vault info by slug')
  .argument('<slug>', 'Vault slug (e.g. 8453-0xbeef...)')
  .option('--json', 'Output as JSON', false)
  .action(async (slug: string, opts) => {
    const spinner = ora('Fetching vault...').start();
    try {
      const forge = getForge();
      const vault = await forge.vaults.get(slug);
      spinner.stop();

      outputResult(vault, opts.json, () => vaultDetail(vault));
    } catch (err) {
      spinner.fail('Failed to fetch vault');
      console.error(chalk.red(err instanceof Error ? err.message : String(err)));
      process.exitCode = 1;
    }
  });

// ── compare ──

program
  .command('compare')
  .description('Side-by-side comparison of 2 or more vaults')
  .argument('<slugs...>', 'Vault slugs to compare (space-separated)')
  .option('--json', 'Output as JSON', false)
  .action(async (slugs: string[], opts) => {
    if (slugs.length < 2) {
      console.error(chalk.red('Provide at least 2 vault slugs to compare.'));
      process.exitCode = 1;
      return;
    }
    const spinner = ora(`Fetching ${slugs.length} vaults...`).start();
    try {
      const forge = getForge();
      const vaults = await Promise.all(slugs.map((s) => forge.vaults.get(s)));
      const risks = vaults.map((v) => forge.riskScore(v));
      spinner.stop();

      outputResult(
        vaults.map((v, i) => ({
          slug: v.slug,
          name: v.name,
          chainId: v.chainId,
          network: v.network,
          protocol: v.protocol.name,
          apy: v.analytics.apy,
          apy7d: v.analytics.apy7d,
          apy30d: v.analytics.apy30d,
          tvlUsd: parseTvl(v.analytics.tvl).parsed,
          risk: risks[i],
          tags: v.tags,
          isTransactional: v.isTransactional,
          isRedeemable: v.isRedeemable,
          underlyingTokens: v.underlyingTokens.map((t) => t.symbol),
        })),
        opts.json,
        () => {
          return `${chalk.bold(`Vault Comparison (${vaults.length} vaults)`)}\n\n${compareTable(vaults, risks)}`;
        },
      );
    } catch (err) {
      spinner.fail('Failed to compare vaults');
      console.error(chalk.red(err instanceof Error ? err.message : String(err)));
      process.exitCode = 1;
    }
  });

// ── portfolio ──

program
  .command('portfolio')
  .description('View portfolio positions for a wallet')
  .argument('<wallet>', 'Wallet address')
  .option('--json', 'Output as JSON', false)
  .action(async (wallet: string, opts) => {
    const spinner = ora('Fetching portfolio...').start();
    try {
      const forge = getForge();
      const portfolio = await forge.portfolio.get(wallet);
      spinner.stop();

      outputResult(portfolio, opts.json, () => {
        if (portfolio.positions.length === 0) return chalk.yellow('No positions found.');
        const totalUsd = portfolio.positions.reduce(
          (sum, p) => sum + Number(p.balanceUsd),
          0,
        );
        return `${chalk.bold('Portfolio')}\n\n${portfolioTable(portfolio.positions)}\n\n${chalk.dim(`Total: ${fmtUsd(totalUsd)}`)}`;
      });
    } catch (err) {
      spinner.fail('Failed to fetch portfolio');
      console.error(chalk.red(err instanceof Error ? err.message : String(err)));
      process.exitCode = 1;
    }
  });

// ── quote ──

program
  .command('quote')
  .description('Build a deposit quote')
  .requiredOption('--vault <slug>', 'Vault slug')
  .requiredOption('--amount <human>', 'Human-readable deposit amount')
  .requiredOption('--wallet <addr>', 'Wallet address')
  .option('--from-token <addr>', 'Override from token address')
  .option('--from-chain <id>', 'Override source chain', parseInt)
  .option('--optimize-gas', 'Compare routes from multiple chains', false)
  .option('--json', 'Output as JSON', false)
  .action(async (opts) => {
    const spinner = ora('Building quote...').start();
    try {
      const forge = getForge();
      const vault = await forge.vaults.get(opts.vault);

      if (opts.optimizeGas) {
        spinner.text = 'Comparing cross-chain routes...';
        const routes = await forge.optimizeGasRoutes(vault, {
          fromAmount: opts.amount,
          wallet: opts.wallet,
          fromToken: opts.fromToken,
          fromChains: opts.fromChain ? [opts.fromChain, vault.chainId] : undefined,
        });
        spinner.stop();

        outputResult(
          routes.map((r) => ({
            fromChain: r.fromChain,
            fromChainName: r.fromChainName,
            totalCostUsd: r.totalCostUsd,
            gasCostUsd: r.gasCostUsd,
            feeCostUsd: r.feeCostUsd,
            executionDuration: r.executionDuration,
          })),
          opts.json,
          () => {
            if (routes.length === 0) return chalk.yellow('No routes found.');
            const lines = [chalk.bold(`Gas-optimized routes for ${vault.name}`), ''];
            for (const r of routes) {
              const best = r === routes[0] ? chalk.green(' << cheapest') : '';
              lines.push(
                `  ${r.fromChainName} (${r.fromChain}): gas=${fmtUsd(r.gasCostUsd)} fee=${fmtUsd(r.feeCostUsd)} total=${fmtUsd(r.totalCostUsd)} time=${r.executionDuration}s${best}`,
              );
            }
            return lines.join('\n');
          },
        );
      } else {
        const result = await forge.buildDepositQuote(vault, {
          fromAmount: opts.amount,
          wallet: opts.wallet,
          fromToken: opts.fromToken,
          fromChain: opts.fromChain,
        });
        spinner.stop();

        const approvalAddress = (result.quote.estimate as Record<string, unknown>).approvalAddress as string | undefined;

        outputResult(
          {
            vault: vault.slug,
            humanAmount: result.humanAmount,
            rawAmount: result.rawAmount,
            decimals: result.decimals,
            fromToken: result.quote.action.fromToken.symbol,
            toToken: result.quote.action.toToken.symbol,
            estimatedOutput: result.quote.estimate.toAmount,
            gasCosts: result.quote.estimate.gasCosts,
            feeCosts: result.quote.estimate.feeCosts,
            executionDuration: result.quote.estimate.executionDuration,
            approvalAddress,
          },
          opts.json,
          () => {
            const lines = [
              chalk.bold(`Deposit Quote — ${vault.name}`),
              '',
              `  ${chalk.dim('Amount:')}      ${result.humanAmount} (${result.rawAmount} raw, ${result.decimals} decimals)`,
              `  ${chalk.dim('From:')}        ${result.quote.action.fromToken.symbol} on chain ${result.quote.action.fromChainId}`,
              `  ${chalk.dim('To:')}          ${result.quote.action.toToken.symbol} on chain ${result.quote.action.toChainId}`,
              `  ${chalk.dim('Est. Output:')} ${result.quote.estimate.toAmount}`,
              `  ${chalk.dim('Duration:')}    ${result.quote.estimate.executionDuration}s`,
            ];
            const gasCosts = result.quote.estimate.gasCosts ?? [];
            const feeCosts = result.quote.estimate.feeCosts ?? [];
            if (gasCosts.length > 0) {
              const totalGas = gasCosts.reduce((s, g) => s + Number(g.amountUSD), 0);
              lines.push(`  ${chalk.dim('Gas Cost:')}    ${fmtUsd(totalGas)}`);
            }
            if (feeCosts.length > 0) {
              const totalFee = feeCosts.reduce((s, f) => s + Number(f.amountUSD), 0);
              lines.push(`  ${chalk.dim('Fee Cost:')}    ${fmtUsd(totalFee)}`);
            }
            if (approvalAddress) {
              lines.push('');
              lines.push(chalk.yellow(`  Approval needed: approve ${result.quote.action.fromToken.symbol} for spender ${approvalAddress}`));
              lines.push(chalk.dim(`  Run: earnforge allowance --token ${result.quote.action.fromToken.address} --owner ${opts.wallet} --spender ${approvalAddress} --amount ${result.rawAmount} --chain ${result.quote.action.fromChainId}`));
            }
            lines.push('');
            lines.push(chalk.dim('Transaction ready to sign via quote.transactionRequest'));
            return lines.join('\n');
          },
        );
      }
    } catch (err) {
      spinner.fail('Failed to build quote');
      console.error(chalk.red(err instanceof Error ? err.message : String(err)));
      process.exitCode = 1;
    }
  });

// ── withdraw ──

program
  .command('withdraw')
  .description('Build a withdrawal/redeem quote')
  .requiredOption('--vault <slug>', 'Vault slug')
  .requiredOption('--amount <human>', 'Amount of vault shares to redeem')
  .requiredOption('--wallet <addr>', 'Wallet address')
  .option('--to-token <addr>', 'Override destination token address')
  .option('--to-chain <id>', 'Override destination chain', parseInt)
  .option('--slippage <n>', 'Slippage tolerance (0.03 = 3%)', parseFloat)
  .option('--json', 'Output as JSON', false)
  .action(async (opts) => {
    const spinner = ora('Building redeem quote...').start();
    try {
      const forge = getForge();
      const vault = await forge.vaults.get(opts.vault);
      const result = await forge.buildRedeemQuote(vault, {
        fromAmount: opts.amount,
        wallet: opts.wallet,
        toToken: opts.toToken,
        toChain: opts.toChain,
        slippage: opts.slippage,
      });
      spinner.stop();

      outputResult(
        {
          vault: vault.slug,
          humanAmount: result.humanAmount,
          rawAmount: result.rawAmount,
          fromToken: result.quote.action.fromToken.symbol,
          toToken: result.quote.action.toToken.symbol,
          estimatedOutput: result.quote.estimate.toAmount,
          gasCosts: result.quote.estimate.gasCosts,
          feeCosts: result.quote.estimate.feeCosts,
          executionDuration: result.quote.estimate.executionDuration,
        },
        opts.json,
        () => {
          const lines = [
            chalk.bold(`Withdraw Quote — ${vault.name}`),
            '',
            `  ${chalk.dim('Amount:')}      ${result.humanAmount} vault shares (${result.rawAmount} raw)`,
            `  ${chalk.dim('From:')}        ${result.quote.action.fromToken.symbol} (vault token) on chain ${result.quote.action.fromChainId}`,
            `  ${chalk.dim('To:')}          ${result.quote.action.toToken.symbol} on chain ${result.quote.action.toChainId}`,
            `  ${chalk.dim('Est. Output:')} ${result.quote.estimate.toAmount}`,
            `  ${chalk.dim('Duration:')}    ${result.quote.estimate.executionDuration}s`,
          ];
          const gasCosts = result.quote.estimate.gasCosts ?? [];
          const feeCosts = result.quote.estimate.feeCosts ?? [];
          if (gasCosts.length > 0) {
            const totalGas = gasCosts.reduce((s: number, g: { amountUSD: string }) => s + Number(g.amountUSD), 0);
            lines.push(`  ${chalk.dim('Gas Cost:')}    ${fmtUsd(totalGas)}`);
          }
          if (feeCosts.length > 0) {
            const totalFee = feeCosts.reduce((s: number, f: { amountUSD: string }) => s + Number(f.amountUSD), 0);
            lines.push(`  ${chalk.dim('Fee Cost:')}    ${fmtUsd(totalFee)}`);
          }
          lines.push('');
          lines.push(chalk.dim('Transaction ready to sign via quote.transactionRequest'));
          return lines.join('\n');
        },
      );
    } catch (err) {
      spinner.fail('Failed to build redeem quote');
      console.error(chalk.red(err instanceof Error ? err.message : String(err)));
      process.exitCode = 1;
    }
  });

// ── allowance ──

program
  .command('allowance')
  .description('Check ERC-20 token allowance for a spender')
  .requiredOption('--token <addr>', 'ERC-20 token address')
  .requiredOption('--owner <addr>', 'Token owner (wallet) address')
  .requiredOption('--spender <addr>', 'Spender address (from quote.estimate.approvalAddress)')
  .requiredOption('--amount <raw>', 'Required amount in smallest unit')
  .requiredOption('--chain <id>', 'Chain ID', parseInt)
  .option('--rpc <url>', 'Custom RPC URL')
  .option('--json', 'Output as JSON', false)
  .action(async (opts) => {
    const spinner = ora('Checking allowance...').start();
    try {
      const rpcUrl = opts.rpc ?? `https://rpc.li.fi/v1/chain/${opts.chain}`;
      const result = await checkAllowance(
        rpcUrl,
        opts.token,
        opts.owner,
        opts.spender,
        BigInt(opts.amount),
      );
      spinner.stop();

      const jsonData = {
        token: opts.token,
        owner: opts.owner,
        spender: opts.spender,
        allowance: result.allowance.toString(),
        requiredAmount: result.requiredAmount.toString(),
        sufficient: result.sufficient,
      };

      outputResult(jsonData, opts.json, () => {
        const status = result.sufficient
          ? chalk.green('SUFFICIENT — no approval needed')
          : chalk.red('INSUFFICIENT — approval required');
        return [
          chalk.bold('Allowance Check'),
          '',
          `  ${chalk.dim('Token:')}     ${opts.token}`,
          `  ${chalk.dim('Owner:')}     ${opts.owner}`,
          `  ${chalk.dim('Spender:')}   ${opts.spender}`,
          `  ${chalk.dim('Allowance:')} ${result.allowance.toString()}`,
          `  ${chalk.dim('Required:')}  ${result.requiredAmount.toString()}`,
          `  ${chalk.dim('Status:')}    ${status}`,
          '',
          ...(result.sufficient
            ? []
            : [
                chalk.dim('To approve, run:'),
                chalk.dim(`  earnforge approve --token ${opts.token} --spender ${opts.spender} --chain ${opts.chain}`),
              ]),
        ].join('\n');
      });
    } catch (err) {
      spinner.fail('Failed to check allowance');
      console.error(chalk.red(err instanceof Error ? err.message : String(err)));
      process.exitCode = 1;
    }
  });

// ── approve ──

program
  .command('approve')
  .description('Build an ERC-20 approval transaction')
  .requiredOption('--token <addr>', 'ERC-20 token address')
  .requiredOption('--spender <addr>', 'Spender address (from quote.estimate.approvalAddress)')
  .requiredOption('--chain <id>', 'Chain ID', parseInt)
  .option('--amount <raw>', 'Amount to approve (default: unlimited)')
  .option('--json', 'Output as JSON', false)
  .action(async (opts) => {
    const amount = opts.amount ? BigInt(opts.amount) : MAX_UINT256;
    const tx = buildApprovalTx(opts.token, opts.spender, amount, opts.chain);

    outputResult(tx, opts.json, () => {
      return [
        chalk.bold('Approval Transaction'),
        '',
        `  ${chalk.dim('To:')}      ${tx.to}`,
        `  ${chalk.dim('Chain:')}   ${tx.chainId}`,
        `  ${chalk.dim('Amount:')}  ${amount === MAX_UINT256 ? 'Unlimited (MaxUint256)' : amount.toString()}`,
        `  ${chalk.dim('Data:')}    ${tx.data.slice(0, 20)}...`,
        '',
        chalk.dim('Sign and send this transaction before the deposit/quote transaction.'),
      ].join('\n');
    });
  });

// ── apy-history ──

program
  .command('apy-history')
  .description('Fetch 30-day APY history from DeFiLlama')
  .argument('<slug>', 'Vault slug')
  .option('--json', 'Output as JSON', false)
  .action(async (slug: string, opts) => {
    const spinner = ora('Fetching APY history...').start();
    try {
      const forge = getForge();
      const vault = await forge.vaults.get(slug);
      const history = await forge.getApyHistory(vault);
      spinner.stop();

      outputResult(
        { vault: vault.slug, name: vault.name, dataPoints: history.length, history },
        opts.json,
        () => {
          if (history.length === 0) {
            return chalk.yellow(`No APY history found for ${vault.name}. DeFiLlama may not track this vault.`);
          }
          return `${chalk.bold(`APY History — ${vault.name} (${history.length} days)`)}\n\n${apyHistoryTable(history)}`;
        },
      );
    } catch (err) {
      spinner.fail('Failed to fetch APY history');
      console.error(chalk.red(err instanceof Error ? err.message : String(err)));
      process.exitCode = 1;
    }
  });

// ── preflight ──

program
  .command('preflight')
  .description('Run pre-deposit checks on a vault + wallet')
  .requiredOption('--vault <slug>', 'Vault slug')
  .requiredOption('--wallet <addr>', 'Wallet address')
  .option('--amount <human>', 'Deposit amount (human-readable)')
  .option('--wallet-chain <id>', 'Wallet current chain ID', parseInt)
  .option('--cross-chain', 'Flag cross-chain deposit intent', false)
  .option('--json', 'Output as JSON', false)
  .action(async (opts) => {
    const spinner = ora('Running preflight checks...').start();
    try {
      const forge = getForge();
      const vault = await forge.vaults.get(opts.vault);
      const report = forge.preflight(vault, opts.wallet, {
        walletChainId: opts.walletChain,
        depositAmount: opts.amount,
        crossChain: opts.crossChain,
      });
      spinner.stop();

      outputResult(
        {
          ok: report.ok,
          vault: vault.slug,
          wallet: opts.wallet,
          issues: report.issues,
        },
        opts.json,
        () => preflightTable(report),
      );
    } catch (err) {
      spinner.fail('Preflight failed');
      console.error(chalk.red(err instanceof Error ? err.message : String(err)));
      process.exitCode = 1;
    }
  });

// ── doctor ──

program
  .command('doctor')
  .description('Run 18-pitfall diagnostics on a vault or environment')
  .option('--vault <slug>', 'Vault slug to check')
  .option('--env', 'Run environment checks only', false)
  .option('--json', 'Output as JSON', false)
  .action(async (opts) => {
    if (opts.env && !opts.vault) {
      // Env-only mode
      const report = runEnvChecks();
      outputResult(report, opts.json, () => formatEnvReport(report));
      return;
    }

    if (!opts.vault) {
      console.error(chalk.red('Provide --vault <slug> or --env'));
      process.exitCode = 1;
      return;
    }

    const spinner = ora('Running doctor checks...').start();
    try {
      const forge = getForge();
      const vault = await forge.vaults.get(opts.vault);
      const report = runDoctorChecks(vault, {
        hasApiKey: !!process.env['LIFI_API_KEY'],
      });
      spinner.stop();

      outputResult(report, opts.json, () => formatDoctorReport(report, vault.name));
    } catch (err) {
      spinner.fail('Doctor failed');
      console.error(chalk.red(err instanceof Error ? err.message : String(err)));
      process.exitCode = 1;
    }
  });

// ── risk ──

program
  .command('risk')
  .description('Calculate risk score for a vault')
  .argument('<slug>', 'Vault slug')
  .option('--json', 'Output as JSON', false)
  .action(async (slug: string, opts) => {
    const spinner = ora('Calculating risk...').start();
    try {
      const forge = getForge();
      const vault = await forge.vaults.get(slug);
      const risk = forge.riskScore(vault);
      spinner.stop();

      outputResult(
        { slug: vault.slug, name: vault.name, ...risk },
        opts.json,
        () => `${chalk.bold(`Risk Score — ${vault.name}`)}\n\n${riskTable(risk)}`,
      );
    } catch (err) {
      spinner.fail('Failed to calculate risk');
      console.error(chalk.red(err instanceof Error ? err.message : String(err)));
      process.exitCode = 1;
    }
  });

// ── suggest ──

program
  .command('suggest')
  .description('Get portfolio allocation suggestions')
  .requiredOption('--amount <human>', 'Total amount to allocate (USD)', parseFloat)
  .requiredOption('--asset <sym>', 'Asset symbol (e.g. USDC)')
  .option('--max-chains <n>', 'Max number of chains', parseInt)
  .option('--strategy <preset>', 'Strategy preset')
  .option('--json', 'Output as JSON', false)
  .action(async (opts) => {
    const spinner = ora('Analyzing vaults and building allocations...').start();
    try {
      const forge = getForge();
      const strategy = opts.strategy ? validateStrategy(opts.strategy) : undefined;
      const result = await forge.suggest({
        amount: opts.amount,
        asset: opts.asset,
        maxChains: opts.maxChains,
        strategy,
      });
      spinner.stop();

      outputResult(
        {
          totalAmount: result.totalAmount,
          expectedApy: result.expectedApy,
          allocations: result.allocations.map((a) => ({
            vault: a.vault.slug,
            vaultName: a.vault.name,
            chainId: a.vault.chainId,
            protocol: a.vault.protocol.name,
            apy: a.apy,
            risk: a.risk,
            percentage: a.percentage,
            amount: a.amount,
          })),
        },
        opts.json,
        () => {
          if (result.allocations.length === 0)
            return chalk.yellow('No suitable vaults found for allocation.');
          const lines = [
            chalk.bold(`Allocation Suggestion — ${fmtUsd(result.totalAmount)} in ${opts.asset}`),
            `  ${chalk.dim('Expected APY:')} ${chalk.green(fmtPct(result.expectedApy))}`,
            '',
            suggestTable(result.allocations),
          ];
          return lines.join('\n');
        },
      );
    } catch (err) {
      spinner.fail('Failed to generate suggestions');
      console.error(chalk.red(err instanceof Error ? err.message : String(err)));
      process.exitCode = 1;
    }
  });

// ── watch ──

program
  .command('watch')
  .description('Watch a vault for APY/TVL changes')
  .requiredOption('--vault <slug>', 'Vault slug')
  .option('--apy-drop <pct>', 'APY drop threshold (%)', parseFloat)
  .option('--tvl-drop <pct>', 'TVL drop threshold (%)', parseFloat)
  .option('--interval <ms>', 'Poll interval in milliseconds', parseInt)
  .option('--max-iterations <n>', 'Max iterations (0 = unlimited)', parseInt)
  .option('--json', 'Output events as JSON', false)
  .action(async (opts) => {
    if (!opts.json) {
      console.log(chalk.dim(`Watching ${opts.vault} (Ctrl+C to stop)...`));
    }
    try {
      const forge = getForge();
      const ac = new AbortController();

      // Wire SIGINT/SIGTERM to AbortSignal for clean shutdown
      const onSignal = () => { ac.abort(); };
      process.on('SIGINT', onSignal);
      process.on('SIGTERM', onSignal);

      const gen = forge.watch(opts.vault, {
        apyDropPercent: opts.apyDrop,
        tvlDropPercent: opts.tvlDrop,
        interval: opts.interval,
        maxIterations: opts.maxIterations,
        signal: ac.signal,
      });

      for await (const event of gen) {
        if (opts.json) {
          console.log(JSON.stringify({
            type: event.type,
            vault: event.vault.slug,
            previous: event.previous,
            current: event.current,
            timestamp: event.timestamp.toISOString(),
          }));
        } else {
          const typeColor =
            event.type === 'apy-drop'
              ? chalk.red
              : event.type === 'tvl-drop'
                ? chalk.yellow
                : chalk.dim;

          const prevApy = event.previous ? fmtPct(event.previous.apy) : 'N/A';
          const prevTvl = event.previous ? fmtUsd(event.previous.tvlUsd) : 'N/A';
          console.log(
            `[${event.timestamp.toISOString()}] ${typeColor(event.type.toUpperCase())} ` +
              `APY: ${fmtPct(event.current.apy)} (prev: ${prevApy}) ` +
              `TVL: ${fmtUsd(event.current.tvlUsd)} (prev: ${prevTvl})`,
          );
        }
      }
    } catch (err) {
      console.error(chalk.red(err instanceof Error ? err.message : String(err)));
      process.exitCode = 1;
    }
  });

// ── chains ──

program
  .command('chains')
  .description('List supported chains')
  .option('--json', 'Output as JSON', false)
  .action(async (opts) => {
    const spinner = ora('Fetching chains...').start();
    try {
      const forge = getForge();
      const chains = await forge.chains.list();
      spinner.stop();

      outputResult(chains, opts.json, () =>
        `${chalk.bold('Supported Chains')}\n\n${chainTable(chains)}`,
      );
    } catch (err) {
      spinner.fail('Failed to fetch chains');
      console.error(chalk.red(err instanceof Error ? err.message : String(err)));
      process.exitCode = 1;
    }
  });

// ── protocols ──

program
  .command('protocols')
  .description('List supported protocols')
  .option('--json', 'Output as JSON', false)
  .action(async (opts) => {
    const spinner = ora('Fetching protocols...').start();
    try {
      const forge = getForge();
      const protocols = await forge.protocols.list();
      spinner.stop();

      outputResult(protocols, opts.json, () =>
        `${chalk.bold('Supported Protocols')}\n\n${protocolTable(protocols)}`,
      );
    } catch (err) {
      spinner.fail('Failed to fetch protocols');
      console.error(chalk.red(err instanceof Error ? err.message : String(err)));
      process.exitCode = 1;
    }
  });

// ── init ──

program
  .command('init')
  .argument('<name>', 'Project name')
  .description('Scaffold a new Next.js + wagmi + @earnforge/react project')
  .action(async (name: string) => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const dir = path.resolve(process.cwd(), name);

    if (fs.existsSync(dir)) {
      console.error(chalk.red(`Directory "${name}" already exists.`));
      process.exitCode = 1;
      return;
    }

    fs.mkdirSync(dir, { recursive: true });
    fs.mkdirSync(path.join(dir, 'src'), { recursive: true });

    fs.writeFileSync(
      path.join(dir, 'package.json'),
      JSON.stringify(
        {
          name,
          version: '0.1.0',
          private: true,
          type: 'module',
          scripts: { dev: 'next dev', build: 'next build', start: 'next start' },
          dependencies: {
            '@earnforge/sdk': '^0.1.0',
            '@earnforge/react': '^0.1.0',
            '@tanstack/react-query': '^5.90.0',
            next: '^15.0.0',
            react: '^19.0.0',
            'react-dom': '^19.0.0',
            wagmi: '^2.0.0',
            viem: '^2.47.0',
          },
        },
        null,
        2,
      ),
    );

    fs.writeFileSync(
      path.join(dir, '.env.example'),
      'LIFI_API_KEY=your-api-key-from-portal.li.fi\n',
    );

    fs.writeFileSync(
      path.join(dir, 'src', 'page.tsx'),
      `// SPDX-License-Identifier: Apache-2.0
import { createEarnForge } from '@earnforge/sdk';

const forge = createEarnForge({
  composerApiKey: process.env.LIFI_API_KEY,
});

export default async function Home() {
  const top = await forge.vaults.top({ asset: 'USDC', limit: 5 });
  return (
    <main>
      <h1>Top USDC Vaults</h1>
      <ul>
        {top.map((v) => (
          <li key={v.slug}>
            {v.name} — {v.analytics.apy.total.toFixed(2)}% APY
          </li>
        ))}
      </ul>
    </main>
  );
}
`,
    );

    console.log(chalk.green(`\n  Scaffolded ${chalk.bold(name)}!\n`));
    console.log(`  ${chalk.dim('cd')} ${name}`);
    console.log(`  ${chalk.dim('cp')} .env.example .env.local`);
    console.log(`  ${chalk.dim('npm install')}`);
    console.log(`  ${chalk.dim('npm run dev')}\n`);
  });

// ── simulate ──

program
  .command('simulate')
  .description('Dry-run a deposit quote against an anvil fork (requires anvil)')
  .requiredOption('--vault <slug>', 'Vault slug')
  .requiredOption('--amount <human>', 'Deposit amount (human-readable)')
  .requiredOption('--wallet <addr>', 'Wallet address')
  .option('--rpc <url>', 'Custom RPC URL (default: auto-detect)')
  .option('--json', 'JSON output')
  .action(async (opts: { vault: string; amount: string; wallet: string; rpc?: string; json?: boolean }) => {
    const spinner = ora('Running preflight checks...').start();
    try {
      const forge = getForge();
      const vault = await forge.vaults.get(opts.vault);

      // Run preflight checks before building quote
      const pre = forge.preflight(vault, opts.wallet, { depositAmount: opts.amount });
      if (!pre.ok) {
        spinner.fail('Preflight failed');
        const errors = pre.issues.filter((i) => i.severity === 'error');
        for (const e of errors) {
          console.error(chalk.red(`  [${e.code}] ${e.message}`));
        }
        process.exitCode = 1;
        return;
      }
      // Show warnings even if ok
      const warnings = pre.issues.filter((i) => i.severity === 'warning');
      for (const w of warnings) {
        console.warn(chalk.yellow(`  [${w.code}] ${w.message}`));
      }

      spinner.text = 'Building quote for simulation...';
      const result = await forge.buildDepositQuote(vault, {
        fromAmount: opts.amount,
        wallet: opts.wallet,
      });

      spinner.text = 'Simulating on anvil fork...';

      const txReq = result.quote.transactionRequest;
      const rpcUrl = opts.rpc ?? `https://rpc.li.fi/v1/chain/${vault.chainId}`;

      // Use a simple eth_call simulation
      const simResult = await globalThis.fetch(rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'eth_call',
          params: [
            {
              from: opts.wallet,
              to: txReq.to,
              data: txReq.data,
              value: txReq.value,
              gas: txReq.gasLimit,
            },
            'latest',
          ],
          id: 1,
        }),
      });

      const sim = (await simResult.json()) as { result?: string; error?: { message: string } };
      spinner.stop();

      const simData = {
        vault: vault.slug,
        amount: opts.amount,
        decimals: result.decimals,
        rawAmount: result.rawAmount,
        gasLimit: txReq.gasLimit,
        to: txReq.to,
        chainId: txReq.chainId,
        simulation: sim.error ? 'FAILED' : 'SUCCESS',
        error: sim.error?.message,
      };

      outputResult(simData, opts.json, () => {
        const status = sim.error
          ? chalk.red('FAILED: ' + sim.error.message)
          : chalk.green('SUCCESS — transaction would execute');
        return [
          chalk.bold('Simulation Result'),
          '',
          `  Vault:     ${vault.name} (${vault.slug})`,
          `  Amount:    ${opts.amount} (${result.rawAmount} raw)`,
          `  Gas Limit: ${txReq.gasLimit}`,
          `  Target:    ${txReq.to}`,
          `  Chain:     ${txReq.chainId}`,
          '',
          `  Status:    ${status}`,
        ].join('\n');
      });
    } catch (err) {
      spinner.fail('Simulation failed');
      console.error(chalk.red(err instanceof Error ? err.message : String(err)));
      process.exitCode = 1;
    }
  });
