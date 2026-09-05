/** Shared baseline rows for editable comparisons; documents contain only their own text. */
import { Chunk } from '@codemirror/merge'
import { Text } from '@codemirror/state'

/** One real document line or a visual baseline deletion/empty alignment row. */
export interface ComparisonCell {
  readonly line?: number
  readonly baseLine?: number
  readonly text: string
  readonly deleted?: boolean
  /** Deleted character intervals relative to this baseline line, excluding its newline. */
  readonly deletedRanges?: readonly { readonly from: number; readonly to: number }[]
  readonly inserted?: boolean
}

/** Both cells occupy the same vertical interval, including soft wraps. */
export interface ComparisonRow {
  readonly local: ComparisonCell
  readonly source?: ComparisonCell
}

/** A side's character changes supplement its row-level insertion color. */
export interface ComparisonSide {
  readonly doc: Text
  readonly chunks: readonly Chunk[]
  readonly baseline: ReadonlyMap<number, ComparisonCell>
  readonly insertions: ReadonlyMap<number, readonly ComparisonCell[]>
}

const blank: ComparisonCell = { text: '' }

function lineIndex(doc: Text, position: number): number {
  return position > doc.length ? doc.lines : doc.lineAt(position).number - 1
}

function project(base: Text, text: string): ComparisonSide {
  const doc = Text.of(text.split('\n'))
  const chunks = Chunk.build(base, doc)
  const baseline = new Map<number, ComparisonCell>()
  const insertions = new Map<number, ComparisonCell[]>()
  let a = 0, b = 0
  const unchanged = (end: number) => {
    while (a < end) {
      baseline.set(a, { line: b + 1, baseLine: a + 1, text: doc.line(b + 1).text })
      a++; b++
    }
  }
  for (const chunk of chunks) {
    unchanged(lineIndex(base, chunk.fromA))
    const endA = lineIndex(base, chunk.toA)
    const endB = lineIndex(doc, chunk.toB)
    while (a < endA) {
      const line = base.line(a + 1)
      const deletedRanges = chunk.changes.map(change => ({
        from: Math.max(line.from, chunk.fromA + change.fromA) - line.from,
        to: Math.min(line.to, chunk.fromA + change.toA) - line.from,
      })).filter(range => range.from < range.to)
      baseline.set(a, { baseLine: a + 1, text: line.text, deleted: true, deletedRanges })
      a++
    }
    const added: ComparisonCell[] = []
    while (b < endB) {
      added.push({ line: b + 1, text: doc.line(b + 1).text, inserted: true })
      b++
    }
    insertions.set(a, added)
  }
  unchanged(base.lines)
  return { doc, chunks, baseline, insertions }
}

/**
 * Align both changes to one baseline, pairing insertions at the same baseline position.
 * @param baseText Exact common baseline.
 * @param localText Current first pane text.
 * @param sourceText Optional second pane text.
 * @returns Shared rows and CodeMirror's character changes for each pane.
 */
export function buildComparison(baseText: string, localText: string, sourceText?: string): {
  rows: readonly ComparisonRow[]
  local: ComparisonSide
  source?: ComparisonSide
} {
  const base = Text.of(baseText.split('\n'))
  const local = project(base, localText)
  const source = sourceText === undefined ? undefined : project(base, sourceText)
  const rows: ComparisonRow[] = []
  for (let index = 0; index <= base.lines; index++) {
    const left = local.insertions.get(index) ?? []
    const right = source?.insertions.get(index) ?? []
    for (let offset = 0; offset < Math.max(left.length, right.length); offset++) {
      rows.push({ local: left[offset] ?? blank, source: source ? right[offset] ?? blank : undefined })
    }
    if (index < base.lines) rows.push({ local: local.baseline.get(index)!, source: source?.baseline.get(index) })
  }
  return { rows, local, source }
}
