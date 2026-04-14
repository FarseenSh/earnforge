// SPDX-License-Identifier: Apache-2.0
'use client'

import type { Vault } from '@earnforge/sdk'
import { useState } from 'react'

type CodeTab = 'typescript' | 'react' | 'curl' | 'withdraw'

interface CodeGeneratorProps {
  vault: Vault
  onClose: () => void
}

function generateTypeScript(vault: Vault): string {
  return `import { createEarnForge } from '@earnforge/sdk';

const forge = createEarnForge({
  composerApiKey: process.env.LIFI_API_KEY,
});

// Fetch vault by slug
const vault = await forge.vaults.get('${vault.slug}');
console.log(vault.name, vault.analytics.apy.total);

// Get risk score
const risk = forge.riskScore(vault);
console.log('Risk:', risk.score, risk.label);

// Build deposit quote (correct field names from DepositQuoteOptions)
const quote = await forge.buildDepositQuote(vault, {
  fromAmount: '100',           // human-readable, auto-converted to smallest unit
  wallet: '0xYourWallet',      // your wallet address
  fromToken: '${vault.underlyingTokens[0]?.address ?? '0x...'}',
  fromChain: ${vault.chainId},            // source chain (omit for same-chain)
});
console.log('Tx to sign:', quote.quote.transactionRequest);`
}

function generateReact(vault: Vault): string {
  return `import {
  EarnForgeProvider, useVault, useRiskScore,
  useEarnDeposit, useEarnRedeem, useApyHistory,
} from '@earnforge/react';
import { createEarnForge } from '@earnforge/sdk';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const queryClient = new QueryClient();
// SECURITY: Use LIFI_API_KEY (server-only), never NEXT_PUBLIC_ prefix
const forge = createEarnForge({ composerApiKey: process.env.LIFI_API_KEY });

// Wrap your app:
// <QueryClientProvider client={queryClient}>
//   <EarnForgeProvider sdk={forge}>
//     <VaultDetail />
//   </EarnForgeProvider>
// </QueryClientProvider>

function VaultDetail() {
  const { data: vault, isLoading } = useVault('${vault.slug}');
  const risk = useRiskScore(vault);
  // Pass rpcUrl for automatic allowance checking before deposit
  const deposit = useEarnDeposit({
    vault,
    amount: '100',
    wallet: '0xYourWallet',
    rpcUrl: 'https://mainnet.base.org', // JSON-RPC for allowance check
    sendTransactionAsync,               // from wagmi useSendTransaction()
  });
  const redeem = useEarnRedeem({
    vault,
    amount: '50',
    wallet: '0xYourWallet',
    sendTransactionAsync,
  });
  // Full vault object gives better DeFiLlama matching than address+chainId
  const { data: apyHistory } = useApyHistory(vault);

  if (isLoading) return <div>Loading...</div>;
  if (!vault) return <div>Not found</div>;

  return (
    <div>
      <h2>{vault.name}</h2>
      <p>APY: {vault.analytics.apy.total.toFixed(2)}%</p>
      <p>Risk: {risk?.score}/10 ({risk?.label})</p>
      <button onClick={() => deposit.prepare()}>
        Deposit ({deposit.state.phase})
      </button>
      {vault.isRedeemable && (
        <button onClick={() => redeem.prepare()}>
          Withdraw ({redeem.state.phase})
        </button>
      )}
    </div>
  );
}`
}

function generateCurl(vault: Vault): string {
  const underlying = vault.underlyingTokens[0]
  const fromToken = underlying?.address ?? '0x_FROM_TOKEN'
  const decimals = underlying?.decimals ?? 18
  const fromAmount = '1' + '0'.repeat(decimals) // 1 token in smallest unit
  return `# Get vault details (Earn Data API — no auth needed)
curl -s "https://earn.li.fi/v1/earn/vaults/${vault.chainId}/${vault.address}" | jq '.'

# List vaults on chain ${vault.chainId}
curl -s "https://earn.li.fi/v1/earn/vaults?chainId=${vault.chainId}" | jq '.data[:5]'

# Build deposit quote (Composer — requires API key, uses GET not POST)
# toToken = vault address (NOT underlying token) — Pitfall #5
curl -s -H "x-lifi-api-key: YOUR_KEY" \\
  "https://li.quest/v1/quote?fromChain=${vault.chainId}&toChain=${vault.chainId}&fromToken=${fromToken}&toToken=${vault.address}&fromAddress=0xYOUR_WALLET&toAddress=0xYOUR_WALLET&fromAmount=${fromAmount}" \\
  | jq '.transactionRequest'`
}

function generateWithdraw(vault: Vault): string {
  const underlying = vault.underlyingTokens[0]
  const toToken = underlying?.address ?? '0x_UNDERLYING_TOKEN'
  return `import { createEarnForge } from '@earnforge/sdk';

const forge = createEarnForge({
  composerApiKey: process.env.LIFI_API_KEY,
});

// Fetch vault
const vault = await forge.vaults.get('${vault.slug}');

// Check if vault supports withdrawals
if (!vault.isRedeemable) {
  console.error('This vault does not support withdrawals');
  process.exit(1);
}

// Build redeem/withdrawal quote
// fromToken = vault address (share token), toToken = underlying
const redeemQuote = await forge.buildRedeemQuote(vault, {
  fromAmount: '100',              // amount of vault share tokens to redeem
  wallet: '0xYourWallet',
  toToken: '${toToken}',  // token to receive (defaults to underlying)
  toChain: ${vault.chainId},              // destination chain (defaults to vault chain)
});
console.log('Redeem tx to sign:', redeemQuote.quote.transactionRequest);

// Check ERC-20 allowance before sending (optional but recommended)
import { checkAllowance, buildApprovalTx, MAX_UINT256 } from '@earnforge/sdk';
const allowance = await checkAllowance(
  'YOUR_RPC_URL',
  vault.address,           // vault share token needs approval
  '0xYourWallet',
  redeemQuote.quote.estimate?.approvalAddress ?? vault.address,
  BigInt(redeemQuote.rawAmount),
);
if (!allowance.sufficient) {
  const approvalTx = buildApprovalTx(
    vault.address,
    redeemQuote.quote.estimate?.approvalAddress ?? vault.address,
    MAX_UINT256,
    ${vault.chainId},
  );
  console.log('Send approval first:', approvalTx);
}`
}

const TABS: { id: CodeTab; label: string }[] = [
  { id: 'typescript', label: 'TypeScript (SDK)' },
  { id: 'react', label: 'React (Hooks)' },
  { id: 'withdraw', label: 'Withdraw (SDK)' },
  { id: 'curl', label: 'curl' },
]

export function CodeGenerator({ vault, onClose }: CodeGeneratorProps) {
  const [activeTab, setActiveTab] = useState<CodeTab>('typescript')
  const [copied, setCopied] = useState(false)

  const generators: Record<CodeTab, (v: Vault) => string> = {
    typescript: generateTypeScript,
    react: generateReact,
    withdraw: generateWithdraw,
    curl: generateCurl,
  }

  const code = generators[activeTab](vault)

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard API may fail in some contexts
    }
  }

  return (
    <div
      data-testid="code-generator"
      className="mt-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-4"
    >
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-[var(--color-text)]">
          Code for {vault.name}
        </h3>
        <button
          onClick={onClose}
          data-testid="code-generator-close"
          className="rounded-lg px-2 py-1 text-xs text-[var(--color-text-muted)] hover:bg-[var(--color-card-hover)] hover:text-[var(--color-text)]"
        >
          Close
        </button>
      </div>

      <div className="mb-3 flex gap-1">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            data-testid={`code-tab-${tab.id}`}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              activeTab === tab.id
                ? 'bg-[var(--color-primary)] text-white'
                : 'text-[var(--color-text-muted)] hover:bg-[var(--color-card-hover)] hover:text-[var(--color-text)]'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="relative">
        <pre className="overflow-x-auto rounded-lg bg-[var(--color-bg)] p-4 text-xs leading-relaxed text-[var(--color-text-muted)]">
          <code>{code}</code>
        </pre>
        <button
          onClick={handleCopy}
          data-testid="code-copy-button"
          className="absolute right-2 top-2 rounded-md bg-[var(--color-card)] px-2 py-1 text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
        >
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>
    </div>
  )
}
