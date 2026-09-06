import type { Context } from '@deepseek-ai/cordis'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type { FileViewerMetadata } from './types.ts'

/** Authenticated metadata for the viewer's filesystem source. */
export class FileViewerRemote extends TypertRemoteService {
  /** @param ctx Host context. @param config Validated viewer configuration. */
  constructor(ctx: Context, private readonly config: FileViewerMetadata) {
    super(ctx, 'fileViewer', { namespace: 'fileViewer' })
  }

  /** @returns Resource polling interval and file-size policy tiers. */
  @Remote('metadata')
  metadata(): FileViewerMetadata {
    return this.config
  }
}
