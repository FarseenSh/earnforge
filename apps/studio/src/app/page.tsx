// SPDX-License-Identifier: Apache-2.0
import { VaultExplorer } from '@/components/VaultExplorer'
import { PortfolioSuggestion } from '@/components/PortfolioSuggestion'
import { WalletBar } from '@/components/WalletBar'

export default function HomePage() {
  return (
    <main>
      <WalletBar />
      <VaultExplorer />
      <PortfolioSuggestion />
    </main>
  )
}
