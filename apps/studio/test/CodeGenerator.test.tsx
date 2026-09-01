// SPDX-License-Identifier: Apache-2.0
import { fireEvent, render, screen } from '@testing-library/react'
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

  /**
   * The generated curl has to actually run.
   *
   * It did not. Every snippet this tab produced was unrunnable in two ways at
   * once: it called `/v1/earn/vaults`, the path LI.FI removed in Apr 2026
   * (`404`), and it announced "no auth needed" while sending no key, which the
   * live path answers with `401`. Both are pitfalls this project documents,
   * numbers 1 and 2, shipped inside its own code generator and served in
   * production for months.
   *
   * A snapshot of the string would not have caught it, because the string was
   * consistent with itself. These assert the two properties that make the
   * command work against the real API.
   */
  describe('the generated curl is runnable', () => {
    function curlText() {
      const vault = mockVault({ chainId: 8453 })
      render(<CodeGenerator vault={vault} onClose={() => {}} />)
      fireEvent.click(screen.getByTestId('code-tab-curl'))
      return (
        screen.getByTestId('code-generator').querySelector('code')
          ?.textContent ?? ''
      )
    }

    it('never emits the pre-Apr-2026 /v1/earn/ path', () => {
      const text = curlText()
      // Only the explanatory comment may name the dead path.
      const calls = text
        .split('\n')
        .filter(
          (l) => l.trimStart().startsWith('curl') || l.includes('https://')
        )
        .filter((l) => !l.trimStart().startsWith('#'))
      expect(calls.join('\n')).not.toContain('/v1/earn/')
      expect(calls.join('\n')).toContain('earn.li.fi/v1/vaults')
    })

    it('sends an API key on every earn.li.fi call', () => {
      const text = curlText()
      const blocks = text
        .split(/\n\s*\n/)
        .filter((b) => b.includes('earn.li.fi'))
      expect(blocks.length).toBeGreaterThan(0)
      for (const b of blocks) {
        expect(b, `missing x-lifi-api-key:\n${b}`).toContain('x-lifi-api-key')
      }
    })

    it('does not claim the Earn Data API is unauthenticated', () => {
      expect(curlText()).not.toMatch(/no auth needed/i)
    })
  })
})
