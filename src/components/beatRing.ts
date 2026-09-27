// Кольцо метронома: доли такта — крупные точки по кругу (12/3/6/9 часов при
// 4 долях), между ними — деление доли, мелкими точками. Кольцо целиком
// вспыхивает заливкой на каждый удар (крупный и мелкий); точки закрашиваются
// по одной и копятся весь такт, разом гаснут в начале следующего.
// Не завязано на конкретный экран — принимает готовый центр (BPM + бейдж
// размера) и просто расставляет точки вокруг него (Правила проектирования,
// п.4: искать существующее, не плодить свою геометрию в каждом экране).
import { h } from '../dom.ts'

const DIAL_SIZE = 280
const DOT_RADIUS = 118

export interface BeatRing {
  element: HTMLElement
  /** Перерисовать точки (если изменились beatsPerBar/beatDivision) и
   * закрасить пройденные с начала такта. */
  update(opts: { beat: number; subBeat: number; beatsPerBar: number; beatDivision: number; isPlaying: boolean }): void
  /** Вспышка кольца на один удар — вызывать на каждое событие движка. */
  flash(): void
}

function polarPosition(angleDeg: number): { x: number; y: number } {
  const rad = (angleDeg * Math.PI) / 180
  return {
    x: DIAL_SIZE / 2 + DOT_RADIUS * Math.cos(rad),
    y: DIAL_SIZE / 2 + DOT_RADIUS * Math.sin(rad),
  }
}

export function createBeatRing(centerContent: HTMLElement): BeatRing {
  const ring = h('div', { className: 'dial' }, centerContent)
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
        const { x, y } = polarPosition(angle)
        const isLarge = sub === 0
        const dot = h('div', {
          className: `dial__dot ${isLarge ? 'dial__dot--large' : 'dial__dot--small'}`,
          style: { left: `${x}px`, top: `${y}px` },
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
      if (!isPlaying) {
        filled.clear()
      } else {
        // Доля 1 без деления — начало такта: гасим заливку прошлого такта
        // разом и копим заново.
        if (beat === 1 && subBeat === 0) filled.clear()
        filled.add((beat - 1) * beatDivision + subBeat)
      }
      dots.forEach((d) => d.el.classList.toggle('dial__dot--filled', filled.has(d.totalIndex)))
    },
    flash() {
      ring.classList.remove('dial--flash')
      void ring.offsetWidth // форсируем reflow — иначе CSS-анимация не перезапустится на быстрых долях
      ring.classList.add('dial--flash')
    },
  }
}
