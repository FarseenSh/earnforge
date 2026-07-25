// SPDX-License-Identifier: Apache-2.0

export { default as chains } from './chains.json' with { type: 'json' }
/** Structured validation error — 400 carries an errors[] array */
export { default as error400 } from './error-400.json' with { type: 'json' }
/** Bare not-found error — 404 has NO errors[] array */
export { default as error404 } from './error-404.json' with { type: 'json' }
export { default as portfolio } from './portfolio.json' with { type: 'json' }
export { default as protocols } from './protocols.json' with { type: 'json' }
export { default as quoteComposer } from './quote-composer.json' with {
  type: 'json',
}
/** Redeem quote — fromToken is the vault share token */
export { default as quoteRedeem } from './quote-redeem.json' with {
  type: 'json',
}
/** Vault with verificationStatus: "flagged" (reason: zero_apy) */
export { default as vaultFlagged } from './vault-flagged.json' with {
  type: 'json',
}
export { default as vaultSingle } from './vault-single.json' with {
  type: 'json',
}
export { default as vaultsBase } from './vaults-base.json' with { type: 'json' }
export { default as vaultsEthereum } from './vaults-ethereum.json' with {
  type: 'json',
}
