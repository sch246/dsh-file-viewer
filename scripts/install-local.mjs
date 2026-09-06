import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

// Explicit development inputs override package resolution without changing distributed manifests.
const overrides = Object.fromEntries([
  ['DSH_USER_FILES', '@dsh-external/dsh-user-files'],
  ['DSH_SIDEBAR', '@dsh-external/dsh-right-sidebar'],
].map(([key, name]) => {
  const value = process.env[key]
  if (!value) throw new Error(`install-local: set ${key} to a package directory or tarball`)
  return [name, `${value.endsWith('.tgz') ? 'file' : 'link'}:${resolve(value)}`]
}))
const temporary = mkdtempSync(join(tmpdir(), 'dsh-viewer-install-'))
try {
  const hook = join(temporary, 'pnpmfile.cjs')
  writeFileSync(hook, `module.exports = { hooks: { readPackage(pkg) {
    const overrides = ${JSON.stringify(overrides)};
    for (const field of ['dependencies', 'devDependencies']) {
      for (const [name, spec] of Object.entries(overrides)) {
        if (pkg[field]?.[name]) pkg[field][name] = spec;
      }
    }
    return pkg;
  } } };\n`)
  const result = spawnSync('pnpm', ['install', '--no-frozen-lockfile', '--lockfile=false', '--pnpmfile', hook], {
    cwd: resolve(import.meta.dirname, '..'), stdio: 'inherit',
  })
  if (result.error) throw result.error
  process.exitCode = result.status ?? 1
} finally {
  rmSync(temporary, { recursive: true, force: true })
}
