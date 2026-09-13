import "server-only";

import type { NextRequest } from "next/server";
import { studentIdentityFromSession, studentIdentityFromToken } from "./auth";
import { getStudent } from "./db";

export type AuthenticatedStudent = {
  studentId: string;
  name: string;
  isGuest: boolean;
};

async function resolveIdentity(identity: ReturnType<typeof studentIdentityFromToken>): Promise<AuthenticatedStudent | null> {
  if (!identity) return null;
  if (identity.isGuest && identity.name) return { studentId: identity.studentId, name: identity.name, isGuest: true };
  const student = await getStudent(identity.studentId);
  return student ? { ...student, isGuest: false } : null;
}

export function authenticatedStudentFromRequest(request: NextRequest) {
  return resolveIdentity(studentIdentityFromSession(request));
}

export function authenticatedStudentFromToken(token: string) {
  return resolveIdentity(studentIdentityFromToken(token));
}
