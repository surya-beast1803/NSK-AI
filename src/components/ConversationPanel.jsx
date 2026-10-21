import { forwardRef, useState } from 'react';
import { assistant } from '../config/appConfig.js';
import StatusBadge from './StatusBadge.jsx';
import Transcript from './Transcript.jsx';
import { Composer, ErrorBanner, Suggestions, VoiceButton } from './Controls.jsx';

// Desktop: a fixed panel on the right. Mobile: a bottom sheet whose
// transcript collapses so the bearing stays visible; controls stay within
// thumb reach either way.
const ConversationPanel = forwardRef(function ConversationPanel({ convo, desktop }, ref) {
  const [expanded, setExpanded] = useState(false);
  const { status, messages, interim, error } = convo;
  const fresh = messages.length <= 1;

  if (desktop) {
    return (
      <aside className="panel" ref={ref} aria-label="Conversation with NSK AI">
        <header className="panel__head">
          <h2>Conversation</h2>
          <StatusBadge status={status} onStop={convo.interrupt} />
        </header>
        <Transcript messages={messages} interim={interim} status={status} />
        {fresh && <Suggestions items={assistant.suggestions} onPick={convo.sendText} />}
        <ErrorBanner error={error} onDismiss={convo.dismissError} />
        <div className="panel__controls">
          <VoiceButton status={status} onToggle={convo.toggleVoice} showLabel />
          <Composer onSend={convo.sendText} />
        </div>
      </aside>
    );
  }

  const last = [...messages].reverse().find((m) => m.role === 'assistant');
  return (
    <section className={`sheet ${expanded ? 'sheet--open' : ''}`} ref={ref} aria-label="Conversation with NSK AI">
      <button
        type="button"
        className="sheet__handle"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        aria-controls="sheet-transcript"
      >
        <span className="sheet__grip" aria-hidden="true" />
        <span className="sheet__title">
          {expanded ? 'Hide conversation' : `Show conversation${messages.length > 1 ? ` (${messages.length})` : ''}`}
        </span>
      </button>

      <div id="sheet-transcript" className="sheet__body">
        {expanded ? (
          <Transcript messages={messages} interim={interim} status={status} compact={!expanded} />
        ) : (
          <p className="sheet__preview" aria-live="polite">
            {status === 'listening' ? interim || 'Listening…' : status === 'processing' ? 'Thinking…' : last?.text}
          </p>
        )}
      </div>

      {fresh && !expanded && <Suggestions items={assistant.suggestions} onPick={convo.sendText} />}
      <ErrorBanner error={error} onDismiss={convo.dismissError} />
      <div className="sheet__controls">
        <Composer onSend={convo.sendText} />
        <VoiceButton status={status} onToggle={convo.toggleVoice} />
      </div>
    </section>
  );
});

export default ConversationPanel;
