// SPDX-License-Identifier: Apache-2.0
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@earnforge/sdk', () => ({}))

vi.mock('@/lib/earnforge', () => ({
  getEarnForge: vi.fn(() => ({
    vaults: { listAll: vi.fn(async function* () {}) },
    suggest: vi
      .fn()
      .mockResolvedValue({ totalAmount: 0, expectedApy: 0, allocations: [] }),
  })),
}))

import { PortfolioSuggestion } from '@/components/PortfolioSuggestion'

describe('PortfolioSuggestion', () => {
  it('renders the component with form inputs', () => {
    render(<PortfolioSuggestion />)
    const container = screen.getByTestId('portfolio-suggestion')
    expect(container).toBeInTheDocument()

    // Amount input (type=number)
    const amountInput = container.querySelector('input[type="number"]')
    expect(amountInput).toBeInTheDocument()

    // Asset input (type=text)
    const assetInput = container.querySelector('input[type="text"]')
    expect(assetInput).toBeInTheDocument()

    // Strategy select
    const strategySelect = container.querySelector('select')
    expect(strategySelect).toBeInTheDocument()
  })

  it('renders the "Get Suggestion" button', () => {
    render(<PortfolioSuggestion />)
    expect(screen.getByText('Get Suggestion')).toBeInTheDocument()
  })

  it('shows error when amount is empty and button clicked', () => {
    render(<PortfolioSuggestion />)
    fireEvent.click(screen.getByText('Get Suggestion'))
    expect(screen.getByText('Enter a positive amount.')).toBeInTheDocument()
  })

  it('renders "Portfolio Suggestion" heading', () => {
    render(<PortfolioSuggestion />)
    expect(screen.getByText('Portfolio Suggestion')).toBeInTheDocument()
  })
})
