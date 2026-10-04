// Библиотека аккаунта (data/userLibrary.ts + data/docSync.ts) на Firestore
// в памяти (tests/helpers/fakeFirestore.ts): перенос старых плейлистов, где
// песни лежали массивом, в документы-песни; работа по-старому, пока перенос
// не прошёл; запись только изменённых песен; своя неотправленная правка
// против снимка с сервера; отправка правок при закрытии.
import { test, mock, type TestContext } from 'node:test'
import assert from 'node:assert/strict'
import { createFakeFirestore } from './helpers/fakeFirestore.ts'
import { settle } from './helpers/fakeAudio.ts'
import type { Song } from '../src/types.ts'

const fake = createFakeFirestore()
mock.module('firebase/firestore', { namedExports: fake.api })
mock.module('../src/data/firebase.ts', { namedExports: { getDb: () => ({}) } })
const { openUserLibrary } = await import('../src/data/userLibrary.ts')

const UID = 'u1'
const playlistPath = (id: string) => `users/${UID}/playlists/${id}`
const songPath = (playlistId: string, songId: number) => `${playlistPath(playlistId)}/songs/${songId}`
const ts = (ms: number) => ({ toMillis: () => ms })

// Песня в старом формате — как лежала в массиве: без id секций и размера.
const legacySong = (id: number, name: string) => ({
  id,
  name,
  bpm: 120,
  sections: [{ name: '1 2 3 4', bars: 2, intro: true, comment: '' }, { name: 'VERSE', bars: 4, intro: false, comment: '' }],
  pattern: { steps: 16, tracks: [] },
})

// seed — данные «на сервере» до открытия библиотеки (после очистки).
function setup(t: TestContext, seed: () => void = () => {}) {
  fake.store.clear()
  fake.writes.length = 0
  fake.control.offline = false
  seed()
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const songs: Song[][] = []
  const errors: unknown[] = []
  const lib = openUserLibrary(UID)
  lib.onSongsChange((_id, list) => songs.push(list))
  lib.onError((err) => errors.push(err))
  t.after(() => lib.destroy())
  return { lib, songs, errors, lastSongs: () => songs[songs.length - 1] }
}

// Отложенная запись (дебаунс) и снимки после неё.
async function afterDebounce(t: TestContext) {
  t.mock.timers.tick(400)
  await settle()
}

test('старый плейлист переносится: песня — документ, массив остаётся резервной копией', async (t) => {
  const { lib, lastSongs, errors } = setup(t, () => {
    fake.store.set(playlistPath('p1'), { name: 'Старый', createdAt: ts(1), songs: [legacySong(2, 'Вторая'), legacySong(1, 'Первая')] })
  })
  lib.watchSongs('p1')
  await settle()

  assert.equal(fake.store.get(playlistPath('p1'))!.songsMigrated, true)
  assert.equal((fake.store.get(playlistPath('p1'))!.songs as unknown[]).length, 2, 'массив не тронут')
  const doc = fake.store.get(songPath('p1', 1))!
  assert.deepEqual((doc.sections as { id: string }[]).map((s) => s.id), ['s0', 's1'], 'секции получили id')
  assert.deepEqual([doc.beatsPerBar, doc.beatDivision], [4, 4], 'старой песне — 4/4')
  assert.deepEqual(lastSongs().map((s) => s.name), ['Первая', 'Вторая'], 'порядок — по времени создания (id)')
  assert.deepEqual(errors, [])
})

test('офлайн до переноса — плейлист работает по-старому, перенос потом подхватывает правку', async (t) => {
  const { lib, lastSongs, errors } = setup(t, () => {
    fake.store.set(playlistPath('p1'), { name: 'Старый', createdAt: ts(1), songs: [legacySong(1, 'Первая')] })
    fake.control.offline = true
  })
  lib.watchSongs('p1')
  await settle()
  assert.equal(fake.store.get(playlistPath('p1'))!.songsMigrated, undefined, 'офлайн перенос не прошёл')
  assert.deepEqual(errors, [], 'офлайн — не ошибка')

  lib.saveSongs('p1', lastSongs().map((s) => ({ ...s, bpm: 90 })))
  await afterDebounce(t)
  assert.equal((fake.store.get(playlistPath('p1'))!.songs as Song[])[0].bpm, 90, 'правка записана в массив')

  fake.control.offline = false
  await fake.api.setDoc(fake.api.doc(fake.api.collection({}, 'users', UID, 'playlists'), 'p2'), { name: 'Другой' }) // снимок с сервера
  await settle()
  assert.equal(fake.store.get(songPath('p1', 1))!.bpm, 90, 'в документ песни ушла версия с правкой')
  assert.equal(lastSongs()[0].bpm, 90)
})

test('записываются только изменённые песни; удалённая — удаляется', async (t) => {
  const { lib, lastSongs } = setup(t, () => {
    fake.store.set(playlistPath('p1'), { name: 'Новый', createdAt: ts(1), songsMigrated: true })
    for (const id of [1, 2, 3]) fake.store.set(songPath('p1', id), { ...legacySong(id, `Песня ${id}`), beatsPerBar: 4, beatDivision: 4 })
  })
  lib.watchSongs('p1')
  await settle()
  const [s1, s2] = lastSongs()
  fake.writes.length = 0

  const s4 = { ...s1, id: 4, name: 'Песня 4' }
  lib.saveSongs('p1', [{ ...s1 } /* то же содержимое, другой объект */, { ...s2, bpm: 150 }, s4])
  assert.deepEqual(fake.writes, [{ op: 'delete', path: songPath('p1', 3) }], 'удаление — сразу')
  await afterDebounce(t)
  assert.deepEqual(
    fake.writes.filter((w) => w.op === 'set').map((w) => w.path).sort(),
    [songPath('p1', 2), songPath('p1', 4)],
    'песня 1 не изменилась — не переписывается'
  )
})

test('своя неотправленная правка важнее снимка; после отправки — она и остаётся', async (t) => {
  const { lib, lastSongs } = setup(t, () => {
    fake.store.set(playlistPath('p1'), { name: 'Новый', createdAt: ts(1), songsMigrated: true })
    fake.store.set(songPath('p1', 1), { ...legacySong(1, 'Песня'), beatsPerBar: 4, beatDivision: 4 })
  })
  lib.watchSongs('p1')
  await settle()

  lib.saveSongs('p1', [{ ...lastSongs()[0], bpm: 150 }])
  await fake.api.setDoc(fake.api.doc(fake.api.collection({}, 'users', UID, 'playlists', 'p1', 'songs'), '1'), { ...legacySong(1, 'Песня'), bpm: 90 })
  await settle()
  assert.equal(lastSongs()[0].bpm, 150, 'снимок с чужой правкой не откатил тап')
  await afterDebounce(t)
  assert.equal(fake.store.get(songPath('p1', 1))!.bpm, 150)
})

test('правка до первого снимка плейлистов не теряется', async (t) => {
  const { lib } = setup(t, () => {
    fake.store.set(playlistPath('p1'), { name: 'Новый', createdAt: ts(1), songsMigrated: true })
    fake.store.set(songPath('p1', 1), { ...legacySong(1, 'Песня'), beatsPerBar: 4, beatDivision: 4 })
  })
  lib.watchSongs('p1')
  // Сразу, без снимков (как после «Повторить» с песнями прошлой подписки).
  lib.saveSongs('p1', [{ ...(legacySong(1, 'Песня') as unknown as Song), beatsPerBar: 4, beatDivision: 4, bpm: 77, sections: [] }])
  await settle()
  await afterDebounce(t)
  assert.equal(fake.store.get(songPath('p1', 1))!.bpm, 77)
})

test('новый плейлист сразу в новом формате', async (t) => {
  const { lib, lastSongs } = setup(t)
  await settle()
  const id = lib.createPlaylist('Свежий')
  lib.watchSongs(id)
  await settle()
  assert.equal(fake.store.get(playlistPath(id))!.songsMigrated, true)
  lib.saveSongs(id, [{ ...(legacySong(5, 'Песня') as unknown as Song), beatsPerBar: 3, beatDivision: 4 }])
  await afterDebounce(t)
  assert.equal(fake.store.get(songPath(id, 5))!.beatsPerBar, 3)
  assert.deepEqual(lastSongs().map((s) => s.id), [5])
})

test('закрытие библиотеки отправляет отложенные правки сразу', async (t) => {
  const { lib, lastSongs } = setup(t, () => {
    fake.store.set(playlistPath('p1'), { name: 'Новый', createdAt: ts(1), songsMigrated: true })
    fake.store.set(songPath('p1', 1), { ...legacySong(1, 'Песня'), beatsPerBar: 4, beatDivision: 4 })
  })
  lib.watchSongs('p1')
  await settle()
  lib.saveSongs('p1', [{ ...lastSongs()[0], name: 'Переименована' }])
  lib.saveBeats([{ id: 'beat_1', kind: 'beat', name: 'Бит', steps: 4, beatsPerBar: 1, beatDivision: 4, kitId: 'real', tracks: [] }])
  lib.destroy()
  assert.equal(fake.store.get(songPath('p1', 1))!.name, 'Переименована')
  assert.equal(fake.store.get(`users/${UID}/beats/beat_1`)!.name, 'Бит')
})

test('ошибка подписки уходит в onError, после закрытия — молчание', async (t) => {
  fake.control.failNextListen = { code: 'permission-denied' }
  const { lib, errors } = setup(t)
  await settle()
  assert.deepEqual(errors.map((e) => (e as { code: string }).code), ['permission-denied'])
  lib.destroy()
  fake.control.failNextListen = null
})
