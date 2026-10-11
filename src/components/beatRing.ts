// Кольцо метронома — ручка (решение пользователя, по референсу): выпуклый
// диск с темпом и размером, вокруг — риски: доли такта — крупные (12/3/6/9
// часов при 4 долях), между ними — деление доли, мелкие. Диск вспыхивает на
// каждый удар (крупный и мелкий); риски закрашиваются по одной и копятся
// весь такт, разом гаснут в начале следующего. С выключенным миганием
// вместо вспышки по рискам прыжками ходит указатель — вдавленная точка у
// края диска, а за ним прыжками же растёт оранжевая дуга от 12 часов — до
// конца такта.
// Не завязано на конкретный экран — принимает готовый центр (BPM + бейдж
// размера) и просто расставляет точки вокруг него (Правила проектирования,
// п.4: искать существующее, не плодить свою геометрию в каждом экране).
// Размер кольца задаёт CSS (.dial — по свободному месту экрана): риска —
// обёртка во весь круг, повёрнутая на свой угол, поэтому от размера не
// зависит.
import { h } from '../dom.ts'

export interface BeatRing {
  element: HTMLElement
  /** Перерисовать риски (если изменились beatsPerBar/beatDivision),
   * закрасить пройденные с начала такта и поставить указатель. */
  update(opts: { beat: number; subBeat: number; beatsPerBar: number; beatDivision: number; isPlaying: boolean }): void
  /** Вспышка кольца на один удар — вызывать на каждое событие движка. */
  flash(): void
  /** Мигание выключено — показать указатель и дугу за ним вместо вспышек. */
  setHandMode(on: boolean): void
}

export function createBeatRing(centerContent: HTMLElement): BeatRing {
  const arc = h('div', { className: 'dial__arc', hidden: true })
  const pointer = h('div', { className: 'dial__pointer', hidden: true })
  const ring = h('div', { className: 'dial' }, arc, h('div', { className: 'dial__knob' }, pointer, centerContent))
  let ticks: { el: HTMLElement; totalIndex: number }[] = []
  let builtBeatsPerBar = -1
  let builtBeatDivision = -1
  // Риски, закрашенные в текущем такте — копятся весь такт (не гаснут
  // одна за другой), разом сбрасываются в начале следующего такта.
  let filled = new Set<number>()

  function rebuildTicks(beatsPerBar: number, beatDivision: number) {
    ticks.forEach((d) => d.el.remove())
    ticks = []
    filled = new Set()
    const stepAngle = 360 / beatsPerBar
    for (let beatIndex = 0; beatIndex < beatsPerBar; beatIndex++) {
      const baseAngle = beatIndex * stepAngle // 0° = 12 часов, дальше по часовой
      for (let sub = 0; sub < beatDivision; sub++) {
        const angle = baseAngle + sub * (stepAngle / beatDivision)
        const tick = h('div', {
          className: `dial__tick${sub === 0 ? ' dial__tick--large' : ''}`,
          style: { transform: `rotate(${angle}deg)` },
        })
        ring.insertBefore(tick, arc) // риски — под дугой и диском
        ticks.push({ el: tick, totalIndex: beatIndex * beatDivision + sub })
      }
    }
    builtBeatsPerBar = beatsPerBar
    builtBeatDivision = beatDivision
  }

  return {
    element: ring,
    update({ beat, subBeat, beatsPerBar, beatDivision, isPlaying }) {
      if (beatsPerBar !== builtBeatsPerBar || beatDivision !== builtBeatDivision) {
        rebuildTicks(beatsPerBar, beatDivision)
      }
      const index = (beat - 1) * beatDivision + subBeat
      if (!isPlaying) {
        filled.clear()
      } else {
        // Доля 1 без деления — начало такта: гасим заливку прошлого такта
        // разом и копим заново.
        if (beat === 1 && subBeat === 0) filled.clear()
        filled.add(index)
      }
      ticks.forEach((d) => d.el.classList.toggle('dial__tick--filled', filled.has(d.totalIndex)))
      // Указатель — на риску текущего удара, прыжком; стоим — на 12 часов.
      // Дуга — от 12 часов до указателя: в начале такта пустая.
      const angle = isPlaying ? (index * 360) / (beatsPerBar * beatDivision) : 0
      pointer.style.transform = `rotate(${angle}deg)`
      arc.style.setProperty('--arc-angle', `${angle}deg`)
    },
    flash() {
      ring.classList.remove('dial--flash')
      void ring.offsetWidth // форсируем reflow — иначе CSS-анимация не перезапустится на быстрых долях
      ring.classList.add('dial--flash')
    },
    setHandMode(on) {
      pointer.hidden = !on
      arc.hidden = !on
    },
  }
}
