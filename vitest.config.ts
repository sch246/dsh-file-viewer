import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const fixture = (path: string): string => fileURLToPath(new URL(path, import.meta.url))

export default defineConfig({
  resolve: {
    alias: {
      // The production descriptor is generated during build. Source-plane tests
      // exercise client policy without requiring artifact-plane output first.
      '@dsh-external/dsh-file-viewer/remote': fixture(
        './packages/dsh-file-viewer/tests/fixtures/file-viewer-remote.ts',
      ),
    },
  },
})
