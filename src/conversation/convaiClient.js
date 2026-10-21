// Browser side of the Convai integration. It only talks to our own server
// (/api/convai/chat), which adds the API key and character id.

export class AssistantError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

const TIMEOUT_MS = 35_000;

async function post(body) {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new AssistantError('offline', 'You appear to be offline. Check your connection and try again.');
  }
  let res;
  try {
    res = await fetch('/api/convai/chat', { method: 'POST', body, signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (err) {
    if (err.name === 'TimeoutError') throw new AssistantError('timeout', 'The AI took too long to answer. Please try again.');
    throw new AssistantError('network', 'Could not reach the server. Check your connection and try again.');
  }
  let data = null;
  try {
    data = await res.json();
  } catch {
    // fall through to the generic message below
  }
  if (!res.ok) {
    throw new AssistantError(data?.error || 'server', data?.message || 'The AI service is unavailable right now. Please try again shortly.');
  }
  return data;
}

export function askWithText(text, sessionId) {
  const form = new FormData();
  form.append('text', text);
  if (sessionId) form.append('sessionId', sessionId);
  return post(form);
}

export function askWithAudio(wavBlob, sessionId) {
  const form = new FormData();
  form.append('audio', wavBlob, 'speech.wav');
  if (sessionId) form.append('sessionId', sessionId);
  return post(form);
}

export async function askStream({ text, audio, sessionId, onSessionId, onText, onAudioChunk, signal }) {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new AssistantError('offline', 'You appear to be offline. Check your connection and try again.');
  }

  const form = new FormData();
  if (audio) form.append('audio', audio, 'speech.wav');
  else if (text) form.append('text', text);
  if (sessionId) form.append('sessionId', sessionId);
  form.append('stream', 'true');

  let res;
  try {
    res = await fetch('/api/convai/chat?stream=true', {
      method: 'POST',
      body: form,
      headers: { Accept: 'text/event-stream' },
      signal: signal || AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    if (err.name === 'TimeoutError') throw new AssistantError('timeout', 'The AI took too long to answer. Please try again.');
    throw new AssistantError('network', 'Could not reach the server. Check your connection and try again.');
  }

  if (!res.ok) {
    let data = null;
    try {
      data = await res.json();
    } catch { }
    throw new AssistantError(data?.error || 'server', data?.message || 'The AI service is unavailable right now. Please try again shortly.');
  }

  if (!res.body) {
    throw new AssistantError('stream_unsupported', 'Streaming not supported by browser.');
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let fullText = '';
  let audioChunkCount = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const blocks = buffer.split('\n\n');
      buffer = blocks.pop() || '';

      for (const block of blocks) {
        const trimmed = block.trim();
        if (!trimmed) continue;
        for (const line of trimmed.split('\n')) {
          if (line.startsWith('data:')) {
            const rawJson = line.slice(5).trim();
            if (!rawJson) continue;
            try {
              const data = JSON.parse(rawJson);
              if (data.sessionID && onSessionId) onSessionId(data.sessionID);
              if (data.text && !fullText) {
                fullText = data.text;
                if (onText) onText(data.text);
              }
              if (data.audio) {
                audioChunkCount++;
                if (onAudioChunk) onAudioChunk(data.audio);
              }
            } catch { }
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  return { fullText, audioChunkCount };
}
