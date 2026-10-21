import dns from 'node:dns';

// Force fast IPv4 resolution to prevent IPv6 NAT64 connection delays
try {
  dns.setDefaultResultOrder('ipv4first');
} catch {
  // Ignore in environments where not supported
}

// Server-side Convai proxy. The browser talks to /api/convai/*; only this
// file ever sees CONVAI_API_KEY. Used by both the Vite dev server and the
// production server (server/index.js).

const DEFAULT_API_URL = 'https://api.convai.com/character/getResponse';
const MAX_BODY_BYTES = 8 * 1024 * 1024; // voice clips are short
const RATE_LIMIT = { windowMs: 60_000, max: 30 };
const UPSTREAM_TIMEOUT_MS = 30_000;

const hits = new Map();

function rateLimited(ip) {
  const now = Date.now();
  const entry = hits.get(ip);
  if (!entry || now - entry.start > RATE_LIMIT.windowMs) {
    hits.set(ip, { start: now, count: 1 });
    return false;
  }
  entry.count += 1;
  return entry.count > RATE_LIMIT.max;
}

function sendJson(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(Object.assign(new Error('Request too large'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function parseRequest(req) {
  const contentType = req.headers['content-type'] || '';
  const raw = await readBody(req);
  if (contentType.includes('application/json')) {
    const json = JSON.parse(raw.toString('utf8') || '{}');
    return { text: json.text, sessionId: json.sessionId, stream: json.stream, audio: null };
  }
  if (contentType.includes('multipart/form-data')) {
    const form = await new Request('http://local/', {
      method: 'POST',
      headers: { 'content-type': contentType },
      body: raw,
    }).formData();
    return {
      text: form.get('text'),
      sessionId: form.get('sessionId'),
      stream: form.get('stream'),
      audio: form.get('audio'),
    };
  }
  throw Object.assign(new Error('Unsupported content type'), { status: 415 });
}

export function createConvaiHandler(env) {
  const apiKey = env.CONVAI_API_KEY;
  const characterId = env.CONVAI_CHARACTER_ID;
  const apiUrl = env.CONVAI_API_URL || DEFAULT_API_URL;

  return async function handle(req, res, next) {
    const url = (req.url || '').split('?')[0];
    if (!url.startsWith('/api/convai')) return next ? next() : sendJson(res, 404, { error: 'not_found' });

    if (url === '/api/convai/health' && req.method === 'GET') {
      return sendJson(res, 200, { configured: Boolean(apiKey && characterId) });
    }

    if (url !== '/api/convai/chat' || req.method !== 'POST') {
      return sendJson(res, 404, { error: 'not_found' });
    }

    if (!apiKey || !characterId) {
      return sendJson(res, 503, { error: 'not_configured', message: 'The AI service is not configured on the server.' });
    }

    const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress || 'unknown';
    if (rateLimited(ip)) {
      return sendJson(res, 429, { error: 'rate_limited', message: 'Too many messages at once. Please wait a moment.' });
    }

    let input;
    try {
      input = await parseRequest(req);
    } catch (err) {
      return sendJson(res, err.status || 400, { error: 'bad_request', message: 'The message could not be read.' });
    }

    const text = typeof input.text === 'string' ? input.text.trim().slice(0, 2000) : '';
    const hasAudio = input.audio && typeof input.audio === 'object' && input.audio.size > 0;
    if (!text && !hasAudio) {
      return sendJson(res, 400, { error: 'empty', message: 'Say or type something first.' });
    }

    const isStream =
      Boolean((req.url || '').includes('stream=true')) ||
      Boolean(req.headers.accept?.includes('text/event-stream')) ||
      input.stream === 'true' ||
      input.stream === true;

    const form = new FormData();
    form.append('charID', characterId);
    form.append('sessionID', typeof input.sessionId === 'string' && input.sessionId ? input.sessionId : '-1');
    form.append('voiceResponse', 'True');
    if (isStream) form.append('stream', 'True');
    if (hasAudio) form.append('file', input.audio, 'speech.wav');
    else form.append('userText', text);

    let upstream;
    try {
      upstream = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'CONVAI-API-KEY': apiKey },
        body: form,
        signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      });
    } catch (err) {
      const timeout = err.name === 'TimeoutError';
      return sendJson(res, 504, {
        error: timeout ? 'timeout' : 'upstream_unreachable',
        message: timeout ? 'The AI took too long to answer. Please try again.' : 'The AI service could not be reached.',
      });
    }

    if (isStream && upstream.ok) {
      res.statusCode = 200;
      res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      const reader = upstream.body.getReader();
      req.on('close', () => {
        reader.cancel().catch(() => {});
      });
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          res.write(value);
        }
      } catch (err) {
        console.warn('[convai stream proxy]', err?.message || err);
      } finally {
        res.end();
      }
      return;
    }

    if (!upstream.ok) {
      const status = upstream.status;
      console.warn(`[convai] upstream ${status}`);
      const auth = status === 401 || status === 403;
      return sendJson(res, 502, {
        error: auth ? 'upstream_auth' : 'upstream_error',
        message: auth ? 'The AI service rejected the server credentials.' : 'The AI service is unavailable right now.',
      });
    }

    let data;
    try {
      data = await upstream.json();
    } catch {
      return sendJson(res, 502, { error: 'upstream_error', message: 'The AI service sent an unexpected reply.' });
    }

    return sendJson(res, 200, {
      text: data.text ?? data.response ?? '',
      userText: data.UserQuery ?? data.userQuery ?? (hasAudio ? '' : text),
      sessionId: data.sessionID ?? null,
      audio: data.audio || null,
      sampleRate: Number(data.sample_rate) || null,
    });
  };
}
