const LABELS = {
  idle: 'Ready',
  listening: 'Listening',
  processing: 'Thinking',
  speaking: 'Speaking',
};

export default function StatusBadge({ status, onStop }) {
  return (
    <div className={`status status--${status}`}>
      <span className="status__dot" aria-hidden="true" />
      <span aria-live="polite">{LABELS[status]}</span>
      {status === 'speaking' && onStop && (
        <button type="button" className="status__stop" onClick={onStop} aria-label="Stop the assistant speaking">
          Stop
        </button>
      )}
    </div>
  );
}
