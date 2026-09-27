// Общее состояние приложения — простой pub/sub, не фреймворк. Один
// источник правды, экраны подписываются на изменения и перерисовывают
// свой контейнер (кроме "горячего" пути — подсветки битов, см.
// screens/metronomeScreen.ts, там обновление идёт напрямую в DOM,
// в обход перерисовки всего экрана, как и в v1).
import { PlaybackState, Song, ThemeKey } from '../types.ts'
import { CONFIG } from '../config.ts'
import { PlaylistSession } from '../data/playlistSession.ts'

export interface AppState {
  themeId: ThemeKey
  voiceCues: boolean
  voiceCount: boolean
  bpm: number
  beatsPerBar: number
  isPlaying: boolean
  samplesLoaded: boolean
  playbackState: PlaybackState
  playlistCode: string | null
  songs: Song[]
  currentSongId: number | null
  connectionError: string | null
}

type Listener = (state: AppState) => void

function loadThemeId(): ThemeKey {
  return (localStorage.getItem('metronom_theme') as ThemeKey) || 'minimal'
}
function loadVoiceCues(): boolean {
  return localStorage.getItem('metronom_voice_cues') === 'true'
}
function loadVoiceCount(): boolean {
  return localStorage.getItem('metronom_voice_count') === 'true'
}

const state: AppState = {
  themeId: loadThemeId(),
  voiceCues: loadVoiceCues(),
  voiceCount: loadVoiceCount(),
  bpm: CONFIG.DEFAULT_BPM,
  beatsPerBar: 4,
  isPlaying: false,
  samplesLoaded: false,
  playbackState: { beat: 1, bar: 0, patternStep: 0, nextSectionName: null },
  playlistCode: null,
  songs: [],
  currentSongId: null,
  connectionError: null,
}

let session: PlaylistSession | null = null
const listeners = new Set<Listener>()

function notify() {
  listeners.forEach((cb) => cb(state))
}

export function getState(): AppState {
  return state
}

export function subscribe(cb: Listener): () => void {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

export function patchState(patch: Partial<AppState>): void {
  Object.assign(state, patch)
  notify()
}

export function setPlaylistSession(code: string, newSession: PlaylistSession): void {
  session?.destroy()
  session = newSession
  state.playlistCode = code
  state.connectionError = null
  session.onSongsChange((songs) => patchState({ songs }))
  session.onConnectionError((err) => {
    console.error('Ошибка синхронизации плейлиста:', err)
    patchState({ connectionError: 'Не удалось связаться с сервером. Правки сохранены только на этом устройстве.' })
  })
  notify()
}

export function clearPlaylistSession(): void {
  session?.destroy()
  session = null
  state.playlistCode = null
  state.songs = []
  state.currentSongId = null
  notify()
}

export function saveSongs(songs: Song[]): void {
  state.songs = songs
  session?.save(songs)
  notify()
}

export function setThemeId(themeId: ThemeKey): void {
  state.themeId = themeId
  localStorage.setItem('metronom_theme', themeId)
  document.documentElement.dataset.theme = themeId
  notify()
}

export function setVoiceCues(value: boolean): void {
  state.voiceCues = value
  localStorage.setItem('metronom_voice_cues', String(value))
  notify()
}

export function setVoiceCount(value: boolean): void {
  state.voiceCount = value
  localStorage.setItem('metronom_voice_count', String(value))
  notify()
}
