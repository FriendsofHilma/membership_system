import "server-only";

export const DFRI_SUBJECT_HEADER = "x-dfri-eid-subject";
export const DFRI_SUBJECT_DN_HEADER = "x-dfri-eid-subject-dn";
export const DFRI_SERIAL_HEADER = "x-dfri-eid-serial";
export const DFRI_ISSUER_HEADER = "x-dfri-eid-issuer";

export type DfriEidIdentity = {
  /** Certificate common name (prototype identity key). */
  subject: string;
  /** Full subject distinguished name. */
  subjectDn?: string;
  serial?: string;
  issuer?: string;
};

/**
 * Read a verified DFRI-eID identity from request headers.
 *
 * PROTOTYPE ONLY: these headers are trustworthy only when the request reached
 * this app exclusively via your controlled mTLS verifier/proxy (which must set
 * them on verified connections and strip/overwrite any client-supplied values).
 * Never rely on this for production without strict network/origin controls and a
 * proper session layer.
 */
export function getDfriEidIdentityFromHeaders(
  headers: Headers,
): DfriEidIdentity | null {
  const subject = headers.get(DFRI_SUBJECT_HEADER)?.trim();
  if (!subject) return null;
  const subjectDn = headers.get(DFRI_SUBJECT_DN_HEADER)?.trim() || undefined;
  const serial = headers.get(DFRI_SERIAL_HEADER)?.trim() || undefined;
  const issuer = headers.get(DFRI_ISSUER_HEADER)?.trim() || undefined;
  return { subject, subjectDn, serial, issuer };
}
