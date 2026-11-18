import Link from "next/link";
import { redirect } from "next/navigation";

import { getMembershipSession } from "~/server/membership/access";
import { formatDate, formatDateTime } from "~/server/membership/display";
import { ensureMembershipSeed } from "~/server/membership/seed";
import { getMembershipService } from "~/server/membership/service";

import {
  grantMembershipAction,
  revokeMembershipAction,
  setMemberRoleAction,
  verifyPaymentAction,
} from "./actions";

export const metadata = {
  title: "Members and payments | Friends of Hilma af Klint Foundation",
};

export const dynamic = "force-dynamic";

const inputClass =
  "w-full border border-black/20 px-3 py-2 text-sm focus:border-black focus:outline-none";
const buttonClass =
  "border border-black bg-black px-4 py-2 text-xs font-semibold uppercase tracking-[0.15em] text-white hover:bg-neutral-800";
const subtleButtonClass =
  "border border-black px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] hover:bg-neutral-100";

export default async function MembersAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string; error?: string }>;
}) {
  const session = await getMembershipSession();
  if (!session) redirect("/internal/login");
  if (!session.isAdmin) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-16">
        <h1 className="mb-4 text-3xl font-semibold">Not authorised</h1>
        <p className="text-sm text-neutral-700">
          Your identity does not have administrator rights. Add your DFRI-eID
          subject to <code>MEMBERSHIP_ADMIN_SUBJECTS</code> or ask an existing
          administrator to change your role.
        </p>
        <p className="mt-6 text-sm">
          <Link className="underline" href="/internal">
            ← Back to the member area
          </Link>
        </p>
      </main>
    );
  }

  await ensureMembershipSeed();
  const service = getMembershipService();
  await service.sweepExpired();

  const { notice, error } = await searchParams;
  const snapshot = await service.snapshot();
  const now = Date.now();

  const plansById = new Map(snapshot.plans.map((plan) => [plan.id, plan]));
  const membersById = new Map(
    snapshot.members.map((member) => [member.id, member]),
  );

  function activeMembershipFor(memberId: string) {
    return (
      snapshot.memberships
        .filter(
          (membership) =>
            membership.memberId === memberId &&
            membership.status === "active" &&
            (membership.expiresAt === null ||
              Date.parse(membership.expiresAt) > now),
        )
        .sort((a, b) => {
          if (a.expiresAt === null) return -1;
          if (b.expiresAt === null) return 1;
          return Date.parse(b.expiresAt) - Date.parse(a.expiresAt);
        })[0] ?? null
    );
  }

  const pendingPayments = snapshot.payments.filter(
    (payment) => payment.status === "pending" || payment.status === "submitted",
  );
  const activeMemberCount = snapshot.members.filter((member) =>
    activeMembershipFor(member.id),
  ).length;
  const confirmedPayments = snapshot.payments.filter(
    (payment) => payment.status === "confirmed",
  );

  const stats = [
    { label: "Members", value: snapshot.members.length },
    { label: "Active memberships", value: activeMemberCount },
    { label: "Awaiting settlement", value: pendingPayments.length },
    { label: "Confirmed payments", value: confirmedPayments.length },
  ];

  return (
    <main className="mx-auto max-w-6xl px-6 py-16">
      <p className="mb-2 text-sm font-semibold tracking-[0.2em] text-neutral-500 uppercase">
        Administration
      </p>
      <h1
        className="mb-2 text-4xl font-semibold tracking-tight"
        style={{ fontFamily: "Georgia, 'Times New Roman', Times, serif" }}
      >
        Members and payments
      </h1>
      <p className="mb-8 text-sm text-neutral-700">
        Signed in as{" "}
        <code className="font-mono">{session.identity.subject}</code>. Every
        grant, revocation and verification is written to the audit log.
      </p>

      <section className="mb-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <div key={stat.label} className="border border-black/15 p-5">
            <p className="text-[11px] font-semibold tracking-[0.15em] text-neutral-500 uppercase">
              {stat.label}
            </p>
            <p
              className="mt-2 text-3xl"
              style={{ fontFamily: "Georgia, 'Times New Roman', Times, serif" }}
            >
              {stat.value}
            </p>
          </div>
        ))}
      </section>

      {notice ? (
        <p className="mb-6 border border-green-300 bg-green-50 p-4 text-sm text-green-900">
          {notice}
        </p>
      ) : null}
      {error ? (
        <p className="mb-6 border border-red-300 bg-red-50 p-4 text-sm text-red-900">
          {error}
        </p>
      ) : null}

      <section className="mb-12">
        <h2 className="mb-4 text-sm font-semibold tracking-[0.2em] text-neutral-500 uppercase">
          Grant a membership manually
        </h2>
        <form
          action={grantMembershipAction}
          className="grid gap-3 border border-black/15 p-5 sm:grid-cols-[2fr_1fr_2fr_auto]"
        >
          <label className="text-xs font-semibold tracking-wider text-neutral-600 uppercase">
            DFRI-eID subject
            <input
              className={`${inputClass} mt-1 tracking-normal normal-case`}
              name="subject"
              placeholder="test-person-001"
              required
            />
          </label>
          <label className="text-xs font-semibold tracking-wider text-neutral-600 uppercase">
            Plan
            <select className={`${inputClass} mt-1`} name="planId" required>
              {snapshot.plans
                .filter((plan) => plan.active)
                .map((plan) => (
                  <option key={plan.id} value={plan.id}>
                    {plan.name} — {plan.amount} {plan.currency}
                  </option>
                ))}
            </select>
          </label>
          <label className="text-xs font-semibold tracking-wider text-neutral-600 uppercase">
            Note (recorded)
            <input
              className={`${inputClass} mt-1 tracking-normal normal-case`}
              name="note"
              placeholder="e.g. bank transfer received"
            />
          </label>
          <div className="flex items-end">
            <button className={buttonClass} type="submit">
              Grant
            </button>
          </div>
        </form>
        <p className="mt-2 text-xs text-neutral-500">
          Manual grants create a confirmed payment record with rail{" "}
          <code>manual</code>. They never invent an on-chain transaction.
        </p>
      </section>

      <section className="mb-12">
        <h2 className="mb-4 text-sm font-semibold tracking-[0.2em] text-neutral-500 uppercase">
          Members ({snapshot.members.length})
        </h2>
        {snapshot.members.length === 0 ? (
          <p className="border border-black/10 p-5 text-sm text-neutral-600">
            No members yet. A member record is created when someone starts a
            checkout or is granted access.
          </p>
        ) : (
          <div className="overflow-x-auto border border-black/15">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-black/15 bg-neutral-50 text-xs tracking-wider text-neutral-600 uppercase">
                <tr>
                  <th className="px-4 py-3">Subject</th>
                  <th className="px-4 py-3">Role</th>
                  <th className="px-4 py-3">Membership</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {snapshot.members.map((member) => {
                  const membership = activeMembershipFor(member.id);
                  const plan = membership
                    ? plansById.get(membership.planId)
                    : null;
                  return (
                    <tr
                      key={member.id}
                      className="border-b border-black/10 align-top"
                    >
                      <td className="px-4 py-4">
                        <span className="font-mono text-xs break-all">
                          {member.dfriSubject}
                        </span>
                        <span className="mt-1 block text-xs text-neutral-500">
                          joined {formatDate(member.createdAt)}
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        <span className="font-semibold">{member.role}</span>
                        <form action={setMemberRoleAction} className="mt-2">
                          <input
                            type="hidden"
                            name="memberId"
                            value={member.id}
                          />
                          <input
                            type="hidden"
                            name="role"
                            value={member.role === "admin" ? "member" : "admin"}
                          />
                          <button className={subtleButtonClass} type="submit">
                            {member.role === "admin"
                              ? "Make member"
                              : "Make admin"}
                          </button>
                        </form>
                      </td>
                      <td className="px-4 py-4">
                        {membership ? (
                          <span>
                            <span className="block font-medium">
                              {plan?.name ?? membership.planId}
                            </span>
                            <span className="block text-xs text-neutral-600">
                              ends {formatDate(membership.expiresAt)}
                            </span>
                            <form
                              action={revokeMembershipAction}
                              className="mt-2 space-y-2"
                            >
                              <input
                                type="hidden"
                                name="membershipId"
                                value={membership.id}
                              />
                              <input
                                className="w-full border border-black/20 px-2 py-1 text-xs"
                                name="reason"
                                placeholder="Revocation reason"
                                required
                              />
                              <button
                                className={subtleButtonClass}
                                type="submit"
                              >
                                Revoke
                              </button>
                            </form>
                          </span>
                        ) : (
                          <span className="text-neutral-600">None active</span>
                        )}
                      </td>
                      <td className="px-4 py-4 text-xs text-neutral-600">
                        {
                          snapshot.memberships.filter(
                            (entry) => entry.memberId === member.id,
                          ).length
                        }{" "}
                        historic membership(s)
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="mb-12">
        <h2 className="mb-4 text-sm font-semibold tracking-[0.2em] text-neutral-500 uppercase">
          Payments ({snapshot.payments.length})
          {pendingPayments.length > 0
            ? ` — ${pendingPayments.length} awaiting settlement`
            : ""}
        </h2>
        {snapshot.payments.length === 0 ? (
          <p className="border border-black/10 p-5 text-sm text-neutral-600">
            No payments recorded yet.
          </p>
        ) : (
          <div className="overflow-x-auto border border-black/15">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-black/15 bg-neutral-50 text-xs tracking-wider text-neutral-600 uppercase">
                <tr>
                  <th className="px-4 py-3">Reference</th>
                  <th className="px-4 py-3">Member</th>
                  <th className="px-4 py-3">Amount</th>
                  <th className="px-4 py-3">Rail</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Transaction</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {snapshot.payments.slice(0, 100).map((payment) => {
                  const member = membersById.get(payment.memberId);
                  return (
                    <tr
                      key={payment.id}
                      className="border-b border-black/10 align-top"
                    >
                      <td className="px-4 py-4 font-mono text-xs">
                        {payment.reference}
                        <span className="mt-1 block text-neutral-500">
                          {formatDateTime(payment.createdAt)}
                        </span>
                      </td>
                      <td className="px-4 py-4 font-mono text-xs">
                        {member?.dfriSubject ?? payment.memberId}
                      </td>
                      <td className="px-4 py-4">{payment.amountDisplay}</td>
                      <td className="px-4 py-4 text-xs">{payment.rail}</td>
                      <td className="px-4 py-4">
                        <span className="font-semibold">{payment.status}</span>
                        {payment.failureReason ? (
                          <span className="mt-1 block text-xs text-neutral-600">
                            {payment.failureReason}
                          </span>
                        ) : null}
                      </td>
                      <td className="px-4 py-4 font-mono text-[11px] break-all">
                        {payment.txHash ?? "—"}
                        {payment.confirmations !== null ? (
                          <span className="mt-1 block text-neutral-500">
                            {payment.confirmations} confirmation(s)
                          </span>
                        ) : null}
                      </td>
                      <td className="px-4 py-4">
                        {payment.status !== "confirmed" &&
                        payment.rail !== "manual" ? (
                          <form action={verifyPaymentAction}>
                            <input
                              type="hidden"
                              name="reference"
                              value={payment.reference}
                            />
                            <button className={subtleButtonClass} type="submit">
                              Verify
                            </button>
                          </form>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-4 text-sm font-semibold tracking-[0.2em] text-neutral-500 uppercase">
          Recent audit events
        </h2>
        <ul className="space-y-2 border border-black/15 p-5 text-xs">
          {snapshot.events
            .slice(-25)
            .reverse()
            .map((event) => (
              <li
                key={event.id}
                className="border-b border-black/5 pb-2 last:border-0"
              >
                <span className="font-mono text-neutral-500">
                  {formatDateTime(event.at)}
                </span>{" "}
                <span className="font-semibold">{event.action}</span>{" "}
                <span className="font-mono text-neutral-600">
                  {event.actor}
                </span>
                <span className="mt-1 block text-neutral-600">
                  {Object.entries(event.detail)
                    .map(([key, value]) => `${key}=${String(value)}`)
                    .join(" · ")}
                </span>
              </li>
            ))}
        </ul>
      </section>

      <div className="mt-10 flex flex-wrap gap-6 text-sm">
        <Link className="underline" href="/internal">
          ← Member area
        </Link>
        <Link className="underline" href="/internal/library">
          Members&apos; library
        </Link>
        <Link className="underline" href="/membership">
          Membership page
        </Link>
      </div>
    </main>
  );
}
