// Экран метронома: BPM, доли такта, индикатор битов. Паттерн и секции
// принадлежат песне — редактируются на экране песни, здесь их только
// проигрывает движок, если песня загружена (currentSongId в appState).
import { h, mount } from '../dom.ts'
import { CONFIG } from '../config.ts'
import type { AudioEngine } from '../engine/audioEngine.ts'
import { getState, subscribe, patchState, saveSongs, setVoiceCount } from '../state/appState.ts'

const clampBpm = (value: number): number =>
  Math.min(CONFIG.MAX_BPM, Math.max(CONFIG.MIN_BPM, Math.round(value)))

export function mountMetronomeScreen(container: HTMLElement, engine: AudioEngine): () => void {
  let beatCircles: HTMLElement[] = []
  let showBeatsPicker = false

  function updateBpm(next: number) {
    const clamped = clampBpm(next)
    engine.setBpm(clamped)
    patchState({ bpm: clamped })

    const state = getState()
    const song = state.songs.find((s) => s.id === state.currentSongId)
    if (song && song.bpm !== clamped) {
      saveCurrentSongBpm(clamped)
    }
  }

  function saveCurrentSongBpm(bpm: number) {
    const state = getState()
    const updated = state.songs.map((s) => (s.id === state.currentSongId ? { ...s, bpm } : s))
    saveSongs(updated)
  }

  function render() {
    const state = getState()
    const beatsPerBar = engine.beatsPerBar
    const circleSize = beatsPerBar <= 6 ? '48px' : beatsPerBar <= 10 ? '36px' : '28px'

    beatCircles = Array.from({ length: beatsPerBar }, (_, i) => {
      const n = i + 1
      return h(
        'div',
        {
          className: 'beat',
          style: { width: circleSize, height: circleSize },
          dataset: { beat: String(n) },
        },
        String(n)
      )
    })

    const beatsPicker = showBeatsPicker
      ? h(
          'div',
          {
            className: 'card',
            style: {
              position: 'absolute',
              right: '0',
              top: '48px',
              zIndex: '10',
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)',
              gap: 'var(--space-2)',
              width: '200px',
            },
          },
          ...Array.from({ length: 16 }, (_, i) => {
            const n = i + 1
            return h(
              'button',
              {
                type: 'button',
                className: n === beatsPerBar ? 'btn btn--accent' : 'btn',
                style: { minHeight: '36px', padding: 'var(--space-1)' },
                onClick: () => {
                  engine.setBeatsPerBar(n)
                  showBeatsPicker = false
                  render()
                },
              },
              String(n)
            )
          })
        )
      : null

    mount(
      container,
      h(
        'div',
        { className: 'card', style: { display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' } },
        h(
          'div',
          { style: { display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 'var(--space-2)' } },
          ...beatCircles
        ),
        h(
          'div',
          { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'relative' } },
          h('span', { style: { color: 'var(--color-text-sub)', fontSize: 'var(--font-size-small)' } }, 'долей в такте'),
          h(
            'button',
            {
              type: 'button',
              className: 'btn',
              style: { fontWeight: 'var(--font-weight-bold)' },
              onClick: () => {
                showBeatsPicker = !showBeatsPicker
                render()
              },
            },
            String(beatsPerBar)
          ),
          beatsPicker
        ),
        h(
          'div',
          { style: { textAlign: 'center' } },
          h('span', { style: { fontSize: '3rem', fontWeight: 'var(--font-weight-black)' } }, String(state.bpm)),
          h('span', { style: { marginLeft: 'var(--space-2)', color: 'var(--color-text-sub)' } }, 'BPM')
        ),
        h('input', {
          type: 'range',
          min: String(CONFIG.MIN_BPM),
          max: String(CONFIG.MAX_BPM),
          value: String(state.bpm),
          onInput: (e: Event) => updateBpm(Number((e.target as HTMLInputElement).value)),
        }),
        h(
          'div',
          { style: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 'var(--space-2)' } },
          ...[-10, -1, 1, 10].map((delta) =>
            h(
              'button',
              { type: 'button', className: 'btn', onClick: () => updateBpm(state.bpm + delta) },
              delta > 0 ? `+${delta}` : String(delta)
            )
          )
        ),
        h(
          'label',
          { style: { display: 'flex', alignItems: 'center', gap: 'var(--space-2)', cursor: 'pointer' } },
          h('input', {
            type: 'checkbox',
            checked: state.voiceCount,
            onChange: (e: Event) => {
              const checked = (e.target as HTMLInputElement).checked
              engine.setVoiceCount(checked)
              setVoiceCount(checked)
            },
          }),
          h('span', {}, 'Считать вслух вместо клика')
        )
      )
    )
  }

  // Горячий путь: подсветка текущей доли обновляется напрямую в DOM на
  // каждый кадр воспроизведения, в обход полной перерисовки экрана — иначе
  // риск сбить аудио-тайминг лишней работой (тот же принцип, что был в v1).
  engine.onPlaybackState((playback) => {
    const beatsPerBar = engine.beatsPerBar
    const activeBeat = ((playback.beat - 1) % beatsPerBar) + 1
    beatCircles.forEach((el) => {
      const n = Number(el.dataset.beat)
      el.classList.remove('beat--active', 'beat--accent')
      if (engine.isPlaying && n === activeBeat) {
        el.classList.add(n === 1 ? 'beat--accent' : 'beat--active')
      }
    })
  })

  const unsubscribe = subscribe(render)
  render()

  return () => unsubscribe()
}
