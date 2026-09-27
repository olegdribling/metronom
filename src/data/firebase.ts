// Инициализация Firebase — единственное место, где это делается
// (Правила проектирования, п.4: искать существующее прежде чем писать новое).
import { initializeApp, type FirebaseApp } from 'firebase/app'
import { getFirestore, type Firestore } from 'firebase/firestore'
import { firebaseConfig, isFirebaseConfigured } from './firebaseConfig.ts'

let app: FirebaseApp | null = null
let db: Firestore | null = null

export function getDb(): Firestore {
  if (!isFirebaseConfigured) {
    throw new Error(
      'Firebase не настроен: заполните src/data/firebaseConfig.ts данными вашего проекта (см. комментарий в файле).'
    )
  }
  if (!db) {
    app = initializeApp(firebaseConfig)
    db = getFirestore(app)
  }
  return db
}

export { isFirebaseConfigured }
