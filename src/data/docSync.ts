// Синхронизация коллекции Firestore, где документ — один элемент (бит,
// песня): подписка onSnapshot + запись с дебаунсом на каждый документ
// (CONFIG.SAVE_DEBOUNCE_MS), конфликт — last-write-wins на документ.
//
// Пока у документа идёт таймер дебаунса, его версию из снимка не берём, а
// держим локальную: иначе снимок от соседней записи откатывал бы только что
// сделанные тапы, пока их собственная запись ещё не ушла.
//
// save() получает весь список и сам находит изменённые, новые и удалённые
// относительно последнего известного состояния. Изменённый — по содержимому,
// а не только по ссылке: до первого снимка (или после смены источника,
// data/userLibrary.ts) у экрана на руках другие объекты с тем же
// содержимым — переписывать их на сервере незачем, а чужую свежую правку
// так можно затереть.
import { deleteDoc, doc, onSnapshot, serverTimestamp, setDoc, type CollectionReference, type DocumentData } from 'firebase/firestore'
import { CONFIG } from '../config.ts'

export interface DocSyncOptions<T> {
  ref: CollectionReference
  idOf(item: T): string
  fromDoc(data: DocumentData, id: string): T
  toDoc(item: T): DocumentData
  compare(a: T, b: T): number
  onChange(items: T[]): void
  onError(err: unknown): void
}

export interface DocSync<T> {
  save(next: T[]): void
  /** Отправить отложенные записи сейчас. */
  flush(): void
  destroy(): void
}

// JSON с отсортированными ключами — Firestore отдаёт поля не в том порядке,
// в каком их записали.
export function stableStringify(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : v
  )
}

export function createDocSync<T>(opts: DocSyncOptions<T>): DocSync<T> {
  const known = new Map<string, T>()
  const pending = new Map<string, { item: T; timer: ReturnType<typeof setTimeout> }>()
  let ready = false
  let deferred: T[] | null = null
  let destroyed = false

  const report = (err: unknown) => {
    if (!destroyed) opts.onError(err)
  }
  const sameContent = (a: T | undefined, b: T) => a !== undefined && stableStringify(opts.toDoc(a)) === stableStringify(opts.toDoc(b))

  function write(item: T) {
    setDoc(doc(opts.ref, opts.idOf(item)), { ...opts.toDoc(item), updatedAt: serverTimestamp() }).catch(report)
  }

  function emit() {
    opts.onChange([...known.values()].sort(opts.compare))
  }

  function applySave(next: T[]) {
    const nextIds = new Set<string>()
    for (const item of next) {
      const id = opts.idOf(item)
      nextIds.add(id)
      const prev = known.get(id)
      if (prev === item) continue
      known.set(id, item)
      if (!pending.has(id) && sameContent(prev, item)) continue
      const p = pending.get(id)
      if (p) clearTimeout(p.timer)
      pending.set(id, {
        item,
        timer: setTimeout(() => {
          pending.delete(id)
          write(item)
        }, CONFIG.SAVE_DEBOUNCE_MS),
      })
    }
    for (const id of [...known.keys()]) {
      if (nextIds.has(id)) continue
      known.delete(id)
      const p = pending.get(id)
      if (p) clearTimeout(p.timer)
      pending.delete(id)
      deleteDoc(doc(opts.ref, id)).catch(report)
    }
  }

  const unsubscribe = onSnapshot(
    opts.ref,
    (snap) => {
      for (const change of snap.docChanges()) {
        const id = change.doc.id
        if (pending.has(id)) continue // своя неотправленная правка важнее снимка
        if (change.type === 'removed') known.delete(id)
        else known.set(id, opts.fromDoc(change.doc.data(), id))
      }
      if (!ready) {
        ready = true
        if (deferred) {
          applySave(deferred)
          deferred = null
        }
      }
      emit()
    },
    report
  )

  function flush() {
    // Снимка так и не дождались (вышли сразу после правки) — правки не
    // теряем: last-write-wins, как и у обычной записи.
    if (!ready && deferred) {
      deferred.forEach(write)
      deferred = null
    }
    pending.forEach(({ item, timer }) => {
      clearTimeout(timer)
      write(item)
    })
    pending.clear()
  }

  return {
    save(next) {
      // До первого снимка не с чем сравнивать — иначе удалили бы то, чего
      // ещё не видели, и переписали бы всё подряд.
      if (!ready) deferred = next
      else applySave(next)
    },
    flush,
    destroy() {
      flush()
      destroyed = true
      unsubscribe()
    },
  }
}
