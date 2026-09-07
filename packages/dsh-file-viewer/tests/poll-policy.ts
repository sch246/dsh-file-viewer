import type { FileViewerMetadata } from '../src/types.ts'

export function pollPolicy(resourcePollIntervalMs = 10): FileViewerMetadata {
  return { largeEditCheckDelayMs: 300, textReadConcurrency: 3, textReadTimeoutMs: 15_000, textReadRetries: 3, textReadRetryDelayMs: 250, resourcePollIntervalMs, largeResourcePollIntervalMs: 100, hugeResourcePollIntervalMs: 300,
    resourcePollBackoffMaxMs: 600, maxDeltaBytes: 1024 * 1024, progressiveFlushIntervalMs: 300,
    largeFileBytes: 100, hugeFileBytes: 1000 }
}
