import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import semver from 'semver'
import { planUserFilesInstall } from '@dsh-external/dsh-user-files/install'

const [mode, profileDirectory] = process.argv.slice(2)
const viewer = JSON.parse(readFileSync(new URL('../packages/dsh-file-viewer/package.json', import.meta.url), 'utf8'))
const providerSources = planUserFilesInstall({
  profileDirectory,
  consumerPackage: resolve(import.meta.dirname, '../packages/dsh-file-viewer'),
})
if (mode === 'verify' && providerSources.length > 0) throw new Error('profile is missing @dsh-external/dsh-user-files')
for (const source of providerSources) console.log(source)
for (const [name, variable] of [
  ['@dsh-external/dsh-right-sidebar', 'DSH_SIDEBAR'],
]) {
  const required = viewer.peerDependencies[name]
  let installed
  try {
    installed = JSON.parse(readFileSync(resolve(profileDirectory, 'node_modules', name, 'package.json'), 'utf8'))
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
  if (installed !== undefined) {
    if (!semver.satisfies(installed.version, required, { includePrerelease: true })) {
      throw new Error(`${name}@${installed.version} does not satisfy viewer peer ${required}; reconcile existing consumers before updating this provider`)
    }
    continue
  }
  if (mode === 'verify') throw new Error(`profile is missing ${name}`)
  const source = process.env[variable]
  if (!source) throw new Error(`profile is missing ${name}; install a compatible provider or set ${variable} to its package directory or tarball`)
  console.log(resolve(source))
}
