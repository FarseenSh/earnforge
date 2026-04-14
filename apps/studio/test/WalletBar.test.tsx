// SPDX-License-Identifier: Apache-2.0
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@rainbow-me/rainbowkit', () => ({
  ConnectButton: (props: Record<string, unknown>) => (
    <div data-testid="connect-button" data-props={JSON.stringify(props)}>
      ConnectButton
    </div>
  ),
}))

import { WalletBar } from '@/components/WalletBar'

describe('WalletBar', () => {
  it('renders the title "EarnForge Studio"', () => {
    render(<WalletBar />)
    expect(screen.getByText('EarnForge Studio')).toBeInTheDocument()
  })

  it('renders the subtitle about 623+ vaults', () => {
    render(<WalletBar />)
    expect(
      screen.getByText('Explore 623+ yield vaults across 16 chains')
    ).toBeInTheDocument()
  })

  it('renders the ConnectButton component', () => {
    render(<WalletBar />)
    expect(screen.getByTestId('connect-button')).toBeInTheDocument()
  })
})
