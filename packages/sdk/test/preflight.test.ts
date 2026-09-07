// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest'
import vaultSingle from '../../fixtures/src/vault-single.json'
import { preflight } from '../src/preflight.js'
import { type Vault, VaultSchema } from '../src/schemas/index.js'

const vault = VaultSchema.parse(vaultSingle)
const wallet = '0x1234567890abcdef1234567890abcdef12345678'

describe('preflight: what did not get checked', () => {
  /**
   * `ok: true` with no balances supplied means "nothing I could check failed",
   * which is not the same as "safe to deposit". The CLI called this with no
   * balances at all and printed a clean report for a wallet holding no gas and
   * no tokens: a false green in the one command whose entire job is to catch
   * that. The report names its own gaps now, so a caller can tell the two
   * states apart.
   */
  it('reports every check it could not run', () => {
    const report = preflight(vault, wallet)
    const codes = report.skipped.map((s) => s.code)
    expect(codes).toContain('GAS_BALANCE')
    expect(codes).toContain('TOKEN_BALANCE')
    expect(codes).toContain('CHAIN_MATCH')
    // Still `ok`. It found no failures. That is precisely why `skipped` has
    // to be there for the caller to read.
    expect(report.ok).toBe(true)
  })

  it('reports nothing skipped once every input is supplied', () => {
    const report = preflight(vault, wallet, {
      walletChainId: vault.chainId,
      nativeBalance: 10n ** 17n,
      // Supplying a balance alone only rules out an empty wallet; the gas
      // check is not complete until it knows what the transaction costs.
      estimatedGasCost: 10n ** 15n,
      tokenBalance: 10n ** 12n,
      depositAmount: '1',
    })
    expect(report.skipped).toEqual([])
  })

  it('still names the token check when only the amount is missing', () => {
    const report = preflight(vault, wallet, {
      walletChainId: vault.chainId,
      nativeBalance: 10n ** 17n,
      tokenBalance: 10n ** 12n,
    })
    const token = report.skipped.find((s) => s.code === 'TOKEN_BALANCE')
    expect(token?.needs).toContain('depositAmount')
  })
})

describe('preflight', () => {
  it('passes for a healthy vault + wallet setup', () => {
    const report = preflight(vault, wallet, {
      walletChainId: 8453,
      nativeBalance: 100000000000000000n,
    })
    expect(report.ok).toBe(true)
    expect(report.issues.filter((i) => i.severity === 'error')).toHaveLength(0)
  })

  it('fails when vault is not transactional (Pitfall #13)', () => {
    const nonTx: Vault = { ...vault, isTransactional: false }
    const report = preflight(nonTx, wallet)
    expect(report.ok).toBe(false)
    expect(report.issues.some((i) => i.code === 'NOT_TRANSACTIONAL')).toBe(true)
  })

  it('warns on chain mismatch. Composer handles cross-chain (Pitfall #12)', () => {
    const report = preflight(vault, wallet, { walletChainId: 1 })
    expect(report.ok).toBe(true) // warning, not error: cross-chain is valid
    expect(
      report.issues.some(
        (i) => i.code === 'CHAIN_MISMATCH' && i.severity === 'warning'
      )
    ).toBe(true)
  })

  it('fails when no gas token (Pitfall #11)', () => {
    const report = preflight(vault, wallet, {
      walletChainId: 8453,
      nativeBalance: 0n,
    })
    expect(report.ok).toBe(false)
    expect(report.issues.some((i) => i.code === 'NO_GAS')).toBe(true)
  })

  it('warns about empty underlyingTokens (Pitfall #15)', () => {
    const emptyUt: Vault = { ...vault, underlyingTokens: [] }
    const report = preflight(emptyUt, wallet)
    expect(report.issues.some((i) => i.code === 'NO_UNDERLYING_TOKENS')).toBe(
      true
    )
  })

  it('warns about non-redeemable vault', () => {
    const nonRedeem: Vault = { ...vault, isRedeemable: false }
    const report = preflight(nonRedeem, wallet)
    expect(report.issues.some((i) => i.code === 'NOT_REDEEMABLE')).toBe(true)
  })

  it('fails on insufficient token balance', () => {
    const report = preflight(vault, wallet, {
      walletChainId: 8453,
      nativeBalance: 100000000000000000n,
      tokenBalance: 100n,
      depositAmount: '1000',
    })
    expect(report.ok).toBe(false)
    expect(report.issues.some((i) => i.code === 'INSUFFICIENT_BALANCE')).toBe(
      true
    )
  })

  it('passes with sufficient token balance', () => {
    const report = preflight(vault, wallet, {
      walletChainId: 8453,
      nativeBalance: 100000000000000000n,
      tokenBalance: 2000000000n,
      depositAmount: '1000',
    })
    expect(report.ok).toBe(true)
  })

  it('returns vault and wallet in report', () => {
    const report = preflight(vault, wallet)
    expect(report.vault).toBe(vault)
    expect(report.wallet).toBe(wallet)
  })
})

describe('preflight: gas sufficiency, not just gas presence', () => {
  /**
   * The gas check only ever compared against zero, so a wallet holding 1 wei
   * passed a check named "no gas" and then reverted anyway. Zero is the one
   * state a user is least likely to be in; being short is the common one.
   */
  it('catches a balance that is non-zero but short of the estimate', () => {
    const report = preflight(vault, wallet, {
      nativeBalance: 1n,
      estimatedGasCost: 2_000_000_000_000_000n,
    })
    expect(report.ok).toBe(false)
    const issue = report.issues.find((i) => i.code === 'INSUFFICIENT_GAS')
    expect(issue?.severity).toBe('error')
    expect(issue?.message).toMatch(/Short by 1999999999999999 wei/)
  })

  it('passes when the balance covers the estimate', () => {
    const report = preflight(vault, wallet, {
      nativeBalance: 5_000_000_000_000_000n,
      estimatedGasCost: 2_000_000_000_000_000n,
    })
    expect(report.issues.some((i) => i.code === 'INSUFFICIENT_GAS')).toBe(false)
  })

  it('still reports an outright empty wallet as NO_GAS, not a shortfall', () => {
    const report = preflight(vault, wallet, {
      nativeBalance: 0n,
      estimatedGasCost: 2_000_000_000_000_000n,
    })
    expect(report.issues.some((i) => i.code === 'NO_GAS')).toBe(true)
    expect(report.issues.some((i) => i.code === 'INSUFFICIENT_GAS')).toBe(false)
  })

  it('admits the check was shallow when no estimate was supplied', () => {
    // `ok: true` here means "the wallet is not empty", which is a much weaker
    // claim than "the wallet can afford this", and must not read as the latter.
    const report = preflight(vault, wallet, { nativeBalance: 1n })
    expect(report.ok).toBe(true)
    expect(report.skipped).toContainEqual({
      code: 'GAS_SUFFICIENCY',
      needs: 'estimatedGasCost',
    })
  })

  it('does not claim a sufficiency gap when the balance itself is unknown', () => {
    const report = preflight(vault, wallet, {})
    expect(report.skipped.map((s) => s.code)).toContain('GAS_BALANCE')
    expect(report.skipped.map((s) => s.code)).not.toContain('GAS_SUFFICIENCY')
  })
})
