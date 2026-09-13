import "~/styles/globals.css";

import { type Metadata } from "next";
import { Archivo, JetBrains_Mono } from "next/font/google";

import { Toaster } from "~/components/ui/sonner";
import { VaultProvider } from "~/hooks/use-vault";
import { TRPCReactProvider } from "~/trpc/react";

export const metadata: Metadata = {
  title: "passio",
  description: "A personal password manager that cannot read your passwords.",
  icons: [{ rel: "icon", url: "/favicon.ico" }],
};

const archivo = Archivo({
  subsets: ["latin"],
  variable: "--font-archivo",
  display: "swap",
});

// Every secret renders in this face: it slashes the zero and keeps 1, l and I
// distinct, which is what makes a recovery key safe to copy by hand.
const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

/**
 * Applies the theme class before first paint.
 *
 * Inline and synchronous on purpose: doing this in an effect would show a flash
 * of the light theme to dark-mode users on every navigation.
 */
const themeScript = `
try {
  var m = window.matchMedia('(prefers-color-scheme: dark)');
  var apply = function (dark) { document.documentElement.classList.toggle('dark', dark); };
  apply(m.matches);
  m.addEventListener('change', function (e) { apply(e.matches); });
} catch (e) {}
`;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${archivo.variable} ${jetbrainsMono.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <TRPCReactProvider>
          <VaultProvider>{children}</VaultProvider>
        </TRPCReactProvider>
        <Toaster position="bottom-center" />
      </body>
    </html>
  );
}
