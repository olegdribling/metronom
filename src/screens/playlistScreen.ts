// Экран плейлиста: если код не открыт — создать новый или ввести
// существующий; если открыт — список песен внутри него.
import { h, mount } from '../dom.ts'
import { button } from '../components/button.ts'
import { icon } from '../icons.ts'
import { CONFIG } from '../config.ts'
import { Song } from '../types.ts'
import { createPlaylist, playlistExists } from '../data/playlistApi.ts'
import { openPlaylistSession } from '../data/playlistSession.ts'
import { getKnownPlaylistCodes, rememberPlaylistCode, forgetPlaylistCode } from '../data/knownPlaylists.ts'
import { getState, subscribe, setPlaylistSession, clearPlaylistSession, saveSongs } from '../state/appState.ts'
import { isFirebaseConfigured } from '../data/firebase.ts'

const createEmptySong = (name: string): Song => ({
  id: Date.now(),
  name: name.trim().slice(0, CONFIG.MAX_SONG_NAME_LENGTH) || 'Без названия',
  bpm: CONFIG.DEFAULT_BPM,
  sections: [{ name: '1 2 3 4', bars: 2, intro: true, comment: '' }],
  pattern: { steps: 16, tracks: [] },
})

export function mountPlaylistScreen(container: HTMLElement, onOpenSong: (songId: number) => void): () => void {
  let joinCode = ''
  let newSongName = ''
  let busy = false
  let errorMessage: string | null = null

  async function handleCreate() {
    if (busy) return
    busy = true
    errorMessage = null
    render()
    try {
      const code = await createPlaylist()
      rememberPlaylistCode(code)
      setPlaylistSession(code, openPlaylistSession(code))
    } catch (err) {
      errorMessage = 'Не удалось создать плейлист. ' + describeError(err)
    } finally {
      busy = false
      render()
    }
  }

  async function handleJoin(code: string) {
    const trimmed = code.trim().toLowerCase()
    if (!trimmed || busy) return
    busy = true
    errorMessage = null
    render()
    try {
      const exists = await playlistExists(trimmed)
      if (!exists) {
        errorMessage = 'Плейлист с таким кодом не найден.'
        return
      }
      rememberPlaylistCode(trimmed)
      setPlaylistSession(trimmed, openPlaylistSession(trimmed))
    } catch (err) {
      errorMessage = 'Не удалось открыть плейлист. ' + describeError(err)
    } finally {
      busy = false
      render()
    }
  }

  function handleLeave() {
    const state = getState()
    if (state.playlistCode) forgetPlaylistCode(state.playlistCode)
    clearPlaylistSession()
    render()
  }

  function handleAddSong() {
    if (!newSongName.trim()) return
    const state = getState()
    saveSongs([...state.songs, createEmptySong(newSongName)])
    newSongName = ''
    render()
  }

  function renderJoinScreen(): HTMLElement {
    if (!isFirebaseConfigured) {
      return h(
        'div',
        { className: 'card' },
        h('p', {}, 'Firebase ещё не настроен: заполните src/data/firebaseConfig.ts данными вашего проекта, чтобы плейлисты заработали.')
      )
    }
    const known = getKnownPlaylistCodes()
    return h(
      'div',
      { style: { display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' } },
      h(
        'div',
        { className: 'card', style: { display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' } },
        h('h3', {}, 'Новый плейлист'),
        h('p', { style: { color: 'var(--color-text-sub)', fontSize: 'var(--font-size-small)' } },
          'Создаст код доступа, которым можно поделиться с остальными.'),
        button('Создать плейлист', { variant: 'accent', onClick: handleCreate, disabled: busy })
      ),
      h(
        'div',
        { className: 'card', style: { display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' } },
        h('h3', {}, 'Есть код?'),
        h('input', {
          className: 'input',
          placeholder: 'например, k7m2qx',
          value: joinCode,
          onInput: (e: Event) => (joinCode = (e.target as HTMLInputElement).value),
          onKeyDown: (e: KeyboardEvent) => e.key === 'Enter' && handleJoin(joinCode),
        }),
        button('Открыть', { onClick: () => handleJoin(joinCode), disabled: busy })
      ),
      errorMessage ? h('div', { className: 'card', style: { color: 'var(--color-text-danger)' } }, errorMessage) : null,
      known.length > 0
        ? h(
            'div',
            { style: { display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' } },
            h('h3', {}, 'Открывали раньше'),
            ...known.map((code) =>
              h(
                'button',
                { type: 'button', className: 'list-row', onClick: () => handleJoin(code) },
                icon('music-note-simple'),
                h('span', { style: { flex: '1', fontFamily: 'monospace' } }, code)
              )
            )
          )
        : null
    )
  }

  function renderSongList(): HTMLElement {
    const state = getState()
    return h(
      'div',
      { style: { display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' } },
      h(
        'div',
        { className: 'card', style: { display: 'flex', alignItems: 'center', gap: 'var(--space-3)' } },
        h('div', { style: { flex: '1' } },
          h('div', { style: { fontSize: 'var(--font-size-small)', color: 'var(--color-text-sub)' } }, 'Код плейлиста'),
          h('div', { style: { fontFamily: 'monospace', fontSize: '1.25rem', fontWeight: 'var(--font-weight-bold)' } }, state.playlistCode ?? '')
        ),
        button('Выйти', { onClick: handleLeave })
      ),
      h(
        'div',
        { className: 'card', style: { display: 'flex', gap: 'var(--space-2)' } },
        h('input', {
          className: 'input',
          placeholder: 'Название песни',
          value: newSongName,
          onInput: (e: Event) => (newSongName = (e.target as HTMLInputElement).value),
          onKeyDown: (e: KeyboardEvent) => e.key === 'Enter' && handleAddSong(),
        }),
        button('', { iconName: 'plus', variant: 'accent', onClick: handleAddSong })
      ),
      state.songs.length === 0
        ? h('p', { style: { textAlign: 'center', color: 'var(--color-text-muted)' } }, 'Пока нет песен — добавьте первую выше')
        : h(
            'div',
            { style: { display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' } },
            ...state.songs.map((song) =>
              h(
                'button',
                { type: 'button', className: 'list-row', onClick: () => onOpenSong(song.id) },
                icon('music-note'),
                h('span', { style: { flex: '1', textAlign: 'left' } }, song.name),
                h('span', { className: 'badge' }, `${song.bpm} BPM`)
              )
            )
          )
    )
  }

  function render() {
    const state = getState()
    mount(container, state.playlistCode ? renderSongList() : renderJoinScreen())
  }

  const unsubscribe = subscribe(render)
  render()
  return unsubscribe
}

function describeError(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}
