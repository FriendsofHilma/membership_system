"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getMembershipSession } from "~/server/membership/access";
import { renewalStacks } from "~/server/membership/config";
import { verifyPayment } from "~/server/membership/payments";
import {
  getMembershipService,
  MembershipError,
} from "~/server/membership/service";
import type { MemberRole } from "~/server/membership/types";

async function requireAdmin() {
  const session = await getMembershipSession();
  if (!session) redirect("/internal/login");
  if (!session.isAdmin) redirect("/internal?error=not-an-administrator");
  return session;
}

function field(formData: FormData, name: string): string {
  return String(formData.get(name) ?? "").trim();
}

/**
 * Finish an admin action: revalidate the affected pages and redirect with a
 * one-line result. Must be called *outside* try/catch because `redirect` throws.
 */
function finish(notice?: string, error?: string): never {
  revalidatePath("/internal/members");
  revalidatePath("/membership");
  revalidatePath("/internal");
  const params = new URLSearchParams();
  if (notice) params.set("notice", notice);
  if (error) params.set("error", error);
  const query = params.toString();
  redirect(`/internal/members${query ? `?${query}` : ""}`);
}

function messageOf(error: unknown, fallback: string): string {
  if (error instanceof MembershipError || error instanceof Error) {
    return error.message;
  }
  return fallback;
}

export async function grantMembershipAction(formData: FormData): Promise<void> {
  const session = await requireAdmin();
  const subject = field(formData, "subject");
  const planId = field(formData, "planId");
  const note = field(formData, "note");

  if (!subject) finish(undefined, "A DFRI-eID subject is required.");
  if (!planId) finish(undefined, "A plan is required.");

  let error: string | null = null;
  try {
    const service = getMembershipService();
    await service.grantManual({
      subject,
      planId,
      actor: session.identity.subject,
      note: note || null,
      stack: renewalStacks(),
    });
  } catch (cause) {
    error = messageOf(cause, "Could not grant the membership.");
  }

  if (error) finish(undefined, error);
  finish(`Membership granted to ${subject}.`);
}

export async function revokeMembershipAction(
  formData: FormData,
): Promise<void> {
  const session = await requireAdmin();
  const membershipId = field(formData, "membershipId");
  const reason = field(formData, "reason");

  if (!membershipId) finish(undefined, "Missing membership id.");
  if (!reason) {
    finish(
      undefined,
      "A revocation reason is required — it is kept in the audit log.",
    );
  }

  let error: string | null = null;
  try {
    const service = getMembershipService();
    await service.revokeMembership({
      membershipId,
      actor: session.identity.subject,
      reason,
    });
  } catch (cause) {
    error = messageOf(cause, "Could not revoke the membership.");
  }

  if (error) finish(undefined, error);
  finish("Membership revoked.");
}

export async function verifyPaymentAction(formData: FormData): Promise<void> {
  const session = await requireAdmin();
  const reference = field(formData, "reference");
  if (!reference) finish(undefined, "Missing payment reference.");

  let notice: string | null = null;
  let error: string | null = null;
  try {
    const service = getMembershipService();
    const result = await verifyPayment(
      service,
      reference,
      session.identity.subject,
    );
    notice = result.message;
  } catch (cause) {
    error = messageOf(cause, "Could not verify the payment.");
  }

  if (error) finish(undefined, error);
  finish(notice ?? "Payment checked.");
}

export async function setMemberRoleAction(formData: FormData): Promise<void> {
  const session = await requireAdmin();
  const memberId = field(formData, "memberId");
  const roleValue = field(formData, "role");
  if (roleValue !== "admin" && roleValue !== "member") {
    finish(undefined, "Unknown role.");
  }
  const role: MemberRole = roleValue;

  let error: string | null = null;
  try {
    const service = getMembershipService();
    await service.setMemberRole({
      memberId,
      role,
      actor: session.identity.subject,
    });
  } catch (cause) {
    error = messageOf(cause, "Could not set the role.");
  }

  if (error) finish(undefined, error);
  finish(`Role set to ${role}.`);
}
