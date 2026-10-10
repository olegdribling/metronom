// «Концерт» — экран для сцены (решение пользователя): песни открытого
// плейлиста, крупно и контрастно, видно в темноте, ничего лишнего и никаких
// правок. Весь экран, без шапки и футера (app.ts), выход — долгим тапом.
//
// До Play: название, темп и вся структура песни; ← → — соседние песни,
// «Список» — все песни плейлиста. Play — 2 такта отсчёта и сразу первая
// настоящая секция (вступление «1 2 3 4» пропускается, concertStart в
// data/songs.ts). Во время игры: текущая секция крупно и жёлтым — название,
// комментарий, «Такт N / M», доли такта (под филлом — отметка); ниже —
// секции дальше; внизу — только Стоп. Песня доиграла — открыта следующая и
// ждёт Play. Голос смены секции здесь всегда включён (engineSettings.ts).
//
// Горячий путь — как на экране песни: такт и доли обновляются напрямую в
// DOM из engine.onPlaybackState; текущая секция и список перерисовываются
// только при смене секции. Каркас экрана постоянный: выход, Стоп и кнопки
// внизу не пересоздаются, пока не сменится то, что на них, — иначе нажатие,
// пришедшееся на перерисовку, терялось бы (палец опускался на старую
// кнопку, а отпускался уже на новой). Экран не гаснет, пока открыт (Screen
// Wake Lock).
import { h, mount } from '../dom.ts'
import { icon } from '../icons.ts'
import { onLongPress } from '../components/longPress.ts'
import { accountGate } from '../components/signInCard.ts'
import type { AudioEngine } from '../engine/audioEngine.ts'
import { getState, subscribe } from '../state/appState.ts'
import { concertStart, fillBeats, sectionAtBar } from '../data/songs.ts'
import { PlaybackState, Section, Song } from '../types.ts'

const COUNT_IN_BARS = 2

export interface ConcertScreenOptions {
  /** Песня, на которой остановились в прошлый раз (в этом плейлисте). */
  initialSongId: number | null
  /** Выбрана песня — она становится звуком страницы (app.ts). */
  onSelectSong(songId: number): void
  onExit(): void
}

/** Где песня во время игры: секция и такт в ней; отсчёт — перед первой
 * настоящей секцией. */
interface Position {
  sectionIndex: number
  barInSection: number
  /** Доля такта, с 1; 0 — Play нажат, первой доли ещё не было. */
  beat: number
  countIn: boolean
}

function barsLabel(n: number): string {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return `${n} такт`
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${n} такта`
  return `${n} тактов`
}

// Экран не гаснет, пока открыт «Концерт» (решение пользователя). Браузер
// отпускает блокировку, когда вкладку прячут, — вернулись, берём снова.
function keepScreenOn(): () => void {
  let sentinel: WakeLockSentinel | null = null
  let released = false
  const request = async () => {
    if (released || document.visibilityState !== 'visible' || !('wakeLock' in navigator)) return
    if (sentinel && !sentinel.released) return
    try {
      const next = await navigator.wakeLock.request('screen')
      if (released) void next.release()
      else sentinel = next
    } catch {
      // не дали (экономия энергии, старый браузер) — экран погаснет как обычно
    }
  }
  const onVisibility = () => void request()
  document.addEventListener('visibilitychange', onVisibility)
  void request()
  return () => {
    released = true
    document.removeEventListener('visibilitychange', onVisibility)
    void sentinel?.release()
    sentinel = null
  }
}

function controlButton(iconName: string, onClick: () => void, flags: { main?: boolean; disabled?: boolean } = {}): HTMLButtonElement {
  return h(
    'button',
    {
      type: 'button',
      className: `concert__btn${flags.main ? ' concert__btn--main' : ''}`,
      disabled: !!flags.disabled,
      onClick: flags.disabled ? undefined : onClick,
    },
    icon(iconName)
  )
}

export function mountConcertScreen(container: HTMLElement, engine: AudioEngine, opts: ConcertScreenOptions): () => void {
  let songId = opts.initialSongId
  let reportedSongId: number | null = null
  let choosing = false
  // Play нажат, а первой доли ещё не было — до неё у движка позиция «такт 0»,
  // это не вступление.
  let pendingStart = false
  // Стоп нажали здесь: песня остановлена, а не доиграла (доиграла — открыть
  // следующую).
  let stoppedHere = false
  let wasPlaying = engine.isPlaying
  // Что сейчас на экране во время игры — сменилась секция (или кончился
  // отсчёт) — перерисовать.
  let shownKey = ''
  // Живые элементы текущей секции — горячий путь.
  let barEl: HTMLElement | null = null
  let beatEls: HTMLElement[] = []
  let currentFills = new Set<number>()

  const songs = () => getState().songs

  function currentSong(): Song | undefined {
    return songs().find((s) => s.id === songId) ?? songs()[0]
  }

  const indexOfCurrent = () => songs().findIndex((s) => s.id === currentSong()?.id)

  // Выбранная песня — звук страницы. Удалили (с другого устройства) —
  // первая в плейлисте.
  function syncSelection() {
    const song = currentSong()
    if (!song || song.id === reportedSongId) return
    songId = reportedSongId = song.id
    opts.onSelectSong(song.id)
  }

  function selectIndex(index: number) {
    const song = songs()[index]
    if (!song) return
    songId = song.id
    choosing = false
    syncSelection()
    render()
  }

  function play() {
    const song = currentSong()
    if (!song) return
    pendingStart = true
    void engine.start({ fromBar: concertStart(song).fromBar, countInBars: COUNT_IN_BARS }).then(render)
  }

  function stop() {
    stoppedHere = true
    engine.stop()
  }

  function positionOf(song: Song, playback: PlaybackState): Position | null {
    const first = concertStart(song).sectionIndex
    if (pendingStart) return { sectionIndex: first, barInSection: 0, beat: 0, countIn: true }
    if (playback.bar < 0) return { sectionIndex: first, barInSection: 0, beat: playback.beat, countIn: true }
    const at = sectionAtBar(song, playback.bar)
    return at ? { ...at, beat: playback.beat, countIn: false } : null
  }

  // --- постоянный каркас ---
  const exitEl = h('button', { type: 'button', className: 'concert__exit' }, icon('x'))
  onLongPress(exitEl, opts.onExit)
  const stopEl = controlButton('stop', stop, { main: true })
  const topRestEl = h('div', { className: 'concert__top-rest' })
  const mainEl = h('div', { className: 'concert__main' })
  const listEl = h('div', { className: 'concert__list' })
  const controlsEl = h('div', { className: 'concert__controls' })
  const frame = h('div', { className: 'concert' }, h('div', { className: 'concert__top' }, exitEl, topRestEl), mainEl, listEl, controlsEl)
  // Что сейчас в верхней строке, внизу и в списке: меняется — пересобрать
  // (список ещё и прокрутить к началу).
  let topKey: string | null = null
  let controlsKey: string | null = null
  let listKey: string | null = null

  function setTop(key: string, ...children: (HTMLElement | null)[]) {
    if (key === topKey) return
    topKey = key
    mount(topRestEl, ...children)
  }
  function setControls(key: string, build: () => HTMLElement[]) {
    if (key === controlsKey) return
    controlsKey = key
    mount(controlsEl, ...build())
  }
  function setList(key: string, ...children: HTMLElement[]) {
    mount(listEl, ...children)
    if (key !== listKey) listEl.scrollTop = 0
    listKey = key
  }

  // --- части экрана ---

  function sectionRow(sec: Section): HTMLElement {
    return h(
      'div',
      { className: 'concert__row' },
      h(
        'div',
        { className: 'concert__row-head' },
        h('span', { className: 'concert__row-name' }, sec.name),
        h('span', { className: 'concert__row-bars' }, barsLabel(sec.bars))
      ),
      sec.comment ? h('div', { className: 'concert__row-comment' }, sec.comment) : null
    )
  }

  function currentCard(song: Song, pos: Position): HTMLElement {
    const sec = song.sections[pos.sectionIndex]
    currentFills = pos.countIn ? new Set() : fillBeats(sec, song.beatsPerBar)
    barEl = h('div', { className: 'concert__bar' })
    beatEls = Array.from({ length: song.beatsPerBar }, () => h('div', { className: 'concert__beat' }))
    const beats = h('div', { className: 'concert__beats' }, ...beatEls)
    beats.style.setProperty('--concert-beats', String(song.beatsPerBar))
    return h(
      'div',
      { className: 'concert__current' },
      h('div', { className: 'concert__section-name' }, sec.name),
      sec.comment ? h('div', { className: 'concert__comment' }, sec.comment) : null,
      barEl,
      beats
    )
  }

  // Такт и доли — напрямую в DOM, без перерисовки экрана.
  function showLive(song: Song, pos: Position) {
    if (barEl) barEl.textContent = pos.countIn ? 'Отсчёт' : `Такт ${pos.barInSection} / ${song.sections[pos.sectionIndex].bars}`
    beatEls.forEach((el, i) => {
      el.classList.toggle('concert__beat--passed', i < pos.beat - 1)
      el.classList.toggle('concert__beat--current', i === pos.beat - 1)
      el.classList.toggle('concert__beat--fill', !pos.countIn && currentFills.has((pos.barInSection - 1) * song.beatsPerBar + i))
    })
  }

  function listButton(): HTMLElement {
    return h(
      'button',
      {
        type: 'button',
        className: `concert__btn concert__btn--small${choosing ? ' concert__btn--on' : ''}`,
        onClick: () => {
          choosing = !choosing
          render()
          if (choosing) listEl.querySelector('.concert__song-row--current')?.scrollIntoView({ block: 'center' })
        },
      },
      icon('list'),
      'Список'
    )
  }

  function songRow(s: Song, index: number, current: Song): HTMLElement {
    return h(
      'button',
      { type: 'button', className: `concert__song-row${s.id === current.id ? ' concert__song-row--current' : ''}`, onClick: () => selectIndex(index) },
      h('span', { className: 'concert__song-row-name' }, s.name),
      h('span', { className: 'concert__song-row-bpm' }, `${s.bpm} BPM`)
    )
  }

  // Песни нет (не вошли, плейлист не открыт, ещё грузится, пусто) — только
  // выход и что случилось.
  function renderMessage(content: HTMLElement) {
    frame.className = 'concert'
    setTop('message')
    mount(mainEl, content)
    setList('message')
    setControls('message', () => [])
  }

  function render() {
    if (!frame.isConnected) mount(container, frame)
    barEl = null
    beatEls = []
    shownKey = ''
    const gate = accountGate('Войдите — песни и плейлисты хранятся в вашем аккаунте и видны на любом устройстве.')
    if (gate) return renderMessage(gate)
    const state = getState()
    if (!state.playlistId) return renderMessage(h('p', { className: 'concert__message' }, 'Откройте плейлист — в «Концерте» его песни.'))
    const song = currentSong()
    if (!song) return renderMessage(h('p', { className: 'concert__message' }, state.songsLoaded ? 'В плейлисте нет песен.' : 'Загрузка…'))

    const playing = engine.isPlaying
    if (playing) choosing = false
    frame.className = `concert${choosing ? ' concert--choosing' : ''}`
    if (playing) setTop(`playing|${song.name}`, h('div', { className: 'concert__top-title' }, song.name))
    else setTop(`idle|${choosing}`, listButton())

    if (choosing) {
      mount(mainEl)
      setList('songs', ...songs().map((s, i) => songRow(s, i, song)))
      setControls('choosing', () => [])
      return
    }

    if (!playing) {
      const index = indexOfCurrent()
      const last = songs().length - 1
      mount(
        mainEl,
        h('h1', { className: 'concert__song' }, song.name),
        h('div', { className: 'concert__tempo' }, `${song.bpm} BPM · ${song.beatsPerBar}/${song.beatDivision}`)
      )
      setList(`structure|${song.id}`, ...song.sections.slice(concertStart(song).sectionIndex).map(sectionRow))
      setControls(`idle|${index}|${last}|${engine.canStart}`, () => [
        controlButton('caret-left', () => selectIndex(index - 1), { disabled: index <= 0 }),
        controlButton('play', play, { main: true, disabled: !engine.canStart }),
        controlButton('caret-right', () => selectIndex(index + 1), { disabled: index >= last }),
      ])
      return
    }

    const pos = positionOf(song, engine.playbackState)
    if (!pos) return
    mount(mainEl, currentCard(song, pos))
    setList(`next|${song.id}|${pos.sectionIndex}|${pos.countIn}`, ...song.sections.slice(pos.sectionIndex + 1).map(sectionRow))
    setControls('playing', () => [stopEl])
    shownKey = `${pos.sectionIndex}|${pos.countIn}`
    showLive(song, pos)
  }

  const releasePlayback = engine.onPlaybackState((playback) => {
    if (engine.isPlaying) pendingStart = false
    if (engine.isPlaying !== wasPlaying) {
      // Остановилась не нашей кнопкой — песня доиграла: следующая готова.
      const ended = wasPlaying && !stoppedHere
      wasPlaying = engine.isPlaying
      stoppedHere = false
      if (ended) {
        const index = indexOfCurrent()
        if (index >= 0 && index < songs().length - 1) {
          songId = songs()[index + 1].id
          syncSelection()
        }
      }
      render()
      return
    }
    if (!engine.isPlaying) return
    const song = currentSong()
    const pos = song ? positionOf(song, playback) : null
    if (!song || !pos) return
    if (`${pos.sectionIndex}|${pos.countIn}` !== shownKey) render()
    else showLive(song, pos)
  })

  const releaseWakeLock = keepScreenOn()
  const unsubscribe = subscribe(() => {
    syncSelection()
    render()
  })
  syncSelection()
  render()
  return () => {
    unsubscribe()
    releasePlayback()
    releaseWakeLock()
  }
}
