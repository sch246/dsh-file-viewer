import { expect, it } from 'vitest'
import { Config } from '../src/index.ts'

it('defaults to ordered 10 MiB and 100 MiB policy tiers and rejects invalid configuration', () => {
  expect(Config({ resourcePollIntervalMs: 2000 })).toEqual({ largeEditCheckDelayMs: 300, textReadConcurrency: 3, textReadTimeoutMs: 15_000, textReadRetries: 3, textReadRetryDelayMs: 250, resourcePollIntervalMs: 2000, progressiveFlushIntervalMs: 300, largeResourcePollIntervalMs: 10_000, hugeResourcePollIntervalMs: 30_000, resourcePollBackoffMaxMs: 60_000, maxDeltaBytes: 1024 ** 2, largeFileBytes: 10 * 1024 ** 2, hugeFileBytes: 100 * 1024 ** 2 })
  for (const invalid of [0, -1, 1.5, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    expect(() => Config({ resourcePollIntervalMs: 2000, largeFileBytes: invalid })).toThrow()
    expect(() => Config({ resourcePollIntervalMs: 2000, hugeFileBytes: invalid })).toThrow()
    for (const name of ['largeEditCheckDelayMs', 'textReadTimeoutMs', 'textReadRetryDelayMs', 'textReadConcurrency', 'progressiveFlushIntervalMs', 'largeResourcePollIntervalMs', 'hugeResourcePollIntervalMs', 'resourcePollBackoffMaxMs', 'maxDeltaBytes']) expect(() => Config({ resourcePollIntervalMs: 2000, [name]: invalid })).toThrow()
  }
  for (const value of [-1, 1.5, 11]) expect(() => Config({ resourcePollIntervalMs: 2000, textReadRetries: value })).toThrow()
  expect(() => Config({ resourcePollIntervalMs: 2000, textReadConcurrency: 17 })).toThrow()
  expect(() => Config({ resourcePollIntervalMs: 2000, largeResourcePollIntervalMs: 1000 })).toThrow('must be ordered')
  expect(() => Config({ resourcePollIntervalMs: 2000, largeFileBytes: 10, hugeFileBytes: 10 })).toThrow('hugeFileBytes must exceed largeFileBytes')
  expect(() => Config({ resourcePollIntervalMs: 2000, largeFileBytes: 20, hugeFileBytes: 10 })).toThrow('hugeFileBytes must exceed largeFileBytes')
})
