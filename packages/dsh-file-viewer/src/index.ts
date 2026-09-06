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
  /** Text length in UTF-16 code units above which the editor shows an advisory. */
  largeDocumentCharacters: number
}

/** Validated viewer polling and presentation configuration. */
export const Config: z<Config> = z.object({
  largeDocumentCharacters: z.number().step(1).min(1).max(Number.MAX_SAFE_INTEGER).default(2_097_152),
  resourcePollIntervalMs: z.number().step(1).min(1).max(Number.MAX_SAFE_INTEGER).required(),
})

/** @param ctx Host context. @param config Validated viewer configuration. */
export function apply(ctx: Context, config: Config): void {
  new FileViewerRemote(ctx, config)
}
