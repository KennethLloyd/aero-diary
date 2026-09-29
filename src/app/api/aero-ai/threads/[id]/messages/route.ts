import { aeroAiMessageRequestSchema, aeroAiThreadIdSchema } from '@/lib/aero-ai/schemas';
import { authorizeAeroAiRequest, apiErrorResponse, noStoreHeaders, unavailableResponse } from '@/lib/aero-ai/http';
import { generateAeroAiTurn } from '@/lib/aero-ai/conversation';
import { reserveTurn, type TurnReservation } from '@/lib/aero-ai/store';
import { streamAeroAiTurn } from '@/lib/aero-ai/stream-response';

type RouteParams = { params: Promise<{ id: string }> }

export async function POST(request: Request, { params }: RouteParams) {
  const access = await authorizeAeroAiRequest();
  if (access instanceof Response) return access;
  const parsedThreadId = aeroAiThreadIdSchema.safeParse((await params).id);
  if (!parsedThreadId.success) return notFound();

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return Response.json({ error: 'Invalid request.' }, { status: 400, headers: noStoreHeaders });
  }
  const parsed = aeroAiMessageRequestSchema.safeParse(raw);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request.' }, {
      status: 400,
      headers: noStoreHeaders,
    });
  }

  try {
    const result = await reserveTurn(
      access.userId,
      parsedThreadId.data,
      parsed.data.requestId,
      parsed.data.content,
    );
    let reservation: TurnReservation | null = null;
    let replay = null;
    if (result.kind === 'started') {
      reservation = result.reservation;
    } else {
      replay = {
        turnId: result.turn.id,
        title: result.turn.title,
        assistantContent: result.turn.assistantContent,
        replayed: true,
      };
    }

    if (parsed.data.stream) {
      return streamAeroAiTurn(
        access.userId,
        parsedThreadId.data,
        reservation,
        replay,
        request.signal,
      );
    }

    if (replay) {
      return Response.json({ ...replay, threadId: parsedThreadId.data }, { headers: noStoreHeaders });
    }
    if (!reservation) return unavailableResponse();
    const completed = await generateAeroAiTurn(access.userId, reservation, { signal: request.signal });
    return Response.json({ ...completed, threadId: parsedThreadId.data }, { headers: noStoreHeaders });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

function notFound() {
  return Response.json({ error: 'Chat not found.' }, { status: 404, headers: noStoreHeaders });
}
