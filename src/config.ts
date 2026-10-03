// Константы приложения — обычные данные, не зависят от фреймворка.
// Перенесено из v1 почти без изменений.
import { DrumRole } from './types.ts'

export const CONFIG = {
  MAX_SONGS: 50,
  MAX_SECTIONS: 20,
  MAX_SONG_NAME_LENGTH: 100,
  MAX_COMMENT_LENGTH: 200,
  MIN_BPM: 40,
  MAX_BPM: 240,
  DEFAULT_BPM: 120,
  BEATS_PER_BAR: 4,
  SAVE_DEBOUNCE_MS: 400,
} as const

export const SAMPLES_BASE = 'sound/Real Drum Kit'

export const PATTERN_INSTRUMENTS = [
  { id: 'bd', label: 'BD', color: '#fb923c', freq: 120, sample: `${SAMPLES_BASE}/BD.wav` },
  { id: 'sd', label: 'SD', color: '#facc15', freq: 220, sample: `${SAMPLES_BASE}/SN.wav` },
  { id: 'hh', label: 'HH', color: '#60a5fa', freq: 450, sample: `${SAMPLES_BASE}/HH.wav` },
]

export const PATTERN_STEPS = 16

// Роли барабана для библиотеки битов/брейков (screens/beatsScreen.ts,
// beatEditorScreen.ts) — фиксированный набор, звук на роль даёт «кит»
// (DRUM_KITS), а не хардкод сэмпла на дорожку. Так позже можно добавить
// выбор кита, не переделывая модель данных бита.
export const DRUM_ROLES: DrumRole[] = ['kick', 'snare', 'hihat', 'tom1', 'tom2', 'tom3', 'crash', 'ride']

export interface DrumKit {
  id: string
  name: string
  sounds: Record<DrumRole, { label: string; sample: string }>
}

export const DRUM_KITS: DrumKit[] = [
  {
    id: 'real',
    name: 'Real Drum Kit',
    sounds: {
      kick: { label: 'Bass Drum', sample: `${SAMPLES_BASE}/BD.wav` },
      snare: { label: 'Snare', sample: `${SAMPLES_BASE}/SN.wav` },
      hihat: { label: 'Hi-Hat', sample: `${SAMPLES_BASE}/HH.wav` },
      tom1: { label: 'Tom 1', sample: `${SAMPLES_BASE}/TOMHI5.wav` },
      tom2: { label: 'Tom 2', sample: `${SAMPLES_BASE}/TOMMID5.wav` },
      tom3: { label: 'Tom 3', sample: `${SAMPLES_BASE}/TOMLOW5.wav` },
      crash: { label: 'Crash', sample: `${SAMPLES_BASE}/CRASH.wav` },
      ride: { label: 'Ride', sample: `${SAMPLES_BASE}/RIDE.wav` },
    },
  },
  {
    id: 'pearl',
    name: 'Pearl Real Kit',
    sounds: {
      kick: { label: 'Bass Drum', sample: 'sound/Pearl Real Kit/pearlkit-kick.wav' },
      snare: { label: 'Snare', sample: 'sound/Pearl Real Kit/pearlkit-snare1.wav' },
      hihat: { label: 'Hi-Hat', sample: 'sound/Pearl Real Kit/pearlkit-hihat.wav' },
      tom1: { label: 'Tom 1', sample: 'sound/Pearl Real Kit/pearlkit-hitom1.wav' },
      tom2: { label: 'Tom 2', sample: 'sound/Pearl Real Kit/pearlkit-hitom2.wav' },
      tom3: { label: 'Tom 3', sample: 'sound/Pearl Real Kit/pearlkit-lowtom1.wav' },
      // У Pearl-кита нет отдельного crash — берём ближайший по звучанию файл.
      crash: { label: 'Crash', sample: 'sound/Pearl Real Kit/pearlkit-ridecrash.wav' },
      ride: { label: 'Ride', sample: 'sound/Pearl Real Kit/pearlkit-ride1.wav' },
    },
  },
]
export const DEFAULT_KIT_ID = DRUM_KITS[0].id

// Плоские id для sampleLoader — по одному на (кит, роль), напр. "real_kick".
export const KIT_INSTRUMENTS = DRUM_KITS.flatMap((kit) =>
  DRUM_ROLES.map((role) => ({ id: `${kit.id}_${role}`, sample: kit.sounds[role].sample }))
)

// Максимальная длина бита в шагах (столбцах сетки) — тот же предел, что у
// референса (realdrummetronome.com/editor, 128 столбцов).
export const BEAT_MAX_STEPS = 128

// Цвет закрашенной клетки в редакторе бита — по роли, не по киту (кит просто
// меняет сэмпл под той же ролью).
export const DRUM_ROLE_COLORS: Record<DrumRole, string> = {
  kick: '#fb923c',
  snare: '#facc15',
  hihat: '#60a5fa',
  tom1: '#f472b6',
  tom2: '#fb7185',
  tom3: '#f87171',
  crash: '#34d399',
  ride: '#4ade80',
}

export const DRUM_ROLE_LABELS: Record<DrumRole, string> = {
  kick: 'Бас-бочка',
  snare: 'Малый',
  hihat: 'Хай-хэт',
  tom1: 'Том 1',
  tom2: 'Том 2',
  tom3: 'Том 3',
  crash: 'Крэш',
  ride: 'Райд',
}

export const VOICE_SAMPLES = [
  { id: 'voice_1', sample: 'sound/Voices/number_1.wav' },
  { id: 'voice_2', sample: 'sound/Voices/number_2.wav' },
  { id: 'voice_3', sample: 'sound/Voices/number_3.wav' },
  { id: 'voice_4', sample: 'sound/Voices/number_4.wav' },
  { id: 'voice_5', sample: 'sound/Voices/number_5.wav' },
  { id: 'voice_6', sample: 'sound/Voices/number_6.wav' },
  { id: 'voice_7', sample: 'sound/Voices/number_7.wav' },
  { id: 'voice_8', sample: 'sound/Voices/number_8.wav' },
]

export const SECTION_VOICE_SAMPLES = [
  { id: 'voice_INTRO', sample: 'sound/Voices/intro.wav' },
  { id: 'voice_VERSE', sample: 'sound/Voices/verse.wav' },
  { id: 'voice_PRECHORUS', sample: 'sound/Voices/prechorus.wav' },
  { id: 'voice_CHORUS', sample: 'sound/Voices/chorus.wav' },
  { id: 'voice_POSTCHORUS', sample: 'sound/Voices/postchorus.wav' },
  { id: 'voice_BRIDGE', sample: 'sound/Voices/bridge.wav' },
  { id: 'voice_SOLO', sample: 'sound/Voices/solo.wav' },
  { id: 'voice_OUTRO', sample: 'sound/Voices/outro.wav' },
  { id: 'voice_PAUSE', sample: 'sound/Voices/pause.wav' },
  { id: 'voice_END', sample: 'sound/Voices/outro.wav' }, // нет отдельного end.wav
]

export const SECTION_TYPES = [
  'INTRO', 'VERSE', 'PRECHORUS', 'CHORUS', 'POSTCHORUS',
  'BRIDGE', 'SOLO', 'OUTRO', 'PAUSE',
]

// ВАЖНО: при добавлении новой группы сэмплов — добавить и сюда (иначе
// sampleLoader их не загрузит), и в globPatterns в vite.config.ts (иначе
// не попадут в офлайн-прекеш).
export const ALL_INSTRUMENTS = [...PATTERN_INSTRUMENTS, ...KIT_INSTRUMENTS, ...VOICE_SAMPLES, ...SECTION_VOICE_SAMPLES]

export const instrumentMetaById: Record<string, { id: string; sample?: string }> =
  ALL_INSTRUMENTS.reduce((acc, inst) => {
    acc[inst.id] = inst
    return acc
  }, {} as Record<string, { id: string; sample?: string }>)

export const instrumentFrequencyMap: Record<string, number> = PATTERN_INSTRUMENTS.reduce((acc, inst) => {
  acc[inst.id] = inst.freq
  return acc
}, {} as Record<string, number>)

export const TOUCH_DRAG_DELAY_MS = 180
