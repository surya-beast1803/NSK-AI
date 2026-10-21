import { useState } from 'react';
import { noteInputFocus, noteKeystroke } from '../conversation/attention.js';

const VOICE_LABELS = {
  idle: 'Tap to speak',
  listening: 'Tap to send',
  processing: 'Thinking…',
  speaking: 'Tap to speak',
};

function MicIcon() {
  return (
    <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true">
      <path fill="currentColor" d="M12 15a3.5 3.5 0 0 0 3.5-3.5v-6a3.5 3.5 0 1 0-7 0v6A3.5 3.5 0 0 0 12 15Z" />
      <path fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" />
    </svg>
  );
}

function StopIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      <rect x="6" y="6" width="12" height="12" rx="2.5" fill="currentColor" />
    </svg>
  );
}

export function VoiceButton({ status, onToggle, showLabel }) {
  const listening = status === 'listening';
  const label = VOICE_LABELS[status];
  return (
    <div className="voice">
      <button
        type="button"
        className={`voice__btn voice__btn--${status}`}
        onClick={onToggle}
        disabled={status === 'processing'}
        aria-pressed={listening}
        aria-label={label}
      >
        <span className="voice__ring" aria-hidden="true" />
        {listening ? <StopIcon /> : <MicIcon />}
      </button>
      {showLabel && <span className="voice__label">{label}</span>}
    </div>
  );
}

export function Composer({ onSend }) {
  const [text, setText] = useState('');
  const submit = (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    onSend(text);
    setText('');
  };
  return (
    <form className="composer" onSubmit={submit}>
      <label htmlFor="message" className="sr-only">
        Type a message
      </label>
      <input
        id="message"
        type="text"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          noteKeystroke(); // the bearing watches you type
        }}
        onFocus={() => noteInputFocus(true)}
        onBlur={() => noteInputFocus(false)}
        placeholder="Ask about bearings…"
        autoComplete="off"
        enterKeyHint="send"
        maxLength={2000}
      />
      <button type="submit" className="composer__send" disabled={!text.trim()} aria-label="Send message">
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
          <path fill="currentColor" d="M3.4 20.4 21 12 3.4 3.6l-.02 6.53L15 12 3.38 13.87z" />
        </svg>
      </button>
    </form>
  );
}

export function ErrorBanner({ error, onDismiss }) {
  if (!error) return null;
  return (
    <div className="error" role="alert" key={error.id}>
      <p>{error.message}</p>
      <button type="button" onClick={onDismiss} aria-label="Dismiss">
        ×
      </button>
    </div>
  );
}

export function Suggestions({ items, onPick, disabled }) {
  return (
    <div className="suggestions" role="list">
      {items.map((q) => (
        <button key={q} type="button" role="listitem" onClick={() => onPick(q)} disabled={disabled}>
          {q}
        </button>
      ))}
    </div>
  );
}
