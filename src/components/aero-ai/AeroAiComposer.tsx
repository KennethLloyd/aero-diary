'use client';

import { useLayoutEffect, useRef, type FormEvent, type KeyboardEvent } from 'react';
import styles from './AeroAiClient.module.css';

export function AeroAiComposer({
  draft,
  onChange,
  onSubmit,
  onStop,
  onFocusChange,
  sending,
  disabled,
}: {
  draft: string;
  onChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onStop: () => void;
  onFocusChange: (focused: boolean) => void;
  sending: boolean;
  disabled: boolean;
}) {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    function resize() {
      if (!input) return;
      const maximum = Number.parseFloat(getComputedStyle(input).maxHeight) || 184;
      input.style.height = 'auto';
      input.style.height = `${Math.min(input.scrollHeight, maximum)}px`;
      input.style.overflowY = input.scrollHeight > maximum ? 'auto' : 'hidden';
    }
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(input);
    return () => observer.disconnect();
  }, [draft]);

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing || event.keyCode === 229)
      return;
    if (window.matchMedia('(max-width: 767px), (pointer: coarse)').matches) return;
    event.preventDefault();
    event.currentTarget.form?.requestSubmit();
  }

  return (
    <form
      onSubmit={onSubmit}
      className={styles.composerArea}
      onFocus={() => onFocusChange(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) onFocusChange(false);
      }}
    >
      <div className={styles.composer}>
        <label htmlFor="aero-ai-message" className="sr-only">
          Message Aero AI
        </label>
        <textarea
          ref={inputRef}
          id="aero-ai-message"
          value={draft}
          onChange={(event) => onChange(event.currentTarget.value)}
          onKeyDown={handleKeyDown}
          maxLength={4_000}
          rows={2}
          placeholder="Message Aero AI…"
          className={styles.textarea}
          disabled={disabled}
          aria-describedby="aero-ai-composer-hint"
        />
        <div className={styles.composerFooter}>
          <span id="aero-ai-composer-hint" className={styles.composerHint}>
            <span className={styles.desktopHint}>Enter to send · Shift + Enter for a new line</span>
            <span className={styles.mobileHint}>A little room to reflect</span>
          </span>
          <span className={styles.characterCount} aria-live="off">
            {draft.length > 3600 ? `${draft.length.toLocaleString()} / 4,000` : ''}
          </span>
          {sending ? (
            <button
              type="button"
              onClick={onStop}
              className={`aero-btn ${styles.send}`}
              aria-label="Stop reply"
            >
              <span aria-hidden="true">■</span>
            </button>
          ) : (
            <button
              type="submit"
              disabled={!draft.trim() || disabled}
              className={`aero-btn ${styles.send}`}
              aria-label="Send message"
            >
              <span aria-hidden="true">➤</span>
            </button>
          )}
        </div>
      </div>
    </form>
  );
}
