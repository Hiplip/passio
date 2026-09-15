import "@passio/ui/styles.css";

import { type Metadata, type Viewport } from "next";

import { Toaster } from "@passio/ui/sonner";
import { VaultProvider } from "~/hooks/use-vault";
import { TRPCReactProvider } from "~/trpc/react";

/**
 * No `icons` entry: declaring one here OVERRIDES Next's file-based detection,
 * and the files are what carry the mark. `app/icon.svg` becomes the icon link,
 * `app/apple-icon.png` the touch icon, and `public/favicon.ico` answers the
 * bare /favicon.ico that browsers and link unfurlers request regardless.
 */
export const metadata: Metadata = {
  title: "passio",
  description: "A personal password manager that cannot read your passwords.",
};

/**
 * Both themes are declared, so the browser paints its own chrome to match
 * rather than flashing white behind a dark page on load.
 */
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fbfafc" },
    { media: "(prefers-color-scheme: dark)", color: "#1c1a23" },
  ],
};

/**
 * Both typefaces are self-hosted from @passio/ui rather than loaded through
 * next/font.
 *
 * next/font defines its variable on this element, which no extension page has
 * - so the popup, the vault window and the in-page overlay were all falling
 * back to the browser's default face. One @font-face declaration in the shared
 * stylesheet serves every surface, which is the only way the two can actually
 * look like one product.
 */
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <TRPCReactProvider>
          <VaultProvider>{children}</VaultProvider>
        </TRPCReactProvider>
        <Toaster position="bottom-center" />
      </body>
    </html>
  );
}
