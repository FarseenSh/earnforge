// SPDX-License-Identifier: Apache-2.0

export class EarnForgeError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = 'EarnForgeError';
  }
}

export class EarnApiError extends EarnForgeError {
  constructor(
    message: string,
    public readonly status: number,
    public readonly url: string,
  ) {
    super(message, 'EARN_API_ERROR');
    this.name = 'EarnApiError';
  }
}

export class ComposerError extends EarnForgeError {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message, 'COMPOSER_ERROR');
    this.name = 'ComposerError';
  }
}

export class PreflightError extends EarnForgeError {
  constructor(
    message: string,
    public readonly issues: PreflightIssue[],
  ) {
    super(message, 'PREFLIGHT_ERROR');
    this.name = 'PreflightError';
  }
}

export class RateLimitError extends EarnForgeError {
  constructor(
    public readonly retryAfter: number,
  ) {
    super(`Rate limited. Retry after ${retryAfter}ms`, 'RATE_LIMIT');
    this.name = 'RateLimitError';
  }
}

export interface PreflightIssue {
  code: string;
  message: string;
  severity: 'error' | 'warning';
}
