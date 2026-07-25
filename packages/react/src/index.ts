// SPDX-License-Identifier: Apache-2.0

export type { EarnForgeProviderProps } from './context.js'
// Context
export { EarnForgeContext, EarnForgeProvider, useEarnForge } from './context.js'
export type { UseApyHistoryReturn } from './hooks/useApyHistory.js'
export { useApyHistory } from './hooks/useApyHistory.js'
export type {
  DepositPhase,
  DepositState,
  UseEarnDepositParams,
  UseEarnDepositReturn,
} from './hooks/useEarnDeposit.js'
export { useEarnDeposit } from './hooks/useEarnDeposit.js'
export type {
  RedeemPhase,
  RedeemState,
  UseEarnRedeemParams,
  UseEarnRedeemReturn,
} from './hooks/useEarnRedeem.js'
export { useEarnRedeem } from './hooks/useEarnRedeem.js'
export type {
  UseEarnTopYieldParams,
  UseEarnTopYieldReturn,
} from './hooks/useEarnTopYield.js'
export { useEarnTopYield } from './hooks/useEarnTopYield.js'
export type { UsePortfolioReturn } from './hooks/usePortfolio.js'
export { usePortfolio } from './hooks/usePortfolio.js'
export type { UseRiskScoreReturn } from './hooks/useRiskScore.js'
export { useRiskScore } from './hooks/useRiskScore.js'
export type { UseStrategyReturn } from './hooks/useStrategy.js'
export { useStrategy } from './hooks/useStrategy.js'
export type { UseSuggestParams, UseSuggestReturn } from './hooks/useSuggest.js'
export { useSuggest } from './hooks/useSuggest.js'
export type { UseVaultReturn } from './hooks/useVault.js'
export { useVault } from './hooks/useVault.js'
export type { UseVaultsParams, UseVaultsReturn } from './hooks/useVaults.js'
// Hooks
export { useVaults } from './hooks/useVaults.js'
