import Link from "next/link";

export const metadata = {
  title: "Membership system | Friends of Hilma af Klint Foundation",
};

/**
 * Development landing page for this standalone membership repository.
 *
 * The production website embeds the same routes directly; this page only exists
 * so the subsystem can be run and inspected on its own.
 */
export default function HomePage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <p className="mb-2 text-sm font-semibold tracking-[0.2em] text-neutral-500 uppercase">
        Friends of Hilma af Klint Foundation
      </p>
      <h1 className="mb-4 text-4xl font-semibold tracking-tight">
        Membership system
      </h1>
      <p className="mb-10 max-w-2xl text-lg leading-relaxed text-neutral-800">
        A standalone checkout for the foundation&apos;s membership. Payment is
        verified server-side, and access is tied to a DFRI-eID client
        certificate. The 12-month membership costs 200 HOT.
      </p>

      <div className="mb-12 border border-amber-300 bg-amber-50 p-5 text-sm text-amber-900">
        <p className="font-semibold tracking-wider uppercase">
          Local prototype — no real money
        </p>
        <p className="mt-2">
          This build takes no real payments. Only the development mock rail is
          enabled unless <code>HOT_EVM_*</code> is configured. Do not present it
          to the public as a live shop.
        </p>
      </div>

      <nav className="grid gap-4 sm:grid-cols-2">
        <Link
          className="border border-black/15 p-5 hover:border-black"
          href="/membership"
        >
          <span className="block text-xs font-semibold tracking-[0.15em] text-neutral-500 uppercase">
            Public
          </span>
          <span className="mt-1 block text-lg">Membership plans</span>
          <span className="mt-1 block text-sm text-neutral-600">
            Prices, payment rails and current status.
          </span>
        </Link>
        <Link
          className="border border-black/15 p-5 hover:border-black"
          href="/internal"
        >
          <span className="block text-xs font-semibold tracking-[0.15em] text-neutral-500 uppercase">
            Protected
          </span>
          <span className="mt-1 block text-lg">Internal area</span>
          <span className="mt-1 block text-sm text-neutral-600">
            Requires a verified identity and an active membership.
          </span>
        </Link>
        <Link
          className="border border-black/15 p-5 hover:border-black"
          href="/internal/login"
        >
          <span className="block text-xs font-semibold tracking-[0.15em] text-neutral-500 uppercase">
            Sign in
          </span>
          <span className="mt-1 block text-lg">DFRI-eID login</span>
          <span className="mt-1 block text-sm text-neutral-600">
            Help page for the certificate-based prototype login.
          </span>
        </Link>
        <Link
          className="border border-black/15 p-5 hover:border-black"
          href="/internal/members"
        >
          <span className="block text-xs font-semibold tracking-[0.15em] text-neutral-500 uppercase">
            Admin
          </span>
          <span className="mt-1 block text-lg">Members and payments</span>
          <span className="mt-1 block text-sm text-neutral-600">
            Grants, revocations and the audit log. Administrators only.
          </span>
        </Link>
      </nav>

      <p className="mt-12 text-sm text-neutral-600">
        Setup, policy questions and the production checklist are in the{" "}
        <span className="font-mono">README.md</span> and{" "}
        <span className="font-mono">docs/membership.md</span>.
      </p>
    </main>
  );
}
