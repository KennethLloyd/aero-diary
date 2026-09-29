import 'server-only';

import { AeroAiAccessError, requireAeroAiSession } from './access';
import { AeroAiStoreError } from './store';

export const noStoreHeaders = { 'Cache-Control': 'no-store' };

const unavailableMessage = 'Aero AI is temporarily unavailable. Please try again.';

export async function authorizeAeroAiRequest(): Promise<{ userId: string } | Response> {
  try {
    const session = await requireAeroAiSession();
    return { userId: session.userId };
  } catch (error) {
    if (error instanceof AeroAiAccessError) {
      return Response.json({ error: error.message }, {
        status: error.status,
        headers: noStoreHeaders,
      });
    }
    return unavailableResponse();
  }
}

export function apiErrorResponse(error: unknown): Response {
  if (error instanceof AeroAiAccessError || error instanceof AeroAiStoreError) {
    return Response.json({ error: error.message }, {
      status: error.status,
      headers: noStoreHeaders,
    });
  }
  return unavailableResponse();
}

export function unavailableResponse(): Response {
  return Response.json({ error: unavailableMessage }, {
    status: 503,
    headers: noStoreHeaders,
  });
}
