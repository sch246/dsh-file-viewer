import { describe, expect, it } from 'vitest'
import { diffTextLines } from '@dsh-external/dsh-user-files/text-patch'

function lines(text: string) { return text.match(/[^\n]*\n|[^\n]+$/g) ?? [] }

describe('guarded line changes', () => {
  it.each([
    ['', 'new'], ['a', 'a\n'], ['a\n', 'a'], ['a\n', 'a\nb\n'],
    ['a\nb\nc', 'a\ninsert\nb\nc'], ['a\nb\nc', 'A\nb\nC'],
    ['a\nb\nc\nd\ne\n', 'A\nb\nc\nd\nE\n'], ['one\ntwo', ''],
  ])('reconstructs exact new text with disjoint original coordinates: %j', (base, local) => {
    const changes = diffTextLines(base, local)
    const original = lines(base)
    let end = 0, output = ''
    for (const change of changes) {
      expect(change.startLine).toBeGreaterThanOrEqual(end)
      if (base !== '') expect(change.lineCount).toBeGreaterThan(0)
      expect(change.oldText).toBe(original.slice(change.startLine, change.startLine + change.lineCount).join(''))
      output += original.slice(end, change.startLine).join('') + change.replacement
      end = change.startLine + change.lineCount
    }
    expect(output + original.slice(end).join('')).toBe(local)
  })

  it('sends only separated changed lines and guards a pure insertion with one existing neighbor', () => {
    expect(diffTextLines('a\nb\nc\nd\ne\n', 'A\nb\nc\nd\nE\n')).toEqual([
      { startLine: 0, lineCount: 1, oldText: 'a\n', replacement: 'A\n' },
      { startLine: 4, lineCount: 1, oldText: 'e\n', replacement: 'E\n' },
    ])
    expect(diffTextLines('a\nb\n', 'a\nnew\nb\n')).toEqual([
      { startLine: 0, lineCount: 1, oldText: 'a\n', replacement: 'a\nnew\n' },
    ])
  })
})
