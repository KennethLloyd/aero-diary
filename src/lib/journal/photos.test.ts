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
      new File([], 'undefined', { type: 'application/octet-stream' }),
      new File([], 'blob', { type: 'application/octet-stream' }),
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

  it('accepts PNG photos', () => {
    const result = parsePhotoFiles(values(
      new File(['png-photo'], 'photo.png', { type: 'image/png' }),
    ));

    expect(result.data).toHaveLength(1);
  });

  it('accepts iPhone HEIC and HEIF photos', () => {
    const result = parsePhotoFiles(values(
      new File(['heic-photo'], 'photo.heic', { type: 'image/heic' }),
      new File(['heif-photo'], 'photo.heif', { type: 'image/heif' }),
    ));

    expect(result.data).toHaveLength(2);
  });

  it('accepts HEIC files when the browser only provides the file extension', () => {
    const result = parsePhotoFiles(values(
      new File(['heic-photo'], 'photo.HEIC', { type: 'application/octet-stream' }),
    ));

    expect(result.data).toHaveLength(1);
  });

  it('rejects non-image files and oversized images', () => {
    expect(parsePhotoFiles(values(new File(['text'], 'notes.txt', { type: 'text/plain' })))).toEqual({
      error: 'Photos must be JPEG, PNG, HEIC, or HEIF images.',
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
