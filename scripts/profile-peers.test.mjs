import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { test } from 'node:test'

test('local dependency overrides resolve every sibling package inside this worktree', () => {
  const root = realpathSync(resolve(import.meta.dirname, '..'))
  const result = spawnSync(process.execPath, [join(import.meta.dirname, 'install-local.mjs'), '--check'], {
    encoding: 'utf8', env: { ...process.env, DSH_USER_FILES: root },
  })
  assert.equal(result.status, 0, result.stderr)
  const overrides = JSON.parse(result.stdout)
  for (const directory of ['dsh-file-viewer', 'dsh-file-viewer-editor', 'dsh-file-viewer-languages', 'dsh-html-preview', 'dsh-markdown-preview']) {
    assert.equal(overrides[`@dsh-external/${directory}`], `link:${realpathSync(join(root, 'packages', directory))}`)
  }
})

test('requires the shared provider without installing an external sidebar', t => {
  const root = mkdtempSync(join(tmpdir(), 'viewer-user-files-version-'))
  t.after(() => { rmSync(root, { recursive: true, force: true }) })
  const provider = join(root, 'node_modules', '@dsh-external', 'dsh-user-files')
  mkdirSync(provider, { recursive: true })
  const manifest = JSON.stringify({ dependencies: { '@dsh-external/dsh-user-files': '0.1.0' }, dsh: { profile: { bundles: ['@dsh-external/dsh-user-files'] } } })
  writeFileSync(join(root, 'package.json'), manifest)
  for (const version of ['0.1.12', '0.1.13']) {
    writeFileSync(join(provider, 'package.json'), JSON.stringify({ name: '@dsh-external/dsh-user-files', version }))
    const result = spawnSync(process.execPath, [join(import.meta.dirname, 'profile-peers.mjs'), 'prepare', root], { encoding: 'utf8' })
    assert.equal(result.signal, null)
    if (version === '0.1.12') {
      assert.notEqual(result.status, 0)
      assert.match(result.stderr, /0\.1\.12.*\^0\.1\.13|\^0\.1\.13.*0\.1\.12/)
      assert.equal(result.stdout, '')
    } else {
      assert.equal(result.status, 0, result.stderr)
      assert.equal(result.stdout, '')
    }
  }
})
