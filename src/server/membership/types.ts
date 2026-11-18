/**
 * Membership domain types.
 *
 * Everything here is deliberately independent of any payment rail. A payment
 * rail only decides *how* a payment is proven; the membership itself is granted
 * by the domain rules in `repository.ts`.
 *
 * NOTE: all monetary values are stored as integer strings in the currency's
 * smallest unit ("minor units"), e.g. 1.5 HOT with 18 decimals is
 * "1500000000000000000". This avoids floating point rounding in financial data.
 */

export const PLAN_INTERVALS = ["month", "year", "lifetime"] as const;
export type PlanInterval = (typeof PLAN_INTERVALS)[number];

export const PAYMENT_RAILS = ["mock", "hot-evm", "holofuel", "manual"] as const;
export type PaymentRailId = (typeof PAYMENT_RAILS)[number];

export type MemberRole = "member" | "admin";

export type PaymentStatus =
  "pending" | "submitted" | "confirmed" | "failed" | "expired";

export type MembershipStatus = "active" | "expired" | "revoked";

export type Plan = {
  id: string;
  /** Stable machine code, e.g. "supporter-monthly". */
  code: string;
  name: string;
  description: string;
  /** Decimal amount as written by a human, e.g. "1.50". */
  amount: string;
  /** Unit symbol, e.g. "HOT" or "HOLOFUEL". */
  currency: string;
  interval: PlanInterval;
  /** Access length granted per payment. `null` means lifetime (no expiry). */
  durationDays: number | null;
  active: boolean;
  /**
   * True while the amount is a development placeholder. Unapproved pricing must
   * never be presented as real. See docs/membership.md.
   */
  isPlaceholder: boolean;
  createdAt: string;
  updatedAt: string;
};

export type Member = {
  id: string;
  /** DFRI-eID certificate common name. The stable identity key in this prototype. */
  dfriSubject: string;
  displayName: string | null;
  email: string | null;
  role: MemberRole;
  createdAt: string;
  updatedAt: string;
  notes: string | null;
};

export type Payment = {
  id: string;
  /** Public reference shown to the member and used to look the intent up. */
  reference: string;
  memberId: string;
  planId: string;
  rail: PaymentRailId;
  status: PaymentStatus;
  /** Integer amount in the currency's smallest unit. */
  amountMinor: string;
  currency: string;
  /** Human-readable snapshot of what was charged (audit trail). */
  amountDisplay: string;
  payerAddress: string | null;
  recipientAddress: string | null;
  tokenAddress: string | null;
  chainId: number | null;
  txHash: string | null;
  /** EVM block at which the intent was created (log scan lower bound). */
  startBlock: string | null;
  confirmations: number | null;
  failureReason: string | null;
  createdAt: string;
  submittedAt: string | null;
  verifiedAt: string | null;
};

export type Membership = {
  id: string;
  memberId: string;
  planId: string;
  paymentId: string | null;
  status: MembershipStatus;
  startsAt: string;
  /** `null` means lifetime. */
  expiresAt: string | null;
  revokedAt: string | null;
  revokedReason: string | null;
  createdAt: string;
};

export type AuditEvent = {
  id: string;
  at: string;
  /** DFRI subject, or "system" for automated actions. */
  actor: string;
  /** Dotted action name, e.g. "payment.confirmed". */
  action: string;
  targetType: "member" | "payment" | "membership" | "plan";
  targetId: string;
  detail: Record<string, string | number | boolean | null>;
};

export type MembershipSnapshot = {
  version: 1;
  plans: Plan[];
  members: Member[];
  payments: Payment[];
  memberships: Membership[];
  events: AuditEvent[];
};

export function emptySnapshot(): MembershipSnapshot {
  return {
    version: 1,
    plans: [],
    members: [],
    payments: [],
    memberships: [],
    events: [],
  };
}
