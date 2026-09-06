import type { FileViewerMetadata } from '../src/types.ts'

export function pollPolicy(resourcePollIntervalMs = 10): FileViewerMetadata {
  return { resourcePollIntervalMs, largeResourcePollIntervalMs: 100, hugeResourcePollIntervalMs: 300,
    resourcePollBackoffMaxMs: 600, maxDeltaBytes: 1024 * 1024, progressiveFlushIntervalMs: 300,
    largeFileBytes: 100, hugeFileBytes: 1000 }
}
