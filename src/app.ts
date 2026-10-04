// Корень приложения: роутер + общий хедер/футер + переключение экранов.
// Один audioEngine на всё приложение — экраны только читают/дёргают его.
import { h } from './dom.ts'
import { createRouter } from './router.ts'
import { createAudioEngine } from './engine/audioEngine.ts'
import { appHeader, HeaderRightAction } from './components/appHeader.ts'
import { appFooter, RouteKind } from './components/appFooter.ts'
import { getState, subscribe, patchState, setPlaylistSession } from './state/appState.ts'
import { openPlaylistSession } from './data/playlistSession.ts'
import { getKnownPlaylistCodes } from './data/knownPlaylists.ts'
import { playlistExists } from './data/playlistApi.ts'
import { mountMetronomeScreen } from './screens/metronomeScreen.ts'
import { mountPlaylistScreen } from './screens/playlistScreen.ts'
import { mountSongScreen } from './screens/songScreen.ts'
import { mountPatternScreen } from './screens/patternScreen.ts'
import { mountSettingsScreen } from './screens/settingsScreen.ts'
import { mountBeatsScreen } from './screens/beatsScreen.ts'
import { mountBeatEditorScreen } from './screens/beatEditorScreen.ts'
import { Song } from './types.ts'

export function startApp(root: HTMLElement): void {
  const engine = createAudioEngine()
  engine.onSamplesLoadedChange((loaded) => patchState({ samplesLoaded: loaded }))
  engine.onBeatsPerBarChange((n) => patchState({ beatsPerBar: n }))
  // Голосовые настройки — в движок и при старте, и на каждое изменение:
  // экран настроек меняет только appState (setVoiceCues), и раньше
  // «Голос при смене секции» начинал звучать лишь после перезагрузки (в v1
  // флаг доходил до движка сразу — через ref в useAudioEngine).
  const syncVoiceSettings = () => {
    engine.setVoiceCues(getState().voiceCues)
    engine.setVoiceCount(getState().voiceCount)
  }
  syncVoiceSettings()
  subscribe(syncVoiceSettings)
  document.documentElement.dataset.theme = getState().themeId

  const router = createRouter()

  // Ровно три div-а — прямые дети контейнера (root), без лишней вложенности:
  // container > div(header), div(main), div(footer). appHeader()/appFooter()
  // каждый раз возвращают новый div — старый меняем на новый через
  // replaceWith(), а не держим пустую обёртку и mount() внутрь нее.
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

  function renderChrome() {
    const newHeader = appHeader({ title: titleFn(), showBack, onBack, rightAction, centerTitle })
    headerEl.replaceWith(newHeader)
    headerEl = newHeader

    const newFooter = appFooter({
      isPlaying: engine.isPlaying,
      samplesLoaded: getState().samplesLoaded,
      activeRoute: routeKind,
      onToggleTransport: () => (engine.isPlaying ? engine.stop() : void engine.start()),
      onNavigate: (route) =>
        router.navigate(
          route === 'metronome' ? '/metronome' : route === 'playlist' ? '/playlist' : route === 'beats' ? '/beats' : '/settings'
        ),
    })
    footerEl.replaceWith(newFooter)
    footerEl = newFooter
  }

  engine.onPlayingChange(renderChrome)
  subscribe(renderChrome)

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
    renderChrome()
  }

  function mountScreen(fn: (container: HTMLElement) => () => void) {
    screenCleanup?.()
    screenCleanup = fn(mainSlot)
  }

  // Песня, которую сейчас играет движок. Движок получает песню только через
  // setSong(), а правят её после загрузки — секции (экран песни), паттерн
  // (редактор паттерна), другие участники плейлиста (Firestore). Без
  // пересинхронизации ниже движок играл старую версию: новая песня с одной
  // вводной «1 2 3 4» крутила только её, хотя секции уже добавлены.
  let engineSong: Song | null = null

  function loadSongIntoEngine(songId: number) {
    const song = getState().songs.find((s) => s.id === songId)
    if (!song) return
    patchState({ currentSongId: songId, bpm: song.bpm })
    engineSong = song
    engine.setSong(song)
    engine.setBpm(song.bpm)
  }

  // Каждое сохранение песни — новый объект (saveSongs/снимок Firestore),
  // поэтому сравнение по ссылке и есть «песню изменили». Темп не трогаем —
  // его меняют отдельно (метроном/футер), не перебиваем.
  subscribe((state) => {
    if (!engineSong) return
    const fresh = state.songs.find((s) => s.id === engineSong!.id)
    if (fresh && fresh !== engineSong) {
      engineSong = fresh
      engine.setSong(fresh)
    }
  })

  router.on('/metronome', () => {
    setScreen('metronome', () => 'Metronom')
    mountScreen((c) => mountMetronomeScreen(c, engine))
  })

  router.on('/playlist', () => {
    setScreen('playlist', () => 'Плейлист')
    mountScreen((c) =>
      mountPlaylistScreen(c, (songId) => {
        loadSongIntoEngine(songId)
        router.navigate(`/song/${songId}`)
      })
    )
  })

  router.on('/song/:id', (params) => {
    const songId = Number(params.id)
    loadSongIntoEngine(songId)
    setScreen('playlist', () => getState().songs.find((s) => s.id === songId)?.name ?? 'Песня', {
      showBack: true,
      onBack: () => router.navigate('/playlist'),
    })
    mountScreen((c) =>
      mountSongScreen(
        c,
        songId,
        engine,
        () => router.navigate(`/song/${songId}/pattern`),
        () => router.navigate('/playlist')
      )
    )
  })

  router.on('/song/:id/pattern', (params) => {
    const songId = Number(params.id)
    setScreen('playlist', () => 'Паттерн', { showBack: true, onBack: () => router.navigate(`/song/${songId}`) })
    mountScreen((c) => mountPatternScreen(c, songId, engine))
  })

  router.on('/beats', () => {
    setScreen('beats', () => 'Биты')
    mountScreen((c) => mountBeatsScreen(c, (beatId) => router.navigate(`/beats/${beatId}`)))
  })

  router.on('/beats/:id', (params) => {
    const beatId = params.id
    // Иконка "дискета" в шапке дёргает openSaveDialog внутри уже
    // смонтированного экрана — экран сам регистрирует свою функцию через
    // onRegisterSave при монтировании (mountScreen ниже выполняется сразу
    // после setScreen, до первого возможного клика по иконке).
    let requestSave: () => void = () => {}
    // Движок с этого момента играет бит (редактор сам грузит его через
    // setSong) — правки песни больше не должны его перебивать.
    engineSong = null
    setScreen('beats', () => getState().beats.find((b) => b.id === beatId)?.name ?? 'Бит', {
      showBack: true,
      onBack: () => router.navigate('/beats'),
      rightAction: { icon: 'floppy-disk', ariaLabel: 'Сохранить', onClick: () => requestSave() },
      centerTitle: true,
    })
    mountScreen((c) =>
      mountBeatEditorScreen(c, beatId, engine, () => router.navigate('/beats'), (fn) => { requestSave = fn })
    )
  })

  router.on('/settings', () => {
    setScreen('settings', () => 'Настройки')
    mountScreen(mountSettingsScreen)
  })

  router.notFoundHandler(() => router.navigate('/metronome'))

  // Восстановить последний открытый плейлист, если код известен и ещё
  // существует. Если Firebase не настроен или устройство офлайн — тихо
  // остаёмся на экране "создать/ввести код", ничего не ломаем.
  void (async () => {
    const lastCode = getKnownPlaylistCodes()[0]
    if (!lastCode) return
    try {
      if (await playlistExists(lastCode)) {
        setPlaylistSession(lastCode, openPlaylistSession(lastCode))
      }
    } catch {
      // офлайн / Firebase не настроен — не критично для старта приложения
    }
  })()

  router.resolve()
}
