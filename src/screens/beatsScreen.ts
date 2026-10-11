// Экран библиотеки битов/брейков: список + создание + удаление (корзина в
// строке, с подтверждением) + ▶ у каждого бита — послушать: играет по кругу
// в своём темпе, как в редакторе, ■ — стоп, ▶ другого — переключиться на
// него (решение пользователя; звук включает app.ts). Биты хранятся в
// аккаунте (users/{uid}/beats, data/userLibrary.ts) — без входа экран
// показывает карточку «Войти через Google». Сам редактор — beatEditorScreen.ts.
import { h, mount } from '../dom.ts'
import { button, iconButton } from '../components/button.ts'
import { accountGate } from '../components/signInCard.ts'
import { deletableRow } from '../components/deletableRow.ts'
import { icon } from '../icons.ts'
import { BeatKind } from '../types.ts'
import { createEmptyBeat } from '../data/beatsLibrary.ts'
import { getState, subscribe, saveBeats } from '../state/appState.ts'
import type { AudioEngine } from '../engine/audioEngine.ts'

export interface BeatsScreenOptions {
  onOpenBeat: (beatId: string) => void
  /** ▶/■ у бита: играет — стоп, иначе — играть его (вместо того, что играло). */
  onToggleBeat: (beatId: string) => Promise<void>
  /** Какой бит сейчас играет (null — никакой). */
  playingBeat: () => string | null
}

export function mountBeatsScreen(container: HTMLElement, engine: AudioEngine, opts: BeatsScreenOptions): () => void {
  const { onOpenBeat } = opts
  function handleCreate() {
    const beat = createEmptyBeat(`beat_${Date.now()}`, 'Новый бит')
    const state = getState()
    saveBeats([...state.beats, beat])
    onOpenBeat(beat.id)
  }

  // Песни не задевает: в них свои копии битов (решение пользователя).
  function deleteBeat(beatId: string) {
    saveBeats(getState().beats.filter((b) => b.id !== beatId))
  }

  function kindBadge(kind: BeatKind) {
    return h('span', { className: 'badge' }, kind === 'beat' ? 'Бит' : 'Брейк')
  }

  function render() {
    const gate = accountGate('Войдите — биты хранятся в вашем аккаунте и видны на любом устройстве.')
    if (gate) {
      mount(container, gate)
      return
    }
    const state = getState()
    const playing = opts.playingBeat()
    mount(
      container,
      h(
        'div',
        { className: 'stack stack--4' },
        button('Создать', { variant: 'accent', onClick: handleCreate }),
        state.beats.length === 0
          ? h('p', { className: 'text-center text-muted' }, state.beatsLoaded ? 'Пока пусто — создайте первый бит выше' : 'Загрузка…')
          : h(
              'div',
              { className: 'stack stack--2' },
              ...state.beats.map((beat) =>
                deletableRow(
                  h(
                    'button',
                    { type: 'button', className: 'list-row', onClick: () => onOpenBeat(beat.id) },
                    icon('drum'),
                    h('span', { className: 'grow' }, beat.name),
                    kindBadge(beat.kind),
                    // Бит — один такт своего размера (data/beatMeter.ts); тот же
                    // бейдж «N/M», что в выборе филла на экране песни.
                    h('span', { className: 'badge' }, `${beat.beatsPerBar}/${beat.beatDivision}`)
                  ),
                  {
                    ariaLabel: `Удалить бит «${beat.name}»`,
                    confirmText: `Удалить бит «${beat.name}»? Это нельзя отменить. В песнях останутся их копии.`,
                    onDelete: () => deleteBeat(beat.id),
                    disabled: !getState().unlocked,
                    // Слушать можно и под закрытым замком. Сэмплы ещё не
                    // загрузились — ждём, как ▶ на секции песни.
                    actions: [
                      iconButton(playing === beat.id ? 'stop' : 'play', {
                        ariaLabel: playing === beat.id ? 'Стоп' : 'Слушать бит',
                        disabled: !state.samplesLoaded,
                        onClick: () => void opts.onToggleBeat(beat.id).then(render),
                      }),
                    ],
                  }
                )
              )
            )
      )
    )
  }

  // Бит заиграл или замолчал (в том числе Стоп в футере) — ▶/■ у строк
  // меняются. Своего слота у списка нет, а у движка он один — берём его, как
  // экраны с подсветкой (заиграл — первое событие доли, замолчал — сброс).
  let wasPlaying = engine.isPlaying
  const releasePlayback = engine.onPlaybackState(() => {
    if (engine.isPlaying === wasPlaying) return
    wasPlaying = engine.isPlaying
    render()
  })

  const unsubscribe = subscribe(render)
  render()
  return () => {
    unsubscribe()
    releasePlayback()
  }
}
