import type { UserConfig } from 'tsdown'
import { browserBuild } from '../../scripts/browser-build.ts'

const CLIENT_EXTERNALS = ['react', 'react/jsx-runtime', '@deepseek-ai/cordis', '@dsh-external/dsh-file-viewer/client', '@deepseek-ai/dsh-client-ui-primitives']

const node: UserConfig = {
  entry: { index: 'lib/types/index.js' }, outDir: 'lib', format: 'esm', platform: 'node',
  dts: false, sourcemap: true, clean: false, fixedExtension: false,
}
const client: UserConfig = {
  ...browserBuild(CLIENT_EXTERNALS),
  entry: { client: 'lib/types/client.js' }, outDir: 'lib', format: 'cjs', platform: 'browser',
  dts: false, sourcemap: true, clean: false, fixedExtension: false,
  deps: { neverBundle: CLIENT_EXTERNALS, alwaysBundle: (id: string) => !CLIENT_EXTERNALS.includes(id), onlyBundle: false },
  outputOptions: {
    codeSplitting: false,
    entryFileNames: 'client.js',
    banner: 'window.__ModuleLoader__.load({ id: "@dsh-external/dsh-markdown-preview", factory: (require) => {',
    footer: 'return module.exports; } });',
    intro: 'var module = { exports: {} }; var exports = module.exports;',
  },
}

export default [node, client]
