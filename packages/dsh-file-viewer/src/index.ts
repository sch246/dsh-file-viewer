import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-fs'
import type {} from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-session-persistence'
import z from '@deepseek-ai/schemastery'
import { FileViewerWorkspaceRemote } from './remote.ts'

export type * from './types.ts'
export { FileViewerWorkspaceRemote } from './remote.ts'

export const name = 'file-viewer'
export const inject = ['fs', 'sessions', 'sessionPersistence']

/** Host deployment configuration. */
export interface Config {
  /** Inclusive byte limit for one workspace preview load. */
  maxReadBytes: number
  /** Chat file-click routing policy. */
  openMode: 'preview' | 'system' | 'preview-or-system'
}

/** Validated Host configuration; the deployment must choose its preview bound. */
export const Config: z<Config> = z.object({
  maxReadBytes: z.number().step(1).min(1).max(Number.MAX_SAFE_INTEGER).required(),
  openMode: z.union(['preview', 'system', 'preview-or-system'] as const).default('preview-or-system'),
})

/**
 * Mount the workspace Remote.
 * @param ctx - Host plugin context.
 * @param config - Validated deployment limits.
 */
export function apply(ctx: Context, config: Config): void {
  new FileViewerWorkspaceRemote(ctx, config.maxReadBytes, config.openMode)
}
