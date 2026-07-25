// SPDX-License-Identifier: Apache-2.0

export class EarnForgeError extends Error {
  constructor(
    message: string,
    public readonly code: string
  ) {
    super(message)
    this.name = 'EarnForgeError'
  }
}

/**
 * One field-level validation failure from a 400 response.
 * Only 400s carry these — 404s return a bare `{ statusCode, message }`
 * despite the changelog announcing structured 404s.
 */
export interface EarnApiFieldError {
  code: string
  message: string
  path: (string | number)[]
}

export class EarnApiError extends EarnForgeError {
  constructor(
    message: string,
    public readonly status: number,
    public readonly url: string,
    public readonly fieldErrors: EarnApiFieldError[] = []
  ) {
    super(message, 'EARN_API_ERROR')
    this.name = 'EarnApiError'
  }
}

/**
 * The Earn Data API requires an API key as of Apr 2026 and hard-401s without
 * one. Note this diverges from LI.FI's general API docs, which still state
 * that no key is required — that remains true for li.quest but not earn.li.fi.
 */
export class MissingApiKeyError extends EarnForgeError {
  constructor() {
    super(
      'The LI.FI Earn Data API requires an API key. Pass `apiKey` to ' +
        'createEarnForge()/EarnDataClient, or set LIFI_API_KEY. ' +
        'Create one at https://portal.li.fi',
      'MISSING_API_KEY'
    )
    this.name = 'MissingApiKeyError'
  }
}

export class ComposerError extends EarnForgeError {
  constructor(
    message: string,
    public readonly status: number
  ) {
    super(message, 'COMPOSER_ERROR')
    this.name = 'ComposerError'
  }
}

export class PreflightError extends EarnForgeError {
  constructor(
    message: string,
    public readonly issues: PreflightIssue[]
  ) {
    super(message, 'PREFLIGHT_ERROR')
    this.name = 'PreflightError'
  }
}

export class RateLimitError extends EarnForgeError {
  constructor(public readonly retryAfter: number) {
    super(`Rate limited. Retry after ${retryAfter}ms`, 'RATE_LIMIT')
    this.name = 'RateLimitError'
  }
}

export interface PreflightIssue {
  code: string
  message: string
  severity: 'error' | 'warning'
}
