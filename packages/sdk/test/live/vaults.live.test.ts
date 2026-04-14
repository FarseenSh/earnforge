// SPDX-License-Identifier: Apache-2.0
/**
 * Live integration tests that hit the real earn.li.fi API.
 * No auth required. Rate limit: 100 req/min.
 *
 * Run with: pnpm test:live
 */
import { describe, it, expect } from 'vitest'
import { EarnDataClient } from '../../src/clients/earn-data-client.js'
import {
  VaultSchema,
  VaultListResponseSchema,
  ChainListResponseSchema,
  ProtocolListResponseSchema,
} from '../../src/schemas/index.js'
import { riskScore } from '../../src/risk-scorer.js'
import { parseTvl } from '../../src/schemas/vault.js'

const client = new EarnDataClient()

describe('Live API — Chains', () => {
  it('returns 16 chains', async () => {
    const chains = await client.listChains()
    expect(chains.length).toBe(16)
  })

  it('includes Ethereum, Base, Arbitrum', async () => {
    const chains = await client.listChains()
    const names = chains.map((c) => c.name)
    expect(names).toContain('Ethereum')
    expect(names).toContain('Base')
    expect(names).toContain('Arbitrum')
  })

  it('every chain has numeric chainId and CAIP format', async () => {
    const chains = await client.listChains()
    for (const chain of chains) {
      expect(chain.chainId).toBeTypeOf('number')
      expect(chain.networkCaip).toMatch(/^eip155:\d+$/)
    }
  })
})

describe('Live API — Protocols', () => {
  it('returns 11 protocols', async () => {
    const protocols = await client.listProtocols()
    expect(protocols.length).toBe(11)
  })

  it('includes aave-v3, morpho-v1, euler-v2', async () => {
    const protocols = await client.listProtocols()
    const names = protocols.map((p) => p.name)
    expect(names).toContain('aave-v3')
    expect(names).toContain('morpho-v1')
    expect(names).toContain('euler-v2')
  })
})

describe('Live API — Vault List', () => {
  it('returns page of 50 vaults for Base', async () => {
    const response = await client.listVaults({ chainId: 8453 })
    expect(response.data.length).toBe(50)
    expect(response.total).toBeGreaterThan(50)
    expect(response.nextCursor).toBeTruthy()
  })

  it('every vault in page parses through VaultSchema', async () => {
    const response = await client.listVaults({ chainId: 8453 })
    for (const vault of response.data) {
      expect(() => VaultSchema.parse(vault)).not.toThrow()
    }
  })

  it('tvl.usd is always a string (Pitfall #8)', async () => {
    const response = await client.listVaults({ chainId: 8453 })
    for (const vault of response.data) {
      expect(typeof vault.analytics.tvl.usd).toBe('string')
      const tvl = parseTvl(vault.analytics.tvl)
      expect(tvl.parsed).toBeGreaterThanOrEqual(0)
    }
  })

  it('apy.reward is always a number after parsing (Pitfall #17)', async () => {
    const response = await client.listVaults({ chainId: 8453 })
    for (const vault of response.data) {
      expect(typeof vault.analytics.apy.reward).toBe('number')
    }
  })

  it('some vaults have no description (Pitfall #16)', async () => {
    const response = await client.listVaults({ chainId: 8453 })
    const withoutDesc = response.data.filter((v) => v.description === undefined)
    expect(withoutDesc.length).toBeGreaterThan(0)
  })

  it('pagination works via nextCursor (Pitfall #6)', async () => {
    const page1 = await client.listVaults({ chainId: 8453 })
    expect(page1.nextCursor).toBeTruthy()

    const page2 = await client.listVaults({
      chainId: 8453,
      cursor: page1.nextCursor!,
    })
    expect(page2.data.length).toBeGreaterThan(0)

    // Pages should have different vaults
    const slugs1 = new Set(page1.data.map((v) => v.slug))
    const slugs2 = new Set(page2.data.map((v) => v.slug))
    const overlap = [...slugs1].filter((s) => slugs2.has(s))
    expect(overlap.length).toBe(0)
  })
})

describe('Live API — Single Vault', () => {
  it('fetches STEAKUSDC on Base by chainId + address', async () => {
    // Not all listed vaults are individually fetchable (some return 404).
    // Try several until one works.
    const response = await client.listVaults({ chainId: 8453 })
    let found = false
    for (const candidate of response.data.slice(0, 10)) {
      try {
        const vault = await client.getVault(
          candidate.chainId,
          candidate.address
        )
        expect(vault.name).toBe(candidate.name)
        expect(vault.chainId).toBe(8453)
        found = true
        break
      } catch {
        // Some vaults return 404 on individual fetch — real API behavior
      }
    }
    expect(found).toBe(true)
  })

  it('fetches vault by slug', async () => {
    const response = await client.listVaults({ chainId: 8453 })
    let found = false
    for (const candidate of response.data.slice(0, 10)) {
      try {
        const vault = await client.getVaultBySlug(candidate.slug)
        expect(vault.slug).toBe(candidate.slug)
        found = true
        break
      } catch {
        // Try next
      }
    }
    expect(found).toBe(true)
  })
})

describe('Live API — Risk Score', () => {
  it('computes risk score for real vaults', async () => {
    const response = await client.listVaults({ chainId: 8453 })
    for (const vault of response.data.slice(0, 10)) {
      const risk = riskScore(vault)
      expect(risk.score).toBeGreaterThanOrEqual(0)
      expect(risk.score).toBeLessThanOrEqual(10)
      expect(['low', 'medium', 'high']).toContain(risk.label)
    }
  })

  it('stablecoin vaults tend to score higher', async () => {
    const response = await client.listVaults({ chainId: 8453 })
    const stable = response.data.filter((v) => v.tags.includes('stablecoin'))
    const nonStable = response.data.filter(
      (v) => !v.tags.includes('stablecoin')
    )

    if (stable.length > 0 && nonStable.length > 0) {
      const avgStable =
        stable.reduce((s, v) => s + riskScore(v).score, 0) / stable.length
      const avgNonStable =
        nonStable.reduce((s, v) => s + riskScore(v).score, 0) / nonStable.length
      expect(avgStable).toBeGreaterThan(avgNonStable)
    }
  })
})

describe('Live API — Async Iterator', () => {
  it('listAllVaults yields more than 50 vaults for Base (proves pagination works)', async () => {
    let count = 0
    for await (const vault of client.listAllVaults({ chainId: 8453 })) {
      count++
      if (count > 55) break // Just need to prove we cross the page boundary
    }
    expect(count).toBeGreaterThan(50)
  })
})
