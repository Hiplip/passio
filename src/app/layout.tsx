import "~/styles/globals.css";

import { type Metadata } from "next";
import { Archivo, JetBrains_Mono } from "next/font/google";

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

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${archivo.variable} ${jetbrainsMono.variable}`}>
      <body>
        <TRPCReactProvider>
          <VaultProvider>{children}</VaultProvider>
        </TRPCReactProvider>
      </body>
    </html>
  );
}
