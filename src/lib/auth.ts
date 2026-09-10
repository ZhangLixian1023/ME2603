import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";

export const sessionCookieName = "quiz_teacher_session";
const sessionPayload = "teacher-session-v1";

function secret() {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  if (process.env.NODE_ENV === "production") throw new Error("SESSION_SECRET must be set in production");
  return "local-demo-secret-change-before-deploy";
}

export function teacherPassword() {
  if (process.env.TEACHER_PASSWORD) return process.env.TEACHER_PASSWORD;
  if (process.env.NODE_ENV === "production") {
    throw new Error("TEACHER_PASSWORD must be set in production");
  }
  console.warn("[auth] TEACHER_PASSWORD env not set; using dev-only placeholder. Set it in .env for any real use.");
  return "dev-only-do-not-deploy";
}

export function createSessionToken() {
  const signature = createHmac("sha256", secret()).update(sessionPayload).digest("hex");
  return `${sessionPayload}.${signature}`;
}

export function isValidSession(request: NextRequest) {
  const actual = request.cookies.get(sessionCookieName)?.value || "";
  const expected = createSessionToken();
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}
