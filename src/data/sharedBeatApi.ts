// Разовая передача бита другому человеку — НЕ постоянная синхронизация, как
// у плейлистов (playlistApi.ts): один раз записали в sharedBeats/{code}, один
// раз прочитали, дальше у получателя независимая копия в его локальной
// библиотеке (data/beatsLibrary.ts). Без onSnapshot.
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore'
import { getDb } from './firebase.ts'
import { generateCode } from './shareCode.ts'
import { Beat } from '../types.ts'

export async function shareBeat(beat: Beat): Promise<string> {
  const db = getDb()
  let code = generateCode()
  // Коллизия крайне маловероятна, но проверяем — как и у плейлистов.
  for (let attempt = 0; attempt < 5; attempt++) {
    const existing = await getDoc(doc(db, 'sharedBeats', code))
    if (!existing.exists()) break
    code = generateCode()
  }
  await setDoc(doc(db, 'sharedBeats', code), { beat, createdAt: serverTimestamp() })
  return code
}

export async function fetchSharedBeat(code: string): Promise<Beat | null> {
  const db = getDb()
  const snap = await getDoc(doc(db, 'sharedBeats', code))
  if (!snap.exists()) return null
  return snap.data().beat as Beat
}
