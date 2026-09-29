import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AeroAiClient } from './AeroAiClient';

const saved = { id: 'saved', title: 'Saved conversation', updatedAt: '2026-09-29T00:00:00Z', isGenerating: false };
const created = { ...saved, id: 'created', title: 'New chat' };

function reply() {
  return new Response(new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('event: delta\ndata: {"content":"Hello"}\n\nevent: done\ndata: {"turnId":"turn","title":"First message","assistantContent":"Hello"}\n\n'));
      controller.close();
    },
  }));
}

describe('AeroAiClient blank chats', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
    Object.defineProperty(Element.prototype, 'scrollIntoView', { configurable: true, value: vi.fn() });
    window.history.replaceState(null, '', '/aero-ai');
  });

  afterEach(() => {
    cleanup();
    delete (Element.prototype as Partial<Element>).scrollIntoView;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('opens a usable blank conversation without creating a thread on first use', async () => {
    vi.mocked(fetch).mockResolvedValue(Response.json([]));
    render(<AeroAiClient />);
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    expect(screen.getByRole('textbox', { name: 'Message Aero AI' })).toBeEnabled();
    for (let i = 0; i < 3; i++) fireEvent.click(screen.getByRole('button', { name: 'New chat' }));
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(window.location.search).toBe('');
  });

  it('reopens saved chats and enters local blank state on repeated New without POSTs', async () => {
    vi.mocked(fetch).mockImplementation(async (url) => Response.json(
      url === '/api/aero-ai/threads' ? [saved] : { ...saved, turns: [{ id: 'turn', clientRequestId: 'request', sequence: 1, userContent: 'Earlier message', assistantContent: 'Earlier reply', status: 'COMPLETE' }] },
    ));
    render(<AeroAiClient />);
    await screen.findByText('Earlier reply');
    expect(screen.queryByRole('button', { name: 'Delete Saved conversation' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete chat' })).toBeInTheDocument();
    for (let i = 0; i < 3; i++) fireEvent.click(screen.getByRole('button', { name: 'New chat' }));
    expect(screen.queryByText('Earlier reply')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete chat' })).not.toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Message Aero AI' })).toBeEnabled();
    expect(vi.mocked(fetch).mock.calls.every(([, init]) => !init?.method)).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Saved conversation' }));
    await screen.findByText('Earlier reply');
  });

  it('creates exactly one thread on first send, including duplicate submissions while creation is pending', async () => {
    let resolveCreation!: (response: Response) => void;
    const creation = new Promise<Response>((resolve) => { resolveCreation = resolve; });
    vi.mocked(fetch).mockImplementation(async (url, init) => {
      if (init?.method === 'POST' && url === '/api/aero-ai/threads') return creation;
      if (init?.method === 'POST') return reply();
      return Response.json([]);
    });
    render(<AeroAiClient />);
    const composer = screen.getByRole('textbox', { name: 'Message Aero AI' });
    fireEvent.change(composer, { target: { value: 'First message' } });
    const form = composer.closest('form')!;
    fireEvent.submit(form);
    fireEvent.submit(form);
    expect(vi.mocked(fetch).mock.calls.filter(([url, init]) => url === '/api/aero-ai/threads' && init?.method === 'POST')).toHaveLength(1);
    resolveCreation(Response.json(created));
    await screen.findByText('Hello');
    expect(window.location.search).toBe('?thread=created');
    const messages = vi.mocked(fetch).mock.calls.filter(([url]) => String(url).endsWith('/messages'));
    expect(messages).toHaveLength(1);
    expect(JSON.parse(messages[0][1]?.body as string)).toMatchObject({ content: 'First message', stream: true });
    await waitFor(() => expect(composer).toBeEnabled());
  });

  it('retries a failed first thread creation with the original message', async () => {
    let attempts = 0;
    vi.mocked(fetch).mockImplementation(async (url, init) => {
      if (url === '/api/aero-ai/threads' && init?.method === 'POST') {
        attempts++;
        return attempts === 1 ? Response.json({ error: 'Temporarily unavailable' }, { status: 503 }) : Response.json(created);
      }
      if (init?.method === 'POST') return reply();
      return Response.json([]);
    });
    render(<AeroAiClient />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'First message' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Retry' }));
    await screen.findByText('Hello');
    expect(attempts).toBe(2);
    expect(screen.getAllByText('First message')).toHaveLength(1);
  });
});
