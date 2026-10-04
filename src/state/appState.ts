// Общее состояние приложения — простой pub/sub, не фреймворк. Один
// источник правды, экраны подписываются на изменения и перерисовывают
// свой контейнер (кроме "горячего" пути — подсветки битов, см.
// screens/metronomeScreen.ts, там обновление идёт напрямую в DOM,
// в обход перерисовки всего экрана, как и в v1).
import { PlaybackState, Playlist, Song, ThemeKey, Beat } from '../types.ts'
import { CONFIG } from '../config.ts'
import type { UserLibrary } from '../data/userLibrary.ts'
import { signOutUser, type AppUser } from '../data/auth.ts'

export interface AppState {
  themeId: ThemeKey
  voiceCues: boolean
  voiceCount: boolean
  bpm: number
  beatsPerBar: number
  isPlaying: boolean
  samplesLoaded: boolean
  playbackState: PlaybackState
  /** Вошедший через Google пользователь (data/auth.ts); null — не вошёл. */
  user: AppUser | null
  /** Firebase уже сказал, вошёл пользователь или нет (до этого экраны песен и
   * битов показывают «Загрузка…», а не карточку входа). */
  authReady: boolean
  /** Плейлисты аккаунта — для списка «Мои плейлисты». */
  playlists: { id: string; name: string }[]
  /** Открытый плейлист; songs — его песни. */
  playlistId: string | null
  songs: Song[]
  currentSongId: number | null
  connectionError: string | null
  beats: Beat[]
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
  playbackState: { beat: 1, bar: 0, subBeat: 0, patternStep: 0, nextSectionName: null },
  user: null,
  authReady: false,
  playlists: [],
  playlistId: null,
  songs: [],
  currentSongId: null,
  connectionError: null,
  beats: [],
}

// Библиотека аккаунта (data/userLibrary.ts) — открыта, пока пользователь
// вошёл; app.ts открывает/закрывает её по смене входа.
let library: UserLibrary | null = null
let playlistsData: Playlist[] = []
let lastPlaylistId: string | null = null
let playlistsLoaded = false
let lastPlaylistLoaded = false
// Последний плейлист открываем сам один раз — при входе. Если пользователь
// потом вернулся к списку «Мои плейлисты», снимки его туда не выдёргивают.
let autoOpenDone = false
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

function applyCurrentPlaylist() {
  if (!autoOpenDone && playlistsLoaded && lastPlaylistLoaded) {
    autoOpenDone = true
    if (!state.playlistId && lastPlaylistId && playlistsData.some((p) => p.id === lastPlaylistId)) {
      state.playlistId = lastPlaylistId
    }
  }
  const current = playlistsData.find((p) => p.id === state.playlistId)
  if (state.playlistId && !current && playlistsLoaded) state.playlistId = null // удалён на другом устройстве
  state.songs = current?.songs ?? []
}

function resetLibraryState() {
  playlistsData = []
  lastPlaylistId = null
  playlistsLoaded = false
  lastPlaylistLoaded = false
  autoOpenDone = false
  Object.assign(state, { playlists: [], playlistId: null, songs: [], currentSongId: null, beats: [], connectionError: null })
}

export function setUserLibrary(user: AppUser, lib: UserLibrary): void {
  library?.destroy()
  library = lib
  resetLibraryState()
  state.user = user
  lib.onPlaylistsChange((list) => {
    playlistsData = list
    playlistsLoaded = true
    state.playlists = list.map((p) => ({ id: p.id, name: p.name }))
    applyCurrentPlaylist()
    notify()
  })
  lib.onLastPlaylistChange((id) => {
    lastPlaylistId = id
    lastPlaylistLoaded = true
    applyCurrentPlaylist()
    notify()
  })
  lib.onBeatsChange((beats) => patchState({ beats }))
  lib.onError((err) => {
    console.error('Ошибка синхронизации с Firestore:', err)
    patchState({ connectionError: 'Не удалось связаться с сервером. Правки сохранены на этом устройстве и уйдут, когда появится связь.' })
  })
  notify()
}

export function clearUserLibrary(): void {
  library?.destroy()
  library = null
  resetLibraryState()
  state.user = null
  notify()
}

// Выход: сначала отправить отложенные правки — после signOut прав на запись
// уже нет. Саму библиотеку закроет app.ts, когда придёт смена входа.
export async function signOut(): Promise<void> {
  library?.flush()
  await signOutUser()
}

export function openPlaylist(id: string): void {
  state.playlistId = id
  state.currentSongId = null
  library?.setLastPlaylist(id)
  applyCurrentPlaylist()
  notify()
}

export function closePlaylist(): void {
  state.playlistId = null
  state.songs = []
  state.currentSongId = null
  notify()
}

export function createPlaylist(name: string): void {
  if (!library) return
  openPlaylist(library.createPlaylist(name.trim() || 'Без названия'))
}

export function saveSongs(songs: Song[]): void {
  state.songs = songs
  const id = state.playlistId
  if (library && id) {
    playlistsData = playlistsData.map((p) => (p.id === id ? { ...p, songs } : p))
    library.savePlaylistSongs(id, songs)
  }
  notify()
}

export function saveBeats(beats: Beat[]): void {
  state.beats = beats
  library?.saveBeats(beats)
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
