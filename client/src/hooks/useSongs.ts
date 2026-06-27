import { useState, useEffect, useCallback, useRef } from 'react'
import { Song } from '../types'
import { api } from '../api'
import { CONFIG } from '../config'

const SONGS_LS_KEY = 'metronom_songs'
const UPDATED_AT_LS_KEY = 'metronom_songs_updated_at'

const debounce = (fn: (...args: any[]) => void, wait: number) => {
  let timeout: ReturnType<typeof setTimeout>
  return (...args: any[]) => {
    clearTimeout(timeout)
    timeout = setTimeout(() => fn(...args), wait)
  }
}

export function useSongs() {
  const [songs, setSongs] = useState<Song[]>(() => {
    try {
      const saved = localStorage.getItem(SONGS_LS_KEY)
      return saved ? JSON.parse(saved) : []
    } catch {
      return []
    }
  })
  const [syncError, setSyncError] = useState<string | null>(null)
  const [pendingSave, setPendingSave] = useState(false)
  const [conflictNotice, setConflictNotice] = useState(false)

  // updatedAt не нужен в рендере — читается/пишется синхронно перед каждым PUT.
  const updatedAtRef = useRef<string | null>(localStorage.getItem(UPDATED_AT_LS_KEY) || null)

  const hasValidAuthSession = () =>
    Boolean(localStorage.getItem('tt_auth')) &&
    Boolean(localStorage.getItem('tt_token')) &&
    Boolean(localStorage.getItem('tt_refresh_token'))

  const applyServerSongs = (serverSongs: Song[], serverUpdatedAt: string | null) => {
    setSongs(serverSongs)
    localStorage.setItem(SONGS_LS_KEY, JSON.stringify(serverSongs))
    updatedAtRef.current = serverUpdatedAt
    if (serverUpdatedAt) localStorage.setItem(UPDATED_AT_LS_KEY, serverUpdatedAt)
    else localStorage.removeItem(UPDATED_AT_LS_KEY)
  }

  // Load from server on mount
  useEffect(() => {
    if (!hasValidAuthSession()) return
    api.getSongs().then(({ songs: serverSongs, updatedAt }) => {
      if (serverSongs.length > 0) {
        applyServerSongs(serverSongs, updatedAt)
      } else {
        updatedAtRef.current = updatedAt
      }
    }).catch(() => {
      // Server unavailable — local cache is still loaded from useState initializer
    })
  }, [])

  const debouncedSaveRef = useRef(
    debounce(async (updatedSongs: Song[]) => {
      if (!hasValidAuthSession()) {
        setPendingSave(false)
        return
      }
      try {
        const result = await api.saveSongs(updatedSongs, updatedAtRef.current)
        if (result.conflict) {
          // На сервере уже более новая версия (записана из другой вкладки/
          // устройства) — не затираем её локальными данными молча.
          applyServerSongs(result.songs, result.updatedAt)
          setConflictNotice(true)
        } else {
          updatedAtRef.current = result.updatedAt
          localStorage.setItem(UPDATED_AT_LS_KEY, result.updatedAt)
        }
        setSyncError(null)
      } catch {
        setSyncError('Ошибка сохранения. Проверьте интернет.')
      } finally {
        setPendingSave(false)
      }
    }, CONFIG.SAVE_DEBOUNCE_MS)
  )

  const save = useCallback((updatedSongs: Song[]) => {
    setSongs(updatedSongs)
    localStorage.setItem(SONGS_LS_KEY, JSON.stringify(updatedSongs))
    setPendingSave(true)
    debouncedSaveRef.current(updatedSongs)
  }, [])

  const dismissConflictNotice = useCallback(() => setConflictNotice(false), [])

  return { songs, save, syncError, pendingSave, conflictNotice, dismissConflictNotice }
}
