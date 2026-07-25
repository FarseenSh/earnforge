// SPDX-License-Identifier: Apache-2.0

/**
 * The Earn Data API requires an API key as of Apr 2026, and `EarnDataClient`
 * refuses to construct without one. Unit tests exercise mocked transports, so
 * a placeholder is enough — but it has to be present or every construction
 * throws MissingApiKeyError.
 *
 * Live tests (`*.live.test.ts`) read the real key from the environment and are
 * excluded from the default run, so this must not clobber an existing value.
 */
process.env.LIFI_API_KEY ??= 'test-key-not-a-real-credential'
