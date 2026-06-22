import { useState, useRef, useEffect, useCallback } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { ThemeProvider } from './ThemeContext'
import { useAudioEngine } from './engine/audioEngine'
import { useSongs } from './hooks/useSongs'
import { api } from './api'
import {
  CONFIG, SECTION_TYPES, PATTERN_INSTRUMENTS, PATTERN_STEPS,
  TOUCH_DRAG_DELAY_MS,
} from './config'
import { Song, ThemeKey, SectionFormData, SectionRange } from './types'
import { THEMES } from './theme'
import { PatternEditor } from './metronome/PatternEditor'
import { Icon } from './metronome/Icon'
import { AppHeader } from './metronome/AppHeader'
import { AppFooter } from './metronome/AppFooter'
import { MetronomePage } from './pages/MetronomePage'
import { SongsPage } from './pages/SongsPage'
import { SettingsPage } from './pages/SettingsPage'

// ─── Helpers ───────────────────────────────────────────────────────────────

const clampBpm = (value: unknown): number => {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return CONFIG.DEFAULT_BPM
  return Math.min(CONFIG.MAX_BPM, Math.max(CONFIG.MIN_BPM, Math.round(numeric)))
}

const cloneSong = (song: Song): Song => JSON.parse(JSON.stringify(song))

const normalizePattern = (pattern: Song['pattern'] | undefined) => {
  const steps = pattern?.steps && pattern.steps > 0 ? pattern.steps : PATTERN_STEPS
  const tracks = pattern?.tracks || []
  return {
    steps,
    tracks: PATTERN_INSTRUMENTS.map(inst => {
      const existing = tracks.find(t => t.id === inst.id)
      const existingSteps = Array.isArray(existing?.steps) ? existing.steps : []
      return {
        id: inst.id,
        name: inst.label,
        color: inst.color,
        sample: inst.sample,
        steps: Array.from({ length: steps }, (_, idx) => Boolean(existingSteps[idx])),
      }
    }),
  }
}

const normalizeSong = (song: Partial<Song>): Song => ({
  id: song?.id || Date.now(),
  name: (song?.name || '').trim().slice(0, CONFIG.MAX_SONG_NAME_LENGTH) || 'Untitled',
  bpm: clampBpm(song?.bpm ?? CONFIG.DEFAULT_BPM),
  sections: (song?.sections || [])
    .slice(0, CONFIG.MAX_SECTIONS)
    .map(sec => ({
      name: (sec?.name || '').trim().slice(0, 50),
      comment: (sec?.comment || '').trim().slice(0, CONFIG.MAX_COMMENT_LENGTH),
      bars: Math.max(1, Math.min(16, Number(sec?.bars) || 1)),
      intro: Boolean(sec?.intro),
    })),
  pattern: normalizePattern(song?.pattern),
})

const createEmptyPattern = () => normalizePattern(undefined)

const patternHasActiveSteps = (pattern: Song['pattern']) =>
  !!pattern?.tracks?.some(track => track.steps.some(Boolean))

const totalBarsOf = (song: Song) => song.sections.reduce((s, sec) => s + sec.bars, 0)

// ─── Component ─────────────────────────────────────────────────────────────

export function MetronomeApp() {
  // Русский комментарий: используем роутер для переключения между отдельными страницами.
  const location = useLocation()
  const navigate = useNavigate()
  const { songs, save, syncError, pendingSave } = useSongs()

  const [currentSong, setCurrentSong] = useState<Song | null>(null)
  const [newSongName, setNewSongName] = useState('')
  const [editingSongId, setEditingSongId] = useState<number | null>(null)
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)

  const [themeId, setThemeId] = useState<ThemeKey>(() =>
    (localStorage.getItem('themeId') as ThemeKey) || 'purple'
  )

  const [newSection, setNewSection] = useState<SectionFormData>({ name: 'VERSE', bars: 4, comment: '' })
  const [showAddForm, setShowAddForm] = useState(false)
  const [editingSectionIndex, setEditingSectionIndex] = useState<number | null>(null)
  const [editSectionData, setEditSectionData] = useState<SectionFormData>({ name: 'VERSE', bars: 4, comment: '' })

  const [bpm, setBpm] = useState<number>(CONFIG.DEFAULT_BPM)
  const [showPatternEditor, setShowPatternEditor] = useState(false)
  const [voiceCues, setVoiceCues] = useState(() =>
    localStorage.getItem('voiceCues') === 'true'
  )

  const currentSectionRef = useRef<HTMLDivElement | null>(null)

  const {
    isPlaying, playbackState, beatsPerBar, setBeatsPerBar,
    samplesLoaded, start, stop,
  } = useAudioEngine(bpm, currentSong, voiceCues)

  // Sync theme to body background
  useEffect(() => {
    const bgClass = THEMES[themeId].page.split(' ').find(c => c.startsWith('bg-')) ?? 'bg-slate-950'
    document.body.className = bgClass
  }, [themeId])

  // Sync currentSong from remote if not editing
  useEffect(() => {
    if (!editingSongId || !currentSong || hasUnsavedChanges) return
    const latest = songs.find(s => s.id === editingSongId)
    if (!latest) return
    if (JSON.stringify(latest) === JSON.stringify(currentSong)) return
    setCurrentSong(cloneSong(latest))
  }, [songs, editingSongId, hasUnsavedChanges, currentSong])

  useEffect(() => {
    if (!currentSong) {
      setShowPatternEditor(false)
      setEditingSectionIndex(null)
      setEditSectionData({ name: 'VERSE', bars: 4, comment: '' })
      setBpm(CONFIG.DEFAULT_BPM)
    } else {
      setBpm(clampBpm(currentSong.bpm ?? CONFIG.DEFAULT_BPM))
    }
  }, [currentSong])

  // Auto-scroll to current section
  useEffect(() => {
    if (isPlaying && currentSectionRef.current) {
      currentSectionRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [playbackState.bar, isPlaying])

  // ─── BPM ───────────────────────────────────────────────────────────────

  const updateSongBpm = useCallback((value: number) => {
    const clamped = clampBpm(value)
    setBpm(clamped)
    setCurrentSong(prev => {
      if (!prev || prev.bpm === clamped) return prev
      setHasUnsavedChanges(true)
      return { ...prev, bpm: clamped }
    })
  }, [])

  const changeBpm = (delta: number) => updateSongBpm(bpm + delta)

  // ─── Persist / save ────────────────────────────────────────────────────

  const persistCurrentSong = useCallback(() => {
    if (!currentSong) return
    const exists = songs.some(s => s.id === currentSong.id)
    const updated = exists
      ? songs.map(s => (s.id === currentSong.id ? normalizeSong(currentSong) : s))
      : [...songs, normalizeSong(currentSong)]
    save(updated)
    setHasUnsavedChanges(false)
  }, [currentSong, songs, save])

  const confirmSaveBeforeExit = useCallback(() => {
    if (!hasUnsavedChanges) return true
    const shouldSave = window.confirm('Сохранить изменения? OK = Save, Cancel = Отмена.')
    if (!shouldSave) return false
    persistCurrentSong()
    return true
  }, [hasUnsavedChanges, persistCurrentSong])

  // ─── Songs ─────────────────────────────────────────────────────────────

  const createSong = () => {
    if (!newSongName.trim()) return
    const song = normalizeSong({
      id: Date.now(),
      name: newSongName.trim(),
      bpm: CONFIG.DEFAULT_BPM,
      sections: [{ name: '1 2 3 4', bars: 2, intro: true, comment: '' }],
      pattern: createEmptyPattern(),
    })
    save([...songs, song])
    setNewSongName('')
  }

  const selectSong = (song: Song) => {
    stop()
    setEditingSongId(song.id)
    setHasUnsavedChanges(false)
    setCurrentSong(cloneSong(song))
    setEditingSectionIndex(null)
    setEditSectionData({ name: 'VERSE', bars: 4, comment: '' })
    setShowPatternEditor(false)
  }

  const deleteSong = (id: number) => {
    const song = songs.find(s => s.id === id)
    if (!song) return
    if (!window.confirm(`Удалить песню "${song.name}"?\n\nЭто действие нельзя отменить.`)) return
    const updated = songs.filter(s => s.id !== id)
    save(updated)
    if (currentSong?.id === id) {
      setCurrentSong(null)
      setEditingSongId(null)
      setHasUnsavedChanges(false)
      stop()
    }
  }

  // ─── Sections ──────────────────────────────────────────────────────────

  const addSection = () => {
    if (!currentSong) return
    const section = { ...newSection, bars: Math.max(1, newSection.bars), intro: false }
    setCurrentSong(prev => prev ? { ...prev, sections: [...prev.sections, section] } : prev)
    setHasUnsavedChanges(true)
    setShowAddForm(false)
    setNewSection({ name: 'VERSE', bars: 4, comment: '' })
    setEditingSectionIndex(null)
  }

  const removeSection = (i: number) => {
    if (!currentSong || currentSong.sections[i].intro) return
    setCurrentSong(prev => prev ? { ...prev, sections: prev.sections.filter((_, idx) => idx !== i) } : prev)
    setHasUnsavedChanges(true)
    if (editingSectionIndex === i) {
      setEditingSectionIndex(null)
      setEditSectionData({ name: 'VERSE', bars: 4, comment: '' })
    }
  }

  const startSectionEdit = (i: number) => {
    if (!currentSong) return
    const sec = currentSong.sections[i]
    setEditingSectionIndex(i)
    setEditSectionData({ name: sec.name || 'VERSE', bars: sec.bars || 1, comment: sec.comment || '' })
    setShowAddForm(false)
  }

  const cancelSectionEdit = () => {
    setEditingSectionIndex(null)
    setEditSectionData({ name: 'VERSE', bars: 4, comment: '' })
  }

  const saveSectionEdit = () => {
    if (editingSectionIndex == null || !currentSong) return
    const sanitized = {
      ...currentSong.sections[editingSectionIndex],
      ...editSectionData,
      bars: Math.max(1, editSectionData.bars || 1),
    }
    setCurrentSong(prev => {
      if (!prev) return prev
      const sections = prev.sections.map((sec, idx) => idx === editingSectionIndex ? sanitized : sec)
      return { ...prev, sections }
    })
    setHasUnsavedChanges(true)
    cancelSectionEdit()
  }

  // ─── Pattern ───────────────────────────────────────────────────────────

  const togglePatternStep = useCallback((trackId: string, stepIdx: number) => {
    setCurrentSong(prev => {
      if (!prev) return prev
      let changed = false
      const updatedTracks = prev.pattern.tracks.map(track => {
        if (track.id !== trackId) return track
        const steps = track.steps.map((value, idx) => {
          if (idx !== stepIdx) return value
          changed = true
          return !value
        })
        return { ...track, steps }
      })
      if (!changed) return prev
      setHasUnsavedChanges(true)
      return { ...prev, pattern: { ...prev.pattern, tracks: updatedTracks } }
    })
  }, [])

  const clearPattern = () => {
    setCurrentSong(prev => {
      if (!prev) return prev
      setHasUnsavedChanges(true)
      return { ...prev, pattern: createEmptyPattern() }
    })
  }

  // ─── Drag & drop (songs) ───────────────────────────────────────────────

  const dragSongFrom = useRef<number | null>(null)
  const dragSongDelayTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  const draggedElement = useRef<HTMLElement | null>(null)

  const allow = (e: React.DragEvent) => e.preventDefault()
  const songDragStart = (i: number) => () => { dragSongFrom.current = i }
  const songDrop = (to: number) => (e: React.DragEvent) => {
    e.preventDefault()
    const from = dragSongFrom.current
    if (from == null || from === to) return
    const reordered = [...songs]
    const [moved] = reordered.splice(from, 1)
    reordered.splice(to, 0, moved)
    save(reordered)
    dragSongFrom.current = null
  }

  const songTouchStart = (i: number) => (e: React.TouchEvent) => {
    if (dragSongDelayTimeout.current) clearTimeout(dragSongDelayTimeout.current)
    const touchY = e.touches[0].clientY
    const target = e.currentTarget as HTMLElement
    dragSongDelayTimeout.current = setTimeout(() => {
      dragSongFrom.current = i
      draggedElement.current = target
      draggedElement.current.style.opacity = '0.5'
    }, TOUCH_DRAG_DELAY_MS)
  }

  const songTouchMove = (e: React.TouchEvent) => {
    if (dragSongDelayTimeout.current) { clearTimeout(dragSongDelayTimeout.current); dragSongDelayTimeout.current = null }
    if (dragSongFrom.current == null) return
    e.preventDefault()
    const touch = e.touches[0]
    const element = document.elementFromPoint(touch.clientX, touch.clientY)
    document.querySelectorAll('[data-song-index]').forEach((item, idx) => {
      const el = item as HTMLElement
      el.style.borderTop = item.contains(element) && idx !== dragSongFrom.current ? '3px solid #60a5fa' : ''
    })
  }

  const songTouchEnd = (e: React.TouchEvent) => {
    if (dragSongDelayTimeout.current) { clearTimeout(dragSongDelayTimeout.current); dragSongDelayTimeout.current = null }
    if (dragSongFrom.current == null) return
    const touch = e.changedTouches[0]
    const element = document.elementFromPoint(touch.clientX, touch.clientY)
    const songItems = document.querySelectorAll('[data-song-index]')
    let dropIndex: number | null = null
    songItems.forEach((item, idx) => {
      (item as HTMLElement).style.borderTop = ''
      if (item.contains(element)) dropIndex = idx
    })
    if (dropIndex != null && dropIndex !== dragSongFrom.current) {
      const reordered = [...songs]
      const [moved] = reordered.splice(dragSongFrom.current, 1)
      reordered.splice(dropIndex, 0, moved)
      save(reordered)
    }
    if (draggedElement.current) draggedElement.current.style.opacity = '1'
    dragSongFrom.current = null
    draggedElement.current = null
  }

  // ─── Drag & drop (sections) ────────────────────────────────────────────

  const dragFrom = useRef<number | null>(null)
  const draggedSection = useRef<HTMLElement | null>(null)

  const sectionDragStart = (i: number) => () => {
    if (currentSong && !currentSong.sections[i].intro) dragFrom.current = i
  }

  const sectionDrop = (to: number) => (e: React.DragEvent) => {
    e.preventDefault()
    const from = dragFrom.current
    if (from == null || to === from) return
    setCurrentSong(prev => {
      if (!prev || prev.sections[to]?.intro) return prev
      const arr = [...prev.sections]
      const [moved] = arr.splice(from, 1)
      arr.splice(to, 0, moved)
      setHasUnsavedChanges(true)
      return { ...prev, sections: arr }
    })
    dragFrom.current = null
  }

  const sectionTouchStart = (i: number) => (e: React.TouchEvent) => {
    if (!currentSong || currentSong.sections[i].intro) return
    dragFrom.current = i
    draggedSection.current = e.currentTarget as HTMLElement
    draggedSection.current.style.opacity = '0.5'
  }

  const sectionTouchMove = (e: React.TouchEvent) => {
    if (dragFrom.current == null) return
    e.preventDefault()
    const touch = e.touches[0]
    const element = document.elementFromPoint(touch.clientX, touch.clientY)
    document.querySelectorAll('[data-section-index]').forEach((item, idx) => {
      const isIntro = currentSong?.sections[idx]?.intro
      const el = item as HTMLElement
      el.style.borderTop = item.contains(element) && idx !== dragFrom.current && !isIntro ? '3px solid #60a5fa' : ''
    })
  }

  const sectionTouchEnd = (e: React.TouchEvent) => {
    if (dragFrom.current == null) return
    const touch = e.changedTouches[0]
    const element = document.elementFromPoint(touch.clientX, touch.clientY)
    const sectionItems = document.querySelectorAll('[data-section-index]')
    let dropIndex: number | null = null
    sectionItems.forEach((item, idx) => {
      (item as HTMLElement).style.borderTop = ''
      if (item.contains(element) && !currentSong?.sections[idx]?.intro) dropIndex = idx
    })
    if (dropIndex != null && dropIndex !== dragFrom.current) {
      setCurrentSong(prev => {
        if (!prev) return prev
        const arr = [...prev.sections]
        const [moved] = arr.splice(dragFrom.current!, 1)
        arr.splice(dropIndex!, 0, moved)
        setHasUnsavedChanges(true)
        return { ...prev, sections: arr }
      })
    }
    if (draggedSection.current) draggedSection.current.style.opacity = '1'
    dragFrom.current = null
    draggedSection.current = null
  }

  // ─── Navigation ────────────────────────────────────────────────────────

  const handleBack = () => {
    if (!currentSong) return
    if (!confirmSaveBeforeExit()) return
    stop()
    setCurrentSong(null)
    setEditingSongId(null)
    setHasUnsavedChanges(false)
    setEditingSectionIndex(null)
  }

  const handleLogout = async () => {
    stop()
    await api.logout()
    navigate('/login')
  }

  // Русский комментарий: определяем активный экран по текущему URL.
  const routeKind: 'metronome' | 'songs' | 'settings' =
    location.pathname === '/songs'
      ? 'songs'
      : location.pathname === '/settings'
        ? 'settings'
        : 'metronome'

  // Русский комментарий: заголовок и кнопка "Назад" управляются в едином хедере.
  const headerTitle = routeKind === 'songs' && currentSong ? currentSong.name : routeKind === 'settings' ? 'Настройки' : 'Metronom'
  const showBack = routeKind === 'songs' && currentSong !== null

  // ─── Section ranges for playback visualization ─────────────────────────

  const ranges: SectionRange[] = currentSong
    ? (() => {
        let start = 0
        return currentSong.sections.map(sec => {
          const end = start + sec.bars - 1
          const out = { start, end }
          start = end + 1
          return out
        })
      })()
    : []

  const currentSectionIndex = ranges.findIndex(
    r => playbackState.bar >= r.start && playbackState.bar <= r.end
  )

  // ─── Pattern editor (fullscreen) ───────────────────────────────────────

  if (showPatternEditor && currentSong) {
    return (
      <ThemeProvider themeId={themeId}>
        <PatternEditor
          songName={currentSong.name}
          pattern={currentSong.pattern}
          currentStep={isPlaying ? playbackState.patternStep : -1}
          onToggleStep={togglePatternStep}
          onClear={clearPattern}
          onClose={() => {
            persistCurrentSong()
            setShowPatternEditor(false)
          }}
        />
      </ThemeProvider>
    )
  }

  // ─── Main render ───────────────────────────────────────────────────────

  const theme = THEMES[themeId]

  return (
    <ThemeProvider themeId={themeId}>
      <div className={`min-h-screen ${theme.page}`}>
        {/* Русский комментарий: постоянный хедер с названием экрана и кнопкой назад в режиме редактирования песни. */}
        <AppHeader
          title={headerTitle}
          showBack={showBack}
          onBack={handleBack}
        />

        {/* Русский комментарий: рабочая область прокручивается отдельно и имеет запас снизу под фиксированный футер. */}
        <main className="px-4 pt-[calc(64px+env(safe-area-inset-top))] pb-[calc(168px+env(safe-area-inset-bottom))] flex flex-col items-center min-h-screen">
          {syncError && (
            <div className={`p-3 rounded-2xl w-full max-w-xl mb-3 ${theme.card} border-2 ${theme.borderDanger}`}>
              <div className={`flex items-center gap-2 text-sm ${theme.textDanger}`}>
                <Icon name="warning" />
                <span className="flex-1">{syncError}</span>
              </div>
            </div>
          )}
          {pendingSave && (
            <div className={`p-3 rounded-2xl w-full max-w-xl mb-3 ${theme.card}`}>
              <div className={`flex items-center gap-2 text-sm ${theme.textSub}`}>
                <Icon name="spinner" className="animate-spin" />
                <span>Сохранение...</span>
              </div>
            </div>
          )}

          {routeKind === 'metronome' && (
            <MetronomePage
              bpm={bpm}
              changeBpm={changeBpm}
              updateSongBpm={updateSongBpm}
              playbackState={playbackState}
              isPlaying={isPlaying}
              beatsPerBar={beatsPerBar}
              setBeatsPerBar={setBeatsPerBar}
            />
          )}

          {routeKind === 'songs' && (
            <SongsPage
              songs={songs}
              currentSong={currentSong}
              newSongName={newSongName}
              setNewSongName={setNewSongName}
              createSong={createSong}
              selectSong={selectSong}
              deleteSong={deleteSong}
              songDragStart={songDragStart}
              allow={allow}
              songDrop={songDrop}
              songTouchStart={songTouchStart}
              songTouchMove={songTouchMove}
              songTouchEnd={songTouchEnd}
              bpm={bpm}
              updateSongBpm={updateSongBpm}
              changeBpm={changeBpm}
              sectionTypes={SECTION_TYPES}
              newSection={newSection}
              setNewSection={setNewSection}
              showAddForm={showAddForm}
              setShowAddForm={setShowAddForm}
              addSection={addSection}
              editingSectionIndex={editingSectionIndex}
              editSectionData={editSectionData}
              setEditSectionData={setEditSectionData}
              startSectionEdit={startSectionEdit}
              cancelSectionEdit={cancelSectionEdit}
              saveSectionEdit={saveSectionEdit}
              removeSection={removeSection}
              samplesLoaded={samplesLoaded}
              playbackState={playbackState}
              currentSectionIndex={currentSectionIndex}
              ranges={ranges}
              currentSectionRef={currentSectionRef}
              sectionDragStart={sectionDragStart}
              sectionDrop={sectionDrop}
              sectionTouchStart={sectionTouchStart}
              sectionTouchMove={sectionTouchMove}
              sectionTouchEnd={sectionTouchEnd}
              setShowPatternEditor={setShowPatternEditor}
            />
          )}

          {routeKind === 'settings' && (
            <SettingsPage
              themeId={themeId}
              setThemeId={(id) => {
                setThemeId(id)
                localStorage.setItem('themeId', id)
              }}
              voiceCues={voiceCues}
              setVoiceCues={(v) => {
                setVoiceCues(v)
                localStorage.setItem('voiceCues', String(v))
              }}
              onLogout={handleLogout}
            />
          )}
        </main>

        {/* Русский комментарий: единый футер управляет транспортом и переходами между ключевыми маршрутами. */}
        <AppFooter
          bpm={bpm}
          changeBpm={changeBpm}
          updateSongBpm={updateSongBpm}
          isPlaying={isPlaying}
          start={start}
          stop={stop}
          samplesLoaded={samplesLoaded}
          onOpenPatternEditor={() => setShowPatternEditor(true)}
          routeKind={routeKind}
          onTogglePrimaryRoute={() => {
            if (routeKind === 'metronome') navigate('/songs')
            else navigate('/metronome')
          }}
          onOpenSettings={() => navigate('/settings')}
        />
      </div>
    </ThemeProvider>
  )
}
