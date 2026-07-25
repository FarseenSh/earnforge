// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest'
import protocols from '../../fixtures/src/protocols.json'
import {
  getStrategy,
  STRATEGIES,
  type StrategyPreset,
} from '../src/strategies.js'

describe('Strategy presets', () => {
  it('has 4 strategy presets', () => {
    expect(Object.keys(STRATEGIES)).toHaveLength(4)
  })

  it('conservative filters for stablecoin + high TVL + blue-chip', () => {
    const s = getStrategy('conservative')
    expect(s.name).toBe('conservative')
    expect(s.filters.tags).toContain('stablecoin')
    expect(s.filters.minTvlUsd).toBe(50_000_000)
    // Unversioned ids — `?protocol=morpho-v1` matches nothing since Apr 2026.
    expect(s.filters.protocols).toContain('aave')
    expect(s.filters.protocols).toContain('morpho')
    expect(s.filters.excludeFlagged).toBe(true)
    expect(s.filters.excludeTags).toContain('il-risk')
  })

  it('max-apy has no TVL floor', () => {
    const s = getStrategy('max-apy')
    expect(s.filters.minTvlUsd).toBeUndefined()
    expect(s.sort).toBe('apy')
    expect(s.sortDirection).toBe('desc')
  })

  it('diversified requires minimum TVL', () => {
    const s = getStrategy('diversified')
    expect(s.filters.minTvlUsd).toBe(1_000_000)
  })

  it('risk-adjusted filters by risk score >= 7', () => {
    const s = getStrategy('risk-adjusted')
    expect(s.filters.minRiskScore).toBe(7)
  })

  it('all strategies have required fields', () => {
    const presets: StrategyPreset[] = [
      'conservative',
      'max-apy',
      'diversified',
      'risk-adjusted',
    ]
    for (const preset of presets) {
      const s = getStrategy(preset)
      expect(s.name).toBe(preset)
      expect(s.description).toBeTruthy()
      expect(s.sort).toBeTruthy()
      expect(s.sortDirection).toMatch(/^(asc|desc)$/)
    }
  })

  it('conservative only includes known blue-chip protocols', () => {
    const s = getStrategy('conservative')
    for (const p of s.filters.protocols!) {
      expect(['aave', 'morpho', 'euler', 'pendle', 'yearn']).toContain(p)
    }
  })

  it('every strategy protocol id exists in the live protocol list', () => {
    // A stale slug returns an empty result set with a 200, so this is the only
    // thing standing between a typo and a silently empty strategy.
    const liveIds = new Set(
      (protocols as Array<{ id?: string; name: string }>).map(
        (p) => p.id ?? p.name
      )
    )
    for (const preset of Object.values(STRATEGIES)) {
      for (const p of preset.filters.protocols ?? []) {
        expect(liveIds).toContain(p)
      }
    }
  })

  it('every strategy excludes verification-flagged vaults', () => {
    for (const preset of Object.values(STRATEGIES)) {
      expect(preset.filters.excludeFlagged).toBe(true)
    }
  })

  it('max-apy sorts by apy descending', () => {
    const s = getStrategy('max-apy')
    expect(s.sort).toBe('apy')
    expect(s.sortDirection).toBe('desc')
  })
})
