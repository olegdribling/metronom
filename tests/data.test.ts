// Модель данных: приведение битов и песен из БД к актуальной модели,
// размер бита по длине, расчёты по песне, сравнение документов для записи.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fitMeter, meterOptions } from '../src/data/beatMeter.ts'
import { normalizeBeat } from '../src/data/beatsLibrary.ts'
import {
  adoptLinked,
  clampBars,
  copyBeat,
  copySectionSettings,
  copySquares,
  createEmptySong,
  embedLibraryBeats,
  emptySongPattern,
  fillBeats,
  normalizeSong,
  pruneFills,
  sectionAtBar,
  sliceForBeat,
  spreadLinked,
  squaresTarget,
  squareContent,
  withSongComment,
  withSongMeter,
} from '../src/data/songs.ts'
import { engineSettingsFor, playSong, sameSource, songForEngine } from '../src/data/engineSettings.ts'
import { resolveSongForEngine } from '../src/data/resolveBeat.ts'
import { moveItem, moveShown, orderedFirst, withListFieldsOf } from '../src/data/order.ts'
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

test('normalizeSong: id секций, такты 1..32, размер 4/4 у старых песен, поля движка и вступление не хранятся', () => {
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
  // Вступление «1 2 3 4» убрано (вместо него — отсчёт), id остальным — по
  // позиции вместе с ним: одинаковые на всех устройствах.
  assert.deepEqual(song.sections.map((s) => s.id), ['s1', 'keep'])
  assert.deepEqual(song.sections.map((s) => s.bars), [32, 3])
  assert.equal('intro' in song.sections[0], false)
  assert.deepEqual(song.sections[0].fills, [{ at: 3, beatId: 'b' }])
  assert.equal('groove' in song.sections[1], false)
  assert.deepEqual(song.pattern, emptySongPattern(), 'старый паттерн не переносится — пустой')
})

test('normalizeSong: бит секции и филлы — копии в песне; старые ссылки — до переноса', () => {
  const groove = { id: 'g', name: 'Рок', steps: 8, beatsPerBar: 2, beatDivision: 4, kitId: 'real', tracks: [{ role: 'kick', steps: [true] }] }
  const song = normalizeSong({
    id: 1,
    sections: [
      { id: 'a', name: 'A', bars: 1, beat: groove, fills: [{ at: 1, beat: { ...groove, id: 'f' } }, { at: 2, beatId: 'old' }, { at: 3, beat: 'мусор' }] },
      { id: 'b', name: 'B', bars: 1, beatId: 'link' },
    ],
  })
  const [a, b] = song.sections
  assert.deepEqual([a.beat?.id, a.beat?.steps, a.beat?.tracks[0].steps.length], ['g', 8, 8], 'бит секции — нормализованная копия')
  assert.deepEqual(a.fills?.map((f) => [f.at, f.beat?.id ?? null, f.beatId ?? null]), [[1, 'f', null], [2, null, 'old']], 'мусор отброшен')
  assert.deepEqual([b.beat, b.beatId], [undefined, 'link'], 'старая ссылка — пока как есть')
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
  const sections = [{ id: 'a', name: 'A', bars: 2, comment: '', fills: [{ at: 5, beatId: 'x' }, { at: 7, beatId: 'y' }] }]
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
      { id: 'a', name: 'A', bars: 1, comment: '' },
      { id: 'v', name: 'VERSE', bars: 2, comment: '', beat: groove },
    ],
  }
  const slice = sliceForBeat(song, 1, 3, 'new') // доля 4 секции → вторая доля грува
  assert.deepEqual(slice.tracks[0].steps, [false, true, true, false])
  assert.deepEqual([slice.steps, slice.beatsPerBar, slice.beatDivision], [4, 1, 4])
})

test('sliceForBeat: кусок паттерна песни — от начала песни, по кругу', () => {
  const song: Song = {
    ...createEmptySong('s'),
    sections: [
      { id: 'a', name: 'A', bars: 1, comment: '' },
      { id: 'v', name: 'VERSE', bars: 2, comment: '' },
    ],
    // 4/4: 16 клеток по 4 на долю, малый на клетке 10
    pattern: { ...emptySongPattern(), steps: 16, beatsPerBar: 4, beatDivision: 4, tracks: [{ role: 'snare', steps: Array.from({ length: 16 }, (_, i) => i === 10) }] },
  }
  // Секция A — 1 такт по 4 доли. Доля 3 секции VERSE (at=2) = доля 7 песни →
  // клетки 24..27 по кругу из 16 = 8..11; доля 2 (at=1) → 4..7.
  assert.deepEqual(sliceForBeat(song, 1, 2, 'n').tracks, [{ role: 'snare', steps: [false, false, true, false] }])
  assert.deepEqual(sliceForBeat(song, 1, 1, 'n').tracks, [{ role: 'snare', steps: [false, false, false, false] }])
})

test('sliceForBeat: ничего не назначено — пустая сетка 1/4', () => {
  const slice = sliceForBeat({ ...createEmptySong('s'), sections: [{ id: 'v', name: 'VERSE', bars: 1, comment: '' }] }, 0, 0, 'n')
  assert.deepEqual([slice.steps, slice.beatsPerBar, slice.beatDivision], [4, 1, 4])
  assert.ok(slice.tracks.every((t) => t.steps.every((v) => !v)))
})

test('resolveSongForEngine: биты — копии в песне, старая ссылка без копии не звучит', () => {
  const song: Song = {
    ...createEmptySong('s'),
    sections: [
      {
        id: 'v', name: 'VERSE', bars: 1, comment: '',
        beat: beat('g', [true, false, false, false]),
        fills: [{ at: 1, beat: beat('f', [false, true, false, false]) }, { at: 2, beatId: 'ссылка' }],
      },
    ],
  }
  const resolved = resolveSongForEngine(song)
  assert.equal(resolved.sections[0].groove?.tracks[0].sample, 'sound/Real Drum Kit/HH.wav')
  assert.equal(resolved.sections[0].groove?.stepsPerBeat, 4)
  assert.deepEqual(resolved.sections[0].fillPatterns?.map((f) => f.at), [1])
  assert.equal(song.sections[0].groove, undefined, 'исходная песня не тронута')
})

test('перенос старых ссылок: копии битов встают в песню, удалённый бит убирается', () => {
  const g = beat('g', [true, false, false, false])
  const f = beat('f', [false, true, false, false])
  const song: Song = {
    ...createEmptySong('s'),
    sections: [
      { id: 'a', name: 'A', bars: 2, comment: '' },
      { id: 'v', name: 'VERSE', bars: 1, comment: '', beatId: 'g', fills: [{ at: 1, beatId: 'f' }, { at: 2, beatId: 'нет' }] },
      { id: 'c', name: 'CHORUS', bars: 1, comment: '', beatId: 'нет' },
    ],
  }
  const next = embedLibraryBeats(song, [g, f])
  const [plain, verse, chorus] = next.sections
  assert.equal(plain, song.sections[0], 'секция без ссылок — та же')
  assert.deepEqual(verse.beat?.tracks, g.tracks)
  assert.notEqual(verse.beat, g, 'копия, а не тот же бит')
  assert.deepEqual(verse.fills?.map((x) => [x.at, x.beat?.tracks[0].steps]), [[1, [false, true, false, false]]], 'филл удалённого бита убран')
  assert.equal('beatId' in verse, false)
  assert.deepEqual([chorus.beat, 'beatId' in chorus], [undefined, false], 'бит секции удалён — играет паттерн песни')
  assert.equal(embedLibraryBeats(next, [g, f]), next, 'ссылок нет — та же песня')

  const copy = copyBeat(g, 'x')
  copy.tracks[0].steps[0] = false
  assert.equal(g.tracks[0].steps[0], true, 'правка копии не трогает бит в «Битах»')
})

test('stableStringify не зависит от порядка ключей', () => {
  assert.equal(stableStringify({ b: 1, a: { d: [2, { y: 1, x: 2 }], c: 3 } }), stableStringify({ a: { c: 3, d: [2, { x: 2, y: 1 }] }, b: 1 }))
  assert.equal(stableStringify({ a: undefined, b: 1 }), stableStringify({ b: 1 }), 'undefined-поля Firestore не хранит')
})

test('sliceForBeat: темп нового бита — темп песни', () => {
  const song = { ...createEmptySong('s'), bpm: 93, sections: [{ id: 'v', name: 'VERSE', bars: 1, comment: '' }] }
  assert.equal(sliceForBeat(song, 0, 0, 'n').bpm, 93)
})

test('withSongMeter: размер в пределах, филлы за концом секций уходят', () => {
  const song: Song = {
    ...createEmptySong('s'),
    sections: [{ id: 'v', name: 'VERSE', bars: 1, comment: '', fills: [{ at: 3, beatId: 'f' }] }],
  }
  const next = withSongMeter(song, { beatsPerBar: 3, beatDivision: 99 })
  assert.deepEqual([next.beatsPerBar, next.beatDivision], [3, 8])
  assert.deepEqual(next.sections[0].fills, [])
})

const metronome = { bpm: 120, beatsPerBar: 4, beatDivision: 4, voiceCount: true, flash: false, usePattern: false, patternSpeed: 1 as const }

test('метроном: BPM — скорость каждой точки, движку — BPM доли', () => {
  const s = engineSettingsFor({ kind: 'metronome' }, { metronome, metronomePattern: null, songs: [], beats: [], voiceCues: true })!
  assert.equal(s.bpm, 30, '120 точек в минуту при 4 точках на долю — 30 долей в минуту')
  assert.deepEqual([s.beatsPerBar, s.beatDivision, s.voiceCount, s.voiceCues], [4, 4, true, false])
  assert.equal(s.content, null, 'метроном — щелчок, без песни')
})

test('▶ у песни в «Концерте»: метроном как есть, только темп — песни (как 120 на метрономе)', () => {
  const song: Song = { ...createEmptySong('s'), bpm: 100, beatsPerBar: 3, beatDivision: 2 }
  const pattern = { ...emptySongPattern(), id: 'metronome-pattern', steps: 2, beatsPerBar: 1, beatDivision: 2, tracks: [{ role: 'kick' as const, steps: [true, false] }] }
  const inputs = { metronome, metronomePattern: pattern, songs: [song], beats: [], voiceCues: true }
  const click = engineSettingsFor({ kind: 'songClick', songId: song.id }, inputs)!
  assert.equal(click.bpm, 25, '100 у песни — 100 точек в минуту при 4 точках на долю')
  assert.deepEqual([click.beatsPerBar, click.beatDivision, click.voiceCount, click.voiceCues], [4, 4, true, false], 'размер и голос — метронома, не песни')
  assert.equal(click.content, null, 'щелчок, а не песня')
  const withPattern = engineSettingsFor({ kind: 'songClick', songId: song.id }, { ...inputs, metronome: { ...metronome, usePattern: true, patternSpeed: 2 } })!
  assert.deepEqual(withPattern.content, { beat: pattern, speed: 2 }, 'свой паттерн метронома и его скорость')
  assert.equal(engineSettingsFor({ kind: 'songClick', songId: 404 }, inputs), null, 'песни нет — играть нечего')
})

test('песня и бит — со своими темпом и размером, метроном на них не влияет', () => {
  const song: Song = { ...createEmptySong('s'), bpm: 90, beatsPerBar: 3, beatDivision: 2 }
  const b = beat('b', [true, false, false, false, false, false])
  const inputs = { metronome, metronomePattern: null, songs: [song], beats: [{ ...b, bpm: 70, beatsPerBar: 2, beatDivision: 3 }], voiceCues: true }

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
      { id: 'a', name: 'A', bars: 1, comment: '', fills: [{ at: 0, beat: one }, { at: 2, beat: two }] },
      { id: 'b', name: 'B', bars: 1, comment: '' },
    ],
  }
  const same = squareContent(song, 0, 0, 'n')!
  assert.deepEqual([same.id, same.tracks], ['n', one.tracks], 'филл на одну долю — его копия')
  assert.notEqual(same.tracks[0].steps, one.tracks[0].steps, 'копия, а не тот же бит')
  const piece = squareContent(song, 0, 3, 'n')!
  assert.deepEqual(piece.tracks[0].steps, [false, true, true, false], 'вторая доля длинного филла')
  assert.deepEqual([piece.steps, piece.beatsPerBar, piece.bpm], [4, 1, 101])
  assert.equal(squareContent(song, 1, 0, 'n'), null, 'только щелчок')
  const withPattern: Song = { ...song, pattern: { ...emptySongPattern(), steps: 2, beatsPerBar: 1, beatDivision: 2, tracks: [{ role: 'kick', steps: [true, false] }] } }
  assert.deepEqual(squareContent(withPattern, 1, 0, 'n')!.tracks, [{ role: 'kick', steps: [true, false] }], 'кусок паттерна песни')
})

test('паттерн песни в редакторе: играет только он, в темпе песни', () => {
  const pattern = { ...emptySongPattern(), steps: 6, beatsPerBar: 2, beatDivision: 3 }
  const song: Song = { ...createEmptySong('s'), bpm: 84, pattern }
  const s = engineSettingsFor({ kind: 'songPattern', songId: song.id }, { metronome, metronomePattern: null, songs: [song], beats: [], voiceCues: true })!
  assert.deepEqual([s.bpm, s.beatsPerBar, s.beatDivision, s.voiceCues], [84, 2, 3, false])
  assert.deepEqual(songForEngine(s.content)!.sections, [], 'без секций — по кругу')
  assert.equal(engineSettingsFor({ kind: 'songPattern', songId: 404 }, { metronome, metronomePattern: null, songs: [song], beats: [], voiceCues: true }), null)
})

test('песня для движка: паттерн песни разрешён в сэмплы кита', () => {
  const song: Song = { ...createEmptySong('s'), pattern: { ...emptySongPattern(), tracks: [{ role: 'kick', steps: [true, false, false, false] }] } }
  const engineSong = songForEngine({ song })!
  assert.deepEqual(engineSong.pattern.tracks.map((t) => [t.id, t.sample]), [['real_kick', 'sound/Real Drum Kit/BD.wav']])
  assert.equal(engineSong.pattern.stepsPerBeat, 4)
})

test('свой паттерн метронома: скорость и размер метронома, доля паттерна = доля метронома', () => {
  const pattern = { ...emptySongPattern(), id: 'metronome-pattern', steps: 6, beatsPerBar: 2, beatDivision: 3, tracks: [{ role: 'kick' as const, steps: [true, false, false, true, false, false] }] }
  const on = { ...metronome, usePattern: true }
  const s = engineSettingsFor({ kind: 'metronome' }, { metronome: on, metronomePattern: pattern, songs: [], beats: [], voiceCues: false })!
  assert.equal(s.bpm, 30, 'метроном 120 точек в минуту по 4 на долю — 30 долей; паттерн играет в этих долях')
  assert.deepEqual([s.beatsPerBar, s.beatDivision], [4, 4], 'размер и кольцо — метронома')
  assert.deepEqual(s.content, { beat: pattern, speed: 1 })
  const engineSong = songForEngine(s.content)!
  assert.equal(engineSong.pattern.stepsPerBeat, 3, 'клетки паттерна делят долю метронома на 3 (триоли)')
  assert.deepEqual(engineSong.sections, [], 'по кругу своей длины')

  const off = engineSettingsFor({ kind: 'metronome' }, { metronome, metronomePattern: pattern, songs: [], beats: [], voiceCues: false })!
  assert.equal(off.content, null, 'галочка снята — щелчок')
  const notSignedIn = engineSettingsFor({ kind: 'metronome' }, { metronome: on, metronomePattern: null, songs: [], beats: [], voiceCues: false })!
  assert.equal(notSignedIn.content, null, 'паттерна нет (не вошли) — щелчок')

  const editor = engineSettingsFor({ kind: 'metronomePattern' }, { metronome, metronomePattern: null, songs: [], beats: [], voiceCues: false })!
  assert.equal((editor.content as { beat: { id: string } }).beat.id, 'metronome-pattern', 'в редакторе играет он всегда, ещё не набит — пустой')
  assert.equal(editor.bpm, 30, 'в редакторе — та же скорость доли, что на метрономе')
})

test('скорость своего паттерна ×2 и ×½ — щелчки (доля метронома) те же', () => {
  const pattern = { ...emptySongPattern(), id: 'metronome-pattern', steps: 3, beatsPerBar: 1, beatDivision: 3, tracks: [{ role: 'kick' as const, steps: [true, false, true] }] }
  const play = (speed: 0.5 | 1 | 2) => {
    const s = engineSettingsFor({ kind: 'metronome' }, { metronome: { ...metronome, usePattern: true, patternSpeed: speed }, metronomePattern: pattern, songs: [], beats: [], voiceCues: false })!
    return { bpm: s.bpm, pattern: songForEngine(s.content)!.pattern }
  }
  assert.equal(play(2).bpm, play(1).bpm, 'темп метронома не меняется')
  assert.equal(play(2).pattern.stepsPerBeat, 6, '×2 — вдвое больше клеток на долю')
  const half = play(0.5).pattern
  assert.deepEqual([half.steps, half.stepsPerBeat], [6, 3], '×½ — клетка растянута на два шага')
  assert.deepEqual(half.tracks[0].steps, [true, false, false, false, true, false])
})

test('концерт: голос смены секции всегда, остальное — как у песни', () => {
  const song: Song = { ...createEmptySong('s'), bpm: 95, beatsPerBar: 3, beatDivision: 2 }
  const inputs = { metronome, metronomePattern: null, songs: [song], beats: [], voiceCues: false }
  const concert = engineSettingsFor({ kind: 'concert', songId: song.id }, inputs)!
  assert.deepEqual([concert.bpm, concert.beatsPerBar, concert.beatDivision, concert.voiceCount], [95, 3, 2, false])
  assert.equal(concert.voiceCues, true, 'на сцене — всегда, даже если в настройках выключен')
  assert.equal(engineSettingsFor({ kind: 'song', songId: song.id }, inputs)!.voiceCues, false, 'в песне — по настройке')
  assert.equal(engineSettingsFor({ kind: 'concert', songId: 404 }, inputs), null)
  assert.equal(sameSource({ kind: 'concert', songId: 1 }, { kind: 'song', songId: 1 }), false, 'другой звук — другой источник')
})

test('sectionAtBar: секция и такт в ней по такту песни', () => {
  const sec = (id: string, bars: number) => ({ id, name: id, bars, comment: '' })
  const song: Song = { ...createEmptySong('s'), sections: [sec('v', 4), sec('c', 8)] }
  assert.deepEqual(sectionAtBar(song, 0), { sectionIndex: 0, barInSection: 1 })
  assert.deepEqual(sectionAtBar(song, 3), { sectionIndex: 0, barInSection: 4 })
  assert.deepEqual(sectionAtBar(song, 4), { sectionIndex: 1, barInSection: 1 })
  assert.deepEqual(sectionAtBar(song, 11), { sectionIndex: 1, barInSection: 8 })
  assert.equal(sectionAtBar(song, 12), null, 'за концом песни')
})

test('playSong: песня — всегда с отсчёта, с начала или с секции; играет — заново', async () => {
  const calls: string[] = []
  const engine = {
    isPlaying: false,
    stop: () => calls.push('stop'),
    start: async (opts?: { fromBar?: number; countInBars?: number }) => void calls.push(`start ${opts?.fromBar} ${opts?.countInBars}`),
  }
  await playSong(engine)
  assert.deepEqual(calls, ['start 0 2'], 'с начала, 2 такта отсчёта')
  engine.isPlaying = true
  await playSong(engine, 6)
  assert.deepEqual(calls, ['start 0 2', 'stop', 'start 6 2'], 'уже играет — с отсчёта с этой секции')
  assert.deepEqual(createEmptySong('Новая').sections, [], 'новая песня — без вступления «1 2 3 4»')
})

test('концерт: доли под филлами — как играет движок', () => {
  const twoBeats = beat('two', Array(8).fill(false)) // 2/4 — две доли
  const section = { id: 'v', name: 'v', bars: 2, comment: '', fills: [{ at: 1, beat: twoBeats }, { at: 7, beat: twoBeats }, { at: 4, beatId: 'ссылка' }] }
  assert.deepEqual([...fillBeats(section, 4)].sort((a, b) => a - b), [1, 2, 7], 'конец секции обрезает, старая ссылка без копии не звучит')
})

test('филл в своём редакторе: играет только он, в темпе песни', () => {
  const fill = beat('f', [true, false, false, false, false, true, false, false]) // 2/4
  const song: Song = { ...createEmptySong('s'), bpm: 77, sections: [{ id: 'v', name: 'VERSE', bars: 2, comment: '', fills: [{ at: 3, beat: fill }] }] }
  const inputs = { metronome, metronomePattern: null, songs: [song], beats: [], voiceCues: true }
  const s = engineSettingsFor({ kind: 'songFill', songId: song.id, sectionId: 'v', at: 3 }, inputs)!
  assert.deepEqual([s.bpm, s.beatsPerBar, s.beatDivision, s.voiceCues], [77, 2, 4, false])
  assert.deepEqual(songForEngine(s.content)!.sections, [], 'без секций — по кругу')
  assert.equal(engineSettingsFor({ kind: 'songFill', songId: song.id, sectionId: 'v', at: 0 }, inputs), null, 'на этой доле филла нет')
})

test('«Копировать в…»: такты, бит, брейки и комментарий — копиями; id и название — свои', () => {
  const groove = beat('g', [true, false, false, false, true, false, false, false])
  const brk = beat('f', [true, true, true, true])
  const src = { id: 'v1', name: 'VERSE', bars: 8, comment: 'Тихо', beat: groove, fills: [{ at: 30, beat: brk }] }
  const target = { id: 'v2', name: 'VERSE 2', bars: 4, comment: 'Старое', beatId: 'ссылка', fills: [{ at: 1, beat: beat('x', [true, false, false, false]) }] }
  const copy = copySectionSettings(target, src)
  assert.deepEqual([copy.id, copy.name, copy.bars, copy.comment], ['v2', 'VERSE 2', 8, 'Тихо'])
  assert.equal('beatId' in copy, false, 'старая ссылка уходит')
  assert.deepEqual(copy.beat?.tracks, groove.tracks)
  assert.notEqual(copy.beat, groove, 'бит секции — своя копия')
  assert.deepEqual(copy.fills?.map((f) => [f.at, f.beat?.tracks]), [[30, brk.tracks]], 'брейки — как у источника, свои прежние ушли')
  assert.notEqual(copy.fills?.[0].beat, brk, 'брейк — своя копия')
  copy.fills![0].beat!.tracks[0].steps[0] = false
  assert.equal(brk.tracks[0].steps[0], true, 'правка копии не трогает источник')

  const plain = copySectionSettings(target, { id: 'c', name: 'CHORUS', bars: 2, comment: '' })
  assert.deepEqual([plain.bars, plain.comment, 'beat' in plain, 'fills' in plain, 'beatId' in plain], [2, '', false, false, false], 'без бита и брейков — у цели их тоже нет')
})

test('связанные секции: правка одной — во все такие же, отвязанная живёт своей', () => {
  const groove = beat('g', [true, false, false, false])
  const sec = (id: string, name: string, extra = {}) => ({ id, name, bars: 4, comment: '', ...extra })
  const song: Song = {
    ...createEmptySong('s'),
    sections: [sec('v1', 'VERSE'), sec('c1', 'CHORUS'), sec('v2', 'VERSE'), sec('v3', 'VERSE', { own: true, bars: 12 }), sec('v4', 'VERSE')],
  }
  // поправили первый куплет: 8 тактов, бит, комментарий
  const edited: Song = { ...song, sections: song.sections.map((s) => (s.id === 'v1' ? { ...s, bars: 8, comment: 'Тихо', beat: groove } : s)) }
  const next = spreadLinked(edited, 'v1')
  const by = (id: string) => next.sections.find((s) => s.id === id)!
  assert.deepEqual([by('v2').bars, by('v2').comment, by('v2').beat?.tracks], [8, 'Тихо', groove.tracks], 'связанный куплет — как поправленный')
  assert.deepEqual([by('v4').bars, by('v4').comment], [8, 'Тихо'])
  assert.notEqual(by('v2').beat, by('v1').beat, 'бит — своя копия')
  assert.deepEqual([by('v3').bars, by('v3').comment, by('v3').beat], [12, '', undefined], 'отвязанный не тронут')
  assert.equal(by('c1').bars, 4, 'другой вид не тронут')
  assert.equal(spreadLinked(edited, 'v3'), edited, 'правка отвязанной — только она')
  assert.equal(spreadLinked(edited, 'c1'), edited, 'единственная такая — песня та же')

  // новая секция того же вида встаёт к связанным; привязанная снова — тоже
  const added = adoptLinked({ ...next, sections: [...next.sections, sec('v5', 'VERSE')] }, 'v5')
  assert.deepEqual([added.sections.at(-1)!.bars, added.sections.at(-1)!.comment], [8, 'Тихо'])
  const relinked = adoptLinked({ ...next, sections: next.sections.map((s) => (s.id === 'v3' ? { id: s.id, name: s.name, bars: s.bars, comment: s.comment } : s)) }, 'v3')
  assert.equal(relinked.sections.find((s) => s.id === 'v3')!.bars, 8, 'привязали — снова как остальные')
  assert.equal(adoptLinked(next, 'c1'), next, 'связанных нет — та же песня')

  const raw = normalizeSong({ id: 1, sections: [{ id: 'a', name: 'VERSE', bars: 2, own: true }, { id: 'b', name: 'VERSE', bars: 2, own: 'да' }] })
  assert.deepEqual(raw.sections.map((s) => s.own ?? false), [true, false], '«отвязана» хранится')
})

test('несколько квадратиков: копия один раз вплотную, не помещается — нельзя', () => {
  assert.equal(squaresTarget(16, 0, 3, 1), 4, 'такт 1 → такт 2')
  assert.equal(squaresTarget(16, 12, 15, 1), null, 'последний такт вправо — некуда')
  assert.equal(squaresTarget(16, 10, 13, 1), null, '4 доли с 14-й — не влезают')
  assert.equal(squaresTarget(16, 4, 7, -1), 0)
  assert.equal(squaresTarget(16, 2, 5, -1), null, 'влево до начала секции не влезает')
  assert.equal(squaresTarget(16, 3, 3, 1), 4, 'одна доля — как раньше')

  const one = beat('one', [true, false, false, true]) // 1/4
  const two = beat('two', [true, false, false, false, false, true, true, false]) // 2/4
  const song: Song = {
    ...createEmptySong('s'),
    sections: [{ id: 'v', name: 'VERSE', bars: 4, comment: '', fills: [{ at: 0, beat: one }, { at: 2, beat: two }, { at: 5, beat: one }] }],
  }
  let n = 0
  const copy = copySquares(song, 0, 0, 3, 1, () => `n${++n}`)!
  assert.deepEqual([copy.from, copy.to], [4, 7], 'выделение — на копии')
  assert.deepEqual(copy.fills.map((f) => f.at), [0, 2, 4, 6, 7], 'копия на 4..7, брейк на 5 заменён (на 5 в оригинале — щелчок)')
  const at = (i: number) => copy.fills.find((f) => f.at === i)!.beat!
  assert.deepEqual(at(4).tracks, one.tracks, 'доля 1 — копия однодольного брейка')
  assert.deepEqual([at(6).tracks[0].steps, at(7).tracks[0].steps], [[true, false, false, false], [false, true, true, false]], 'двухдольный брейк — по долям')
  assert.equal(copySquares(song, 0, 12, 15, 1, () => 'x'), null, 'не помещается — ничего')
  const left = copySquares(song, 0, 4, 7, -1, () => 'l')!
  assert.deepEqual([left.from, left.to], [0, 3])
})

test('свой порядок списка: переставленные — по месту, новые — в конце по времени создания', () => {
  type Item = { id: number; order?: number }
  const byId = orderedFirst<Item>((a, b) => a.id - b.id)
  const items: Item[] = [{ id: 5 }, { id: 1, order: 1 }, { id: 9 }, { id: 3, order: 0 }]
  assert.deepEqual([...items].sort(byId).map((i) => i.id), [3, 1, 5, 9])

  const list: Item[] = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }]
  const moved = moveItem(list, 0, 2)
  assert.deepEqual(moved.map((i) => [i.id, i.order]), [[2, 0], [3, 1], [1, 2], [4, 3]])
  assert.deepEqual(moveItem(moved, 3, 0).map((i) => i.id), [4, 2, 3, 1])
  assert.equal(moveItem(moved, 1, 1)[1], moved[1], 'место не изменилось — тот же объект (не перезаписывать)')

  assert.equal(normalizeSong({ id: 1, order: 4 }).order, 4, 'место песни хранится')
  assert.equal('order' in normalizeSong({ id: 1, order: 'x' }), false)
  assert.equal(normalizeBeat({ id: 'b', order: 2 }).order, 2, 'место бита хранится')
  assert.equal('order' in copyBeat({ ...normalizeBeat({ id: 'b' }), order: 2 }, 'c'), false, 'у копии в песне места в «Битах» нет')
})

test('перестановка — по id: список на экране и в состоянии могли разойтись', () => {
  type Item = { id: number; order?: number }
  const shown: Item[] = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }]
  // Пока держали строку, с другого устройства добавили песню в начало.
  const now: Item[] = [{ id: 9 }, ...shown]
  assert.deepEqual(moveShown(now, shown, 0, 2)?.map((i) => i.id), [9, 2, 3, 1, 4], 'первая — за третью, как на экране')
  assert.deepEqual(moveShown(now, shown, 3, 1)?.map((i) => i.id), [9, 1, 4, 2, 3], 'четвёртая — на место второй')
  assert.equal(moveShown(shown.filter((i) => i.id !== 3), shown, 0, 2), null, 'той, к которой отпустили, уже нет — ничего')
})

test('дискета не трогает место и комментарий в списке: их могли поменять с другого устройства', () => {
  const stored = { id: 1, name: 'Сохранённая', order: 3, comment: 'новый' }
  assert.deepEqual(withListFieldsOf({ id: 1, name: 'Правка', order: 0, comment: 'старый' }, stored), { id: 1, name: 'Правка', order: 3, comment: 'новый' })
  const plain = withListFieldsOf({ id: 1, name: 'Правка', order: 0, comment: 'старый' }, { id: 1, name: 'Сохранённая' })
  assert.equal('order' in plain || 'comment' in plain, false)
})

test('комментарий к песне: одна заметка, пустого нет', () => {
  const song = createEmptySong('s')
  assert.equal(withSongComment(song, '  начинаем с припева  ').comment, 'начинаем с припева')
  assert.equal('comment' in withSongComment({ ...song, comment: 'был' }, '   '), false, 'стёрли — поля нет')
  assert.equal(withSongComment(song, 'x'.repeat(500)).comment?.length, 200)
  assert.equal(normalizeSong({ id: 1, comment: 'строй ниже' }).comment, 'строй ниже', 'хранится')
  assert.equal('comment' in normalizeSong({ id: 1, comment: '  ' }), false)
})
