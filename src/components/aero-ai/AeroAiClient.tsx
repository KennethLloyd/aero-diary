'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { AeroTitle } from '@/components/aero/AeroTitle';

type Thread = {
  id: string
  title: string
  updatedAt: string
  isGenerating: boolean
}

type Turn = {
  id: string
  clientRequestId: string
  sequence: number
  userContent: string
  assistantContent: string | null
  status: 'GENERATING' | 'COMPLETE' | 'FAILED'
  errorMessage?: string
}

type ThreadDetail = Thread & { turns: Turn[] }
type StreamEvent = { error?: string; content?: string; turnId?: string; title?: string; assistantContent?: string; replayed?: boolean }
type ActiveRequest = { controller: AbortController; threadId: string | null; requestId: string }

export function AeroAiClient({ initialThreadId }: { initialThreadId?: string }) {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState('');
  const [loadingThreads, setLoadingThreads] = useState(true);
  const [loadingThread, setLoadingThread] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const activeRequest = useRef<ActiveRequest | null>(null);
  const threadIdRef = useRef<string | null>(null);
  const blankChatRequested = useRef(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const loadThreads = useCallback(async () => {
    const data = await requestJson<Thread[]>('/api/aero-ai/threads');
    setThreads(data);
    return data;
  }, []);

  const openThread = useCallback(async (id: string) => {
    threadIdRef.current = id;
    setThreadId(id);
    setTurns([]);
    setError('');
    setLoadingThread(true);
    window.history.replaceState(null, '', `/aero-ai?thread=${encodeURIComponent(id)}`);
    try {
      const thread = await requestJson<ThreadDetail>(`/api/aero-ai/threads/${encodeURIComponent(id)}`);
      if (threadIdRef.current === id) setTurns(thread.turns);
      setThreads((current) => current.map((item) => item.id === id ? thread : item));
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
    void loadThreads().then((items) => {
      if (!current) return;
      const selected = items.find((thread) => thread.id === initialThreadId) ?? items[0];
      if (selected && !blankChatRequested.current) void openThread(selected.id);
    }).catch((cause) => {
      if (current) setError(errorMessage(cause));
    }).finally(() => {
      if (current) setLoadingThreads(false);
    });
    return () => {
      current = false;
    };
  }, [initialThreadId, loadThreads, openThread]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [turns]);

  const newChat = () => {
    if (activeRequest.current) return;
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
    const target = threads.find((item) => item.id === id);
    if (!window.confirm(`Delete “${target?.title ?? 'this chat'}”? This cannot be undone.`)) return;
    setError('');
    if (activeRequest.current?.threadId === id) activeRequest.current.controller.abort();
    try {
      await requestJson<{ deleted: true }>(`/api/aero-ai/threads/${encodeURIComponent(id)}`, { method: 'DELETE' });
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
    }
  };

  const sendMessage = async (content: string, requestId = crypto.randomUUID()) => {
    if (activeRequest.current) return;
    blankChatRequested.current = true;
    let activeId = threadIdRef.current;
    const controller = new AbortController();
    activeRequest.current = { controller, threadId: activeId, requestId };
    setSending(true);
    setError('');
    setDraft('');
    setThreads((current) => current.map((item) => item.id === activeId ? { ...item, isGenerating: true } : item));
    setTurns((current) => {
      const existing = current.find((turn) => turn.clientRequestId === requestId);
      if (existing) {
        return current.map((turn) => turn.clientRequestId === requestId
          ? { ...turn, assistantContent: null, status: 'GENERATING', errorMessage: undefined }
          : turn);
      }
      return [...current, {
        id: `pending-${requestId}`,
        clientRequestId: requestId,
        sequence: current.length + 1,
        userContent: content,
        assistantContent: '',
        status: 'GENERATING',
      }];
    });

    try {
      if (!activeId) {
        const created = await requestJson<Thread>('/api/aero-ai/threads', { method: 'POST' });
        activeId = created.id;
        activeRequest.current.threadId = activeId;
        threadIdRef.current = activeId;
        setThreadId(activeId);
        setThreads((current) => [{ ...created, isGenerating: true }, ...current.filter((item) => item.id !== activeId)]);
        window.history.replaceState(null, '', `/aero-ai?thread=${encodeURIComponent(activeId)}`);
        if (controller.signal.aborted) throw new Error('Reply stopped. You can retry it.');
      }
      const response = await fetch(`/api/aero-ai/threads/${encodeURIComponent(activeId)}/messages`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'accept': 'text/event-stream' },
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
          const dataText = event.split(/\r?\n/)
            .filter((line) => line.startsWith('data:'))
            .map((line) => line.slice(5).trimStart())
            .join('\n');
          if (!name || !dataText) continue;
          const data = JSON.parse(dataText) as StreamEvent;
          if (name === 'delta' && data.content) {
            setTurns((current) => current.map((turn) => turn.clientRequestId === requestId
              ? { ...turn, assistantContent: `${turn.assistantContent ?? ''}${data.content}` }
              : turn));
          } else if (name === 'error') {
            throw new Error(data.error ?? 'Aero AI could not finish that reply. Please try again.');
          } else if (name === 'done') {
            completed = true;
            setTurns((current) => current.map((turn) => turn.clientRequestId === requestId
              ? {
                ...turn,
                id: data.turnId ?? turn.id,
                assistantContent: data.assistantContent ?? turn.assistantContent,
                status: 'COMPLETE',
                errorMessage: undefined,
              }
              : turn));
            setThreads((current) => current.map((item) => item.id === activeId
              ? { ...item, title: data.title || item.title, isGenerating: false, updatedAt: new Date().toISOString() }
              : item).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
          }
        }
      }
      if (!completed) throw new Error('The reply was interrupted. Retry to continue.');
    } catch (cause) {
      const message = controller.signal.aborted
        ? 'Reply stopped. You can retry it.'
        : errorMessage(cause);
      setTurns((current) => current.map((turn) => turn.clientRequestId === requestId
        ? { ...turn, assistantContent: null, status: 'FAILED', errorMessage: message }
        : turn));
      setThreads((current) => current.map((item) => item.id === activeId ? { ...item, isGenerating: false } : item));
    } finally {
      if (activeRequest.current?.requestId === requestId) activeRequest.current = null;
      setSending(false);
      void loadThreads().catch(() => {});
    }
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const content = draft.trim();
    if (!content || sending) return;
    void sendMessage(content);
  };

  const handleComposerKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  };

  const selectThread = (id: string) => {
    if (!activeRequest.current && id && id !== threadIdRef.current) void openThread(id);
  };

  const selectedThread = threads.find((item) => item.id === threadId);
  const isBusy = sending || Boolean(selectedThread?.isGenerating);

  return (
    <main className="mx-auto flex h-full w-full max-w-6xl flex-col px-3 pb-[var(--aero-page-bottom)] pt-3 sm:px-5 sm:pt-5">
      <header className="flex min-h-11 items-center justify-between gap-3 px-1">
        <AeroTitle>Aero AI</AeroTitle>
        <div className="flex min-w-0 items-center gap-2">
          <select
            aria-label="Saved chats"
            value={threadId ?? ''}
            onChange={(event) => selectThread(event.currentTarget.value)}
            className="aero-input max-w-40 truncate px-2 py-1 text-xs md:hidden"
          >
            <option value="" disabled>Chats</option>
            {threads.map((thread) => <option key={thread.id} value={thread.id}>{thread.title}</option>)}
          </select>
          <button type="button" onClick={newChat} disabled={sending} className="aero-btn px-3 text-sm" aria-label="New chat">
            <span aria-hidden="true">+</span><span className="ml-1">New</span>
          </button>
        </div>
      </header>

      <div className="mt-3 flex min-h-0 flex-1 gap-3 md:gap-4">
        <aside className="aero-card hidden w-56 shrink-0 flex-col p-2 md:flex" aria-label="Saved chats">
          <div className="relative z-10 flex items-center justify-between px-2 py-2">
            <span className="text-sm font-bold text-[#0a2f5c]">Chats</span>
            {loadingThreads ? <span className="text-xs text-[#46648c]" role="status">Loading…</span> : null}
          </div>
          <div className="relative z-10 min-h-0 flex-1 space-y-1 overflow-y-auto">
            {threads.map((thread) => (
              <div key={thread.id} className={`flex items-center gap-1 rounded-xl ${thread.id === threadId ? 'bg-white/75 shadow-sm' : ''}`}>
                <button
                  type="button"
                  onClick={() => selectThread(thread.id)}
                  aria-current={thread.id === threadId ? 'true' : undefined}
                  className="min-h-10 min-w-0 flex-1 truncate rounded-xl px-3 py-2 text-left text-sm font-semibold text-[#24496f] hover:bg-white/65"
                >
                  {thread.title}{thread.isGenerating ? ' ·' : ''}
                </button>
              </div>
            ))}
          </div>
        </aside>

        <section className="aero-card flex min-w-0 flex-1 flex-col" aria-label="Conversation">
          <div className="relative z-10 flex min-h-12 items-center justify-between gap-3 border-b border-white/70 px-3 py-2 sm:px-4">
            <span className="min-w-0 truncate text-sm font-bold text-[#0a2f5c]">
              {selectedThread?.title ?? ' '}
            </span>
            {threadId ? (
              <button type="button" onClick={() => void deleteThread(threadId)} className="aero-btn aero-btn-white px-3 py-1 text-xs" aria-label="Delete chat">
                Delete
              </button>
            ) : null}
          </div>

          <div className="relative z-10 flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-3 py-3 sm:px-5 sm:py-5" aria-live="polite">
            {loadingThread ? <p className="text-center text-xs font-semibold text-[#46648c]" role="status">Loading…</p> : null}
            {!loadingThread && !threadId && !loadingThreads ? <div className="flex-1" /> : null}
            {turns.map((turn) => (
              <article key={turn.clientRequestId} className="space-y-2">
                <div className="ml-auto w-fit max-w-[88%] whitespace-pre-wrap break-words rounded-2xl rounded-br-md bg-[#176db9] px-4 py-2.5 text-sm leading-relaxed text-white shadow-sm">
                  {turn.userContent}
                </div>
                {turn.assistantContent ? (
                  <div className="aero-surface-plain w-fit max-w-[94%] whitespace-pre-wrap break-words px-4 py-3 text-sm leading-relaxed text-[#1a2c42]">
                    <AssistantText content={turn.assistantContent} />
                  </div>
                ) : null}
                {turn.status === 'GENERATING' && !turn.assistantContent ? (
                  <p className="px-3 text-sm font-semibold text-[#46648c]" role="status">Thinking…</p>
                ) : null}
                {turn.status === 'FAILED' ? (
                  <div className="flex flex-wrap items-center gap-2 px-2 text-sm text-[#7b2c31]">
                    <span role="status">{turn.errorMessage ?? 'Reply stopped.'}</span>
                    <button
                      type="button"
                      onClick={() => void sendMessage(turn.userContent, turn.clientRequestId)}
                      disabled={sending}
                      className="aero-link-control font-bold underline decoration-dotted underline-offset-4 disabled:opacity-60"
                    >
                      Retry
                    </button>
                  </div>
                ) : null}
              </article>
            ))}
            <div ref={bottomRef} />
            {error ? <p className="mx-auto max-w-lg rounded-xl bg-white/75 px-3 py-2 text-center text-sm font-semibold text-[#7b2c31]" role="alert">{error}</p> : null}
            {selectedThread?.isGenerating && !sending ? (
              <p className="text-center text-xs font-semibold text-[#46648c]" role="status">A reply is already running for this chat.</p>
            ) : null}
          </div>

          <form onSubmit={submit} className="relative z-10 flex items-end gap-2 border-t border-white/70 p-2.5 sm:gap-3 sm:p-3">
            <label htmlFor="aero-ai-message" className="sr-only">Message Aero AI</label>
            <textarea
              id="aero-ai-message"
              value={draft}
              onChange={(event) => setDraft(event.currentTarget.value)}
              onKeyDown={handleComposerKeyDown}
              maxLength={4_000}
              rows={1}
              placeholder="Message Aero AI"
              className="aero-input min-h-11 max-h-32 min-w-0 flex-1 resize-y rounded-2xl py-2.5 text-sm"
              disabled={isBusy || loadingThread}
            />
            {sending ? (
              <button type="button" onClick={() => activeRequest.current?.controller.abort()} className="aero-btn aero-btn-white px-3 text-sm" aria-label="Stop reply">
                Stop
              </button>
            ) : (
              <button type="submit" disabled={!draft.trim() || isBusy || loadingThread} className="aero-btn px-3 text-sm" aria-label="Send message">
                Send
              </button>
            )}
          </form>
        </section>
      </div>
    </main>
  );
}

function AssistantText({ content }: { content: string }) {
  const linkPattern = /\[([^\]]+)\]\((\/timeline\/[A-Za-z0-9_-]+)\)/g;
  const nodes: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = linkPattern.exec(content))) {
    const [token, label, href] = match;
    if (!token || !label || !href) continue;
    if (match.index > lastIndex) nodes.push(content.slice(lastIndex, match.index));
    nodes.push(<a key={`${match.index}-${href}`} href={href} className="font-bold text-[#145c9b] underline decoration-dotted underline-offset-4">{label}</a>);
    lastIndex = match.index + token.length;
  }
  if (lastIndex < content.length) nodes.push(content.slice(lastIndex));
  return <>{nodes}</>;
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, cache: 'no-store' });
  if (!response.ok) throw new Error(await responseError(response));
  return await response.json() as T;
}

async function responseError(response: Response): Promise<string> {
  const body = await response.json().catch(() => null) as { error?: string } | null;
  return body?.error ?? 'Aero AI is temporarily unavailable. Please try again.';
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Aero AI is temporarily unavailable. Please try again.';
}
