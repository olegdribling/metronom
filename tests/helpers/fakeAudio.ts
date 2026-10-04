// Заглушки Web Audio для тестов движка: Node не умеет AudioContext. Время —
// фейковые часы node:test (mock.timers): AudioContext.currentTime идёт от
// Date.now(), setTimeout/requestAnimationFrame срабатывают по ним же, поэтому
// тесты не зависят от загрузки машины и идут мгновенно.
//
// Что прозвучало, видно в `played`: сэмпл — его путь (fetch отдаёт путь
// вместо байтов, decodeAudioData — «буфер» с ним), осциллятор — `osc:<частота>`
// (щелчок метронома — 1600 акцент / 1000 деление, запасной звук инструмента
// без сэмпла — его частота из config.ts).
import type { TestContext } from 'node:test'

export interface Played {
  time: number
  sound: string
}

export interface FakeAudioOptions {
  /** Сэмплы загружаются (иначе fetch отвечает 404 и звучат осцилляторы). */
  samples?: boolean
  /** Контекст создаётся приостановленным, resume() — через resumeDelayMs. */
  suspended?: boolean
  resumeDelayMs?: number
}

export function installFakeAudio(t: TestContext, opts: FakeAudioOptions = {}) {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 0 })
  const played: Played[] = []

  class FakeParam {
    value = 0
    setValueAtTime(v: number) {
      this.value = v
    }
    exponentialRampToValueAtTime() {}
  }

  class FakeAudioContext {
    state: 'running' | 'suspended' = opts.suspended ? 'suspended' : 'running'
    destination = {}
    get currentTime() {
      return Date.now() / 1000
    }
    async resume() {
      if (opts.resumeDelayMs) await new Promise((resolve) => setTimeout(resolve, opts.resumeDelayMs))
      this.state = 'running'
    }
    createBufferSource() {
      const source = {
        buffer: null as { sample: string } | null,
        connect() {},
        start: (time = 0) => played.push({ time, sound: source.buffer!.sample }),
      }
      return source
    }
    createOscillator() {
      const frequency = new FakeParam()
      return { connect() {}, type: '', frequency, start: (time = 0) => played.push({ time, sound: `osc:${frequency.value}` }), stop() {} }
    }
    createGain() {
      return { connect() {}, gain: new FakeParam() }
    }
    async decodeAudioData(data: { sample: string }) {
      return { sample: data.sample }
    }
  }

  const g = globalThis as Record<string, unknown>
  g.AudioContext = FakeAudioContext
  g.fetch = async (url: string) =>
    opts.samples
      ? { ok: true, status: 200, arrayBuffer: async () => ({ sample: String(url).slice(1) }) }
      : { ok: false, status: 404 }
  g.requestAnimationFrame = (cb: (time: number) => void) => setTimeout(() => cb(Date.now()), 16)
  g.cancelAnimationFrame = (id: ReturnType<typeof setTimeout>) => clearTimeout(id)

  return {
    played,
    /** Прошло ms миллисекунд — по 1 мс: mock.timers.tick(ms) сразу ставит
     * часы на конец и теряет таймеры, заведённые по дороге. */
    advance(ms: number) {
      for (let i = 0; i < ms; i++) t.mock.timers.tick(1)
    },
    /** Часы прыгнули вперёд, а таймеры не срабатывали (вкладку придушили). */
    jump(ms: number) {
      t.mock.timers.setTime(Date.now() + ms)
    },
  }
}

/** Дать выполниться промисам (загрузка сэмплов — fetch/decode). */
export const settle = () => new Promise((resolve) => setImmediate(resolve))
