import { headers } from "next/headers";
import Link from "next/link";

import {
  getMembershipSession,
  mayEnterInternal,
} from "~/server/membership/access";
import { formatDate } from "~/server/membership/display";
import { getDfriEidIdentityFromHeaders } from "~/lib/dfri-eid";

export const metadata = {
  title: "Internal (prototype) | Friends of Hilma af Klint Foundation",
};

export const dynamic = "force-dynamic";

export default async function InternalPrototypePage() {
  const hdrs = await headers();
  const identity = getDfriEidIdentityFromHeaders(hdrs);
  const session = await getMembershipSession();
  const allowed = mayEnterInternal(session);

  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <p className="mb-2 text-sm font-semibold tracking-[0.2em] text-neutral-500 uppercase">
        DFRI-eID prototype
      </p>
      <h1
        className="mb-6 text-4xl font-semibold tracking-tight"
        style={{ fontFamily: "Georgia, 'Times New Roman', Times, serif" }}
      >
        Internal area
      </h1>

      {!identity ? (
        <div className="space-y-4 rounded border border-amber-200 bg-amber-50 p-6">
          <p className="text-lg font-medium">
            No verified identity header found.
          </p>
          <p className="text-sm text-neutral-700">
            You reached this page without a verified DFRI-eID identity. In the
            intended prototype flow you must access the site through the mTLS
            verifier/proxy.
          </p>
          <Link className="underline" href="/internal/login">
            View login/setup instructions
          </Link>
        </div>
      ) : (
        <div className="space-y-4 rounded border border-black/10 bg-neutral-50 p-6">
          <p className="text-lg">
            Authenticated via verified client certificate (prototype).
          </p>
          <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
            <div>
              <dt className="font-semibold text-neutral-600">Subject</dt>
              <dd className="font-mono break-all">{identity.subject}</dd>
            </div>
            <div>
              <dt className="font-semibold text-neutral-600">Serial</dt>
              <dd className="font-mono break-all">{identity.serial ?? "—"}</dd>
            </div>
            <div>
              <dt className="font-semibold text-neutral-600">Issuer</dt>
              <dd className="font-mono break-all">{identity.issuer ?? "—"}</dd>
            </div>
          </dl>
          <p className="text-sm text-neutral-600">
            This page is protected by <code>src/middleware.ts</code> and expects
            identity headers set by a trusted mTLS verifier/proxy. Do not treat
            this as production-ready authentication.
          </p>
        </div>
      )}

      {identity && !allowed ? (
        <div className="mt-6 rounded border border-black/15 p-6">
          <h2 className="mb-2 text-xl font-semibold">Membership required</h2>
          <p className="mb-4 text-sm text-neutral-700">
            Your identity is verified, but it has no active membership. Access
            to the internal area requires an active membership unless you are an
            administrator.
          </p>
          <Link
            className="inline-block border border-black bg-black px-5 py-2 text-xs font-semibold tracking-[0.15em] text-white uppercase hover:bg-neutral-800"
            href="/membership"
          >
            View membership options
          </Link>
        </div>
      ) : null}

      {identity && allowed ? (
        <div className="mt-6 space-y-4">
          <div className="rounded border border-green-300 bg-green-50 p-6">
            <h2 className="mb-2 text-xl font-semibold">
              {session?.isAdmin && !session.hasActiveMembership
                ? "Administrator access"
                : "Membership active"}
            </h2>
            {session?.access?.active ? (
              <p className="text-sm text-neutral-800">
                Plan: <strong>{session.access.plan?.name ?? "unknown"}</strong>.
                {session.access.membership.expiresAt
                  ? ` Access runs until ${formatDate(session.access.membership.expiresAt)}.`
                  : " Lifetime access."}
              </p>
            ) : (
              <p className="text-sm text-neutral-800">
                You are signed in as an administrator, so the member area is
                open without a personal membership.
              </p>
            )}
          </div>

          <p className="text-sm text-neutral-700">
            This is a placeholder for protected content. Membership gating is
            enforced on the server, not only in the UI.
          </p>

          {session?.isAdmin ? (
            <p className="text-sm">
              <Link className="underline" href="/internal/members">
                Member and payment management →
              </Link>
            </p>
          ) : null}
          <p className="text-sm">
            <Link className="underline" href="/membership">
              Manage your membership
            </Link>
          </p>
        </div>
      ) : null}

      <div className="mt-10 text-sm">
        <Link className="underline" href="/">
          ← Back to site
        </Link>
      </div>
    </main>
  );
}
