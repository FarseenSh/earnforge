// SPDX-License-Identifier: Apache-2.0
import type { Metadata } from 'next'
import { Providers } from '@/components/Providers'
import './globals.css'

export const metadata: Metadata = {
  title: 'EarnForge Studio | LI.FI Earn Vault Explorer',
  description:
    'Explore, analyze, and integrate LI.FI Earn vaults with risk scoring, strategy presets, and code generation.',
  keywords: ['LI.FI', 'Earn', 'DeFi', 'Vaults', 'Yield', 'SDK'],
  openGraph: {
    title: 'EarnForge Studio',
    description:
      'Explore LI.FI Earn vaults with risk scoring and code generation.',
    type: 'website',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
