// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect } from 'vitest'
import { LRUCache } from '../src/cache.js'

describe('LRU Cache', () => {
  it('stores and retrieves values', () => {
    const cache = new LRUCache<string>()
    cache.set('key', 'value')
    expect(cache.get('key')).toBe('value')
  })

  it('returns undefined for missing keys', () => {
    const cache = new LRUCache<string>()
    expect(cache.get('missing')).toBeUndefined()
  })

  it('evicts oldest entry when full', () => {
    const cache = new LRUCache<string>({ maxSize: 2 })
    cache.set('a', '1')
    cache.set('b', '2')
    cache.set('c', '3') // should evict 'a'
    expect(cache.get('a')).toBeUndefined()
    expect(cache.get('b')).toBe('2')
    expect(cache.get('c')).toBe('3')
  })

  it('refreshes LRU order on get', () => {
    const cache = new LRUCache<string>({ maxSize: 2 })
    cache.set('a', '1')
    cache.set('b', '2')
    cache.get('a') // refresh 'a'
    cache.set('c', '3') // should evict 'b', not 'a'
    expect(cache.get('a')).toBe('1')
    expect(cache.get('b')).toBeUndefined()
  })

  it('expires entries after TTL', async () => {
    const cache = new LRUCache<string>({ ttl: 50 })
    cache.set('key', 'value')
    expect(cache.get('key')).toBe('value')
    await new Promise((r) => setTimeout(r, 100))
    expect(cache.get('key')).toBeUndefined()
  })

  it('reports correct size', () => {
    const cache = new LRUCache<string>()
    expect(cache.size).toBe(0)
    cache.set('a', '1')
    expect(cache.size).toBe(1)
    cache.set('b', '2')
    expect(cache.size).toBe(2)
  })

  it('clear removes all entries', () => {
    const cache = new LRUCache<string>()
    cache.set('a', '1')
    cache.set('b', '2')
    cache.clear()
    expect(cache.size).toBe(0)
    expect(cache.get('a')).toBeUndefined()
  })

  it('has returns true for existing keys', () => {
    const cache = new LRUCache<string>()
    cache.set('key', 'value')
    expect(cache.has('key')).toBe(true)
    expect(cache.has('missing')).toBe(false)
  })

  it('overwrites existing keys', () => {
    const cache = new LRUCache<string>()
    cache.set('key', 'old')
    cache.set('key', 'new')
    expect(cache.get('key')).toBe('new')
    expect(cache.size).toBe(1)
  })
})
