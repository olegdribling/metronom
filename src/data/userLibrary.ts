// Библиотека пользователя в Firestore — всё лежит под его аккаунтом
// (вход через Google, data/auth.ts), коды и общий доступ пока не делаем:
//   users/{uid}                          { lastPlaylistId }
//   users/{uid}/playlists/{playlistId}   { name, songs, createdAt, updatedAt }
//   users/{uid}/beats/{beatId}           Beat + updatedAt
// Правило Firestore — доступ только к своему users/{uid}/** (см. CLAUDE.md).
//
// Тот же принцип, что был у прежнего playlistSession.ts: подписка
// onSnapshot + запись с дебаунсом (CONFIG.SAVE_DEBOUNCE_MS), конфликт —
// last-write-wins. Пока у документа есть ещё не отправленная правка (идёт
// таймер дебаунса), его версию из снимка не берём, а держим локальную:
// иначе снимок от соседней записи откатывал бы только что сделанные тапы,
// пока их собственная запись ещё не ушла.
import { collection, doc, onSnapshot, setDoc, deleteDoc, serverTimestamp, type Unsubscribe } from 'firebase/firestore'
import { getDb } from './firebase.ts'
import { normalizeBeat } from './beatsLibrary.ts'
import { CONFIG } from '../config.ts'
import { Beat, Playlist, Song } from '../types.ts'

export interface UserLibrary {
  onPlaylistsChange(cb: (playlists: Playlist[]) => void): void
  onBeatsChange(cb: (beats: Beat[]) => void): void
  onLastPlaylistChange(cb: (id: string | null) => void): void
  onError(cb: (err: unknown) => void): void
  /** Создаёт плейлист и сразу возвращает его id (id генерируется на клиенте,
   * в снимках он появится сразу — из локального кэша). */
  createPlaylist(name: string): string
  savePlaylistSongs(id: string, songs: Song[]): void
  /** Весь массив битов — библиотека сама находит изменённые (по ссылке),
   * новые и удалённые относительно прошлого состояния. */
  saveBeats(beats: Beat[]): void
  setLastPlaylist(id: string | null): void
  /** Отправить отложенные правки сейчас — перед выходом из аккаунта, пока
   * ещё есть права на запись. */
  flush(): void
  destroy(): void
}

export function openUserLibrary(uid: string): UserLibrary {
  const db = getDb()
  const userRef = doc(db, 'users', uid)
  const playlistsRef = collection(db, 'users', uid, 'playlists')
  const beatsRef = collection(db, 'users', uid, 'beats')

  let playlistsListener: ((playlists: Playlist[]) => void) | null = null
  let beatsListener: ((beats: Beat[]) => void) | null = null
  let lastPlaylistListener: ((id: string | null) => void) | null = null
  let errorListener: ((err: unknown) => void) | null = null

  // Последние известные данные — чтобы отдавать их подписчику, который
  // подключился после первого снимка, и чтобы сравнивать биты в saveBeats.
  let playlists: Playlist[] = []
  let beats: Beat[] = []
  let lastPlaylistId: string | null = null

  const pendingSongs = new Map<string, { songs: Song[]; timer: ReturnType<typeof setTimeout> }>()
  const pendingBeats = new Map<string, { beat: Beat; timer: ReturnType<typeof setTimeout> }>()

  const reportError = (err: unknown) => errorListener?.(err)

  function writeSongs(id: string, songs: Song[]) {
    setDoc(doc(playlistsRef, id), { songs, updatedAt: serverTimestamp() }, { merge: true }).catch(reportError)
  }

  function writeBeat(beat: Beat) {
    setDoc(doc(beatsRef, beat.id), { ...beat, updatedAt: serverTimestamp() }).catch(reportError)
  }

  const unsubscribers: Unsubscribe[] = [
    onSnapshot(
      playlistsRef,
      (snap) => {
        playlists = snap.docs
          .map((d) => {
            const data = d.data()
            return {
              id: d.id,
              name: (data.name as string) || 'Без названия',
              songs: pendingSongs.get(d.id)?.songs ?? ((data.songs ?? []) as Song[]),
              // createdAt ещё null, пока запись создания не дошла до сервера.
              createdAt: (data.createdAt?.toMillis?.() as number | undefined) ?? Date.now(),
            }
          })
          .sort((a, b) => a.createdAt - b.createdAt)
          .map(({ createdAt: _createdAt, ...p }) => p)
        playlistsListener?.(playlists)
      },
      reportError
    ),
    onSnapshot(
      beatsRef,
      (snap) => {
        const fromServer = snap.docs.map((d) => {
          const { updatedAt: _updatedAt, ...beat } = d.data()
          return pendingBeats.get(d.id)?.beat ?? normalizeBeat(beat as Beat)
        })
        // Новые биты, чья запись ещё ждёт дебаунса, в снимке пока нет.
        const unsent = [...pendingBeats.values()].map((p) => p.beat).filter((b) => !fromServer.some((s) => s.id === b.id))
        beats = [...fromServer, ...unsent]
        beatsListener?.(beats)
      },
      reportError
    ),
    onSnapshot(
      userRef,
      (snap) => {
        lastPlaylistId = (snap.data()?.lastPlaylistId as string | undefined) ?? null
        lastPlaylistListener?.(lastPlaylistId)
      },
      reportError
    ),
  ]

  function flush() {
    pendingSongs.forEach(({ songs, timer }, id) => {
      clearTimeout(timer)
      writeSongs(id, songs)
    })
    pendingSongs.clear()
    pendingBeats.forEach(({ beat, timer }) => {
      clearTimeout(timer)
      writeBeat(beat)
    })
    pendingBeats.clear()
  }

  return {
    onPlaylistsChange: (cb) => {
      playlistsListener = cb
    },
    onBeatsChange: (cb) => {
      beatsListener = cb
    },
    onLastPlaylistChange: (cb) => {
      lastPlaylistListener = cb
    },
    onError: (cb) => {
      errorListener = cb
    },
    createPlaylist(name) {
      const ref = doc(playlistsRef)
      setDoc(ref, { name, songs: [], createdAt: serverTimestamp(), updatedAt: serverTimestamp() }).catch(reportError)
      return ref.id
    },
    savePlaylistSongs(id, songs) {
      const pending = pendingSongs.get(id)
      if (pending) clearTimeout(pending.timer)
      const timer = setTimeout(() => {
        pendingSongs.delete(id)
        writeSongs(id, songs)
      }, CONFIG.SAVE_DEBOUNCE_MS)
      pendingSongs.set(id, { songs, timer })
    },
    saveBeats(next) {
      const prevById = new Map(beats.map((b) => [b.id, b]))
      next.forEach((beat) => {
        if (prevById.get(beat.id) === beat) return
        const pending = pendingBeats.get(beat.id)
        if (pending) clearTimeout(pending.timer)
        const timer = setTimeout(() => {
          pendingBeats.delete(beat.id)
          writeBeat(beat)
        }, CONFIG.SAVE_DEBOUNCE_MS)
        pendingBeats.set(beat.id, { beat, timer })
      })
      prevById.forEach((_, id) => {
        if (next.some((b) => b.id === id)) return
        const pending = pendingBeats.get(id)
        if (pending) clearTimeout(pending.timer)
        pendingBeats.delete(id)
        deleteDoc(doc(beatsRef, id)).catch(reportError)
      })
      beats = next
    },
    setLastPlaylist(id) {
      if (id === lastPlaylistId) return
      lastPlaylistId = id
      setDoc(userRef, { lastPlaylistId: id }, { merge: true }).catch(reportError)
    },
    flush,
    destroy() {
      flush()
      unsubscribers.forEach((u) => u())
    },
  }
}
