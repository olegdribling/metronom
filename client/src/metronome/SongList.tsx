import { useState, useRef } from 'react'
import { useTheme } from '../ThemeContext'
import { Song } from '../types'
import { Icon } from './Icon'

interface SongRowProps {
  song: Song
  index: number
  selectSong: (song: Song) => void
  deleteSong: (id: number) => void
  songDragStart: (i: number) => () => void
  allow: (e: React.DragEvent) => void
  songDrop: (i: number) => (e: React.DragEvent) => void
  songTouchStart: (i: number) => (e: React.TouchEvent) => void
  songTouchEnd: (e: React.TouchEvent) => void
}

function SongRow({
  song, index, selectSong, deleteSong,
  songDragStart, allow, songDrop,
  songTouchStart, songTouchEnd,
}: SongRowProps) {
  const theme = useTheme()
  const [offsetX, setOffsetX] = useState(0)
  const [revealed, setRevealed] = useState(false)
  const touchRef = useRef<{ startX: number; startY: number; direction: 'h' | 'v' | null } | null>(null)
  const THRESHOLD = 72

  const handleTouchStart = (e: React.TouchEvent) => {
    touchRef.current = {
      startX: e.touches[0].clientX,
      startY: e.touches[0].clientY,
      direction: null,
    }
    songTouchStart(index)(e)
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    const t = touchRef.current
    if (!t) return
    const dx = e.touches[0].clientX - t.startX
    const dy = e.touches[0].clientY - t.startY
    if (!t.direction && (Math.abs(dx) > 5 || Math.abs(dy) > 5)) {
      t.direction = Math.abs(dx) > Math.abs(dy) ? 'h' : 'v'
    }
    if (t.direction === 'h') {
      const base = revealed ? -THRESHOLD : 0
      const next = Math.min(0, Math.max(-THRESHOLD - 8, base + dx))
      setOffsetX(next)
    }
  }

  const handleTouchEnd = (e: React.TouchEvent) => {
    const t = touchRef.current
    if (!t) return
    if (t.direction === 'h') {
      if (offsetX < -THRESHOLD / 2) {
        setOffsetX(-THRESHOLD)
        setRevealed(true)
      } else {
        setOffsetX(0)
        setRevealed(false)
      }
    } else {
      songTouchEnd(e)
    }
    touchRef.current = null
  }

  const closeSwipe = () => { setOffsetX(0); setRevealed(false) }

  return (
    <div
      data-song-index={index}
      className="relative w-full max-w-xl mb-2 overflow-hidden rounded-2xl"
      draggable
      onDragStart={songDragStart(index)}
      onDragOver={allow}
      onDrop={songDrop(index)}
    >
      <div
        className={`absolute right-0 top-0 bottom-0 flex items-center justify-center px-5 rounded-2xl ${theme.btnDanger}`}
        style={{ width: THRESHOLD }}
      >
        <button onClick={() => deleteSong(song.id)}>
          <Icon name="trash" className="text-xl" />
        </button>
      </div>

      <div
        className="flex gap-2 relative"
        style={{ transform: `translateX(${offsetX}px)`, transition: touchRef.current ? 'none' : 'transform 0.2s ease' }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <span className={`cursor-grab select-none flex items-center touch-none px-1 ${theme.textMuted}`}>
          <Icon name="dots-six-vertical" />
        </span>
        <button
          onClick={() => { if (revealed) { closeSwipe() } else { selectSong(song) } }}
          className={`flex-1 p-3 rounded-2xl transition text-left flex items-center gap-2 ${theme.btn}`}
        >
          <Icon name="music-note" className={`shrink-0 ${theme.textAccent}`} />
          <span className="truncate">{song.name}</span>
        </button>
      </div>
    </div>
  )
}

interface SongListProps {
  songs: Song[]
  newSongName: string
  setNewSongName: (v: string) => void
  createSong: () => void
  selectSong: (song: Song) => void
  deleteSong: (id: number) => void
  songDragStart: (i: number) => () => void
  allow: (e: React.DragEvent) => void
  songDrop: (i: number) => (e: React.DragEvent) => void
  songTouchStart: (i: number) => (e: React.TouchEvent) => void
  songTouchMove: (e: React.TouchEvent) => void
  songTouchEnd: (e: React.TouchEvent) => void
}

export function SongList({
  songs, newSongName, setNewSongName,
  createSong, selectSong, deleteSong,
  songDragStart, allow, songDrop,
  songTouchStart, songTouchMove, songTouchEnd,
}: SongListProps) {
  const theme = useTheme()
  return (
    <>
      <div className={`p-5 w-full max-w-xl mb-4 ${theme.card}`}>
        <input
          type="text"
          placeholder="Название песни"
          value={newSongName}
          onChange={(e) => setNewSongName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && createSong()}
          className={`w-full p-3 rounded-xl mb-3 transition ${theme.input}`}
        />
        <button
          onClick={createSong}
          disabled={!newSongName.trim()}
          className={`w-full p-3 rounded-2xl font-bold disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 ${theme.btnAccent}`}
        >
          <Icon name="plus" /> Добавить песню
        </button>
      </div>

      {songs.length === 0 && (
        <div className={`text-center mt-8 ${theme.textMuted}`}>
          <Icon name="music-note" className="text-4xl mb-2" />
          <p className="text-sm">Создайте первую песню выше</p>
        </div>
      )}

      {songs.map((song, i) => (
        <SongRow
          key={song.id}
          song={song}
          index={i}
          selectSong={selectSong}
          deleteSong={deleteSong}
          songDragStart={songDragStart}
          allow={allow}
          songDrop={songDrop}
          songTouchStart={songTouchStart}
          songTouchEnd={songTouchEnd}
        />
      ))}
    </>
  )
}
