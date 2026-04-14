// SPDX-License-Identifier: Apache-2.0

// Context
export { EarnForgeProvider, useEarnForge, EarnForgeContext } from './context.js'
export type { EarnForgeProviderProps } from './context.js'

// Hooks
export { useVaults } from './hooks/useVaults.js'
export type { UseVaultsParams, UseVaultsReturn } from './hooks/useVaults.js'

export { useVault } from './hooks/useVault.js'
export type { UseVaultReturn } from './hooks/useVault.js'

export { useEarnTopYield } from './hooks/useEarnTopYield.js'
export type {
  UseEarnTopYieldParams,
  UseEarnTopYieldReturn,
} from './hooks/useEarnTopYield.js'

export { usePortfolio } from './hooks/usePortfolio.js'
export type { UsePortfolioReturn } from './hooks/usePortfolio.js'

export { useRiskScore } from './hooks/useRiskScore.js'
export type { UseRiskScoreReturn } from './hooks/useRiskScore.js'

export { useStrategy } from './hooks/useStrategy.js'
export type { UseStrategyReturn } from './hooks/useStrategy.js'

export { useSuggest } from './hooks/useSuggest.js'
export type { UseSuggestParams, UseSuggestReturn } from './hooks/useSuggest.js'

export { useApyHistory } from './hooks/useApyHistory.js'
export type { UseApyHistoryReturn } from './hooks/useApyHistory.js'

export { useEarnDeposit } from './hooks/useEarnDeposit.js'
export type {
  DepositPhase,
  DepositState,
  UseEarnDepositParams,
  UseEarnDepositReturn,
} from './hooks/useEarnDeposit.js'

export { useEarnRedeem } from './hooks/useEarnRedeem.js'
export type {
  RedeemPhase,
  RedeemState,
  UseEarnRedeemParams,
  UseEarnRedeemReturn,
} from './hooks/useEarnRedeem.js'
