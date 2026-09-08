import type { UserConfig } from 'tsdown'

/**
 * Resolve browser dependencies and reject imports absent from the Client module table.
 * @param externalIds Modules supplied by the Host loader.
 * @returns Browser-only bundler options for a wrapped CommonJS Client entry.
 */
export function browserBuild(externalIds: readonly string[] = []): Pick<UserConfig, 'inputOptions'> {
  const allowed = new Set(externalIds)
  return {
    inputOptions: {
      // tsdown selects Node for CommonJS unless overridden at the bundler level.
      platform: 'browser',
      plugins: [{
        name: 'client-module-imports',
        generateBundle(_options, bundle) {
          for (const output of Object.values(bundle)) {
            if (output.type !== 'chunk') continue
            for (const id of [...output.imports, ...output.dynamicImports]) {
              if (!bundle[id] && !allowed.has(id)) this.error(`Client bundle ${output.fileName} has undeclared import: ${id}`)
            }
          }
        },
      }],
    },
  }
}
