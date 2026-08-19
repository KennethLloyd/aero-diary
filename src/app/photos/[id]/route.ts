import { db } from '@/lib/db';
import { verifySession } from '@/lib/dal';
import { DrivePhotoNotFoundError, getPhotoStore } from '@/lib/drive/store';
import { photoIdSchema } from '@/lib/journal/schemas';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type PhotoRouteContext = {
  params: Promise<{ id: string }>
}

export async function GET(_request: Request, { params }: PhotoRouteContext) {
  const session = await verifySession();
  const { id } = await params;
  const parsedPhotoId = photoIdSchema.safeParse(id);
  if (!parsedPhotoId.success) return new Response('Not found', { status: 404 });

  const photo = await db.photo.findFirst({
    where: {
      id: parsedPhotoId.data,
      entry: { userId: session.userId },
    },
    select: { driveFileId: true, drivePath: true, mimeType: true },
  });
  if (!photo) return new Response('Not found', { status: 404 });

  try {
    const body = await getPhotoStore().download(photo.drivePath, photo.driveFileId ?? undefined);
    return new Response(body, {
      headers: {
        'Cache-Control': 'private, max-age=31536000, immutable',
        'Content-Type': photo.mimeType,
      },
    });
  } catch (error) {
    if (error instanceof DrivePhotoNotFoundError) return new Response('Not found', { status: 404 });
    return new Response('Unable to load photo', { status: 503 });
  }
}
