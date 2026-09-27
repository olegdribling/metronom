// Редактор паттерна: сетка шагов на дорожку (BD/SD/HH), включение/
// выключение клика по клетке. Текущий шаг во время игры подсвечивается
// напрямую в DOM (горячий путь), как и биты на экране метронома.
import { h, mount } from '../dom.ts'
import { button } from '../components/button.ts'
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
    const state = getState()
    saveSongs(state.songs.map((s) => (s.id === songId ? { ...s, pattern } : s)))
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

  function clearPattern() {
    const song = currentSong()
    if (!song) return
    updatePattern(normalizePattern(undefined))
  }

  function render() {
    const song = currentSong()
    if (!song) {
      mount(container, h('p', {}, 'Песня не найдена.'))
      return
    }
    const pattern = normalizePattern(song.pattern)
    stepCells = []

    const grid = h('div', {
      style: {
        display: 'grid',
        gridTemplateColumns: `64px repeat(${pattern.steps}, minmax(2rem, 1fr))`,
        gap: 'var(--space-1)',
        alignItems: 'center',
        overflowX: 'auto',
      },
    })

    grid.append(h('div', {}))
    for (let i = 0; i < pattern.steps; i++) {
      grid.append(h('div', { style: { textAlign: 'center', fontSize: 'var(--font-size-caption)', color: 'var(--color-text-muted)' } }, String(i + 1)))
    }

    pattern.tracks.forEach((track) => {
      grid.append(h('div', { style: { fontFamily: 'monospace', fontWeight: 'var(--font-weight-bold)', textAlign: 'right', paddingRight: 'var(--space-2)' } }, track.name))
      track.steps.forEach((active, stepIndex) => {
        const cell = h('button', {
          type: 'button',
          className: `step${active ? ' step--on' : ''}`,
          style: active ? { backgroundColor: track.color } : {},
          dataset: { track: track.id, step: String(stepIndex) },
          onClick: () => toggleStep(track.id, stepIndex),
        })
        stepCells.push(cell)
        grid.append(cell)
      })
    })

    mount(
      container,
      h(
        'div',
        { style: { display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' } },
        h(
          'div',
          { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
          h('span', { style: { color: 'var(--color-text-sub)' } }, song.name),
          button('Очистить', { onClick: clearPattern })
        ),
        grid
      )
    )
  }

  engine.onPlaybackState((playback) => {
    stepCells.forEach((cell) => {
      cell.classList.toggle('step--current', engine.isPlaying && Number(cell.dataset.step) === playback.patternStep)
    })
  })

  const unsubscribe = subscribe(render)
  render()
  return unsubscribe
}
