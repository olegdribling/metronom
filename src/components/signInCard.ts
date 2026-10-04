// Карточка «Войти через Google» — общая для экранов, которым нужен аккаунт
// (плейлисты, биты): песни и биты хранятся в нём (data/userLibrary.ts).
import { h } from '../dom.ts'
import { button } from './button.ts'
import { getState } from '../state/appState.ts'
import { signInWithGoogle, describeAuthError } from '../data/auth.ts'
import { isFirebaseConfigured } from '../data/firebase.ts'

function signInCard(text: string): HTMLElement {
  const error = h('div', { style: { color: 'var(--color-text-danger)', fontSize: 'var(--font-size-small)' }, hidden: true })
  const signInButton: HTMLButtonElement = button('Войти через Google', {
    variant: 'accent',
    iconName: 'google-logo',
    onClick: async () => {
      signInButton.disabled = true
      error.hidden = true
      try {
        await signInWithGoogle()
      } catch (err) {
        error.textContent = describeAuthError(err)
        error.hidden = false
      } finally {
        signInButton.disabled = false
      }
    },
  })
  return h(
    'div',
    { className: 'card', style: { display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' } },
    h('h3', {}, 'Вход'),
    h('p', { style: { color: 'var(--color-text-sub)', fontSize: 'var(--font-size-small)' } }, text),
    signInButton,
    error
  )
}

// Что показать вместо экрана, пока аккаунта нет: подсказку про настройку
// Firebase, «Загрузка…» (Firebase ещё не ответил, вошёл ли пользователь) или
// карточку входа. null — пользователь вошёл, экран рисует своё.
export function accountGate(text: string): HTMLElement | null {
  if (!isFirebaseConfigured) {
    return h('div', { className: 'card' }, h('p', {}, 'Firebase ещё не настроен: заполните src/data/firebaseConfig.ts данными вашего проекта.'))
  }
  const state = getState()
  if (!state.authReady) return h('p', { style: { textAlign: 'center', color: 'var(--color-text-muted)' } }, 'Загрузка…')
  if (!state.user) return signInCard(text)
  return null
}
