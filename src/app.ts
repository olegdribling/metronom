// Корень приложения: роутер + общий хедер/футер + переключение экранов.
// Один audioEngine на всё приложение — экраны только читают/дёргают его.
import { h } from './dom.ts'
import { createRouter } from './router.ts'
import { createAudioEngine } from './engine/audioEngine.ts'
import { appHeader, HeaderRightAction } from './components/appHeader.ts'
import { appFooter, RouteKind } from './components/appFooter.ts'
import {
  currentMeter,
  currentSong,
  getState,
  loadSong,
  patchState,
  retrySync,
  setUserLibrary,
  clearUserLibrary,
  subscribe,
} from './state/appState.ts'
import { onUserChange } from './data/auth.ts'
import { resolveSongForEngine } from './data/resolveBeat.ts'
import { mountMetronomeScreen } from './screens/metronomeScreen.ts'
import { mountPlaylistScreen } from './screens/playlistScreen.ts'
import { mountSongScreen } from './screens/songScreen.ts'
import { mountPatternScreen } from './screens/patternScreen.ts'
import { mountSettingsScreen } from './screens/settingsScreen.ts'
import { mountBeatsScreen } from './screens/beatsScreen.ts'
import { mountBeatEditorScreen } from './screens/beatEditorScreen.ts'
import { Beat, Song } from './types.ts'

const ROUTE_PATHS: Record<RouteKind, string> = {
  metronome: '/metronome',
  playlist: '/playlist',
  beats: '/beats',
  settings: '/settings',
}

export function startApp(root: HTMLElement): void {
  const engine = createAudioEngine()
  engine.onSamplesLoadedChange((loaded) => patchState({ samplesLoaded: loaded }))
  document.documentElement.dataset.theme = getState().themeId

  // --- движок в курсе состояния ---
  // Что играет движок: загруженная песня (state.currentSongId) или — пока
  // открыт редактор бита — сам бит (редактор грузит его через setSong). Темп
  // и размер такта приходят из состояния: у песни свои (data/songs.ts), без
  // песни — метронома (appState.ts). Экраны меняют только состояние, движок
  // догоняет его здесь — на каждое изменение, а не только при открытии
  // песни: секции, паттерн и биты правят после загрузки, в том числе снимки
  // Firestore после обновления страницы. Движку уходит копия песни с
  // подставленными паттернами битов (resolveSongForEngine) — пересобирается,
  // когда меняется песня или биты (правка бита в «Битах» сразу слышна в
  // песне). Каждое сохранение — новый объект, поэтому «изменилась» = другая
  // ссылка.
  let beatEditorActive = false
  let engineSong: Song | null | undefined
  let engineBeats: Beat[] | null = null

  function syncEngine() {
    const state = getState()
    engine.setVoiceCues(state.voiceCues)
    engine.setVoiceCount(state.voiceCount)
    if (engine.bpm !== state.bpm) engine.setBpm(state.bpm)
    if (beatEditorActive) return
    const meter = currentMeter(state)
    if (engine.beatsPerBar !== meter.beatsPerBar) engine.setBeatsPerBar(meter.beatsPerBar)
    if (engine.beatDivision !== meter.beatDivision) engine.setBeatDivision(meter.beatDivision)
    const song = currentSong(state) ?? null
    if (song === engineSong && state.beats === engineBeats) return
    engineSong = song
    engineBeats = state.beats
    engine.setSong(song ? resolveSongForEngine(song, state.beats) : null)
  }

  // Редактор бита открыт — движок играет бит; закрыт — снова то, что было до
  // него: загруженная песня с её темпом и размером, а без песни — щелчок
  // (решение пользователя; раньше после редактора бит играл и на метрономе).
  function setBeatEditorActive(active: boolean) {
    if (beatEditorActive === active) return
    beatEditorActive = active
    if (active) return
    engineSong = undefined
    loadSong(getState().currentSongId)
  }

  // --- оболочка: ровно три div-а — прямые дети контейнера (root) ---
  // container > div(header), div(main), div(footer). appHeader()/appFooter()
  // каждый раз возвращают новый div — старый меняем на новый через
  // replaceWith(), а не держим пустую обёртку и mount() внутрь нее.
  const router = createRouter()
  let headerEl = appHeader({ title: 'Metronom' })
  const mainSlot = h('div', { className: 'screen' })
  let footerEl = h('div', { className: 'app-footer' })
  root.append(headerEl, mainSlot, footerEl)

  let routeKind: RouteKind = 'metronome'
  let titleFn: () => string = () => 'Metronom'
  let showBack = false
  let onBack: () => void = () => {}
  let rightAction: HeaderRightAction | undefined
  let centerTitle = false
  let screenCleanup: (() => void) | null = null
  let chromeKey = ''

  // Шапка и футер подписаны на всё состояние, но пересобираются, только
  // когда изменилось то, что они показывают (force — смена экрана: у неё
  // новые обработчики).
  function renderChrome(force = false) {
    const state = getState()
    const title = titleFn()
    const key = [routeKind, title, engine.isPlaying, engine.canStart, state.connectionError].join('|')
    if (!force && key === chromeKey) return
    chromeKey = key

    const newHeader = appHeader({ title, showBack, onBack, rightAction, centerTitle })
    headerEl.replaceWith(newHeader)
    headerEl = newHeader

    const newFooter = appFooter({
      isPlaying: engine.isPlaying,
      canStart: engine.canStart,
      activeRoute: routeKind,
      onToggleTransport: () => (engine.isPlaying ? engine.stop() : void engine.start()),
      onNavigate: (route) => router.navigate(ROUTE_PATHS[route]),
      notice: state.connectionError ? { text: state.connectionError, actionLabel: 'Повторить', onAction: retrySync } : undefined,
    })
    footerEl.replaceWith(newFooter)
    footerEl = newFooter
  }

  // Порядок подписок важен: движок догоняет состояние раньше, чем
  // перерисовываются футер (смотрит engine.canStart) и экраны (кольцо
  // метронома смотрит размер движка).
  subscribe(syncEngine)
  subscribe(() => renderChrome())
  engine.onPlayingChange(() => renderChrome())

  function setScreen(
    kind: RouteKind,
    title: () => string,
    opts: { showBack?: boolean; onBack?: () => void; rightAction?: HeaderRightAction; centerTitle?: boolean } = {}
  ) {
    routeKind = kind
    titleFn = title
    showBack = !!opts.showBack
    onBack = opts.onBack ?? (() => {})
    rightAction = opts.rightAction
    centerTitle = !!opts.centerTitle
    renderChrome(true)
  }

  function mountScreen(fn: (container: HTMLElement) => () => void) {
    screenCleanup?.()
    // Новый экран — с начала: mount() бережёт прокрутку при перерисовке
    // того же экрана, но не должен переносить её на другой.
    mainSlot.replaceChildren()
    mainSlot.scrollTop = 0
    screenCleanup = fn(mainSlot)
  }

  // Каждый маршрут, кроме редактора бита, — движок снова играет песню/щелчок.
  function enterRoute() {
    setBeatEditorActive(false)
  }

  router.on('/metronome', () => {
    enterRoute()
    setScreen('metronome', () => 'Metronom')
    mountScreen((c) => mountMetronomeScreen(c, engine))
  })

  router.on('/playlist', () => {
    enterRoute()
    setScreen('playlist', () => 'Плейлист')
    mountScreen((c) => mountPlaylistScreen(c, (songId) => router.navigate(`/song/${songId}`)))
  })

  // «Редактировать» из выбора филла в песне: редактор бита открывается из
  // песни, и «назад»/сохранение возвращают в неё, к той же секции.
  let beatEditorReturn: { songId: number; sectionId: string } | null = null
  let songFocus: { songId: number; sectionId: string } | null = null

  router.on('/song/:id', (params) => {
    const songId = Number(params.id)
    const focusSectionId = songFocus?.songId === songId ? songFocus.sectionId : null
    songFocus = null
    enterRoute()
    loadSong(songId)
    setScreen('playlist', () => getState().songs.find((s) => s.id === songId)?.name ?? 'Песня', {
      showBack: true,
      onBack: () => router.navigate('/playlist'),
    })
    mountScreen((c) =>
      mountSongScreen(c, songId, engine, {
        onOpenPattern: () => router.navigate(`/song/${songId}/pattern`),
        onDeleted: () => router.navigate('/playlist'),
        onEditBeat: (beatId, sectionId) => {
          beatEditorReturn = { songId, sectionId }
          router.navigate(`/beats/${encodeURIComponent(beatId)}`)
        },
        focusSectionId,
      })
    )
  })

  router.on('/song/:id/pattern', (params) => {
    const songId = Number(params.id)
    enterRoute()
    // Обновили страницу прямо в редакторе паттерна — песню всё равно
    // загрузить, иначе Play не играл бы её.
    if (getState().currentSongId !== songId) loadSong(songId)
    setScreen('playlist', () => 'Паттерн', { showBack: true, onBack: () => router.navigate(`/song/${songId}`) })
    mountScreen((c) => mountPatternScreen(c, songId, engine))
  })

  router.on('/beats', () => {
    enterRoute()
    setScreen('beats', () => 'Биты')
    mountScreen((c) => mountBeatsScreen(c, (beatId) => router.navigate(`/beats/${encodeURIComponent(beatId)}`)))
  })

  router.on('/beats/:id', (params) => {
    const beatId = params.id
    // Иконка "дискета" в шапке дёргает openSaveDialog внутри уже
    // смонтированного экрана — экран сам регистрирует свою функцию через
    // onRegisterSave при монтировании (mountScreen ниже выполняется сразу
    // после setScreen, до первого возможного клика по иконке).
    let requestSave: () => void = () => {}
    setBeatEditorActive(true)
    const back = beatEditorReturn
    beatEditorReturn = null
    const leave = () => {
      if (back) {
        songFocus = back
        router.navigate(`/song/${back.songId}`)
      } else router.navigate('/beats')
    }
    setScreen('beats', () => getState().beats.find((b) => b.id === beatId)?.name ?? 'Бит', {
      showBack: true,
      onBack: leave,
      rightAction: { icon: 'floppy-disk', ariaLabel: 'Сохранить', onClick: () => requestSave() },
      centerTitle: true,
    })
    mountScreen((c) =>
      mountBeatEditorScreen(c, beatId, engine, leave, (fn) => {
        requestSave = fn
      })
    )
  })

  router.on('/settings', () => {
    enterRoute()
    setScreen('settings', () => 'Настройки')
    mountScreen(mountSettingsScreen)
  })

  router.notFoundHandler(() => router.navigate('/metronome'))

  // Песни, плейлисты и биты — в аккаунте (data/userLibrary.ts): вошёл —
  // открываем его библиотеку (последний плейлист откроется сам), вышел —
  // закрываем. Firebase помнит вход между запусками, так что при обычном
  // старте пользователь сразу видит своё.
  onUserChange((user) => {
    if (user) setUserLibrary(user)
    else clearUserLibrary()
    patchState({ authReady: true })
  })

  syncEngine()
  router.resolve()
}
