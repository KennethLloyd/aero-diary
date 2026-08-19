import 'server-only';

import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { google } from 'googleapis';
import type { drive_v3 } from 'googleapis';
import { z } from 'zod';

export const GOOGLE_DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive';
const FOLDER_MIME_TYPE = 'application/vnd.google-apps.folder';
const DEFAULT_PHOTOS_ROOT = 'AeroDiary/photos';
const driveConfigSchema = z.object({
  clientId: z.string().trim().min(1),
  clientSecret: z.string().trim().min(1),
  photosRoot: z.string().trim().min(1).default(DEFAULT_PHOTOS_ROOT),
  refreshToken: z.string().trim().min(1),
});


export type DriveFilesApi = Pick<drive_v3.Resource$Files, 'create' | 'delete' | 'get' | 'list'>

export type UploadedPhoto = {
  drivePath: string
  fileId: string
  mimeType: string
}

export interface PhotoStore {
  upload(file: File): Promise<UploadedPhoto>
  download(drivePath: string, knownFileId?: string): Promise<ReadableStream<Uint8Array>>
  delete(drivePath: string, knownFileId?: string): Promise<void>
  deleteById(fileId: string): Promise<void>
}

export class DriveConfigurationError extends Error {
  constructor() {
    super('Google Drive photo storage is not configured.');
    this.name = 'DriveConfigurationError';
  }
}

export class DrivePhotoNotFoundError extends Error {
  constructor(drivePath: string) {
    super(`Google Drive photo not found: ${drivePath}`);
    this.name = 'DrivePhotoNotFoundError';
  }
}

function escapeDriveQueryValue(value: string) {
  return value.replaceAll('\\', '\\\\').replaceAll("'", "\\'");
}

function queryForFolder(name: string, parentId: string) {
  return [
    `name = '${escapeDriveQueryValue(name)}'`,
    `mimeType = '${FOLDER_MIME_TYPE}'`,
    'trashed = false',
    `'${parentId}' in parents`,
  ].join(' and ');
}

function queryForFile(name: string, parentId: string) {
  return [
    `name = '${escapeDriveQueryValue(name)}'`,
    'trashed = false',
    `'${parentId}' in parents`,
  ].join(' and ');
}

function fileId(file: drive_v3.Schema$File | undefined) {
  return file?.id ?? undefined;
}

function photoFileName(drivePath: string, rootPath: string) {
  const pathSegments = drivePath.split('/');
  const rootSegments = rootPath.split('/');
  const rootLeaf = rootSegments.at(-1);
  if (
    pathSegments.length !== 2 ||
    pathSegments[0] !== rootLeaf ||
    !pathSegments[1] ||
    !/^[a-zA-Z0-9._-]+$/.test(pathSegments[1])
  ) {
    throw new DrivePhotoNotFoundError(drivePath);
  }
  return pathSegments[1];
}

export function createPhotoStore(drive: DriveFilesApi, photosRoot: string): PhotoStore {
  const rootSegments = photosRoot.split('/').filter(Boolean);
  if (rootSegments.length === 0) {
    throw new DriveConfigurationError();
  }

  async function findFolderId(name: string, parentId: string) {
    const response = await drive.list({
      fields: 'files(id,name)',
      pageSize: 1,
      q: queryForFolder(name, parentId),
      spaces: 'drive',
    });
    return fileId(response.data.files?.[0]);
  }

  async function getPhotosFolderId(createMissing: boolean) {
    let parentId = 'root';
    for (const segment of rootSegments) {
      let folderId = await findFolderId(segment, parentId);
      if (!folderId && createMissing) {
        const response = await drive.create({
          fields: 'id',
          requestBody: {
            name: segment,
            mimeType: FOLDER_MIME_TYPE,
            parents: [parentId],
          },
        });
        folderId = fileId(response.data);
      }
      if (!folderId) return undefined;
      parentId = folderId;
    }
    return parentId;
  }

  async function findFileId(drivePath: string) {
    const name = photoFileName(drivePath, photosRoot);
    const folderId = await getPhotosFolderId(false);
    if (!folderId) throw new DrivePhotoNotFoundError(drivePath);

    const response = await drive.list({
      fields: 'files(id,name,mimeType)',
      pageSize: 1,
      q: queryForFile(name, folderId),
      spaces: 'drive',
    });
    const id = fileId(response.data.files?.[0]);
    if (!id) throw new DrivePhotoNotFoundError(drivePath);
    return id;
  }

  return {
    async upload(file) {
      const bytes = Buffer.from(await file.arrayBuffer());
      const hash = createHash('md5').update(bytes).digest('hex');
      const name = `${hash}.jpg`;
      const folderId = await getPhotosFolderId(true);
      if (!folderId) throw new DriveConfigurationError();

      const response = await drive.create({
        fields: 'id,name,mimeType',
        media: {
          body: Readable.from(bytes),
          mimeType: 'application/octet-stream',
        },
        requestBody: { mimeType: file.type, name, parents: [folderId] },
        uploadType: 'multipart',
      });
      const uploadedFileId = fileId(response.data);
      if (!uploadedFileId) throw new Error('Google Drive did not return an uploaded file id.');

      return {
        drivePath: `${rootSegments.at(-1)}/${name}`,
        fileId: uploadedFileId,
        mimeType: file.type,
      };
    },

    async download(drivePath, knownFileId) {
      const response = await drive.get(
        { alt: 'media', fileId: knownFileId ?? await findFileId(drivePath) },
        { responseType: 'stream' },
      );
      return Readable.toWeb(response.data as Readable) as ReadableStream<Uint8Array>;
    },

    async delete(drivePath, knownFileId) {
      await this.deleteById(knownFileId ?? await findFileId(drivePath));
    },

    async deleteById(uploadedFileId) {
      await drive.delete({ fileId: uploadedFileId });
    },
  };
}

export function getPhotoStore(): PhotoStore {
  const config = driveConfigSchema.safeParse({
    clientId: process.env.GOOGLE_DRIVE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_DRIVE_CLIENT_SECRET,
    photosRoot: process.env.GOOGLE_DRIVE_PHOTOS_ROOT,
    refreshToken: process.env.GOOGLE_DRIVE_REFRESH_TOKEN,
  });
  if (!config.success) {
    throw new DriveConfigurationError();
  }

  const auth = new google.auth.OAuth2(config.data.clientId, config.data.clientSecret);
  auth.setCredentials({ refresh_token: config.data.refreshToken });
  const drive = google.drive({ version: 'v3', auth });
  return createPhotoStore(drive.files, config.data.photosRoot);
}
