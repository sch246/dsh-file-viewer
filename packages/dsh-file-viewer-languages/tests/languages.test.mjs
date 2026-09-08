import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import test from 'node:test'
import { compileFunction } from 'node:vm'
import { StreamLanguage } from '@codemirror/language'

const root = new URL('../', import.meta.url)

async function loadPlugin() {
  let plugin
  compileFunction(await readFile(new URL('lib/client.js', root), 'utf8'), ['window'])({
    __ModuleLoader__: { load(entry) {
      assert.equal(entry.id, '@dsh-external/dsh-file-viewer-languages')
      plugin = entry.factory(id => { throw new Error(`Unexpected runtime dependency: ${id}`) })
    } },
  })
  assert.ok(plugin)
  return plugin
}

function register(plugin) {
  const languages = new Map()
  const disposers = []
  plugin.apply({
    resourceWorkbench: { registerEditorLanguage(language) {
      assert.ok(!languages.has(language.id))
      languages.set(language.id, language)
      return () => { languages.delete(language.id) }
    } },
    effect(callback) { disposers.push(callback()) },
  })
  return { languages, dispose() { disposers.reverse().forEach(dispose => dispose()) } }
}

test('shipped client registers disposable plain parsers without runtime imports or extra chunks', async () => {
  const plugin = await loadPlugin()
  assert.deepEqual(Array.from(plugin.inject), ['resourceWorkbench'])
  const { languages, dispose } = register(plugin)
  assert.equal(languages.size, 20)
  for (const language of languages.values()) {
    const parser = await language.load()
    assert.equal(typeof parser.token, 'function', language.id)
    assert.equal(parser.extension, undefined, language.id)
    assert.doesNotThrow(() => StreamLanguage.define(parser).parser.parse(''), language.id)
  }
  dispose()
  assert.equal(languages.size, 0)
  const artifacts = (await readdir(new URL('lib/', root))).filter(name => name.endsWith('.js')).sort()
  assert.deepEqual(artifacts, ['client.js', 'index.js'])
  const sourceMap = JSON.parse(await readFile(new URL('lib/client.js.map', root), 'utf8'))
  assert.ok(sourceMap.sources.some(source => source.includes('legacy-modes')))
  assert.ok(sourceMap.sources.every(source => !/codemirror\/(?:state|view|language)\//.test(source)))
  const host = await import(new URL('lib/index.js', root))
  assert.equal(host.name, 'file-viewer-languages')
  host.apply()
})

test('common filename modes produce syntax tokens in the editor parser', async () => {
  const { languages, dispose } = register(await loadPlugin())
  const samples = {
    javascript: 'const answer = 42;', typescript: 'const answer: number = 42;',
    json: '{"answer": 42}', python: 'def answer():\n    return 42',
    html: '<div class="answer">42</div>', css: 'div { color: red; }',
    yaml: 'answer: true', shell: 'echo "$HOME"',
    dockerfile: 'FROM alpine:3',
  }
  for (const [id, sample] of Object.entries(samples)) {
    const tree = StreamLanguage.define(await languages.get(id).load()).parser.parse(sample)
    assert.ok(tree.topNode.firstChild, `${id} produces syntax tokens`)
  }
  assert.ok(languages.get('shell').filenames.includes('.bashrc'))
  assert.ok(languages.get('dockerfile').filenames.includes('Dockerfile'))
  assert.equal(languages.has('markdown'), false)
  dispose()
})
