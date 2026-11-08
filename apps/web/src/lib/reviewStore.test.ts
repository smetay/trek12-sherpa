import { describe, expect, it } from 'vitest'
import { completeDice, diceKey, newSession, parseDiceText, TURNS } from './reviewStore.ts'

describe('dice text', () => {
  it('reads pairs in any reasonable notation', () => {
    for (const text of ['54 16 55', '5-4, 1-6, 5-5', '5/4\n1/6\n5/5', '541655']) {
      const dice = parseDiceText(text)
      expect(dice?.slice(0, 3)).toEqual([
        { y: 5, r: 4 },
        { y: 1, r: 6 },
        { y: 5, r: 5 },
      ])
      expect(dice?.[3]).toEqual({ y: null, r: null })
    }
  })

  it('rejects impossible faces, odd counts and too many rolls', () => {
    expect(parseDiceText('64')).toBeNull() // yellow is 0–5
    expect(parseDiceText('50')).toBeNull() // red is 1–6
    expect(parseDiceText('541')).toBeNull()
    expect(parseDiceText('11 '.repeat(TURNS + 1))).toBeNull()
    expect(parseDiceText('')).toBeNull()
  })
})

describe('session helpers', () => {
  it('needs all 19 rolls before the analysis can start', () => {
    const s = newSession('kagkot')
    expect(completeDice(s.dice)).toBeNull()
    const full = parseDiceText('12 '.repeat(TURNS)) ?? []
    expect(completeDice(full)?.length).toBe(TURNS)
  })

  it('keys results by map and dice', () => {
    const a = parseDiceText('54 16') ?? []
    const b = parseDiceText('54 15') ?? []
    expect(diceKey('kagkot', a)).not.toBe(diceKey('kagkot', b))
    expect(diceKey('kagkot', a)).not.toBe(diceKey('dunai', a))
    expect(diceKey('kagkot', a)).toBe(diceKey('kagkot', parseDiceText('5-4 1-6') ?? []))
  })
})
