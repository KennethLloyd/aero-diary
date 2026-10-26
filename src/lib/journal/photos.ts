import { z } from 'zod';

export const MAX_PHOTO_COUNT = 20;
export const MAX_PHOTO_SIZE_BYTES = 10 * 1024 * 1024;
const SUPPORTED_PHOTO_TYPES = new Set(['image/jpeg', 'image/png']);
const HEIF_PHOTO_TYPES = new Set(['image/heic', 'image/heif']);
export const PHOTO_TYPE_ERROR = 'Photos must be JPEG, PNG, HEIC, or HEIF images.';
export const PHOTO_WEBP_ERROR =
  'WebP photos are not supported. Please choose a JPEG, PNG, HEIC, or HEIF image.';
export const PHOTO_SIZE_ERROR = 'Each photo must be 10 MB or smaller.';
export const PHOTO_UPLOAD_ERROR = 'Unable to save your photos. Please try again.';
export const PHOTO_COUNT_ERROR = `Attach ${MAX_PHOTO_COUNT} photos or fewer.`;

export type SupportedPhotoContentType = 'image/jpeg' | 'image/png' | 'image/heic' | 'image/heif';

export class UnsupportedPhotoContentError extends Error {
  constructor(message = PHOTO_TYPE_ERROR) {
    super(message);
    this.name = 'UnsupportedPhotoContentError';
  }
}

export class PhotoSizeError extends Error {
  constructor() {
    super(PHOTO_SIZE_ERROR);
    this.name = 'PhotoSizeError';
  }
}

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
  return (
    isFile(value) &&
    value.size === 0 &&
    value.type === 'application/octet-stream' &&
    // Untouched pickers arrive as '' (native submit), 'undefined' (older
    // serialization), or 'blob' (React server-action serialization).
    (value.name === '' || value.name === 'undefined' || value.name === 'blob')
  );
}

function isSupportedPhoto(file: File) {
  const type = file.type.toLowerCase();
  const hasAllowedExtension = /\.(jpe?g|png|heic|heif)$/i.test(file.name);

  return (
    SUPPORTED_PHOTO_TYPES.has(type) ||
    HEIF_PHOTO_TYPES.has(type) ||
    ((type === '' || type === 'application/octet-stream') && hasAllowedExtension)
  );
}

function matchesAscii(bytes: Uint8Array, offset: number, value: string) {
  if (offset + value.length > bytes.length) return false;

  for (let index = 0; index < value.length; index += 1) {
    if (bytes[offset + index] !== value.charCodeAt(index)) return false;
  }

  return true;
}

export async function sniffPhotoContentType(file: File): Promise<SupportedPhotoContentType> {
  const signature = new Uint8Array(await file.slice(0, 32).arrayBuffer());

  if (signature[0] === 0xff && signature[1] === 0xd8 && signature[2] === 0xff) {
    return 'image/jpeg';
  }

  if (
    signature[0] === 0x89 &&
    matchesAscii(signature, 1, 'PNG') &&
    signature[4] === 0x0d &&
    signature[5] === 0x0a &&
    signature[6] === 0x1a &&
    signature[7] === 0x0a
  ) {
    return 'image/png';
  }

  if (matchesAscii(signature, 0, 'RIFF') && matchesAscii(signature, 8, 'WEBP')) {
    throw new UnsupportedPhotoContentError(PHOTO_WEBP_ERROR);
  }

  if (matchesAscii(signature, 4, 'ftyp')) {
    let hasHeicBrand = false;
    let hasHeifBrand = false;
    let hasAvifBrand = false;

    for (let offset = 8; offset + 4 <= signature.length; offset += 4) {
      if (offset === 12) continue;

      const brand = String.fromCharCode(
        signature[offset]!,
        signature[offset + 1]!,
        signature[offset + 2]!,
        signature[offset + 3]!,
      );

      if (brand === 'heic' || brand === 'heix' || brand === 'hevc' || brand === 'hevx') {
        hasHeicBrand = true;
      } else if (brand === 'mif1' || brand === 'msf1' || brand === 'heif') {
        hasHeifBrand = true;
      } else if (brand === 'avif' || brand === 'avis') {
        hasAvifBrand = true;
      }
    }

    if (!hasAvifBrand && hasHeicBrand) return 'image/heic';
    if (!hasAvifBrand && hasHeifBrand) return 'image/heif';
  }

  throw new UnsupportedPhotoContentError();
}

const photoFileSchema = z
  .custom<File>(isFile, { error: 'Choose an image file.' })
  .refine((file) => file.type.toLowerCase() !== 'image/webp', {
    error: PHOTO_WEBP_ERROR,
  })
  .refine(isSupportedPhoto, {
    error: PHOTO_TYPE_ERROR,
  })
  .refine((file) => file.size <= MAX_PHOTO_SIZE_BYTES, {
    error: PHOTO_SIZE_ERROR,
  });

export function parsePhotoFiles(values: FormDataEntryValue[]) {
  const parsed = z
    .array(photoFileSchema)
    .max(MAX_PHOTO_COUNT, { error: PHOTO_COUNT_ERROR })
    .safeParse(values.filter((value) => !isBlankFile(value)));

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? PHOTO_UPLOAD_ERROR } as const;
  }

  return { data: parsed.data } as const;
}
