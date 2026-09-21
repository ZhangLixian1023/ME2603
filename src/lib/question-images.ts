import "server-only";

import { randomUUID } from "node:crypto";
import { deleteObject, putObject } from "./storage";

export const QUESTION_IMAGE_MAX_BYTES = 5 * 1024 * 1024;

export function isQuestionImageKey(value: unknown): value is string {
  return typeof value === "string" && /^quiz-questions\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function imageType(buffer: Buffer) {
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47 &&
    buffer[4] === 0x0d && buffer[5] === 0x0a && buffer[6] === 0x1a && buffer[7] === 0x0a
  ) return "image/png";
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";
  return null;
}

export async function saveQuestionImage(file: File) {
  if (!file.size || file.size > QUESTION_IMAGE_MAX_BYTES) throw new Error("INVALID_IMAGE_SIZE");
  const buffer = Buffer.from(await file.arrayBuffer());
  const contentType = imageType(buffer);
  if (!contentType) throw new Error("INVALID_IMAGE_TYPE");
  const key = `quiz-questions/${randomUUID()}`;
  await putObject(key, buffer, contentType);
  return key;
}

export async function deleteQuestionImages(keys: Array<string | null | undefined>) {
  const uniqueKeys = [...new Set(keys.filter(isQuestionImageKey))];
  await Promise.allSettled(uniqueKeys.map((key) => deleteObject(key)));
}
