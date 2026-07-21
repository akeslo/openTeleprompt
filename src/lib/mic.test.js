import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createMicEngine, SILENCE_DELAY_MS } from './mic'

// createMicEngine wires a 16ms setInterval poll loop around two internal
// helpers (isVoiceFrequency's frequency-ratio math, and the RMS-based
// silence/speaking state machine). Neither is exported, so these tests drive
// the whole engine through fake AudioContext/AnalyserNode/getUserMedia
// plumbing and fake timers, and observe behavior via onSpeaking/onSilence.
//
// binHz = sampleRate / fftSize = 44100 / 2048 ≈ 21.53Hz, which places the
// voice band (85-3400Hz) at freqData indices [3, 158) and the noise band
// (4000-8000Hz) at [186, 372).
const VOICE_LOW = 3
const VOICE_HIGH = 158
const HIGH_START = 186
const HIGH_END = 372
const FREQ_BIN_COUNT = 512
const FFT_SIZE = 2048
const SAMPLE_RATE = 44100

class FakeAnalyser {
  constructor() {
    this.fftSize = FFT_SIZE
    this.smoothingTimeConstant = 0
    this.frequencyBinCount = FREQ_BIN_COUNT
    this._freq = new Float32Array(FREQ_BIN_COUNT).fill(-100)
    this._time = new Float32Array(FFT_SIZE).fill(0)
  }
  getFloatFrequencyData(arr) { arr.set(this._freq) }
  getFloatTimeDomainData(arr) { arr.set(this._time) }
}

class FakeAudioContext {
  constructor() {
    this.sampleRate = SAMPLE_RATE
    FakeAudioContext.lastInstance = this
  }
  createMediaStreamSource() { return { connect: vi.fn() } }
  createAnalyser() {
    this.analyser = new FakeAnalyser()
    return this.analyser
  }
  close() {}
}

function fakeStream() {
  return { getTracks: () => [{ stop: vi.fn() }] }
}

// A "voice" frame: strong energy in the voice band, near-silent in the noise
// band -> ratio (voiceAvg / highAvg) well above the 2.5 threshold.
function setVoiceFreq(analyser) {
  const arr = new Float32Array(FREQ_BIN_COUNT).fill(-100)
  for (let i = VOICE_LOW; i < VOICE_HIGH; i++) arr[i] = -20
  for (let i = HIGH_START; i < HIGH_END; i++) arr[i] = -100
  analyser._freq = arr
}

// A "noise" frame: equal energy in both bands -> ratio ~1, below threshold.
function setNoiseFreq(analyser) {
  const arr = new Float32Array(FREQ_BIN_COUNT).fill(-100)
  for (let i = VOICE_LOW; i < VOICE_HIGH; i++) arr[i] = -40
  for (let i = HIGH_START; i < HIGH_END; i++) arr[i] = -40
  analyser._freq = arr
}

// Loud enough that RMS clears the volume threshold, so isVoiceFrequency gets
// invoked at all (isSpeech = rms > VOLUME_THRESHOLD && isVoiceFrequency(...)).
function setLoud(analyser) {
  analyser._time = new Float32Array(FFT_SIZE).fill(0.5)
}

// Quiet enough that RMS never clears the threshold — isVoiceFrequency is
// short-circuited and not called at all.
function setQuiet(analyser) {
  analyser._time = new Float32Array(FFT_SIZE).fill(0)
}

describe('createMicEngine', () => {
  let getUserMedia
  let onSpeaking
  let onSilence
  let onError
  let engine

  beforeEach(() => {
    vi.useFakeTimers()
    getUserMedia = vi.fn().mockResolvedValue(fakeStream())
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } })
    vi.stubGlobal('AudioContext', FakeAudioContext)

    onSpeaking = vi.fn()
    onSilence = vi.fn()
    onError = vi.fn()
    engine = createMicEngine({ onSpeaking, onSilence, onError, threshold: 0.05 })
  })

  afterEach(() => {
    engine.stop()
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  describe('isVoiceFrequency state machine', () => {
    it('does not fire onSpeaking before 8 consecutive voice frames accumulate', async () => {
      await engine.start()
      const analyser = FakeAudioContext.lastInstance.analyser
      setLoud(analyser)
      setVoiceFreq(analyser)

      // Tick 7 times (16ms poll interval) — frame count climbs to 7, still
      // below VOICE_FRAMES_REQUIRED (8).
      for (let i = 0; i < 7; i++) vi.advanceTimersByTime(16)

      expect(onSpeaking).not.toHaveBeenCalled()
    })

    it('fires onSpeaking exactly once frame count reaches 8', async () => {
      await engine.start()
      const analyser = FakeAudioContext.lastInstance.analyser
      setLoud(analyser)
      setVoiceFreq(analyser)

      for (let i = 0; i < 8; i++) vi.advanceTimersByTime(16)
      expect(onSpeaking).toHaveBeenCalledTimes(1)

      // Continuing to pass voice frames must not re-fire onSpeaking — it only
      // transitions on the speaking-state edge.
      for (let i = 0; i < 5; i++) vi.advanceTimersByTime(16)
      expect(onSpeaking).toHaveBeenCalledTimes(1)
    })

    it('decays the frame count on a non-voice-frequency frame, delaying detection', async () => {
      await engine.start()
      const analyser = FakeAudioContext.lastInstance.analyser
      setLoud(analyser)
      setVoiceFreq(analyser)

      // 7 good frames (count -> 7), then one noise frame (count -> max(7-2,0) = 5).
      for (let i = 0; i < 7; i++) vi.advanceTimersByTime(16)
      setNoiseFreq(analyser)
      vi.advanceTimersByTime(16)
      expect(onSpeaking).not.toHaveBeenCalled()

      // Back to voice frames: needs 3 more to reach 8 (5 -> 6 -> 7 -> 8).
      setVoiceFreq(analyser)
      vi.advanceTimersByTime(16)
      vi.advanceTimersByTime(16)
      expect(onSpeaking).not.toHaveBeenCalled()
      vi.advanceTimersByTime(16)
      expect(onSpeaking).toHaveBeenCalledTimes(1)
    })

    it('is not invoked at all when RMS stays below the volume threshold (resets on silence)', async () => {
      await engine.start()
      const analyser = FakeAudioContext.lastInstance.analyser
      setQuiet(analyser)
      setVoiceFreq(analyser) // frequency would pass, but RMS gate blocks it

      for (let i = 0; i < 20; i++) vi.advanceTimersByTime(16)
      expect(onSpeaking).not.toHaveBeenCalled()

      // Frame count never accumulated, so even after going loud it still
      // takes the full 8 frames to trigger — proves silence reset it to 0
      // rather than leaving partial progress.
      setLoud(analyser)
      for (let i = 0; i < 7; i++) vi.advanceTimersByTime(16)
      expect(onSpeaking).not.toHaveBeenCalled()
      vi.advanceTimersByTime(16)
      expect(onSpeaking).toHaveBeenCalledTimes(1)
    })
  })

  describe('silence delay / timeout transitions', () => {
    async function reachSpeaking(analyser) {
      setLoud(analyser)
      setVoiceFreq(analyser)
      for (let i = 0; i < 8; i++) vi.advanceTimersByTime(16)
    }

    it('does not fire onSilence immediately when speech stops — waits SILENCE_DELAY_MS', async () => {
      await engine.start()
      const analyser = FakeAudioContext.lastInstance.analyser
      await reachSpeaking(analyser)
      expect(onSpeaking).toHaveBeenCalledTimes(1)

      setQuiet(analyser)
      // First quiet tick (16ms) is what starts the silence timer — the
      // SILENCE_DELAY_MS clock runs from there, not from setQuiet() itself.
      vi.advanceTimersByTime(16)
      expect(onSilence).not.toHaveBeenCalled()

      vi.advanceTimersByTime(SILENCE_DELAY_MS - 1)
      expect(onSilence).not.toHaveBeenCalled()

      vi.advanceTimersByTime(1)
      expect(onSilence).toHaveBeenCalledTimes(1)
    })

    it('cancels the pending silence timer if speech resumes before SILENCE_DELAY_MS elapses', async () => {
      await engine.start()
      const analyser = FakeAudioContext.lastInstance.analyser
      await reachSpeaking(analyser)

      setQuiet(analyser)
      vi.advanceTimersByTime(200) // well under the 400ms delay

      setLoud(analyser)
      setVoiceFreq(analyser)
      vi.advanceTimersByTime(16)

      // Advance well past where the original timer would have fired.
      vi.advanceTimersByTime(SILENCE_DELAY_MS)
      expect(onSilence).not.toHaveBeenCalled()
      // onSpeaking still only the original single edge-trigger.
      expect(onSpeaking).toHaveBeenCalledTimes(1)
    })

    it('re-fires onSpeaking after a full speaking -> silence -> speaking cycle', async () => {
      await engine.start()
      const analyser = FakeAudioContext.lastInstance.analyser
      await reachSpeaking(analyser)

      setQuiet(analyser)
      vi.advanceTimersByTime(16) // starts the silence timer
      vi.advanceTimersByTime(SILENCE_DELAY_MS)
      expect(onSilence).toHaveBeenCalledTimes(1)

      await reachSpeaking(analyser)
      expect(onSpeaking).toHaveBeenCalledTimes(2)
    })
  })

  describe('stream initialization error handling', () => {
    it('calls onError and returns false when getUserMedia rejects', async () => {
      const err = new Error('Permission denied')
      getUserMedia.mockRejectedValueOnce(err)

      const result = await engine.start()

      expect(result).toBe(false)
      expect(onError).toHaveBeenCalledWith(err)
    })

    it('retries without deviceId when getUserMedia rejects with OverconstrainedError for a specific device', async () => {
      const overconstrained = Object.assign(new Error('overconstrained'), { name: 'OverconstrainedError' })
      getUserMedia.mockRejectedValueOnce(overconstrained).mockResolvedValueOnce(fakeStream())

      const result = await engine.start('some-device-id')

      expect(result).toBe(true)
      expect(onError).not.toHaveBeenCalled()
      expect(getUserMedia).toHaveBeenCalledTimes(2)
      // Second call must have dropped the deviceId constraint.
      expect(getUserMedia.mock.calls[1][0].audio.deviceId).toBeUndefined()
    })

    it('propagates an error when AudioContext setup fails after getUserMedia succeeds', async () => {
      vi.stubGlobal('AudioContext', class {
        constructor() { throw new Error('audio context unavailable') }
      })

      await expect(engine.start()).rejects.toThrow('audio context unavailable')
    })
  })
})
