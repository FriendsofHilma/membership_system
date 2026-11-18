import Link from "next/link";

import { listPaymentRails } from "~/server/membership/payments";
import { getMembershipSession } from "~/server/membership/access";
import { formatDate } from "~/server/membership/display";
import { ensureMembershipSeed } from "~/server/membership/seed";
import { getMembershipService } from "~/server/membership/service";

import { Checkout } from "./checkout";
import type { PlanView, RailView } from "./checkout-types";

export const metadata = {
  title: "Membership | Friends of Hilma af Klint Foundation",
};

// Identity headers and the membership ledger are per-request.
export const dynamic = "force-dynamic";

export default async function MembershipPage() {
  await ensureMembershipSeed();

  const service = getMembershipService();
  const [session, allPlans] = await Promise.all([
    getMembershipSession(),
    service.listPlans(true),
  ]);

  const onSale = allPlans.filter((plan) => plan.active);
  const drafts = allPlans.filter((plan) => !plan.active);

  const planViews: PlanView[] = onSale.map((plan) => ({
    id: plan.id,
    name: plan.name,
    description: plan.description,
    amountDisplay: `${plan.amount} ${plan.currency}`,
    interval: plan.interval,
    durationDays: plan.durationDays,
    isPlaceholder: plan.isPlaceholder,
  }));

  const railViews: RailView[] = listPaymentRails().map((rail) => ({
    id: rail.id,
    label: rail.label,
    available: rail.available,
    reason: rail.reason,
  }));

  const access = session?.access ?? null;
  const hasPlaceholders = onSale.some((plan) => plan.isPlaceholder);

  return (
    <main className="mx-auto max-w-4xl px-6 py-16">
      <p className="mb-2 text-sm font-semibold tracking-[0.2em] text-neutral-500 uppercase">
        Friends of Hilma af Klint Foundation
      </p>
      <h1
        className="mb-4 text-4xl font-semibold tracking-tight"
        style={{ fontFamily: "Georgia, 'Times New Roman', Times, serif" }}
      >
        Membership
      </h1>
      <p className="mb-10 max-w-2xl text-lg leading-relaxed text-neutral-800">
        Membership supports the foundation&apos;s independent research and gives
        access to the internal area of this site. Access is tied to a verified
        DFRI-eID identity.
      </p>

      {hasPlaceholders ? (
        <div className="mb-10 border border-amber-300 bg-amber-50 p-5 text-sm text-amber-900">
          <p className="font-semibold tracking-wider uppercase">
            Development data — not approved pricing
          </p>
          <p className="mt-2">
            The plans below use fabricated test amounts so the tool can be
            exercised. Prices, durations, refunds, grace periods and tax
            treatment have <strong>not</strong> been decided by the foundation.
            Do not present these amounts to the public.
          </p>
        </div>
      ) : null}

      <section className="mb-12 border border-black/15 p-6">
        <h2 className="mb-4 text-sm font-semibold tracking-[0.2em] text-neutral-500 uppercase">
          Your status
        </h2>
        {!session ? (
          <div className="space-y-3 text-sm">
            <p>You are not signed in, so we cannot show a membership.</p>
            <Link
              className="inline-block border border-black bg-black px-5 py-2 text-xs font-semibold tracking-[0.15em] text-white uppercase hover:bg-neutral-800"
              href="/internal/login"
            >
              Sign in with DFRI-eID
            </Link>
          </div>
        ) : (
          <dl className="grid gap-4 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-xs font-semibold tracking-wider text-neutral-500 uppercase">
                Identity
              </dt>
              <dd className="font-mono break-all">
                {session.identity.subject}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold tracking-wider text-neutral-500 uppercase">
                Membership
              </dt>
              <dd>
                {access?.active ? (
                  <span className="font-semibold text-green-800">Active</span>
                ) : access ? (
                  <span className="font-semibold text-neutral-700">
                    Not active (expired)
                  </span>
                ) : (
                  <span className="text-neutral-700">None</span>
                )}
                {access?.plan ? ` — ${access.plan.name}` : ""}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold tracking-wider text-neutral-500 uppercase">
                {access?.active ? "Renews / ends" : "Expired"}
              </dt>
              <dd>
                {access?.active
                  ? formatDate(access.membership.expiresAt)
                  : access
                    ? formatDate(access.membership.expiresAt)
                    : "—"}
              </dd>
            </div>
          </dl>
        )}
        {session?.isAdmin ? (
          <p className="mt-4 text-sm">
            You are an administrator.{" "}
            <Link className="underline" href="/internal/members">
              Open member management
            </Link>
            .
          </p>
        ) : null}
      </section>

      <section>
        <h2 className="mb-6 text-2xl font-normal">Purchase access</h2>
        <Checkout
          plans={planViews}
          rails={railViews}
          signedIn={Boolean(session)}
        />
        {drafts.length > 0 ? (
          <p className="mt-6 border-t border-black/10 pt-4 text-sm text-neutral-600">
            Not on sale yet — price not approved:{" "}
            {drafts.map((plan) => plan.name).join(", ")}.
          </p>
        ) : null}
      </section>

      <section className="mt-14 space-y-3 border-t border-black/10 pt-8 text-sm text-neutral-700">
        <h2 className="text-sm font-semibold tracking-[0.2em] text-neutral-500 uppercase">
          About the payment methods
        </h2>
        <p>
          <strong>HOT</strong> is paid as an ERC-20 token transfer from your own
          wallet. The server verifies the transfer on chain before granting
          access; nothing is taken from a custodial account.
        </p>
        <p>
          <strong>HoloFuel</strong> is a Unyt network currency that requires a
          Unyt agent running on a Holochain conductor. It cannot be paid from a
          web checkout yet, so it is not offered until that integration exists.
        </p>
        <p>
          Manual grants are recorded by an administrator and are always visible
          in the audit log.
        </p>
      </section>

      <div className="mt-10 text-sm">
        <Link className="underline" href="/">
          ← Back to site
        </Link>
      </div>
    </main>
  );
}
