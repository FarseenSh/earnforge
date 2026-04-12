// SPDX-License-Identifier: Apache-2.0
'use client';

import { ConnectButton } from '@rainbow-me/rainbowkit';

export function WalletBar() {
  return (
    <div className="mb-6 flex items-center justify-between rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-4">
      <div>
        <h1 className="text-xl font-bold text-[var(--color-text)]">
          EarnForge Studio
        </h1>
        <p className="text-xs text-[var(--color-text-muted)]">
          Explore 623+ yield vaults across 16 chains
        </p>
      </div>
      <ConnectButton
        showBalance={true}
        chainStatus="icon"
        accountStatus="address"
      />
    </div>
  );
}
