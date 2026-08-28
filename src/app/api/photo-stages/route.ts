import { db } from '@/lib/db';
import { verifySession } from '@/lib/dal';
import { getPhotoStore } from '@/lib/drive/server-store';
import { parsePhotoFiles, PHOTO_UPLOAD_ERROR } from '@/lib/journal/photos';
import { photoStagingKeySchema } from '@/lib/journal/schemas';
import {
  deleteStagedPhotoByKey,
  PhotoStageCancelledError,
  PhotoStageCapacityError,
  stagePhoto,
} from '@/lib/journal/photo-staging';

export async function POST(request: Request) {
  const session = await verifySession();
  const formData = await request.formData();
  const parsedDraftKey = photoStagingKeySchema.safeParse(formData.get('draftKey'));
  if (!parsedDraftKey.success) {
    return Response.json({ error: parsedDraftKey.error.issues[0]?.message ?? PHOTO_UPLOAD_ERROR }, { status: 400 });
  }
  const parsedClientKey = photoStagingKeySchema.safeParse(formData.get('clientKey'));
  if (!parsedClientKey.success) {
    return Response.json({ error: parsedClientKey.error.issues[0]?.message ?? PHOTO_UPLOAD_ERROR }, { status: 400 });
  }

  const parsedFile = parsePhotoFiles([formData.get('photo')].filter((value): value is FormDataEntryValue => value !== null));
  if ('error' in parsedFile) return Response.json({ error: parsedFile.error }, { status: 400 });
  const [file] = parsedFile.data;
  if (!file) return Response.json({ error: PHOTO_UPLOAD_ERROR }, { status: 400 });

  try {
    const staged = await stagePhoto(db, getPhotoStore(), {
      userId: session.userId,
      draftKey: parsedDraftKey.data,
      clientKey: parsedClientKey.data,
      file,
    });
    return Response.json({ id: staged.id, status: 'ready' as const });
  } catch (error) {
    if (error instanceof PhotoStageCancelledError) {
      return Response.json({ error: 'Photo upload was cancelled.' }, { status: 409 });
    }
    if (error instanceof PhotoStageCapacityError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    console.error('Unable to stage a photo upload.', error);
    return Response.json({ error: PHOTO_UPLOAD_ERROR }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const session = await verifySession();
  const url = new URL(request.url);
  const parsedDraftKey = photoStagingKeySchema.safeParse(url.searchParams.get('draftKey'));
  const parsedClientKey = photoStagingKeySchema.safeParse(url.searchParams.get('clientKey'));
  if (!parsedDraftKey.success || !parsedClientKey.success) {
    return Response.json({ error: 'Photo upload not found.' }, { status: 404 });
  }

  try {
    const deleted = await deleteStagedPhotoByKey(
      db,
      getPhotoStore(),
      session.userId,
      parsedDraftKey.data,
      parsedClientKey.data,
      10_000,
    );
    if (!deleted) return Response.json({ error: 'Photo upload not found.' }, { status: 404 });
    return Response.json({ deleted: true });
  } catch (error) {
    console.error('Unable to remove a staged photo upload.', error);
    return Response.json({ error: 'Unable to remove your photo. Please try again.' }, { status: 500 });
  }
}
