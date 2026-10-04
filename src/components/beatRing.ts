// Кольцо метронома: доли такта — крупные точки по кругу (12/3/6/9 часов при
// 4 долях), между ними — деление доли, мелкими точками. Кольцо целиком
// вспыхивает заливкой на каждый удар (крупный и мелкий); точки закрашиваются
// по одной и копятся весь такт, разом гаснут в начале следующего. С
// выключенным миганием вместо вспышки по точкам прыжками ходит стрелка, а
// за ней прыжками же растёт тёмный сектор от 12 часов — до конца такта
// (решение пользователя).
// Не завязано на конкретный экран — принимает готовый центр (BPM + бейдж
// размера) и просто расставляет точки вокруг него (Правила проектирования,
// п.4: искать существующее, не плодить свою геометрию в каждом экране).
// Размер кольца задаёт CSS (.dial — по свободному месту экрана), поэтому
// точки стоят в процентах от него.
import { h } from '../dom.ts'

// Радиус окружности точек — доля от радиуса кольца (было 118 px при 280 px).
const DOT_RADIUS = 0.843

export interface BeatRing {
  element: HTMLElement
  /** Перерисовать точки (если изменились beatsPerBar/beatDivision),
   * закрасить пройденные с начала такта и поставить стрелку. */
  update(opts: { beat: number; subBeat: number; beatsPerBar: number; beatDivision: number; isPlaying: boolean }): void
  /** Вспышка кольца на один удар — вызывать на каждое событие движка. */
  flash(): void
  /** Мигание выключено — показать стрелку и сектор за ней вместо вспышек. */
  setHandMode(on: boolean): void
}

function polarPercent(angleDeg: number): { x: number; y: number } {
  const rad = (angleDeg * Math.PI) / 180
  return { x: 50 + 50 * DOT_RADIUS * Math.cos(rad), y: 50 + 50 * DOT_RADIUS * Math.sin(rad) }
}

export function createBeatRing(centerContent: HTMLElement): BeatRing {
  const sector = h('div', { className: 'dial__sector', hidden: true })
  const hand = h('div', { className: 'dial__hand', hidden: true })
  const ring = h('div', { className: 'dial' }, sector, hand, centerContent)
  let dots: { el: HTMLElement; totalIndex: number }[] = []
  let builtBeatsPerBar = -1
  let builtBeatDivision = -1
  // Точки, закрашенные в текущем такте — копятся весь такт (не гаснут
  // одна за другой), разом сбрасываются в начале следующего такта.
  let filled = new Set<number>()

  function rebuildDots(beatsPerBar: number, beatDivision: number) {
    dots.forEach((d) => d.el.remove())
    dots = []
    filled = new Set()
    const stepAngle = 360 / beatsPerBar
    for (let beatIndex = 0; beatIndex < beatsPerBar; beatIndex++) {
      const baseAngle = -90 + beatIndex * stepAngle // -90° = 12 часов, дальше по часовой
      for (let sub = 0; sub < beatDivision; sub++) {
        const angle = baseAngle + sub * (stepAngle / beatDivision)
        const { x, y } = polarPercent(angle)
        const isLarge = sub === 0
        const dot = h('div', {
          className: `dial__dot ${isLarge ? 'dial__dot--large' : 'dial__dot--small'}`,
          style: { left: `${x}%`, top: `${y}%` },
        })
        ring.append(dot)
        dots.push({ el: dot, totalIndex: beatIndex * beatDivision + sub })
      }
    }
    builtBeatsPerBar = beatsPerBar
    builtBeatDivision = beatDivision
  }

  return {
    element: ring,
    update({ beat, subBeat, beatsPerBar, beatDivision, isPlaying }) {
      if (beatsPerBar !== builtBeatsPerBar || beatDivision !== builtBeatDivision) {
        rebuildDots(beatsPerBar, beatDivision)
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
      dots.forEach((d) => d.el.classList.toggle('dial__dot--filled', filled.has(d.totalIndex)))
      // Стрелка — на точку текущего удара, прыжком; стоим — на 12 часов.
      // Сектор — от 12 часов до стрелки: в начале такта пустой.
      const angle = isPlaying ? (index * 360) / (beatsPerBar * beatDivision) : 0
      hand.style.transform = `rotate(${angle}deg)`
      sector.style.setProperty('--sector-angle', `${angle}deg`)
    },
    flash() {
      ring.classList.remove('dial--flash')
      void ring.offsetWidth // форсируем reflow — иначе CSS-анимация не перезапустится на быстрых долях
      ring.classList.add('dial--flash')
    },
    setHandMode(on) {
      hand.hidden = !on
      sector.hidden = !on
    },
  }
}
