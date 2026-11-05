import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { InstallApp, SignOutButton } from "@/components/AdminNav";
import { fill } from "@/i18n";
import { currentLocale } from "@/i18n/server";
import { requireUser } from "@/lib/auth/current-user";
import { logout } from "../../login/actions";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await currentLocale();
  return { title: t.nav.more };
}

/** On phones, everything that is not a main tab: shop settings, the account, installing the app, signing out. */
export default async function MorePage() {
  const { t } = await currentLocale();
  return (
    <>
      <h1 className="mb-4 font-display text-4xl">{t.nav.more}</h1>
      <Suspense fallback={<p>{t.common.loading}</p>}>
        <More />
      </Suspense>
    </>
  );
}

async function More() {
  const { locale, t } = await currentLocale();
  const user = await requireUser(locale);
  const link = "flex items-center justify-between px-5 py-4 font-semibold hover:bg-sky-soft";
  return (
    <div className="space-y-4">
      <ul className="divide-y divide-line overflow-hidden rounded-3xl bg-white shadow-sm">
        <li><Link href={`/${locale}/settings`} className={link}>{t.nav.settings}<span aria-hidden="true">›</span></Link></li>
        <li><Link href={`/${locale}/account`} className={link}>{t.account.password}<span aria-hidden="true">›</span></Link></li>
      </ul>
      <section aria-labelledby="install" className="rounded-3xl bg-white p-5 shadow-sm">
        <h2 id="install" className="mb-2 font-display text-2xl">{t.nav.install}</h2>
        <InstallApp labels={{ install: t.nav.install, installed: t.nav.installed, hint: t.nav.installHint, ios: t.nav.iosInstall, android: t.nav.androidInstall }} />
      </section>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-3xl bg-white p-5 shadow-sm">
        <span className="text-muted">{fill(t.nav.signedInAs, { name: user.displayName })}</span>
        <SignOutButton action={logout} locale={locale} label={t.common.signOut} className="rounded-full border-2 border-ink px-4 py-2 font-semibold hover:bg-sky-soft" />
      </div>
    </div>
  );
}
