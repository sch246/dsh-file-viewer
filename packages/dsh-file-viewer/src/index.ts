import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { FileViewerRemote } from './remote.ts'
import { FileViewerEditorSettings } from './editor-settings.ts'

export { FileViewerRemote } from './remote.ts'
export type { FileViewerMetadata } from './types.ts'

export const name = 'file-viewer'
export const inject = ['settings']

/** Viewer deployment configuration. */
export interface Config {
  /** Delay between completed filesystem source polls while subscribed. */
  resourcePollIntervalMs: number
  largeResourcePollIntervalMs: number
  hugeResourcePollIntervalMs: number
  resourcePollBackoffMaxMs: number
  maxDeltaBytes: number
  /** Canonical UTF-8 block sizes; local edits rebalance only neighboring blocks. */
  textBlockMinBytes: number
  textBlockTargetBytes: number
  textBlockMaxBytes: number
  /** Input idle time before dirty block hashes are checked. */
  largeEditCheckDelayMs: number
  /** Maximum concurrent unary chunk requests for one open document. */
  textReadConcurrency: number
  /** Timeout for each prepared-read request attempt. */
  textReadTimeoutMs: number
  /** Additional attempts for transient request failures; zero disables retries. */
  textReadRetries: number
  /** Initial exponential retry delay, capped by textReadTimeoutMs. */
  textReadRetryDelayMs: number
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
  textBlockMinBytes: z.number().step(1).min(4).max(Number.MAX_SAFE_INTEGER).default(512 * 1024),
  textBlockTargetBytes: z.number().step(1).min(4).max(Number.MAX_SAFE_INTEGER).default(1024 * 1024),
  textBlockMaxBytes: z.number().step(1).min(4).max(Number.MAX_SAFE_INTEGER).default(2 * 1024 * 1024),
  largeEditCheckDelayMs: z.number().step(1).min(1).max(Number.MAX_SAFE_INTEGER).default(300),
  textReadConcurrency: z.number().step(1).min(1).max(16).default(3),
  textReadTimeoutMs: z.number().step(1).min(1).max(Number.MAX_SAFE_INTEGER).default(15_000),
  textReadRetries: z.number().step(1).min(0).max(10).default(3),
  textReadRetryDelayMs: z.number().step(1).min(1).max(Number.MAX_SAFE_INTEGER).default(250),
  progressiveFlushIntervalMs: z.number().step(1).min(1).max(Number.MAX_SAFE_INTEGER).default(300),
  largeFileBytes: z.number().step(1).min(1).max(Number.MAX_SAFE_INTEGER).default(10 * 1024 * 1024),
  hugeFileBytes: z.number().step(1).min(1).max(Number.MAX_SAFE_INTEGER).default(100 * 1024 * 1024),
  resourcePollIntervalMs: z.number().step(1).min(1).max(Number.MAX_SAFE_INTEGER).required(),
})

/** Validated ordered byte tiers and resource polling configuration. */
export const Config: z<Config> = z.transform(fields, (value) => {
  if (value.textBlockMinBytes > value.textBlockTargetBytes || value.textBlockTargetBytes > value.textBlockMaxBytes) throw new Error('file-viewer: text block byte sizes must be ordered')
  if (value.hugeFileBytes <= value.largeFileBytes) throw new Error('file-viewer: hugeFileBytes must exceed largeFileBytes')
  if (value.largeResourcePollIntervalMs < value.resourcePollIntervalMs || value.hugeResourcePollIntervalMs < value.largeResourcePollIntervalMs
    || value.resourcePollBackoffMaxMs < value.hugeResourcePollIntervalMs) throw new Error('file-viewer: polling intervals and backoff maximum must be ordered')
  return value
})

/** @param ctx Host context. @param config Validated viewer configuration. */
export function apply(ctx: Context, config: Config): void {
  new FileViewerRemote(ctx, config, new FileViewerEditorSettings(ctx))
}
