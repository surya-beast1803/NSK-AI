// Shared, non-React signal the waveform reads every frame. Writing to it
// never triggers a React render, which keeps the animation cheap on phones.
// It is pull-based: the renderer calls updateVoiceSignal() once per frame, so
// there is no second animation loop competing with the 3D scene.

export const BAND_COUNT = 32;

export const voiceSignal = {
  bands: new Float32Array(BAND_COUNT), // 0..1 per waveform bar
  level: 0, // overall loudness 0..1
  source: 'none', // 'audio' | 'synthetic' | 'none'
};

let audioSampler = null;
let synthUntil = 0;

// Registered by the audio engine while real audio plays.
export function setAudioSampler(fn) {
  audioSampler = fn;
  voiceSignal.source = fn ? 'audio' : synthUntil > performance.now() ? 'synthetic' : 'none';
  if (!fn) clearBands();
}

// Speech-like motion for when the AI answers without an audio track.
export function startSyntheticSpeech(durationMs) {
  synthUntil = performance.now() + durationMs;
  if (!audioSampler) voiceSignal.source = 'synthetic';
}

export function stopSyntheticSpeech() {
  synthUntil = 0;
  if (voiceSignal.source === 'synthetic') {
    voiceSignal.source = 'none';
    clearBands();
  }
}

export function updateVoiceSignal(t = performance.now()) {
  if (audioSampler) {
    audioSampler(voiceSignal);
    return;
  }
  if (voiceSignal.source !== 'synthetic') return;
  if (t > synthUntil) {
    stopSyntheticSpeech();
    return;
  }
  // Syllable-rate envelope (~4-6 Hz) with a slower phrase swell.
  const syllable = Math.max(0, Math.sin(t * 0.028) * 0.6 + Math.sin(t * 0.017 + 1.3) * 0.4);
  const phrase = 0.55 + 0.45 * Math.sin(t * 0.0021);
  const env = syllable * phrase;
  voiceSignal.level = env;
  for (let i = 0; i < BAND_COUNT; i++) {
    const centre = 1 - Math.abs(i / (BAND_COUNT - 1) - 0.5) * 1.6;
    const jitter = 0.65 + 0.35 * Math.sin(t * 0.04 + i * 2.1);
    voiceSignal.bands[i] = Math.max(0, env * centre * jitter);
  }
}

function clearBands() {
  voiceSignal.bands.fill(0);
  voiceSignal.level = 0;
}
