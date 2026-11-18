import "server-only";

import { parseDecimalToMinor } from "./money";
import type { MembershipStore } from "./store";
import { getDefaultStore, MemoryStore } from "./store";
import type {
  AuditEvent,
  Member,
  MemberRole,
  Membership,
  MembershipSnapshot,
  Payment,
  PaymentRailId,
  Plan,
} from "./types";

const DAY_MS = 24 * 60 * 60 * 1000;

export type AccessResolution = {
  member: Member;
  membership: Membership;
  plan: Plan | null;
  active: boolean;
};

export type CreateIntentInput = {
  subject: string;
  planId: string;
  rail: PaymentRailId;
  now?: Date;
  /** Rail-specific snapshot stored on the payment for later verification. */
  evm?: {
    chainId: number;
    tokenAddress: string;
    recipientAddress: string;
    decimals: number;
    startBlock: string;
  };
};

export type VerificationOutcome =
  | {
      status: "confirmed";
      txHash: string;
      confirmations: number;
      payerAddress?: string | null;
    }
  | { status: "pending"; reason: string }
  | { status: "failed"; reason: string };

function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
}

function nowIso(now: Date): string {
  return now.toISOString();
}

function currencyDecimalsFor(rail: PaymentRailId): number {
  // The EVM rail always passes the token's real decimals via `input.evm`.
  return rail === "hot-evm" ? 18 : 6;
}

function isUnexpired(membership: Membership, now: Date): boolean {
  if (membership.status !== "active") return false;
  if (membership.expiresAt === null) return true;
  return Date.parse(membership.expiresAt) > now.getTime();
}

function latestExpiry(memberships: Membership[], now: Date): Date | null {
  let latest: Date | null = null;
  for (const membership of memberships) {
    if (!isUnexpired(membership, now)) continue;
    if (membership.expiresAt === null) return null; // lifetime
    const expiry = new Date(membership.expiresAt);
    if (!latest || expiry > latest) latest = expiry;
  }
  return latest;
}

export class MembershipError extends Error {
  readonly code:
    | "plan_not_found"
    | "plan_inactive"
    | "payment_not_found"
    | "invalid_transition"
    | "already_confirmed"
    | "duplicate_tx"
    | "membership_not_found"
    | "rail_unavailable";

  constructor(code: MembershipError["code"], message: string) {
    super(message);
    this.name = "MembershipError";
    this.code = code;
  }
}

function trimLog(draft: MembershipSnapshot): void {
  // Keep the audit log append-only but bounded for the prototype.
  if (draft.events.length > 5000) {
    draft.events.splice(0, draft.events.length - 5000);
  }
}

export function createMembershipService(store: MembershipStore) {
  async function getOrCreateMember(
    subject: string,
    displayName?: string | null,
  ): Promise<Member> {
    const trimmed = subject.trim();
    if (!trimmed) throw new Error("A DFRI-eID subject is required.");
    return store.update((draft) => {
      const existing = draft.members.find((m) => m.dfriSubject === trimmed);
      if (existing) return existing;
      const at = new Date().toISOString();
      const member: Member = {
        id: newId("mem"),
        dfriSubject: trimmed,
        displayName: displayName ?? null,
        email: null,
        role: "member",
        createdAt: at,
        updatedAt: at,
        notes: null,
      };
      draft.members.push(member);
      draft.events.push({
        id: newId("evt"),
        at,
        actor: trimmed,
        action: "member.created",
        targetType: "member",
        targetId: member.id,
        detail: { dfriSubject: trimmed },
      });
      return member;
    });
  }

  async function getMemberBySubject(subject: string): Promise<Member | null> {
    const snapshot = await store.read();
    return (
      snapshot.members.find((m) => m.dfriSubject === subject.trim()) ?? null
    );
  }

  async function getPlan(planId: string): Promise<Plan | null> {
    const snapshot = await store.read();
    return snapshot.plans.find((p) => p.id === planId) ?? null;
  }

  async function listPlans(includeInactive = false): Promise<Plan[]> {
    const snapshot = await store.read();
    return snapshot.plans
      .filter((plan) => includeInactive || plan.active)
      .sort((a, b) =>
        a.amount.localeCompare(b.amount, undefined, { numeric: true }),
      );
  }

  function createMembershipFor(
    draft: MembershipSnapshot,
    input: {
      memberId: string;
      plan: Plan;
      paymentId: string | null;
      now: Date;
      actor: string;
      stack: boolean;
    },
  ): Membership {
    const { memberId, plan, paymentId, now, actor, stack } = input;

    let startsAt = now;
    if (stack && plan.durationDays !== null) {
      const existing = draft.memberships.filter((m) => m.memberId === memberId);
      const latest = latestExpiry(existing, now);
      if (latest) startsAt = latest;
    }

    const expiresAt =
      plan.durationDays === null
        ? null
        : new Date(startsAt.getTime() + plan.durationDays * DAY_MS);

    const membership: Membership = {
      id: newId("msh"),
      memberId,
      planId: plan.id,
      paymentId,
      status: "active",
      startsAt: startsAt.toISOString(),
      expiresAt: expiresAt ? expiresAt.toISOString() : null,
      revokedAt: null,
      revokedReason: null,
      createdAt: now.toISOString(),
    };
    draft.memberships.push(membership);
    draft.events.push({
      id: newId("evt"),
      at: now.toISOString(),
      actor,
      action: "membership.granted",
      targetType: "membership",
      targetId: membership.id,
      detail: {
        memberId,
        planId: plan.id,
        paymentId,
        startsAt: membership.startsAt,
        expiresAt: membership.expiresAt,
      },
    });
    return membership;
  }

  async function createPaymentIntent(
    input: CreateIntentInput,
  ): Promise<Payment> {
    const plan = await getPlan(input.planId);
    if (!plan) throw new MembershipError("plan_not_found", "Unknown plan.");
    if (!plan.active) {
      throw new MembershipError("plan_inactive", "This plan is not available.");
    }

    const now = input.now ?? new Date();
    const decimals = input.evm?.decimals ?? currencyDecimalsFor(input.rail);
    const amountMinor = parseDecimalToMinor(plan.amount, decimals);
    const member = await getOrCreateMember(input.subject);

    return store.update((draft) => {
      let reference = "";
      do {
        reference = `FOH-${now.getTime().toString(36).toUpperCase()}-${crypto
          .randomUUID()
          .slice(0, 4)
          .toUpperCase()}`;
      } while (draft.payments.some((p) => p.reference === reference));

      const payment: Payment = {
        id: newId("pay"),
        reference,
        memberId: member.id,
        planId: plan.id,
        rail: input.rail,
        status: "pending",
        amountMinor: amountMinor.toString(),
        currency: plan.currency,
        amountDisplay: `${plan.amount} ${plan.currency}`,
        payerAddress: null,
        recipientAddress: input.evm?.recipientAddress ?? null,
        tokenAddress: input.evm?.tokenAddress ?? null,
        chainId: input.evm?.chainId ?? null,
        txHash: null,
        startBlock: input.evm?.startBlock ?? null,
        confirmations: null,
        failureReason: null,
        createdAt: now.toISOString(),
        submittedAt: null,
        verifiedAt: null,
      };
      draft.payments.push(payment);
      draft.events.push({
        id: newId("evt"),
        at: now.toISOString(),
        actor: input.subject,
        action: "payment.created",
        targetType: "payment",
        targetId: payment.id,
        detail: {
          reference: payment.reference,
          planId: plan.id,
          rail: payment.rail,
          amountMinor: payment.amountMinor,
          currency: payment.currency,
        },
      });
      trimLog(draft);
      return payment;
    });
  }

  async function getPaymentByReference(
    reference: string,
  ): Promise<Payment | null> {
    const snapshot = await store.read();
    return snapshot.payments.find((p) => p.reference === reference) ?? null;
  }

  async function markSubmitted(input: {
    reference: string;
    txHash: string;
    payerAddress: string | null;
    now?: Date;
  }): Promise<Payment> {
    const now = input.now ?? new Date();
    return store.update((draft) => {
      const payment = draft.payments.find(
        (p) => p.reference === input.reference,
      );
      if (!payment)
        throw new MembershipError("payment_not_found", "Unknown payment.");
      if (payment.status === "confirmed") {
        throw new MembershipError(
          "already_confirmed",
          "Payment is already confirmed.",
        );
      }
      if (payment.status === "failed" || payment.status === "expired") {
        throw new MembershipError(
          "invalid_transition",
          "This payment can no longer accept a transaction.",
        );
      }
      payment.txHash = input.txHash;
      payment.payerAddress = input.payerAddress;
      payment.status = "submitted";
      payment.submittedAt = now.toISOString();
      return payment;
    });
  }

  async function applyVerification(
    reference: string,
    outcome: VerificationOutcome,
    options: { actor: string; now?: Date; stack?: boolean },
  ): Promise<{ payment: Payment; membership: Membership | null }> {
    const now = options.now ?? new Date();

    return store.update((draft) => {
      const payment = draft.payments.find((p) => p.reference === reference);
      if (!payment)
        throw new MembershipError("payment_not_found", "Unknown payment.");

      if (payment.status === "confirmed") {
        const existing =
          draft.memberships.find((m) => m.paymentId === payment.id) ?? null;
        return { payment, membership: existing };
      }

      if (outcome.status === "pending") {
        payment.status = "submitted";
        payment.failureReason = outcome.reason;
        return { payment, membership: null };
      }

      if (outcome.status === "failed") {
        payment.status = "failed";
        payment.failureReason = outcome.reason;
        draft.events.push({
          id: newId("evt"),
          at: now.toISOString(),
          actor: options.actor,
          action: "payment.failed",
          targetType: "payment",
          targetId: payment.id,
          detail: { reference, reason: outcome.reason },
        });
        return { payment, membership: null };
      }

      // Guard against the same on-chain transaction paying twice.
      const duplicate = draft.payments.find(
        (p) =>
          p.id !== payment.id &&
          p.txHash !== null &&
          p.txHash.toLowerCase() === outcome.txHash.toLowerCase(),
      );
      if (duplicate) {
        throw new MembershipError(
          "duplicate_tx",
          "This transaction has already been used for another payment.",
        );
      }

      const plan = draft.plans.find((p) => p.id === payment.planId);
      if (!plan)
        throw new MembershipError("plan_not_found", "Plan no longer exists.");

      payment.status = "confirmed";
      payment.txHash = outcome.txHash;
      payment.payerAddress = outcome.payerAddress ?? payment.payerAddress;
      payment.confirmations = outcome.confirmations;
      payment.verifiedAt = now.toISOString();
      payment.failureReason = null;

      const membership = createMembershipFor(draft, {
        memberId: payment.memberId,
        plan,
        paymentId: payment.id,
        now,
        actor: options.actor,
        stack: options.stack ?? true,
      });

      draft.events.push({
        id: newId("evt"),
        at: now.toISOString(),
        actor: options.actor,
        action: "payment.confirmed",
        targetType: "payment",
        targetId: payment.id,
        detail: {
          reference,
          txHash: outcome.txHash,
          confirmations: outcome.confirmations,
        },
      });

      return { payment, membership };
    });
  }

  async function grantManual(input: {
    subject: string;
    planId: string;
    actor: string;
    note?: string | null;
    now?: Date;
    stack?: boolean;
  }): Promise<{ member: Member; payment: Payment; membership: Membership }> {
    const plan = await getPlan(input.planId);
    if (!plan) throw new MembershipError("plan_not_found", "Unknown plan.");
    const member = await getOrCreateMember(input.subject);
    const now = input.now ?? new Date();

    return store.update((draft) => {
      const payment: Payment = {
        id: newId("pay"),
        reference: `MANUAL-${now.getTime().toString(36).toUpperCase()}-${crypto
          .randomUUID()
          .slice(0, 4)
          .toUpperCase()}`,
        memberId: member.id,
        planId: plan.id,
        rail: "manual",
        status: "confirmed",
        amountMinor: parseDecimalToMinor(
          plan.amount,
          currencyDecimalsFor("manual"),
        ).toString(),
        currency: plan.currency,
        amountDisplay: `${plan.amount} ${plan.currency} (manual)`,
        payerAddress: null,
        recipientAddress: null,
        tokenAddress: null,
        chainId: null,
        txHash: null,
        startBlock: null,
        confirmations: null,
        failureReason: null,
        createdAt: now.toISOString(),
        submittedAt: now.toISOString(),
        verifiedAt: now.toISOString(),
      };
      draft.payments.push(payment);

      const membership = createMembershipFor(draft, {
        memberId: member.id,
        plan,
        paymentId: payment.id,
        now,
        actor: input.actor,
        stack: input.stack ?? true,
      });

      draft.events.push({
        id: newId("evt"),
        at: now.toISOString(),
        actor: input.actor,
        action: "payment.granted_manually",
        targetType: "payment",
        targetId: payment.id,
        detail: {
          reference: payment.reference,
          memberId: member.id,
          planId: plan.id,
          note: input.note ?? null,
        },
      });

      return { member, payment, membership };
    });
  }

  async function revokeMembership(input: {
    membershipId: string;
    actor: string;
    reason: string;
    now?: Date;
  }): Promise<Membership> {
    const now = input.now ?? new Date();
    return store.update((draft) => {
      const membership = draft.memberships.find(
        (m) => m.id === input.membershipId,
      );
      if (!membership) {
        throw new MembershipError(
          "membership_not_found",
          "Unknown membership.",
        );
      }
      membership.status = "revoked";
      membership.revokedAt = now.toISOString();
      membership.revokedReason = input.reason;
      draft.events.push({
        id: newId("evt"),
        at: now.toISOString(),
        actor: input.actor,
        action: "membership.revoked",
        targetType: "membership",
        targetId: membership.id,
        detail: { reason: input.reason },
      });
      return membership;
    });
  }

  async function setMemberRole(input: {
    memberId: string;
    role: MemberRole;
    actor: string;
    now?: Date;
  }): Promise<Member> {
    const now = input.now ?? new Date();
    return store.update((draft) => {
      const member = draft.members.find((m) => m.id === input.memberId);
      if (!member)
        throw new MembershipError("membership_not_found", "Unknown member.");
      const previous = member.role;
      member.role = input.role;
      member.updatedAt = now.toISOString();
      draft.events.push({
        id: newId("evt"),
        at: now.toISOString(),
        actor: input.actor,
        action: "member.role_changed",
        targetType: "member",
        targetId: member.id,
        detail: { from: previous, to: input.role },
      });
      return member;
    });
  }

  /** Mark time-expired memberships as expired. Returns number changed. */
  async function sweepExpired(now = new Date()): Promise<number> {
    return store.update((draft) => {
      let changed = 0;
      for (const membership of draft.memberships) {
        if (membership.status !== "active") continue;
        if (
          membership.expiresAt &&
          Date.parse(membership.expiresAt) <= now.getTime()
        ) {
          membership.status = "expired";
          changed += 1;
        }
      }
      return changed;
    });
  }

  async function resolveAccess(
    subject: string,
    now = new Date(),
  ): Promise<AccessResolution | null> {
    const snapshot = await store.read();
    const member = snapshot.members.find(
      (m) => m.dfriSubject === subject.trim(),
    );
    if (!member) return null;

    const memberships = snapshot.memberships
      .filter((m) => m.memberId === member.id && m.status === "active")
      .sort((a, b) => {
        if (a.expiresAt === null) return -1;
        if (b.expiresAt === null) return 1;
        return Date.parse(b.expiresAt) - Date.parse(a.expiresAt);
      });

    const membership = memberships[0] ?? null;
    if (!membership) return null;

    const plan = snapshot.plans.find((p) => p.id === membership.planId) ?? null;
    return {
      member,
      membership,
      plan,
      active: isUnexpired(membership, now),
    };
  }

  async function listMembershipsFor(memberId: string): Promise<Membership[]> {
    const snapshot = await store.read();
    return snapshot.memberships
      .filter((m) => m.memberId === memberId)
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  }

  async function listPaymentsFor(memberId: string): Promise<Payment[]> {
    const snapshot = await store.read();
    return snapshot.payments
      .filter((p) => p.memberId === memberId)
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  }

  async function listMembers(): Promise<Member[]> {
    const snapshot = await store.read();
    return [...snapshot.members].sort(
      (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt),
    );
  }

  async function listAllPayments(): Promise<Payment[]> {
    const snapshot = await store.read();
    return [...snapshot.payments].sort(
      (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt),
    );
  }

  async function listEvents(limit = 50): Promise<AuditEvent[]> {
    const snapshot = await store.read();
    return snapshot.events.slice(-limit).reverse();
  }

  async function snapshot(): Promise<MembershipSnapshot> {
    return store.read();
  }

  /**
   * Insert seed plans, or update ones that already exist by `code`.
   *
   * Updating is intentional: plan definitions live in code until there is a
   * plan editor, so a changed price must reach an existing ledger. The plan `id`
   * and `createdAt` are preserved because memberships reference them.
   */
  async function ensureSeed(
    plans: Omit<Plan, "createdAt" | "updatedAt">[],
  ): Promise<void> {
    if (plans.length === 0) return;
    const current = await store.read();

    const changed = plans.some((seed) => {
      const existing = current.plans.find((plan) => plan.code === seed.code);
      if (!existing) return true;
      return (
        existing.name !== seed.name ||
        existing.description !== seed.description ||
        existing.amount !== seed.amount ||
        existing.currency !== seed.currency ||
        existing.interval !== seed.interval ||
        existing.durationDays !== seed.durationDays ||
        existing.active !== seed.active ||
        existing.isPlaceholder !== seed.isPlaceholder
      );
    });
    if (!changed) return;

    const at = new Date().toISOString();
    await store.update((draft) => {
      for (const seed of plans) {
        const existing = draft.plans.find((plan) => plan.code === seed.code);
        if (!existing) {
          draft.plans.push({ ...seed, createdAt: at, updatedAt: at });
          continue;
        }
        existing.name = seed.name;
        existing.description = seed.description;
        existing.amount = seed.amount;
        existing.currency = seed.currency;
        existing.interval = seed.interval;
        existing.durationDays = seed.durationDays;
        existing.active = seed.active;
        existing.isPlaceholder = seed.isPlaceholder;
        existing.updatedAt = at;
      }
    });
  }

  return {
    store,
    getOrCreateMember,
    getMemberBySubject,
    listMembers,
    setMemberRole,
    getPlan,
    listPlans,
    ensureSeed,
    createPaymentIntent,
    getPaymentByReference,
    listPaymentsFor,
    listAllPayments,
    markSubmitted,
    applyVerification,
    grantManual,
    revokeMembership,
    sweepExpired,
    resolveAccess,
    listMembershipsFor,
    listEvents,
    snapshot,
  };
}

export type MembershipService = ReturnType<typeof createMembershipService>;

let defaultService: MembershipService | null = null;

export function getMembershipService(): MembershipService {
  if (!defaultService) {
    defaultService = createMembershipService(getDefaultStore());
  }
  return defaultService;
}

/** Test helper: an isolated in-memory service. */
export function createInMemoryService(): MembershipService {
  return createMembershipService(new MemoryStore());
}
