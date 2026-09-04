import type { UserConfig } from 'tsdown'

const CLIENT_EXTERNALS = [
  'react', 'react/jsx-runtime', 'react-dom', 'react-dom/client', '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-ui-slots', '@dsh-external/dsh-file-viewer-editor/client',
]

export default {
  entry: { client: 'lib/types/client/index.js' }, outDir: 'lib', format: 'cjs', platform: 'browser',
  dts: false, sourcemap: true, clean: false,
  deps: { neverBundle: CLIENT_EXTERNALS, alwaysBundle: (id: string) => !CLIENT_EXTERNALS.includes(id) },
  outputOptions: {
    entryFileNames: 'client.js', codeSplitting: false,
    banner: 'window.__ModuleLoader__.load({ id: "@dsh-external/dsh-file-viewer", factory: (require) => {',
    footer: 'return module.exports; } });',
    intro: 'var module = { exports: {} }; var exports = module.exports;',
  },
} satisfies UserConfig
