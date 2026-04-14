// SPDX-License-Identifier: Apache-2.0
import { render, screen } from '@testing-library/react'
import { useQueryClient } from '@tanstack/react-query'
import { describe, expect, it } from 'vitest'
import { Providers } from '@/components/Providers'

function TestChild() {
  const client = useQueryClient()
  return (
    <div data-testid="query-client">{client ? 'has-client' : 'no-client'}</div>
  )
}

describe('Providers', () => {
  it('provides a QueryClient to children', () => {
    render(
      <Providers>
        <TestChild />
      </Providers>
    )
    expect(screen.getByTestId('query-client')).toHaveTextContent('has-client')
  })

  it('renders children correctly', () => {
    render(
      <Providers>
        <div data-testid="child-content">Hello Studio</div>
      </Providers>
    )
    expect(screen.getByTestId('child-content')).toHaveTextContent(
      'Hello Studio'
    )
  })
})
