// Общее состояние приложения — простой pub/sub, не фреймворк. Один
// источник правды, экраны подписываются на изменения и перерисовывают
// свой контейнер (кроме "горячего" пути — подсветки битов, см.
// screens/metronomeScreen.ts, там обновление идёт напрямую в DOM,
// в обход перерисовки всего экрана, как и в v1).
import { Beat, Meter, PlaylistInfo, Song, ThemeKey } from '../types.ts'
import { CONFIG, DEFAULT_METER } from '../config.ts'
import type { UserLibrary } from '../data/userLibrary.ts'
import { openUserLibrary } from '../data/userLibrary.ts'
import { clampBpm, clampMeter, pruneFills, songMeter } from '../data/songs.ts'
import { signOutUser, type AppUser } from '../data/auth.ts'

export interface AppState {
  themeId: ThemeKey
  voiceCues: boolean
  voiceCount: boolean
  /** Текущий темп. Открыли песню — её темп; правка на метрономе пишется и в
   * песню (setBpm). */
  bpm: number
  /** Размер такта метронома без песни — свой, запоминается между запусками.
   * С песней действует её размер (currentMeter). */
  metronomeMeter: Meter
  samplesLoaded: boolean
  /** Вошедший через Google пользователь (data/auth.ts); null — не вошёл. */
  user: AppUser | null
  /** Firebase уже сказал, вошёл пользователь или нет (до этого экраны песен и
   * битов показывают «Загрузка…», а не карточку входа). */
  authReady: boolean
  /** Плейлисты аккаунта — для списка «Мои плейлисты». */
  playlists: PlaylistInfo[]
  /** Открытый плейлист; songs — его песни. */
  playlistId: string | null
  songs: Song[]
  /** Песни открытого плейлиста уже пришли (из кэша или с сервера) — до этого
   * экран песни показывает «Загрузка…», а не «не найдена». */
  songsLoaded: boolean
  /** Загруженная песня: её играет движок и к ней относятся темп и размер на
   * метрономе (app.ts). null — метроном сам по себе. */
  currentSongId: number | null
  /** Синхронизация с аккаунтом остановилась — текст для плашки в футере. */
  connectionError: string | null
  beats: Beat[]
  /** Биты аккаунта уже пришли — до этого редактор бита показывает
   * «Загрузка…», а не «Бит не найден». */
  beatsLoaded: boolean
}

type Listener = (state: AppState) => void

// localStorage бывает недоступен (приватный режим, запрет сайта) — тогда
// просто не помним настройку, а не падаем.
function readStored(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}
function writeStored(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    // не запомнили — не страшно
  }
}

function loadMetronomeMeter(): Meter {
  try {
    return clampMeter(JSON.parse(readStored('metronom_meter') ?? 'null') ?? DEFAULT_METER)
  } catch {
    return { ...DEFAULT_METER }
  }
}

const state: AppState = {
  themeId: (readStored('metronom_theme') as ThemeKey) || 'minimal',
  voiceCues: readStored('metronom_voice_cues') === 'true',
  voiceCount: readStored('metronom_voice_count') === 'true',
  bpm: CONFIG.DEFAULT_BPM,
  metronomeMeter: loadMetronomeMeter(),
  samplesLoaded: false,
  user: null,
  authReady: false,
  playlists: [],
  playlistId: null,
  songs: [],
  songsLoaded: false,
  currentSongId: null,
  connectionError: null,
  beats: [],
  beatsLoaded: false,
}

// Библиотека аккаунта (data/userLibrary.ts) — открыта, пока пользователь
// вошёл; app.ts открывает/закрывает её по смене входа.
let library: UserLibrary | null = null
let lastPlaylistId: string | null = null
let playlistsLoaded = false
let lastPlaylistLoaded = false
// Последний плейлист открываем сам один раз — при входе. Если пользователь
// потом вернулся к списку «Мои плейлисты», снимки его туда не выдёргивают.
let autoOpenDone = false
// Песня, чей темп уже применён: темп песни ставится один раз при её открытии
// (или когда она пришла из БД после открытия), дальше его меняют отдельно.
let tempoAppliedFor: number | null = null
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

export function currentSong(s: AppState = state): Song | undefined {
  return s.currentSongId === null ? undefined : s.songs.find((song) => song.id === s.currentSongId)
}

export function currentMeter(s: AppState = state): Meter {
  const song = currentSong(s)
  return song ? songMeter(song) : s.metronomeMeter
}

function applySongTempo() {
  const song = currentSong()
  if (song && tempoAppliedFor !== song.id) {
    tempoAppliedFor = song.id
    state.bpm = song.bpm
  }
}

function applyCurrentPlaylist() {
  if (!autoOpenDone && playlistsLoaded && lastPlaylistLoaded) {
    autoOpenDone = true
    if (!state.playlistId && lastPlaylistId && state.playlists.some((p) => p.id === lastPlaylistId)) {
      setOpenPlaylist(lastPlaylistId)
    }
  }
  // Удалён на другом устройстве.
  if (state.playlistId && playlistsLoaded && !state.playlists.some((p) => p.id === state.playlistId)) setOpenPlaylist(null)
}

function setOpenPlaylist(id: string | null) {
  if (id !== state.playlistId) {
    state.playlistId = id
    state.songs = []
    state.songsLoaded = false
    state.currentSongId = null
  }
  library?.watchSongs(id)
}

function describeSyncError(err: unknown): string {
  const code = (err as { code?: string })?.code ?? ''
  const reason =
    code === 'permission-denied'
      ? 'нет доступа к данным аккаунта'
      : code === 'resource-exhausted'
        ? 'превышен лимит Firestore'
        : code === 'unauthenticated'
          ? 'вход в аккаунт устарел'
          : 'ошибка сервера'
  return `Синхронизация с аккаунтом остановилась: ${reason}.`
}

function attachLibrary(lib: UserLibrary) {
  library = lib
  lib.onPlaylistsChange((list) => {
    playlistsLoaded = true
    state.playlists = list
    applyCurrentPlaylist()
    notify()
  })
  lib.onSongsChange((playlistId, songs) => {
    if (playlistId !== state.playlistId) return
    state.songs = songs
    state.songsLoaded = true
    applySongTempo()
    notify()
  })
  lib.onLastPlaylistChange((id) => {
    lastPlaylistId = id
    lastPlaylistLoaded = true
    applyCurrentPlaylist()
    notify()
  })
  lib.onBeatsChange((beats) => patchState({ beats, beatsLoaded: true }))
  lib.onError((err) => {
    console.error('Ошибка синхронизации с Firestore:', err)
    patchState({ connectionError: describeSyncError(err) })
  })
  lib.watchSongs(state.playlistId)
}

function resetLibraryState() {
  lastPlaylistId = null
  playlistsLoaded = false
  lastPlaylistLoaded = false
  autoOpenDone = false
  Object.assign(state, {
    playlists: [],
    playlistId: null,
    songs: [],
    songsLoaded: false,
    currentSongId: null,
    beats: [],
    beatsLoaded: false,
    connectionError: null,
  })
}

export function setUserLibrary(user: AppUser): void {
  library?.destroy()
  resetLibraryState()
  state.user = user
  attachLibrary(openUserLibrary(user.uid))
  notify()
}

export function clearUserLibrary(): void {
  library?.destroy()
  library = null
  resetLibraryState()
  state.user = null
  notify()
}

/** «Повторить» на плашке ошибки: подписки Firestore после ошибки не
 * оживают сами — открываем библиотеку заново, не сбрасывая открытый
 * плейлист и песню. */
export function retrySync(): void {
  if (!state.user) return
  library?.destroy()
  state.connectionError = null
  attachLibrary(openUserLibrary(state.user.uid))
  notify()
}

// Выход: сначала отправить отложенные правки — после signOut прав на запись
// уже нет. Саму библиотеку закроет app.ts, когда придёт смена входа.
export async function signOut(): Promise<void> {
  library?.flush()
  await signOutUser()
}

export function openPlaylist(id: string): void {
  setOpenPlaylist(id)
  library?.setLastPlaylist(id)
  notify()
}

export function closePlaylist(): void {
  setOpenPlaylist(null)
  notify()
}

export function createPlaylist(name: string): void {
  if (!library) return
  openPlaylist(library.createPlaylist(name.trim().slice(0, CONFIG.MAX_NAME_LENGTH) || 'Без названия'))
}

/** Загрузить песню: её играет движок, к ней относятся темп и размер на
 * метрономе. Темп песни применяется заново (открыли песню — её темп). */
export function loadSong(songId: number | null): void {
  state.currentSongId = songId
  tempoAppliedFor = null
  applySongTempo()
  notify()
}

export function saveSongs(songs: Song[]): void {
  state.songs = songs
  if (library && state.playlistId) library.saveSongs(state.playlistId, songs)
  notify()
}

/** Темп. С загруженной песней пишется и в неё (это её темп), кроме
 * `temporary` — редактор бита меняет темп только на время работы с битом. */
export function setBpm(bpm: number, opts: { temporary?: boolean } = {}): void {
  const next = clampBpm(bpm)
  state.bpm = next
  const song = currentSong()
  if (song && !opts.temporary && song.bpm !== next) {
    saveSongs(state.songs.map((s) => (s.id === song.id ? { ...s, bpm: next } : s)))
    return
  }
  notify()
}

/** Размер такта: загруженной песни (в ней и хранится) или метронома. У песни
 * при этом убираются филлы, начинавшиеся за новым концом своей секции. */
export function setMeter(meter: Meter): void {
  const next = clampMeter(meter)
  const song = currentSong()
  if (song) {
    saveSongs(
      state.songs.map((s) => (s.id === song.id ? { ...s, ...next, sections: pruneFills(s.sections, next.beatsPerBar) } : s))
    )
    return
  }
  state.metronomeMeter = next
  writeStored('metronom_meter', JSON.stringify(next))
  notify()
}

export function saveBeats(beats: Beat[]): void {
  state.beats = beats
  library?.saveBeats(beats)
  notify()
}

export function setThemeId(themeId: ThemeKey): void {
  state.themeId = themeId
  writeStored('metronom_theme', themeId)
  document.documentElement.dataset.theme = themeId
  notify()
}

export function setVoiceCues(value: boolean): void {
  state.voiceCues = value
  writeStored('metronom_voice_cues', String(value))
  notify()
}

export function setVoiceCount(value: boolean): void {
  state.voiceCount = value
  writeStored('metronom_voice_count', String(value))
  notify()
}
