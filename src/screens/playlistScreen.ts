// Экран плейлистов аккаунта: без входа — карточка «Войти через Google»;
// вошёл — список «Мои плейлисты» и создание нового по имени; открытый
// плейлист — его песни. Всё хранится в аккаунте (data/userLibrary.ts),
// кодов и общего доступа пока нет — отложено отдельной задачей.
import { h, mount } from '../dom.ts'
import { button } from '../components/button.ts'
import { accountGate } from '../components/signInCard.ts'
import { deletableRow } from '../components/deletableRow.ts'
import { icon } from '../icons.ts'
import { CONFIG } from '../config.ts'
import { createEmptySong } from '../data/songs.ts'
import { getState, subscribe, saveSongs, openPlaylist, closePlaylist, createPlaylist } from '../state/appState.ts'

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
      { className: 'stack stack--4' },
      h(
        'div',
        { className: 'card stack' },
        h('h3', {}, 'Новый плейлист'),
        h(
          'div',
          { className: 'row' },
          h('input', {
            className: 'input',
            key: 'new-playlist',
            maxLength: String(CONFIG.MAX_NAME_LENGTH),
            placeholder: 'Название плейлиста',
            value: newPlaylistName,
            onInput: (e: Event) => (newPlaylistName = (e.target as HTMLInputElement).value),
            onKeyDown: (e: KeyboardEvent) => e.key === 'Enter' && handleCreatePlaylist(),
          }),
          button('', { iconName: 'plus', variant: 'accent', onClick: handleCreatePlaylist })
        )
      ),
      state.playlists.length === 0
        ? h('p', { className: 'text-center text-muted' }, 'Пока нет плейлистов — создайте первый выше')
        : h(
            'div',
            { className: 'stack stack--2' },
            h('h3', {}, 'Мои плейлисты'),
            ...state.playlists.map((p) =>
              h(
                'button',
                { type: 'button', className: 'list-row', onClick: () => openPlaylist(p.id) },
                icon('music-note-simple'),
                h('span', { className: 'grow' }, p.name)
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
      { className: 'stack stack--4' },
      h(
        'div',
        { className: 'card row row--3' },
        h('div', { className: 'grow playlist-title' }, playlist?.name ?? ''),
        button('Плейлисты', { iconName: 'list', onClick: closePlaylist })
      ),
      h(
        'div',
        { className: 'card row' },
        h('input', {
          className: 'input',
          key: 'new-song',
          maxLength: String(CONFIG.MAX_NAME_LENGTH),
          placeholder: 'Название песни',
          value: newSongName,
          onInput: (e: Event) => (newSongName = (e.target as HTMLInputElement).value),
          onKeyDown: (e: KeyboardEvent) => e.key === 'Enter' && handleAddSong(),
        }),
        button('', { iconName: 'plus', variant: 'accent', onClick: handleAddSong })
      ),
      state.songs.length === 0
        ? h('p', { className: 'text-center text-muted' }, state.songsLoaded ? 'Пока нет песен — добавьте первую выше' : 'Загрузка…')
        : h(
            'div',
            { className: 'stack stack--2' },
            ...state.songs.map((song) =>
              deletableRow(
                h(
                  'button',
                  { type: 'button', className: 'list-row', onClick: () => onOpenSong(song.id) },
                  icon('music-note'),
                  h('span', { className: 'grow' }, song.name),
                  h('span', { className: 'badge' }, `${song.bpm} BPM`)
                ),
                {
                  ariaLabel: `Удалить песню «${song.name}»`,
                  confirmText: `Удалить песню «${song.name}»? Это нельзя отменить.`,
                  onDelete: () => saveSongs(getState().songs.filter((s) => s.id !== song.id)),
                }
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
