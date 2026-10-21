// Экран плейлистов аккаунта: без входа — карточка «Войти через Google»;
// вошёл — список «Мои плейлисты» и создание нового по имени; открытый
// плейлист — его песни и «Концерт» (его песни для сцены, concertScreen.ts).
// ▶ у песни (временное решение пользователя) — метроном как есть в темпе
// песни, как ▶ в «Списке» «Концерта» (звук включает app.ts). Комментарий к
// песне (решение пользователя) — виден под названием, пишется здесь: кнопка
// у строки → поле на месте строки, ✓ — сохранить сразу, × — отменить;
// только при открытом замке.
// Всё хранится в аккаунте (data/userLibrary.ts), кодов и общего доступа
// пока нет — отложено отдельной задачей.
import { h, mount } from '../dom.ts'
import { button, iconButton } from '../components/button.ts'
import { accountGate } from '../components/signInCard.ts'
import { deletableRow } from '../components/deletableRow.ts'
import { deferWhileSorting, makeSortable } from '../components/sortable.ts'
import { icon } from '../icons.ts'
import { CONFIG } from '../config.ts'
import { createEmptySong, withSongComment } from '../data/songs.ts'
import { moveShown } from '../data/order.ts'
import { clickNeedsSamples } from '../data/engineSettings.ts'
import type { Song } from '../types.ts'
import type { AudioEngine } from '../engine/audioEngine.ts'
import { getState, subscribe, saveSongs, openPlaylist, closePlaylist, createPlaylist } from '../state/appState.ts'

export interface PlaylistScreenOptions {
  onOpenSong: (songId: number) => void
  /** «Концерт» — песни плейлиста для сцены (screens/concertScreen.ts). */
  onOpenConcert: () => void
  /** Песня, чей щелчок (▶) сейчас играет; null — не играет. */
  playingClick: () => number | null
  /** ▶/■ у песни: щелчок метронома в её темпе. */
  onToggleClick: (songId: number) => Promise<void>
}

export function mountPlaylistScreen(container: HTMLElement, engine: AudioEngine, opts: PlaylistScreenOptions): () => void {
  let newSongName = ''
  let newPlaylistName = ''
  // Комментарий, который сейчас пишут: песня и черновик текста (перерисовка
  // экрана его не сбрасывает — поле с ключом, mount бережёт фокус).
  let commentFor: number | null = null
  let commentDraft = ''

  function openComment(song: Song) {
    commentFor = song.id
    commentDraft = song.comment ?? ''
    render()
    container.querySelector<HTMLInputElement>(`[data-key="song-comment-${song.id}"]`)?.focus()
  }

  function saveComment() {
    const id = commentFor
    commentFor = null
    if (id !== null) saveSongs(getState().songs.map((s) => (s.id === id ? withSongComment(s, commentDraft) : s)))
    render()
  }

  function cancelComment() {
    commentFor = null
    render()
  }

  // Строка песни: название, под ним темп и комментарий (справа три кнопки —
  // сбоку темпу места нет).
  function songRow(song: Song): HTMLElement {
    return h(
      'button',
      { type: 'button', className: 'list-row', onClick: () => opts.onOpenSong(song.id) },
      icon('music-note'),
      h(
        'span',
        { className: 'grow min-w-0 stack stack--1 stack--start' },
        h('span', {}, song.name),
        h('span', { className: 'badge' }, `${song.bpm} BPM`),
        song.comment ? h('span', { className: 'text-small text-sub' }, song.comment) : null
      )
    )
  }

  // Пишут комментарий — на месте строки поле, справа ✓ и ×.
  function commentEditor(song: Song): HTMLElement {
    return h(
      'div',
      { className: 'list-item' },
      h('input', {
        className: 'input',
        key: `song-comment-${song.id}`,
        maxLength: String(CONFIG.MAX_COMMENT_LENGTH),
        placeholder: `Комментарий к «${song.name}»`,
        value: commentDraft,
        onInput: (e: Event) => (commentDraft = (e.target as HTMLInputElement).value),
        onKeyDown: (e: KeyboardEvent) => {
          if (e.key === 'Enter') saveComment()
          else if (e.key === 'Escape') cancelComment()
        },
      }),
      iconButton('check', { ariaLabel: 'Сохранить комментарий', variant: 'accent', onClick: saveComment }),
      iconButton('x', { ariaLabel: 'Отменить', onClick: cancelComment })
    )
  }

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
    const clicking = opts.playingClick()
    const needsSamples = clickNeedsSamples(state.metronome, state.metronomePattern)
    // Замок закрыли, пока писали, — поле закрывается.
    if (!state.unlocked) commentFor = null
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
      // Смотреть и играть — можно и под закрытым замком.
      button('Концерт', {
        variant: 'accent',
        iconName: 'microphone-stage',
        onClick: opts.onOpenConcert,
        disabled: state.songsLoaded && state.songs.length === 0,
      }),
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
        : sortableSongs(
            state.songs,
            state.songs.map((song) =>
              song.id === commentFor
                ? commentEditor(song)
                : deletableRow(songRow(song), {
                    ariaLabel: `Удалить песню «${song.name}»`,
                    confirmText: `Удалить песню «${song.name}»? Это нельзя отменить.`,
                    onDelete: () => saveSongs(getState().songs.filter((s) => s.id !== song.id)),
                    disabled: !getState().unlocked,
                    actions: [
                      // Комментарий пишут при открытом замке, виден он всегда.
                      iconButton('chat-text', {
                        ariaLabel: 'Комментарий',
                        disabled: !state.unlocked,
                        onClick: () => openComment(song),
                      }),
                      // Слушать можно и под закрытым замком.
                      iconButton(clicking === song.id ? 'stop' : 'play', {
                        ariaLabel: clicking === song.id ? 'Стоп' : 'Слушать клик',
                        disabled: needsSamples && !state.samplesLoaded,
                        onClick: () => void opts.onToggleClick(song.id).then(render),
                      }),
                    ],
                  })
            )
          )
    )
  }

  // Порядок песен — долгим тапом по строке (решение пользователя; при
  // открытом замке — перемещать при закрытом нельзя). Это и порядок в
  // «Концерте». Сохраняется сразу, как удаление песни.
  function sortableSongs(shown: Song[], rows: HTMLElement[]): HTMLElement {
    const list = h('div', { className: 'stack stack--2' }, ...rows)
    makeSortable(list, {
      enabled: () => getState().unlocked,
      ignore: '.icon-btn, input',
      onMove: (from, to) => {
        const songs = moveShown(getState().songs, shown, from, to)
        if (songs) saveSongs(songs)
      },
    })
    return list
  }

  function render() {
    // Строку списка держат или ведут — перерисуемся, когда отпустят.
    if (deferWhileSorting(container, render)) return
    const gate = accountGate('Войдите — песни и плейлисты хранятся в вашем аккаунте и видны на любом устройстве.')
    if (gate) {
      mount(container, gate)
      return
    }
    mount(container, getState().playlistId ? renderSongList() : renderPlaylistList())
  }

  // Щелчок заиграл, сменился или замолчал (в том числе Стоп в футере) —
  // ▶/■ у строк. Своего слота у списка нет, а у движка он один — берём его,
  // как «Биты».
  let wasClicking = opts.playingClick()
  const releasePlayback = engine.onPlaybackState(() => {
    const clicking = opts.playingClick()
    if (clicking === wasClicking) return
    wasClicking = clicking
    render()
  })

  const unsubscribe = subscribe(render)
  render()
  return () => {
    unsubscribe()
    releasePlayback()
  }
}
