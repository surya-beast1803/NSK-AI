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
  'audio-capture': 'No microphone was found or headset mic is muted. Check your input settings or type your question instead.',
  network: 'Voice recognition needs an internet connection. Check your connection and try again.',
  'no-speech': "I didn't hear anything. Please speak closer to the mic or tap and try again.",
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
      `The browser blocks the microphone on insecure addresses. On mobile, please access via https://. On laptop, open http://localhost:${window.location.port || 80}. You can type your question meanwhile.`,
    );
  }

  const isMobile = typeof navigator !== 'undefined' && /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  let userStopped = false;
  let activeSession = null;
  let hasReceivedResults = false;

  const runRecorderFallback = (reason) => {
    if (userStopped || !support.recorder) {
      return;
    }
    console.warn('[speechInput] Falling back to audio recorder:', reason);
    onInterim?.('Listening (mic active)...');
    activeSession = startRecorder({
      onFinal: (res) => {
        hasReceivedResults = true;
        onFinal?.(res);
      },
      onError,
      onEnd,
    });
  };

  // On browsers supporting SpeechRecognition:
  if (support.recognition) {
    try {
      activeSession = startRecognition({
        lang,
        isMobile,
        onInterim: (text) => {
          hasReceivedResults = true;
          onInterim?.(text);
        },
        onFinal: (res) => {
          hasReceivedResults = true;
          onFinal?.(res);
        },
        onError: (err) => {
          // If the user intentionally stopped or cancelled, do not fallback to recorder!
          if (userStopped) {
            onError?.(err);
            return;
          }
          // If recognition failed before getting any speech on mobile or due to hardware capture issue:
          if (!hasReceivedResults && support.recorder && (err.code === 'audio-capture' || err.code === 'network' || (err.code === 'no-speech' && isMobile))) {
            runRecorderFallback(err.message);
            return;
          }
          onError?.(err);
        },
        onEnd,
      });

      return {
        stop: () => {
          userStopped = true;
          activeSession?.stop();
        },
        cancel: () => {
          userStopped = true;
          activeSession?.cancel();
        },
      };
    } catch (err) {
      if (!userStopped && support.recorder) {
        runRecorderFallback(err.message);
        return {
          stop: () => {
            userStopped = true;
            activeSession?.stop();
          },
          cancel: () => {
            userStopped = true;
            activeSession?.cancel();
          },
        };
      }
      throw err;
    }
  }

  if (support.recorder) {
    return startRecorder({ onFinal, onError, onEnd });
  }

  throw new VoiceInputError('unsupported', 'This browser does not support voice input. You can type your question instead.');
}

function startRecognition({ lang, isMobile, onInterim, onFinal, onError, onEnd }) {
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const rec = new Recognition();

  // Pick device language or configured language
  rec.lang = lang || (typeof navigator !== 'undefined' ? navigator.language : 'en-US');
  rec.interimResults = true;
  // CRITICAL MOBILE FIX: Mobile Chrome/Android strictly drops speech recognition if continuous is true!
  rec.continuous = !isMobile;
  rec.maxAlternatives = 1;

  let finalText = '';
  let interimText = '';
  let cancelled = false;
  let finalized = false;
  let silenceTimer = null;
  const SILENCE_WAIT_MS = isMobile ? 1400 : 2200; // Comfortable silence buffer

  const finish = () => {
    if (finalized || cancelled) return;
    finalized = true;
    clearTimeout(silenceTimer);
    try {
      rec.stop();
    } catch {}
    const text = (finalText || interimText).trim();
    if (text) onFinal?.({ text });
    else onError?.(new VoiceInputError('no-speech', RECOGNITION_ERRORS['no-speech']));
    onEnd?.();
  };

  const resetSilenceTimer = () => {
    clearTimeout(silenceTimer);
    silenceTimer = setTimeout(finish, SILENCE_WAIT_MS);
  };

  // ACCURACY FIX: Reconstruct full clean transcript with proper spacing from results
  rec.onresult = (event) => {
    let final = '';
    let interim = '';

    for (let i = 0; i < event.results.length; i++) {
      const res = event.results[i];
      const text = res[0]?.transcript || '';
      if (res.isFinal) {
        final += (final ? ' ' : '') + text.trim();
      } else {
        interim += (interim ? ' ' : '') + text.trim();
      }
    }

    finalText = final;
    interimText = interim;
    const current = (final + (final && interim ? ' ' : '') + interim).trim();

    if (current) {
      onInterim?.(current);
      resetSilenceTimer();
    }
  };

  rec.onerror = (event) => {
    if (cancelled || event.error === 'aborted') return;
    if (event.error === 'no-speech' && !finalText && !interimText && !isMobile) {
      return;
    }
    cancelled = true;
    clearTimeout(silenceTimer);
    onError?.(new VoiceInputError(event.error, RECOGNITION_ERRORS[event.error] || 'Voice input stopped unexpectedly. Please try again.'));
  };

  rec.onend = () => {
    if (cancelled || finalized) return;
    const text = (finalText || interimText).trim();
    if (text || isMobile) {
      finish();
    } else {
      try {
        rec.start();
      } catch {
        finish();
      }
    }
  };

  try {
    rec.start();
  } catch (err) {
    onError?.(new VoiceInputError('start-failed', err.message));
  }

  return {
    stop: () => {
      clearTimeout(silenceTimer);
      finish();
    },
    cancel: () => {
      cancelled = true;
      clearTimeout(silenceTimer);
      try {
        rec.abort();
      } catch {}
    },
  };
}

// MediaRecorder fallback: Used for mobile or headset mic where SpeechRecognition fails
function startRecorder({ onFinal, onError, onEnd }) {
  let recorder = null;
  let stream = null;
  let cancelled = false;
  let stopRequested = false;
  const chunks = [];

  const cleanup = () => stream?.getTracks().forEach((t) => t.stop());

  // HEADPHONE & LAPTOP MIC FIX: Add autoGainControl and mono channel to boost low headphone/laptop mic levels
  navigator.mediaDevices
    .getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true, // Crucial for low-volume headphone mics!
        channelCount: 1,
      },
    })
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
