// Планировщик Web Audio API — перенесено из v1 (engine/audioEngine.ts)
// механически: useRef/useState → обычные переменные в замыкании,
// React-состояние → подписки (колбэки). Сам алгоритм lookahead-планирования
// не менялся: setTimeout каждые 25ms планирует ноты на 100ms вперёд через
// AudioContext.currentTime; события для UI (текущий бит/бар/шаг паттерна)
// кладутся в очередь и применяются отдельным requestAnimationFrame-циклом,
// чтобы отрисовка не могла сбить тайминг звука.
//
// Побочный эффект ухода от React: schedule() читает bpm/currentSong/
// beatsPerBar/voiceCues напрямую из замыкания на каждой итерации, а не из
// захваченных при последнем create() параметров — значит, в отличие от v1,
// изменение темпа во время игры применяется без остановки/запуска. Не
// буквально в тот же миг: уже запланированная на старом темпе доля
// довисит до конца (nextNoteTime посчитан по старому bpm), новый темп
// вступает в силу с СЛЕДУЮЩЕЙ доли — задержка максимум в один интервал
// между долями на старом темпе. См. tests/audioEngine.test.ts.
import { Song, PlaybackState, Pattern } from '../types.ts'
import { PATTERN_STEPS, CONFIG, instrumentFrequencyMap } from '../config.ts'
import { createSampleLoader } from './sampleLoader.ts'

interface VisualEvent {
  time: number
  type: 'beat' | 'tick' | 'stop'
  beat?: number
  bar?: number
  patternStep?: number
  subBeat?: number
  nextSectionName?: string | null
}

const EMPTY_PLAYBACK_STATE: PlaybackState = { beat: 1, bar: 0, subBeat: 0, patternStep: 0, nextSectionName: null }

const patternHasActiveSteps = (pattern: Song['pattern'] | undefined) =>
  !!pattern?.tracks?.some((track) => track.steps.some(Boolean))

const totalBars = (song: Song) => song.sections.reduce((s, sec) => s + sec.bars, 0)

const stepsPerBeatOf = (pattern: Pattern) => pattern.stepsPerBeat ?? 2

/** Что звучит на доле: паттерн и шаг, с которого он начинается на этой доле. */
interface SoundSource {
  pattern: Pattern
  firstStep: number
  /** Грув и паттерн песни идут по кругу, филл — один раз. */
  loop: boolean
  /** Шаг показывается в событиях (patternStep) только для паттерна песни —
   * его подсвечивает редактор паттерна и плейхед редактора бита. */
  isSongPattern: boolean
}

export interface AudioEngine {
  setSong(song: Song | null): void
  setBpm(bpm: number): void
  setVoiceCues(v: boolean): void
  setVoiceCount(v: boolean): void
  setBeatsPerBar(n: number): void
  /** Деление доли — на сколько «ударов» разбивается одна доля (кольцо
   * метронома, см. metronomeScreen.ts). В режиме простого клика (без
   * песни/паттерна и без счёта голосом) удары внутри доли тоже звучат —
   * обычным кликом, в отличие от акцента на самой доле. */
  setBeatDivision(n: number): void
  start(): Promise<void>
  stop(): void
  /** Проиграть один сэмпл прямо сейчас, вне расписания — прослушка в
   * редакторе бита (тап по иконке инструмента, «Звук при клике»). Не
   * трогает воспроизведение и его состояние. */
  previewSound(instrumentId: string): void
  readonly isPlaying: boolean
  readonly beatsPerBar: number
  readonly beatDivision: number
  readonly samplesLoaded: boolean
  onPlaybackState(cb: (s: PlaybackState) => void): void
  onPlayingChange(cb: (playing: boolean) => void): void
  onBeatsPerBarChange(cb: (n: number) => void): void
  onBeatDivisionChange(cb: (n: number) => void): void
  onSamplesLoadedChange(cb: (loaded: boolean) => void): void
}

export function createAudioEngine(): AudioEngine {
  const sampleLoader = createSampleLoader()

  let audioContext: AudioContext | null = null
  let timer: ReturnType<typeof setTimeout> | null = null
  let nextNoteTime = 0
  let beat = 1
  let bar = 0
  let beatsPerBar = 4
  let beatDivision = 4
  let isPlaying = false
  let bpm: number = CONFIG.DEFAULT_BPM
  let currentSong: Song | null = null
  let voiceCues = false
  let voiceCount = false
  let visualQueue: VisualEvent[] = []
  let visualRaf: number | null = null

  let playbackListener: ((s: PlaybackState) => void) | null = null
  let playingListener: ((p: boolean) => void) | null = null
  let beatsPerBarListener: ((n: number) => void) | null = null
  let beatDivisionListener: ((n: number) => void) | null = null

  // 'tick'-события несут только subBeat и должны сливаться с уже известными
  // beat/bar/patternStep, а не затирать их — поэтому храним последнее
  // полное состояние и патчим его, а не передаём событие как есть.
  let lastPlaybackState: PlaybackState = EMPTY_PLAYBACK_STATE
  const setPlaybackState = (patch: Partial<PlaybackState>) => {
    lastPlaybackState = { ...lastPlaybackState, ...patch }
    playbackListener?.(lastPlaybackState)
  }
  const resetPlaybackState = () => {
    lastPlaybackState = EMPTY_PLAYBACK_STATE
    playbackListener?.(lastPlaybackState)
  }
  const setIsPlaying = (next: boolean) => {
    isPlaying = next
    playingListener?.(next)
  }

  function ensureAudioContext(): AudioContext {
    if (!audioContext) {
      audioContext = new AudioContext()
      sampleLoader.setAudioContext(audioContext)
    }
    return audioContext
  }

  sampleLoader.prefetchAll()
  // Фикс относительно v1: там decode всех сэмплов запускался только при
  // выборе песни, поэтому голый метроном без песни был неиграбелен (кнопка
  // Play заблокирована до samplesLoaded). Метроном — первая фича по плану,
  // должна работать без песни, поэтому декодируем сразу при создании движка,
  // через тот же ensureAudioContext — один AudioContext на всё приложение,
  // а не по одному на препрогрузку и на воспроизведение.
  ensureAudioContext()
  void sampleLoader.preloadAllSamples()

  // Системный (синтезированный) клик — не сэмпл. Акцент — доли такта
  // (крупные точки кольца), обычный — удары внутри доли (деление, мелкие
  // точки). Короткая экспоненциальная огибающая (15ms) — щелчок, а не тон.
  function clickSound(time: number, accent: boolean) {
    const ctx = audioContext
    if (!ctx) return
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.type = 'square'
    osc.frequency.value = accent ? 1600 : 1000
    // setValueAtTime(..., time), а не просто gain.gain.value = ... — клик
    // планируется на будущее (lookahead до 100ms), и без явного якоря на
    // time экспоненциальный спад стартует от "сейчас" и к моменту
    // реального start(time) успевает почти полностью затухнуть — клик не
    // слышен (баг, из-за которого звук не был слышен вообще).
    gain.gain.setValueAtTime(accent ? 0.9 : 0.5, time)
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.015)
    osc.start(time)
    osc.stop(time + 0.015)
  }

  function playInstrumentSound(instrumentId: string, time: number) {
    const ctx = audioContext
    if (!ctx) return
    const buffer = sampleLoader.getBuffer(instrumentId)
    if (buffer) {
      const source = ctx.createBufferSource()
      source.buffer = buffer
      source.connect(ctx.destination)
      source.start(time)
      return
    }
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.type = 'triangle'
    osc.frequency.value = instrumentFrequencyMap[instrumentId] || 220
    gain.gain.value = 0.5
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.12)
    osc.start(time)
    osc.stop(time + 0.12)
  }

  // Источник звука на доле секции: филл, покрывающий эту долю (поздний
  // перекрывает ранний; обрезается концом секции) → бит секции (по кругу от
  // начала секции) → паттерн песни (по кругу от начала песни, как всегда).
  // Бит/филл на N/M занимает N долей, шаг — 1/M доли.
  function soundSourceAt(sectionIdx: number, beatInSection: number, totalBeatsPassed: number): SoundSource | null {
    const section = sectionIdx >= 0 ? currentSong?.sections[sectionIdx] : undefined
    if (section) {
      const sectionBeats = section.bars * beatsPerBar
      let fill: { at: number; pattern: Pattern } | null = null
      for (const f of section.fillPatterns ?? []) {
        const beats = Math.ceil(f.pattern.steps / stepsPerBeatOf(f.pattern))
        const covers = beatInSection >= f.at && beatInSection < Math.min(f.at + beats, sectionBeats)
        if (covers && (!fill || f.at > fill.at)) fill = f
      }
      if (fill) {
        return { pattern: fill.pattern, firstStep: (beatInSection - fill.at) * stepsPerBeatOf(fill.pattern), loop: false, isSongPattern: false }
      }
      if (section.groove) {
        return { pattern: section.groove, firstStep: beatInSection * stepsPerBeatOf(section.groove), loop: true, isSongPattern: false }
      }
    }
    const pattern = currentSong?.pattern
    if (!pattern) return null
    return { pattern, firstStep: totalBeatsPassed * stepsPerBeatOf(pattern), loop: true, isSongPattern: true }
  }

  function schedule() {
    const ctx = audioContext
    if (!ctx) return
    const ct = ctx.currentTime
    const lookahead = 0.1
    const songTotalBars = currentSong ? totalBars(currentSong) : 0
    const loopIndefinitely = currentSong ? !currentSong.sections.some((sec) => !sec.intro) : false

    const sectionRanges = (() => {
      let start = 0
      return (currentSong?.sections || []).map((sec) => {
        const end = start + sec.bars - 1
        const range = { start, end }
        start = end + 1
        return range
      })
    })()

    while (nextNoteTime < ct + lookahead) {
      const scheduledTime = nextNoteTime
      const currentBeatValue = beat
      const currentBarValue = bar
      const totalBeatsPassed = currentBarValue * beatsPerBar + (currentBeatValue - 1)

      const sectionIdx = sectionRanges.findIndex(
        (r) => currentBarValue >= r.start && currentBarValue <= r.end
      )
      const beatInSection =
        sectionIdx >= 0 ? (currentBarValue - sectionRanges[sectionIdx].start) * beatsPerBar + (currentBeatValue - 1) : 0
      const source = soundSourceAt(sectionIdx, beatInSection, totalBeatsPassed)
      const usePatternSounds = !!source && patternHasActiveSteps(source.pattern)
      const isLastBarOfSection = sectionIdx >= 0 && currentBarValue === sectionRanges[sectionIdx].end
      const hasNextSection = sectionIdx >= 0 && sectionIdx < (currentSong?.sections.length ?? 0) - 1
      const nextSection = hasNextSection ? currentSong!.sections[sectionIdx + 1] : null
      const nextSectionName = nextSection ? nextSection.name : sectionIdx >= 0 ? 'END' : null

      if (voiceCues && isLastBarOfSection) {
        if (currentBeatValue === 1) {
          playInstrumentSound(`voice_${nextSectionName}`, scheduledTime)
        } else {
          playInstrumentSound(`voice_${currentBeatValue}`, scheduledTime)
        }
      }

      if (usePatternSounds) {
        const { pattern } = source!
        const patternLength = pattern.steps || PATTERN_STEPS
        // Шагов на долю — из паттерна: у бита это M его размера N/M, у
        // паттерна песни — 2 (восьмые), как было всегда.
        const subDiv = stepsPerBeatOf(pattern)
        const subDuration = 60 / bpm / subDiv

        for (let sub = 0; sub < subDiv; sub++) {
          const subTime = scheduledTime + sub * subDuration
          const step = source!.firstStep + sub
          const stepIndex = source!.loop ? step % patternLength : step

          if (stepIndex < patternLength) {
            pattern.tracks.forEach((track) => {
              if (track.steps[stepIndex]) playInstrumentSound(track.id, subTime)
            })
          }

          visualQueue.push({
            time: subTime,
            type: 'beat',
            beat: currentBeatValue,
            bar: currentBarValue,
            patternStep: source!.isSongPattern ? stepIndex : -1,
            nextSectionName,
          })
        }
      } else {
        visualQueue.push({
          time: scheduledTime,
          type: 'beat',
          beat: currentBeatValue,
          bar: currentBarValue,
          patternStep: 0,
          nextSectionName,
        })
        // «Счёт голосом» вместо клика — только когда нет активного паттерна
        // (иначе счёт и паттерн будут спорить друг с другом за долю).
        // Сэмплов голоса хватает на 1–8; при большем числе долей в такте
        // просто не считаем сверх восьмой, клик тоже не проигрывается —
        // так честнее, чем молчаливо повторять "8" не в такт.
        if (voiceCount && currentBeatValue <= 8) {
          playInstrumentSound(`voice_${currentBeatValue}`, scheduledTime)
        } else if (!voiceCount) {
          clickSound(scheduledTime, true) // доля такта — всегда акцент
        }
      }

      // Тики кольца метронома (деление доли) — звучат обычным (не акцентным)
      // кликом, но только в режиме простого клика: если есть паттерн или
      // включён счёт голосом, они спорили бы за долю с тем звуком — как и
      // сама доля выше. t=0 совпадает по времени с 'beat'-событием выше
      // (subBeat уже становится 0 при его обработке), поэтому здесь t=1..N-1.
      const tickDuration = 60 / bpm / beatDivision
      for (let t = 1; t < beatDivision; t++) {
        const tickTime = scheduledTime + t * tickDuration
        visualQueue.push({ time: tickTime, type: 'tick', subBeat: t })
        if (!usePatternSounds && !voiceCount) {
          clickSound(tickTime, false)
        }
      }

      nextNoteTime += 60 / bpm

      if (beat === beatsPerBar) {
        beat = 1
        bar += 1
        if (songTotalBars > 0 && bar >= songTotalBars) {
          if (loopIndefinitely) {
            bar = 0
          } else {
            visualQueue.push({ time: scheduledTime + 0.001, type: 'stop' })
            return
          }
        }
      } else {
        beat += 1
      }
    }
    timer = setTimeout(schedule, 25)
  }

  function startVisualLoop() {
    const processVisuals = () => {
      if (!audioContext) {
        visualRaf = requestAnimationFrame(processVisuals)
        return
      }
      const now = audioContext.currentTime
      // 'tick'-события (без bar/beat) добавляются в schedule() отдельным
      // циклом от 'beat'/'stop' и могут оказаться в очереди не строго по
      // времени — сортируем перед разбором, drain ниже полагается на то,
      // что queue[0] всегда самое раннее.
      visualQueue.sort((a, b) => a.time - b.time)
      while (visualQueue.length && visualQueue[0].time <= now) {
        const event = visualQueue.shift()!
        if (event.type === 'stop') {
          // Сначала isPlaying = false, потом сброс — как в stop(): экраны
          // на сброс смотрят на engine.isPlaying, и в обратном порядке
          // принимали его за «играет, такт 0, доля 1» (сетка песни
          // оставалась с подсвеченной первой долей, кольцо — со вспышкой).
          setIsPlaying(false)
          resetPlaybackState()
          if (timer) {
            clearTimeout(timer)
            timer = null
          }
          visualQueue = []
          if (visualRaf) {
            cancelAnimationFrame(visualRaf)
            visualRaf = null
          }
          return
        }
        if (event.type === 'tick') {
          setPlaybackState({ subBeat: event.subBeat! })
          continue
        }
        setPlaybackState({
          beat: event.beat!,
          bar: event.bar!,
          subBeat: 0,
          patternStep: typeof event.patternStep === 'number' ? event.patternStep : 0,
          nextSectionName: event.nextSectionName ?? null,
        })
      }
      visualRaf = requestAnimationFrame(processVisuals)
    }
    visualRaf = requestAnimationFrame(processVisuals)
  }

  function stopVisualLoop() {
    if (visualRaf) {
      cancelAnimationFrame(visualRaf)
      visualRaf = null
    }
    visualQueue = []
  }

  async function start() {
    const ctx = ensureAudioContext()
    if (ctx.state === 'suspended') await ctx.resume()

    setIsPlaying(true)
    beat = 1
    bar = 0
    resetPlaybackState()
    visualQueue = []
    nextNoteTime = ctx.currentTime + 0.1
    schedule()
    startVisualLoop()
  }

  function stop() {
    setIsPlaying(false)
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
    stopVisualLoop()
    resetPlaybackState()
  }

  return {
    setSong(song) {
      currentSong = song
      if (song) {
        ensureAudioContext()
        void sampleLoader.preloadAllSamples()
      }
    },
    setBpm(next) {
      bpm = next
    },
    setVoiceCues(v) {
      voiceCues = v
    },
    setVoiceCount(v) {
      voiceCount = v
    },
    setBeatsPerBar(n) {
      beatsPerBar = n
      beatsPerBarListener?.(n)
    },
    setBeatDivision(n) {
      beatDivision = n
      beatDivisionListener?.(n)
    },
    start,
    stop,
    previewSound(instrumentId) {
      const ctx = ensureAudioContext()
      // Первый тап может прийти раньше любого Play — контекст ещё
      // suspended (политика автовоспроизведения), а resume() асинхронный:
      // планируем звук уже после него, иначе он уйдёт в «замороженное» время.
      if (ctx.state === 'suspended') void ctx.resume().then(() => playInstrumentSound(instrumentId, ctx.currentTime))
      else playInstrumentSound(instrumentId, ctx.currentTime)
    },
    get isPlaying() {
      return isPlaying
    },
    get beatsPerBar() {
      return beatsPerBar
    },
    get beatDivision() {
      return beatDivision
    },
    get samplesLoaded() {
      return sampleLoader.samplesLoaded
    },
    onPlaybackState(cb) {
      playbackListener = cb
    },
    onPlayingChange(cb) {
      playingListener = cb
    },
    onBeatsPerBarChange(cb) {
      beatsPerBarListener = cb
    },
    onBeatDivisionChange(cb) {
      beatDivisionListener = cb
    },
    onSamplesLoadedChange(cb) {
      sampleLoader.onSamplesLoadedChange(cb)
    },
  }
}
