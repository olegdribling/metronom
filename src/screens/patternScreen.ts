// Редактор паттерна: сетка шагов на дорожку (BD/SD/HH), включение/
// выключение клика по клетке. Текущий шаг во время игры подсвечивается
// напрямую в DOM (горячий путь), как и биты на экране метронома.
import { h, mount } from '../dom.ts'
import { button } from '../components/button.ts'
import { accountGate } from '../components/signInCard.ts'
import { PATTERN_INSTRUMENTS, PATTERN_STEPS } from '../config.ts'
import { Pattern, PatternTrack, Song } from '../types.ts'
import type { AudioEngine } from '../engine/audioEngine.ts'
import { getState, subscribe, saveSongs } from '../state/appState.ts'

function normalizePattern(pattern: Pattern | undefined): Pattern {
  const steps = pattern?.steps && pattern.steps > 0 ? pattern.steps : PATTERN_STEPS
  const existingTracks = pattern?.tracks ?? []
  const tracks: PatternTrack[] = PATTERN_INSTRUMENTS.map((inst) => {
    const existing = existingTracks.find((t) => t.id === inst.id)
    const existingSteps = Array.isArray(existing?.steps) ? existing!.steps : []
    return {
      id: inst.id,
      name: inst.label,
      color: inst.color,
      sample: inst.sample,
      steps: Array.from({ length: steps }, (_, i) => Boolean(existingSteps[i])),
    }
  })
  return { steps, tracks }
}

export function mountPatternScreen(container: HTMLElement, songId: number, engine: AudioEngine): () => void {
  let stepCells: HTMLElement[] = []

  function currentSong(): Song | undefined {
    return getState().songs.find((s) => s.id === songId)
  }

  function updatePattern(pattern: Pattern) {
    saveSongs(getState().songs.map((s) => (s.id === songId ? { ...s, pattern } : s)))
  }

  function toggleStep(trackId: string, stepIndex: number) {
    const song = currentSong()
    if (!song) return
    const pattern = normalizePattern(song.pattern)
    const tracks = pattern.tracks.map((t) =>
      t.id === trackId ? { ...t, steps: t.steps.map((v, i) => (i === stepIndex ? !v : v)) } : t
    )
    updatePattern({ ...pattern, tracks })
  }

  function showPlayhead(step: number) {
    stepCells.forEach((cell) => {
      cell.classList.toggle('step--current', engine.isPlaying && Number(cell.dataset.step) === step)
    })
  }

  function render() {
    stepCells = []
    const gate = accountGate('Войдите — песни и плейлисты хранятся в вашем аккаунте и видны на любом устройстве.')
    if (gate) return mount(container, gate)
    const song = currentSong()
    if (!song) {
      return mount(
        container,
        getState().songsLoaded ? h('p', {}, 'Песня не найдена.') : h('p', { className: 'text-center text-muted' }, 'Загрузка…')
      )
    }
    const pattern = normalizePattern(song.pattern)

    // key — mount() вернёт сетке горизонтальную прокрутку после
    // перерисовки (на телефоне 16 шагов не влезают, и каждый тап иначе
    // отбрасывал ленту к первому шагу).
    const grid = h('div', { className: 'pattern-grid', key: 'pattern-grid' })
    grid.style.setProperty('--pattern-steps', String(pattern.steps))

    grid.append(h('div', {}))
    for (let i = 0; i < pattern.steps; i++) {
      grid.append(h('div', { className: 'pattern-grid__num' }, String(i + 1)))
    }

    pattern.tracks.forEach((track) => {
      grid.append(h('div', { className: 'pattern-grid__label' }, track.name))
      track.steps.forEach((active, stepIndex) => {
        const cell = h('button', {
          type: 'button',
          className: `step${active ? ' step--on' : ''}`,
          dataset: { track: track.id, step: String(stepIndex) },
          onClick: () => toggleStep(track.id, stepIndex),
        })
        if (active) cell.style.setProperty('--cell-color', track.color)
        stepCells.push(cell)
        grid.append(cell)
      })
    })

    mount(
      container,
      h(
        'div',
        { className: 'stack stack--4' },
        h(
          'div',
          { className: 'row row--between' },
          h('span', { className: 'text-sub' }, song.name),
          button('Очистить', { onClick: () => updatePattern(normalizePattern(undefined)) })
        ),
        grid
      )
    )
    showPlayhead(engine.playbackState.patternStep)
  }

  const releasePlayback = engine.onPlaybackState((playback) => showPlayhead(playback.patternStep))

  const unsubscribe = subscribe(render)
  render()
  return () => {
    unsubscribe()
    releasePlayback()
  }
}
