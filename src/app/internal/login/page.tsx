import Link from "next/link";

export const metadata = {
  title: "DFRI-eID login (prototype) | Friends of Hilma af Klint Foundation",
};

export default async function InternalLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  const { from } = await searchParams;
  const loginUrl =
    process.env.DFRI_EID_LOGIN_URL ?? "https://localhost:8443/internal";
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <p className="mb-2 text-sm font-semibold tracking-[0.2em] text-neutral-500 uppercase">
        DFRI-eID prototype
      </p>
      <h1
        className="mb-6 text-4xl font-semibold tracking-tight"
        style={{ fontFamily: "Georgia, 'Times New Roman', Times, serif" }}
      >
        Login required
      </h1>

      <div className="space-y-5 text-neutral-800">
        <p>
          This internal area uses a <strong>prototype</strong> DFRI-eID
          (certificate-based / mTLS) login. Access is granted only when you
          connect through a trusted verifier/proxy that has validated your
          client certificate and forwarded your verified identity to this site.
        </p>

        {from ? (
          <p className="text-sm text-neutral-600">
            Requested path: <code className="break-all">{from}</code>
          </p>
        ) : null}

        <p>
          <a
            className="inline-block border border-black bg-black px-6 py-3 text-sm font-semibold tracking-[0.15em] text-white uppercase hover:bg-neutral-800"
            href={loginUrl}
          >
            Sign in with DFRI-eID (test)
          </a>
        </p>
        <p className="text-xs text-neutral-500">
          The test sign-in URL is <code className="break-all">{loginUrl}</code>.
          Configure <code>DFRI_EID_LOGIN_URL</code> to point somewhere else.
        </p>

        <div className="rounded border border-black/10 bg-neutral-50 p-5">
          <h2 className="mb-2 font-semibold">To test locally</h2>
          <ol className="list-decimal space-y-2 pl-5 text-sm">
            <li>
              Generate the <strong>test</strong> certificates and import{" "}
              <code>tools/dfri-verifier/certs/test-person-001.p12</code>{" "}
              (password <code>test</code>) into your browser. Run in WSL/Linux:{" "}
              <code>bash tools/dfri-verifier/generate-test-certs.sh</code>.
            </li>
            <li>
              Run this site (<code>npm run dev</code>,{" "}
              <code>http://localhost:3000</code>) and the mTLS verifier in
              another terminal:{" "}
              <code>node tools/dfri-verifier/verifier.mjs</code>.
            </li>
            <li>
              Open <code>https://localhost:8443/internal</code> and select the
              test certificate when prompted. Run{" "}
              <code>node tools/dfri-verifier/smoke-test.mjs</code> to check the
              whole flow without a browser.
            </li>
          </ol>
        </div>

        <p className="text-sm text-neutral-600">
          Detailed setup notes: <code>docs/dfri-eid-prototype.md</code> in this
          repository. This is not production-ready authentication.
        </p>

        <p className="text-sm">
          The internal area requires an active membership.{" "}
          <Link className="underline" href="/membership">
            View membership options
          </Link>
          .
        </p>
      </div>

      <div className="mt-10 text-sm">
        <Link className="underline" href="/">
          ← Back to site
        </Link>
      </div>
    </main>
  );
}
