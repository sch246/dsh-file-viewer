import { readFileSync, statSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import semver from 'semver'
import { planUserFilesInstall } from '@dsh-external/dsh-user-files/install'

const [mode, profileDirectory] = process.argv.slice(2)
const viewer = JSON.parse(readFileSync(new URL('../packages/dsh-file-viewer/package.json', import.meta.url), 'utf8'))
const sources = planUserFilesInstall({
  profileDirectory,
  consumerPackage: resolve(import.meta.dirname, '../packages/dsh-file-viewer'),
})
if (mode === 'verify' && sources.length > 0) throw new Error('profile is missing @dsh-external/dsh-user-files')
const name = '@dsh-external/dsh-right-sidebar'
const required = viewer.peerDependencies[name]

function assertSidebar(manifest, source) {
  if (manifest.name !== name) throw new Error(`Expected ${name} at ${source}`)
  if (!semver.satisfies(manifest.version, required, { includePrerelease: true })) {
    throw new Error(`${name}@${manifest.version} does not satisfy viewer peer ${required}; select a compatible sidebar before installation`)
  }
}

let installed
try {
  installed = JSON.parse(readFileSync(resolve(profileDirectory, 'node_modules', name, 'package.json'), 'utf8'))
} catch (error) {
  if (error.code !== 'ENOENT') throw error
}
if (installed !== undefined) {
  assertSidebar(installed, profileDirectory)
} else {
  if (mode === 'verify') throw new Error(`profile is missing ${name}`)
  if (!process.env.DSH_SIDEBAR) throw new Error(`profile is missing ${name}; install a compatible provider or set DSH_SIDEBAR to its package directory or tarball`)
  const source = resolve(process.env.DSH_SIDEBAR)
  const manifest = statSync(source).isDirectory()
    ? readFileSync(resolve(source, 'package.json'), 'utf8')
    : execFileSync('tar', ['-xOf', source, 'package/package.json'], { encoding: 'utf8' })
  assertSidebar(JSON.parse(manifest), source)
  sources.push(source)
}
for (const source of sources) console.log(source)
