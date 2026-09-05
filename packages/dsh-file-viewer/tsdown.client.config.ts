import type { UserConfig } from 'tsdown'

const CLIENT_EXTERNALS = [
  'react', 'react/jsx-runtime', 'react-dom', 'react-dom/client', '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-ui-slots', '@dsh-external/dsh-file-viewer-editor/client',
]

const node: UserConfig = {
  entry: { index: 'lib/types/index.js' }, outDir: 'lib', format: 'esm', platform: 'node',
  dts: false, sourcemap: true, clean: false,
}

const client: UserConfig = {
  entry: { client: 'lib/types/client/index.js' }, outDir: 'lib', format: 'cjs', platform: 'browser',
  dts: false, sourcemap: true, clean: false,
  external: CLIENT_EXTERNALS,
  noExternal: (id: string) => !CLIENT_EXTERNALS.includes(id),
  outputOptions: {
    entryFileNames: 'client.js',
    banner: 'window.__ModuleLoader__.load({ id: "@dsh-external/dsh-file-viewer", factory: (require) => {',
    footer: 'return module.exports; } });',
    intro: 'var module = { exports: {} }; var exports = module.exports;',
  },
}

export default [node, client]
