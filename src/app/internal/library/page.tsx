import Link from "next/link";

import { getMembershipSession, mayEnterInternal } from "~/server/membership/access";
import { formatDate } from "~/server/membership/display";

export const metadata = {
  title: "Members' library | Friends of Hilma af Klint Foundation",
};

export const dynamic = "force-dynamic";

/**
 * The members-only site. Access is resolved on the server from the verified
 * DFRI-eID identity, exactly like /internal — a paid membership or the admin
 * role is required.
 */
export default async function MembersLibraryPage() {
  const session = await getMembershipSession();
  const allowed = mayEnterInternal(session);

  if (!allowed) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-16">
        <p className="mb-2 text-[11px] font-semibold tracking-[0.2em] text-neutral-500 uppercase">
          Members only
        </p>
        <h1 className="mb-4 text-4xl font-semibold tracking-tight">
          Members&apos; library
        </h1>
        <p className="mb-6 max-w-2xl leading-relaxed text-neutral-800">
          This page opens after a confirmed membership payment. Your DFRI-eID
          identity does not currently have an active membership.
        </p>
        <Link
          className="inline-block border border-black bg-black px-5 py-2.5 text-[11px] font-semibold tracking-[0.15em] text-white uppercase hover:bg-neutral-800"
          href="/membership"
        >
          View membership options
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-5xl px-6 py-16">
      <p className="mb-2 text-[11px] font-semibold tracking-[0.2em] text-neutral-500 uppercase">
        Members only
      </p>
      <h1 className="mb-3 text-4xl font-semibold tracking-tight">
        Members&apos; library
      </h1>
      <p className="mb-8 max-w-2xl leading-relaxed text-neutral-800">
        Welcome, <code className="font-mono text-sm">{session?.identity.subject}</code>.
        This is the protected space the foundation is building for its members.
      </p>

      <section className="mb-10 border border-green-300 bg-green-50 p-6">
        <h2 className="mb-2 text-lg font-semibold">Your access</h2>
        {session?.access?.active ? (
          <p className="text-sm leading-relaxed text-neutral-800">
            Plan: <strong>{session.access.plan?.name ?? "unknown"}</strong>.{" "}
            {session.access.membership.expiresAt
              ? `Valid until ${formatDate(session.access.membership.expiresAt)}.`
              : "Lifetime access."}
          </p>
        ) : (
          <p className="text-sm leading-relaxed text-neutral-800">
            You are signed in as an administrator, so this area is open without
            a personal membership.
          </p>
        )}
        <div className="mt-4 flex flex-wrap gap-4 text-sm">
          <Link className="underline" href="/membership">
            Manage membership
          </Link>
          {session?.isAdmin ? (
            <Link className="underline" href="/internal/members">
              Admin board
            </Link>
          ) : null}
          <Link className="underline" href="/internal">
            Member area
          </Link>
        </div>
      </section>

      <section>
        <p className="mb-2 text-[11px] font-semibold tracking-[0.2em] text-neutral-500 uppercase">
          Reading room
        </p>
        <h2 className="mb-2 text-2xl font-semibold tracking-tight">
          The Cosmic Block
        </h2>
        <p className="mb-8 max-w-3xl text-sm leading-relaxed text-neutral-700">
          The foundation&apos;s visual research uses a hierarchical integer
          structure inspired by Hilma af Klint&apos;s harmonic proportions and
          complementary pairs. These plates introduce the structure; the full
          paper accompanies the exhibition programme.
        </p>

        <div className="space-y-6">
          <figure className="border border-black/10 bg-[#faf8f3] p-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/figures/fig2-lattice.svg"
              alt="All 2,197 cells of the Level-3 model space, isometrically projected."
              className="mx-auto h-auto w-full max-w-2xl"
            />
            <figcaption className="mx-auto max-w-2xl px-1 pt-4 text-xs leading-relaxed text-neutral-600">
              <strong className="block text-sm text-neutral-900">
                Plate 1 — The model space
              </strong>
              The default 13 × 13 × 13 tensor drawn exhaustively: 2,197 cells,
              one point each, isometrically projected.
            </figcaption>
          </figure>

          <div className="grid gap-6 md:grid-cols-2">
            <figure className="border border-black/10 bg-[#faf8f3] p-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/figures/fig1-hierarchy.svg"
                alt="The Cosmic Block hierarchy, Level 1 through Level 6."
                className="h-auto w-full"
              />
              <figcaption className="px-1 pt-4 text-xs leading-relaxed text-neutral-600">
                <strong className="block text-sm text-neutral-900">
                  Plate 2 — The hierarchy
                </strong>
                Line, plane, model space, collection, higher-order collection,
                complementary pair. Later levels remain reserved.
              </figcaption>
            </figure>
            <figure className="border border-black/10 bg-[#faf8f3] p-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/figures/fig4-complement.svg"
                alt="Two Level-5 structures related by the complement involution."
                className="h-auto w-full"
              />
              <figcaption className="px-1 pt-4 text-xs leading-relaxed text-neutral-600">
                <strong className="block text-sm text-neutral-900">
                  Plate 3 — Complement
                </strong>
                Two structures related by n ↦ 9 − n: the arithmetic form of the
                complementary pair that runs through af Klint&apos;s series.
              </figcaption>
            </figure>
          </div>

          <figure className="border border-black/10 bg-[#faf8f3] p-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/figures/fig3-palette.svg"
              alt="The ten-value palette mapping integer values 0 to 9 to colours."
              className="mx-auto h-auto w-full max-w-3xl"
            />
            <figcaption className="mx-auto max-w-3xl px-1 pt-4 text-xs leading-relaxed text-neutral-600">
              <strong className="block text-sm text-neutral-900">
                Plate 4 — The palette
              </strong>
              Cell values 0–9 mapped to a bright symbolic palette. Ordering is
              by digit, not by hue.
            </figcaption>
          </figure>
        </div>
      </section>

      <p className="mt-10 text-sm">
        <Link className="underline" href="/internal">
          ← Back to the member area
        </Link>
      </p>
    </main>
  );
}
