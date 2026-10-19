'use client';

import { useId, useState } from 'react';
import styles from './AeroAiClient.module.css';

export type ChatThread = {
  id: string;
  title: string;
  updatedAt: string;
  isGenerating: boolean;
};

export function AeroAiHistory({
  threads,
  selectedId,
  loading,
  disabled,
  onSelect,
  onNew,
}: {
  threads: ChatThread[];
  selectedId: string | null;
  loading: boolean;
  disabled: boolean;
  onSelect: (id: string) => void;
  onNew: () => void;
}) {
  const [query, setQuery] = useState('');
  const searchId = useId();

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const groups = new Map<string, ChatThread[]>();

  for (const thread of threads) {
    if (!thread.title.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())) continue;

    const date = new Date(thread.updatedAt);
    const label = date >= today ? 'Today' : date >= yesterday ? 'Yesterday' : 'Earlier';
    groups.set(label, [...(groups.get(label) ?? []), thread]);
  }

  return (
    <>
      <div className={styles.historyHeading}>
        <h2>Chats</h2>
        <button
          type="button"
          className={`aero-btn ${styles.newChat}`}
          onClick={onNew}
          disabled={disabled}
          aria-label="New chat"
        >
          + New chat
        </button>
      </div>
      <label className="sr-only" htmlFor={searchId}>
        Search conversations
      </label>
      <input
        id={searchId}
        type="search"
        className={`aero-input ${styles.search}`}
        placeholder="Search conversations…"
        value={query}
        onChange={(event) => setQuery(event.currentTarget.value)}
      />
      <div className={styles.historyList}>
        {loading ? (
          <p className={styles.quiet} role="status">
            Loading chats…
          </p>
        ) : null}
        {!loading && !threads.length ? (
          <p className={styles.quiet}>
            Your conversations will appear here after your first message.
          </p>
        ) : null}
        {!loading && threads.length > 0 && !groups.size ? (
          <p className={styles.quiet}>No conversations match your search.</p>
        ) : null}
        {[...groups].map(([label, items]) => (
          <section key={label} className={styles.historyGroup} aria-label={label}>
            <h3>{label}</h3>
            {items.map((thread) => (
              <button
                key={thread.id}
                type="button"
                className={`${styles.thread} ${thread.id === selectedId ? styles.selected : ''}`}
                aria-label={thread.title}
                aria-current={thread.id === selectedId ? 'true' : undefined}
                disabled={disabled}
                onClick={() => onSelect(thread.id)}
                title={thread.title}
              >
                <span className={styles.threadTitle}>{thread.title}</span>
                <span className={styles.threadMeta}>
                  {thread.isGenerating
                    ? 'Reply in progress…'
                    : new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(
                        new Date(thread.updatedAt),
                      )}
                </span>
              </button>
            ))}
          </section>
        ))}
      </div>
    </>
  );
}
