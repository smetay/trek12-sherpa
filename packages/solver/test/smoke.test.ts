import { describe, expect, it } from 'vitest'
import { ENGINE_VERSION, SOLVER_VERSION } from '../src/index.ts'

describe('solver package', () => {
  it('links against the engine workspace package', () => {
    expect(SOLVER_VERSION).toMatch(/^\d+\.\d+\.\d+$/)
    expect(ENGINE_VERSION).toMatch(/^\d+\.\d+\.\d+$/)
  })
})
