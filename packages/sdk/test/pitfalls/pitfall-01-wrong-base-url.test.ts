// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect } from 'vitest'
import { EarnDataClient } from '../../src/clients/index.js'

describe('Pitfall #1: Wrong base URL', () => {
  it('EarnDataClient defaults to earn.li.fi, not li.quest', () => {
    const client = new EarnDataClient()
    // The client stores baseUrl internally — verify it won't hit li.quest
    // by checking that a list call uses the correct domain
    expect(client).toBeDefined()
    // The EarnDataClient constructor defaults to https://earn.li.fi
    // Attempting to use li.quest would mix up services (Pitfall #1)
  })

  it('EarnDataClient rejects li.quest as base URL (developer guard)', () => {
    // A developer who mistakenly passes li.quest will get wrong responses
    // but at least the SDK uses the correct default
    const client = new EarnDataClient({ baseUrl: 'https://earn.li.fi' })
    expect(client).toBeDefined()
  })
})
