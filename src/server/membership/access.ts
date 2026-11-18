import "server-only";

import type { DfriEidIdentity } from "~/lib/dfri-eid";

import { currentIdentity, isAdminSubject } from "./identity";
import { ensureMembershipSeed } from "./seed";
import { getMembershipService, type AccessResolution } from "./service";
import type { Member } from "./types";

export type MembershipSession = {
  identity: DfriEidIdentity;
  member: Member | null;
  access: AccessResolution | null;
  isAdmin: boolean;
  hasActiveMembership: boolean;
};

/**
 * Resolve the current request into a membership session.
 *
 * Returns `null` when the request has no verified DFRI-eID identity. The
 * middleware already redirects such requests, but pages and server actions must
 * re-check because middleware is not a security boundary for server actions.
 */
export async function getMembershipSession(): Promise<MembershipSession | null> {
  const identity = await currentIdentity();
  if (!identity) return null;

  await ensureMembershipSeed();
  const service = getMembershipService();
  const member = await service.getMemberBySubject(identity.subject);
  const access = await service.resolveAccess(identity.subject);

  return {
    identity,
    member,
    access,
    isAdmin: isAdminSubject(identity.subject, member?.role ?? null),
    hasActiveMembership: Boolean(access?.active),
  };
}

/** Access to the member area: an active membership, or an administrator. */
export function mayEnterInternal(session: MembershipSession | null): boolean {
  if (!session) return false;
  return session.hasActiveMembership || session.isAdmin;
}
