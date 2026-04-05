export const CONFIG = {
  MAX_SONGS: 50,
  MAX_SECTIONS: 20,
  MAX_SONG_NAME_LENGTH: 100,
  MAX_COMMENT_LENGTH: 200,
  MIN_BPM: 40,
  MAX_BPM: 240,
  DEFAULT_BPM: 120,
  BEATS_PER_BAR: 4,
  SAVE_DEBOUNCE_MS: 1000,
  MAX_DOCUMENT_SIZE: 900000,
  CLICK_ACCENT_SAMPLE: 'sound/Real Drum Kit/SN.wav',
  CLICK_REGULAR_SAMPLE: 'sound/Real Drum Kit/HH.wav',
} as const

export const SAMPLES_BASE = 'sound/Real Drum Kit'

export const PATTERN_INSTRUMENTS = [
  { id: 'bd', label: 'BD', color: '#fb923c', freq: 120, sample: `${SAMPLES_BASE}/BD.wav` },
  { id: 'sd', label: 'SD', color: '#facc15', freq: 220, sample: `${SAMPLES_BASE}/SN.wav` },
  { id: 'hh', label: 'HH', color: '#60a5fa', freq: 450, sample: `${SAMPLES_BASE}/HH.wav` },
]

export const PATTERN_STEPS = 16

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
  { id: 'voice_INTRO',      sample: 'sound/Voices/intro.wav' },
  { id: 'voice_VERSE',      sample: 'sound/Voices/verse.wav' },
  { id: 'voice_PRECHORUS',  sample: 'sound/Voices/prechorus.wav' },
  { id: 'voice_CHORUS',     sample: 'sound/Voices/chorus.wav' },
  { id: 'voice_POSTCHORUS', sample: 'sound/Voices/postchorus.wav' },
  { id: 'voice_BRIDGE',     sample: 'sound/Voices/bridge.wav' },
  { id: 'voice_SOLO',       sample: 'sound/Voices/solo.wav' },
  { id: 'voice_OUTRO',      sample: 'sound/Voices/outro.wav' },
  { id: 'voice_PAUSE',      sample: 'sound/Voices/pause.wav' },
  { id: 'voice_END',        sample: 'sound/Voices/outro.wav' },
]

export const CLICK_SAMPLES = [
  { id: 'click_hi', sample: CONFIG.CLICK_ACCENT_SAMPLE },
  { id: 'click_lo', sample: CONFIG.CLICK_REGULAR_SAMPLE },
]

export const SECTION_TYPES = [
  'INTRO', 'VERSE', 'PRECHORUS', 'CHORUS', 'POSTCHORUS',
  'BRIDGE', 'SOLO', 'OUTRO', 'PAUSE',
]

export const ALL_INSTRUMENTS = [...PATTERN_INSTRUMENTS, ...VOICE_SAMPLES, ...SECTION_VOICE_SAMPLES, ...CLICK_SAMPLES]

export const instrumentMetaById = ALL_INSTRUMENTS.reduce<Record<string, { id: string; sample?: string }>>((acc, inst) => {
  acc[inst.id] = inst
  return acc
}, {})

export const instrumentFrequencyMap = PATTERN_INSTRUMENTS.reduce<Record<string, number>>((acc, inst) => {
  acc[inst.id] = inst.freq
  return acc
}, {})

export const TOUCH_DRAG_DELAY_MS = 180
