import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { FileViewerRemote } from './remote.ts'

export { FileViewerRemote } from './remote.ts'
export type { FileViewerMetadata } from './types.ts'

export const name = 'file-viewer'

/** Viewer deployment configuration. */
export interface Config {
  /** Delay between completed filesystem source polls while subscribed. */
  resourcePollIntervalMs: number
  largeResourcePollIntervalMs: number
  hugeResourcePollIntervalMs: number
  resourcePollBackoffMaxMs: number
  maxDeltaBytes: number
  /** Minimum interval between buffered progressive appends after the first chunk. */
  progressiveFlushIntervalMs: number
  /** File bytes above which background work defaults off for a new document. */
  largeFileBytes: number
  /** File bytes above which loading requires stronger explicit confirmation. */
  hugeFileBytes: number
}

/** Validated viewer polling and presentation configuration. */
const fields: z<Config> = z.object({
  largeResourcePollIntervalMs: z.number().step(1).min(1).max(Number.MAX_SAFE_INTEGER).default(10_000),
  hugeResourcePollIntervalMs: z.number().step(1).min(1).max(Number.MAX_SAFE_INTEGER).default(30_000),
  resourcePollBackoffMaxMs: z.number().step(1).min(1).max(Number.MAX_SAFE_INTEGER).default(60_000),
  maxDeltaBytes: z.number().step(1).min(1).max(Number.MAX_SAFE_INTEGER).default(1024 * 1024),
  progressiveFlushIntervalMs: z.number().step(1).min(1).max(Number.MAX_SAFE_INTEGER).default(300),
  largeFileBytes: z.number().step(1).min(1).max(Number.MAX_SAFE_INTEGER).default(10 * 1024 * 1024),
  hugeFileBytes: z.number().step(1).min(1).max(Number.MAX_SAFE_INTEGER).default(100 * 1024 * 1024),
  resourcePollIntervalMs: z.number().step(1).min(1).max(Number.MAX_SAFE_INTEGER).required(),
})

/** Validated ordered byte tiers and resource polling configuration. */
export const Config: z<Config> = z.transform(fields, (value) => {
  if (value.hugeFileBytes <= value.largeFileBytes) throw new Error('file-viewer: hugeFileBytes must exceed largeFileBytes')
  if (value.largeResourcePollIntervalMs < value.resourcePollIntervalMs || value.hugeResourcePollIntervalMs < value.largeResourcePollIntervalMs
    || value.resourcePollBackoffMaxMs < value.hugeResourcePollIntervalMs) throw new Error('file-viewer: polling intervals and backoff maximum must be ordered')
  return value
})

/** @param ctx Host context. @param config Validated viewer configuration. */
export function apply(ctx: Context, config: Config): void {
  new FileViewerRemote(ctx, config)
}
