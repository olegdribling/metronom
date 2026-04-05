import { RefObject } from 'react'
import { useTheme } from '../ThemeContext'
import { Song, PlaybackState, SectionRange, SectionFormData } from '../types'
import { SectionCard } from './SectionCard'
import { SectionAddForm } from './SectionAddForm'
import { Icon } from './Icon'

interface SongDetailProps {
  currentSong: Song
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
  setShowPatternEditor: (v: boolean) => void
  samplesLoaded: boolean
  playbackState: PlaybackState
  currentSectionIndex: number
  ranges: SectionRange[]
  currentSectionRef: RefObject<HTMLDivElement | null>
  sectionDragStart: (i: number) => () => void
  sectionDrop: (i: number) => (e: React.DragEvent) => void
  sectionTouchStart: (i: number) => (e: React.TouchEvent) => void
  sectionTouchMove: (e: React.TouchEvent) => void
  sectionTouchEnd: (e: React.TouchEvent) => void
  handleBack: () => void
}

export function SongDetail({
  currentSong,
  sectionTypes,
  newSection, setNewSection,
  showAddForm, setShowAddForm,
  addSection,
  editingSectionIndex, editSectionData, setEditSectionData,
  startSectionEdit, cancelSectionEdit, saveSectionEdit,
  removeSection,
  playbackState,
  currentSectionIndex,
  ranges,
  currentSectionRef,
  sectionDragStart, sectionDrop,
  sectionTouchStart, sectionTouchMove, sectionTouchEnd,
  handleBack,
}: SongDetailProps) {
  const theme = useTheme()

  return (
    <div className="w-full max-w-xl mb-32 min-h-[calc(100vh-180px)]">
      {/* Header */}
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold truncate flex-1">{currentSong.name}</h2>
        <button
          onClick={handleBack}
          className={`px-3 py-2 rounded-2xl ml-3 flex items-center gap-1 text-sm ${theme.btn}`}
        >
          <Icon name="arrow-left" /> Назад
        </button>
      </div>

      {/* Sections */}
      <div className="space-y-3 mb-4">
        {currentSong.sections.map((sec, i) => (
          <SectionCard
            key={i}
            section={sec}
            sectionIndex={i}
            isCurrentSection={i === currentSectionIndex}
            range={ranges[i]}
            playbackState={playbackState}
            editingSectionIndex={editingSectionIndex}
            editSectionData={editSectionData}
            setEditSectionData={setEditSectionData}
            sectionTypes={sectionTypes}
            startSectionEdit={startSectionEdit}
            cancelSectionEdit={cancelSectionEdit}
            saveSectionEdit={saveSectionEdit}
            removeSection={removeSection}
            currentSectionRef={i === currentSectionIndex ? currentSectionRef : null}
            sectionDragStart={sectionDragStart}
            sectionDrop={sectionDrop}
            sectionTouchStart={sectionTouchStart}
            sectionTouchMove={sectionTouchMove}
            sectionTouchEnd={sectionTouchEnd}
          />
        ))}

        {!showAddForm ? (
          <button
            onClick={() => { cancelSectionEdit(); setShowAddForm(true) }}
            className={`w-full py-3 mt-1 rounded-2xl font-bold flex items-center justify-center gap-2 ${theme.btn}`}
          >
            <Icon name="plus" /> Добавить секцию
          </button>
        ) : (
          <SectionAddForm
            newSection={newSection}
            setNewSection={setNewSection}
            sectionTypes={sectionTypes}
            addSection={addSection}
            onCancel={() => {
              setShowAddForm(false)
              setNewSection({ name: 'VERSE', bars: 4, comment: '' })
            }}
          />
        )}
      </div>
    </div>
  )
}
