import { existsSync, writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { join } from 'node:path'

const root = join(import.meta.dirname, '..')
const checkout = process.env.DSH_CHECKOUT
if (checkout === undefined || checkout === '') {
  throw new Error('generate-typert: set DSH_CHECKOUT to an explicit DeepSeek Harness alpha.2 checkout')
}
const generatorEntry = join(checkout, 'packages/typert/generator/lib/types/index.js')
if (!existsSync(generatorEntry)) {
  throw new Error(`generate-typert: Harness generator is not built at ${generatorEntry}`)
}
const { WorkspaceTypertGenerator } = await import(pathToFileURL(generatorEntry).href)
const [artifact] = new WorkspaceTypertGenerator(root, {
  checkDiagnostics: false,
  externalProjectReferences: true,
})
  .generate(['@dsh-external/dsh-file-viewer'], ['host'])

if (artifact === undefined || artifact.remote === undefined) {
  throw new Error(
    'generate-typert: expected one Host artifact with Remote output; '
    + 'the Harness generator must support externalProjectReferences for this external workspace',
  )
}

const output = join(root, artifact.packageRoot, 'lib')
writeFileSync(join(output, 'typert.host.js'), artifact.js)
writeFileSync(join(output, 'typert.host.d.ts'), artifact.dts)
writeFileSync(join(output, 'typert.remote-client.js'), artifact.remote.js)
writeFileSync(join(output, 'typert.remote-client.d.ts'), artifact.remote.dts)
writeFileSync(join(output, 'typert.remote-client.d.ts.map'), artifact.remote.dtsMap)
