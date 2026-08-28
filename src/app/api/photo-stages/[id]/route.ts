import { db } from '@/lib/db';
import { verifySession } from '@/lib/dal';
import { getPhotoStore } from '@/lib/drive/server-store';
import { stagedPhotoIdSchema } from '@/lib/journal/schemas';
import { deleteStagedPhoto } from '@/lib/journal/photo-staging';

type StagedPhotoRouteContext = {
  params: Promise<{ id: string }>
}

export async function DELETE(_request: Request, { params }: StagedPhotoRouteContext) {
  const session = await verifySession();
  const { id } = await params;
  const parsedId = stagedPhotoIdSchema.safeParse(id);
  if (!parsedId.success) return Response.json({ error: 'Photo upload not found.' }, { status: 404 });

  try {
    const deleted = await deleteStagedPhoto(db, getPhotoStore(), session.userId, parsedId.data);
    if (!deleted) return Response.json({ error: 'Photo upload not found.' }, { status: 404 });
    return Response.json({ deleted: true });
  } catch (error) {
    console.error('Unable to remove a staged photo upload.', error);
    return Response.json({ error: 'Unable to remove your photo. Please try again.' }, { status: 500 });
  }
}
