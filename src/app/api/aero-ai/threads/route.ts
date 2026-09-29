import { authorizeAeroAiRequest, apiErrorResponse, noStoreHeaders } from '@/lib/aero-ai/http';
import { createThreadForUser, listThreadsForUser } from '@/lib/aero-ai/store';

export async function GET(request: Request) {
  const access = await authorizeAeroAiRequest(request);
  if (access instanceof Response) return access;
  try {
    return Response.json(await listThreadsForUser(access.userId), { headers: noStoreHeaders });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(request: Request) {
  const access = await authorizeAeroAiRequest(request);
  if (access instanceof Response) return access;
  try {
    return Response.json(await createThreadForUser(access.userId), {
      status: 201,
      headers: noStoreHeaders,
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
