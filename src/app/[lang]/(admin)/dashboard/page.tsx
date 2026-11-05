import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { fill } from "@/i18n";
import { currentLocale } from "@/i18n/server";
import { requireUser } from "@/lib/auth/current-user";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await currentLocale();
  return { title: t.nav.dashboard };
}

export default async function DashboardPage() {
  const { t } = await currentLocale();
  return (
    <Suspense fallback={<p>{t.common.loading}</p>}>
      <Dashboard />
    </Suspense>
  );
}

async function Dashboard() {
  const { locale, t } = await currentLocale();
  const user = await requireUser(locale);
  return (
    <>
      <h1 className="font-display text-4xl">{fill(t.dashboard.title, { name: user.displayName })}</h1>
      <p className="mt-2 text-muted">{t.dashboard.intro}</p>
      <div className="mt-6 rounded-3xl bg-white p-5 shadow-sm">
        <p>{t.dashboard.next}</p>
        <Link href={`/${locale}/settings`} className="mt-3 inline-block rounded-full bg-primary px-5 py-2.5 font-semibold text-white hover:bg-primary-dark">
          {t.dashboard.openSettings}
        </Link>
      </div>
    </>
  );
}
