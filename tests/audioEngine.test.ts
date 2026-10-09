// Тесты аудио-движка (Уроки v1, п.4: в v1 не было ни одного теста). Не
// проверяют реальный звук — проверяют то, что реально ломалось бы при
// регрессии в schedule(): счёт долей/тактов, остановку по концу песни,
// источник звука на каждой доле. Время — фейковые часы (tests/helpers/
// fakeAudio.ts), поэтому тайминги точные, а не «с запасом».
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createAudioEngine } from '../src/engine/audioEngine.ts'
import { EngineSong, Pattern, Section } from '../src/types.ts'
import { installFakeAudio, settle } from './helpers/fakeAudio.ts'

console.warn = () => {} // «не удалось загрузить сэмпл» — в тестах без сэмплов это норма

const HH = 'sound/Real Drum Kit/HH.wav'
const SN = 'sound/Real Drum Kit/SN.wav'
const BD = 'sound/Real Drum Kit/BD.wav'
const CLICK = 'osc:1600'

function section(name: string, bars: number, extra: Partial<Section> = {}): Section {
  return { id: name, name, bars, comment: '', intro: false, ...extra }
}

// Песня, как её получает движок (data/resolveBeat.ts): секции и паттерн
// песни, уже разрешённые в сэмплы. Темп и размер движку задают отдельно.
function makeSong(extra: Partial<EngineSong> = {}): EngineSong {
  return {
    sections: [section('VERSE', 1)], // не intro → не зацикливается
    pattern: { steps: 16, stepsPerBeat: 2, tracks: [] },
    ...extra,
  }
}

// Дорожки — id инструментов кита (config.ts, KIT_INSTRUMENTS): сэмплы
// BD/SN/HH.wav; без сэмплов — запасной осциллятор с частотой роли.
const track = (id: string, steps: boolean[]) => ({ id, name: id, color: '', sample: '', steps })
const pattern = (id: string, steps: boolean[], stepsPerBeat = 2): Pattern => ({ steps: steps.length, stepsPerBeat, tracks: [track(id, steps)] })

function setup(t: Parameters<typeof installFakeAudio>[0], opts: Parameters<typeof installFakeAudio>[1] = {}) {
  const audio = installFakeAudio(t, opts)
  const engine = createAudioEngine()
  engine.setBeatsPerBar(4)
  engine.setBeatDivision(1)
  t.after(() => engine.stop())
  return { ...audio, engine }
}

/** Звуки по долям (доля = 60/bpm, первая — в момент start): на тихой доле — []. */
function soundsByBeat(played: { time: number; sound: string }[], bpm: number, start = 0.1): string[][] {
  const beat = 60 / bpm
  const out: string[][] = []
  for (const p of played) {
    const index = Math.floor(Math.round(((p.time - start) / beat) * 1000) / 1000)
    ;(out[index] ??= []).push(p.sound)
  }
  return Array.from(out, (sounds) => sounds ?? [])
}

test('движок считает доли/такты и сам останавливается по концу песни', async (t) => {
  const { engine, advance } = setup(t)
  engine.setSong(makeSong())
  engine.setBpm(480)
  const beatsSeen: number[] = []
  engine.onPlaybackState((s) => beatsSeen.push(s.beat))

  await engine.start()
  assert.equal(engine.isPlaying, true)
  // 1 такт по 4 доли на 480 BPM = 0.5 с звучания (+0.1 с до первой доли).
  advance(700)
  assert.equal(engine.isPlaying, false, 'непетлевая песня должна остановиться сама по окончании тактов')
  const dedup = beatsSeen.filter((beat, i) => beat !== beatsSeen[i - 1])
  assert.deepEqual(dedup, [1, 2, 3, 4, 1], 'доли 1→2→3→4, затем сброс по остановке')
})

test('изменение BPM во время игры применяется со следующей доли', async (t) => {
  const { engine, advance } = setup(t)
  engine.setSong(makeSong({ sections: [section('V', 100, { intro: true })] }))
  engine.setBpm(150) // доля = 400 мс
  const times: number[] = []
  engine.onPlaybackState((s) => s.beat && times.push(Date.now()))
  await engine.start()
  advance(500)
  engine.setBpm(1200) // доля = 50 мс; уже запланированная доля 0.9 с довисит
  advance(1500)
  const gaps = times.filter((t) => t > 950).map((t, i, arr) => (i ? t - arr[i - 1] : 0)).slice(1)
  assert.ok(gaps.length >= 10, `ожидали много долей после ускорения, получили ${gaps.length}`)
  const avg = gaps.reduce((a, b) => a + b, 0) / gaps.length
  // Отрисовка — по кадрам (16 мс), поэтому около 50, а не ровно.
  assert.ok(avg > 40 && avg < 60, `ожидали ~50 мс между долями, получили ${avg}`)
})

test('деление доли (subBeat) для кольца метронома считается 0..beatDivision-1 по кругу', async (t) => {
  const { engine, advance } = setup(t)
  engine.setBeatDivision(4)
  engine.setSong(makeSong({ sections: [section('V', 100, { intro: true })] }))
  engine.setBpm(60) // доля = 1 с, тик = 250 мс — кадры (16 мс) не пропускают тиков
  const subBeats: number[] = []
  engine.onPlaybackState((s) => subBeats.push(s.subBeat))
  await engine.start()
  advance(2200)
  const dedup = subBeats.filter((v, i) => v !== subBeats[i - 1])
  assert.deepEqual(dedup.slice(0, 9), [0, 1, 2, 3, 0, 1, 2, 3, 0])
})

test('паттерн без секций (бит из редактора) крутится ровно по своей длине, не по такту движка', async (t) => {
  const { engine, advance } = setup(t)
  const steps = 7
  engine.setSong(makeSong({ sections: [], pattern: pattern('real_kick', Array.from({ length: steps }, (_, i) => i === 0)) }))
  engine.setBpm(300) // доля = 200 мс, шаг (восьмая) = 100 мс
  const seen: number[] = []
  engine.onPlaybackState((s) => {
    if (s.patternStep >= 0 && s.patternStep !== seen[seen.length - 1]) seen.push(s.patternStep)
  })
  await engine.start()
  advance(3000)
  assert.ok(seen.length > steps * 2, `ожидали больше двух кругов, получили: ${seen.join('')}`)
  seen.slice(1).forEach((step, i) => assert.equal(step, (seen[i] + 1) % steps, `шаги по кругу 0..6 без обрывов: ${seen.join('')}`))
})

test('шагов на долю — из паттерна (stepsPerBeat): у бита N/M шаг звучит как 1/M доли', async (t) => {
  const { engine, advance } = setup(t)
  engine.setSong(makeSong({ sections: [], pattern: pattern('real_kick', Array.from({ length: 8 }, (_, i) => i === 0), 4) }))
  engine.setBpm(60) // доля = 1 с, шаг = 250 мс
  const stepsByBeat = new Map<string, Set<number>>()
  engine.onPlaybackState((s) => {
    if (!engine.isPlaying || s.patternStep < 0) return
    const key = `${s.bar}:${s.beat}`
    if (!stepsByBeat.has(key)) stepsByBeat.set(key, new Set())
    stepsByBeat.get(key)!.add(s.patternStep)
  })
  await engine.start()
  advance(3100)
  assert.deepEqual([...stepsByBeat.get('0:1')!].sort(), [0, 1, 2, 3], 'первая доля — шаги 0..3')
  assert.deepEqual([...stepsByBeat.get('0:2')!].sort(), [4, 5, 6, 7], 'вторая доля — шаги 4..7')
  assert.deepEqual([...stepsByBeat.get('0:3')!].sort(), [0, 1, 2, 3], 'бит на 2 доли пошёл по кругу')
})

test('биты в секциях: грув секции по кругу, филл с доли вместо него и обрезается концом секции', async (t) => {
  const { engine, advance, played } = setup(t, { samples: true })
  await settle()
  engine.setSong(
    makeSong({
      // паттерн песни — bd на каждую долю
      pattern: pattern('real_kick', [true, false]),
      sections: [
        section('A', 1, {
          // грув — hh на каждую долю (бит 1/2)
          groove: pattern('real_hihat', [true, false], 2),
          // филл на 2 доли (бит 2/2, sd на каждом шаге) с последней доли —
          // во второй доле секция уже кончилась, он обрезается
          fillPatterns: [{ at: 3, pattern: pattern('real_snare', [true, true, true, true], 2) }],
        }),
        section('B', 1),
      ],
    })
  )
  engine.setBpm(600)
  await engine.start()
  advance(1200)
  assert.deepEqual(
    played.sort((a, b) => a.time - b.time).map((p) => p.sound),
    [HH, HH, HH, SN, SN, BD, BD, BD, BD],
    'доли 1–3 — грув секции A, доля 4 — филл (вторая его доля обрезана), секция B — паттерн песни'
  )
})

test('пустой бит или филл секции — пауза, пустой паттерн песни — щелчок', async (t) => {
  const { engine, advance, played } = setup(t, { samples: true })
  await settle()
  engine.setSong(
    makeSong({
      sections: [
        section('A', 1, {
          groove: pattern('real_hihat', [true, false], 2),
          // филл без единой ноты на долю 2 — пауза (решение пользователя)
          fillPatterns: [{ at: 1, pattern: pattern('real_kick', [false, false, false, false], 4) }],
        }),
        // пустой грув на всю секцию — тоже пауза
        section('B', 1, { groove: pattern('real_hihat', [false, false], 2) }),
        // без грува — паттерн песни, он пустой — щелчок
        section('C', 1),
      ],
    })
  )
  engine.setBpm(600)
  await engine.start()
  advance(1500)
  const beats = soundsByBeat(played, 600)
  assert.deepEqual(beats.slice(0, 4), [[HH], [], [HH], [HH]], 'секция A: на доле 2 пауза вместо щелчка')
  assert.deepEqual(beats.slice(4, 8), [[], [], [], []], 'секция B: пустой грув — тишина')
  assert.deepEqual(beats.slice(8, 12), [[CLICK], [CLICK], [CLICK], [CLICK]], 'секция C: щелчок')
})

test('убавили долей в такте во время игры — счёт не уходит за такт, песня идёт дальше', async (t) => {
  const { engine, advance } = setup(t)
  engine.setSong(makeSong({ sections: [section('A', 2), section('B', 2)] }))
  engine.setBpm(120) // доля = 500 мс
  const beats: number[] = []
  const bars: number[] = []
  engine.onPlaybackState((s) => {
    beats.push(s.beat)
    bars.push(s.bar)
  })
  await engine.start()
  // На кольце доля 3 — планировщик уже ушёл на долю 4: тот самый случай,
  // когда с === счёт рос без конца (1…11, такт навсегда 0).
  while (beats[beats.length - 1] !== 3) advance(1)
  advance(50)
  engine.setBeatsPerBar(3)
  advance(4000)
  assert.ok(Math.max(...beats) <= 4, `доля ушла за предел такта: ${Math.max(...beats)}`)
  assert.ok(Math.max(...bars) >= 3, `такты должны идти дальше, дошли до ${Math.max(...bars)}`)
})

test('двойной Play, пока контекст просыпается, — один планировщик, Стоп глушит всё', async (t) => {
  const { engine, advance, played } = setup(t, { suspended: true, resumeDelayMs: 50 })
  engine.setSong(makeSong({ sections: [section('V', 100, { intro: true })] }))
  engine.setBpm(600)
  const first = engine.start()
  const second = engine.start() // двойной тап до того, как resume() закончился
  advance(50)
  await Promise.all([first, second])
  advance(300)
  const perBeat = soundsByBeat(played, 600, played[0].time)
  assert.ok(perBeat.every((sounds) => sounds.length === 1), 'на каждой доле — один щелчок, не два')
  engine.stop()
  const before = played.length
  advance(500)
  assert.equal(played.length, before, 'после Стоп движок не должен планировать ноты')
})

test('Play, когда уже играет, ничего не перезапускает', async (t) => {
  const { engine, advance } = setup(t)
  engine.setSong(makeSong({ sections: [section('V', 100, { intro: true })] }))
  engine.setBpm(600)
  const beats: number[] = []
  engine.onPlaybackState((s) => beats.push(s.beat))
  await engine.start()
  advance(250)
  await engine.start()
  advance(450)
  const dedup = beats.filter((b, i) => b !== beats[i - 1])
  assert.deepEqual(dedup.slice(0, 6), [1, 2, 3, 4, 1, 2], 'счёт идёт дальше, без сброса на долю 1')
})

test('Стоп, пока контекст просыпается, — игра не начинается', async (t) => {
  const { engine, advance, played } = setup(t, { suspended: true, resumeDelayMs: 50 })
  const start = engine.start()
  engine.stop()
  advance(50)
  await start
  advance(300)
  assert.equal(engine.isPlaying, false)
  assert.equal(played.length, 0)
})

test('вкладку придушили — пропущенные доли не звучат пачкой, песня остаётся в своём времени', async (t) => {
  const { engine, advance, jump, played } = setup(t)
  engine.setSong(makeSong({ sections: [section('V', 100, { intro: true })] }))
  engine.setBpm(600) // доля = 100 мс, такт = 400 мс
  const bars: number[] = []
  engine.onPlaybackState((s) => bars.push(s.bar))
  await engine.start()
  advance(300)
  jump(2000) // 2 с без единого таймера
  const resumedAt = Date.now() / 1000
  advance(300)
  const late = played.filter((p) => p.time > 0.4 && p.time < resumedAt - 0.05)
  assert.equal(late.length, 0, `пропущенные доли прозвучали пачкой: ${late.length}`)
  // 2.6 с от старта = 6.5 тактов по 0.4 с — счёт тактов не стоял.
  assert.ok(Math.max(...bars) >= 5, `такты должны идти и во время паузы, дошли до ${Math.max(...bars)}`)
})

test('Play доступен для щелчка сразу, для паттерна и голоса — после загрузки сэмплов', async (t) => {
  const { engine } = setup(t, { samples: true })
  assert.equal(engine.samplesLoaded, false)
  assert.equal(engine.canStart, true, 'щелчок синтезируется — сэмплы не нужны')
  engine.setSong(makeSong({ pattern: pattern('real_kick', [true, false]) }))
  assert.equal(engine.canStart, false, 'паттерну нужны сэмплы')
  engine.setSong(makeSong())
  engine.setVoiceCount(true)
  assert.equal(engine.canStart, false, 'счёту голосом нужны сэмплы')
  await settle()
  assert.equal(engine.samplesLoaded, true)
  assert.equal(engine.canStart, true)
})

test('отписка от подсветки освобождает слот, только если он всё ещё свой', (t) => {
  const { engine } = setup(t)
  const calls: string[] = []
  const releaseA = engine.onPlaybackState(() => calls.push('A'))
  engine.onPlaybackState(() => calls.push('B'))
  releaseA() // слот уже у B — A не должен его снять
  engine.stop() // сбрасывает состояние — уведомляет слушателя
  assert.deepEqual(calls, ['B'])
})

test('счёт голосом — на каждой точке: крупная — номер доли, мелкие — номер внутри доли', async (t) => {
  const { engine, advance, played } = setup(t, { samples: true })
  await settle()
  engine.setBeatDivision(4)
  engine.setVoiceCount(true)
  // Метроном 120 точек в минуту при 4 точках на долю — движку 30 долей в
  // минуту (data/engineSettings.ts): точка раз в 0,5 с.
  engine.setBpm(30)
  await engine.start()
  advance(8200) // круг 4/4 — 16 точек по 0,5 с
  const voice = (n: number) => `sound/Voices/number_${n}.wav`
  // Первые 17: тики доли планируются вместе с ней, заранее.
  assert.deepEqual(
    played.slice(0, 17).map((p) => p.sound),
    [1, 2, 3, 4, 2, 2, 3, 4, 3, 2, 3, 4, 4, 2, 3, 4, 1].map(voice),
    'one two three four, two two three four, three two three four, four two three four, one…'
  )
  const gaps = played.slice(1).map((p, i) => Math.round((p.time - played[i].time) * 1000))
  assert.ok(gaps.every((g) => g === 500), `точка раз в 0,5 с, получили: ${gaps.join(',')}`)
})

test('Стоп сразу глушит уже запланированные удары', async (t) => {
  const { engine, advance, played } = setup(t, { samples: true })
  await settle()
  engine.setBeatDivision(4)
  // Метроном 120 точек в минуту, 4/4: доля 2 с, её 4 удара планируются разом.
  engine.setBpm(30)
  await engine.start()
  advance(300) // прозвучал первый удар, ещё 3 доли уже отданы звуковой карте
  engine.stop()
  const now = Date.now() / 1000
  const ahead = played.filter((p) => p.time > now)
  assert.ok(ahead.length >= 3, `ожидали заранее запланированные удары, их ${ahead.length}`)
  assert.ok(ahead.every((p) => p.silenced), 'после Стоп запланированные удары не должны прозвучать')
})

test('песня доигрывает последнюю долю: конец — в её конце, удары внутри неё не глушатся', async (t) => {
  const { engine, advance, played } = setup(t, { samples: true })
  await settle()
  // 1 такт, хэт на каждую восьмую: у последней доли второй удар — на её середине.
  engine.setSong(makeSong({ pattern: pattern('real_hihat', [true, true]) }))
  engine.setBpm(600) // доля = 100 мс: доли в 0,1 / 0,2 / 0,3 / 0,4 с, конец — 0,5 с
  await engine.start()
  advance(470)
  assert.equal(engine.isPlaying, true, 'последняя доля ещё идёт — песня не кончилась')
  assert.equal(engine.playbackState.beat, 4, 'экраны видят последнюю долю')
  advance(80)
  assert.equal(engine.isPlaying, false, 'после конца последней доли — остановилась')
  assert.deepEqual(
    played.map((p) => Math.round(p.time * 1000)),
    [100, 150, 200, 250, 300, 350, 400, 450],
    'все удары песни, включая второй удар последней доли'
  )
  assert.ok(played.every((p) => !p.silenced), 'конец песни ничего не глушит — дозвучивает')
})

test('старт с секции: 2 такта отсчёта (голос + щелчок на каждую долю), потом сама секция', async (t) => {
  const { engine, advance, played } = setup(t, { samples: true })
  await settle()
  engine.setVoiceCues(true) // голос смены секции во время отсчёта молчит
  engine.setSong(
    makeSong({
      pattern: pattern('real_kick', [true, false]),
      // B — 2 такта: её первый такт не последний, голоса перехода в нём нет
      sections: [section('A', 1, { groove: pattern('real_hihat', [true, false], 2) }), section('B', 2), section('C', 1)],
    })
  )
  engine.setBpm(600) // доля = 100 мс
  await engine.start({ fromBar: 1, countInBars: 2 })
  advance(1300)
  const voice = (n: number) => `sound/Voices/number_${n}.wav`
  const beats = soundsByBeat(played, 600)
  const countIn = [1, 2, 3, 4, 1, 2, 3, 4].map((n) => [voice(n), CLICK])
  assert.deepEqual(beats.slice(0, 8).map((b) => [...b].sort()), countIn.map((b) => [...b].sort()), 'отсчёт: one…four дважды, на каждой доле — щелчок')
  assert.deepEqual(beats.slice(8, 12), [[BD], [BD], [BD], [BD]], 'дальше секция B (паттерн песни), а не A с её хэтом')
})

test('шаги паттерна внутри доли не сдвигают точку кольца (свой паттерн на метрономе)', async (t) => {
  const { engine, advance } = setup(t)
  engine.setBeatDivision(4) // кольцо: 4 точки на долю
  engine.setSong(makeSong({ sections: [], pattern: pattern('real_kick', [true, true, true], 3) })) // триоли
  engine.setBpm(60) // доля = 1 с
  const points: string[] = []
  const steps: number[] = []
  engine.onPlaybackState((s) => {
    if (!engine.isPlaying) return
    const p = `${s.beat}:${s.subBeat}`
    if (p !== points[points.length - 1]) points.push(p)
    if (s.patternStep !== steps[steps.length - 1]) steps.push(s.patternStep)
  })
  await engine.start()
  advance(1050) // первая доля: 0,1–1,1 с
  assert.deepEqual(points, ['1:0', '1:1', '1:2', '1:3'], 'точки кольца идут подряд, без отката на крупную')
  assert.deepEqual(steps, [0, 1, 2], 'шаги паттерна — свои, три на долю')
})
