import { useTheme } from '../ThemeContext'
import { SectionFormData } from '../types'
import { Icon } from './Icon'

interface SectionAddFormProps {
  newSection: SectionFormData
  setNewSection: React.Dispatch<React.SetStateAction<SectionFormData>>
  sectionTypes: string[]
  addSection: () => void
  onCancel: () => void
}

export function SectionAddForm({ newSection, setNewSection, sectionTypes, addSection, onCancel }: SectionAddFormProps) {
  const theme = useTheme()
  return (
    <div className={`p-3 rounded-xl space-y-3 ${theme.card}`}>
      <select
        value={newSection.name}
        onChange={(e) => setNewSection({ ...newSection, name: e.target.value })}
        className={`w-full px-3 py-2 rounded-lg focus:outline-none ${theme.input}`}
      >
        {sectionTypes.map(t => <option key={t}>{t}</option>)}
      </select>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => setNewSection(prev => ({ ...prev, bars: Math.max(1, (prev.bars || 1) - 1) }))}
          className={`px-4 py-2 rounded-2xl ${theme.btn}`}
        >
          <Icon name="minus" />
        </button>
        <input
          type="number"
          value={newSection.bars}
          onChange={(e) => setNewSection({ ...newSection, bars: Math.max(1, +e.target.value) })}
          className={`flex-1 px-3 py-2 rounded-lg text-center appearance-none focus:outline-none focus:border-violet-500 transition ${theme.input}`}
          min={1}
          max={16}
        />
        <button
          type="button"
          onClick={() => setNewSection(prev => ({ ...prev, bars: Math.min(16, (prev.bars || 1) + 1) }))}
          className={`px-4 py-2 rounded-2xl ${theme.btn}`}
        >
          <Icon name="plus" />
        </button>
      </div>

      <input
        type="text"
        placeholder="Комментарий (опционально)"
        value={newSection.comment}
        onChange={(e) => setNewSection({ ...newSection, comment: e.target.value })}
        className={`w-full px-3 py-2 rounded-lg focus:outline-none focus:border-violet-500 transition ${theme.input}`}
      />

      <div className="flex gap-3">
        <button
          onClick={addSection}
          className={`flex-1 py-2 rounded-2xl font-bold flex items-center justify-center gap-2 ${theme.btnAccent}`}
        >
          <Icon name="check" /> Добавить
        </button>
        <button onClick={onCancel} className={`py-2 px-4 rounded-2xl ${theme.btn}`}>
          <Icon name="x" />
        </button>
      </div>
    </div>
  )
}
