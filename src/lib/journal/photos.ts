import { z } from 'zod';

export const MAX_PHOTO_COUNT = 10;
export const MAX_PHOTO_SIZE_BYTES = 10 * 1024 * 1024;
export const MAX_PHOTO_TOTAL_SIZE_BYTES = 20 * 1024 * 1024;
const SUPPORTED_PHOTO_TYPES = new Set(['image/jpeg', 'image/png']);
const HEIF_PHOTO_TYPES = new Set(['image/heic', 'image/heif']);
export const PHOTO_TYPE_ERROR = 'Photos must be JPEG, PNG, HEIC, or HEIF images.';

export const PHOTO_UPLOAD_ERROR = 'Unable to save your photos. Please try again.';
export const PHOTO_COUNT_ERROR = `Attach ${MAX_PHOTO_COUNT} photos or fewer.`;
export const PHOTO_TOTAL_SIZE_ERROR = 'Photos must be 20 MB or smaller in total.';

function isFile(value: unknown): value is File {
  return Boolean(
    value &&
      typeof value === 'object' &&
      typeof (value as File).arrayBuffer === 'function' &&
      typeof (value as File).name === 'string' &&
      typeof (value as File).size === 'number' &&
      typeof (value as File).type === 'string',
  );
}

function isBlankFile(value: FormDataEntryValue) {
  return isFile(value)
    && value.size === 0
    && value.type === 'application/octet-stream'
    && (value.name === '' || value.name === 'undefined');
}

function hasHeifExtension(file: File) {
  return /\.(heic|heif)$/i.test(file.name);
}

export function isHeifPhoto(file: File) {
  const type = file.type.toLowerCase();
  return HEIF_PHOTO_TYPES.has(type)
    || ((type === '' || type === 'application/octet-stream') && hasHeifExtension(file));
}

function isSupportedPhoto(file: File) {
  const type = file.type.toLowerCase();
  return SUPPORTED_PHOTO_TYPES.has(type)
    || HEIF_PHOTO_TYPES.has(type)
    || ((type === '' || type === 'application/octet-stream') && hasHeifExtension(file));
}

const photoFileSchema = z
  .custom<File>(isFile, { error: 'Choose an image file.' })
  .refine(isSupportedPhoto, {
    error: PHOTO_TYPE_ERROR,
  })
  .refine((file) => file.size <= MAX_PHOTO_SIZE_BYTES, {
    error: 'Each photo must be 10 MB or smaller.',
  });

export function parsePhotoFiles(values: FormDataEntryValue[]) {
  const parsed = z
    .array(photoFileSchema)
    .max(MAX_PHOTO_COUNT, { error: PHOTO_COUNT_ERROR })
    .refine(
      (files) => files.reduce((total, file) => total + file.size, 0) <= MAX_PHOTO_TOTAL_SIZE_BYTES,
      { error: PHOTO_TOTAL_SIZE_ERROR },
    )
    .safeParse(values.filter((value) => !isBlankFile(value)));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? PHOTO_UPLOAD_ERROR } as const;
  }
  return { data: parsed.data } as const;
}
