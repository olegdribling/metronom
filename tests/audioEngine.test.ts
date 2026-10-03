// Минимальный smoke-тест аудио-движка (Уроки v1, п.4: build-check + один
// тест на тайминг/расписание нот — в v1 не было ни одного теста).
// Не проверяет реальный звук (Node не умеет Web Audio) — проверяет то, что
// реально ломалось бы при регрессии в schedule(): счёт долей/тактов и
// корректную остановку по концу песни, не зависая и не зацикливаясь молча.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createAudioEngine } from '../src/engine/audioEngine.ts'
import { Song } from '../src/types.ts'

class FakeAudioParam {
  value = 0
  setValueAtTime() {}
  exponentialRampToValueAtTime() {}
}
class FakeAudioContext {
  private readonly startedAt = Date.now()
  state: 'running' | 'suspended' = 'running'
  destination = {}
  get currentTime() {
    return (Date.now() - this.startedAt) / 1000
  }
  async resume() {
    this.state = 'running'
  }
  createBufferSource() {
    return { buffer: null as unknown, connect() {}, start() {} }
  }
  createOscillator() {
    return { connect() {}, frequency: new FakeAudioParam(), type: 'triangle', start() {}, stop() {} }
  }
  createGain() {
    return { connect() {}, gain: new FakeAudioParam() }
  }
  async decodeAudioData(): Promise<unknown> {
    return {}
  }
}

function installWebAudioStubs() {
  ;(globalThis as any).AudioContext = FakeAudioContext
  ;(globalThis as any).fetch = async () => ({ ok: false }) // сэмплов нет — движок использует fallback-осциллятор
  ;(globalThis as any).requestAnimationFrame = (cb: FrameRequestCallback) => setTimeout(() => cb(performance.now()), 4) as unknown as number
  ;(globalThis as any).cancelAnimationFrame = (id: number) => clearTimeout(id as unknown as ReturnType<typeof setTimeout>)
}

function makeTestSong(): Song {
  return {
    id: 1,
    name: 'Тестовая песня',
    bpm: 480, // намеренно быстрый темп — тест короче
    sections: [{ name: 'VERSE', bars: 1, comment: '', intro: false }], // не intro → не зацикливается
    pattern: { steps: 16, tracks: [] },
  }
}

test('движок считает доли/такты и сам останавливается по концу песни', async () => {
  installWebAudioStubs()
  const engine = createAudioEngine()
  const song = makeTestSong()
  engine.setSong(song)
  engine.setBpm(song.bpm)
  engine.setBeatsPerBar(4)

  const beatsSeen: number[] = []
  engine.onPlaybackState((state) => beatsSeen.push(state.beat))

  await engine.start()
  assert.equal(engine.isPlaying, true, 'после start() движок должен считать себя играющим')

  // 1 такт по 4 доли на 480 BPM = 4 * (60/480) = 0.5s звучания. Даём
  // ощутимый запас на lookahead/RAF-опрос и проверяем, что к этому моменту
  // проигрывание само остановилось — не зависло и не зациклилось молча.
  await new Promise((resolve) => setTimeout(resolve, 900))

  assert.equal(engine.isPlaying, false, 'непетлевая песня должна остановиться сама по окончании тактов')

  // start() синхронно сбрасывает состояние в beat=1 ещё до первого реально
  // запланированного такта, а по остановке — сбрасывает обратно в beat=1.
  // Убираем эти повторяющиеся соседние значения и проверяем сам счёт долей.
  const dedup = beatsSeen.filter((beat, i) => beat !== beatsSeen[i - 1])
  assert.deepEqual(dedup, [1, 2, 3, 4, 1], 'доли должны идти по порядку 1→2→3→4, затем сброс по остановке')
})

test('изменение BPM во время игры применяется сразу (естественно из-за ухода от React)', async () => {
  installWebAudioStubs()
  const engine = createAudioEngine()
  engine.setBeatsPerBar(4)
  // intro: true → секция петлевая, играет бесконечно, можно спокойно менять
  // темп посреди воспроизведения не думая об окончании песни.
  engine.setSong({ ...makeTestSong(), sections: [{ name: 'V', bars: 100, comment: '', intro: true }] })
  engine.setBpm(150) // 1 доля = 400мс

  const timestamps: number[] = []
  const t0 = Date.now()
  engine.onPlaybackState(() => timestamps.push(Date.now() - t0))
  await engine.start()

  // Уже запланированная на старой скорости доля довисит максимум один её
  // интервал (400мс) — ждём с запасом, потом меняем темп и смотрим на
  // интервалы между следующими отметками, а не абсолютный счётчик.
  await new Promise((resolve) => setTimeout(resolve, 500))
  engine.setBpm(1200) // 1 доля = 50мс — резкое ускорение прямо во время игры
  await new Promise((resolve) => setTimeout(resolve, 800))
  engine.stop()

  const gapsAfterChange = timestamps
    .filter((t) => t > 900) // с запасом после смены темпа, чтобы захватить только новые интервалы
    .reduce<number[]>((gaps, t, i, arr) => (i === 0 ? gaps : [...gaps, t - arr[i - 1]]), [])

  assert.ok(gapsAfterChange.length >= 3, `ожидали несколько отметок после ускорения, получили ${gapsAfterChange.length}`)
  const avgGap = gapsAfterChange.reduce((a, b) => a + b, 0) / gapsAfterChange.length
  // На 1200 BPM доля идёт раз в 50мс — если бы BPM применялся только на
  // следующий start() (как было в v1), интервал остался бы ~400мс.
  assert.ok(avgGap < 150, `ожидали короткие интервалы (~50мс) после ускорения темпа, получили в среднем ${avgGap}мс`)
})

test('деление доли (subBeat) для кольца метронома считается 0..beatDivision-1 по кругу', async () => {
  installWebAudioStubs()
  const engine = createAudioEngine()
  engine.setBeatsPerBar(4)
  engine.setBeatDivision(4)
  engine.setSong({ ...makeTestSong(), sections: [{ name: 'V', bars: 100, comment: '', intro: true }] })
  engine.setBpm(240) // 1 доля = 250мс, при делении 4 один тик = 62.5мс

  const subBeats: number[] = []
  engine.onPlaybackState((s) => subBeats.push(s.subBeat))
  await engine.start()
  await new Promise((resolve) => setTimeout(resolve, 900))
  engine.stop()

  const dedup = subBeats.filter((v, i) => v !== subBeats[i - 1])
  const hasFullCycle = dedup.some(
    (_, i) => dedup[i] === 0 && dedup[i + 1] === 1 && dedup[i + 2] === 2 && dedup[i + 3] === 3
  )
  assert.ok(hasFullCycle, `ожидали цикл 0→1→2→3 в subBeat, получили: ${dedup.join(',')}`)
})

test('паттерн без секций (бит из редактора) крутится ровно по своей длине, не по такту движка', async () => {
  installWebAudioStubs()
  const engine = createAudioEngine()
  engine.setBeatsPerBar(4) // такт движка = 4 доли × 2 шага = 8 шагов — длина бита (7) с ним не совпадает
  const steps = 7
  engine.setSong({
    ...makeTestSong(),
    sections: [], // так бит отдаёт beatEditorScreen.ts: без длины песни, бесконечно
    pattern: {
      steps,
      tracks: [{ id: 'real_kick', name: 'Kick', color: '', sample: '', steps: Array.from({ length: steps }, (_, i) => i === 0) }],
    },
  })
  engine.setBpm(600) // 1 доля = 100мс, шаг = 50мс

  const seen: number[] = []
  engine.onPlaybackState((s) => {
    if (engine.isPlaying && s.patternStep !== seen[seen.length - 1]) seen.push(s.patternStep)
  })
  await engine.start()
  await new Promise((resolve) => setTimeout(resolve, 1500))
  engine.stop()

  // start() синхронно сбрасывает patternStep в 0 до первого шага — первый 0
  // в списке может быть этим сбросом, а не реальным шагом; он не мешает:
  // дальше каждый следующий шаг обязан быть (предыдущий + 1) mod 7. С
  // секцией на 2 такта после 0123456 0123456 шло 01 и сброс в 0 — обрыв.
  assert.ok(seen.length > steps * 2, `ожидали больше двух кругов, получили: ${seen.join('')}`)
  seen.slice(1).forEach((step, i) => {
    assert.equal(step, (seen[i] + 1) % steps, `шаги должны идти по кругу 0..6 без обрывов, получили: ${seen.join('')}`)
  })
})
