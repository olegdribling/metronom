// Живая сессия работы с одним плейлистом: подписка на Firestore +
// дебаунсированная запись правок. Замена v1's hooks/useSongs.ts — тот же
// принцип (сразу применить локально, с задержкой отправить), но без
// optimistic lock: конфликт разрешает last-write-wins на уровне Firestore
// (см. план, «Явно НЕ делать», п.3).
import { CONFIG } from '../config.ts'
import { Song } from '../types.ts'
import { subscribeToPlaylist, writeSongs } from './playlistApi.ts'
import type { Unsubscribe } from 'firebase/firestore'

export interface PlaylistSession {
  getSongs(): Song[]
  onSongsChange(cb: (songs: Song[]) => void): void
  onConnectionError(cb: (err: unknown) => void): void
  save(songs: Song[]): void
  destroy(): void
}

export function openPlaylistSession(code: string): PlaylistSession {
  let songs: Song[] = []
  let changeListener: ((songs: Song[]) => void) | null = null
  let errorListener: ((err: unknown) => void) | null = null
  let saveTimeout: ReturnType<typeof setTimeout> | null = null

  const unsubscribe: Unsubscribe = subscribeToPlaylist(
    code,
    (playlist) => {
      if (!playlist) return
      songs = playlist.songs
      changeListener?.(songs)
    },
    (err) => errorListener?.(err)
  )

  function save(next: Song[]) {
    songs = next
    if (saveTimeout) clearTimeout(saveTimeout)
    saveTimeout = setTimeout(() => {
      writeSongs(code, next).catch((err) => errorListener?.(err))
    }, CONFIG.SAVE_DEBOUNCE_MS)
  }

  return {
    getSongs: () => songs,
    onSongsChange: (cb) => {
      changeListener = cb
    },
    onConnectionError: (cb) => {
      errorListener = cb
    },
    save,
    destroy: () => {
      unsubscribe()
      if (saveTimeout) clearTimeout(saveTimeout)
    },
  }
}
