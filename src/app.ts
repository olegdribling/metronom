// Корень приложения: роутер + общий хедер/футер + переключение экранов.
// Один audioEngine на всё приложение — экраны только читают/дёргают его.
import { h, mount } from './dom.ts'
import { createRouter } from './router.ts'
import { createAudioEngine } from './engine/audioEngine.ts'
import { appHeader } from './components/appHeader.ts'
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

export function startApp(root: HTMLElement): void {
  const engine = createAudioEngine()
  engine.onSamplesLoadedChange((loaded) => patchState({ samplesLoaded: loaded }))
  engine.onBeatsPerBarChange((n) => patchState({ beatsPerBar: n }))
  engine.setVoiceCues(getState().voiceCues)
  engine.setVoiceCount(getState().voiceCount)
  document.documentElement.dataset.theme = getState().themeId

  const router = createRouter()

  const headerSlot = h('div')
  const mainSlot = h('main', { className: 'screen' })
  const footerSlot = h('div')
  root.append(headerSlot, mainSlot, footerSlot)

  let routeKind: RouteKind = 'metronome'
  let titleFn: () => string = () => 'Metronom'
  let showBack = false
  let onBack: () => void = () => {}
  let screenCleanup: (() => void) | null = null

  function renderChrome() {
    const state = getState()
    mount(headerSlot, appHeader({ title: titleFn(), showBack, onBack }))
    mount(
      footerSlot,
      appFooter({
        bpm: state.bpm,
        isPlaying: engine.isPlaying,
        samplesLoaded: state.samplesLoaded,
        activeRoute: routeKind,
        onToggleTransport: () => (engine.isPlaying ? engine.stop() : void engine.start()),
        onNavigate: (route) =>
          router.navigate(route === 'metronome' ? '/metronome' : route === 'playlist' ? '/playlist' : '/settings'),
      })
    )
  }

  engine.onPlayingChange(renderChrome)
  subscribe(renderChrome)

  function setScreen(kind: RouteKind, title: () => string, opts: { showBack?: boolean; onBack?: () => void } = {}) {
    routeKind = kind
    titleFn = title
    showBack = !!opts.showBack
    onBack = opts.onBack ?? (() => {})
    renderChrome()
  }

  function mountScreen(fn: (container: HTMLElement) => () => void) {
    screenCleanup?.()
    screenCleanup = fn(mainSlot)
  }

  function loadSongIntoEngine(songId: number) {
    const song = getState().songs.find((s) => s.id === songId)
    if (!song) return
    patchState({ currentSongId: songId, bpm: song.bpm })
    engine.setSong(song)
    engine.setBpm(song.bpm)
  }

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
