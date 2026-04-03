import { ThemeKey } from './types'

export interface Theme {
  _name: string
  page: string
  card: string
  cardActive: string
  btn: string
  btnAccent: string
  btnDanger: string
  btnDisabled: string
  input: string
  text: string
  textSub: string
  textMuted: string
  textAccent: string
  textDanger: string
  border: string
  borderStrong: string
  borderAccent: string
  borderDanger: string
  beat: string
  beatActive: string
  beatAccent: string
  stepOff: string
  stepCurrent: string
  beatGridCurrent: string
  beatGridFilled: string
  beatGridBar: string
  beatGridEmpty: string
  navActive: string
  navInactive: string
  navBg: string
  playBtn: string
  stopBtn: string
  sliderAccent: string
  instruments: { bd: string; sd: string; hh: string }
  preview: string[]
}

export const THEMES: Record<ThemeKey, Theme> = {
  purple: {
    _name: 'Purple',
    page:        'bg-slate-950 text-white',
    card:        'bg-slate-900 border border-slate-800 rounded-2xl',
    cardActive:  'bg-violet-950/50 border border-violet-400 ring-1 ring-violet-500/50 rounded-2xl',
    btn:         'bg-slate-800 hover:bg-slate-700 border border-slate-700 transition',
    btnAccent:   'bg-violet-600 hover:bg-violet-500 transition',
    btnDanger:   'bg-rose-600 hover:bg-rose-500 transition',
    btnDisabled: 'bg-slate-800 border border-slate-700 opacity-40 cursor-not-allowed',
    input:       'bg-slate-800 border border-slate-700 text-white placeholder-slate-500 focus:border-violet-500 focus:outline-none',
    text:        'text-white',
    textSub:     'text-slate-400',
    textMuted:   'text-slate-600',
    textAccent:  'text-violet-400',
    textDanger:  'text-rose-400',
    border:       'border-slate-800',
    borderStrong: 'border-slate-700',
    borderAccent: 'border-violet-400',
    borderDanger: 'border-rose-800',
    beat:        'bg-slate-800 text-slate-600',
    beatActive:  'bg-violet-600 ring-1 ring-violet-400 scale-105 text-white',
    beatAccent:  'bg-violet-400 ring-2 ring-violet-300 scale-110 text-white',
    stepOff:     'bg-slate-800 border border-slate-700',
    stepCurrent: 'ring-2 ring-violet-400',
    beatGridCurrent: 'bg-violet-400 ring-1 ring-violet-300',
    beatGridFilled:  'bg-violet-700/70',
    beatGridBar:     'bg-slate-600 border border-slate-500',
    beatGridEmpty:   'bg-slate-800',
    navActive:   'text-violet-400',
    navInactive: 'text-slate-500 hover:text-slate-300',
    navBg:       'bg-slate-950 border-t border-slate-800',
    playBtn:      'bg-violet-600 hover:bg-violet-500 shadow-lg shadow-violet-900/50',
    stopBtn:      'bg-rose-600 hover:bg-rose-500 shadow-lg shadow-rose-900/50',
    sliderAccent: 'accent-violet-500',
    instruments: { bd: '#f97316', sd: '#eab308', hh: '#3b82f6' },
    preview: ['bg-slate-950', 'bg-violet-600', 'bg-rose-600', 'bg-slate-800'],
  },

  gray: {
    _name: 'Gray',
    page:        'bg-white text-gray-950',
    card:        'bg-white border border-gray-200 rounded-2xl',
    cardActive:  'bg-white border border-gray-950 ring-1 ring-gray-900/20 rounded-2xl',
    btn:         'bg-white hover:bg-gray-50 border border-gray-200 transition text-gray-950',
    btnAccent:   'bg-white hover:bg-gray-50 border border-gray-200 text-gray-950 transition',
    btnDanger:   'bg-white hover:bg-gray-50 border border-gray-200 text-gray-950 transition',
    btnDisabled: 'bg-white border border-gray-200 opacity-40 cursor-not-allowed text-gray-950',
    input:       'bg-white border border-gray-200 text-gray-950 placeholder-gray-400 focus:border-gray-500 focus:outline-none',
    text:        'text-gray-950',
    textSub:     'text-gray-950',
    textMuted:   'text-gray-950',
    textAccent:  'text-gray-950',
    textDanger:  'text-gray-950',
    border:       'border-gray-200',
    borderStrong: 'border-gray-200',
    borderAccent: 'border-gray-950',
    borderDanger: 'border-gray-200',
    beat:        'bg-white border border-gray-200 text-gray-950',
    beatActive:  'bg-gray-200 ring-1 ring-gray-400 scale-105 text-gray-950',
    beatAccent:  'bg-gray-950 ring-2 ring-gray-700 scale-110 text-white',
    stepOff:     'bg-white border border-gray-200',
    stepCurrent: 'ring-2 ring-gray-950',
    beatGridCurrent: 'bg-gray-950',
    beatGridFilled:  'bg-gray-300',
    beatGridBar:     'bg-gray-100 border border-gray-200',
    beatGridEmpty:   'bg-white border border-gray-100',
    navActive:   'text-gray-950',
    navInactive: 'text-gray-400 hover:text-gray-700',
    navBg:       'bg-white border-t border-gray-200',
    playBtn:      'bg-white hover:bg-gray-50 border border-gray-200 text-gray-950 shadow-md',
    stopBtn:      'bg-white hover:bg-gray-50 border border-gray-200 text-gray-950 shadow-md',
    sliderAccent: 'accent-gray-950',
    instruments: { bd: '#111827', sd: '#374151', hh: '#6b7280' },
    preview: ['bg-white', 'bg-white', 'bg-gray-200', 'bg-gray-100'],
  },
}
