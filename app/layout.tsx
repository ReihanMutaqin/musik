import type { Metadata, Viewport } from "next";
import { AppProviders } from "@/components/AppProviders";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://reihan.online"),
  title: "RIFF//LAB — Browser Rhythm Game",
  description:
    "Import paket .sng atau .zip dan mainkan chart 5-fret langsung di browser. Lokal, cepat, dan tanpa instalasi.",
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: "id_ID",
    url: "https://reihan.online",
    siteName: "RIFF//LAB by Reihan.online",
    title: "RIFF//LAB — Drop a pack. Hit the night.",
    description:
      "Rhythm game 5-fret lokal di browser untuk paket chart .sng dan .zip.",
  },
  twitter: {
    card: "summary_large_image",
    title: "RIFF//LAB — Browser Rhythm Game",
    description: "Bawa chart-mu. Main langsung di browser.",
  },
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
    apple: "/favicon.svg",
  },
  other: { "codex-preview": "development" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#09090b" },
    { media: "(prefers-color-scheme: dark)", color: "#09090b" },
  ],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="id" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@500;600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <AppProviders>
          {children}
        </AppProviders>
      </body>
    </html>
  );
}

