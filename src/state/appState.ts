// Общее состояние приложения — простой pub/sub, не фреймворк. Один
// источник правды, экраны подписываются на изменения и перерисовывают
// свой контейнер (кроме "горячего" пути — подсветки битов, см.
// screens/metronomeScreen.ts, там обновление идёт напрямую в DOM,
// в обход перерисовки всего экрана, как и в v1).
import { Beat, EditDraft, MetronomeSettings, PATTERN_SPEEDS, PatternSpeed, PlaylistInfo, Song, ThemeKey } from '../types.ts'
import { CONFIG, DEFAULT_METER } from '../config.ts'
import type { UserLibrary } from '../data/userLibrary.ts'
import { openUserLibrary } from '../data/userLibrary.ts'
import { clampBpm, clampMeter } from '../data/songs.ts'
import { signOutUser, type AppUser } from '../data/auth.ts'
import { stableStringify } from '../data/docSync.ts'

export interface AppState {
  themeId: ThemeKey
  /** «Голос при смене секции» — для песен (настройки). */
  voiceCues: boolean
  /** Страница «Метроном»: свои темп, размер, голос — не зависят от песен и
   * битов, запоминаются между запусками (решение пользователя). У песни и
   * бита темп и размер свои — хранятся в них. */
  metronome: MetronomeSettings
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
  /** Синхронизация с аккаунтом остановилась — текст для плашки в футере. */
  connectionError: string | null
  beats: Beat[]
  /** Свой паттерн метронома — в аккаунте (null — не набит или не вошли). */
  metronomePattern: Beat | null
  /** Биты аккаунта уже пришли — до этого редактор бита показывает
   * «Загрузка…», а не «Бит не найден». */
  beatsLoaded: boolean
  /** Правки песни, паттерна песни или бита библиотеки, ещё не сохранённые
   * дискетой (решение пользователя — защита от случайной правки). Живут,
   * пока открыта страница; уходят с неё — «Сохранить / Не сохранять /
   * Остаться» (app.ts). Играет движок именно их. */
  draft: EditDraft | null
  /** Замок в шапке открыт (долгий тап). Свой у каждой страницы: при входе
   * на страницу — снова закрыт (решение пользователя). */
  unlocked: boolean
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

function readJson(key: string): Record<string, unknown> | null {
  try {
    const value = JSON.parse(readStored(key) ?? 'null')
    return value && typeof value === 'object' ? value : null
  } catch {
    return null
  }
}

// Настройки метронома; до них размер и голос хранились отдельными ключами
// (metronom_meter, metronom_voice_count) — подхватываем, чтобы не сбросить.
const patternSpeedOf = (value: unknown): PatternSpeed => (PATTERN_SPEEDS.includes(value as PatternSpeed) ? (value as PatternSpeed) : 1)

function loadMetronome(): MetronomeSettings {
  const saved = readJson('metronom_metronome') ?? {}
  const oldMeter = readJson('metronom_meter') ?? DEFAULT_METER
  return {
    bpm: clampBpm(saved.bpm ?? CONFIG.DEFAULT_BPM),
    ...clampMeter({ ...oldMeter, ...saved }),
    voiceCount: typeof saved.voiceCount === 'boolean' ? saved.voiceCount : readStored('metronom_voice_count') === 'true',
    flash: saved.flash === true,
    usePattern: saved.usePattern === true,
    patternSpeed: patternSpeedOf(saved.patternSpeed),
  }
}

const state: AppState = {
  themeId: (readStored('metronom_theme') as ThemeKey) || 'minimal',
  voiceCues: readStored('metronom_voice_cues') === 'true',
  metronome: loadMetronome(),
  samplesLoaded: false,
  user: null,
  authReady: false,
  playlists: [],
  playlistId: null,
  songs: [],
  songsLoaded: false,
  connectionError: null,
  beats: [],
  metronomePattern: null,
  beatsLoaded: false,
  draft: null,
  unlocked: false,
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
    notify()
  })
  lib.onLastPlaylistChange((id) => {
    lastPlaylistId = id
    lastPlaylistLoaded = true
    applyCurrentPlaylist()
    notify()
  })
  lib.onBeatsChange((beats) => patchState({ beats, beatsLoaded: true }))
  lib.onMetronomePatternChange((metronomePattern) => patchState({ metronomePattern }))
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
    beats: [],
    beatsLoaded: false,
    metronomePattern: null,
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
 * плейлист. */
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

export function saveSongs(songs: Song[]): void {
  state.songs = songs
  if (library && state.playlistId) library.saveSongs(state.playlistId, songs)
  notify()
}

/** Настройки метронома: темп, размер, голос — только его, запоминаются. */
export function setMetronome(patch: Partial<MetronomeSettings>): void {
  const next = { ...state.metronome, ...patch }
  state.metronome = { bpm: clampBpm(next.bpm), ...clampMeter(next), voiceCount: !!next.voiceCount, flash: !!next.flash, usePattern: !!next.usePattern, patternSpeed: patternSpeedOf(next.patternSpeed) }
  writeStored('metronom_metronome', JSON.stringify(state.metronome))
  notify()
}

/** Свой паттерн метронома — в аккаунт (без входа некуда сохранять). */
export function saveMetronomePattern(pattern: Beat): void {
  state.metronomePattern = pattern
  library?.saveMetronomePattern(pattern)
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

// --- черновик правок и замок страницы ---

const storedSong = (id: number) => state.songs.find((s) => s.id === id)
const storedBeat = (id: string) => state.beats.find((b) => b.id === id)

/** Песня, как её видит страница: с несохранёнными правками, если они есть.
 * Песню удалили (в том числе с другого устройства) — её нет и с правками. */
export function songView(id: number): Song | undefined {
  const stored = storedSong(id)
  const draft = state.draft
  return stored && draft?.kind === 'song' && draft.song.id === id ? draft.song : stored
}

export function beatView(id: string): Beat | undefined {
  const stored = storedBeat(id)
  const draft = state.draft
  return stored && draft?.kind === 'beat' && draft.beat.id === id ? draft.beat : stored
}

export function setDraft(draft: EditDraft): void {
  state.draft = draft
  notify()
}

/** Есть что сохранять: правки отличаются от сохранённого (вернули как было —
 * сохранять нечего). Сохранённое удалено — сохранять некуда. */
export function draftDirty(): boolean {
  const draft = state.draft
  if (!draft) return false
  const stored = draft.kind === 'song' ? storedSong(draft.song.id) : storedBeat(draft.beat.id)
  const edited = draft.kind === 'song' ? draft.song : draft.beat
  return !!stored && stableStringify(stored) !== stableStringify(edited)
}

/** Дискета: правки — в аккаунт. */
export function commitDraft(): void {
  const draft = state.draft
  if (draft && draftDirty()) {
    if (draft.kind === 'song') saveSongs(state.songs.map((s) => (s.id === draft.song.id ? draft.song : s)))
    else saveBeats(state.beats.map((b) => (b.id === draft.beat.id ? draft.beat : b)))
  }
  state.draft = null
  notify()
}

export function discardDraft(): void {
  state.draft = null
  notify()
}

export function setUnlocked(unlocked: boolean): void {
  state.unlocked = unlocked
  notify()
}

/** Новая страница: правок нет, замок закрыт. Без уведомления — страница
 * сейчас перерисуется сама. */
export function resetPageEditing(): void {
  state.draft = null
  state.unlocked = false
}
