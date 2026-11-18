"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getMembershipSession } from "~/server/membership/access";
import { hotEvmConfig } from "~/server/membership/config";
import {
  createHotEvmIntent,
  getRailInfo,
  verifyPayment,
} from "~/server/membership/payments";
import {
  getMembershipService,
  MembershipError,
} from "~/server/membership/service";

import type {
  PaymentActionResult,
  StartCheckoutResult,
} from "./checkout-types";

const startSchema = z.object({
  planId: z.string().min(1),
  rail: z.enum(["mock", "hot-evm", "holofuel", "manual"]),
});

const referenceSchema = z.object({ reference: z.string().min(1) });

const submittedSchema = z.object({
  reference: z.string().min(1),
  txHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/, "Invalid transaction hash."),
  payerAddress: z
    .string()
    .regex(/^0x[0-9a-fA-F]{40}$/, "Invalid wallet address."),
});

function describeError(error: unknown): string {
  if (error instanceof MembershipError) return error.message;
  if (error instanceof Error) return error.message;
  return "Something went wrong.";
}

async function requireSession() {
  const session = await getMembershipSession();
  if (!session) {
    throw new Error("Sign in with DFRI-eID before purchasing a membership.");
  }
  return session;
}

export async function startCheckoutAction(
  input: unknown,
): Promise<StartCheckoutResult> {
  const parsed = startSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid checkout request." };

  try {
    const session = await requireSession();
    const { planId, rail } = parsed.data;

    const railInfo = getRailInfo(rail);
    if (!railInfo.available) {
      return {
        ok: false,
        error: railInfo.reason ?? "This payment rail is unavailable.",
      };
    }

    const service = getMembershipService();

    if (rail === "holofuel" || rail === "manual") {
      return {
        ok: false,
        error: railInfo.reason ?? "This rail is not available.",
      };
    }

    if (rail === "hot-evm") {
      const { payment } = await createHotEvmIntent(service, {
        subject: session.identity.subject,
        planId,
      });
      const config = hotEvmConfig();
      return {
        ok: true,
        reference: payment.reference,
        amountDisplay: payment.amountDisplay,
        instructions: {
          kind: "evm-erc20",
          chainId: config.chainId,
          networkName: config.networkName,
          tokenAddress: payment.tokenAddress ?? "",
          recipient: payment.recipientAddress ?? "",
          amountMinor: payment.amountMinor,
          decimals: config.tokenDecimals,
          minConfirmations: config.minConfirmations,
          explorerUrl: config.explorerUrl,
          rpcUrl: config.rpcUrl,
        },
      };
    }

    const payment = await service.createPaymentIntent({
      subject: session.identity.subject,
      planId,
      rail: "mock",
    });

    return {
      ok: true,
      reference: payment.reference,
      amountDisplay: payment.amountDisplay,
      instructions: { kind: "mock" },
    };
  } catch (error) {
    return { ok: false, error: describeError(error) };
  }
}

/** Development-only: treat a mock intent as paid. */
export async function confirmMockPaymentAction(
  input: unknown,
): Promise<PaymentActionResult> {
  const parsed = referenceSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: "Invalid payment reference." };

  try {
    const session = await requireSession();
    const service = getMembershipService();
    const existing = await service.getPaymentByReference(parsed.data.reference);
    if (!existing) return { ok: false, error: "Unknown payment reference." };
    if (existing.memberId !== session.member?.id) {
      return { ok: false, error: "This payment belongs to another member." };
    }

    const result = await verifyPayment(
      service,
      parsed.data.reference,
      session.identity.subject,
    );

    revalidatePath("/membership");
    revalidatePath("/internal");
    return {
      ok: true,
      confirmed: result.confirmed,
      message: result.message,
      reference: parsed.data.reference,
    };
  } catch (error) {
    return { ok: false, error: describeError(error) };
  }
}

/**
 * Record the transaction hash a member's wallet produced, then verify it on
 * chain. The client cannot confirm its own payment: only the server decides.
 */
export async function submitHotPaymentAction(
  input: unknown,
): Promise<PaymentActionResult> {
  const parsed = submittedSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid payment details.",
    };
  }

  try {
    const session = await requireSession();
    const service = getMembershipService();
    const payment = await service.getPaymentByReference(parsed.data.reference);
    if (!payment) return { ok: false, error: "Unknown payment reference." };
    if (payment.memberId !== session.member?.id) {
      return { ok: false, error: "This payment belongs to another member." };
    }

    await service.markSubmitted({
      reference: parsed.data.reference,
      txHash: parsed.data.txHash,
      payerAddress: parsed.data.payerAddress.toLowerCase(),
    });

    const result = await verifyPayment(
      service,
      parsed.data.reference,
      session.identity.subject,
    );

    revalidatePath("/membership");
    revalidatePath("/internal");
    return {
      ok: true,
      confirmed: result.confirmed,
      message: result.message,
      reference: parsed.data.reference,
    };
  } catch (error) {
    return { ok: false, error: describeError(error) };
  }
}

/** Re-check a pending payment (e.g. after waiting for confirmations). */
export async function refreshPaymentAction(
  input: unknown,
): Promise<PaymentActionResult> {
  const parsed = referenceSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: "Invalid payment reference." };

  try {
    const session = await requireSession();
    const service = getMembershipService();
    const payment = await service.getPaymentByReference(parsed.data.reference);
    if (!payment) return { ok: false, error: "Unknown payment reference." };
    if (payment.memberId !== session.member?.id) {
      return { ok: false, error: "This payment belongs to another member." };
    }

    const result = await verifyPayment(
      service,
      parsed.data.reference,
      session.identity.subject,
    );

    revalidatePath("/membership");
    revalidatePath("/internal");
    return {
      ok: true,
      confirmed: result.confirmed,
      message: result.message,
      reference: parsed.data.reference,
    };
  } catch (error) {
    return { ok: false, error: describeError(error) };
  }
}
