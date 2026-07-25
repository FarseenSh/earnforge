// SPDX-License-Identifier: Apache-2.0
'use client'

import { getDefaultConfig, RainbowKitProvider } from '@rainbow-me/rainbowkit'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { WagmiProvider } from 'wagmi'
import { arbitrum, base, mainnet, optimism, polygon } from 'wagmi/chains'
import '@rainbow-me/rainbowkit/styles.css'
import { type ReactNode, useState } from 'react'

const wagmiConfig = getDefaultConfig({
  appName: 'EarnForge Studio',
  projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_ID ?? 'earnforge-studio',
  chains: [base, mainnet, arbitrum, optimism, polygon],
  ssr: true,
})

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60_000,
            refetchOnWindowFocus: false,
          },
        },
      })
  )

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider>{children}</RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  )
}
