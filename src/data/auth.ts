// Вход через Google (Firebase Auth) — по нему приложение узнаёт пользователя
// на любом устройстве, без кодов: песни, плейлисты и биты лежат в аккаунте
// (data/userLibrary.ts). Вход один раз на устройстве — Firebase сам помнит
// его (IndexedDB) между запусками.
//
// Всплывающее окно, а не перенаправление: вход через перенаправление в Safari
// ломается для сайтов не на Firebase Hosting (сторонние куки). Если на iPhone
// из иконки на экране «Домой» окно не сработает — следующий шаг: разместить
// служебные файлы входа Firebase на нашем домене (см. CLAUDE.md).
import { GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth'
import { getAuthInstance, isFirebaseConfigured } from './firebase.ts'

export interface AppUser {
  uid: string
  name: string
}

export function onUserChange(cb: (user: AppUser | null) => void): () => void {
  if (!isFirebaseConfigured) {
    cb(null)
    return () => {}
  }
  return onAuthStateChanged(getAuthInstance(), (u) =>
    cb(u ? { uid: u.uid, name: u.displayName || u.email || 'Google' } : null)
  )
}

export async function signInWithGoogle(): Promise<void> {
  await signInWithPopup(getAuthInstance(), new GoogleAuthProvider())
}

export async function signOutUser(): Promise<void> {
  await signOut(getAuthInstance())
}

// Понятная причина вместо кода Firebase — для карточки входа.
export function describeAuthError(err: unknown): string {
  const code = (err as { code?: string })?.code ?? ''
  if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') return 'Вход отменён.'
  if (code === 'auth/popup-blocked') return 'Браузер заблокировал окно входа — разрешите всплывающие окна для сайта.'
  if (code === 'auth/unauthorized-domain') return 'Этот адрес не добавлен в Authorized domains в консоли Firebase.'
  if (code === 'auth/operation-not-allowed') return 'Вход через Google не включён в консоли Firebase.'
  if (code === 'auth/network-request-failed') return 'Нет связи с сервером входа.'
  return err instanceof Error ? err.message : String(err)
}
