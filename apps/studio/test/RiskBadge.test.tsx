// SPDX-License-Identifier: Apache-2.0
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { RiskBadge } from '@/components/RiskBadge'

describe('RiskBadge', () => {
  it('renders a low risk badge with green styling', () => {
    render(<RiskBadge score={8.5} label="low" />)
    const badge = screen.getByTestId('risk-badge')
    expect(badge).toBeInTheDocument()
    expect(badge).toHaveTextContent('8.5')
    expect(badge).toHaveTextContent('low')
    expect(badge.className).toContain('green')
  })

  it('renders a medium risk badge with yellow styling', () => {
    render(<RiskBadge score={5.0} label="medium" />)
    const badge = screen.getByTestId('risk-badge')
    expect(badge).toHaveTextContent('5.0')
    expect(badge).toHaveTextContent('medium')
    expect(badge.className).toContain('yellow')
  })

  it('renders a high risk badge with red styling', () => {
    render(<RiskBadge score={2.0} label="high" />)
    const badge = screen.getByTestId('risk-badge')
    expect(badge).toHaveTextContent('2.0')
    expect(badge).toHaveTextContent('high')
    expect(badge.className).toContain('red')
  })

  it('formats score to one decimal place', () => {
    render(<RiskBadge score={7} label="low" />)
    const badge = screen.getByTestId('risk-badge')
    expect(badge).toHaveTextContent('7.0')
  })

  it('colours by label, not by re-deriving from the score', () => {
    // The bug this replaces: the badge had its own `>= 7` cutoff while risk
    // scorer v2 labels at 8. A 7.5 scored `medium` rendered green — the colour
    // contradicting the word next to it. Every previous test passed a score and
    // label that already agreed, so none of them could catch it.
    render(<RiskBadge score={7.5} label="medium" />)
    const badge = screen.getByTestId('risk-badge')
    expect(badge.className).toContain('yellow')
    expect(badge.className).not.toContain('green')
  })

  it('renders the 8 boundary as low', () => {
    render(<RiskBadge score={8} label="low" />)
    expect(screen.getByTestId('risk-badge').className).toContain('green')
  })

  it('renders the 6 boundary as medium', () => {
    render(<RiskBadge score={6} label="medium" />)
    expect(screen.getByTestId('risk-badge').className).toContain('yellow')
  })

  it('never renders a flagged-vault score as low', () => {
    // Verification carries 0.22 of the weight, so a flagged vault caps at 7.96
    // and the SDK can never label it `low`. 7.9/high must not look safe.
    render(<RiskBadge score={7.9} label="high" />)
    expect(screen.getByTestId('risk-badge').className).toContain('red')
  })
})
