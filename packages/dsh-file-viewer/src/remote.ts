import type { Context } from '@deepseek-ai/cordis'
import { Remote, RemoteError, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type { FileViewerMetadata, FileViewerEditorSettingsSnapshot, FileViewerEditorSettingsUpdate } from './types.ts'
import type { FileViewerEditorSettings } from './editor-settings.ts'

/** Authenticated viewer metadata and shared editor settings. */
export class FileViewerRemote extends TypertRemoteService {
  /** @param ctx Host context. @param config Validated viewer configuration. @param settings Shared editor settings owner. */
  constructor(ctx: Context, private readonly config: FileViewerMetadata, private readonly settings: FileViewerEditorSettings) {
    super(ctx, 'fileViewer', { namespace: 'fileViewer' })
  }

  /** @returns Resource polling interval and file-size policy tiers. */
  @Remote('metadata')
  metadata(): FileViewerMetadata {
    return this.config
  }

  /** @returns Shared appearance, selected theme data and provider document location. */
  @Remote('editorSettings')
  editorSettings(): Promise<FileViewerEditorSettingsSnapshot> {
    return this.settingsRequest(() => this.settings.snapshot())
  }

  /** @param request Fields to merge into the shared settings namespace. @returns Committed appearance and decoded theme. */
  @Remote('setEditorSettings')
  setEditorSettings(request: FileViewerEditorSettingsUpdate): Promise<FileViewerEditorSettingsSnapshot> {
    return this.settingsRequest(() => this.settings.update(request))
  }

  /** @returns Actual prepared settings document path for the browser workbench; invokes no native opener. */
  @Remote('editorSettingsDocument')
  editorSettingsDocument(): Promise<string> {
    return this.settingsRequest(() => this.settings.document())
  }

  private async settingsRequest<T>(operation: () => Promise<T>): Promise<T> {
    try { return await operation() }
    catch (cause: unknown) {
      throw new RemoteError('gateway/bad-request', cause instanceof Error ? cause.message : String(cause), {}, { cause })
    }
  }
}
