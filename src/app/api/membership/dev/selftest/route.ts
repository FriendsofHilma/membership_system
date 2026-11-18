import { NextResponse } from "next/server";

import { currentIdentity } from "~/server/membership/identity";
import { devToolsEnabled } from "~/server/membership/config";
import {
  formatMinorToDecimal,
  parseDecimalToMinor,
} from "~/server/membership/money";
import { planSeeds } from "~/server/membership/seed";
import { createInMemoryService } from "~/server/membership/service";

export const dynamic = "force-dynamic";

/**
 * Development-only self test for the membership domain.
 *
 * Runs the whole grant/revoke/duplicate/expiry logic against an isolated
 * in-memory store, so it never touches the real ledger. Requires a verified
 * DFRI-eID identity *and* MEMBERSHIP_ENABLE_DEV_TOOLS=true.
 *
 *   curl -k --cert ... https://localhost:8443/api/membership/dev/selftest
 */
export async function GET() {
  if (!devToolsEnabled()) {
    return NextResponse.json(
      { ok: false, error: "Dev tools are disabled." },
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

  const checks: { name: string; ok: boolean; detail?: string }[] = [];
  const check = (name: string, ok: boolean, detail?: string) => {
    checks.push({ name, ok, detail });
  };

  try {
    check(
      "decimal round-trip keeps 18-decimal precision",
      formatMinorToDecimal(parseDecimalToMinor("1.5", 18), 18) === "1.5",
    );

    const service = createInMemoryService();
    await service.ensureSeed(planSeeds());
    const allPlans = await service.listPlans(true);
    const plans = await service.listPlans();
    check(
      "seed creates all tier definitions",
      allPlans.length >= 3,
      `${allPlans.length} plans, ${plans.length} on sale`,
    );

    const annual = plans.find((plan) => plan.interval === "year");
    check("the approved annual plan is on sale", Boolean(annual));
    if (!annual) throw new Error("No annual plan to test with.");
    check(
      "no unapproved plan is on sale",
      plans.every((plan) => !plan.isPlaceholder),
      plans.map((plan) => `${plan.code}=${plan.isPlaceholder}`).join(", "),
    );
    check(
      "the annual plan costs 200 HOT",
      annual.amount === "200" && annual.currency === "HOT",
      `${annual.amount} ${annual.currency}`,
    );

    const subject = "selftest-person";
    const payment = await service.createPaymentIntent({
      subject,
      planId: annual.id,
      rail: "mock",
    });
    check(
      "intent starts pending",
      payment.status === "pending",
      payment.reference,
    );
    check(
      "intent amount matches the plan",
      payment.amountMinor === parseDecimalToMinor(annual.amount, 6).toString(),
    );

    const before = await service.resolveAccess(subject);
    check("no access before payment", before === null);

    const confirmed = await service.applyVerification(
      payment.reference,
      {
        status: "confirmed",
        txHash:
          "0xselftest0000000000000000000000000000000000000000000000000000000001",
        confirmations: 3,
      },
      { actor: subject },
    );
    check("payment confirmed", confirmed.payment.status === "confirmed");
    check("membership created", confirmed.membership !== null);

    const access = await service.resolveAccess(subject);
    check("access granted after payment", access?.active === true);
    check(
      "membership expires in the future",
      access?.membership.expiresAt !== null &&
        Date.parse(String(access?.membership.expiresAt)) > Date.now(),
    );

    const again = await service.applyVerification(
      payment.reference,
      {
        status: "confirmed",
        txHash:
          "0xselftest0000000000000000000000000000000000000000000000000000000001",
        confirmations: 5,
      },
      { actor: subject },
    );
    check(
      "re-verifying is idempotent",
      again.membership?.id === confirmed.membership?.id,
    );

    const second = await service.createPaymentIntent({
      subject,
      planId: annual.id,
      rail: "mock",
    });
    let duplicateBlocked = false;
    try {
      await service.applyVerification(
        second.reference,
        {
          status: "confirmed",
          txHash:
            "0xselftest0000000000000000000000000000000000000000000000000000000001",
          confirmations: 3,
        },
        { actor: subject },
      );
    } catch {
      duplicateBlocked = true;
    }
    check("the same transaction cannot pay twice", duplicateBlocked);

    const stacking = await service.applyVerification(
      second.reference,
      {
        status: "confirmed",
        txHash:
          "0xselftest0000000000000000000000000000000000000000000000000000000002",
        confirmations: 3,
      },
      { actor: subject },
    );
    check(
      "a second purchase stacks after the first",
      stacking.membership !== null &&
        confirmed.membership !== null &&
        Date.parse(stacking.membership.startsAt) >
          Date.parse(confirmed.membership.startsAt),
    );

    if (confirmed.membership) {
      await service.revokeMembership({
        membershipId: confirmed.membership.id,
        actor: subject,
        reason: "self test",
      });
    }
    const revoked = await service.resolveAccess(subject);
    check(
      "revoking removes the revoked membership from access",
      revoked === null || revoked.membership.id !== confirmed.membership?.id,
    );

    const granted = await service.grantManual({
      subject: "selftest-admin-grant",
      planId: annual.id,
      actor: subject,
      note: "self test",
    });
    check(
      "manual grant creates a confirmed manual payment",
      granted.payment.rail === "manual" &&
        granted.payment.status === "confirmed",
    );

    // Two stacked annual memberships run for ~730 days; sweep past both.
    const future = new Date(Date.now() + 800 * 24 * 60 * 60 * 1000);
    await service.sweepExpired(future);
    const afterSweep = await service.resolveAccess(subject, future);
    check("expiry sweep removes access", afterSweep === null);

    const snapshot = await service.snapshot();
    check(
      "audit log recorded events",
      snapshot.events.some((event) => event.action === "payment.confirmed") &&
        snapshot.events.some((event) => event.action === "membership.revoked"),
    );
  } catch (error) {
    check(
      "self test completed without throwing",
      false,
      (error as Error).message,
    );
  }

  const failed = checks.filter((entry) => !entry.ok);
  return NextResponse.json(
    {
      ok: failed.length === 0,
      actor: identity.subject,
      passed: checks.length - failed.length,
      total: checks.length,
      checks,
    },
    { status: failed.length === 0 ? 200 : 500 },
  );
}
