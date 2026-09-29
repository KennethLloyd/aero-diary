import { aeroAiThreadIdSchema } from '@/lib/aero-ai/schemas';
import { authorizeAeroAiRequest, apiErrorResponse, noStoreHeaders } from '@/lib/aero-ai/http';
import { deleteThreadForUser, getThreadForUser } from '@/lib/aero-ai/store';

type RouteParams = { params: Promise<{ id: string }> }

export async function GET(request: Request, { params }: RouteParams) {
  const access = await authorizeAeroAiRequest(request);
  if (access instanceof Response) return access;
  const parsed = aeroAiThreadIdSchema.safeParse((await params).id);
  if (!parsed.success) return notFound();

  try {
    const thread = await getThreadForUser(access.userId, parsed.data);
    return thread
      ? Response.json(thread, { headers: noStoreHeaders })
      : notFound();
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function DELETE(request: Request, { params }: RouteParams) {
  const access = await authorizeAeroAiRequest(request);
  if (access instanceof Response) return access;
  const parsed = aeroAiThreadIdSchema.safeParse((await params).id);
  if (!parsed.success) return notFound();

  try {
    const deleted = await deleteThreadForUser(access.userId, parsed.data);
    return deleted
      ? Response.json({ deleted: true }, { headers: noStoreHeaders })
      : notFound();
  } catch (error) {
    return apiErrorResponse(error);
  }
}

function notFound() {
  return Response.json({ error: 'Chat not found.' }, { status: 404, headers: noStoreHeaders });
}
