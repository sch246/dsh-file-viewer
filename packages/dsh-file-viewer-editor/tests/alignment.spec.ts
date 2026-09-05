import { describe, expect, it } from 'vitest'
import { buildComparison } from '../src/alignment.ts'

describe('common baseline alignment', () => {
  it('reserves identical insertion slots across unequal local/source changes', () => {
    const result = buildComparison('first\nlast', 'first\nlocal one\nlocal two\nlast', 'first\nsource\nlast')
    expect(result.rows.map(row => [row.local.text, row.source?.text])).toEqual([
      ['first', 'first'], ['local one', 'source'], ['local two', ''], ['last', 'last'],
    ])
    expect(result.rows.map(row => [row.local.baseLine, row.local.line, row.source?.baseLine, row.source?.line])).toEqual([
      [1, 1, 1, 1], [undefined, 2, undefined, 2], [undefined, 3, undefined, undefined], [2, 4, 2, 3],
    ])
  })

  it('keeps every real line once, with baseline-only deleted cells, for empty and terminal-line edits', () => {
    const texts = ['', '\n', 'one', 'one\n', 'one\ntwo', 'one\n\ntwo\n', 'other\ntwo\nthree', 'one\r\ntwo\r\n']
    for (const base of texts) for (const local of texts) for (const source of texts) {
      const result = buildComparison(base, local, source)
      for (const [key, text] of [['local', local], ['source', source]] as const) {
        const cells = result.rows.map(row => row[key]!)
        expect(cells.filter(cell => cell.line !== undefined).map(cell => cell.text).join('\n')).toBe(text)
        expect(cells.filter(cell => cell.baseLine !== undefined).map(cell => cell.baseLine)).toEqual(base.split('\n').map((_, index) => index + 1))
        for (const cell of cells) if (cell.deleted) expect(cell.line).toBeUndefined()
      }
    }
  })
})
