import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

const fromRoot = (path: string): string => fileURLToPath(new URL(path, import.meta.url))

export default defineConfig({
  esbuild: { jsx: 'automatic' },
  resolve: {
    alias: {
      '@deepseek-ai/dsh-client-locale/client': fromRoot('./harness/packages/client/locale/src/client/index.ts'),
      '@deepseek-ai/dsh-client-ui-renderer/client': fromRoot('./harness/packages/client/ui-renderer/src/client/index.ts'),
      '@dsh-external/dsh-right-sidebar/client': fromRoot('../dsh-right-sidebar/src/client/index.ts'),
    },
  },
})
