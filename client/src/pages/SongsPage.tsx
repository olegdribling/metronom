import { SectionFormData, SectionRange, Song, PlaybackState } from '../types'
import { SongDetail } from '../metronome/SongDetail'
import { SongList } from '../metronome/SongList'

interface SongsPageProps {
  songs: Song[]
  currentSong: Song | null
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
  bpm: number
  updateSongBpm: (v: number) => void
  changeBpm: (delta: number) => void
  sectionTypes: string[]
  newSection: SectionFormData
  setNewSection: React.Dispatch<React.SetStateAction<SectionFormData>>
  showAddForm: boolean
  setShowAddForm: (v: boolean) => void
  addSection: () => void
  editingSectionIndex: number | null
  editSectionData: SectionFormData
  setEditSectionData: React.Dispatch<React.SetStateAction<SectionFormData>>
  startSectionEdit: (i: number) => void
  cancelSectionEdit: () => void
  saveSectionEdit: () => void
  removeSection: (i: number) => void
  samplesLoaded: boolean
  playbackState: PlaybackState
  currentSectionIndex: number
  ranges: SectionRange[]
  currentSectionRef: React.RefObject<HTMLDivElement | null>
  sectionDragStart: (i: number) => () => void
  sectionDrop: (i: number) => (e: React.DragEvent) => void
  sectionTouchStart: (i: number) => (e: React.TouchEvent) => void
  sectionTouchMove: (e: React.TouchEvent) => void
  sectionTouchEnd: (e: React.TouchEvent) => void
  setShowPatternEditor: (v: boolean) => void
}

// Русский комментарий: отдельная страница песен, которая переключается между списком и деталями текущей песни.
export function SongsPage({
  songs,
  currentSong,
  newSongName,
  setNewSongName,
  createSong,
  selectSong,
  deleteSong,
  songDragStart,
  allow,
  songDrop,
  songTouchStart,
  songTouchMove,
  songTouchEnd,
  bpm,
  updateSongBpm,
  changeBpm,
  sectionTypes,
  newSection,
  setNewSection,
  showAddForm,
  setShowAddForm,
  addSection,
  editingSectionIndex,
  editSectionData,
  setEditSectionData,
  startSectionEdit,
  cancelSectionEdit,
  saveSectionEdit,
  removeSection,
  samplesLoaded,
  playbackState,
  currentSectionIndex,
  ranges,
  currentSectionRef,
  sectionDragStart,
  sectionDrop,
  sectionTouchStart,
  sectionTouchMove,
  sectionTouchEnd,
  setShowPatternEditor,
}: SongsPageProps) {
  if (!currentSong) {
    return (
      <SongList
        songs={songs}
        newSongName={newSongName}
        setNewSongName={setNewSongName}
        createSong={createSong}
        selectSong={selectSong}
        deleteSong={deleteSong}
        songDragStart={songDragStart}
        allow={allow}
        songDrop={songDrop}
        songTouchStart={songTouchStart}
        songTouchMove={songTouchMove}
        songTouchEnd={songTouchEnd}
      />
    )
  }

  return (
    <SongDetail
      currentSong={currentSong}
      bpm={bpm}
      updateSongBpm={updateSongBpm}
      changeBpm={changeBpm}
      sectionTypes={sectionTypes}
      newSection={newSection}
      setNewSection={setNewSection}
      showAddForm={showAddForm}
      setShowAddForm={setShowAddForm}
      addSection={addSection}
      editingSectionIndex={editingSectionIndex}
      editSectionData={editSectionData}
      setEditSectionData={setEditSectionData}
      startSectionEdit={startSectionEdit}
      cancelSectionEdit={cancelSectionEdit}
      saveSectionEdit={saveSectionEdit}
      removeSection={removeSection}
      setShowPatternEditor={setShowPatternEditor}
      samplesLoaded={samplesLoaded}
      playbackState={playbackState}
      currentSectionIndex={currentSectionIndex}
      ranges={ranges}
      currentSectionRef={currentSectionRef}
      sectionDragStart={sectionDragStart}
      sectionDrop={sectionDrop}
      sectionTouchStart={sectionTouchStart}
      sectionTouchMove={sectionTouchMove}
      sectionTouchEnd={sectionTouchEnd}
    />
  )
}
