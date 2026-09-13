import "server-only";

import { createHmac, randomBytes, pbkdf2Sync, timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";

export const sessionCookieName = "quiz_teacher_session";
export const studentSessionCookieName = "quiz_student_session";
const sessionPayload = "teacher-session-v1";

function secret() {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  if (process.env.NODE_ENV === "production") throw new Error("SESSION_SECRET must be set in production");
  return "local-demo-secret-change-before-deploy";
}

export function teacherPassword() {
  if (process.env.TEACHER_PASSWORD) return process.env.TEACHER_PASSWORD;
  if (process.env.NODE_ENV === "production") throw new Error("TEACHER_PASSWORD must be set in production");
  return "teacher123";
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

export function hashPassword(password: string, salt = randomBytes(16).toString("hex")) {
  const hash = pbkdf2Sync(password, salt, 210_000, 32, "sha256").toString("hex");
  return { salt, hash };
}

export function verifyPassword(password: string, salt: string, expectedHash: string) {
  const actual = Buffer.from(hashPassword(password, salt).hash, "hex");
  const expected = Buffer.from(expectedHash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export type StudentSessionIdentity = {
  studentId: string;
  name?: string;
  isGuest: boolean;
};

export function createStudentSessionToken(studentId: string, guestName?: string) {
  const payload = Buffer.from(JSON.stringify({ studentId, name: guestName, isGuest: Boolean(guestName), version: 2 })).toString("base64url");
  const signature = createHmac("sha256", secret()).update(`student.${payload}`).digest("base64url");
  return `${payload}.${signature}`;
}

export function studentIdentityFromToken(token: string): StudentSessionIdentity | null {
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;
  const expected = createHmac("sha256", secret()).update(`student.${payload}`).digest("base64url");
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length || !timingSafeEqual(actualBuffer, expectedBuffer)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { studentId?: string; name?: string; isGuest?: boolean };
    if (!parsed.studentId) return null;
    if (parsed.isGuest && !parsed.name) return null;
    return { studentId: parsed.studentId, name: parsed.name, isGuest: Boolean(parsed.isGuest) };
  } catch {
    return null;
  }
}

export function studentIdFromToken(token: string) {
  return studentIdentityFromToken(token)?.studentId || null;
}

export function studentIdFromSession(request: NextRequest) {
  return studentIdFromToken(request.cookies.get(studentSessionCookieName)?.value || "");
}

export function studentIdentityFromSession(request: NextRequest) {
  return studentIdentityFromToken(request.cookies.get(studentSessionCookieName)?.value || "");
}
