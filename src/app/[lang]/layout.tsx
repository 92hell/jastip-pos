import type { Metadata, Viewport } from "next";
import { lang } from "next/root-params";
import { Suspense } from "react";
import { connection } from "next/server";
import { dictionary, isLocale, LOCALES, type Locale } from "@/i18n";
import { isDemo } from "@/lib/server/request";
import { AppShell } from "@/components/AppShell";
import "../globals.css";

export async function generateStaticParams() {
  return LOCALES.map((l) => ({ lang: l }));
}

async function locale(): Promise<Locale> {
  const value = await lang();
  return isLocale(value) ? value : "id";
}

export async function generateMetadata(): Promise<Metadata> {
  const t = dictionary(await locale());
  return {
    title: { default: t.meta.title, template: `%s · ${t.meta.title}` },
    description: t.meta.description,
    manifest: "/manifest.webmanifest",
    icons: { icon: [{ url: "/icons/favicon-48.png", sizes: "48x48" }, { url: "/icons/icon-192.png", sizes: "192x192" }], apple: "/icons/apple-touch-icon.png" },
    // iPhone: open full screen from the home screen, with the app's own name.
    appleWebApp: { capable: true, title: "Titip Laili", statusBarStyle: "default" },
  };
}

export const viewport: Viewport = { themeColor: "#9fd8fd" };

export default async function RootLayout({ children }: LayoutProps<"/[lang]">) {
  const l = await locale();
  const t = dictionary(l);
  return (
    <html lang={l}>
      <body className="min-h-screen">
        <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:bg-white focus:px-3 focus:py-2">
          {t.common.skipToContent}
        </a>
        <AppShell offlineText={t.common.offline} />
        <Suspense fallback={null}>
          <DemoBanner text={t.common.demoBanner} />
        </Suspense>
        {children}
      </body>
    </html>
  );
}

/** Read at request time, so the same build can run as the demo or as the real shop. */
async function DemoBanner({ text }: { text: string }) {
  await connection();
  if (!isDemo()) return null;
  return <p className="bg-ink px-4 py-2 text-center text-sm text-white">{text}</p>;
}
