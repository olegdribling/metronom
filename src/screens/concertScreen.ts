// «Концерт» — экран для сцены (решение пользователя): песни открытого
// плейлиста, крупно и контрастно, видно в темноте, ничего лишнего и никаких
// правок. Весь экран, без шапки и футера (app.ts), выход — долгим тапом.
//
// До Play: название, темп и вся структура песни; ← → — соседние песни,
// «Список» — все песни плейлиста. Play — отсчёт и песня с начала (playSong в
// data/engineSettings.ts — как Play и ▶ на экране песни); песня без секций —
// просто щелчок в её темпе до Стоп, на экране название и темп (решение
// пользователя). Во время игры: текущая секция крупно и
// жёлтым — название, комментарий, «Такт N / M» и все её доли квадратиками
// (прошедшие серые, текущая жёлтая, под филлом — отметка; строка — как на
// экране песни); ниже —
// следующая секция тоже с квадратиками и остальные секции текстом (решение
// пользователя); внизу — только Стоп. Песня доиграла — открыта следующая и
// ждёт Play. Голос смены секции здесь всегда включён (engineSettings.ts).
//
// Горячий путь — как на экране песни: такт и доли обновляются напрямую в
// DOM из engine.onPlaybackState; текущая секция и список перерисовываются
// только при смене секции. Каркас экрана постоянный: выход, Стоп и кнопки
// внизу не пересоздаются, пока не сменится то, что на них, — иначе нажатие,
// пришедшееся на перерисовку, терялось бы (палец опускался на старую
// кнопку, а отпускался уже на новой). Экран не гаснет, пока открыт (Screen
// Wake Lock).
//
// Временное решение (пользователя): в «Списке» у каждой песни ▶ — играет
// метроном как есть (щелчок или свой паттерн, размер, голос), только в
// темпе песни, без отсчёта (источник songClick, app.ts); ■ — стоп, ▶ другой
// — переключиться; список остаётся. Это не игра песни: экран её не
// показывает и по остановке следующую не открывает. Закрыли список,
// выбрали песню или вышли из «Концерта» — щелчок останавливается.
import { h, mount } from '../dom.ts'
import { icon } from '../icons.ts'
import { onLongPress } from '../components/longPress.ts'
import { accountGate } from '../components/signInCard.ts'
import type { AudioEngine } from '../engine/audioEngine.ts'
import { getState, subscribe } from '../state/appState.ts'
import { barGridColumns, fillBeats, sectionAtBar, sectionBeatCount } from '../data/songs.ts'
import { clickNeedsSamples, playSong } from '../data/engineSettings.ts'
import { PlaybackState, Section, Song } from '../types.ts'

export interface ConcertScreenOptions {
  /** Песня, на которой остановились в прошлый раз (в этом плейлисте). */
  initialSongId: number | null
  /** Выбрана песня — она становится звуком страницы (app.ts). */
  onSelectSong(songId: number): void
  /** Песня, чей щелчок (▶ в списке) сейчас играет; null — не играет. */
  playingClick(): number | null
  /** ▶/■ у песни в списке: щелчок метронома в её темпе. */
  onToggleClick(songId: number): Promise<void>
  onStopClick(): void
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
  // Играет песня, а не щелчок из списка.
  const songPlaying = () => engine.isPlaying && opts.playingClick() === null
  let wasPlaying = songPlaying()
  // Что сейчас на экране во время игры — сменилась секция (или кончился
  // отсчёт) — перерисовать.
  let shownKey = ''
  // Живые элементы текущей секции — горячий путь.
  let barEl: HTMLElement | null = null
  let beatsEl: HTMLElement | null = null
  let beatEls: HTMLElement[] = []
  let shownBeat = -1

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
    opts.onStopClick()
    songId = song.id
    choosing = false
    syncSelection()
    render()
  }

  function play() {
    if (!currentSong()) return
    pendingStart = true
    void playSong(engine).then(render)
  }

  function stop() {
    stoppedHere = true
    engine.stop()
  }

  // В отсчёте текущая — первая секция (она следующая по счёту).
  function positionOf(song: Song, playback: PlaybackState): Position | null {
    if (!song.sections.length) return null
    if (pendingStart) return { sectionIndex: 0, barInSection: 0, beat: 0, countIn: true }
    if (playback.bar < 0) return { sectionIndex: 0, barInSection: 0, beat: playback.beat, countIn: true }
    const at = sectionAtBar(song, playback.bar)
    return at ? { ...at, beat: playback.beat, countIn: false } : null
  }

  // --- постоянный каркас ---
  const exitEl = h('button', { type: 'button', className: 'concert__exit' }, icon('x'))
  // Вышли — щелчок из списка останавливается (решение пользователя).
  onLongPress(exitEl, () => {
    opts.onStopClick()
    opts.onExit()
  })
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

  // Все доли секции квадратиками — по строкам, как на экране песни (целыми
  // тактами, до 8 в строке): первая доля такта отмечена, доли под филлом —
  // отметка снизу (как играет движок, fillBeats).
  function sectionBeats(song: Song, sec: Section): { el: HTMLElement; cells: HTMLElement[] } {
    const fills = fillBeats(sec, song.beatsPerBar)
    const cells = Array.from({ length: sectionBeatCount(sec, song.beatsPerBar) }, (_, i) =>
      h('div', {
        className:
          'concert__beat' + (i % song.beatsPerBar === 0 ? ' concert__beat--bar-start' : '') + (fills.has(i) ? ' concert__beat--fill' : ''),
      })
    )
    const el = h('div', { className: 'concert__beats' }, ...cells)
    el.style.setProperty('--concert-beats', String(barGridColumns(song.beatsPerBar)))
    return { el, cells }
  }

  // Секция в списке: вся структура до Play, дальше — во время игры;
  // следующая за текущей — ещё и с квадратиками (withBeats).
  function sectionRow(song: Song, sec: Section, withBeats = false): HTMLElement {
    return h(
      'div',
      { className: 'concert__row' },
      h(
        'div',
        { className: 'concert__row-head' },
        h('span', { className: 'concert__row-name' }, sec.name),
        h('span', { className: 'concert__row-bars' }, barsLabel(sec.bars))
      ),
      sec.comment ? h('div', { className: 'concert__row-comment' }, sec.comment) : null,
      withBeats ? sectionBeats(song, sec).el : null
    )
  }

  function currentCard(song: Song, pos: Position): HTMLElement {
    const sec = song.sections[pos.sectionIndex]
    barEl = h('div', { className: 'concert__bar' })
    const beats = sectionBeats(song, sec)
    beatsEl = beats.el
    beatEls = beats.cells
    shownBeat = -1
    return h(
      'div',
      { className: 'concert__current' },
      h('div', { className: 'concert__section-name' }, sec.name),
      sec.comment ? h('div', { className: 'concert__comment' }, sec.comment) : null,
      barEl,
      beats.el
    )
  }

  // Такт и доли — напрямую в DOM, без перерисовки экрана. В отсчёте доли
  // секции ещё не идут — в подписи номер доли отсчёта.
  function showLive(song: Song, pos: Position) {
    if (barEl) {
      barEl.textContent = pos.countIn
        ? pos.beat > 0 ? `Отсчёт ${pos.beat}` : 'Отсчёт'
        : `Такт ${pos.barInSection} / ${song.sections[pos.sectionIndex].bars}`
    }
    const current = pos.countIn ? -1 : (pos.barInSection - 1) * song.beatsPerBar + pos.beat - 1
    if (current === shownBeat) return
    shownBeat = current
    beatEls.forEach((el, i) => {
      el.classList.toggle('concert__beat--passed', current >= 0 && i < current)
      el.classList.toggle('concert__beat--current', i === current)
    })
    if (current >= 0) revealBeat(beatEls[current])
  }

  // Длинная секция не влезла (телефон боком) — квадратики прокручиваются
  // (components.css), и текущая доля всё равно видна: они доезжают до неё.
  function revealBeat(el: HTMLElement | undefined) {
    if (!el || !beatsEl) return
    const area = beatsEl.getBoundingClientRect()
    const box = el.getBoundingClientRect()
    if (box.bottom > area.bottom) beatsEl.scrollTop += box.bottom - area.bottom
    else if (box.top < area.top) beatsEl.scrollTop -= area.top - box.top
  }

  function listButton(): HTMLElement {
    return h(
      'button',
      {
        type: 'button',
        className: `concert__btn concert__btn--small${choosing ? ' concert__btn--on' : ''}`,
        onClick: () => {
          choosing = !choosing
          if (!choosing) opts.onStopClick()
          render()
          if (choosing) listEl.querySelector('.concert__song-item--current')?.scrollIntoView({ block: 'center' })
        },
      },
      icon('list'),
      'Список'
    )
  }

  // Строка песни: тап — выбрать её; под названием — комментарий к песне;
  // ▶ справа — щелчок метронома в её темпе.
  function songRow(s: Song, index: number, current: Song): HTMLElement {
    const clicking = opts.playingClick() === s.id
    const state = getState()
    return h(
      'div',
      { className: `concert__song-item${s.id === current.id ? ' concert__song-item--current' : ''}` },
      h(
        'button',
        { type: 'button', className: 'concert__song-row', onClick: () => selectIndex(index) },
        h(
          'span',
          { className: 'concert__song-row-main' },
          h('span', { className: 'concert__song-row-name' }, s.name),
          s.comment ? h('span', { className: 'concert__song-row-comment' }, s.comment) : null
        ),
        h('span', { className: 'concert__song-row-bpm' }, `${s.bpm} BPM`)
      ),
      h(
        'button',
        {
          type: 'button',
          className: `concert__btn concert__song-play${clicking ? ' concert__btn--main' : ''}`,
          disabled: clickNeedsSamples(state.metronome, state.metronomePattern) && !state.samplesLoaded,
          onClick: () => void opts.onToggleClick(s.id).then(render),
        },
        icon(clicking ? 'stop' : 'play')
      )
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
    beatsEl = null
    beatEls = []
    shownKey = ''
    const gate = accountGate('Войдите — песни и плейлисты хранятся в вашем аккаунте и видны на любом устройстве.')
    if (gate) return renderMessage(gate)
    const state = getState()
    if (!state.playlistId) return renderMessage(h('p', { className: 'concert__message' }, 'Откройте плейлист — в «Концерте» его песни.'))
    const song = currentSong()
    if (!song) return renderMessage(h('p', { className: 'concert__message' }, state.songsLoaded ? 'В плейлисте нет песен.' : 'Загрузка…'))

    const playing = songPlaying()
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

    const songHead = () => [
      h('h1', { className: 'concert__song' }, song.name),
      h('div', { className: 'concert__tempo' }, `${song.bpm} BPM · ${song.beatsPerBar}/${song.beatDivision}`),
    ]

    if (!playing) {
      const index = indexOfCurrent()
      const last = songs().length - 1
      mount(mainEl, ...songHead())
      setList(`structure|${song.id}`, ...song.sections.map((sec) => sectionRow(song, sec)))
      setControls(`idle|${index}|${last}|${engine.canStart}`, () => [
        controlButton('caret-left', () => selectIndex(index - 1), { disabled: index <= 0 }),
        controlButton('play', play, { main: true, disabled: !engine.canStart }),
        controlButton('caret-right', () => selectIndex(index + 1), { disabled: index >= last }),
      ])
      return
    }

    // Песня без секций играет щелчок в своём темпе, пока не нажмут Стоп, — на
    // экране название и темп.
    if (!song.sections.length) {
      mount(mainEl, ...songHead())
      setList(`empty|${song.id}`)
      setControls('playing', () => [stopEl])
      return
    }

    const pos = positionOf(song, engine.playbackState)
    if (!pos) return
    mount(mainEl, currentCard(song, pos))
    setList(
      `next|${song.id}|${pos.sectionIndex}|${pos.countIn}`,
      ...song.sections.slice(pos.sectionIndex + 1).map((sec, i) => sectionRow(song, sec, i === 0))
    )
    setControls('playing', () => [stopEl])
    shownKey = `${pos.sectionIndex}|${pos.countIn}`
    showLive(song, pos)
  }

  let wasClicking = opts.playingClick()
  const releasePlayback = engine.onPlaybackState((playback) => {
    // Щелчок из списка заиграл, сменился или замолчал (в том числе
    // остановили не здесь) — ▶/■ в строках.
    const clicking = opts.playingClick()
    if (clicking !== wasClicking) {
      wasClicking = clicking
      render()
    }
    if (engine.isPlaying && !songPlaying()) return
    if (engine.isPlaying) pendingStart = false
    if (songPlaying() !== wasPlaying) {
      // Остановилась не нашей кнопкой — песня доиграла: следующая готова.
      const ended = wasPlaying && !stoppedHere
      wasPlaying = songPlaying()
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
    if (!songPlaying()) return
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
