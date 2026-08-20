import { describe, expect, it } from 'vitest';
import {
  MAX_PHOTO_COUNT,
  MAX_PHOTO_SIZE_BYTES,
  MAX_PHOTO_TOTAL_SIZE_BYTES,
  PHOTO_TOTAL_SIZE_ERROR,
  parsePhotoFiles,
} from '@/lib/journal/photos';

function values(...files: File[]): FormDataEntryValue[] {
  return files;
}

describe('parsePhotoFiles', () => {
  it('accepts image files and ignores an empty picker value', () => {
    const result = parsePhotoFiles(values(
      new File(['photo'], 'photo.jpg', { type: 'image/jpeg' }),
      new File([], '', { type: 'application/octet-stream' }),
    ));

    expect(result.data).toHaveLength(1);
  });

  it('accepts exactly ten photos', () => {
    const files = Array.from(
      { length: MAX_PHOTO_COUNT },
      (_, index) => new File([String(index)], `${index}.jpg`, { type: 'image/jpeg' }),
    );

    expect(parsePhotoFiles(values(...files)).data).toHaveLength(10);
  });

  it('rejects non-image files and oversized images', () => {
    expect(parsePhotoFiles(values(new File(['text'], 'notes.txt', { type: 'text/plain' })))).toEqual({
      error: 'Photos must be JPEG images.',
    });
    expect(parsePhotoFiles(values(
      new File([new Uint8Array(MAX_PHOTO_SIZE_BYTES + 1)], 'large.jpg', { type: 'image/jpeg' }),
    ))).toEqual({ error: 'Each photo must be 10 MB or smaller.' });
  });

  it('rejects more than the allowed number of photos', () => {
    const files = Array.from(
      { length: MAX_PHOTO_COUNT + 1 },
      (_, index) => new File([String(index)], `${index}.jpg`, { type: 'image/jpeg' }),
    );

    expect(parsePhotoFiles(values(...files))).toEqual({
      error: `Attach ${MAX_PHOTO_COUNT} photos or fewer.`,
    });
  });

  it('rejects a batch larger than the server action upload limit', () => {
    const files = [
      new File([new Uint8Array(Math.floor(MAX_PHOTO_TOTAL_SIZE_BYTES / 3))], 'one.jpg', { type: 'image/jpeg' }),
      new File([new Uint8Array(Math.floor(MAX_PHOTO_TOTAL_SIZE_BYTES / 3))], 'two.jpg', { type: 'image/jpeg' }),
      new File([new Uint8Array(Math.floor(MAX_PHOTO_TOTAL_SIZE_BYTES / 3) + 4)], 'three.jpg', { type: 'image/jpeg' }),
    ];

    expect(parsePhotoFiles(values(...files))).toEqual({ error: PHOTO_TOTAL_SIZE_ERROR });
  });
});
