// S3 client + presigned URL helpers.
//
// SPEC.md §9: closet/raw, closet/tuned, selfies, ootd. The image pipeline
// uses presigned PUTs for client uploads (closet raw, selfies) and presigned
// GETs for short-lived friend-scoped reads.

import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  HeadObjectCommand,
  type HeadObjectCommandOutput,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { config } from './config';

let _s3: S3Client | undefined;

/** Memoised S3Client — one per warm Lambda container. */
export function getS3(): S3Client {
  if (!_s3) {
    _s3 = new S3Client({ region: config.region });
  }
  return _s3;
}

/** Presigned PUT — used by clients to upload directly to S3. */
export async function presignedPut(
  bucket: string,
  key: string,
  expiresInSec: number,
  contentType?: string,
): Promise<string> {
  const cmd = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    ...(contentType ? { ContentType: contentType } : {}),
  });
  return getSignedUrl(getS3(), cmd, { expiresIn: expiresInSec });
}

/** Presigned GET — short-lived signed URL for reading an object. */
export async function presignedGet(
  bucket: string,
  key: string,
  expiresInSec: number,
): Promise<string> {
  const cmd = new GetObjectCommand({ Bucket: bucket, Key: key });
  return getSignedUrl(getS3(), cmd, { expiresIn: expiresInSec });
}

/** HEAD an object — used to check existence / fetch metadata. */
export async function headObject(
  bucket: string,
  key: string,
): Promise<HeadObjectCommandOutput | undefined> {
  try {
    return await getS3().send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
  } catch (err) {
    const status = (err as { $metadata?: { httpStatusCode?: number } }).$metadata
      ?.httpStatusCode;
    if (status === 404) return undefined;
    throw err;
  }
}

/** Test seam. */
export function __resetS3ForTests(): void {
  _s3 = undefined;
}
