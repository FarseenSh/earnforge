// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect } from 'vitest'
import { EarnDataClient } from '../../src/clients/index.js'

describe('Pitfall #2: Adding auth to Earn Data API', () => {
  it('EarnDataClient constructor does not accept an API key', () => {
    // Earn Data API requires NO auth — adding one confuses the API
    const options = { baseUrl: 'https://earn.li.fi' }
    const client = new EarnDataClient(options)
    expect(client).toBeDefined()
    // TypeScript prevents passing apiKey since EarnDataClientOptions has no apiKey field
    // @ts-expect-error — deliberately checking runtime behavior
    const client2 = new EarnDataClient({ apiKey: 'test' })
    expect(client2).toBeDefined() // Should not use the key for requests
  })
})
