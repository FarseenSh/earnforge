// SPDX-License-Identifier: Apache-2.0
import { createContext, useContext, createElement, type ReactNode } from 'react'
import type { EarnForge } from '@earnforge/sdk'

const EarnForgeContext = createContext<EarnForge | null>(null)

export interface EarnForgeProviderProps {
  sdk: EarnForge
  children: ReactNode
}

/**
 * Wrap your application with `EarnForgeProvider` to make the SDK
 * instance available to all hooks via React context.
 *
 * ```tsx
 * const forge = createEarnForge({ composerApiKey: '...' });
 * <EarnForgeProvider sdk={forge}>
 *   <App />
 * </EarnForgeProvider>
 * ```
 */
export function EarnForgeProvider({ sdk, children }: EarnForgeProviderProps) {
  return createElement(EarnForgeContext.Provider, { value: sdk }, children)
}

/**
 * Internal helper — returns the SDK instance from context
 * or throws if used outside an `EarnForgeProvider`.
 */
export function useEarnForge(): EarnForge {
  const ctx = useContext(EarnForgeContext)
  if (!ctx) {
    throw new Error(
      'useEarnForge must be used within an <EarnForgeProvider>. ' +
        'Wrap your component tree with <EarnForgeProvider sdk={forge}>.'
    )
  }
  return ctx
}

export { EarnForgeContext }
