import "server-only";

import { CreateBucketCommand, DeleteObjectCommand, GetObjectCommand, HeadBucketCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

const previewObjects = new Map<string, { body: Buffer; contentType: string }>();
let client: S3Client | null = null;
let bucketReady: Promise<void> | null = null;

function bucket() { return process.env.MINIO_BUCKET || "quiz-files"; }

function s3() {
  client ||= new S3Client({
    region: "us-east-1",
    endpoint: process.env.MINIO_ENDPOINT || "http://127.0.0.1:9000",
    forcePathStyle: true,
    credentials: {
      accessKeyId: process.env.MINIO_ROOT_USER || "quizminio",
      secretAccessKey: process.env.MINIO_ROOT_PASSWORD || "change-this-minio-password",
    },
  });
  return client;
}

async function ensureBucket() {
  if (process.env.PREVIEW_MODE === "true") return;
  bucketReady ||= (async () => {
    try { await s3().send(new HeadBucketCommand({ Bucket: bucket() })); }
    catch { await s3().send(new CreateBucketCommand({ Bucket: bucket() })); }
  })();
  return bucketReady;
}

export async function putObject(key: string, body: Buffer, contentType: string) {
  if (process.env.PREVIEW_MODE === "true") { previewObjects.set(key, { body, contentType }); return; }
  await ensureBucket();
  await s3().send(new PutObjectCommand({ Bucket: bucket(), Key: key, Body: body, ContentType: contentType }));
}

export async function getObject(key: string) {
  if (process.env.PREVIEW_MODE === "true") return previewObjects.get(key) || null;
  await ensureBucket();
  try {
    const result = await s3().send(new GetObjectCommand({ Bucket: bucket(), Key: key }));
    if (!result.Body) return null;
    return { body: Buffer.from(await result.Body.transformToByteArray()), contentType: result.ContentType || "application/octet-stream" };
  } catch { return null; }
}

export async function deleteObject(key: string) {
  if (process.env.PREVIEW_MODE === "true") { previewObjects.delete(key); return; }
  await ensureBucket();
  await s3().send(new DeleteObjectCommand({ Bucket: bucket(), Key: key }));
}
