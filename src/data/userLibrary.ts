// Библиотека пользователя в Firestore — всё лежит под его аккаунтом
// (вход через Google, data/auth.ts), коды и общий доступ пока не делаем:
//   users/{uid}                                  { lastPlaylistId }
//   users/{uid}/playlists/{playlistId}           { name, createdAt, updatedAt, songsMigrated }
//   users/{uid}/playlists/{playlistId}/songs/{songId}   Song + updatedAt
//   users/{uid}/beats/{beatId}                   Beat + updatedAt
// Правило Firestore — доступ только к своему users/{uid}/** (firestore.rules).
//
// Песня и бит — по документу (data/docSync.ts): конфликт last-write-wins
// сужается до одной песни. Раньше все песни плейлиста лежали массивом в поле
// songs документа плейлиста, и правка песни A на одном устройстве затирала
// правку песни B на другом (решение пользователя — разнести). Старые
// плейлисты переносятся сами (migrateLegacy): транзакция раскладывает массив
// по документам и ставит songsMigrated; сам массив остаётся нетронутым как
// резервная копия. Пока перенос не прошёл (например, офлайн), плейлист
// работает по-старому — читает и пишет массив.
import {
  collection,
  doc,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  setDoc,
  type DocumentData,
  type Unsubscribe,
} from 'firebase/firestore'
import { getDb } from './firebase.ts'
import { normalizeBeat } from './beatsLibrary.ts'
import { normalizeSong } from './songs.ts'
import { createDocSync, type DocSync } from './docSync.ts'
import { CONFIG } from '../config.ts'
import { Beat, PlaylistInfo, Song } from '../types.ts'

export interface UserLibrary {
  onPlaylistsChange(cb: (playlists: PlaylistInfo[]) => void): void
  /** Песни открытого плейлиста (watchSongs) — сразу, как только известны. */
  onSongsChange(cb: (playlistId: string, songs: Song[]) => void): void
  onBeatsChange(cb: (beats: Beat[]) => void): void
  onLastPlaylistChange(cb: (id: string | null) => void): void
  onError(cb: (err: unknown) => void): void
  /** Создаёт плейлист и сразу возвращает его id (id генерируется на клиенте,
   * в снимках он появится сразу — из локального кэша). */
  createPlaylist(name: string): string
  /** Чьи песни слушать — открытый плейлист; null — никакой. */
  watchSongs(playlistId: string | null): void
  /** Весь список песен плейлиста — библиотека сама находит изменённые, новые
   * и удалённые. */
  saveSongs(playlistId: string, songs: Song[]): void
  saveBeats(beats: Beat[]): void
  setLastPlaylist(id: string | null): void
  /** Отправить отложенные правки сейчас — перед выходом из аккаунта, пока
   * ещё есть права на запись. */
  flush(): void
  destroy(): void
}

interface PlaylistMeta {
  name: string
  createdAt: number
  migrated: boolean
  /** Песни из старого поля-массива — пока плейлист не перенесён. */
  legacySongs: Song[]
  hasPendingWrites: boolean
}

const songToDoc = (song: Song): DocumentData => ({ ...song })
const songFromDoc = (data: DocumentData, id: string): Song => normalizeSong({ ...data, id: Number(id) })
const beatToDoc = (beat: Beat): DocumentData => ({ ...beat })
const beatFromDoc = (data: DocumentData, id: string): Beat => {
  const { updatedAt: _updatedAt, ...beat } = data
  return normalizeBeat({ ...(beat as Beat), id })
}

// Офлайн транзакция не проходит — это не ошибка, перенос повторится, когда
// придёт снимок с сервера.
const isOffline = (err: unknown) => (err as { code?: string })?.code === 'unavailable'

export function openUserLibrary(uid: string): UserLibrary {
  const db = getDb()
  const userRef = doc(db, 'users', uid)
  const playlistsRef = collection(db, 'users', uid, 'playlists')
  const beatsRef = collection(db, 'users', uid, 'beats')
  const songsRef = (playlistId: string) => collection(playlistsRef, playlistId, 'songs')

  let playlistsListener: ((playlists: PlaylistInfo[]) => void) | null = null
  let songsListener: ((playlistId: string, songs: Song[]) => void) | null = null
  let beatsListener: ((beats: Beat[]) => void) | null = null
  let lastPlaylistListener: ((id: string | null) => void) | null = null
  let errorListener: ((err: unknown) => void) | null = null
  let destroyed = false

  const reportError = (err: unknown) => {
    if (!destroyed) errorListener?.(err)
  }

  const meta = new Map<string, PlaylistMeta>()
  let lastPlaylistId: string | null = null

  // --- песни открытого плейлиста ---
  let watchedId: string | null = null
  let songsSync: DocSync<Song> | null = null
  let songsSyncId: string | null = null
  const pendingLegacy = new Map<string, { songs: Song[]; timer: ReturnType<typeof setTimeout> }>()
  const migrating = new Set<string>()
  // Правка песен раньше первого снимка плейлистов (сразу после «Повторить»,
  // data/appState.ts: на экране ещё песни прошлой подписки) — ещё неизвестно,
  // перенесён ли плейлист и куда писать. Ждёт снимка, а не теряется.
  let queuedSongs: { playlistId: string; songs: Song[] } | null = null

  function saveSongs(playlistId: string, songs: Song[]) {
    const m = meta.get(playlistId)
    if (!m) {
      queuedSongs = { playlistId, songs }
      return
    }
    if (m.migrated) {
      if (songsSyncId === playlistId) songsSync?.save(songs)
      return
    }
    const pending = pendingLegacy.get(playlistId)
    if (pending) clearTimeout(pending.timer)
    const timer = setTimeout(() => {
      pendingLegacy.delete(playlistId)
      writeLegacySongs(playlistId, songs)
    }, CONFIG.SAVE_DEBOUNCE_MS)
    pendingLegacy.set(playlistId, { songs, timer })
  }

  function stopSongsSync() {
    songsSync?.destroy()
    songsSync = null
    songsSyncId = null
  }

  function refreshSongsSource() {
    const id = watchedId
    if (!id) return stopSongsSync()
    const m = meta.get(id)
    if (!m) return // плейлист ещё не пришёл; удалённый закроет appState
    if (m.migrated) {
      if (songsSyncId === id) return
      stopSongsSync()
      songsSyncId = id
      songsSync = createDocSync<Song>({
        ref: songsRef(id),
        idOf: (s) => String(s.id),
        fromDoc: songFromDoc,
        toDoc: songToDoc,
        // Порядок песен — порядок добавления: id песни — время создания.
        compare: (a, b) => a.id - b.id,
        onChange: (songs) => songsListener?.(id, songs),
        onError: reportError,
      })
    } else {
      stopSongsSync()
      songsListener?.(id, pendingLegacy.get(id)?.songs ?? m.legacySongs)
    }
  }

  function writeLegacySongs(id: string, songs: Song[]) {
    setDoc(doc(playlistsRef, id), { songs, updatedAt: serverTimestamp() }, { merge: true }).catch(reportError)
  }

  function migrateLegacy() {
    for (const [id, m] of meta) {
      // С неотправленной правкой массива не переносим — транзакция прочитала
      // бы сервер без неё, и правка осталась бы только в резервной копии.
      if (m.migrated || m.hasPendingWrites || pendingLegacy.has(id) || migrating.has(id)) continue
      migrating.add(id)
      const ref = doc(playlistsRef, id)
      runTransaction(db, async (tx) => {
        const snap = await tx.get(ref)
        const data = snap.data()
        if (!data || data.songsMigrated) return
        for (const raw of (Array.isArray(data.songs) ? data.songs : []) as Song[]) {
          const song = normalizeSong(raw)
          tx.set(doc(songsRef(id), String(song.id)), { ...songToDoc(song), updatedAt: serverTimestamp() })
        }
        tx.update(ref, { songsMigrated: true })
      })
        .catch((err) => {
          if (!isOffline(err)) reportError(err)
        })
        .finally(() => migrating.delete(id))
    }
  }

  const beatsSync = createDocSync<Beat>({
    ref: beatsRef,
    idOf: (b) => b.id,
    fromDoc: beatFromDoc,
    toDoc: beatToDoc,
    compare: (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    onChange: (beats) => beatsListener?.(beats),
    onError: reportError,
  })

  const unsubscribers: Unsubscribe[] = [
    onSnapshot(
      playlistsRef,
      // С изменениями метаданных — чтобы узнать, что запись массива дошла до
      // сервера (hasPendingWrites стал false), и тогда перенести плейлист.
      { includeMetadataChanges: true },
      (snap) => {
        meta.clear()
        snap.docs.forEach((d) => {
          const data = d.data()
          meta.set(d.id, {
            name: (data.name as string) || 'Без названия',
            // createdAt ещё null, пока запись создания не дошла до сервера.
            createdAt: (data.createdAt?.toMillis?.() as number | undefined) ?? Number.MAX_SAFE_INTEGER,
            migrated: !!data.songsMigrated,
            legacySongs: data.songsMigrated ? [] : ((Array.isArray(data.songs) ? data.songs : []) as Song[]).map(normalizeSong),
            hasPendingWrites: d.metadata.hasPendingWrites,
          })
        })
        playlistsListener?.(
          [...meta.entries()].sort(([, a], [, b]) => a.createdAt - b.createdAt).map(([id, m]) => ({ id, name: m.name }))
        )
        refreshSongsSource()
        if (queuedSongs && meta.has(queuedSongs.playlistId)) {
          const { playlistId, songs } = queuedSongs
          queuedSongs = null
          saveSongs(playlistId, songs)
        }
        if (!snap.metadata.fromCache) migrateLegacy()
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

  function flushLegacy() {
    pendingLegacy.forEach(({ songs, timer }, id) => {
      clearTimeout(timer)
      writeLegacySongs(id, songs)
    })
    pendingLegacy.clear()
  }

  function flush() {
    flushLegacy()
    songsSync?.flush()
    beatsSync.flush()
  }

  return {
    onPlaylistsChange: (cb) => {
      playlistsListener = cb
    },
    onSongsChange: (cb) => {
      songsListener = cb
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
      setDoc(ref, { name, createdAt: serverTimestamp(), updatedAt: serverTimestamp(), songsMigrated: true }).catch(reportError)
      return ref.id
    },
    watchSongs(playlistId) {
      if (playlistId === watchedId) return
      watchedId = playlistId
      refreshSongsSource()
    },
    saveSongs,
    saveBeats: (beats) => beatsSync.save(beats),
    setLastPlaylist(id) {
      if (id === lastPlaylistId) return
      lastPlaylistId = id
      setDoc(userRef, { lastPlaylistId: id }, { merge: true }).catch(reportError)
    },
    flush,
    destroy() {
      flush()
      destroyed = true
      unsubscribers.forEach((u) => u())
      stopSongsSync()
      beatsSync.destroy()
    },
  }
}
