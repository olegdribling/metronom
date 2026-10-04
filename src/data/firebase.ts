// Инициализация Firebase — единственное место, где это делается
// (Правила проектирования, п.4: искать существующее прежде чем писать новое).
//
// Firestore — с постоянным локальным кэшем (IndexedDB): PWA открывается и
// показывает песни/биты офлайн, правки уходят на сервер, когда появится
// сеть. persistentMultipleTabManager — чтобы кэш не конфликтовал, если
// приложение открыто сразу в браузере и как иконка на экране «Домой».
import { initializeApp, type FirebaseApp } from 'firebase/app'
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, type Firestore } from 'firebase/firestore'
import { getAuth, type Auth } from 'firebase/auth'
import { firebaseConfig, isFirebaseConfigured } from './firebaseConfig.ts'

let app: FirebaseApp | null = null
let db: Firestore | null = null
let auth: Auth | null = null

function getApp(): FirebaseApp {
  if (!isFirebaseConfigured) {
    throw new Error(
      'Firebase не настроен: заполните src/data/firebaseConfig.ts данными вашего проекта (см. комментарий в файле).'
    )
  }
  if (!app) app = initializeApp(firebaseConfig)
  return app
}

export function getDb(): Firestore {
  if (!db) {
    db = initializeFirestore(getApp(), {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
      // Необязательные поля моделей (секция без бита и т.п.) бывают
      // undefined — без этого Firestore отказывается записывать документ.
      ignoreUndefinedProperties: true,
    })
  }
  return db
}

export function getAuthInstance(): Auth {
  if (!auth) auth = getAuth(getApp())
  return auth
}

export { isFirebaseConfigured }
