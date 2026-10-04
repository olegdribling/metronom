// Firestore в памяти — ровно то, чем пользуются data/docSync.ts и
// data/userLibrary.ts: collection/doc, onSnapshot (коллекция — с
// docChanges(), документ), setDoc (с merge), deleteDoc, serverTimestamp,
// runTransaction. Подставляется вместо 'firebase/firestore' через
// mock.module (node --experimental-test-module-mocks).
//
// Снимки приходят асинхронно (микрозадачей), как у настоящего SDK после
// локальной записи. offline — транзакции падают с code 'unavailable', как
// у SDK без сети; failNextListen — следующая подписка падает с ошибкой.
type Data = Record<string, unknown>
interface Ref {
  path: string
  id: string
}
interface Listener {
  path: string
  isCollection: boolean
  next: (snap: unknown) => void
  error?: (err: unknown) => void
  last: Map<string, Data> | null
  active: boolean
}

const SERVER_TS = { __serverTimestamp: true }

export function createFakeFirestore() {
  const store = new Map<string, Data>()
  const listeners = new Set<Listener>()
  const writes: { op: 'set' | 'delete'; path: string; data?: Data }[] = []
  let autoId = 0
  let notifyQueued = false
  const control = { offline: false, failNextListen: null as null | { code: string } }

  const pathOf = (parent: unknown, segments: string[]) =>
    [parent && typeof parent === 'object' && 'path' in parent ? (parent as Ref).path : '', ...segments].filter(Boolean).join('/')

  function resolveTimestamps(data: Data): Data {
    const now = Date.now()
    return Object.fromEntries(
      Object.entries(data).map(([k, v]) => [k, v === SERVER_TS ? { toMillis: () => now } : v])
    )
  }

  function childrenOf(path: string): Map<string, Data> {
    const out = new Map<string, Data>()
    for (const [p, data] of store) {
      if (p.startsWith(path + '/') && !p.slice(path.length + 1).includes('/')) out.set(p.slice(path.length + 1), data)
    }
    return out
  }

  // Как настоящий SDK: data() отдаёт свежие объекты на каждый вызов. Метки
  // времени (toMillis) — как есть.
  const clone = (v: unknown): unknown =>
    Array.isArray(v)
      ? v.map(clone)
      : v && typeof v === 'object' && !('toMillis' in v)
        ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, clone(x)]))
        : v

  const docSnap = (id: string, data: Data | undefined) => ({
    id,
    exists: () => data !== undefined,
    data: () => (data === undefined ? undefined : (clone(data) as Data)),
    metadata: { hasPendingWrites: false },
  })

  function deliver(l: Listener) {
    if (!l.active) return
    if (!l.isCollection) {
      l.next(docSnap(l.path.split('/').pop()!, store.get(l.path)))
      return
    }
    const now = childrenOf(l.path)
    const prev = l.last
    const changes: { type: 'added' | 'modified' | 'removed'; doc: ReturnType<typeof docSnap> }[] = []
    for (const [id, data] of now) {
      if (!prev?.has(id)) changes.push({ type: 'added', doc: docSnap(id, data) })
      else if (prev.get(id) !== data) changes.push({ type: 'modified', doc: docSnap(id, data) })
    }
    for (const [id, data] of prev ?? []) if (!now.has(id)) changes.push({ type: 'removed', doc: docSnap(id, data) })
    if (prev && changes.length === 0) return
    l.last = now
    const docs = [...now].sort(([a], [b]) => (a < b ? -1 : 1)).map(([id, data]) => docSnap(id, data))
    l.next({ docs, docChanges: () => changes, metadata: { fromCache: false, hasPendingWrites: false } })
  }

  function notifyAll() {
    if (notifyQueued) return
    notifyQueued = true
    queueMicrotask(() => {
      notifyQueued = false
      listeners.forEach(deliver)
    })
  }

  function write(path: string, data: Data | undefined) {
    if (data === undefined) {
      store.delete(path)
      writes.push({ op: 'delete', path })
    } else {
      store.set(path, data)
      writes.push({ op: 'set', path, data })
    }
  }

  const api = {
    serverTimestamp: () => SERVER_TS,
    collection: (parent: unknown, ...segments: string[]): Ref => {
      const path = pathOf(parent, segments)
      return { path, id: path.split('/').pop()! }
    },
    doc: (parent: unknown, ...segments: string[]): Ref => {
      const path = pathOf(parent, segments.length ? segments : [`auto${++autoId}`])
      return { path, id: path.split('/').pop()! }
    },
    onSnapshot: (ref: Ref, ...args: unknown[]) => {
      const fns = args.filter((a) => typeof a === 'function') as ((x: unknown) => void)[]
      const l: Listener = {
        path: ref.path,
        // Коллекция — нечётное число сегментов пути.
        isCollection: ref.path.split('/').length % 2 === 1,
        next: fns[0],
        error: fns[1],
        last: null,
        active: true,
      }
      listeners.add(l)
      const fail = control.failNextListen
      control.failNextListen = null
      queueMicrotask(() => {
        if (fail) {
          l.active = false
          l.error?.(fail)
        } else deliver(l)
      })
      return () => {
        l.active = false
        listeners.delete(l)
      }
    },
    setDoc: async (ref: Ref, data: Data, opts?: { merge?: boolean }) => {
      write(ref.path, resolveTimestamps(opts?.merge ? { ...store.get(ref.path), ...data } : data))
      notifyAll()
    },
    deleteDoc: async (ref: Ref) => {
      write(ref.path, undefined)
      notifyAll()
    },
    runTransaction: async (_db: unknown, fn: (tx: unknown) => Promise<void>) => {
      if (control.offline) throw Object.assign(new Error('offline'), { code: 'unavailable' })
      const pending: [string, Data | undefined][] = []
      await fn({
        get: async (ref: Ref) => docSnap(ref.id, store.get(ref.path)),
        set: (ref: Ref, data: Data) => pending.push([ref.path, resolveTimestamps(data)]),
        update: (ref: Ref, data: Data) => pending.push([ref.path, resolveTimestamps({ ...store.get(ref.path), ...data })]),
      })
      pending.forEach(([path, data]) => write(path, data))
      notifyAll()
    },
  }

  return { api, store, writes, control }
}
