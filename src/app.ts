// Корень приложения: роутер + общий хедер/футер + переключение экранов.
// Один audioEngine на всё приложение — экраны только читают/дёргают его.
import { h } from './dom.ts'
import { createRouter } from './router.ts'
import { createAudioEngine } from './engine/audioEngine.ts'
import { appHeader, HeaderRightAction } from './components/appHeader.ts'
import { appFooter, RouteKind } from './components/appFooter.ts'
import { getState, subscribe, patchState, setUserLibrary, clearUserLibrary } from './state/appState.ts'
import { onUserChange } from './data/auth.ts'
import { openUserLibrary } from './data/userLibrary.ts'
import { resolveSongForEngine } from './data/resolveBeat.ts'
import { mountMetronomeScreen } from './screens/metronomeScreen.ts'
import { mountPlaylistScreen } from './screens/playlistScreen.ts'
import { mountSongScreen } from './screens/songScreen.ts'
import { mountPatternScreen } from './screens/patternScreen.ts'
import { mountSettingsScreen } from './screens/settingsScreen.ts'
import { mountBeatsScreen } from './screens/beatsScreen.ts'
import { mountBeatEditorScreen } from './screens/beatEditorScreen.ts'
import { Beat, Song } from './types.ts'

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

  // Песня, которую должен играть движок (engineSongId), и её версия, уже
  // отданная ему (engineSong). Движок получает песню только через setSong(),
  // а правят её после загрузки — секции (экран песни), паттерн (редактор
  // паттерна), снимки Firestore. Без пересинхронизации ниже движок играл
  // старую версию: новая песня с одной вводной «1 2 3 4» крутила только её,
  // хотя секции уже добавлены. Id отдельно от версии — чтобы песня дошла до
  // движка и тогда, когда /song/:id открыли раньше, чем песни пришли из БД
  // (обновили страницу на экране песни).
  // Секции ссылаются на биты библиотеки (beatId/fills), поэтому движку
  // отдаётся копия песни с подставленными паттернами битов
  // (resolveSongForEngine) — и пересобирается, когда меняются либо песня,
  // либо биты (правка бита в «Битах» сразу слышна в песне).
  let engineSongId: number | null = null
  let engineSong: Song | null = null
  let engineBeats: Beat[] | null = null

  function syncEngineSong() {
    if (engineSongId === null) return
    const state = getState()
    const fresh = state.songs.find((s) => s.id === engineSongId)
    if (!fresh || (fresh === engineSong && state.beats === engineBeats)) return
    const firstLoad = !engineSong
    // Сначала запомнить, что отдано движку, и только потом patchState: эта
    // функция сама подписчик состояния — иначе patchState вызвал бы её
    // снова с ещё пустым engineSong, и так до переполнения стека.
    engineSong = fresh
    engineBeats = state.beats
    engine.setSong(resolveSongForEngine(fresh, state.beats))
    // Темп — только при первой загрузке песни: дальше его меняют отдельно
    // (метроном/футер), правки песни его не перебивают.
    if (firstLoad) {
      engine.setBpm(fresh.bpm)
      patchState({ bpm: fresh.bpm })
    }
  }

  function loadSongIntoEngine(songId: number) {
    engineSongId = songId
    engineSong = null
    engineBeats = null
    patchState({ currentSongId: songId })
    syncEngineSong()
  }

  // Каждое сохранение песни — новый объект (saveSongs/снимок Firestore),
  // поэтому сравнение по ссылке и есть «песню изменили».
  subscribe(syncEngineSong)

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

  // «Редактировать» из выбора филла в песне: редактор бита открывается из
  // песни, и «назад»/сохранение возвращают в неё, к той же секции.
  let beatEditorReturn: { songId: number; section: number } | null = null
  let songFocus: { songId: number; section: number } | null = null

  router.on('/song/:id', (params) => {
    const songId = Number(params.id)
    const focusSection = songFocus?.songId === songId ? songFocus.section : null
    songFocus = null
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
        () => router.navigate('/playlist'),
        (beatId, section) => {
          beatEditorReturn = { songId, section }
          router.navigate(`/beats/${beatId}`)
        },
        focusSection
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
    engineSongId = null
    engineSong = null
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
      mountBeatEditorScreen(c, beatId, engine, leave, (fn) => { requestSave = fn })
    )
  })

  router.on('/settings', () => {
    setScreen('settings', () => 'Настройки')
    mountScreen(mountSettingsScreen)
  })

  router.notFoundHandler(() => router.navigate('/metronome'))

  // Песни, плейлисты и биты — в аккаунте (data/userLibrary.ts): вошёл —
  // открываем его библиотеку (последний плейлист откроется сам), вышел —
  // закрываем. Firebase помнит вход между запусками, так что при обычном
  // старте пользователь сразу видит своё.
  onUserChange((user) => {
    if (user) setUserLibrary(user, openUserLibrary(user.uid))
    else clearUserLibrary()
    patchState({ authReady: true })
  })

  // Остатки хранения до аккаунтов: биты в localStorage и список кодов
  // плейлистов. Данные были тестовые — по решению пользователя не переносим.
  localStorage.removeItem('metronom_beats')
  localStorage.removeItem('metronom_known_playlists')

  router.resolve()
}
