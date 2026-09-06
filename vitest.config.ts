import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import ts from 'typescript'

const fromRoot = (path: string): string => fileURLToPath(new URL(path, import.meta.url))

const hostRoot = fromRoot('./harness')
const { config } = ts.readConfigFile(resolve(hostRoot, 'tsconfig.base.json'), ts.sys.readFile)
const hostAliases = Object.fromEntries(Object.entries(config.compilerOptions.paths as Record<string, string[]>)
  .filter(([name]) => !name.includes('*'))
  .map(([name, paths]) => [name, resolve(hostRoot, paths[0]!)]))

export default defineConfig({
  test: { maxWorkers: 2 },
  esbuild: { jsx: 'automatic' },
  resolve: {
    alias: {
      ...hostAliases,
      '@deepseek-ai/dsh-client-locale/client': fromRoot('./harness/packages/client/locale/src/client/index.ts'),
      '@deepseek-ai/dsh-client-ui-renderer/client': fromRoot('./harness/packages/client/ui-renderer/src/client/index.ts'),
      '@dsh-external/dsh-right-sidebar/client': fromRoot(`${process.env.DSH_SIDEBAR ?? './node_modules/@dsh-external/dsh-right-sidebar'}/src/client/index.ts`),
    },
  },
})
