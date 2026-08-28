import {
  photoStageDeleteResponseSchema,
  photoStageErrorResponseSchema,
  photoStageUploadResponseSchema,
} from '@/lib/journal/schemas';

export const PHOTO_UPLOAD_TIMEOUT_MS = 60_000;

export const PHOTO_UPLOAD_CONCURRENCY = 3;

type QueueTask = {
  run: () => Promise<unknown>
  resolve: (value: unknown) => void
  reject: (reason?: unknown) => void
}

export function createPhotoUploadQueue(maxConcurrent = PHOTO_UPLOAD_CONCURRENCY) {
  const limit = Math.max(1, Math.floor(maxConcurrent));
  const pending: QueueTask[] = [];
  let active = 0;

  function drain() {
    while (active < limit && pending.length > 0) {
      const task = pending.shift();
      if (!task) return;
      active += 1;
      void task.run().then(task.resolve, task.reject).finally(() => {
        active -= 1;
        drain();
      });
    }
  }

  return {
    enqueue<T>(run: () => Promise<T>) {
      const { promise, resolve, reject } = Promise.withResolvers<T>();
      pending.push({
        run: run as () => Promise<unknown>,
        resolve: resolve as (value: unknown) => void,
        reject,
      });
      drain();
      return promise;
    },
  };
}

export async function uploadStagedPhoto(
  file: File,
  draftKey: string,
  clientKey: string,
): Promise<{ id: string }> {
  const formData = new FormData();
  formData.append('photo', file);
  formData.set('draftKey', draftKey);
  formData.set('clientKey', clientKey);
  const response = await fetch('/api/photo-stages', {
    method: 'POST',
    body: formData,
    signal: AbortSignal.timeout(PHOTO_UPLOAD_TIMEOUT_MS),
  });
  const body: unknown = await response.json().catch(() => undefined);
  if (response.ok) {
    const result = photoStageUploadResponseSchema.safeParse(body);
    if (!result.success) throw new Error('Unable to upload this photo.');
    return { id: result.data.id };
  }
  const error = photoStageErrorResponseSchema.safeParse(body);
  throw new Error(error.success ? error.data.error : 'Unable to upload this photo.');
}

async function validatePhotoStageDeleteResponse(response: Response): Promise<void> {
  if (response.status === 404) return;
  const body: unknown = await response.json().catch(() => undefined);
  if (response.ok) {
    if (!photoStageDeleteResponseSchema.safeParse(body).success) {
      throw new Error('Unable to remove this photo.');
    }
    return;
  }
  const error = photoStageErrorResponseSchema.safeParse(body);
  throw new Error(error.success ? error.data.error : 'Unable to remove this photo.');
}

export async function removeStagedPhoto(id: string, keepalive = false): Promise<void> {
  const response = await fetch(`/api/photo-stages/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    keepalive,
  });
  await validatePhotoStageDeleteResponse(response);
}

export async function removeStagedPhotoByKey(
  draftKey: string,
  clientKey: string,
  keepalive = false,
): Promise<void> {
  const searchParams = new URLSearchParams({ draftKey, clientKey });
  const response = await fetch(`/api/photo-stages?${searchParams.toString()}`, {
    method: 'DELETE',
    keepalive,
  });
  await validatePhotoStageDeleteResponse(response);
}
