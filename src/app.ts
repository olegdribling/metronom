// Корень приложения: роутер + общий хедер/футер + переключение экранов.
// Один audioEngine на всё приложение — экраны только читают/дёргают его.
import { h } from './dom.ts'
import { createRouter } from './router.ts'
import { createAudioEngine } from './engine/audioEngine.ts'
import { appHeader, HeaderRightAction } from './components/appHeader.ts'
import { appFooter, RouteKind } from './components/appFooter.ts'
import { getState, patchState, retrySync, setUserLibrary, clearUserLibrary, subscribe } from './state/appState.ts'
import { onUserChange } from './data/auth.ts'
import { engineSettingsFor, sameSource, songForEngine, type EngineSettings } from './data/engineSettings.ts'
import { mountMetronomeScreen } from './screens/metronomeScreen.ts'
import { mountPlaylistScreen } from './screens/playlistScreen.ts'
import { mountSongScreen } from './screens/songScreen.ts'
import { mountPatternScreen } from './screens/patternScreen.ts'
import { mountSettingsScreen } from './screens/settingsScreen.ts'
import { mountBeatsScreen } from './screens/beatsScreen.ts'
import { mountBeatEditorScreen } from './screens/beatEditorScreen.ts'
import { PlaybackSource } from './types.ts'

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

  // --- что играет движок ---
  // У каждой страницы свой звук и свои настройки, друг на друга они не
  // влияют (решение пользователя): метроном — свои темп/размер/голос
  // (state.metronome), песня и её паттерн — песня со своими, редактор бита —
  // бит со своим темпом (data/engineSettings.ts). У списков и настроек звука
  // нет: Play там неактивен, а то, что уже играет, доигрывает.
  // Перешли на страницу с другим звуком — игра останавливается.
  //
  // Движок догоняет состояние здесь, на каждое изменение: песню и биты
  // правят после открытия (в том числе снимки Firestore после обновления
  // страницы). Песне уходит копия с подставленными паттернами битов секций
  // (songForEngine) — пересобирается, когда меняется песня или биты (правка
  // бита сразу слышна в песне). Каждое сохранение — новый объект, поэтому
  // «изменилась» = другая ссылка.
  let pageSource: PlaybackSource | null = { kind: 'metronome' }
  let activeSource: PlaybackSource = { kind: 'metronome' }
  // Содержимое, уже отданное движку (undefined — ещё ничего).
  let engineContent: EngineSettings['content'] | undefined
  let sourceReady = true

  const sameContent = (a: EngineSettings['content'] | undefined, b: EngineSettings['content']) =>
    a === b ||
    (!!a && !!b && 'song' in a && 'song' in b && a.song === b.song && a.beats === b.beats) ||
    (!!a && !!b && 'beat' in a && 'beat' in b && a.beat === b.beat)

  function syncEngine() {
    const state = getState()
    const settings = engineSettingsFor(activeSource, state)
    sourceReady = !!settings
    if (!settings) {
      // Песни или бита нет: ещё не пришли из БД — или удалили, пока играли.
      if (engine.isPlaying) engine.stop()
      if (engineContent !== null) engine.setSong(null)
      engineContent = null
      return
    }
    engine.setVoiceCues(settings.voiceCues)
    engine.setVoiceCount(settings.voiceCount)
    if (engine.bpm !== settings.bpm) engine.setBpm(settings.bpm)
    if (engine.beatsPerBar !== settings.beatsPerBar) engine.setBeatsPerBar(settings.beatsPerBar)
    if (engine.beatDivision !== settings.beatDivision) engine.setBeatDivision(settings.beatDivision)
    if (sameContent(engineContent, settings.content)) return
    engineContent = settings.content
    engine.setSong(songForEngine(settings.content))
  }

  // Страница открылась: со своим звуком — он становится источником (другой
  // звук, если играл, останавливается); без звука (списки, настройки) —
  // играющее доигрывает.
  function enterPage(source: PlaybackSource | null) {
    pageSource = source
    if (source && !sameSource(source, activeSource)) {
      if (engine.isPlaying) engine.stop()
      activeSource = source
      engineContent = undefined
    }
    syncEngine()
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
    // Play — только на странице со своим звуком, когда ему есть что играть;
    // Стоп — всегда.
    const canPlay = !!pageSource && sourceReady && engine.canStart
    const key = [routeKind, title, engine.isPlaying, canPlay, state.connectionError].join('|')
    if (!force && key === chromeKey) return
    chromeKey = key

    const newHeader = appHeader({ title, showBack, onBack, rightAction, centerTitle })
    headerEl.replaceWith(newHeader)
    headerEl = newHeader

    const newFooter = appFooter({
      isPlaying: engine.isPlaying,
      canStart: canPlay,
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

  router.on('/metronome', () => {
    enterPage({ kind: 'metronome' })
    setScreen('metronome', () => 'Metronom')
    mountScreen((c) => mountMetronomeScreen(c, engine))
  })

  router.on('/playlist', () => {
    enterPage(null)
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
    enterPage({ kind: 'song', songId })
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
    // Паттерн — часть песни: играет та же песня, переход игру не прерывает.
    enterPage({ kind: 'song', songId })
    setScreen('playlist', () => 'Паттерн', { showBack: true, onBack: () => router.navigate(`/song/${songId}`) })
    mountScreen((c) => mountPatternScreen(c, songId, engine))
  })

  router.on('/beats', () => {
    enterPage(null)
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
    enterPage({ kind: 'beat', beatId })
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
    enterPage(null)
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
