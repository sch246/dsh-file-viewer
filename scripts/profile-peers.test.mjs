import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

for (const format of ['directory', 'tarball']) {
  test(`checks explicit sidebar ${format} identity and version before planning installation`, t => {
    const root = mkdtempSync(join(tmpdir(), 'viewer-peer-source-'))
    t.after(() => { rmSync(root, { recursive: true, force: true }) })
    const directory = join(root, 'package')
    mkdirSync(directory)
    const profile = join(root, 'profile')
    for (const [name, version, expectedError] of [
      ['@dsh-external/dsh-right-sidebar', '0.0.1', undefined],
      ['@dsh-external/dsh-right-sidebar', '1.0.0', /does not satisfy viewer peer/],
      ['different-package', '0.0.1', /Expected @dsh-external\/dsh-right-sidebar/],
    ]) {
      writeFileSync(join(directory, 'package.json'), JSON.stringify({ name, version }))
      const source = format === 'directory' ? directory : join(root, 'sidebar.tgz')
      if (format === 'tarball') execFileSync('tar', ['-czf', source, 'package/package.json'], { cwd: root })
      const result = spawnSync(process.execPath, [join(import.meta.dirname, 'profile-peers.mjs'), 'prepare', profile], {
        env: { ...process.env, DSH_SIDEBAR: source }, encoding: 'utf8',
      })
      assert.equal(result.signal, null)
      assert.equal(existsSync(profile), false)
      if (expectedError === undefined) {
        assert.equal(result.status, 0, result.stderr)
        assert.ok(result.stdout.trim().split('\n').includes(source))
      } else {
        assert.notEqual(result.status, 0)
        assert.match(result.stderr, expectedError)
        assert.equal(result.stdout, '')
      }
    }
  })
}
