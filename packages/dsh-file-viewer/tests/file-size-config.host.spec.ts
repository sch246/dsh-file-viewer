import { expect, it } from 'vitest'
import { Config } from '../src/index.ts'

it('defaults to ordered 10 MiB and 100 MiB policy tiers and rejects invalid configuration', () => {
  expect(Config({ resourcePollIntervalMs: 2000 })).toEqual({ resourcePollIntervalMs: 2000, largeFileBytes: 10 * 1024 ** 2, hugeFileBytes: 100 * 1024 ** 2 })
  for (const invalid of [0, -1, 1.5, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    expect(() => Config({ resourcePollIntervalMs: 2000, largeFileBytes: invalid })).toThrow()
    expect(() => Config({ resourcePollIntervalMs: 2000, hugeFileBytes: invalid })).toThrow()
  }
  expect(() => Config({ resourcePollIntervalMs: 2000, largeFileBytes: 10, hugeFileBytes: 10 })).toThrow('hugeFileBytes must exceed largeFileBytes')
  expect(() => Config({ resourcePollIntervalMs: 2000, largeFileBytes: 20, hugeFileBytes: 10 })).toThrow('hugeFileBytes must exceed largeFileBytes')
})
