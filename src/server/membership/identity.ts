import "server-only";

import { headers } from "next/headers";

import {
  getDfriEidIdentityFromHeaders,
  type DfriEidIdentity,
} from "~/lib/dfri-eid";

import { adminSubjects } from "./config";
import type { MemberRole } from "./types";

/** Verified DFRI-eID identity for the current request, if any. */
export async function currentIdentity(): Promise<DfriEidIdentity | null> {
  const requestHeaders = await headers();
  return getDfriEidIdentityFromHeaders(requestHeaders);
}

/**
 * Administration rights.
 *
 * Two independent sources, both explicit:
 *  1. `MEMBERSHIP_ADMIN_SUBJECTS` — bootstrap list, no database needed.
 *  2. `member.role === "admin"` — set by an existing administrator.
 *
 * If neither is present nobody is an administrator. This is intentional: the
 * prototype refuses to guess who should have financial privileges.
 */
export function isAdminSubject(
  subject: string | null | undefined,
  role?: MemberRole | null,
): boolean {
  if (!subject) return false;
  if (role === "admin") return true;
  return adminSubjects().includes(subject);
}
