import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { WorkspaceTypertGenerator } from '@deepseek-ai/dsh-typert-generator'

const root = new URL('..', import.meta.url).pathname
const [artifact] = new WorkspaceTypertGenerator(root, { checkDiagnostics: false })
  .generate(['@dsh-external/dsh-file-viewer'], ['host'])

if (artifact === undefined || artifact.remote === undefined) {
  throw new Error('typert: Host Remote artifact was not generated')
}

const output = join(root, artifact.packageRoot, 'lib')
writeFileSync(join(output, 'typert.host.js'), artifact.js)
writeFileSync(join(output, 'typert.host.d.ts'), artifact.dts)
writeFileSync(join(output, 'typert.remote-client.js'), artifact.remote.js)
writeFileSync(join(output, 'typert.remote-client.d.ts'), artifact.remote.dts)
writeFileSync(join(output, 'typert.remote-client.d.ts.map'), artifact.remote.dtsMap)
