import { resolve } from 'node:path'
import { planUserFilesInstall } from '@dsh-external/dsh-user-files/install'

const [mode, profileDirectory] = process.argv.slice(2)
const sources = planUserFilesInstall({
  profileDirectory,
  consumerPackage: resolve(import.meta.dirname, '../packages/dsh-file-viewer'),
})
if (mode === 'verify' && sources.length > 0) throw new Error('profile is missing @dsh-external/dsh-user-files')
for (const source of sources) console.log(source)
