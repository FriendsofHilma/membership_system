import "~/styles/globals.css";

import { type Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Membership | Friends of Hilma af Klint Foundation",
  description:
    "Membership and payment tool for the Friends of Hilma af Klint Foundation.",
};

const navLink =
  "text-[11px] font-semibold tracking-[0.14em] text-neutral-600 uppercase hover:text-black";

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-white text-black antialiased">
        <div className="flex min-h-screen flex-col">
          <header className="border-b border-black/10 bg-[#faf8f3]">
            <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-6 py-4">
              <Link
                href="/"
                className="text-xs font-semibold tracking-[0.16em] uppercase"
              >
                Friends of Hilma af Klint Foundation
              </Link>
              <nav className="flex flex-wrap gap-x-6 gap-y-2">
                <Link className={navLink} href="/membership">
                  Membership
                </Link>
                <Link className={navLink} href="/internal/library">
                  Members&apos; library
                </Link>
                <Link className={navLink} href="/internal">
                  Member area
                </Link>
                <Link className={navLink} href="/internal/members">
                  Admin
                </Link>
              </nav>
            </div>
          </header>

          <main className="flex-1">{children}</main>

          <footer className="border-t border-black/10 bg-[#faf8f3] px-6 py-8 text-xs text-neutral-500">
            <div className="mx-auto flex max-w-6xl flex-wrap items-baseline justify-between gap-3">
              <span>
                Friends of Hilma af Klint Foundation · membership prototype, no
                real payments
              </span>
              <a className="underline" href="mailto:friendsofhilma@gmail.com">
                friendsofhilma@gmail.com
              </a>
            </div>
          </footer>
        </div>
      </body>
    </html>
  );
}
