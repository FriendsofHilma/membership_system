import Link from "next/link";

export const metadata = {
  title: "Membership system | Friends of Hilma af Klint Foundation",
};

const buttonPrimary =
  "inline-block border border-black bg-black px-5 py-2.5 text-[11px] font-semibold tracking-[0.15em] text-white uppercase hover:bg-neutral-800";
const buttonSecondary =
  "inline-block border border-black px-5 py-2.5 text-[11px] font-semibold tracking-[0.15em] uppercase hover:bg-neutral-100";

/**
 * Development landing page for this standalone membership repository.
 *
 * The production website embeds the same routes directly; this page only exists
 * so the subsystem can be run and inspected on its own.
 */
export default function HomePage() {
  return (
    <>
      <section className="border-b border-black/10 bg-[#faf8f3]">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-6 py-14 lg:grid-cols-[1.05fr_0.95fr]">
          <div>
            <p className="mb-3 text-[11px] font-semibold tracking-[0.22em] text-neutral-500 uppercase">
              Friends of Hilma af Klint Foundation
            </p>
            <h1 className="mb-5 max-w-xl text-4xl font-semibold tracking-tight sm:text-5xl">
              Membership system
            </h1>
            <p className="mb-8 max-w-xl text-lg leading-relaxed text-neutral-800">
              A working prototype of the foundation&apos;s membership:{" "}
              <strong>200 HOT for twelve months</strong>, paid from your own
              wallet, with access tied to a verified DFRI-eID certificate.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link className={buttonPrimary} href="/membership">
                View membership
              </Link>
              <Link className={buttonSecondary} href="/internal/library">
                Enter members&apos; library
              </Link>
              <Link className={buttonSecondary} href="/internal/members">
                Open admin board
              </Link>
            </div>
            <p className="mt-5 max-w-xl text-xs leading-relaxed text-neutral-500">
              The protected pages require the local DFRI-eID verifier at{" "}
              <code>https://localhost:8443</code>. This build takes no real
              money unless <code>HOT_EVM_*</code> is configured.
            </p>
          </div>

          <figure className="border border-black/10 bg-white p-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/figures/fig2-lattice.svg"
              alt="All 2,197 cells of the Level-3 Cosmic Block model space, isometrically projected."
              className="h-auto w-full"
            />
            <figcaption className="px-1 pt-3 text-[11px] leading-relaxed text-neutral-500">
              Figure 2 from the Cosmic Block paper — the default 13³ model space
              drawn exhaustively, one point per cell.
            </figcaption>
          </figure>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-14">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="mb-2 text-[11px] font-semibold tracking-[0.2em] text-neutral-500 uppercase">
              Try the functionality
            </p>
            <h2 className="text-2xl font-semibold tracking-tight">
              Four pages, one flow
            </h2>
          </div>
          <p className="max-w-md text-sm text-neutral-600">
            Start on the public membership page, sign in through the verifier,
            then continue into the members&apos; library or the admin board.
          </p>
        </div>

        <ol className="grid gap-4 sm:grid-cols-2">
          <li>
            <Link
              className="flex h-full flex-col border border-black/15 p-6 hover:border-black"
              href="/membership"
            >
              <span className="text-[11px] font-semibold tracking-[0.16em] text-neutral-500 uppercase">
                1 · Public
              </span>
              <span className="mt-2 text-lg font-medium">
                Membership &amp; checkout
              </span>
              <span className="mt-2 text-sm leading-relaxed text-neutral-600">
                See the approved 200 HOT / 12-month plan, the draft tiers, and
                every payment rail with its availability.
              </span>
            </Link>
          </li>
          <li>
            <Link
              className="flex h-full flex-col border border-black/15 p-6 hover:border-black"
              href="/internal/login"
            >
              <span className="text-[11px] font-semibold tracking-[0.16em] text-neutral-500 uppercase">
                2 · Sign in
              </span>
              <span className="mt-2 text-lg font-medium">DFRI-eID login</span>
              <span className="mt-2 text-sm leading-relaxed text-neutral-600">
                Certificate instructions and the link into the mTLS verifier.
                The test identity is <code>test-person-001</code>.
              </span>
            </Link>
          </li>
          <li>
            <Link
              className="flex h-full flex-col border border-black/15 p-6 hover:border-black"
              href="/internal/library"
            >
              <span className="text-[11px] font-semibold tracking-[0.16em] text-neutral-500 uppercase">
                3 · Paid members
              </span>
              <span className="mt-2 text-lg font-medium">
                Members&apos; library
              </span>
              <span className="mt-2 text-sm leading-relaxed text-neutral-600">
                The page that opens after a confirmed membership: member status,
                expiry, and the Cosmic Block figures.
              </span>
            </Link>
          </li>
          <li>
            <Link
              className="flex h-full flex-col border border-black/15 p-6 hover:border-black"
              href="/internal/members"
            >
              <span className="text-[11px] font-semibold tracking-[0.16em] text-neutral-500 uppercase">
                4 · Administrators
              </span>
              <span className="mt-2 text-lg font-medium">Admin board</span>
              <span className="mt-2 text-sm leading-relaxed text-neutral-600">
                Counts, every member, payments, manual grants, revocations and
                the audit trail.
              </span>
            </Link>
          </li>
        </ol>

        <div className="mt-6 border border-amber-300 bg-amber-50 p-5 text-sm leading-relaxed text-amber-900">
          <p className="font-semibold tracking-wider uppercase">
            Local prototype — no real money
          </p>
          <p className="mt-2">
            Only the development mock rail is enabled by default. To reach the
            protected pages, run the certificate verifier and use{" "}
            <code>https://localhost:8443</code>; add{" "}
            <code>MEMBERSHIP_ADMIN_SUBJECTS=test-person-001</code> to open the
            admin board. Setup is in <code>README.md</code>.
          </p>
        </div>
      </section>

      <section className="border-y border-black/10 bg-[#faf8f3]">
        <div className="mx-auto max-w-6xl px-6 py-14">
          <p className="mb-2 text-[11px] font-semibold tracking-[0.2em] text-neutral-500 uppercase">
            From the Cosmic Block paper
          </p>
          <h2 className="mb-8 max-w-2xl text-2xl font-semibold tracking-tight">
            Harmonic structure as decoration
          </h2>

          <div className="grid gap-5 md:grid-cols-3">
            <figure className="border border-black/10 bg-white p-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/figures/fig1-hierarchy.svg"
                alt="Diagram of the Cosmic Block hierarchy from Level 1 to Level 6."
                className="h-auto w-full"
              />
              <figcaption className="px-1 pt-3 text-xs leading-relaxed text-neutral-600">
                <strong className="block text-neutral-900">
                  The realized hierarchy
                </strong>
                Each level aggregates the level below. Levels 7–9 are reserved.
              </figcaption>
            </figure>
            <figure className="border border-black/10 bg-white p-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/figures/fig3-palette.svg"
                alt="The ten-colour palette mapping cell values 0 to 9."
                className="h-auto w-full"
              />
              <figcaption className="px-1 pt-3 text-xs leading-relaxed text-neutral-600">
                <strong className="block text-neutral-900">
                  The ten-value palette
                </strong>
                Values 0–9 ordered by digit, not hue — an af Klint-inspired
                mapping.
              </figcaption>
            </figure>
            <figure className="border border-black/10 bg-white p-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/figures/fig4-complement.svg"
                alt="Two Level-5 structures related by the complement involution n to 9 minus n."
                className="h-auto w-full"
              />
              <figcaption className="px-1 pt-3 text-xs leading-relaxed text-neutral-600">
                <strong className="block text-neutral-900">
                  Complementary pairs
                </strong>
                The involution n ↦ 9 − n, the numerical form of af Klint&apos;s
                dualities.
              </figcaption>
            </figure>
          </div>

          <p className="mt-6 max-w-3xl text-xs leading-relaxed text-neutral-500">
            The figures are deterministic SVGs generated by{" "}
            <code>tools/make-figures.js</code> for the Cosmic Block paper. They
            are included here as visual language for the members&apos; area, not
            as part of the payment model.
          </p>
        </div>
      </section>
    </>
  );
}
