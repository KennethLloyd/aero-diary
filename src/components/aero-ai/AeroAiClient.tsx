'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type FormEvent } from 'react';
import { AeroTitle } from '@/components/aero/AeroTitle';
import { AeroDialog } from '@/components/aero/AeroDialog';
import { useRouter } from 'next/navigation';
import { AeroAiComposer } from './AeroAiComposer';
import { AeroAiHistory, type ChatThread } from './AeroAiHistory';
import { AssistantMessage } from './AssistantMessage';
import styles from './AeroAiClient.module.css';

type Thread = ChatThread;

type Turn = {
  id: string;
  clientRequestId: string;
  sequence: number;
  userContent: string;
  assistantContent: string | null;
  status: 'GENERATING' | 'COMPLETE' | 'FAILED';
  errorMessage?: string;
};

type ThreadDetail = Thread & { turns: Turn[] };
type StreamEvent = {
  error?: string;
  content?: string;
  turnId?: string;
  title?: string;
  assistantContent?: string;
  replayed?: boolean;
};
type ActiveRequest = { controller: AbortController; threadId: string | null; requestId: string };

export function AeroAiClient({ initialThreadId }: { initialThreadId?: string }) {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState('');
  const [loadingThreads, setLoadingThreads] = useState(true);
  const [loadingThread, setLoadingThread] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [showJump, setShowJump] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const pageRef = useRef<HTMLElement>(null);
  const messagesRef = useRef<HTMLDivElement>(null);
  const followLatest = useRef(true);
  const drawerRef = useRef<HTMLDialogElement>(null);
  const cancelDeleteRef = useRef<HTMLButtonElement>(null);
  const activeRequest = useRef<ActiveRequest | null>(null);
  const threadIdRef = useRef<string | null>(null);
  const blankChatRequested = useRef(false);
  const router = useRouter();

  const loadThreads = useCallback(async () => {
    const data = await requestJson<Thread[]>('/api/aero-ai/threads');
    setThreads(data);
    return data;
  }, []);

  const openThread = useCallback(async (id: string) => {
    followLatest.current = true;
    setShowJump(false);
    threadIdRef.current = id;
    setThreadId(id);
    setTurns([]);
    setError('');
    setLoadingThread(true);
    window.history.replaceState(null, '', `/aero-ai?thread=${encodeURIComponent(id)}`);
    try {
      const thread = await requestJson<ThreadDetail>(`/api/aero-ai/threads/${encodeURIComponent(id)}`);
      if (threadIdRef.current === id) setTurns(thread.turns);
      setThreads((current) => current.map((item) => (item.id === id ? thread : item)));
    } catch (cause) {
      if (threadIdRef.current === id) setError(errorMessage(cause));
    } finally {
      if (threadIdRef.current === id) setLoadingThread(false);
    }
  }, []);

  useEffect(() => {
    let current = true;
    // Load the selected thread list after mount; this is client data synchronization.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadThreads()
      .then((items) => {
        if (!current) return;
        const selected = items.find((thread) => thread.id === initialThreadId) ?? items[0];
        if (selected && !blankChatRequested.current) void openThread(selected.id);
      })
      .catch((cause) => {
        if (current) setError(errorMessage(cause));
      })
      .finally(() => {
        if (current) setLoadingThreads(false);
      });
    return () => {
      current = false;
    };
  }, [initialThreadId, loadThreads, openThread]);

  useLayoutEffect(() => {
    const messages = messagesRef.current;
    if (messages && followLatest.current) messages.scrollTop = messages.scrollHeight;
  }, [turns, loadingThread]);

  useEffect(() => {
    const viewport = window.visualViewport;
    const mobile = window.matchMedia('(max-width: 767px)');
    function resize() {
      pageRef.current?.style.setProperty(
        '--chat-viewport-height',
        `${viewport?.height ?? window.innerHeight}px`,
      );
      pageRef.current?.style.setProperty('--chat-viewport-top', `${viewport?.offsetTop ?? 0}px`);
      if (!mobile.matches) {
        drawerRef.current?.close();
      }
    }
    resize();
    viewport?.addEventListener('resize', resize);
    viewport?.addEventListener('scroll', resize);
    window.addEventListener('resize', resize);
    return () => {
      viewport?.removeEventListener('resize', resize);
      viewport?.removeEventListener('scroll', resize);
      window.removeEventListener('resize', resize);
      activeRequest.current?.controller.abort();
    };
  }, []);

  useEffect(() => {
    const messages = messagesRef.current;
    if (!messages) return;
    const observer = new ResizeObserver(() => {
      if (followLatest.current) messages.scrollTop = messages.scrollHeight;
    });
    observer.observe(messages);
    return () => observer.disconnect();
  }, []);

  function jumpToLatest() {
    followLatest.current = true;
    setShowJump(false);
    const messages = messagesRef.current;
    if (messages) messages.scrollTop = messages.scrollHeight;
  }

  const newChat = () => {
    if (activeRequest.current) return;
    drawerRef.current?.close();
    followLatest.current = true;
    setShowJump(false);
    blankChatRequested.current = true;
    threadIdRef.current = null;
    setThreadId(null);
    setTurns([]);
    setDraft('');
    setError('');
    setLoadingThread(false);
    window.history.replaceState(null, '', '/aero-ai');
  };

  const deleteThread = async (id: string) => {
    if (activeRequest.current || deleting) return;
    setDeleting(true);
    setError('');
    try {
      await requestJson<{ deleted: true }>(`/api/aero-ai/threads/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      setDeleteOpen(false);
      const remaining = threads.filter((item) => item.id !== id);
      setThreads(remaining);
      if (threadIdRef.current === id) {
        threadIdRef.current = null;
        setThreadId(null);
        setTurns([]);
        setDraft('');
        window.history.replaceState(null, '', '/aero-ai');
        const next = remaining[0];
        if (next) await openThread(next.id);
      }
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setDeleting(false);
    }
  };

  const sendMessage = async (content: string, requestId = crypto.randomUUID()) => {
    if (activeRequest.current) return;
    blankChatRequested.current = true;
    let activeId = threadIdRef.current;
    const controller = new AbortController();
    activeRequest.current = { controller, threadId: activeId, requestId };
    jumpToLatest();
    setSending(true);
    setError('');
    setDraft('');
    setThreads((current) =>
      current.map((item) => (item.id === activeId ? { ...item, isGenerating: true } : item)),
    );
    setTurns((current) => {
      const existing = current.find((turn) => turn.clientRequestId === requestId);
      if (existing) {
        return current.map((turn) =>
          turn.clientRequestId === requestId
            ? { ...turn, assistantContent: null, status: 'GENERATING', errorMessage: undefined }
            : turn,
        );
      }
      return [
        ...current,
        {
          id: `pending-${requestId}`,
          clientRequestId: requestId,
          sequence: current.length + 1,
          userContent: content,
          assistantContent: '',
          status: 'GENERATING',
        },
      ];
    });

    try {
      if (!activeId) {
        const created = await requestJson<Thread>('/api/aero-ai/threads', { method: 'POST' });
        activeId = created.id;
        activeRequest.current.threadId = activeId;
        threadIdRef.current = activeId;
        setThreadId(activeId);
        setThreads((current) => [
          { ...created, isGenerating: true },
          ...current.filter((item) => item.id !== activeId),
        ]);
        window.history.replaceState(null, '', `/aero-ai?thread=${encodeURIComponent(activeId)}`);
        if (controller.signal.aborted) throw new Error('Reply stopped. You can retry it.');
      }
      const response = await fetch(`/api/aero-ai/threads/${encodeURIComponent(activeId)}/messages`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'text/event-stream' },
        body: JSON.stringify({ content, requestId, stream: true }),
        signal: controller.signal,
        cache: 'no-store',
      });
      if (!response.ok) throw new Error(await responseError(response));
      if (!response.body) throw new Error('Aero AI could not start that reply. Please try again.');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let completed = false;
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split(/\r?\n\r?\n/);
        buffer = events.pop() ?? '';
        for (const event of events) {
          const name = event.match(/^event:\s*([^\r\n]+)/m)?.[1]?.trim();
          const dataText = event
            .split(/\r?\n/)
            .filter((line) => line.startsWith('data:'))
            .map((line) => line.slice(5).trimStart())
            .join('\n');
          if (!name || !dataText) continue;
          const data = JSON.parse(dataText) as StreamEvent;
          if (name === 'delta' && data.content) {
            setTurns((current) =>
              current.map((turn) =>
                turn.clientRequestId === requestId
                  ? { ...turn, assistantContent: `${turn.assistantContent ?? ''}${data.content}` }
                  : turn,
              ),
            );
          } else if (name === 'error') {
            throw new Error(data.error ?? 'Aero AI could not finish that reply. Please try again.');
          } else if (name === 'done') {
            completed = true;
            setTurns((current) =>
              current.map((turn) =>
                turn.clientRequestId === requestId
                  ? {
                      ...turn,
                      id: data.turnId ?? turn.id,
                      assistantContent: data.assistantContent ?? turn.assistantContent,
                      status: 'COMPLETE',
                      errorMessage: undefined,
                    }
                  : turn,
              ),
            );
            setThreads((current) =>
              current
                .map((item) =>
                  item.id === activeId
                    ? {
                        ...item,
                        title: data.title || item.title,
                        isGenerating: false,
                        updatedAt: new Date().toISOString(),
                      }
                    : item,
                )
                .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
            );
          }
        }
      }
      if (!completed) throw new Error('The reply was interrupted. Retry to continue.');
    } catch (cause) {
      const message = controller.signal.aborted ? 'Reply stopped. You can retry it.' : errorMessage(cause);
      setTurns((current) =>
        current.map((turn) =>
          turn.clientRequestId === requestId
            ? { ...turn, assistantContent: null, status: 'FAILED', errorMessage: message }
            : turn,
        ),
      );
      setThreads((current) =>
        current.map((item) => (item.id === activeId ? { ...item, isGenerating: false } : item)),
      );
    } finally {
      if (activeRequest.current?.requestId === requestId) activeRequest.current = null;
      setSending(false);
      void loadThreads().catch(() => {});
    }
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const content = draft.trim();
    if (!content || sending || loadingThread || loadingThreads || selectedThread?.isGenerating) return;
    void sendMessage(content);
  };

  const selectThread = (id: string) => {
    if (!activeRequest.current && !deleting && id) {
      drawerRef.current?.close();
      if (id !== threadIdRef.current || selectedThread?.isGenerating) void openThread(id);
    }
  };

  const selectedThread = threads.find((item) => item.id === threadId);
  const isBusy = sending || Boolean(selectedThread?.isGenerating);

  const history = (
    <AeroAiHistory
      threads={threads}
      selectedId={threadId}
      loading={loadingThreads}
      disabled={sending || deleting}
      onSelect={selectThread}
      onNew={newChat}
    />
  );

  return (
    <main ref={pageRef} className={styles.page}>
      <header className={styles.pageHeader}>
        <button
          type="button"
          className={`aero-btn aero-btn-white ${styles.backButton}`}
          aria-label="Back to previous page"
          onClick={() => {
            blankChatRequested.current = true;
            threadIdRef.current = null;
            const canGoBack =
              window.navigation?.canGoBack ??
              Boolean(document.referrer && new URL(document.referrer).origin === window.location.origin);
            if (canGoBack) router.back();
            else router.replace('/timeline');
          }}
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            focusable="false"
          >
            <path d="m14 6-6 6 6 6" />
          </svg>
        </button>
        <AeroTitle className={styles.title}>Aero AI</AeroTitle>
        <span className={styles.tagline}>Ask questions about your journal and get answers based on what you’ve written.</span>
        <button
          type="button"
          className={`aero-btn aero-btn-white ${styles.historyToggle}`}
          aria-label="Open chat history"
          aria-haspopup="dialog"
          onClick={() => drawerRef.current?.showModal()}
        >
          ☰
        </button>
        <button
          type="button"
          className={`aero-btn ${styles.mobileNew}`}
          onClick={newChat}
          disabled={sending || deleting}
          aria-label="New chat"
        >
          +
        </button>
      </header>

      <div className={styles.workspace}>
        <aside className={`aero-card ${styles.history}`} aria-label="Saved chats">
          {history}
        </aside>
        <section className={`aero-card ${styles.conversation}`} aria-label="Conversation">
          <header className={styles.conversationHeader}>
            <span className={`aero-ai-avatar ${styles.orb}`} aria-hidden="true" />
            <div className={styles.conversationHeading}>
              <h2 title={selectedThread?.title}>{selectedThread?.title ?? 'New chat'}</h2>
              <p>
                {sending
                  ? 'Replying…'
                  : selectedThread
                    ? `${turns.length} ${turns.length === 1 ? 'message' : 'messages'} from you · Saved chat`
                    : 'Your journal, your conversation'}
              </p>
            </div>
            {threadId ? (
              <button
                type="button"
                className={`aero-btn aero-btn-white ${styles.options}`}
                aria-label="Delete chat"
                aria-haspopup="dialog"
                title="Delete chat"
                disabled={sending || deleting}
                onClick={() => {
                  setError('');
                  setDeleteOpen(true);
                }}
              >
                <svg
                  width="19"
                  height="19"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                  focusable="false"
                >
                  <path d="M3 6h18M9 6V4h6v2M5 6l1 14h12l1-14M10 10v6M14 10v6" />
                </svg>
              </button>
            ) : null}
          </header>

          <div className={styles.messageRegion}>
            <div
              ref={messagesRef}
              className={styles.messages}
              role="region"
              aria-label="Messages"
              tabIndex={0}
              onScroll={(event) => {
                const node = event.currentTarget;
                const away = node.scrollHeight - node.scrollTop - node.clientHeight > 80;
                followLatest.current = !away;
                setShowJump(away);
              }}
            >
              <div className={styles.messageColumn}>
                {loadingThreads || loadingThread ? (
                  <p className={styles.loading} role="status">
                    {loadingThread ? 'Opening conversation…' : 'Loading your chats…'}
                  </p>
                ) : null}
                {!loadingThread && !loadingThreads && !turns.length ? (
                  <div className={styles.welcome}>
                    <span className={`aero-ai-avatar ${styles.welcomeOrb}`} aria-hidden="true" />
                    <h3>What’s on your mind?</h3>
                    <p>
                      Revisit a memory, find a journal entry,
                      <br />
                      or simply take a moment to reflect.
                    </p>
                  </div>
                ) : null}
                {turns.map((turn) => (
                  <article
                    key={turn.clientRequestId}
                    className={styles.turn}
                    aria-label={`Message ${turn.sequence}`}
                  >
                    <div className={styles.userMessage}>{turn.userContent}</div>
                    <div className={styles.assistantRow}>
                      <span className={`aero-ai-avatar ${styles.orb}`} aria-hidden="true" />
                      <div className={styles.assistantBody}>
                        <span className="sr-only">Aero AI: </span>
                        {turn.assistantContent ? (
                          <div className={styles.assistantMessage}>
                            <AssistantMessage content={turn.assistantContent} />
                          </div>
                        ) : null}
                        {turn.status === 'GENERATING' && !turn.assistantContent ? (
                          <p className={styles.thinking} role="status">
                            <span className={styles.thinkingDots} aria-hidden="true">
                              ● ● ●
                            </span>{' '}
                            Thinking…
                          </p>
                        ) : null}
                        {turn.status === 'FAILED' ? (
                          <div className={styles.failure}>
                            <p role="status">
                              {turn.errorMessage ?? 'This reply didn’t finish. You can try again.'}
                            </p>
                            <button
                              type="button"
                              className={`aero-btn aero-btn-white ${styles.retry}`}
                              disabled={isBusy || loadingThread || deleting}
                              onClick={() => void sendMessage(turn.userContent, turn.clientRequestId)}
                            >
                              Retry
                            </button>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </article>
                ))}
                {error && !deleteOpen ? (
                  <div className={styles.error} role="alert">
                    <p>{error}</p>
                    <button
                      type="button"
                      className={`aero-btn aero-btn-white ${styles.retry}`}
                      disabled={sending || deleting}
                      onClick={() => {
                        setError('');
                        if (threadId) void openThread(threadId);
                        else void loadThreads().catch((cause) => setError(errorMessage(cause)));
                      }}
                    >
                      Try again
                    </button>
                  </div>
                ) : null}
                {selectedThread?.isGenerating && !sending ? (
                  <p className={styles.loading} role="status">
                    A reply is already running for this chat. Reopen it shortly to see the response.
                  </p>
                ) : null}
              </div>
            </div>
            {showJump ? (
              <button
                type="button"
                className={`aero-btn aero-btn-white ${styles.jump}`}
                onClick={jumpToLatest}
              >
                ↓ Jump to latest
              </button>
            ) : null}
          </div>
          <div className="sr-only" role="status">
            {sending ? 'Aero AI is replying.' : turns.at(-1)?.status === 'COMPLETE' ? 'Reply ready.' : ''}
          </div>
          <AeroAiComposer
            draft={draft}
            onChange={setDraft}
            onSubmit={submit}
            onStop={() => activeRequest.current?.controller.abort()}
            sending={sending}
            disabled={loadingThread || loadingThreads || deleting || (isBusy && !sending)}
          />
        </section>
      </div>

      <dialog
        ref={drawerRef}
        className={styles.drawer}
        aria-labelledby="aero-ai-history-title"
        onClick={(event) => {
          if (event.target === event.currentTarget) {
            const bounds = event.currentTarget.getBoundingClientRect();
            if (event.clientX > bounds.right || event.clientX < bounds.left) event.currentTarget.close();
          }
        }}
      >
        <div className={styles.drawerHeader}>
          <h2 id="aero-ai-history-title">Conversations</h2>
          <button
            type="button"
            className={`aero-btn aero-btn-white ${styles.options}`}
            aria-label="Close chat history"
            onClick={() => drawerRef.current?.close()}
          >
            ×
          </button>
        </div>
        <div className={styles.drawerContent}>{history}</div>
      </dialog>
      <AeroDialog
        open={deleteOpen}
        title="Delete chat?"
        titleId="aero-ai-delete-title"
        description={`Delete “${selectedThread?.title ?? 'this chat'}”? This cannot be undone.`}
        initialFocusRef={cancelDeleteRef}
        onClose={() => {
          if (!deleting) setDeleteOpen(false);
        }}
      >
        {error ? (
          <p role="alert" className={styles.deleteError}>
            {error}
          </p>
        ) : null}
        <div className="aero-modal-actions mt-4">
          <button
            ref={cancelDeleteRef}
            type="button"
            className="aero-modal-cancel"
            disabled={deleting}
            onClick={() => setDeleteOpen(false)}
          >
            Cancel
          </button>
          <button
            type="button"
            className="aero-btn aero-btn-red px-4"
            disabled={deleting}
            onClick={() => {
              if (threadId) void deleteThread(threadId);
            }}
          >
            {deleting ? 'Deleting…' : 'Delete chat'}
          </button>
        </div>
      </AeroDialog>
    </main>
  );
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, cache: 'no-store' });
  if (!response.ok) throw new Error(await responseError(response));
  return (await response.json()) as T;
}

async function responseError(response: Response): Promise<string> {
  const body = (await response.json().catch(() => null)) as { error?: string } | null;
  return body?.error ?? 'Aero AI is temporarily unavailable. Please try again.';
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Aero AI is temporarily unavailable. Please try again.';
}
