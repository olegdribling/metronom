import { useState, useEffect, useCallback, useRef } from 'react'
import { Song } from '../types'
import { api } from '../api'
import { CONFIG } from '../config'

const SONGS_LS_KEY = 'metronom_songs'

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

  // Load from server on mount
  useEffect(() => {
    api.getSongs().then(serverSongs => {
      if (serverSongs.length > 0) {
        setSongs(serverSongs)
        localStorage.setItem(SONGS_LS_KEY, JSON.stringify(serverSongs))
      }
    }).catch(() => {
      // Server unavailable — local cache is still loaded from useState initializer
    })
  }, [])

  const debouncedSaveRef = useRef(
    debounce(async (updatedSongs: Song[]) => {
      try {
        await api.saveSongs(updatedSongs)
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

  return { songs, save, syncError, pendingSave }
}
