import { RefObject } from 'react'
import { useTheme } from '../ThemeContext'
import { Section, SectionRange, PlaybackState, SectionFormData } from '../types'
import { Icon } from './Icon'

interface SectionCardProps {
  section: Section
  sectionIndex: number
  isCurrentSection: boolean
  range: SectionRange | undefined
  playbackState: PlaybackState
  editingSectionIndex: number | null
  editSectionData: SectionFormData
  setEditSectionData: React.Dispatch<React.SetStateAction<SectionFormData>>
  sectionTypes: string[]
  startSectionEdit: (i: number) => void
  cancelSectionEdit: () => void
  saveSectionEdit: () => void
  removeSection: (i: number) => void
  currentSectionRef: RefObject<HTMLDivElement | null> | null
  sectionDragStart: (i: number) => () => void
  sectionDrop: (i: number) => (e: React.DragEvent) => void
  sectionTouchStart: (i: number) => (e: React.TouchEvent) => void
  sectionTouchMove: (e: React.TouchEvent) => void
  sectionTouchEnd: (e: React.TouchEvent) => void
}

export function SectionCard({
  section, sectionIndex, isCurrentSection,
  range, playbackState,
  editingSectionIndex, editSectionData, setEditSectionData,
  sectionTypes,
  startSectionEdit, cancelSectionEdit, saveSectionEdit,
  removeSection, currentSectionRef,
  sectionDragStart, sectionDrop,
  sectionTouchStart, sectionTouchMove, sectionTouchEnd,
}: SectionCardProps) {
  const theme = useTheme()
  const isIntro = section.intro
  const allow = (e: React.DragEvent) => e.preventDefault()

  return (
    <div
      data-section-index={sectionIndex}
      ref={currentSectionRef as RefObject<HTMLDivElement>}
      draggable={!isIntro}
      onDragStart={sectionDragStart(sectionIndex)}
      onDragOver={!isIntro ? allow : undefined}
      onDrop={!isIntro ? sectionDrop(sectionIndex) : undefined}
      onTouchStart={sectionTouchStart(sectionIndex)}
      onTouchMove={sectionTouchMove}
      onTouchEnd={sectionTouchEnd}
      className={`p-3 rounded-2xl border transition-all ${
        isCurrentSection ? theme.cardActive : 'border-slate-700 bg-slate-800/50'
      }`}
    >
      {/* Header */}
      <div className="flex items-center gap-2 mb-2">
        {!isIntro && (
          <span className={`cursor-grab select-none touch-none ${theme.textSub}`}>
            <Icon name="dots-six-vertical" />
          </span>
        )}
        <span className="font-bold">{section.name}</span>
        <span className={`text-sm ${theme.textSub}`}>{section.bars} bars</span>
        {!isIntro && (
          <div className="ml-auto flex gap-1">
            <button
              onClick={() => startSectionEdit(sectionIndex)}
              className={`p-1.5 rounded-lg transition ${theme.btn}`}
            >
              <Icon name="pencil-simple" />
            </button>
            <button
              onClick={() => removeSection(sectionIndex)}
              className={`p-1.5 rounded-lg transition ${theme.btnDanger}`}
            >
              <Icon name="trash" />
            </button>
          </div>
        )}
      </div>

      {section.comment && (
        <div className={`font-bold text-lg mt-1 mb-2 ${theme.text}`}>{section.comment}</div>
      )}

      {/* Beat grid */}
      {range && (
        <div className="grid grid-cols-8 gap-1">
          {Array.from({ length: section.bars * 4 }).map((_, idx) => {
            const barNum    = range.start + Math.floor(idx / 4)
            const localBeat = (idx % 4) + 1
            const absClick  = barNum * 4 + (localBeat - 1)
            const currentAbs = playbackState.bar * 4 + playbackState.beat - 1
            const isCurrent = absClick === currentAbs
            const isFilled  = absClick <= currentAbs
            const isFirstBeat = localBeat === 1
            return (
              <div
                key={idx}
                className={`h-5 rounded-md transition-all duration-100 ${
                  isFilled
                    ? isCurrent ? theme.beatGridCurrent : theme.beatGridFilled
                    : isFirstBeat ? theme.beatGridBar : theme.beatGridEmpty
                }`}
              />
            )
          })}
        </div>
      )}

      {/* Edit form */}
      {editingSectionIndex === sectionIndex && (
        <div className={`mt-4 p-3 rounded-xl space-y-3 ${theme.card}`}>
          <div className={`text-sm ${theme.textSub}`}>Редактирование секции</div>
          <select
            value={editSectionData.name}
            onChange={(e) => setEditSectionData(prev => ({ ...prev, name: e.target.value }))}
            className={`w-full px-3 py-2 rounded-lg focus:outline-none ${theme.input}`}
          >
            {sectionTypes.map(t => <option key={t}>{t}</option>)}
          </select>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setEditSectionData(prev => ({ ...prev, bars: Math.max(1, (prev.bars || 1) - 1) }))}
              className={`px-4 py-2 rounded-2xl ${theme.btn}`}
            >
              <Icon name="minus" />
            </button>
            <input
              type="number"
              value={editSectionData.bars}
              onChange={(e) => setEditSectionData(prev => ({ ...prev, bars: Math.max(1, +e.target.value) }))}
              className={`flex-1 px-3 py-2 rounded-lg text-center appearance-none focus:outline-none focus:border-violet-500 transition ${theme.input}`}
              min={1} max={16}
            />
            <button
              type="button"
              onClick={() => setEditSectionData(prev => ({ ...prev, bars: Math.min(16, (prev.bars || 1) + 1) }))}
              className={`px-4 py-2 rounded-2xl ${theme.btn}`}
            >
              <Icon name="plus" />
            </button>
          </div>

          <input
            type="text"
            placeholder="Комментарий (опционально)"
            value={editSectionData.comment}
            onChange={(e) => setEditSectionData(prev => ({ ...prev, comment: e.target.value }))}
            className={`w-full px-3 py-2 rounded-lg focus:outline-none focus:border-violet-500 transition ${theme.input}`}
          />

          <div className="flex gap-3">
            <button
              onClick={saveSectionEdit}
              className={`flex-1 py-2 rounded-2xl font-bold flex items-center justify-center gap-2 ${theme.btnAccent}`}
            >
              <Icon name="floppy-disk" /> Сохранить
            </button>
            <button onClick={cancelSectionEdit} className={`py-2 px-4 rounded-2xl ${theme.btn}`}>
              <Icon name="x" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
