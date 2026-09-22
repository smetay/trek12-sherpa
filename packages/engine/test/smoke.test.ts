import * as fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { ENGINE_VERSION } from '../src/index.ts'

describe('engine package', () => {
  it('exposes a semver version', () => {
    expect(ENGINE_VERSION).toMatch(/^\d+\.\d+\.\d+$/)
  })

  it('runs property-based tests with the global fast-check configuration', () => {
    fc.assert(
      fc.property(fc.integer(), fc.integer(), (a, b) => {
        expect(a + b).toBe(b + a)
      }),
    )
  })
})
