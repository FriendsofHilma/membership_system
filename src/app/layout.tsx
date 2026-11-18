import "~/styles/globals.css";

import { type Metadata } from "next";

export const metadata: Metadata = {
  title: "Membership | Friends of Hilma af Klint Foundation",
  description:
    "Membership and payment tool for the Friends of Hilma af Klint Foundation.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-white text-black antialiased">
        <div className="flex min-h-screen flex-col">
          <main className="flex-1">{children}</main>
          <footer className="border-t border-black/10 px-6 py-8 text-xs text-neutral-500">
            <div className="mx-auto flex max-w-4xl flex-wrap items-baseline justify-between gap-3">
              <span>Friends of Hilma af Klint Foundation</span>
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
