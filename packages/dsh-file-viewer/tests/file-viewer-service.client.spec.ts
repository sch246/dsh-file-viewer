import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  FileViewerOpenError,
  FileViewerService,
  FileViewerSourceId,
  hashFileViewerText,
  isFileViewerDirty,
  type FileViewerDocumentRef,
  type FileViewerInstanceSnapshot,
  type FileViewerLoadedText,
  type FileViewerLocation,
  type FileViewerSavedText,
  type FileViewerSource,
  type FileViewerWatchEvent,
} from '../src/client/service.ts'

interface Deferred<T> {
  readonly promise: Promise<T>
  resolve(value: T): void
  reject(error: unknown): void
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((accept, fail) => {
    resolve = accept
    reject = fail
  })
  return { promise, reject, resolve }
}

interface MemoryDocument {
  text: string
  title?: string
  location?: FileViewerLocation
  version?: unknown
}

interface MemorySourceOptions {
  readonly save?: boolean
  readonly conditional?: boolean
  readonly watch?: boolean
  readonly external?: boolean
  readonly watchOnSubscribe?: FileViewerWatchEvent
  readonly watchError?: Error
}

class MemorySource implements FileViewerSource {
  readonly id: ReturnType<typeof FileViewerSourceId>
  readonly supportsConditionalSave: boolean
  readonly save?: FileViewerSource['save']
  readonly watch?: FileViewerSource['watch']
  readonly openExternal?: FileViewerSource['openExternal']
  readonly loadCalls: Array<{ readonly ref: FileViewerDocumentRef; readonly signal: AbortSignal }> = []
  readonly saveCalls: Array<{
    readonly ref: FileViewerDocumentRef
    readonly text: string
    readonly version: unknown
    readonly signal: AbortSignal
  }> = []
  readonly externalCalls: Array<{ readonly ref: FileViewerDocumentRef; readonly signal: AbortSignal }> = []
  watchRegistrations = 0
  watchDisposals = 0
  returnVersionlessSave = false
  private readonly documents = new Map<string, MemoryDocument>()
  private readonly queuedLoads: Array<Promise<FileViewerLoadedText>> = []
  private readonly queuedSaveGates: Array<Promise<void>> = []
  private readonly queuedExternalGates: Array<Promise<void>> = []
  private readonly watchers = new Map<string, Set<(event: FileViewerWatchEvent) => void>>()
  private revision = 0

  constructor(id: string, options: MemorySourceOptions = {}) {
    this.id = FileViewerSourceId(id)
    this.supportsConditionalSave = options.conditional ?? true
    if (options.save !== false) this.save = this.saveDocument.bind(this)
    if (options.watch !== false) {
      this.watch = (documentRef, listener) => {
        if (options.watchError !== undefined) throw options.watchError
        this.watchRegistrations += 1
        const key = this.documentKey(documentRef)
        const listeners = this.watchers.get(key) ?? new Set()
        listeners.add(listener)
        this.watchers.set(key, listeners)
        if (options.watchOnSubscribe !== undefined) listener(options.watchOnSubscribe)
        let active = true
        return () => {
          if (!active) return
          active = false
          this.watchDisposals += 1
          listeners.delete(listener)
        }
      }
    }
    if (options.external !== false) this.openExternal = this.openDocumentExternally.bind(this)
  }

  put(resourceId: string, text: string, title?: string, location?: FileViewerLocation): unknown {
    const version = this.nextVersion()
    this.documents.set(resourceId, {
      text,
      version,
      ...(title === undefined ? {} : { title }),
      ...(location === undefined ? {} : { location }),
    })
    return version
  }

  set(resourceId: string, text: string, version: unknown, title?: string): void {
    this.documents.set(resourceId, {
      text,
      ...(version === undefined ? {} : { version }),
      ...(title === undefined ? {} : { title }),
    })
  }

  document(resourceId: string): MemoryDocument {
    const document = this.documents.get(resourceId)
    if (document === undefined) throw new Error(`missing memory document: ${resourceId}`)
    return document
  }

  queueLoad(result: Promise<FileViewerLoadedText>): void {
    this.queuedLoads.push(result)
  }

  queueSave(gate: Promise<void>): void {
    this.queuedSaveGates.push(gate)
  }

  queueExternal(gate: Promise<void>): void {
    this.queuedExternalGates.push(gate)
  }

  emit(ref: FileViewerDocumentRef, event: FileViewerWatchEvent): void {
    for (const listener of this.watchers.get(this.documentKey(ref)) ?? []) listener(event)
  }

  async load(ref: FileViewerDocumentRef, signal: AbortSignal): Promise<FileViewerLoadedText> {
    this.loadCalls.push({ ref, signal })
    signal.throwIfAborted()
    const queued = this.queuedLoads.shift()
    if (queued !== undefined) return queued
    return this.loaded(this.document(ref.resourceId))
  }

  private async saveDocument(
    ref: FileViewerDocumentRef,
    text: string,
    version: unknown,
    signal: AbortSignal,
  ): Promise<FileViewerSavedText> {
    this.saveCalls.push({ ref, text, version, signal })
    signal.throwIfAborted()
    const gate = this.queuedSaveGates.shift()
    if (gate !== undefined) await gate
    const document = this.document(ref.resourceId)
    if (this.supportsConditionalSave && version !== document.version) throw new Error('stale memory version')
    const nextVersion = this.returnVersionlessSave ? undefined : this.nextVersion()
    this.documents.set(ref.resourceId, {
      ...document,
      text,
      ...(nextVersion === undefined ? { version: undefined } : { version: nextVersion }),
    })
    return nextVersion === undefined ? {} : { version: nextVersion }
  }

  private async openDocumentExternally(ref: FileViewerDocumentRef, signal: AbortSignal): Promise<void> {
    this.externalCalls.push({ ref, signal })
    signal.throwIfAborted()
    const gate = this.queuedExternalGates.shift()
    if (gate !== undefined) await gate
  }

  private loaded(document: MemoryDocument): FileViewerLoadedText {
    return {
      text: document.text,
      ...(document.version === undefined ? {} : { version: document.version }),
      ...(document.title === undefined ? {} : { title: document.title }),
      ...(document.location === undefined ? {} : { location: document.location }),
    }
  }

  private documentKey(ref: FileViewerDocumentRef): string {
    return JSON.stringify([ref.sessionId, ref.resourceId])
  }

  private nextVersion(): object {
    this.revision += 1
    return Object.freeze({ source: this.id, revision: this.revision })
  }
}

class MemoryStorage {
  readonly values = new Map<string, string>()
  readonly setCalls: Array<{ readonly key: string; readonly value: string }> = []
  getItem(key: string): string | null { return this.values.get(key) ?? null }
  setItem(key: string, value: string): void {
    this.setCalls.push({ key, value })
    this.values.set(key, value)
  }
  removeItem(key: string): void { this.values.delete(key) }
}

type SessionId = FileViewerDocumentRef['sessionId']

function sid(value: string): SessionId {
  return value as SessionId
}

function ref(sessionId: SessionId, source: FileViewerSource, resourceId: string): FileViewerDocumentRef {
  return { sessionId, sourceId: source.id, resourceId }
}

function draftKey(documentRef: FileViewerDocumentRef): string {
  return `dsh-file-viewer:draft:${JSON.stringify([
    documentRef.sessionId,
    documentRef.sourceId,
    documentRef.resourceId,
  ])}`
}

function ready(service: FileViewerService, instanceId: string): Extract<FileViewerInstanceSnapshot, { status: 'ready' }> {
  const snapshot = service.snapshot(instanceId)
  if (snapshot.status !== 'ready') throw new Error(`expected ready snapshot, received ${snapshot.status}`)
  return snapshot
}

const identityHash = async (text: string): Promise<string> => text

async function settle(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}

afterEach(() => {
  vi.useRealTimers()
})

describe('FileViewerService', () => {
  it('changes defaults without changing existing document automation', async () => {
    const service = new FileViewerService({ hashText: identityHash })
    const source = new MemorySource('memory')
    source.put('one', 'base')
    service.registerSource(source)
    try {
      const id = await service.open(ref(sid('session'), source, 'one'))
      const before = service.snapshot(id)
      service.setGlobalAutomation('autoUpdate', true)
      service.setGlobalAutomation('autoSave', true)
      expect(service.snapshot(id)).toBe(before)
      expect(ready(service, id).automation).toEqual({ autoUpdate: false, autoSave: false })
    } finally {
      service.dispose()
    }
  })

  it('hashes the exact canonical text without newline normalization', async () => {
    await expect(hashFileViewerText('a\n')).resolves.toBe(
      '87428fc522803d31065e7bce3cf03fe475096631e5e07bbd7a0fde60c4cf25c7',
    )
    await expect(hashFileViewerText('a')).resolves.not.toBe(await hashFileViewerText('a\n'))
  })

  it('owns independent documents and reuses only an exact existing ref', async () => {
    const service = new FileViewerService({ hashText: identityHash })
    const source = new MemorySource('memory')
    source.put('one', 'one')
    source.put('two', 'two')
    service.registerSource(source)
    const first = await service.open(ref(sid('session'), source, 'one'))
    const second = await service.open(ref(sid('session'), source, 'two'))
    const otherSession = await service.open(ref(sid('other'), source, 'one'))

    service.edit(first, 'first edit')
    await settle()
    expect(ready(service, first).text).toBe('first edit')
    expect(ready(service, second).text).toBe('two')
    expect(ready(service, otherSession).text).toBe('one')
    expect(await service.open(ref(sid('session'), source, 'one'))).toBe(first)
  })

  it('contains subscriber failures and isolates notifications by instance', async () => {
    const service = new FileViewerService({ hashText: identityHash })
    const source = new MemorySource('memory')
    source.put('one', 'one')
    source.put('two', 'two')
    service.registerSource(source)
    const first = await service.open(ref(sid('session'), source, 'one'))
    const second = await service.open(ref(sid('session'), source, 'two'))
    let firstCalls = 0
    let secondCalls = 0
    service.subscribe(first, () => { throw new Error('listener failed') })
    service.subscribe(first, () => { firstCalls += 1 })
    service.subscribe(second, () => { secondCalls += 1 })

    service.edit(first, 'changed')
    await settle()
    expect(firstCalls).toBe(2)
    expect(secondCalls).toBe(0)
  })

  it('retries failed initial loads through both open and refresh', async () => {
    const service = new FileViewerService({ hashText: identityHash })
    const source = new MemorySource('memory')
    source.put('one', 'recovered')
    source.queueLoad(Promise.reject(new Error('temporarily unavailable')))
    service.registerSource(source)
    const documentRef = ref(sid('session'), source, 'one')

    await expect(service.open(documentRef)).rejects.toMatchObject({
      name: 'FileViewerOpenError',
      failure: { code: 'load-failed', message: 'temporarily unavailable' },
    })
    const failedId = 'text-editor-1'
    expect(service.snapshot(failedId)).toMatchObject({ status: 'failed', operation: 'idle' })
    expect(await service.open(documentRef)).toBe(failedId)
    expect(ready(service, failedId).text).toBe('recovered')

    const other = new MemorySource('other')
    other.put('two', 'also recovered')
    other.queueLoad(Promise.reject(new Error('first failure')))
    service.registerSource(other)
    await expect(service.open(ref(sid('session'), other, 'two'))).rejects.toBeInstanceOf(FileViewerOpenError)
    await service.refresh('text-editor-2')
    expect(ready(service, 'text-editor-2').text).toBe('also recovered')
  })

  it('retries a missing source after registration', async () => {
    const service = new FileViewerService({ hashText: identityHash })
    const source = new MemorySource('late')
    source.put('one', 'available')
    const documentRef = ref(sid('session'), source, 'one')

    await expect(service.open(documentRef)).rejects.toMatchObject({ failure: { code: 'source-unavailable' } })
    service.registerSource(source)
    expect(await service.open(documentRef)).toBe('text-editor-1')

  })

  it('observes watch snapshots without pulling clean local text or re-registering the watch', async () => {
    const source = new MemorySource('memory')
    const version = source.put('one', 'base')
    const service = new FileViewerService({ hashText: identityHash })
    service.registerSource(source)
    const documentRef = ref(sid('session'), source, 'one')
    const instanceId = await service.open(documentRef)

    const remoteVersion = { revision: 'remote' }
    source.emit(documentRef, { kind: 'snapshot', snapshot: { text: 'remote', version: remoteVersion } })
    await settle()
    expect(ready(service, instanceId)).toMatchObject({
      text: 'base',
      baseText: 'base',
      baseVersion: version,
      latestSourceText: 'remote',
      latestSourceVersion: remoteVersion,
      syncStatus: 'source-ahead',
    })
    expect(source.watchRegistrations).toBe(1)

    source.set('one', 'manual', { revision: 'manual' })
    await service.refresh(instanceId)
    expect(ready(service, instanceId).text).toBe('manual')
    expect(source.watchRegistrations).toBe(1)
  })

  it('loads after invalidation even while dirty and classifies without overwriting local text', async () => {
    const source = new MemorySource('memory')
    source.put('one', 'base')
    const service = new FileViewerService({ hashText: identityHash })
    service.registerSource(source)
    const documentRef = ref(sid('session'), source, 'one')
    const instanceId = await service.open(documentRef)
    service.edit(instanceId, 'local')
    await settle()
    source.put('one', 'remote')

    source.emit(documentRef, { kind: 'invalidate' })
    await settle()
    expect(source.loadCalls).toHaveLength(2)
    expect(ready(service, instanceId)).toMatchObject({
      text: 'local',
      latestSourceText: 'remote',
      sourceStale: false,
      syncStatus: 'diverged',
      automationPaused: true,
    })
  })

  it('handles synchronous watch content without recursive registration', async () => {
    const source = new MemorySource('memory', {
      watchOnSubscribe: { kind: 'snapshot', snapshot: { text: 'observed', version: 'watch-version' } },
    })
    source.put('one', 'base')
    const service = new FileViewerService({ hashText: identityHash })
    service.registerSource(source)
    const instanceId = await service.open(ref(sid('session'), source, 'one'))
    await settle()

    expect(source.watchRegistrations).toBe(1)
    expect(ready(service, instanceId)).toMatchObject({
      text: 'base',
      latestSourceText: 'observed',
      syncStatus: 'source-ahead',
    })
  })

  it.each([
    { autoUpdate: false, autoSave: false },
    { autoUpdate: true, autoSave: false },
    { autoUpdate: false, autoSave: true },
    { autoUpdate: true, autoSave: true },
  ])('runs the $autoUpdate/$autoSave automation mode independently', async automation => {
    vi.useFakeTimers()
    const source = new MemorySource('memory')
    source.put('update', 'update-base')
    source.put('save', 'save-base')
    const service = new FileViewerService({ automationDebounceMs: 20, hashText: identityHash })
    service.registerSource(source)
    const updateRef = ref(sid('session'), source, 'update')
    const saveRef = ref(sid('session'), source, 'save')
    const updateId = await service.open(updateRef)
    const saveId = await service.open(saveRef)
    service.setAutomation(updateId, 'autoUpdate', automation.autoUpdate)
    service.setAutomation(updateId, 'autoSave', automation.autoSave)
    service.setAutomation(saveId, 'autoUpdate', automation.autoUpdate)
    service.setAutomation(saveId, 'autoSave', automation.autoSave)

    source.emit(updateRef, { kind: 'snapshot', snapshot: { text: 'update-remote', version: 'remote-version' } })
    service.edit(saveId, 'save-local')
    await settle()
    expect(ready(service, updateId).text).toBe('update-base')
    await vi.advanceTimersByTimeAsync(20)

    expect(ready(service, updateId).text).toBe(automation.autoUpdate ? 'update-remote' : 'update-base')
    expect(source.document('save').text).toBe(automation.autoSave ? 'save-local' : 'save-base')
  })

  it('rechecks disabled preferences when pending automation timers reach their callback', async () => {
    vi.useFakeTimers()
    const source = new MemorySource('memory')
    source.put('update', 'base')
    source.put('save', 'base')
    const service = new FileViewerService({ automationDebounceMs: 10, hashText: identityHash })
    service.registerSource(source)
    const updateRef = ref(sid('session'), source, 'update')
    const updateId = await service.open(updateRef)
    const saveId = await service.open(ref(sid('session'), source, 'save'))
    service.setAutomation(updateId, 'autoUpdate', true)
    service.setAutomation(saveId, 'autoSave', true)
    source.emit(updateRef, { kind: 'snapshot', snapshot: { text: 'remote', version: 'remote' } })
    service.edit(saveId, 'local')
    await settle()
    service.setAutomation(updateId, 'autoUpdate', false)
    service.setAutomation(saveId, 'autoSave', false)

    await vi.runAllTimersAsync()
    expect(ready(service, updateId).text).toBe('base')
    expect(source.document('save').text).toBe('base')
  })

  it('ignores obsolete resource preferences while capabilities gate initialized automation', async () => {
    vi.useFakeTimers()
    const storage = new MemoryStorage()
    storage.values.set('dsh-file-viewer:automation:["limited","one"]', JSON.stringify({
      autoUpdate: false,
      autoSave: false,
    }))
    const limited = new MemorySource('limited', { conditional: false, watch: false })
    limited.put('one', 'one')
    limited.put('two', 'two')
    const service = new FileViewerService({
      storage, hashText: identityHash,
      globalAutomationDefaults: { autoUpdate: true, autoSave: true },
    })
    service.registerSource(limited)
    const one = await service.open(ref(sid('session'), limited, 'one'))
    const two = await service.open(ref(sid('session'), limited, 'two'))

    expect(ready(service, one).automation).toEqual({ autoUpdate: true, autoSave: true })
    expect(ready(service, two).automation).toEqual({ autoUpdate: true, autoSave: true })
    service.setGlobalAutomation('autoUpdate', false)
    expect(ready(service, one).automation.autoUpdate).toBe(true)
    expect(ready(service, one).watchSupported).toBe(false)

    service.edit(one, 'local')
    await vi.runAllTimersAsync()
    expect(limited.saveCalls).toHaveLength(0)
    expect(ready(service, one).text).toBe('local')
    expect(storage.setCalls.some(call => call.key.startsWith('dsh-file-viewer:automation:'))).toBe(false)
    service.dispose()
  })

  it('initializes from source defaults once and uses current defaults after committed close', async () => {
    const source: FileViewerSource = {
      id: FileViewerSourceId('inherited'),
      defaults: { autoUpdate: true, autoSave: false },
      load: async () => ({ text: 'base' }),
    }
    const service = new FileViewerService({
      globalAutomationDefaults: { autoUpdate: false, autoSave: true },
      hashText: identityHash,
    })
    service.registerSource(source)
    const id = await service.open({ sessionId: sid('session'), sourceId: source.id, resourceId: 'one' })

    expect(ready(service, id).automation).toEqual({ autoUpdate: true, autoSave: false })
    service.setAutomation(id, 'autoUpdate', false)
    service.setAutomation(id, 'autoSave', true)
    expect(ready(service, id).automation).toEqual({ autoUpdate: false, autoSave: true })
    service.setGlobalAutomation('autoUpdate', true)
    expect(ready(service, id).automation.autoUpdate).toBe(false)
    await service.refresh(id)
    expect(ready(service, id).automation).toEqual({ autoUpdate: false, autoSave: true })
    service.discard(id)
    const reopened = await service.open({ sessionId: sid('session'), sourceId: source.id, resourceId: 'one' })
    expect(ready(service, reopened).automation).toEqual({ autoUpdate: true, autoSave: false })
    service.dispose()
  })

  it('retains choices through observations, failed refresh, source reconnect and Session reuse', async () => {
    vi.useFakeTimers()
    const service = new FileViewerService({ hashText: identityHash })
    const source = new MemorySource('memory')
    source.put('one', 'base')
    const unregister = service.registerSource(source)
    const documentRef = ref(sid('session'), source, 'one')
    const id = await service.open(documentRef)
    service.setGlobalAutomation('autoUpdate', true)
    service.setGlobalAutomation('autoSave', true)
    source.emit(documentRef, { kind: 'snapshot', snapshot: { text: 'remote' } })
    await vi.runAllTimersAsync()
    expect(ready(service, id).text).toBe('base')
    source.put('one', 'remote')
    source.emit(documentRef, { kind: 'invalidate' })
    await vi.runAllTimersAsync()
    expect(ready(service, id).text).toBe('base')
    await service.refresh(id)
    expect(ready(service, id).text).toBe('remote')
    service.edit(id, 'local')
    await vi.runAllTimersAsync()
    expect(source.saveCalls).toHaveLength(0)
    source.queueLoad(Promise.reject(new Error('offline')))
    await service.refresh(id)
    expect(ready(service, id).failure?.code).toBe('load-failed')
    unregister()
    const replacement: FileViewerSource = {
      id: source.id, defaults: { autoUpdate: true, autoSave: true },
      load: async () => ({ text: 'remote' }),
    }
    service.registerSource(replacement)
    await service.refresh(id)
    const anotherSession = await service.open(ref(sid('other'), source, 'one'))
    expect(ready(service, anotherSession).automation).toEqual({ autoUpdate: true, autoSave: true })
    expect(await service.open(documentRef)).toBe(id)
    expect(ready(service, id)).toMatchObject({ text: 'local', automation: { autoUpdate: false, autoSave: false } })
    service.dispose()
  })

  it('captures defaults before an initial load completes or retries', async () => {
    const source = new MemorySource('memory')
    const gate = deferred<FileViewerLoadedText>()
    source.queueLoad(gate.promise)
    source.put('one', 'base')
    const service = new FileViewerService({ hashText: identityHash })
    service.registerSource(source)
    const documentRef = ref(sid('session'), source, 'one')
    const opening = service.open(documentRef)
    service.setGlobalAutomation('autoSave', true)
    gate.reject(new Error('offline'))
    await expect(opening).rejects.toBeInstanceOf(FileViewerOpenError)
    const id = await service.open(documentRef)
    expect(ready(service, id).automation.autoSave).toBe(false)
    service.discard(id)
    const reopened = await service.open(documentRef)
    expect(ready(service, reopened).automation.autoSave).toBe(true)
    service.dispose()
  })

  it('notifies defaults independently and releases subscriptions', async () => {
    const storage = new MemoryStorage()
    const service = new FileViewerService({ storage, hashText: identityHash })
    const observed = vi.fn()
    service.subscribeAutomationDefaults(() => { throw new Error('subscriber failed') })
    const unsubscribe = service.subscribeAutomationDefaults(observed)
    const initial = service.automationDefaults()
    service.setGlobalAutomation('autoSave', false)
    expect(service.automationDefaults()).toBe(initial)
    expect(observed).not.toHaveBeenCalled()
    service.setGlobalAutomation('autoSave', true)
    expect(observed).toHaveBeenCalledTimes(1)
    unsubscribe()
    service.setGlobalAutomation('autoUpdate', true)
    expect(observed).toHaveBeenCalledTimes(1)
    const restored = new FileViewerService({ storage })
    expect(restored.automationDefaults()).toEqual({ autoUpdate: true, autoSave: true })
    restored.dispose()
    service.dispose()
    expect(() => service.setGlobalAutomation('autoUpdate', false)).toThrow('service is disposed')
  })

  it('restores draft automation independently of newer defaults and resets after discard', async () => {
    vi.useFakeTimers()
    const storage = new MemoryStorage()
    const source = new MemorySource('memory')
    source.put('one', 'base')
    const documentRef = ref(sid('session'), source, 'one')
    const first = new FileViewerService({ storage, hashText: identityHash })
    first.registerSource(source)
    const id = await first.open(documentRef)
    first.setAutomation(id, 'autoUpdate', true)
    first.edit(id, 'local')
    first.setGlobalAutomation('autoSave', true)
    first.dispose()
    const second = new FileViewerService({ storage, hashText: identityHash })
    second.registerSource(source)
    const restored = await second.open(documentRef)
    await vi.runAllTimersAsync()
    expect(ready(second, restored)).toMatchObject({ text: 'local', automation: { autoUpdate: true, autoSave: false } })
    expect(source.saveCalls).toHaveLength(0)
    second.discard(restored)
    const reopened = await second.open(documentRef)
    expect(ready(second, reopened)).toMatchObject({ text: 'base', automation: { autoUpdate: false, autoSave: true } })
    second.dispose()
  })

  it.each([undefined, { autoUpdate: 'invalid', autoSave: true }])(
    'retains draft text without valid recorded automation: %j',
    async automation => {
      const storage = new MemoryStorage()
      const source = new MemorySource('memory')
      source.put('one', 'base')
      const documentRef = ref(sid('session'), source, 'one')
      storage.values.set(draftKey(documentRef), JSON.stringify({
        format: 1, baseText: 'base', localText: 'local', automation,
      }))
      const service = new FileViewerService({
        storage, hashText: identityHash, globalAutomationDefaults: { autoUpdate: true },
      })
      service.registerSource(source)
      try {
        const id = await service.open(documentRef)
        expect(ready(service, id)).toMatchObject({
          text: 'local', baseText: 'base', automation: { autoUpdate: true, autoSave: false },
        })
      } finally {
        service.dispose()
      }
    },
  )

  it('keeps pending document automation on its original deadline when defaults change', async () => {
    vi.useFakeTimers()
    const source = new MemorySource('memory')
    source.put('one', 'base')
    const service = new FileViewerService({
      hashText: identityHash, automationDebounceMs: 20,
      globalAutomationDefaults: { autoSave: true },
    })
    service.registerSource(source)
    try {
      const id = await service.open(ref(sid('session'), source, 'one'))
      service.edit(id, 'local')
      await vi.advanceTimersByTimeAsync(10)
      service.setGlobalAutomation('autoSave', false)
      await vi.advanceTimersByTimeAsync(10)
      expect(source.document('one').text).toBe('local')
      expect(ready(service, id).automation.autoSave).toBe(true)
    } finally {
      service.dispose()
    }
  })

  it('debounces full-ref drafts and restores local-ahead content against a fresh source read', async () => {
    vi.useFakeTimers()
    const storage = new MemoryStorage()
    const source = new MemorySource('memory')
    const sourceVersion = source.put('one', 'base')
    const documentRef = ref(sid('session'), source, 'one')
    const firstService = new FileViewerService({
      storage,
      persistenceDebounceMs: 20,
      hashText: identityHash,
    })
    firstService.registerSource(source)
    const first = await firstService.open(documentRef)
    firstService.edit(first, 'first')
    firstService.edit(first, 'local')
    await settle()

    expect(storage.values.has(draftKey(documentRef))).toBe(false)
    await vi.advanceTimersByTimeAsync(19)
    expect(storage.values.has(draftKey(documentRef))).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    expect(JSON.parse(storage.values.get(draftKey(documentRef))!)).toEqual({
      format: 1,
      baseText: 'base',
      localText: 'local',
      automation: { autoUpdate: false, autoSave: false },
    })
    expect(storage.setCalls.filter(call => call.key === draftKey(documentRef))).toHaveLength(1)
    firstService.dispose()

    const secondService = new FileViewerService({ storage, hashText: identityHash })
    secondService.registerSource(source)
    const restored = await secondService.open(documentRef)
    expect(source.loadCalls).toHaveLength(2)
    expect(ready(secondService, restored)).toMatchObject({
      text: 'local',
      localHash: 'local',
      baseText: 'base',
      baseHash: 'base',
      baseVersion: sourceVersion,
      latestSourceText: 'base',
      latestSourceHash: 'base',
      latestSourceVersion: sourceVersion,
      syncStatus: 'local-ahead',
      automationPaused: false,
    })

    const otherSession = await secondService.open(ref(sid('other-session'), source, 'one'))
    expect(ready(secondService, otherSession)).toMatchObject({ text: 'base', syncStatus: 'synced' })
  })

  it('restores the saved base and classifies divergence after the source moves', async () => {
    const storage = new MemoryStorage()
    const source = new MemorySource('memory')
    source.put('one', 'base')
    const documentRef = ref(sid('session'), source, 'one')
    const firstService = new FileViewerService({ storage, hashText: identityHash })
    firstService.registerSource(source)
    const first = await firstService.open(documentRef)
    firstService.edit(first, 'local')
    await settle()
    firstService.dispose()
    const remoteVersion = source.put('one', 'remote')

    const secondService = new FileViewerService({ storage, hashText: identityHash })
    secondService.registerSource(source)
    const restored = await secondService.open(documentRef)
    expect(ready(secondService, restored)).toMatchObject({
      text: 'local',
      localHash: 'local',
      baseText: 'base',
      baseHash: 'base',
      latestSourceText: 'remote',
      latestSourceHash: 'remote',
      latestSourceVersion: remoteVersion,
      syncStatus: 'diverged',
      automationPaused: true,
    })
    expect(ready(secondService, restored)).not.toHaveProperty('baseVersion')
  })

  it('rebases a restored local draft when the fresh source has the same exact text', async () => {
    const storage = new MemoryStorage()
    const source = new MemorySource('memory')
    source.put('one', 'base')
    const documentRef = ref(sid('session'), source, 'one')
    const firstService = new FileViewerService({ storage, hashText: identityHash })
    firstService.registerSource(source)
    const first = await firstService.open(documentRef)
    firstService.edit(first, 'shared')
    await settle()
    firstService.dispose()
    const sharedVersion = source.put('one', 'shared')

    const secondService = new FileViewerService({ storage, hashText: identityHash })
    secondService.registerSource(source)
    const restored = await secondService.open(documentRef)
    expect(ready(secondService, restored)).toMatchObject({
      text: 'shared',
      baseText: 'shared',
      baseHash: 'shared',
      baseVersion: sharedVersion,
      latestSourceVersion: sharedVersion,
      syncStatus: 'synced',
    })
    expect(isFileViewerDirty(ready(secondService, restored))).toBe(false)
  })

  it('flushes the latest edit-back text during disposal', async () => {
    const storage = new MemoryStorage()
    const source = new MemorySource('memory')
    source.put('one', 'base')
    const documentRef = ref(sid('session'), source, 'one')
    const firstService = new FileViewerService({ storage, hashText: identityHash })
    firstService.registerSource(source)
    const first = await firstService.open(documentRef)
    firstService.edit(first, 'temporary')
    firstService.edit(first, 'base')
    firstService.dispose()
    await settle()
    expect(JSON.parse(storage.values.get(draftKey(documentRef))!)).toMatchObject({
      baseText: 'base',
      localText: 'base',
    })
    source.put('one', 'remote')

    const secondService = new FileViewerService({ storage, hashText: identityHash })
    secondService.registerSource(source)
    const restored = await secondService.open(documentRef)
    expect(ready(secondService, restored)).toMatchObject({
      text: 'base',
      localHash: 'base',
      baseText: 'base',
      baseHash: 'base',
      latestSourceText: 'remote',
      latestSourceHash: 'remote',
      syncStatus: 'source-ahead',
      automationPaused: false,
    })
    expect(ready(secondService, restored)).not.toHaveProperty('baseVersion')
  })

  it('flushes a rejected close and discards persistence after a confirmed dirty close', async () => {
    const storage = new MemoryStorage()
    const source = new MemorySource('memory')
    source.put('one', 'base')
    const documentRef = ref(sid('session'), source, 'one')
    let confirmed = false
    const service = new FileViewerService({
      storage,
      confirmDiscard: () => confirmed,
      hashText: identityHash,
    })
    service.registerSource(source)
    const instanceId = await service.open(documentRef)
    service.edit(instanceId, 'local')
    await settle()

    await expect(service.canClose(instanceId)).resolves.toBe(false)
    expect(storage.values.has(draftKey(documentRef))).toBe(true)
    confirmed = true
    await expect(service.canClose(instanceId)).resolves.toBe(true)
    expect(service.snapshot(instanceId)).toMatchObject({ text: 'local' })
    expect(storage.values.has(draftKey(documentRef))).toBe(true)
    service.discard(instanceId)
    expect(storage.values.has(draftKey(documentRef))).toBe(false)

    const reopened = await service.open(documentRef)
    expect(ready(service, reopened)).toMatchObject({ text: 'base', syncStatus: 'synced' })
  })

  it('keeps in-memory edits when stored data is malformed or browser storage fails', async () => {
    let reads = 0
    const storage = {
      getItem: (): string | null => {
        reads += 1
        if (reads === 1) return '{malformed'
        throw new Error('storage read refused')
      },
      setItem: (): void => { throw new Error('quota exceeded') },
      removeItem: (): void => { throw new Error('storage removal refused') },
    }
    const source = new MemorySource('memory')
    source.put('one', 'one')
    source.put('two', 'two')
    const service = new FileViewerService({ storage, hashText: identityHash })
    service.registerSource(source)
    const one = await service.open(ref(sid('session'), source, 'one'))
    const two = await service.open(ref(sid('session'), source, 'two'))
    service.edit(one, 'local one')
    service.edit(two, 'local two')
    await settle()

    expect(ready(service, one)).toMatchObject({ text: 'local one', syncStatus: 'local-ahead' })
    expect(ready(service, two)).toMatchObject({ text: 'local two', syncStatus: 'local-ahead' })
    expect(() => service.dispose()).not.toThrow()
  })

  it('never serializes opaque revisions and uses only the revision from the reopening load', async () => {
    const storage = new MemoryStorage()
    const source = new MemorySource('memory')
    const opaqueVersion: { self?: unknown } = {}
    opaqueVersion.self = opaqueVersion
    source.set('one', 'base', opaqueVersion)
    const documentRef = ref(sid('session'), source, 'one')
    const firstService = new FileViewerService({ storage, hashText: identityHash })
    firstService.registerSource(source)
    const first = await firstService.open(documentRef)
    firstService.edit(first, 'local')
    await settle()
    expect(() => firstService.dispose()).not.toThrow()
    expect(JSON.parse(storage.values.get(draftKey(documentRef))!)).toEqual({
      format: 1,
      baseText: 'base',
      localText: 'local',
      automation: { autoUpdate: false, autoSave: false },
    })

    const secondService = new FileViewerService({ storage, hashText: identityHash })
    secondService.registerSource(source)
    const restored = await secondService.open(documentRef)
    await secondService.save(restored)
    expect(source.saveCalls.at(-1)).toMatchObject({ text: 'local', version: opaqueVersion })
    expect(source.document('one').text).toBe('local')
  })

  it('blocks safe saves after observed source movement and resolves by explicit overwrite', async () => {
    const source = new MemorySource('memory')
    source.put('one', 'base')
    const service = new FileViewerService({ hashText: identityHash })
    service.registerSource(source)
    const documentRef = ref(sid('session'), source, 'one')
    const instanceId = await service.open(documentRef)
    service.edit(instanceId, 'local')
    await settle()
    const remoteVersion = source.put('one', 'remote')
    source.emit(documentRef, {
      kind: 'snapshot',
      snapshot: { text: 'remote', version: remoteVersion },
    })
    await settle()

    await service.save(instanceId)
    expect(source.saveCalls).toHaveLength(0)
    expect(ready(service, instanceId)).toMatchObject({
      text: 'local',
      syncStatus: 'diverged',
      failure: { code: 'save-conflict' },
      automationPaused: true,
    })
    await service.overwriteSource(instanceId)
    expect(source.saveCalls[0]).toMatchObject({ text: 'local', version: remoteVersion })
    expect(ready(service, instanceId)).toMatchObject({ syncStatus: 'synced', automationPaused: false })
    expect(ready(service, instanceId).failure).toBeUndefined()
  })

  it('requires the explicit overwrite path when conditional save is unavailable', async () => {
    const source = new MemorySource('memory', { conditional: false })
    const loadedVersion = source.put('one', 'base')
    const service = new FileViewerService({ hashText: identityHash })
    service.registerSource(source)
    const instanceId = await service.open(ref(sid('session'), source, 'one'))
    service.edit(instanceId, 'local')
    await settle()

    await service.save(instanceId)
    expect(source.saveCalls).toHaveLength(0)
    expect(ready(service, instanceId).failure).toMatchObject({ code: 'save-conflict' })
    await service.overwriteSource(instanceId)
    expect(source.saveCalls[0]).toMatchObject({ text: 'local', version: loadedVersion })
    expect(source.document('one').text).toBe('local')
  })

  it('discards either source-ahead or diverged local text and resumes automation', async () => {
    const source = new MemorySource('memory')
    source.put('one', 'base')
    const service = new FileViewerService({ hashText: identityHash })
    service.registerSource(source)
    const documentRef = ref(sid('session'), source, 'one')
    const instanceId = await service.open(documentRef)
    service.edit(instanceId, 'local')
    await settle()
    source.emit(documentRef, { kind: 'snapshot', snapshot: { text: 'remote', version: 'remote' } })
    await settle()
    expect(ready(service, instanceId).syncStatus).toBe('diverged')

    service.discardLocal(instanceId)
    expect(ready(service, instanceId)).toMatchObject({
      text: 'remote',
      baseText: 'remote',
      syncStatus: 'synced',
      automationPaused: false,
    })
  })

  it('keeps save errors orthogonal to sync and unpauses after a successful retry', async () => {
    const source = new MemorySource('memory')
    source.put('one', 'base')
    source.queueSave(Promise.reject(new Error('write refused')))
    const service = new FileViewerService({ hashText: identityHash })
    service.registerSource(source)
    const instanceId = await service.open(ref(sid('session'), source, 'one'))
    service.edit(instanceId, 'local')
    await settle()

    await service.save(instanceId)
    expect(ready(service, instanceId)).toMatchObject({
      syncStatus: 'local-ahead',
      automationPaused: true,
      failure: { code: 'save-failed', message: 'write refused' },
    })
    await service.save(instanceId)
    expect(ready(service, instanceId)).toMatchObject({ syncStatus: 'synced', automationPaused: false })
    expect(ready(service, instanceId).failure).toBeUndefined()
  })

  it('advances and clears opaque versions when observed canonical text has the same hash', async () => {
    const source = new MemorySource('memory')
    const firstVersion = source.put('one', 'base')
    const service = new FileViewerService({ hashText: identityHash })
    service.registerSource(source)
    const documentRef = ref(sid('session'), source, 'one')
    const instanceId = await service.open(documentRef)
    service.edit(instanceId, 'local')
    await settle()
    const secondVersion = { revision: 2 }
    source.emit(documentRef, { kind: 'snapshot', snapshot: { text: 'base', version: secondVersion } })
    await settle()
    expect(firstVersion).not.toBe(secondVersion)
    expect(ready(service, instanceId)).toMatchObject({
      syncStatus: 'local-ahead',
      baseVersion: secondVersion,
      latestSourceVersion: secondVersion,
    })

    source.emit(documentRef, { kind: 'snapshot', snapshot: { text: 'base' } })
    await settle()
    expect(ready(service, instanceId)).not.toHaveProperty('baseVersion')
    expect(ready(service, instanceId)).not.toHaveProperty('latestSourceVersion')
  })

  it('accepts only the latest edit hash and reports a current hashing failure', async () => {
    const firstHash = deferred<string>()
    const secondHash = deferred<string>()
    let failure: Error | undefined
    const hashText = (text: string): Promise<string> => {
      if (text === 'first') return firstHash.promise
      if (text === 'second') return secondHash.promise
      if (text === 'failure') return Promise.reject(failure)
      return Promise.resolve(text)
    }
    const source = new MemorySource('memory')
    source.put('one', 'base')
    const service = new FileViewerService({ hashText })
    service.registerSource(source)
    const instanceId = await service.open(ref(sid('session'), source, 'one'))

    service.edit(instanceId, 'first')
    service.edit(instanceId, 'second')
    secondHash.resolve('second-hash')
    await settle()
    firstHash.resolve('first-hash')
    await settle()
    expect(ready(service, instanceId)).toMatchObject({ text: 'second', localHash: 'second-hash' })

    failure = new Error('digest unavailable')
    service.edit(instanceId, 'failure')
    await settle()
    expect(ready(service, instanceId)).toMatchObject({
      text: 'failure',
      syncStatus: 'unknown',
      automationPaused: true,
      failure: { code: 'hash-failed', message: 'digest unavailable' },
    })
  })

  it('does not let a late read reset a newer successful save', async () => {
    const source = new MemorySource('memory')
    const oldVersion = source.put('one', 'base')
    const staleRead = deferred<FileViewerLoadedText>()
    const service = new FileViewerService({ hashText: identityHash })
    service.registerSource(source)
    const instanceId = await service.open(ref(sid('session'), source, 'one'))
    source.queueLoad(staleRead.promise)
    const refresh = service.refresh(instanceId)
    service.edit(instanceId, 'saved')
    await settle()
    await service.save(instanceId)
    const savedVersion = source.document('one').version
    staleRead.resolve({ text: 'base', version: oldVersion })
    await refresh

    expect(ready(service, instanceId)).toMatchObject({
      text: 'saved',
      baseText: 'saved',
      latestSourceText: 'saved',
      baseVersion: savedVersion,
      latestSourceVersion: savedVersion,
      syncStatus: 'synced',
    })
  })

  it('keeps saving visible across a concurrent observation and prevents overlapping writes', async () => {
    const source = new MemorySource('memory')
    source.put('one', 'base')
    const saveGate = deferred<void>()
    source.queueSave(saveGate.promise)
    const service = new FileViewerService({ hashText: identityHash })
    service.registerSource(source)
    const documentRef = ref(sid('session'), source, 'one')
    const instanceId = await service.open(documentRef)
    service.edit(instanceId, 'submitted')
    await settle()

    const first = service.save(instanceId)
    const second = service.save(instanceId)
    expect(source.saveCalls).toHaveLength(1)
    source.emit(documentRef, { kind: 'snapshot', snapshot: { text: 'base', version: source.document('one').version } })
    await settle()
    expect(ready(service, instanceId).operation).toBe('saving')
    saveGate.resolve(undefined)
    await Promise.all([first, second])
    expect(ready(service, instanceId).operation).toBe('idle')
    expect(source.saveCalls).toHaveLength(1)
  })

  it('retains typing and edit-back performed while the submitted text saves', async () => {
    const source = new MemorySource('memory')
    source.put('one', 'base')
    const saveGate = deferred<void>()
    source.queueSave(saveGate.promise)
    const service = new FileViewerService({ hashText: identityHash })
    service.registerSource(source)
    const instanceId = await service.open(ref(sid('session'), source, 'one'))
    service.edit(instanceId, 'submitted')
    await settle()
    const save = service.save(instanceId)
    service.edit(instanceId, 'newer')
    service.edit(instanceId, 'base')
    await settle()
    saveGate.resolve(undefined)
    await save

    expect(source.document('one').text).toBe('submitted')
    expect(ready(service, instanceId)).toMatchObject({
      text: 'base',
      baseText: 'submitted',
      latestSourceText: 'submitted',
      syncStatus: 'local-ahead',
    })
    expect(isFileViewerDirty(ready(service, instanceId))).toBe(true)
  })

  it('saves the submitted text while its hash waits and retains newer local typing', async () => {
    const submittedHash = deferred<string>()
    const source = new MemorySource('memory')
    source.put('one', 'base')
    const service = new FileViewerService({
      hashText: text => text === 'submitted' ? submittedHash.promise : Promise.resolve(text),
    })
    service.registerSource(source)
    const instanceId = await service.open(ref(sid('session'), source, 'one'))
    service.edit(instanceId, 'submitted')
    const save = service.save(instanceId)
    service.edit(instanceId, 'newer')
    await settle()
    submittedHash.resolve('submitted')
    await save

    expect(source.document('one').text).toBe('submitted')
    expect(ready(service, instanceId)).toMatchObject({
      text: 'newer',
      baseText: 'submitted',
      latestSourceText: 'submitted',
      syncStatus: 'local-ahead',
    })
  })

  it('retains ready content when its source unloads and can refresh after replacement registration', async () => {
    const source = new MemorySource('memory')
    source.put('one', 'base')
    const service = new FileViewerService({ hashText: identityHash })
    const unregister = service.registerSource(source)
    const documentRef = ref(sid('session'), source, 'one')
    const instanceId = await service.open(documentRef)
    service.edit(instanceId, 'local')
    await settle()

    unregister()
    expect(source.watchDisposals).toBe(1)
    expect(ready(service, instanceId)).toMatchObject({
      text: 'local',
      baseText: 'base',
      sourceStale: true,
      syncStatus: 'unknown',
      failure: { code: 'source-unavailable' },
    })

    const replacement = new MemorySource('memory')
    replacement.put('one', 'replacement')
    service.registerSource(replacement)
    await service.refresh(instanceId)
    expect(ready(service, instanceId)).toMatchObject({
      text: 'local',
      latestSourceText: 'replacement',
      syncStatus: 'diverged',
    })
  })

  it('rejects late source work after unload and reports failed loading instances', async () => {
    const source = new MemorySource('memory')
    const loadGate = deferred<FileViewerLoadedText>()
    source.queueLoad(loadGate.promise)
    const service = new FileViewerService({ hashText: identityHash })
    const unregister = service.registerSource(source)
    const opening = service.open(ref(sid('session'), source, 'late'))
    const signal = source.loadCalls[0]!.signal
    unregister()
    expect(signal.aborted).toBe(true)
    expect(service.snapshot('text-editor-1')).toMatchObject({
      status: 'failed',
      failure: { code: 'source-unavailable' },
    })
    loadGate.resolve({ text: 'too late' })
    await expect(opening).rejects.toMatchObject({ failure: { code: 'source-unavailable' } })
    expect(service.snapshot('text-editor-1')).toMatchObject({ status: 'failed' })
  })

  it('does not close newer dirty text accepted by an older asynchronous confirmation', async () => {
    const confirmation = deferred<boolean>()
    const source = new MemorySource('memory')
    source.put('one', 'base')
    const service = new FileViewerService({ confirmDiscard: () => confirmation.promise, hashText: identityHash })
    service.registerSource(source)
    const instanceId = await service.open(ref(sid('session'), source, 'one'))
    service.edit(instanceId, 'first')
    await settle()

    const closing = service.canClose(instanceId)
    service.edit(instanceId, 'newer')
    service.edit(instanceId, 'first')
    await settle()
    confirmation.resolve(true)
    await expect(closing).resolves.toBe(false)
    expect(ready(service, instanceId).text).toBe('first')
  })

  it('reports watch setup and hashing failures without unhandled callback rejections', async () => {
    const watchFailure = new MemorySource('watch-failure', { watchError: new Error('watch refused') })
    watchFailure.put('one', 'base')
    const watchService = new FileViewerService({ hashText: identityHash })
    watchService.registerSource(watchFailure)
    const watchId = await watchService.open(ref(sid('session'), watchFailure, 'one'))
    expect(ready(watchService, watchId)).toMatchObject({
      watchSupported: false,
      automationPaused: true,
      failure: { code: 'watch-failed', message: 'watch refused' },
    })

    const source = new MemorySource('hash-failure')
    source.put('one', 'base')
    const service = new FileViewerService({
      hashText: text => text === 'bad watch text' ? Promise.reject(new Error('digest refused')) : Promise.resolve(text),
    })
    service.registerSource(source)
    const documentRef = ref(sid('session'), source, 'one')
    const instanceId = await service.open(documentRef)
    source.emit(documentRef, { kind: 'snapshot', snapshot: { text: 'bad watch text' } })
    await settle()
    expect(ready(service, instanceId)).toMatchObject({
      text: 'base',
      sourceStale: true,
      syncStatus: 'unknown',
      automationPaused: true,
      failure: { code: 'hash-failed', message: 'digest refused' },
    })

  })

  it('clears returned versions and preserves newer local text after a versionless save', async () => {
    const source = new MemorySource('memory')
    source.put('one', 'base')
    source.returnVersionlessSave = true
    const service = new FileViewerService({ hashText: identityHash })
    service.registerSource(source)
    const instanceId = await service.open(ref(sid('session'), source, 'one'))
    service.edit(instanceId, 'saved')
    await settle()
    await service.save(instanceId)

    expect(ready(service, instanceId)).not.toHaveProperty('baseVersion')
    expect(ready(service, instanceId)).not.toHaveProperty('latestSourceVersion')
    expect(ready(service, instanceId).syncStatus).toBe('synced')
  })

  it('keeps external failures independent of editor content', async () => {
    const source = new MemorySource('memory')
    source.put('one', 'base', 'Title', { selectorId: 'files', segments: [{ label: 'one' }] })
    const externalGate = deferred<void>()
    source.queueExternal(externalGate.promise)
    const service = new FileViewerService({ hashText: identityHash })
    service.registerSource(source)
    const instanceId = await service.open(ref(sid('session'), source, 'one'))
    service.edit(instanceId, 'local')
    const opening = service.openExternal(instanceId)
    externalGate.reject(new Error('launcher refused'))
    await opening

    expect(ready(service, instanceId)).toMatchObject({
      text: 'local',
      failure: { code: 'external-open-failed', message: 'launcher refused' },
    })
  })

  it('disposes to a silent API and detaches persistent watches', async () => {
    const source = new MemorySource('memory')
    source.put('one', 'base')
    const service = new FileViewerService({ hashText: identityHash })
    const unregister = service.registerSource(source)
    const instanceId = await service.open(ref(sid('session'), source, 'one'))
    let notifications = 0
    service.subscribe(instanceId, () => { notifications += 1 })

    service.dispose()
    service.dispose()
    unregister()
    expect(source.watchDisposals).toBe(1)
    expect(notifications).toBe(0)
    expect(() => service.snapshot(instanceId)).toThrow('service is disposed')
    expect(() => service.edit(instanceId, 'ignored')).toThrow('service is disposed')
    await expect(service.save(instanceId)).rejects.toThrow('service is disposed')
  })
})
