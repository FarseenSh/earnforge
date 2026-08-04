// SPDX-License-Identifier: Apache-2.0
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { VaultCard } from '@/components/VaultCard'
import {
  mockFlaggedVault,
  mockHighRiskScore,
  mockRiskScore,
  mockVault,
} from './helpers'

describe('VaultCard', () => {
  it('renders vault name and protocol', () => {
    const vault = mockVault()
    const risk = mockRiskScore()
    render(
      <VaultCard
        vault={vault}
        risk={risk}
        isSelected={false}
        onClick={() => {}}
      />
    )
    expect(screen.getByText('Test Vault USDC')).toBeInTheDocument()
    expect(screen.getByText('aave')).toBeInTheDocument()
  })

  it('displays APY formatted as percentage', () => {
    const vault = mockVault()
    const risk = mockRiskScore()
    render(
      <VaultCard
        vault={vault}
        risk={risk}
        isSelected={false}
        onClick={() => {}}
      />
    )
    // 0.045 * 100 = 4.50%
    expect(screen.getByText('4.50%')).toBeInTheDocument()
  })

  it('displays TVL formatted with suffix', () => {
    const vault = mockVault()
    const risk = mockRiskScore()
    render(
      <VaultCard
        vault={vault}
        risk={risk}
        isSelected={false}
        onClick={() => {}}
      />
    )
    expect(screen.getByText('$50.00M')).toBeInTheDocument()
  })

  it('shows stablecoin tag when vault has stablecoin tag', () => {
    const vault = mockVault({ tags: ['stablecoin'] })
    const risk = mockRiskScore()
    render(
      <VaultCard
        vault={vault}
        risk={risk}
        isSelected={false}
        onClick={() => {}}
      />
    )
    expect(screen.getByTestId('stablecoin-tag')).toBeInTheDocument()
  })

  it('does not show stablecoin tag when vault lacks the tag', () => {
    const vault = mockVault({ tags: [] })
    const risk = mockRiskScore()
    render(
      <VaultCard
        vault={vault}
        risk={risk}
        isSelected={false}
        onClick={() => {}}
      />
    )
    expect(screen.queryByTestId('stablecoin-tag')).not.toBeInTheDocument()
  })

  it('renders risk badge', () => {
    const vault = mockVault()
    const risk = mockRiskScore({ score: 8.5, label: 'low' })
    render(
      <VaultCard
        vault={vault}
        risk={risk}
        isSelected={false}
        onClick={() => {}}
      />
    )
    expect(screen.getByTestId('risk-badge')).toBeInTheDocument()
    expect(screen.getByTestId('risk-badge')).toHaveTextContent('8.5')
  })

  it('calls onClick when clicked', () => {
    const vault = mockVault()
    const risk = mockRiskScore()
    const onClick = vi.fn()
    render(
      <VaultCard
        vault={vault}
        risk={risk}
        isSelected={false}
        onClick={onClick}
      />
    )
    fireEvent.click(screen.getByTestId('vault-card'))
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('applies selected styling when isSelected is true', () => {
    const vault = mockVault()
    const risk = mockRiskScore()
    render(
      <VaultCard
        vault={vault}
        risk={risk}
        isSelected={true}
        onClick={() => {}}
      />
    )
    const card = screen.getByTestId('vault-card')
    expect(card.className).toContain('border-[var(--color-primary)]')
  })

  it('shows chain ID', () => {
    const vault = mockVault({ chainId: 42161 })
    const risk = mockRiskScore()
    render(
      <VaultCard
        vault={vault}
        risk={risk}
        isSelected={false}
        onClick={() => {}}
      />
    )
    expect(screen.getByText('Chain 42161')).toBeInTheDocument()
  })

  it('renders description when present', () => {
    const vault = mockVault({ description: 'A great vault for stablecoins' })
    const risk = mockRiskScore()
    render(
      <VaultCard
        vault={vault}
        risk={risk}
        isSelected={false}
        onClick={() => {}}
      />
    )
    expect(
      screen.getByText('A great vault for stablecoins')
    ).toBeInTheDocument()
  })

  it('warns that a vault is flagged, with the reason', () => {
    // Studio computed verificationStatus and showed none of it. A flagged vault
    // rendered identically to any other — same layout, same APY, no warning —
    // which is how an outlier ends up looking like a recommendation.
    render(
      <VaultCard
        vault={mockFlaggedVault()}
        risk={mockHighRiskScore()}
        isSelected={false}
        onClick={() => {}}
      />
    )
    const warning = screen.getByTestId('flagged-warning')
    expect(warning).toHaveTextContent('Flagged by LI.FI')
    expect(warning).toHaveTextContent('zero_apy')
  })

  it('shows no warning on a vault that is not flagged', () => {
    render(
      <VaultCard
        vault={mockVault()}
        risk={mockRiskScore()}
        isSelected={false}
        onClick={() => {}}
      />
    )
    expect(screen.queryByTestId('flagged-warning')).toBeNull()
  })

  it('lists the risk flags, which say what the score cannot', () => {
    render(
      <VaultCard
        vault={mockVault()}
        risk={mockRiskScore({
          score: 5.5,
          label: 'high',
          flags: ['87% of APY comes from token incentives'],
        })}
        isSelected={false}
        onClick={() => {}}
      />
    )
    expect(screen.getByTestId('risk-flags')).toHaveTextContent(
      '87% of APY comes from token incentives'
    )
  })

  it('omits the flag list entirely when there is nothing to report', () => {
    render(
      <VaultCard
        vault={mockVault()}
        risk={mockRiskScore({ flags: [] })}
        isSelected={false}
        onClick={() => {}}
      />
    )
    expect(screen.queryByTestId('risk-flags')).toBeNull()
  })
})
