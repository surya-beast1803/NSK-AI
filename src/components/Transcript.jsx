import { useEffect, useLayoutEffect, useRef, useState } from 'react';

// Scrollable history. Follows new messages only while the reader is already
// at the bottom; otherwise it offers a jump button instead of yanking them.
export default function Transcript({ messages, interim, status, compact }) {
  const scroller = useRef(null);
  const atBottom = useRef(true);
  const [unseen, setUnseen] = useState(false);

  const scrollToEnd = (smooth) => {
    const el = scroller.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
  };

  useLayoutEffect(() => {
    if (atBottom.current) scrollToEnd(true);
    else setUnseen(true);
  }, [messages.length, interim, status]);

  useEffect(() => scrollToEnd(false), [compact]);

  const onScroll = () => {
    const el = scroller.current;
    atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
    if (atBottom.current) setUnseen(false);
  };

  return (
    <div className="transcript">
      <ol className="transcript__list" ref={scroller} onScroll={onScroll} aria-label="Conversation" aria-live="polite" aria-relevant="additions">
        {messages.map((m) => (
          <li key={m.id} className={`bubble bubble--${m.role} ${m.pending ? 'bubble--pending' : ''}`}>
            <span className="bubble__who">{m.role === 'user' ? 'You' : 'NSK AI'}</span>
            <p>{m.text}</p>
          </li>
        ))}
        {status === 'listening' && (
          <li className="bubble bubble--user bubble--pending">
            <span className="bubble__who">You</span>
            <p>{interim || 'Listening…'}</p>
          </li>
        )}
        {status === 'processing' && (
          <li className="bubble bubble--assistant bubble--typing" aria-label="NSK AI is thinking">
            <span className="bubble__who">NSK AI</span>
            <p>
              <i />
              <i />
              <i />
            </p>
          </li>
        )}
      </ol>
      {unseen && (
        <button
          type="button"
          className="transcript__jump"
          onClick={() => {
            scrollToEnd(true);
            setUnseen(false);
          }}
        >
          New messages ↓
        </button>
      )}
    </div>
  );
}
