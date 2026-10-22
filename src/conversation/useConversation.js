import { useCallback, useEffect, useRef, useState } from 'react';
import { assistant } from '../config/appConfig.js';
import { askStream, askWithAudio, askWithText } from './convaiClient.js';
import { createStreamPlayer, playVoice, stopVoice, unlockAudio } from './audioEngine.js';
import { startVoiceCapture } from './speechInput.js';
import { startSyntheticSpeech, stopSyntheticSpeech } from './voiceSignal.js';

export const STATUS = {
  IDLE: 'idle',
  LISTENING: 'listening',
  PROCESSING: 'processing',
  SPEAKING: 'speaking',
};

const SESSION_KEY = 'nsk-ai.convai-session';
let nextId = 1;
const msg = (role, text, extra) => ({ id: nextId++, role, text, ...extra });

function readSession() {
  try {
    return sessionStorage.getItem(SESSION_KEY) || '';
  } catch {
    return '';
  }
}

function writeSession(id) {
  try {
    sessionStorage.setItem(SESSION_KEY, id);
  } catch {
    // storage unavailable (private mode); the session just won't persist
  }
}

export function useConversation() {
  const [status, setStatus] = useState(STATUS.IDLE);
  const [messages, setMessages] = useState(() => [msg('assistant', assistant.greeting)]);
  const [interim, setInterim] = useState('');
  const [error, setError] = useState(null);

  const sessionRef = useRef(readSession());
  const captureRef = useRef(null);
  const requestRef = useRef(0); // ignores replies that arrive after a newer request
  const speechTimerRef = useRef(0);

  const stopSpeaking = useCallback(() => {
    stopVoice();
    stopSyntheticSpeech();
    clearTimeout(speechTimerRef.current);
  }, []);

  const handleReply = useCallback(
    async (data, requestId, userPlaceholderId) => {
      if (requestId !== requestRef.current) return;
      if (data.sessionId) {
        sessionRef.current = data.sessionId;
        writeSession(data.sessionId);
      }
      if (userPlaceholderId && data.userText) {
        setMessages((m) => m.map((x) => (x.id === userPlaceholderId ? { ...x, text: data.userText, pending: false } : x)));
      }
      const text = (data.text || '').trim() || "Sorry, I don't have an answer for that yet.";
      setMessages((m) => [...m, msg('assistant', text)]);
      setStatus(STATUS.SPEAKING);

      if (data.audio) {
        try {
          await playVoice(data.audio);
        } catch {
          // Audio blocked or undecodable: fall back to animated speech.
          await speakSynthetic(text);
        }
      } else {
        await speakSynthetic(text);
      }
      if (requestId === requestRef.current) setStatus(STATUS.IDLE);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const speakSynthetic = (text) =>
    new Promise((resolve) => {
      const ms = Math.min(9000, Math.max(1200, text.length * 55));
      startSyntheticSpeech(ms);
      speechTimerRef.current = setTimeout(resolve, ms);
    });

  const fail = useCallback((err, requestId) => {
    if (requestId !== undefined && requestId !== requestRef.current) return;
    setError({ id: Date.now(), message: err.message || 'Something went wrong. Please try again.' });
    setStatus(STATUS.IDLE);
  }, []);

  const sendStreamingQuery = useCallback(
    async ({ text, audio }, requestId, placeholderId) => {
      let streamPlayer = null;
      let textReceived = false;
      let fullReplyText = '';
      let audioChunkCount = 0;

      // Safety watchdog: reset to IDLE if processing exceeds 20 seconds
      const watchdog = setTimeout(() => {
        if (requestId === requestRef.current) {
          console.warn('[conversation] Request timed out waiting for AI reply');
          fail(new Error('The AI took too long to answer. Please try asking again.'), requestId);
        }
      }, 20000);

      try {
        streamPlayer = createStreamPlayer();

        await askStream({
          text,
          audio,
          sessionId: sessionRef.current,
          onSessionId: (sid) => {
            sessionRef.current = sid;
            writeSession(sid);
          },
          onText: (replyText) => {
            if (requestId !== requestRef.current) return;
            clearTimeout(watchdog);
            textReceived = true;
            fullReplyText = (replyText || '').trim();
            if (placeholderId) {
              setMessages((m) => m.map((x) => (x.id === placeholderId ? { ...x, pending: false } : x)));
            }
            setMessages((m) => [...m, msg('assistant', fullReplyText || "Sorry, I don't have an answer for that yet.")]);
            setStatus(STATUS.SPEAKING);
          },
          onAudioChunk: (chunk) => {
            if (requestId !== requestRef.current) return;
            clearTimeout(watchdog);
            audioChunkCount++;
            streamPlayer.pushChunk(chunk).catch((err) => {
              console.warn('[conversation] chunk decode error:', err);
            });
          },
        });

        if (requestId !== requestRef.current) {
          clearTimeout(watchdog);
          return;
        }

        if (streamPlayer) {
          streamPlayer.end();
          if (audioChunkCount > 0) {
            await streamPlayer.waitForFinish();
          } else if (textReceived && fullReplyText) {
            await speakSynthetic(fullReplyText);
          }
        }
        clearTimeout(watchdog);
        if (requestId === requestRef.current) setStatus(STATUS.IDLE);
      } catch (streamErr) {
        clearTimeout(watchdog);
        console.warn('[conversation] streaming failed, falling back to batch mode:', streamErr?.message || streamErr);
        if (streamPlayer) streamPlayer.stop();

        // FALLBACK: Execute batch mode if streaming failed
        if (requestId !== requestRef.current) return;
        try {
          if (audio) {
            const data = await askWithAudio(audio, sessionRef.current);
            await handleReply(data, requestId, placeholderId);
          } else {
            const data = await askWithText(text, sessionRef.current);
            await handleReply(data, requestId);
          }
        } catch (batchErr) {
          fail(batchErr, requestId);
        }
      }
    },
    [fail, handleReply],
  );

  const sendText = useCallback(
    async (raw) => {
      const text = raw.trim();
      if (!text) return;
      unlockAudio();
      stopSpeaking();
      captureRef.current?.cancel();
      captureRef.current = null;
      setError(null);
      setInterim('');
      const requestId = ++requestRef.current;
      setMessages((m) => [...m, msg('user', text)]);
      setStatus(STATUS.PROCESSING);
      await sendStreamingQuery({ text }, requestId);
    },
    [sendStreamingQuery, stopSpeaking],
  );

  const sendAudio = useCallback(
    async (blob) => {
      const requestId = ++requestRef.current;
      const placeholder = msg('user', 'Voice message', { pending: true });
      setMessages((m) => [...m, placeholder]);
      setStatus(STATUS.PROCESSING);
      await sendStreamingQuery({ audio: blob }, requestId, placeholder.id);
    },
    [sendStreamingQuery],
  );

  const startListening = useCallback(() => {
    unlockAudio();
    stopSpeaking();
    setError(null);
    setInterim('');
    requestRef.current++; // drop any reply still in flight
    try {
      captureRef.current = startVoiceCapture({
        lang: assistant.speechLang,
        onInterim: setInterim,
        onFinal: (result) => {
          captureRef.current = null;
          setInterim('');
          if (result.text && result.text.trim()) {
            sendText(result.text.trim());
          } else if (result.audio) {
            sendAudio(result.audio);
          } else {
            setStatus(STATUS.IDLE);
          }
        },
        onError: (err) => {
          captureRef.current = null;
          setInterim('');
          if (err.code === 'no-speech' || err.code === 'aborted') {
            // Cleanly return to IDLE without error banner or infinite thinking loop
            setStatus(STATUS.IDLE);
          } else {
            fail(err);
          }
        },
      });
      setStatus(STATUS.LISTENING);
    } catch (err) {
      fail(err);
    }
  }, [fail, sendAudio, sendText, stopSpeaking]);

  const stopListening = useCallback(() => {
    captureRef.current?.stop();
    // If no words were spoken, immediately return to IDLE instead of stuck in PROCESSING
    if (!interim.trim()) {
      setStatus(STATUS.IDLE);
    }
  }, [interim]);

  // One button: start, stop and send, or interrupt the AI while it talks.
  const toggleVoice = useCallback(() => {
    if (status === STATUS.LISTENING) stopListening();
    else startListening();
  }, [startListening, status, stopListening]);

  const interrupt = useCallback(() => {
    requestRef.current++;
    stopSpeaking();
    setStatus(STATUS.IDLE);
  }, [stopSpeaking]);

  useEffect(
    () => () => {
      captureRef.current?.cancel();
      stopSpeaking();
    },
    [stopSpeaking],
  );

  return {
    status,
    messages,
    interim,
    error,
    dismissError: () => setError(null),
    sendText,
    toggleVoice,
    interrupt,
  };
}
