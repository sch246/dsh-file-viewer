/** Shared editor appearance over the Host's existing settings provider and document. */
import type { Context } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'
import type { SettingsProvider, SettingsScope } from '@deepseek-ai/dsh-settings'
import { z } from 'zod'
import { FileViewerThemeLoader } from './editor-themes.ts'
import type { FileViewerEditorPreferences, FileViewerEditorSettingsSnapshot, FileViewerEditorSettingsUpdate } from './types.ts'

const preferencesSchema: Schema<FileViewerEditorPreferences> = Schema.object({
  fontFamily: Schema.string().default('ui-monospace, SFMono-Regular, Consolas, monospace'),
  fontSize: Schema.number().min(8).max(40).default(13),
  theme: Schema.string().default('auto'),
})
const updateSchema = z.object({
  fontFamily: z.string().min(1).optional(),
  fontSize: z.number().min(8).max(40).optional(),
  theme: z.string().min(1).optional(),
}).strict()

/** Namespace owner; the provider alone persists settings and watches external document edits. */
export class FileViewerEditorSettings {
  private readonly scope: SettingsScope<FileViewerEditorPreferences>
  private readonly provider: SettingsProvider
  private readonly themes = new FileViewerThemeLoader()

  /** @param ctx Viewer plugin context with the shared settings provider injected. */
  constructor(ctx: Context) {
    this.provider = ctx.settings
    this.scope = this.provider.register('file-viewer', preferencesSchema, {
      applies: 'live',
      validate: value => {
        if (value.fontFamily.trim() === '' || value.theme.trim() === '') throw new Error('file-viewer: editor fontFamily and theme must not be empty')
      },
    })
  }

  /** @returns Current shared preferences, decoded theme and actual provider document location. */
  async snapshot(): Promise<FileViewerEditorSettingsSnapshot> {
    const preferences = this.scope.get()
    return {
      preferences,
      themeData: await this.themes.load(preferences.theme, this.provider.documentPath),
      themeChoices: this.themes.choices(),
      documentPath: this.provider.documentPath ?? null,
    }
  }

  /** @param request Partial appearance update. @returns Committed settings; invalid themes fail before persistence. */
  async update(request: FileViewerEditorSettingsUpdate): Promise<FileViewerEditorSettingsSnapshot> {
    const patch = updateSchema.parse(request)
    if (patch.theme !== undefined) await this.themes.load(patch.theme, this.provider.documentPath)
    await this.scope.update(patch)
    return this.snapshot()
  }

  /** @returns Prepared provider document path for opening in the browser workbench. @throws If the configured provider has no local document. */
  async document(): Promise<string> {
    const path = await this.provider.prepareDocument()
    if (path === undefined) throw new Error('file-viewer: the settings provider has no local document')
    return path
  }
}
