// Экран плейлистов аккаунта: без входа — карточка «Войти через Google»;
// вошёл — список «Мои плейлисты» и создание нового по имени; открытый
// плейлист — его песни. Всё хранится в аккаунте (data/userLibrary.ts),
// кодов и общего доступа пока нет — отложено отдельной задачей.
import { h, mount } from '../dom.ts'
import { button } from '../components/button.ts'
import { accountGate } from '../components/signInCard.ts'
import { icon } from '../icons.ts'
import { CONFIG } from '../config.ts'
import { Song } from '../types.ts'
import { getState, subscribe, saveSongs, openPlaylist, closePlaylist, createPlaylist } from '../state/appState.ts'

const createEmptySong = (name: string): Song => ({
  id: Date.now(),
  name: name.trim().slice(0, CONFIG.MAX_SONG_NAME_LENGTH) || 'Без названия',
  bpm: CONFIG.DEFAULT_BPM,
  sections: [{ name: '1 2 3 4', bars: 2, intro: true, comment: '' }],
  pattern: { steps: 16, tracks: [] },
})

export function mountPlaylistScreen(container: HTMLElement, onOpenSong: (songId: number) => void): () => void {
  let newSongName = ''
  let newPlaylistName = ''

  function handleAddSong() {
    if (!newSongName.trim()) return
    const state = getState()
    saveSongs([...state.songs, createEmptySong(newSongName)])
    newSongName = ''
    render()
  }

  function handleCreatePlaylist() {
    if (!newPlaylistName.trim()) return
    createPlaylist(newPlaylistName)
    newPlaylistName = ''
  }

  function renderPlaylistList(): HTMLElement {
    const state = getState()
    return h(
      'div',
      { style: { display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' } },
      h(
        'div',
        { className: 'card', style: { display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' } },
        h('h3', {}, 'Новый плейлист'),
        h(
          'div',
          { style: { display: 'flex', gap: 'var(--space-2)' } },
          h('input', {
            className: 'input',
            placeholder: 'Название плейлиста',
            value: newPlaylistName,
            onInput: (e: Event) => (newPlaylistName = (e.target as HTMLInputElement).value),
            onKeyDown: (e: KeyboardEvent) => e.key === 'Enter' && handleCreatePlaylist(),
          }),
          button('', { iconName: 'plus', variant: 'accent', onClick: handleCreatePlaylist })
        )
      ),
      state.playlists.length === 0
        ? h('p', { style: { textAlign: 'center', color: 'var(--color-text-muted)' } }, 'Пока нет плейлистов — создайте первый выше')
        : h(
            'div',
            { style: { display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' } },
            h('h3', {}, 'Мои плейлисты'),
            ...state.playlists.map((p) =>
              h(
                'button',
                { type: 'button', className: 'list-row', onClick: () => openPlaylist(p.id) },
                icon('music-note-simple'),
                h('span', { style: { flex: '1', textAlign: 'left' } }, p.name)
              )
            )
          )
    )
  }

  function renderSongList(): HTMLElement {
    const state = getState()
    const playlist = state.playlists.find((p) => p.id === state.playlistId)
    return h(
      'div',
      { style: { display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' } },
      h(
        'div',
        { className: 'card', style: { display: 'flex', alignItems: 'center', gap: 'var(--space-3)' } },
        h('div', { style: { flex: '1', fontSize: '1.25rem', fontWeight: 'var(--font-weight-bold)' } }, playlist?.name ?? ''),
        button('Плейлисты', { iconName: 'list', onClick: closePlaylist })
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
    const gate = accountGate('Войдите — песни и плейлисты хранятся в вашем аккаунте и видны на любом устройстве.')
    if (gate) {
      mount(container, gate)
      return
    }
    mount(container, getState().playlistId ? renderSongList() : renderPlaylistList())
  }

  const unsubscribe = subscribe(render)
  render()
  return unsubscribe
}
