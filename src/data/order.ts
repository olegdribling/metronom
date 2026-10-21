// Свой порядок в списках песен и битов (решение пользователя: переставить
// долгим тапом, components/sortable.ts). Переставили — у всех элементов
// списка `order` по месту; новые (без `order`) идут после них, в порядке
// создания — так новая песня встаёт в конец плейлиста.
export function orderedFirst<T extends { order?: number }>(byCreation: (a: T, b: T) => number): (a: T, b: T) => number {
  return (a, b) => {
    if (a.order !== undefined && b.order !== undefined) return a.order - b.order || byCreation(a, b)
    if (a.order !== undefined) return -1
    if (b.order !== undefined) return 1
    return byCreation(a, b)
  }
}

/** Список, где элемент с места `from` переставили на `to`, — с `order` по
 * новым местам. */
export function moveItem<T extends { order?: number }>(items: T[], from: number, to: number): T[] {
  const next = [...items]
  const [moved] = next.splice(from, 1)
  next.splice(to, 0, moved)
  return next.map((item, order) => (item.order === order ? item : { ...item, order }))
}

/** Перестановка на экране: строку с места `from` отпустили на место `to`
 * списка `shown`, каким он нарисован. С тех пор список мог измениться
 * (снимок с другого устройства) — элементы ищем по id. Кого-то из них уже
 * нет — null. */
export function moveShown<T extends { id: string | number; order?: number }>(items: T[], shown: T[], from: number, to: number): T[] | null {
  const at = (i: number) => items.findIndex((item) => item.id === shown[i]?.id)
  const a = at(from)
  const b = at(to)
  return a < 0 || b < 0 ? null : moveItem(items, a, b)
}

// Правятся в списке, а не на странице песни или бита: место (order) и
// комментарий песни (comment).
const LIST_FIELDS = ['order', 'comment'] as const

/** Поля списка — не правка песни или бита: дискета черновика их не трогает
 * (переставили или подписали с другого устройства, пока правили, — старое
 * не возвращается). */
export function withListFieldsOf<T extends { order?: number; comment?: string }>(edited: T, stored: T): T {
  const next: Record<string, unknown> = { ...edited }
  for (const key of LIST_FIELDS) {
    if (stored[key] === undefined) delete next[key]
    else next[key] = stored[key]
  }
  return next as T
}

/** Порядок из БД: целое число или ничего. */
export const readOrder = (value: unknown): { order?: number } =>
  typeof value === 'number' && Number.isFinite(value) ? { order: Math.floor(value) } : {}
