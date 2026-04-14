// SPDX-License-Identifier: Apache-2.0
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { CodeGenerator } from '@/components/CodeGenerator'
import { mockVault } from './helpers'

describe('CodeGenerator', () => {
  it('renders with vault name in heading', () => {
    const vault = mockVault()
    render(<CodeGenerator vault={vault} onClose={() => {}} />)
    expect(screen.getByTestId('code-generator')).toBeInTheDocument()
    expect(screen.getByText(/Test Vault USDC/)).toBeInTheDocument()
  })

  it('shows TypeScript tab as default', () => {
    const vault = mockVault()
    render(<CodeGenerator vault={vault} onClose={() => {}} />)
    const code =
      screen.getByRole('code') ??
      screen.getByTestId('code-generator').querySelector('code')
    expect(code?.textContent).toContain('createEarnForge')
    expect(code?.textContent).toContain(vault.slug)
  })

  it('switches to React tab on click', () => {
    const vault = mockVault()
    render(<CodeGenerator vault={vault} onClose={() => {}} />)
    fireEvent.click(screen.getByTestId('code-tab-react'))
    const code = screen.getByTestId('code-generator').querySelector('code')
    expect(code?.textContent).toContain('EarnForgeProvider')
    expect(code?.textContent).toContain('useVault')
    expect(code?.textContent).toContain('useRiskScore')
  })

  it('switches to curl tab on click', () => {
    const vault = mockVault()
    render(<CodeGenerator vault={vault} onClose={() => {}} />)
    fireEvent.click(screen.getByTestId('code-tab-curl'))
    const code = screen.getByTestId('code-generator').querySelector('code')
    expect(code?.textContent).toContain('curl')
    expect(code?.textContent).toContain(String(vault.chainId))
  })

  it('calls onClose when close button is clicked', () => {
    const vault = mockVault()
    const onClose = vi.fn()
    render(<CodeGenerator vault={vault} onClose={onClose} />)
    fireEvent.click(screen.getByTestId('code-generator-close'))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('renders all three tab buttons', () => {
    const vault = mockVault()
    render(<CodeGenerator vault={vault} onClose={() => {}} />)
    expect(screen.getByTestId('code-tab-typescript')).toBeInTheDocument()
    expect(screen.getByTestId('code-tab-react')).toBeInTheDocument()
    expect(screen.getByTestId('code-tab-curl')).toBeInTheDocument()
  })

  it('has a copy button', () => {
    const vault = mockVault()
    render(<CodeGenerator vault={vault} onClose={() => {}} />)
    expect(screen.getByTestId('code-copy-button')).toBeInTheDocument()
    expect(screen.getByTestId('code-copy-button')).toHaveTextContent('Copy')
  })

  it('includes vault slug in generated TypeScript code', () => {
    const vault = mockVault({ slug: 'my-custom-vault' })
    render(<CodeGenerator vault={vault} onClose={() => {}} />)
    const code = screen.getByTestId('code-generator').querySelector('code')
    expect(code?.textContent).toContain('my-custom-vault')
  })

  it('includes chainId in curl code', () => {
    const vault = mockVault({ chainId: 42161 })
    render(<CodeGenerator vault={vault} onClose={() => {}} />)
    fireEvent.click(screen.getByTestId('code-tab-curl'))
    const code = screen.getByTestId('code-generator').querySelector('code')
    expect(code?.textContent).toContain('42161')
  })
})
