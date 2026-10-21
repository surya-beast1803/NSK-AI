// Voice capture. Prefers the browser's speech recognition (fast, shows live
// text). Where that is missing, records the microphone and sends a WAV clip
// for Convai to transcribe on the server.

export class VoiceInputError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

const RECOGNITION_ERRORS = {
  'not-allowed': 'Microphone access is blocked. Click the icon at the left of the address bar, allow the microphone, then try again. You can type your question meanwhile.',
  'service-not-allowed': 'Voice input is turned off in this browser. You can type your question instead.',
  'audio-capture': 'No microphone was found. Check that one is connected, or type your question instead.',
  network: 'Voice recognition needs an internet connection. Check your connection and try again.',
  'no-speech': "I didn't hear anything. Tap the microphone and try again.",
};

export function voiceSupport() {
  const Recognition = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition);
  const canRecord = typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined';
  return {
    recognition: !!Recognition,
    recorder: canRecord,
    secure: typeof window === 'undefined' || window.isSecureContext,
  };
}

/**
 * Starts a capture session. Returns { stop(), cancel() }.
 * Callbacks: onInterim(text), onFinal({ text } | { audio: Blob }), onError(VoiceInputError), onEnd()
 */
export function startVoiceCapture({ lang, onInterim, onFinal, onError, onEnd }) {
  const support = voiceSupport();
  if (!support.secure) {
    throw new VoiceInputError(
      'insecure',
      `The browser blocks the microphone on this address. On this computer, open http://localhost:${window.location.port || 80} instead. On a phone, use an https address. You can type your question meanwhile.`,
    );
  }
  if (support.recognition) return startRecognition({ lang, onInterim, onFinal, onError, onEnd });
  if (support.recorder) return startRecorder({ onFinal, onError, onEnd });
  throw new VoiceInputError('unsupported', 'This browser does not support voice input. You can type your question instead.');
}

function startRecognition({ lang, onInterim, onFinal, onError, onEnd }) {
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const rec = new Recognition();
  rec.lang = lang;
  rec.interimResults = true;
  rec.continuous = false;
  rec.maxAlternatives = 1;

  let finalText = '';
  let interimText = '';
  let cancelled = false;

  rec.onresult = (event) => {
    interimText = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const r = event.results[i];
      if (r.isFinal) finalText += r[0].transcript;
      else interimText += r[0].transcript;
    }
    onInterim?.((finalText + interimText).trim());
  };
  rec.onerror = (event) => {
    if (cancelled || event.error === 'aborted') return;
    cancelled = true;
    onError?.(new VoiceInputError(event.error, RECOGNITION_ERRORS[event.error] || 'Voice input stopped unexpectedly. Please try again.'));
  };
  rec.onend = () => {
    if (!cancelled) {
      // Some mobile browsers end without marking the last chunk final.
      const text = (finalText || interimText).trim();
      if (text) onFinal?.({ text });
      else onError?.(new VoiceInputError('no-speech', RECOGNITION_ERRORS['no-speech']));
    }
    onEnd?.();
  };
  rec.start();

  return {
    stop: () => rec.stop(),
    cancel: () => {
      cancelled = true;
      rec.abort();
    },
  };
}

function startRecorder({ onFinal, onError, onEnd }) {
  let recorder = null;
  let stream = null;
  let cancelled = false;
  let stopRequested = false;
  const chunks = [];

  const cleanup = () => stream?.getTracks().forEach((t) => t.stop());

  navigator.mediaDevices
    .getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } })
    .then((s) => {
      stream = s;
      if (cancelled) return cleanup();
      recorder = new MediaRecorder(stream);
      recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      recorder.onstop = async () => {
        cleanup();
        if (cancelled) return onEnd?.();
        try {
          const wav = await blobToWav(new Blob(chunks, { type: recorder.mimeType }));
          onFinal?.({ audio: wav });
        } catch {
          onError?.(new VoiceInputError('encode', 'Your recording could not be processed. Please try again.'));
        }
        onEnd?.();
      };
      recorder.start();
      if (stopRequested) recorder.stop();
    })
    .catch((err) => {
      const denied = err?.name === 'NotAllowedError' || err?.name === 'SecurityError';
      onError?.(new VoiceInputError(denied ? 'not-allowed' : 'audio-capture', RECOGNITION_ERRORS[denied ? 'not-allowed' : 'audio-capture']));
      onEnd?.();
    });

  return {
    stop: () => {
      stopRequested = true;
      if (recorder?.state === 'recording') recorder.stop();
    },
    cancel: () => {
      cancelled = true;
      if (recorder?.state === 'recording') recorder.stop();
      else cleanup();
    },
  };
}

// Convai's REST endpoint expects WAV, while MediaRecorder gives WebM/MP4.
async function blobToWav(blob) {
  const AC = window.AudioContext || window.webkitAudioContext;
  const ctx = new AC();
  try {
    const decoded = await ctx.decodeAudioData(await blob.arrayBuffer());
    const targetRate = 16000;
    const offline = new OfflineAudioContext(1, Math.ceil(decoded.duration * targetRate), targetRate);
    const src = offline.createBufferSource();
    src.buffer = decoded;
    src.connect(offline.destination);
    src.start();
    const pcm = (await offline.startRendering()).getChannelData(0);
    return new Blob([encodeWav(pcm, targetRate)], { type: 'audio/wav' });
  } finally {
    ctx.close();
  }
}

function encodeWav(samples, rate) {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const write = (o, s) => [...s].forEach((c, i) => view.setUint8(o + i, c.charCodeAt(0)));
  write(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  write(8, 'WAVE');
  write(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  write(36, 'data');
  view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return buffer;
}
