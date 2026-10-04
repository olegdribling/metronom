// Загрузка и декодирование сэмплов. Перенесено из v1 (engine/sampleLoader.ts):
// fetch → decodeAudioData, с кэшем буферов и дедупликацией параллельных
// запросов по одному id. AudioContext даёт движок (один на приложение,
// engine/audioEngine.ts) — до setAudioContext() декодировать нечем.
import { ALL_INSTRUMENTS, instrumentMetaById } from '../config.ts'

export interface SampleLoader {
  setAudioContext(ctx: AudioContext): void
  getBuffer(instrumentId: string): AudioBuffer | undefined
  /** Загрузить и декодировать все сэмплы; не загрузившиеся раньше (нет
   * сети) пробуются заново — повторный вызов дёшев. */
  preloadAllSamples(): Promise<void>
  readonly samplesLoaded: boolean
  onSamplesLoadedChange(cb: (loaded: boolean) => void): void
}

export function createSampleLoader(): SampleLoader {
  let audioContext: AudioContext | null = null
  const sampleBuffers: Record<string, AudioBuffer> = {}
  // Промис регистрируется сразу, до первого await, — иначе два параллельных
  // вызова (предзагрузка при старте и повтор при Play) декодировали бы один
  // сэмпл дважды.
  const inFlight: Record<string, Promise<AudioBuffer | null>> = {}
  let samplesLoaded = false
  let listener: ((loaded: boolean) => void) | null = null

  async function load(instrumentId: string, ctx: AudioContext): Promise<AudioBuffer | null> {
    const samplePath = instrumentMetaById[instrumentId]?.sample
    if (!samplePath) return null
    try {
      const res = await fetch(`/${samplePath}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const buffer = await ctx.decodeAudioData(await res.arrayBuffer())
      sampleBuffers[instrumentId] = buffer
      return buffer
    } catch (err) {
      console.warn(`Не удалось загрузить сэмпл "${instrumentId}":`, err)
      return null
    }
  }

  function ensureSampleBuffer(instrumentId: string): Promise<AudioBuffer | null> {
    if (sampleBuffers[instrumentId]) return Promise.resolve(sampleBuffers[instrumentId])
    if (!audioContext) return Promise.resolve(null)
    inFlight[instrumentId] ??= load(instrumentId, audioContext).finally(() => {
      delete inFlight[instrumentId]
    })
    return inFlight[instrumentId]
  }

  async function preloadAllSamples(): Promise<void> {
    if (!audioContext) return
    // Неудавшиеся сэмплы движок заменяет осциллятором — играть можно и без
    // них, поэтому «загружено» — когда попытка прошла, а не когда всё удалось.
    await Promise.all(ALL_INSTRUMENTS.map((inst) => ensureSampleBuffer(inst.id)))
    if (!samplesLoaded) {
      samplesLoaded = true
      listener?.(true)
    }
  }

  return {
    setAudioContext(ctx) {
      audioContext = ctx
    },
    getBuffer(instrumentId) {
      return sampleBuffers[instrumentId]
    },
    preloadAllSamples,
    get samplesLoaded() {
      return samplesLoaded
    },
    onSamplesLoadedChange(cb) {
      listener = cb
    },
  }
}
