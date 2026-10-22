// Plays the AI's voice through Web Audio so an AnalyserNode can drive the
// waveform from the real audio. Mobile browsers only allow audio after a user
// gesture, so call unlockAudio() from a tap/click handler.
import { BAND_COUNT, setAudioSampler } from './voiceSignal.js';

let ctx = null;
let analyser = null;
let freqData = null;
let current = null; // { source, resolve }

function ensureContext() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  analyser = ctx.createAnalyser();
  analyser.fftSize = 256;
  analyser.smoothingTimeConstant = 0.72;
  analyser.connect(ctx.destination);
  freqData = new Uint8Array(analyser.frequencyBinCount);
  return ctx;
}

export function unlockAudio() {
  const c = ensureContext();
  if (c && c.state === 'suspended') {
    c.resume().catch(() => { });
  }
}

function base64ToArrayBuffer(b64) {
  const clean = b64.includes(',') ? b64.slice(b64.indexOf(',') + 1) : b64;
  const bin = atob(clean);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

function sampleLevels(signal) {
  analyser.getByteFrequencyData(freqData);
  // Speech energy sits mostly in the lower bins; map those onto the bars,
  // mirrored from the centre outwards so the shape reads like a voice print.
  const usable = Math.floor(freqData.length * 0.55);
  const half = BAND_COUNT / 2;
  let total = 0;
  for (let i = 0; i < half; i++) {
    const start = Math.floor((i / half) ** 1.4 * usable);
    const end = Math.max(start + 1, Math.floor(((i + 1) / half) ** 1.4 * usable));
    let sum = 0;
    for (let j = start; j < end; j++) sum += freqData[j];
    const v = Math.min(1, (sum / (end - start) / 255) * 1.35);
    signal.bands[half - 1 - i] = v;
    signal.bands[half + i] = v;
    total += v;
  }
  signal.level = total / half;
}

export function createStreamPlayer() {
  stopVoice();
  const c = ensureContext();
  if (!c) throw new Error('no_audio');
  if (c.state === 'suspended') c.resume().catch(() => { });

  let nextStartTime = 0;
  const activeSources = [];
  let isEnded = false;
  let hasStarted = false;
  let isStopped = false;
  let onFinishResolve = null;
  const finishPromise = new Promise((resolve) => {
    onFinishResolve = resolve;
  });
  let endTimeout = null;
  let decodeQueue = Promise.resolve();

  function cleanup() {
    clearTimeout(endTimeout);
    isStopped = true;
    activeSources.forEach((s) => {
      try {
        s.onended = null;
        s.stop();
      } catch { }
    });
    activeSources.length = 0;
    if (current?.streamPlayer === player) {
      current = null;
      setAudioSampler(null);
    }
    onFinishResolve?.();
  }

  async function processChunk(base64Wav) {
    if (!base64Wav || isStopped) return;
    if (c.state === 'suspended') await c.resume().catch(() => { });

    let audioBuffer;
    try {
      const arrayBuffer = base64ToArrayBuffer(base64Wav);
      audioBuffer = await c.decodeAudioData(arrayBuffer);
    } catch (err) {
      console.warn('[audioEngine] chunk decode failed:', err);
      return;
    }
    if (isStopped) return;

    if (!hasStarted) {
      hasStarted = true;
      setAudioSampler(sampleLevels);
      // 180ms jitter buffer ensures chunks buffer smoothly without gaps
      nextStartTime = c.currentTime + 0.18;
    }

    const source = c.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(analyser);

    const startTime = Math.max(c.currentTime, nextStartTime);
    source.start(startTime);
    nextStartTime = startTime + audioBuffer.duration;
    activeSources.push(source);

    source.onended = () => {
      const idx = activeSources.indexOf(source);
      if (idx !== -1) activeSources.splice(idx, 1);
      if (isEnded && activeSources.length === 0) {
        cleanup();
      }
    };
  }

  function pushChunk(base64Wav) {
    // Chain sequentially into a FIFO queue so chunks ALWAYS decode and play in exact order
    decodeQueue = decodeQueue.then(() => processChunk(base64Wav)).catch(() => { });
    return decodeQueue;
  }

  function end() {
    isEnded = true;
    decodeQueue.then(() => {
      if (!hasStarted || activeSources.length === 0) {
        cleanup();
      } else {
        const waitMs = Math.max(0, (nextStartTime - c.currentTime) * 1000) + 800;
        endTimeout = setTimeout(cleanup, waitMs);
      }
    });
  }

  const player = {
    pushChunk,
    end,
    stop: cleanup,
    waitForFinish: () => finishPromise,
  };

  current = { streamPlayer: player, resolve: onFinishResolve };
  return player;
}

export async function playVoice(base64Wav) {
  stopVoice();
  const c = ensureContext();
  if (!c) throw new Error('no_audio');
  if (c.state === 'suspended') await c.resume().catch(() => { });
  if (c.state !== 'running') throw new Error('audio_locked'); // caller falls back to animated speech
  const buffer = await c.decodeAudioData(base64ToArrayBuffer(base64Wav));
  return new Promise((resolve) => {
    // Safety net in case the browser never fires `ended`.
    const guard = setTimeout(() => current?.source === source && finish(), (buffer.duration + 1.5) * 1000);
    const source = c.createBufferSource();
    source.buffer = buffer;
    source.connect(analyser);
    current = { source, resolve };
    source.onended = () => {
      clearTimeout(guard);
      if (current?.source === source) finish();
    };
    setAudioSampler(sampleLevels);
    source.start();
  });
}

function finish() {
  const done = current;
  current = null;
  setAudioSampler(null);
  done?.resolve();
}

export function stopVoice() {
  if (!current) return;
  if (current.streamPlayer) {
    current.streamPlayer.stop();
  } else if (current.source) {
    try {
      current.source.onended = null;
      current.source.stop();
    } catch {
      // already stopped
    }
  }
  finish();
}
