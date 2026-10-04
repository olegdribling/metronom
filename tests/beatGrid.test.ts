// Чистые операции сетки редактора бита (components/beatGrid.ts): вставка
// блока, заливка строк, куда ляжет блок у краёв. Само поведение указателя —
// в браузере, здесь только правки данных.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { captureRegion, fillRows, fitRegion, pasteBlock } from '../src/components/beatGrid.ts'
import { Beat } from '../src/types.ts'

const bits = (s: string) => [...s].map((c) => c === 'x')
const str = (steps: boolean[]) => steps.map((v) => (v ? 'x' : '.')).join('')

function beat(...rows: string[]): Beat {
  return {
    id: 'b', kind: 'beat', name: 'b', steps: rows[0].length, beatsPerBar: 1, beatDivision: 4, kitId: 'real', bpm: 120,
    tracks: rows.map((r, i) => ({ role: (['hihat', 'snare', 'kick'] as const)[i], steps: bits(r) })),
  }
}

test('вставка перезаписывает прямоугольник, включая пустые клетки', () => {
  const b = beat('xx..', '..xx')
  const clip = captureRegion(b.tracks, { column: 0, row: 0, width: 2, height: 2 }) // xx / ..
  const result = pasteBlock(b, clip, { column: 2, row: 0 })!
  assert.deepEqual(result.edit.tracks.map((t) => str(t.steps)), ['xxxx', '....'])
  assert.deepEqual(result.region, { column: 2, row: 0, width: 2, height: 2 })
})

test('вставка за концом удлиняет бит', () => {
  const b = beat('x..', '...')
  const clip = captureRegion(b.tracks, { column: 0, row: 0, width: 2, height: 1 })
  const result = pasteBlock(b, clip, { column: 3, row: 0 })!
  assert.equal(result.edit.steps, 5)
  assert.deepEqual(result.edit.tracks.map((t) => str(t.steps)), ['x..x.', '.....'])
})

test('блок не влезает по высоте — вставки нет; у начала бита — обрезается', () => {
  const b = beat('xx..', '....')
  assert.equal(fitRegion({ width: 2, height: 2 }, { column: 0, row: 1 }, 2), null)
  assert.deepEqual(fitRegion({ width: 3, height: 1 }, { column: -1, row: 0 }, 2), { column: 0, row: 0, width: 2, height: 1 })
  const clip = captureRegion(b.tracks, { column: 0, row: 0, width: 2, height: 1 })
  assert.equal(pasteBlock(b, clip, { column: 0, row: 2 }), null)
})

test('залить строки — повтор по всей длине с сохранением фазы', () => {
  const b = beat('..x.......', 'xxxxxxxxxx')
  const edit = fillRows(b, { column: 2, row: 0, width: 3, height: 1 }) // «x..» с 3-го шага
  assert.deepEqual(edit.tracks.map((t) => str(t.steps)), ['..x..x..x.', 'xxxxxxxxxx'], 'вторая строка не тронута')
})
