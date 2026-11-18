import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { devToolsEnabled } from "~/server/membership/config";
import { currentIdentity } from "~/server/membership/identity";
import { verifyPayment } from "~/server/membership/payments";
import { ensureMembershipSeed } from "~/server/membership/seed";
import { getMembershipService } from "~/server/membership/service";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ planId: z.string().min(1) });

/**
 * DEVELOPMENT ONLY: complete a mock purchase for the current verified identity.
 *
 * Lets a developer (or a smoke test) confirm the whole real stack — ledger,
 * membership grant, access gating — without a browser wallet or clicking through
 * the UI. Refuses to run outside development or without a verified identity.
 *
 *   curl -k -X POST https://localhost:8443/api/membership/dev/mock-purchase \
 *        --cert ... --key ... -H 'content-type: application/json' \
 *        -d '{"planId":"plan_supporter_monthly"}'
 */
export async function POST(request: Request) {
  if (!devToolsEnabled()) {
    return NextResponse.json(
      { ok: false, error: "Not found." },
      { status: 404 },
    );
  }

  const identity = await currentIdentity();
  if (!identity) {
    return NextResponse.json(
      { ok: false, error: "A verified DFRI-eID identity is required." },
      { status: 401 },
    );
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body." },
      { status: 400 },
    );
  }

  const parsed = bodySchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "planId is required." },
      { status: 400 },
    );
  }

  await ensureMembershipSeed();
  const service = getMembershipService();
  const plan = await service.getPlan(parsed.data.planId);
  if (!plan || !plan.active) {
    return NextResponse.json(
      { ok: false, error: "Unknown or inactive plan." },
      { status: 404 },
    );
  }

  const payment = await service.createPaymentIntent({
    subject: identity.subject,
    planId: plan.id,
    rail: "mock",
  });
  const result = await verifyPayment(
    service,
    payment.reference,
    identity.subject,
  );
  const access = await service.resolveAccess(identity.subject);

  revalidatePath("/internal");
  revalidatePath("/membership");

  return NextResponse.json({
    ok: result.confirmed,
    reference: payment.reference,
    message: result.message,
    membership: access
      ? {
          active: access.active,
          plan: access.plan?.name ?? null,
          startsAt: access.membership.startsAt,
          expiresAt: access.membership.expiresAt,
        }
      : null,
  });
}
