// Прямые операции с Firestore над плейлистами. Один документ на плейлист:
// playlists/{code} = { songs: Song[], updatedAt }.
// Конфликтов не разрешаем — last-write-wins (см. metronom-v2-plan.md).
import { doc, getDoc, setDoc, updateDoc, onSnapshot, serverTimestamp, type Unsubscribe } from 'firebase/firestore'
import { getDb } from './firebase.ts'
import { Playlist, Song } from '../types.ts'

const CODE_ALPHABET = 'abcdefghijkmnopqrstuvwxyz23456789' // без l/1, o/0 — легче читать вслух
const CODE_LENGTH = 6

function generateCode(): string {
  let code = ''
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]
  }
  return code
}

export async function createPlaylist(): Promise<string> {
  const db = getDb()
  let code = generateCode()
  // Коллизия крайне маловероятна (33^6 ≈ 1.3 млрд комбинаций), но проверяем.
  for (let attempt = 0; attempt < 5; attempt++) {
    const existing = await getDoc(doc(db, 'playlists', code))
    if (!existing.exists()) break
    code = generateCode()
  }
  await setDoc(doc(db, 'playlists', code), { songs: [], updatedAt: serverTimestamp() })
  return code
}

export async function playlistExists(code: string): Promise<boolean> {
  const db = getDb()
  const snap = await getDoc(doc(db, 'playlists', code))
  return snap.exists()
}

export function subscribeToPlaylist(
  code: string,
  onUpdate: (playlist: Playlist | null) => void,
  onError: (err: unknown) => void
): Unsubscribe {
  const db = getDb()
  return onSnapshot(
    doc(db, 'playlists', code),
    (snap) => {
      if (!snap.exists()) {
        onUpdate(null)
        return
      }
      const data = snap.data()
      onUpdate({
        code,
        songs: (data.songs ?? []) as Song[],
        updatedAt: (data.updatedAt?.toMillis?.() as number | undefined) ?? 0,
      })
    },
    onError
  )
}

export async function writeSongs(code: string, songs: Song[]): Promise<void> {
  const db = getDb()
  await updateDoc(doc(db, 'playlists', code), { songs, updatedAt: serverTimestamp() })
}
