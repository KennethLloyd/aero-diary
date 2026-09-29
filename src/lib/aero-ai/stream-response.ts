import 'server-only';

import { generateAeroAiTurn } from './conversation';
import type { AeroAiTurnResult } from './conversation';
import type { TurnReservation } from './store';

const headers = {
  'Cache-Control': 'no-cache, no-store, no-transform',
  'Content-Type': 'text/event-stream; charset=utf-8',
  'Connection': 'keep-alive',
  'X-Accel-Buffering': 'no',
};

export function streamAeroAiTurn(
  userId: string,
  threadId: string,
  reservation: TurnReservation | null,
  replay: AeroAiTurnResult | null,
  requestSignal: AbortSignal,
): Response {
  const controller = new AbortController();
  const forwardAbort = () => controller.abort();
  if (requestSignal.aborted) controller.abort();
  else requestSignal.addEventListener('abort', forwardAbort, { once: true });

  let closed = false;
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(streamController) {
      const emit = (event: string, data: unknown) => {
        if (closed) return;
        try {
          streamController.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          closed = true;
        }
      };
      const close = () => {
        if (closed) return;
        closed = true;
        streamController.close();
      };

      if (replay) {
        emit('start', { threadId, turnId: replay.turnId });
        emit('delta', { content: replay.assistantContent });
        emit('done', { ...replay, threadId });
        close();
        return;
      }

      if (!reservation) {
        emit('error', { error: 'Aero AI could not start that reply. Please try again.' });
        close();
        return;
      }

      emit('start', { threadId, turnId: reservation.turnId });
      void generateAeroAiTurn(userId, reservation, {
        signal: controller.signal,
        onText: (content) => emit('delta', { content }),
      }).then((result) => {
        emit('done', { ...result, threadId });
        close();
      }).catch(() => {
        if (!controller.signal.aborted) {
          emit('error', { error: 'Aero AI could not finish that reply. Please try again.' });
        }
        close();
      }).finally(() => {
        requestSignal.removeEventListener('abort', forwardAbort);
      });
    },
    cancel() {
      closed = true;
      controller.abort();
    },
  });

  return new Response(body, { headers });
}
