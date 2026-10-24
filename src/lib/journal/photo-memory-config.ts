import { z } from 'zod';

const positive = z.coerce.number().int().positive();

export function getPhotoMemoryConfig() {
  return {
    retrievalEnabled: process.env.PHOTO_MEMORY_ENABLED === 'true',
    indexingEnabled: process.env.PHOTO_INDEXING_ENABLED === 'true',
    visionEnabled: process.env.PHOTO_VISION_ENABLED === 'true',
    maxVisionImages: positive.max(3).parse(process.env.PHOTO_VISION_MAX_IMAGES ?? 3),
    maxInputBytes: positive.parse(process.env.PHOTO_MEMORY_MAX_INPUT_BYTES ?? 10 * 1024 * 1024),
    maxDecodedPixels: positive.parse(process.env.PHOTO_MEMORY_MAX_DECODED_PIXELS ?? 64_000_000),
    longestEdge: positive.max(512).parse(process.env.PHOTO_MEMORY_LONGEST_EDGE ?? 512),
    jpegQuality: positive.max(100).parse(process.env.PHOTO_MEMORY_JPEG_QUALITY ?? 85),
    downloadTimeoutMs: positive.parse(process.env.PHOTO_MEMORY_DOWNLOAD_TIMEOUT_MS ?? 30_000),
    inferenceTimeoutMs: positive.parse(process.env.PHOTO_MEMORY_INFERENCE_TIMEOUT_MS ?? 30_000),
    inferenceThreads: positive.parse(process.env.PHOTO_MEMORY_INFERENCE_THREADS ?? 1),
  };
}
