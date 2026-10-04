// Модель данных: приведение битов и песен из БД к актуальной модели,
// размер бита по длине, расчёты по песне, сравнение документов для записи.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fitMeter, meterOptions } from '../src/data/beatMeter.ts'
import { normalizeBeat } from '../src/data/beatsLibrary.ts'
import { clampBars, createEmptySong, emptySongPattern, normalizeSong, pruneFills, sliceForBeat, squareContent, withSongMeter } from '../src/data/songs.ts'
import { engineSettingsFor, sameSource, songForEngine } from '../src/data/engineSettings.ts'
import { resolveSongForEngine } from '../src/data/resolveBeat.ts'
import { stableStringify } from '../src/data/docSync.ts'
import { Beat, Song } from '../src/types.ts'

const meter = (steps: number) => meterOptions(steps).map((m) => `${m.beatsPerBar}/${m.beatDivision}`)

test('размер бита по числу шагов', () => {
  assert.deepEqual(meter(4), ['1/4'])
  assert.deepEqual(meter(6), ['2/3'])
  assert.deepEqual(meter(8), ['2/4'])
  assert.deepEqual(meter(9), ['3/3'])
  assert.deepEqual(meter(10), ['2/5'])
  assert.deepEqual(meter(16), ['4/4'])
  assert.deepEqual(meter(7), ['1/7'])
  assert.deepEqual(meter(12), ['3/4', '4/3'], 'кратные 12 — выбор')
  assert.deepEqual(meter(1), ['1/1'])
})

test('ударов на долю не больше 8: дальше — N долей по одному удару', () => {
  assert.deepEqual(meter(11), ['11/1'])
  assert.deepEqual(meter(22), ['22/1'], '2/11 → 22/1')
  assert.deepEqual(meter(127), ['127/1'])
  assert.deepEqual(meter(14), ['2/7'], '7 ударов — ещё можно')
  assert.deepEqual(meter(49), ['7/7'])
})

test('выбор размера для кратных 12 держится, пока длина его допускает', () => {
  assert.deepEqual(fitMeter(12, { beatsPerBar: 4, beatDivision: 3 }), { beatsPerBar: 4, beatDivision: 3 })
  assert.deepEqual(fitMeter(13, { beatsPerBar: 4, beatDivision: 3 }), { beatsPerBar: 13, beatDivision: 1 })
})

test('normalizeBeat: длина, размер, старые биты в тактах, битые дорожки', () => {
  const old = normalizeBeat({ id: 'b', name: 'old', bars: 2, beatsPerBar: 2, beatDivision: 4, tracks: [{ role: 'kick', steps: [true] }] } as never)
  assert.equal(old.steps, 16)
  assert.deepEqual(old.tracks[0].steps.length, 16)
  assert.deepEqual(`${old.beatsPerBar}/${old.beatDivision}`, '4/4')

  const broken = normalizeBeat({
    id: 'x',
    steps: 500,
    kitId: 'нет такого',
    tracks: [{ role: 'cowbell' }, { role: 'snare', steps: 'мусор' }, null],
  } as never)
  assert.equal(broken.steps, 128, 'не длиннее BEAT_MAX_STEPS')
  assert.equal(broken.kitId, 'real', 'неизвестный кит — кит по умолчанию')
  assert.equal(broken.bpm, 120, 'у старого бита темпа нет — 120')
  assert.equal(normalizeBeat({ id: 'y', steps: 4, bpm: 999 } as never).bpm, 240)
  assert.deepEqual(broken.tracks.map((t) => t.role), ['snare'], 'неизвестная роль отброшена — иначе резолв упал бы')
  assert.ok(broken.tracks[0].steps.every((v) => v === false))
})

test('normalizeSong: id секций, такты 1..32, размер 4/4 у старых песен, поля движка не хранятся', () => {
  const song = normalizeSong({
    id: '5',
    name: 'Старая',
    bpm: 999,
    sections: [
      { name: '1 2 3 4', bars: 2, intro: true },
      { name: 'VERSE', bars: 100000, fills: [{ at: 3, beatId: 'b' }, { at: -1, beatId: 'b' }, { at: 2 }] },
      { id: 'keep', name: 'CHORUS', bars: 2.6, groove: { steps: 1, tracks: [] } },
    ],
    // старый формат паттерна (16 восьмых, дорожки bd/sd/hh) — выкидывается
    pattern: { steps: 16, tracks: [{ id: 'bd', steps: [true] }] },
  })
  assert.equal(song.id, 5)
  assert.equal(song.bpm, 240)
  assert.deepEqual([song.beatsPerBar, song.beatDivision], [4, 4])
  assert.deepEqual(song.sections.map((s) => s.id), ['s0', 's1', 'keep'], 'id по позиции — одинаковые на всех устройствах')
  assert.deepEqual(song.sections.map((s) => s.bars), [2, 32, 3])
  assert.deepEqual(song.sections[1].fills, [{ at: 3, beatId: 'b' }])
  assert.equal('groove' in song.sections[2], false)
  assert.deepEqual(song.pattern, emptySongPattern(), 'старый паттерн не переносится — пустой')
})

test('normalizeSong: паттерн-бит сохраняется, id и имя — паттерна песни', () => {
  const pattern = { ...emptySongPattern(), id: 'чужой', name: 'Чужое', steps: 8, tracks: [{ role: 'kick', steps: [true, false, false, false, true, false, false, false] }] }
  const song = normalizeSong({ id: 1, pattern })
  assert.deepEqual([song.pattern.id, song.pattern.name, song.pattern.steps, `${song.pattern.beatsPerBar}/${song.pattern.beatDivision}`], ['pattern', 'Паттерн', 8, '2/4'])
  assert.deepEqual(song.pattern.tracks, pattern.tracks)
})

test('normalizeSong: повторяющиеся id секций разводятся', () => {
  const song = normalizeSong({ id: 1, sections: [{ id: 'a' }, { id: 'a' }] })
  assert.deepEqual(song.sections.map((s) => s.id), ['a', 'a_'])
})

test('clampBars: целое 1..32, мусор — 1', () => {
  assert.deepEqual([0, 1, 32, 33, 2.4, Number.NaN, '7'].map(clampBars), [1, 1, 32, 32, 2, 1, 7])
})

test('pruneFills: филлы за концом секции уходят при смене размера', () => {
  const sections = [{ id: 'a', name: 'A', bars: 2, comment: '', intro: false, fills: [{ at: 5, beatId: 'x' }, { at: 7, beatId: 'y' }] }]
  assert.deepEqual(pruneFills(sections, 4)[0].fills, sections[0].fills, '8 долей — оба на месте')
  assert.deepEqual(pruneFills(sections, 3)[0].fills, [{ at: 5, beatId: 'x' }], '6 долей — филл с 8-й доли убран')
  assert.equal(pruneFills(sections, 4)[0], sections[0], 'без изменений — тот же объект')
})

const beat = (id: string, steps: boolean[], extra: Partial<Beat> = {}): Beat => ({
  id, kind: 'beat', name: id, steps: steps.length, beatsPerBar: steps.length / 4, beatDivision: 4, kitId: 'real', bpm: 120,
  tracks: [{ role: 'hihat', steps }],
  ...extra,
})

test('sliceForBeat: кусок грува секции на долю — тот же, что играет движок', () => {
  const groove = beat('g', [true, false, false, false, false, true, true, false]) // 2/4
  const song: Song = {
    ...createEmptySong('s'),
    sections: [
      { id: 'i', name: '1 2 3 4', bars: 1, comment: '', intro: true },
      { id: 'v', name: 'VERSE', bars: 2, comment: '', intro: false, beatId: 'g' },
    ],
  }
  const slice = sliceForBeat(song, 1, 3, 'new', [groove]) // доля 4 секции → вторая доля грува
  assert.deepEqual(slice.tracks[0].steps, [false, true, true, false])
  assert.deepEqual([slice.steps, slice.beatsPerBar, slice.beatDivision], [4, 1, 4])
})

test('sliceForBeat: кусок паттерна песни — от начала песни, по кругу', () => {
  const song: Song = {
    ...createEmptySong('s'),
    sections: [
      { id: 'i', name: '1 2 3 4', bars: 1, comment: '', intro: true },
      { id: 'v', name: 'VERSE', bars: 2, comment: '', intro: false },
    ],
    // 4/4: 16 клеток по 4 на долю, малый на клетке 10
    pattern: { ...emptySongPattern(), steps: 16, beatsPerBar: 4, beatDivision: 4, tracks: [{ role: 'snare', steps: Array.from({ length: 16 }, (_, i) => i === 10) }] },
  }
  // Интро — 1 такт по 4 доли. Доля 3 секции VERSE (at=2) = доля 7 песни →
  // клетки 24..27 по кругу из 16 = 8..11; доля 2 (at=1) → 4..7.
  assert.deepEqual(sliceForBeat(song, 1, 2, 'n', []).tracks, [{ role: 'snare', steps: [false, false, true, false] }])
  assert.deepEqual(sliceForBeat(song, 1, 1, 'n', []).tracks, [{ role: 'snare', steps: [false, false, false, false] }])
})

test('sliceForBeat: ничего не назначено — пустая сетка 1/4', () => {
  const slice = sliceForBeat(createEmptySong('s'), 0, 0, 'n', [])
  assert.deepEqual([slice.steps, slice.beatsPerBar, slice.beatDivision], [4, 1, 4])
  assert.ok(slice.tracks.every((t) => t.steps.every((v) => !v)))
})

test('resolveSongForEngine: биты по ссылкам, удалённый бит пропускается', () => {
  const song: Song = {
    ...createEmptySong('s'),
    sections: [{ id: 'v', name: 'VERSE', bars: 1, comment: '', intro: false, beatId: 'g', fills: [{ at: 1, beatId: 'f' }, { at: 2, beatId: 'нет' }] }],
  }
  const resolved = resolveSongForEngine(song, [beat('g', [true, false, false, false]), beat('f', [false, true, false, false])])
  assert.equal(resolved.sections[0].groove?.tracks[0].sample, 'sound/Real Drum Kit/HH.wav')
  assert.equal(resolved.sections[0].groove?.stepsPerBeat, 4)
  assert.deepEqual(resolved.sections[0].fillPatterns?.map((f) => f.at), [1])
  assert.equal(song.sections[0].groove, undefined, 'исходная песня не тронута')
})

test('stableStringify не зависит от порядка ключей', () => {
  assert.equal(stableStringify({ b: 1, a: { d: [2, { y: 1, x: 2 }], c: 3 } }), stableStringify({ a: { c: 3, d: [2, { x: 2, y: 1 }] }, b: 1 }))
  assert.equal(stableStringify({ a: undefined, b: 1 }), stableStringify({ b: 1 }), 'undefined-поля Firestore не хранит')
})

test('sliceForBeat: темп нового бита — темп песни', () => {
  const song = { ...createEmptySong('s'), bpm: 93 }
  assert.equal(sliceForBeat(song, 0, 0, 'n', []).bpm, 93)
})

test('withSongMeter: размер в пределах, филлы за концом секций уходят', () => {
  const song: Song = {
    ...createEmptySong('s'),
    sections: [{ id: 'v', name: 'VERSE', bars: 1, comment: '', intro: false, fills: [{ at: 3, beatId: 'f' }] }],
  }
  const next = withSongMeter(song, { beatsPerBar: 3, beatDivision: 99 })
  assert.deepEqual([next.beatsPerBar, next.beatDivision], [3, 8])
  assert.deepEqual(next.sections[0].fills, [])
})

const metronome = { bpm: 120, beatsPerBar: 4, beatDivision: 4, voiceCount: true, flash: false }

test('метроном: BPM — скорость каждой точки, движку — BPM доли', () => {
  const s = engineSettingsFor({ kind: 'metronome' }, { metronome, songs: [], beats: [], voiceCues: true })!
  assert.equal(s.bpm, 30, '120 точек в минуту при 4 точках на долю — 30 долей в минуту')
  assert.deepEqual([s.beatsPerBar, s.beatDivision, s.voiceCount, s.voiceCues], [4, 4, true, false])
  assert.equal(s.content, null, 'метроном — щелчок, без песни')
})

test('песня и бит — со своими темпом и размером, метроном на них не влияет', () => {
  const song: Song = { ...createEmptySong('s'), bpm: 90, beatsPerBar: 3, beatDivision: 2 }
  const b = beat('b', [true, false, false, false, false, false])
  const inputs = { metronome, songs: [song], beats: [{ ...b, bpm: 70, beatsPerBar: 2, beatDivision: 3 }], voiceCues: true }

  const forSong = engineSettingsFor({ kind: 'song', songId: song.id }, inputs)!
  assert.deepEqual([forSong.bpm, forSong.beatsPerBar, forSong.beatDivision], [90, 3, 2])
  assert.equal(forSong.voiceCount, false, 'счёт вслух — настройка метронома')
  assert.equal(forSong.voiceCues, true, 'голос при смене секции — для песен')

  const forBeat = engineSettingsFor({ kind: 'beat', beatId: 'b' }, inputs)!
  assert.deepEqual([forBeat.bpm, forBeat.beatsPerBar, forBeat.beatDivision, forBeat.voiceCount], [70, 2, 3, false])
  const asSong = songForEngine(forBeat.content)!
  assert.deepEqual(asSong.sections, [], 'бит играет без секций — ровно своей длиной по кругу')
  assert.equal(asSong.pattern.stepsPerBeat, 3)

  assert.equal(engineSettingsFor({ kind: 'song', songId: 404 }, inputs), null, 'нет песни — играть нечего')
  assert.equal(engineSettingsFor({ kind: 'beat', beatId: 'нет' }, inputs), null)
})

test('sameSource', () => {
  assert.equal(sameSource({ kind: 'song', songId: 1 }, { kind: 'song', songId: 1 }), true)
  assert.equal(sameSource({ kind: 'song', songId: 1 }, { kind: 'song', songId: 2 }), false)
  assert.equal(sameSource({ kind: 'metronome' }, { kind: 'beat', beatId: 'b' }), false)
  assert.equal(sameSource({ kind: 'beat', beatId: 'b' }, { kind: 'beat', beatId: 'b' }), true)
})

test('squareContent: что копируется из квадратика', () => {
  const one = beat('one', [true, false, false, true]) // 1/4 — ровно одна доля
  const two = beat('two', [true, false, false, false, false, true, true, false]) // 2/4
  const song: Song = {
    ...createEmptySong('s'),
    bpm: 101,
    sections: [
      { id: 'a', name: 'A', bars: 1, comment: '', intro: false, fills: [{ at: 0, beatId: 'one' }, { at: 2, beatId: 'two' }] },
      { id: 'b', name: 'B', bars: 1, comment: '', intro: false },
    ],
  }
  assert.deepEqual(squareContent(song, 0, 0, 'n', [one, two]), { beatId: 'one' }, 'филл на одну долю — ссылка на него')
  const piece = squareContent(song, 0, 3, 'n', [one, two]) as { beat: Beat }
  assert.deepEqual(piece.beat.tracks[0].steps, [false, true, true, false], 'вторая доля длинного филла')
  assert.deepEqual([piece.beat.steps, piece.beat.beatsPerBar, piece.beat.bpm], [4, 1, 101])
  assert.equal(squareContent(song, 1, 0, 'n', [one, two]), null, 'только щелчок')
  const withPattern: Song = { ...song, pattern: { ...emptySongPattern(), steps: 2, beatsPerBar: 1, beatDivision: 2, tracks: [{ role: 'kick', steps: [true, false] }] } }
  assert.deepEqual((squareContent(withPattern, 1, 0, 'n', []) as { beat: Beat }).beat.tracks, [{ role: 'kick', steps: [true, false] }], 'кусок паттерна песни')
})

test('паттерн песни в редакторе: играет только он, в темпе песни', () => {
  const pattern = { ...emptySongPattern(), steps: 6, beatsPerBar: 2, beatDivision: 3 }
  const song: Song = { ...createEmptySong('s'), bpm: 84, pattern }
  const s = engineSettingsFor({ kind: 'songPattern', songId: song.id }, { metronome, songs: [song], beats: [], voiceCues: true })!
  assert.deepEqual([s.bpm, s.beatsPerBar, s.beatDivision, s.voiceCues], [84, 2, 3, false])
  assert.deepEqual(songForEngine(s.content)!.sections, [], 'без секций — по кругу')
  assert.equal(engineSettingsFor({ kind: 'songPattern', songId: 404 }, { metronome, songs: [song], beats: [], voiceCues: true }), null)
})

test('песня для движка: паттерн песни разрешён в сэмплы кита', () => {
  const song: Song = { ...createEmptySong('s'), pattern: { ...emptySongPattern(), tracks: [{ role: 'kick', steps: [true, false, false, false] }] } }
  const engineSong = songForEngine({ song, beats: [] })!
  assert.deepEqual(engineSong.pattern.tracks.map((t) => [t.id, t.sample]), [['real_kick', 'sound/Real Drum Kit/BD.wav']])
  assert.equal(engineSong.pattern.stepsPerBeat, 4)
})
