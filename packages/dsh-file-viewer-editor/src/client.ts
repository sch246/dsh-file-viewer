/** Editable local text and a readonly source pane share baseline rows and measured wrap heights. */
import { Compartment, EditorSelection, EditorState, StateEffect, StateField, Text, Transaction, type Range } from '@codemirror/state'
import { history, historyKeymap } from '@codemirror/commands'
import { Decoration, EditorView, GutterMarker, WidgetType, gutter, keymap, lineNumbers, type DecorationSet } from '@codemirror/view'
import { buildComparison, type ComparisonCell, type ComparisonSide } from './alignment.ts'

/** Exact comparison inputs and caller-localized pane labels. */
export interface FileViewerComparison {
  readonly baseText: string
  readonly sourceText?: string
  readonly labels: { readonly local: string; readonly source: string; readonly noDifferences: string }
}

/** Parameters for one retained local CodeMirror instance. */
export interface FileViewerEditorOptions {
  readonly parent: HTMLElement
  readonly text: string
  readonly readOnly: boolean
  readonly onChange: (text: string) => void
  readonly lineNumbers?: boolean
  readonly comparison?: FileViewerComparison
  /** Opaque, memory-only snapshot captured by this module for the same resource view. */
  readonly viewState?: unknown
  /** Receives document, selection and scroll changes, and the final state before disposal. */
  readonly onViewStateChange?: (state: unknown) => void
}

/** Disposal releases both panes, observers and queued geometry work. */
export interface FileViewerEditorHandle {
  /** Replace source text without recording an undo step or invoking onChange. */
  setText(text: string): void
  /** Toggle ordinary line numbers or both baseline/current columns in every comparison pane. */
  setLineNumbers(enabled: boolean): void
  /** Toggle or update comparison without replacing the local view, selection or undo history. */
  setComparison(comparison: FileViewerComparison | undefined): void
  /** Capture local selection, undo history and scroll offsets for a later mount. */
  captureViewState(): unknown
  destroy(): void
}

class ViewState {
  constructor(
    readonly state: EditorState,
    readonly scrollTop: number,
    readonly scrollLeft: number,
    readonly scrollEffect: ReturnType<EditorView['scrollSnapshot']>,
  ) {}
}

const bindings = new WeakMap<EditorView, { options: FileViewerEditorOptions; applying: boolean }>()

function captureViewState(view: EditorView): ViewState {
  return new ViewState(view.state, view.scrollDOM.scrollTop, view.scrollDOM.scrollLeft, view.scrollSnapshot())
}

function reportViewState(view: EditorView): void {
  bindings.get(view)?.options.onViewStateChange?.(captureViewState(view))
}

// Captured states must not retain a disposed view or its callbacks.
const updateListener = EditorView.updateListener.of((update) => {
  const binding = bindings.get(update.view)
  if (update.docChanged && binding && !binding.applying) binding.options.onChange(update.state.doc.toString())
  if (update.docChanged || update.selectionSet) reportViewState(update.view)
})

function replaceText(state: EditorState, text: string): Transaction {
  return state.update({
    changes: { from: 0, to: state.doc.length, insert: Text.of(text.split('\n')) },
    selection: EditorSelection.create(state.selection.ranges.map(range => EditorSelection.range(
      Math.min(range.anchor, text.length), Math.min(range.head, text.length),
    )), state.selection.mainIndex),
    annotations: Transaction.addToHistory.of(false),
  })
}

interface VisualRow { readonly cell: ComparisonCell; readonly height: number; readonly index: number }
interface Presentation { readonly decorations: DecorationSet; readonly lines: ReadonlyMap<number, ComparisonCell> }
const emptyPresentation: Presentation = { decorations: Decoration.none, lines: new Map() }
const presentationEffect = StateEffect.define<Presentation>()
const presentation = StateField.define<Presentation>({
  create: () => emptyPresentation,
  update: (value, transaction) => {
    for (const effect of transaction.effects) if (effect.is(presentationEffect)) return effect.value
    return transaction.docChanged ? { ...value, decorations: value.decorations.map(transaction.changes) } : value
  },
  provide: field => EditorView.decorations.from(field, value => value.decorations),
})

class VisualRows extends WidgetType {
  constructor(readonly rows: readonly VisualRow[]) { super() }
  eq(other: VisualRows): boolean {
    return this.rows.length === other.rows.length && this.rows.every((row, index) => {
      const otherRow = other.rows[index]!
      return row.height === otherRow.height && row.index === otherRow.index
        && row.cell.text === otherRow.cell.text && row.cell.baseLine === otherRow.cell.baseLine
        && row.cell.deleted === otherRow.cell.deleted
        && (row.cell.deletedRanges?.length ?? 0) === (otherRow.cell.deletedRanges?.length ?? 0)
        && (row.cell.deletedRanges ?? []).every((range, position) => {
          const otherRange = otherRow.cell.deletedRanges![position]!
          return range.from === otherRange.from && range.to === otherRange.to
        })
    })
  }
  get estimatedHeight(): number { return this.rows.reduce((height, row) => height + row.height, 0) }
  toDOM(): HTMLElement {
    const wrapper = document.createElement('div')
    wrapper.className = 'cm-comparison-visual'
    wrapper.setAttribute('contenteditable', 'false')
    wrapper.setAttribute('aria-hidden', 'true')
    for (const row of this.rows) {
      const line = document.createElement('div')
      line.className = row.cell.deleted ? 'cm-deletedChunk' : 'cm-alignment-blank'
      line.dataset.comparisonRow = String(row.index)
      line.style.height = `${row.height}px`
      let offset = 0
      for (const range of row.cell.deletedRanges ?? []) {
        line.appendChild(document.createTextNode(row.cell.text.slice(offset, range.from)))
        const changed = document.createElement('span')
        changed.className = 'cm-deletedText'
        changed.textContent = row.cell.text.slice(range.from, range.to)
        line.appendChild(changed)
        offset = range.to
      }
      line.appendChild(document.createTextNode(row.cell.text.slice(offset) || (row.cell.text ? '' : '\u200b')))
      wrapper.appendChild(line)
    }
    return wrapper
  }
  ignoreEvent(): boolean { return true }
}

class Numbers extends GutterMarker {
  constructor(readonly rows: readonly { cell: ComparisonCell; height?: number }[]) { super() }
  toDOM(): HTMLElement {
    const wrapper = document.createElement('div')
    for (const row of this.rows) {
      const line = document.createElement('div')
      line.className = 'cm-comparison-numbers'
      if (row.height !== undefined) line.style.height = `${row.height}px`
      for (const number of [row.cell.baseLine, row.cell.line]) {
        const column = document.createElement('span')
        column.textContent = number === undefined ? '' : String(number)
        line.appendChild(column)
      }
      wrapper.appendChild(line)
    }
    return wrapper
  }
}

const comparisonGutter = gutter({
  class: 'cm-comparison-gutter',
  lineMarker: (view, line) => {
    const cell = view.state.field(presentation).lines.get(line.from)
    return cell ? new Numbers([{ cell }]) : null
  },
  widgetMarker: (_view, widget) => widget instanceof VisualRows ? new Numbers(widget.rows) : null,
  lineMarkerChange: update => update.transactions.some(tr => tr.effects.some(effect => effect.is(presentationEffect))),
  initialSpacer: view => new Numbers([{ cell: { text: '', line: view.state.doc.lines, baseLine: view.state.doc.lines } }]),
})

function decorate(side: ComparisonSide, rows: readonly VisualRow[]): Presentation {
  const ranges: Range<Decoration>[] = []
  const lines = new Map<number, ComparisonCell>()
  let pending: VisualRow[] = []
  for (const row of rows) {
    if (row.cell.line === undefined) { pending.push(row); continue }
    const line = side.doc.line(row.cell.line)
    if (pending.length) {
      ranges.push(Decoration.widget({ widget: new VisualRows(pending), block: true, side: -1 }).range(line.from))
      pending = []
    }
    lines.set(line.from, row.cell)
    ranges.push(Decoration.line({ attributes: {
      class: row.cell.inserted ? 'cm-changedLine' : '',
      style: `min-height: ${row.height}px`,
      'data-comparison-row': String(row.index),
    } }).range(line.from))
  }
  if (pending.length) ranges.push(Decoration.widget({ widget: new VisualRows(pending), block: true, side: 1 }).range(side.doc.length))
  for (const chunk of side.chunks) {
    for (const change of chunk.changes) {
      const from = chunk.fromB + change.fromB, to = chunk.fromB + change.toB
      if (from < to) ranges.push(Decoration.mark({ class: 'cm-insertedText' }).range(from, to))
    }
  }
  return { decorations: Decoration.set(ranges, true), lines }
}

const theme = EditorView.theme({
  '&': { height: '100%', color: 'var(--dsw-alias-label-primary)', backgroundColor: 'var(--dsw-alias-bg-layer-1)' },
  '.cm-scroller': { overflow: 'auto' },
  '.cm-content': { caretColor: 'var(--dsw-alias-brand-primary)', fontFamily: 'monospace' },
  '.cm-line': { padding: '0 2px' },
  '.cm-cursor': { borderLeftColor: 'var(--dsw-alias-brand-primary)' },
  '.cm-gutters': { backgroundColor: 'var(--dsw-alias-bg-layer-2)', color: 'var(--dsw-alias-label-secondary)', border: 'none' },
  '.cm-comparison-gutter .cm-gutterElement': { padding: '0', lineHeight: 'inherit' },
  '.cm-comparison-numbers': { display: 'flex', boxSizing: 'border-box', overflow: 'hidden' },
  '.cm-comparison-numbers span': { display: 'block', minWidth: '3ch', padding: '0 4px', textAlign: 'right' },
  '.cm-comparison-visual': { userSelect: 'none', pointerEvents: 'none' },
  '.cm-comparison-visual > div': { boxSizing: 'border-box', padding: '0 2px', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', overflow: 'hidden' },
  '.cm-deletedChunk': { backgroundColor: 'rgba(220, 65, 65, .16)' },
  '.cm-deletedText': { backgroundColor: 'rgba(200, 40, 40, .36)' },
  '.cm-changedLine': { backgroundColor: 'rgba(45, 170, 85, .12)' },
  '.cm-insertedText': { backgroundColor: 'rgba(20, 135, 60, .36)' },
  '&.cm-focused': { outline: 'none' },
})

/**
 * Create one retained local editor and optionally a readonly source comparison.
 * @param options Mount, exact text, permissions, presentation and callbacks.
 * @returns A handle preserving local undo/selection across presentation changes.
 * @throws When viewState was not captured by this loaded editor module.
 */
export function createFileViewerEditor(options: FileViewerEditorOptions): FileViewerEditorHandle {
  const prior = options.viewState
  if (prior !== undefined && !(prior instanceof ViewState)) throw new Error('file-viewer: invalid editor view state')
  const root = document.createElement('div')
  root.className = 'dsh-file-viewer-editors'
  root.style.cssText = 'display:flex;height:100%;min-height:0;min-width:0;overflow:hidden'
  options.parent.appendChild(root)
  function pane(kind: string) {
    const element = document.createElement('section')
    element.className = `dsh-file-viewer-${kind}-pane`
    element.style.cssText = 'flex:1;min-width:0;min-height:0;display:flex;flex-direction:column;overflow:hidden'
    const title = document.createElement('div')
    title.className = 'dsh-file-viewer-comparison-title'
    title.style.cssText = 'padding:4px 8px;font-size:12px;color:var(--dsw-alias-label-secondary);flex:none'
    const host = document.createElement('div')
    host.style.cssText = 'flex:1;min-height:0;overflow:hidden'
    element.append(title, host)
    root.appendChild(element)
    return { element, title, host }
  }
  const localPane = pane('local')
  const numbering = new Compartment()
  let numbersEnabled = options.lineNumbers ?? true
  let comparison = options.comparison
  let sourcePane: ReturnType<typeof pane> | undefined
  let sourceView: EditorView | undefined
  let model: ReturnType<typeof buildComparison> | undefined
  let onlySource = false
  let destroyed = false
  let frame: number | undefined
  const extensions = [theme, history(), EditorState.readOnly.of(options.readOnly), EditorView.lineWrapping,
    keymap.of(historyKeymap), updateListener, presentation,
    numbering.of(numbersEnabled ? lineNumbers() : [])]
  let state = prior ? prior.state.update({ effects: StateEffect.reconfigure.of(extensions) }).state
    : EditorState.create({ doc: Text.of(options.text.split('\n')), extensions })
  let scrollTo = prior?.scrollEffect
  if (state.doc.toString() !== options.text) {
    const replacement = replaceText(state, options.text)
    state = replacement.state
    scrollTo = scrollTo?.map(replacement.changes)
  }
  const view = new EditorView({ parent: localPane.host, state, scrollTo,
    dispatchTransactions: transactions => {
      view.update(transactions)
      if (transactions.some(transaction => transaction.docChanged)) refresh()
    },
  })
  const binding = { options, applying: false }
  bindings.set(view, binding)
  if (prior) { view.scrollDOM.scrollTop = prior.scrollTop; view.scrollDOM.scrollLeft = prior.scrollLeft }

  function scheduleGeometry() {
    if (destroyed || !comparison || frame !== undefined) return
    frame = requestAnimationFrame(() => { frame = undefined; renderComparison(true) })
  }

  function syncScroll(from: EditorView, to: EditorView | undefined) {
    if (!to || onlySource || Math.abs(to.scrollDOM.scrollTop - from.scrollDOM.scrollTop) < 1) return
    to.scrollDOM.scrollTop = from.scrollDOM.scrollTop
  }
  const localScroll = () => { syncScroll(view, sourceView); reportViewState(view) }
  const sourceScroll = () => { if (sourceView) syncScroll(sourceView, view) }
  view.scrollDOM.addEventListener('scroll', localScroll)

  function removeSource() {
    if (sourceView) {
      observer.unobserve(sourceView.contentDOM)
      sourceView.scrollDOM.removeEventListener('scroll', sourceScroll)
      sourceView.destroy()
      sourceView = undefined
      sourcePane!.element.remove()
      sourcePane = undefined
    }
  }

  function setTitle(target: ReturnType<typeof pane>, title?: string) {
    target.title.hidden = title === undefined
    target.title.textContent = title ?? ''
    if (title === undefined) { target.element.removeAttribute('role'); target.element.removeAttribute('aria-label') }
    else { target.element.setAttribute('role', 'region'); target.element.setAttribute('aria-label', title) }
  }

  const measurements = new WeakMap<EditorView, { metrics: string; lines: Map<string, number> }>()
  // A single layout measures missing texts. Unchanged rows reuse heights until width or font metrics change.
  function heights(target: EditorView, cells: readonly ComparisonCell[], measure: boolean): number[] {
    const style = getComputedStyle(target.contentDOM)
    const width = target.contentDOM.getBoundingClientRect().width
    const metrics = [width, style.font, style.lineHeight, style.letterSpacing, style.tabSize].join('|')
    let cache = measurements.get(target)
    if (!cache || cache.metrics !== metrics) {
      cache = { metrics, lines: new Map() }
      measurements.set(target, cache)
    }
    const texts = new Set(cells.map(cell => cell.text))
    if (measure && width > 0) {
      const missing = [...texts].filter(text => !cache.lines.has(text))
      if (missing.length) {
        const container = document.createElement('div')
        container.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none;white-space:pre-wrap;overflow-wrap:anywhere;box-sizing:border-box;padding:0 2px'
        container.style.font = style.font
        container.style.lineHeight = style.lineHeight
        container.style.letterSpacing = style.letterSpacing
        container.style.tabSize = style.tabSize
        container.style.width = `${width}px`
        const elements = missing.map(text => {
          const line = document.createElement('div')
          line.textContent = text || '\u200b'
          container.appendChild(line)
          return line
        })
        root.appendChild(container)
        elements.forEach((line, index) => cache.lines.set(missing[index]!, Math.max(target.defaultLineHeight, line.getBoundingClientRect().height)))
        container.remove()
      }
      for (const text of cache.lines.keys()) if (!texts.has(text)) cache.lines.delete(text)
    }
    return cells.map(cell => cache.lines.get(cell.text) ?? target.defaultLineHeight)
  }

  function renderComparison(measure: boolean) {
    if (!model || !comparison || destroyed) return
    const first = onlySource ? sourceView! : view
    const firstCells = model.rows.map(row => row.local)
    const secondCells = model.source ? model.rows.map(row => row.source!) : undefined
    const leftHeights = heights(first, firstCells, measure)
    const rightHeights = secondCells && sourceView ? heights(sourceView, secondCells, measure) : []
    const shared = leftHeights.map((height, index) => Math.max(height, rightHeights[index] ?? 0))
    const rows = (cells: readonly ComparisonCell[]) => cells.map((cell, index) => ({ cell, height: shared[index]!, index }))
    first.dispatch({ effects: presentationEffect.of(decorate(model.local, rows(firstCells))) })
    if (model.source && sourceView && secondCells) {
      sourceView.dispatch({ effects: presentationEffect.of(decorate(model.source, rows(secondCells))) })
      syncScroll(view, sourceView)
    }
    if (!measure) scheduleGeometry()
  }

  function refresh() {
    if (!comparison) {
      model = undefined
      onlySource = false
      removeSource()
      localPane.element.hidden = false
      localPane.element.style.display = 'flex'
      setTitle(localPane)
      view.dispatch({ effects: [numbering.reconfigure(numbersEnabled ? lineNumbers() : []), presentationEffect.of(emptyPresentation)] })
      return
    }
    const localText = view.state.doc.toString()
    const hasSource = comparison.sourceText !== undefined && comparison.sourceText !== comparison.baseText && comparison.sourceText !== localText
    onlySource = hasSource && localText === comparison.baseText
    localPane.element.hidden = onlySource
    localPane.element.style.display = onlySource ? 'none' : 'flex'
    setTitle(localPane, localText === comparison.baseText ? comparison.labels.noDifferences : comparison.labels.local)
    view.dispatch({ effects: numbering.reconfigure(numbersEnabled ? comparisonGutter : []) })
    if (hasSource) {
      if (!sourceView) {
        sourcePane = pane('source')
        sourceView = new EditorView({ parent: sourcePane.host, state: EditorState.create({
          doc: Text.of(comparison.sourceText!.split('\n')),
          extensions: [theme, EditorView.lineWrapping, EditorState.readOnly.of(true), presentation,
            numbering.of(numbersEnabled ? comparisonGutter : [])],
        }) })
        sourceView.scrollDOM.addEventListener('scroll', sourceScroll)
        observer.observe(sourceView.contentDOM)
      } else if (sourceView.state.doc.toString() !== comparison.sourceText) {
        sourceView.dispatch(replaceText(sourceView.state, comparison.sourceText!))
      }
      setTitle(sourcePane!, comparison.labels.source)
    } else removeSource()
    model = onlySource ? buildComparison(comparison.baseText, comparison.sourceText!)
      : buildComparison(comparison.baseText, localText, sourceView ? comparison.sourceText : undefined)
    renderComparison(false)
  }
  const widths = new WeakMap<Element, number>()
  const observer = new ResizeObserver(entries => {
    if (entries.some(entry => {
      const previous = widths.get(entry.target)
      widths.set(entry.target, entry.contentRect.width)
      return previous !== entry.contentRect.width
    })) scheduleGeometry()
  })
  observer.observe(root)
  observer.observe(view.contentDOM)
  refresh()
  return {
    setText: text => {
      if (text === view.state.doc.toString()) return
      binding.applying = true
      try { view.dispatch(replaceText(view.state, text)) } finally { binding.applying = false }
    },
    setLineNumbers: enabled => {
      numbersEnabled = enabled
      view.dispatch({ effects: numbering.reconfigure(enabled ? comparison ? comparisonGutter : lineNumbers() : []) })
      sourceView?.dispatch({ effects: numbering.reconfigure(enabled ? comparisonGutter : []) })
      scheduleGeometry()
    },
    setComparison: value => { comparison = value; refresh() },
    captureViewState: () => captureViewState(view),
    destroy: () => {
      if (destroyed) return
      destroyed = true
      try { reportViewState(view) } finally {
        if (frame !== undefined) cancelAnimationFrame(frame)
        observer.disconnect()
        removeSource()
        view.scrollDOM.removeEventListener('scroll', localScroll)
        bindings.delete(view)
        view.destroy()
        root.remove()
      }
    },
  }
}

/** This graph row is a library; Loader activation has no side effects. */
export function apply(): void {}
