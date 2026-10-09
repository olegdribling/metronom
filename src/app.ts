// Корень приложения: роутер + общий хедер/футер + переключение экранов.
// Один audioEngine на всё приложение — экраны только читают/дёргают его.
import { h } from './dom.ts'
import { createRouter } from './router.ts'
import { createAudioEngine } from './engine/audioEngine.ts'
import { appHeader } from './components/appHeader.ts'
import { iconButton } from './components/button.ts'
import { lockButton } from './components/lockButton.ts'
import { askLeave } from './components/leaveDialog.ts'
import { appFooter, RouteKind } from './components/appFooter.ts'
import {
  getState,
  patchState,
  retrySync,
  setUserLibrary,
  clearUserLibrary,
  subscribe,
  commitDraft,
  discardDraft,
  draftDirty,
  resetPageEditing,
  setUnlocked,
  type AppState,
} from './state/appState.ts'
import { onUserChange } from './data/auth.ts'
import { engineSettingsFor, sameSource, songForEngine, type EngineSettings } from './data/engineSettings.ts'
import { mountMetronomeScreen } from './screens/metronomeScreen.ts'
import { mountPlaylistScreen } from './screens/playlistScreen.ts'
import { mountSongScreen } from './screens/songScreen.ts'
import { mountSettingsScreen } from './screens/settingsScreen.ts'
import { mountBeatsScreen } from './screens/beatsScreen.ts'
import { mountConcertScreen } from './screens/concertScreen.ts'
import { libraryBeatTarget, metronomePatternTarget, mountBeatEditorScreen, songPatternTarget } from './screens/beatEditorScreen.ts'
import { Beat, PlaybackSource, Song } from './types.ts'

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
    (!!a && !!b && 'beat' in a && 'beat' in b && a.beat === b.beat && a.speed === b.speed)

  // Играют несохранённые правки (state.draft): их и слушают, пока правят.
  // Списки с правкой — те же объекты, пока не изменились ни правка, ни
  // сохранённое (sameContent сравнивает ссылки).
  let draftLists: { draft: AppState['draft']; songs: Song[]; beats: Beat[]; out: { songs: Song[]; beats: Beat[] } } | null = null
  function withDraft(state: AppState): { songs: Song[]; beats: Beat[] } {
    const d = state.draft
    if (!d) return state
    if (draftLists?.draft !== d || draftLists.songs !== state.songs || draftLists.beats !== state.beats) {
      draftLists = {
        draft: d,
        songs: state.songs,
        beats: state.beats,
        out: {
          songs: d.kind === 'song' ? state.songs.map((s) => (s.id === d.song.id ? d.song : s)) : state.songs,
          beats: d.kind === 'beat' ? state.beats.map((b) => (b.id === d.beat.id ? d.beat : b)) : state.beats,
        },
      }
    }
    return draftLists.out
  }

  function syncEngine() {
    const state = getState()
    const settings = engineSettingsFor(activeSource, { ...state, ...withDraft(state) })
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

  // Звук страницы: свой — он становится источником (другой звук, если играл,
  // останавливается); без звука (списки, настройки) — играющее доигрывает.
  // «Концерт» меняет его сам, не уходя со страницы, — выбрали другую песню.
  function setPageSource(source: PlaybackSource | null) {
    pageSource = source
    if (source && !sameSource(source, activeSource)) {
      if (engine.isPlaying) engine.stop()
      activeSource = source
      engineContent = undefined
    }
    syncEngine()
  }

  // Страница открылась: правок нет, замок закрыт, звук — её.
  function enterPage(source: PlaybackSource | null) {
    resetPageEditing()
    setPageSource(source)
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
  // Справа в шапке: замок (lock) и дискета (save — сохранить правки
  // страницы; неактивна, когда сохранять нечего).
  let lock = false
  let save: { onClick: () => void; enabled: () => boolean } | undefined
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
    const canSave = !!save?.enabled()
    const key = [routeKind, title, engine.isPlaying, canPlay, state.connectionError, state.unlocked, canSave].join('|')
    if (!force && key === chromeKey) return
    chromeKey = key

    const actions = [
      lock ? lockButton({ unlocked: state.unlocked, onUnlock: () => setUnlocked(true), onLock: () => setUnlocked(false) }) : null,
      save ? iconButton('floppy-disk', { ariaLabel: 'Сохранить', disabled: !canSave, onClick: save.onClick }) : null,
    ].filter((el): el is HTMLButtonElement => !!el)
    const newHeader = appHeader({ title, showBack, onBack, actions, centerTitle })
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
    opts: {
      showBack?: boolean
      onBack?: () => void
      lock?: boolean
      save?: { onClick: () => void; enabled: () => boolean }
      centerTitle?: boolean
      /** Без шапки и футера («Концерт»): они остаются в DOM, только скрыты. */
      fullscreen?: boolean
    } = {}
  ) {
    root.classList.toggle('app--fullscreen', !!opts.fullscreen)
    routeKind = kind
    titleFn = title
    showBack = !!opts.showBack
    onBack = opts.onBack ?? (() => {})
    lock = !!opts.lock
    save = opts.save
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
    mountScreen((c) => mountMetronomeScreen(c, engine, () => router.navigate('/metronome/pattern')))
  })

  // Свой паттерн метронома — в том же редакторе бита; играет он, по кругу,
  // клетка — точка в темпе метронома. Имени и дискеты нет.
  router.on('/metronome/pattern', () => {
    enterPage({ kind: 'metronomePattern' })
    setScreen('metronome', () => 'Свой паттерн', { showBack: true, onBack: () => router.navigate('/metronome'), centerTitle: true })
    mountScreen((c) => mountBeatEditorScreen(c, metronomePatternTarget(), engine, null))
  })

  router.on('/playlist', () => {
    enterPage(null)
    setScreen('playlist', () => 'Плейлист', { lock: true })
    mountScreen((c) =>
      mountPlaylistScreen(c, {
        onOpenSong: (songId) => router.navigate(`/song/${songId}`),
        onOpenConcert: () => router.navigate('/concert'),
      })
    )
  })

  // «Концерт» — песни открытого плейлиста для сцены, на весь экран (решение
  // пользователя). Песню, на которой остановились, помним, пока приложение
  // открыто: вышли и вернулись в тот же плейлист — она же.
  let concertSong: { playlistId: string; songId: number } | null = null
  router.on('/concert', () => {
    const playlistId = getState().playlistId
    const remembered = concertSong && concertSong.playlistId === playlistId ? concertSong.songId : null
    enterPage(remembered !== null ? { kind: 'concert', songId: remembered } : null)
    setScreen('playlist', () => 'Концерт', { fullscreen: true })
    mountScreen((c) =>
      mountConcertScreen(c, engine, {
        initialSongId: remembered,
        onSelectSong: (songId) => {
          const current = getState().playlistId
          if (current) concertSong = { playlistId: current, songId }
          setPageSource({ kind: 'concert', songId })
        },
        onExit: () => router.navigate('/playlist'),
      })
    )
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
      lock: true,
      save: { onClick: commitDraft, enabled: draftDirty },
    })
    mountScreen((c) =>
      mountSongScreen(c, songId, engine, {
        onOpenPattern: () => router.navigate(`/song/${songId}/pattern`),
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
    // Паттерн песни — в том же редакторе, что биты; играет только он, по
    // кругу, в темпе песни. Имени нет; правки — только дискетой, замка нет
    // (решение пользователя).
    enterPage({ kind: 'songPattern', songId })
    setScreen('playlist', () => 'Паттерн', {
      showBack: true,
      onBack: () => router.navigate(`/song/${songId}`),
      save: { onClick: commitDraft, enabled: draftDirty },
      centerTitle: true,
    })
    mountScreen((c) => mountBeatEditorScreen(c, songPatternTarget(songId), engine, null))
  })

  router.on('/beats', () => {
    enterPage(null)
    setScreen('beats', () => 'Биты', { lock: true })
    mountScreen((c) => mountBeatsScreen(c, (beatId) => router.navigate(`/beats/${encodeURIComponent(beatId)}`)))
  })

  router.on('/beats/:id', (params) => {
    const beatId = params.id
    // Иконка "дискета" в шапке дёргает openSaveDialog внутри уже
    // смонтированного экрана — экран сам регистрирует свою функцию через
    // onRegisterSave при монтировании (mountScreen ниже выполняется сразу
    // после setScreen, до первого возможного клика по иконке). Дискета
    // здесь ещё и переименовывает — поэтому активна и без правок, если
    // замок открыт.
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
      lock: true,
      save: { onClick: () => requestSave(), enabled: () => draftDirty() || getState().unlocked },
      centerTitle: true,
    })
    mountScreen((c) =>
      mountBeatEditorScreen(c, libraryBeatTarget(beatId), engine, {
        onDone: leave,
        onRegisterSave: (fn) => {
          requestSave = fn
        },
      })
    )
  })

  router.on('/settings', () => {
    enterPage(null)
    setScreen('settings', () => 'Настройки')
    mountScreen(mountSettingsScreen)
  })

  router.notFoundHandler(() => router.navigate('/metronome'))

  // Уходят со страницы с несохранёнными правками — спросить (решение
  // пользователя): «Сохранить» — в аккаунт и уйти, «Не сохранять» —
  // выбросить и уйти, «Остаться» — никуда не уходить.
  let asking = false
  router.setGuard((proceed) => {
    if (!draftDirty()) return false
    if (asking) return true
    asking = true
    void askLeave().then((choice) => {
      asking = false
      if (choice === 'stay') return
      if (choice === 'save') commitDraft()
      else discardDraft()
      proceed()
    })
    return true
  })
  // Закрывают вкладку или приложение — тут браузер спрашивает сам, своим окном.
  window.addEventListener('beforeunload', (e) => {
    if (draftDirty()) e.preventDefault()
  })

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
