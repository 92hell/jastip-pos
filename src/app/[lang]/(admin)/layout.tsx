import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { Brand } from "@/components/Brand";
import { LanguageSwitch } from "@/components/LanguageSwitch";
import { fill } from "@/i18n";
import { currentLocale } from "@/i18n/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { BottomNav, CurrentTab, SignOutButton } from "@/components/AdminNav";
import { logout } from "../login/actions";

/** The admin's frame: navigation, who is signed in, sign out. Each page checks the session itself. */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const { locale, t } = await currentLocale();
  const tabs = [
    { href: `/${locale}/dashboard`, label: t.nav.dashboard, icon: "🏠" },
    { href: `/${locale}/orders`, label: t.nav.orders, icon: "🧾" },
    { href: `/${locale}/events`, label: t.nav.events, icon: "🛍️" },
    { href: `/${locale}/clients`, label: t.nav.clients, icon: "👥" },
    { href: `/${locale}/more`, label: t.nav.more, icon: "☰" },
  ];
  return (
    <div className="min-h-screen">
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3">
          <Link href={`/${locale}/dashboard`} className="no-underline">
            <Brand name="titiplailiyuk" />
          </Link>
          <nav aria-label="Admin" className="hidden flex-wrap gap-x-4 gap-y-1 font-semibold sm:flex">
            <Link href={`/${locale}/dashboard`} className="hover:underline">{t.nav.dashboard}</Link>
            <Link href={`/${locale}/orders`} className="hover:underline">{t.nav.orders}</Link>
            <Link href={`/${locale}/events`} className="hover:underline">{t.nav.events}</Link>
            <Link href={`/${locale}/clients`} className="hover:underline">{t.nav.clients}</Link>
            <Link href={`/${locale}/settings`} className="hover:underline">{t.nav.settings}</Link>
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <div className="hidden sm:block">
              <Suspense fallback={null}>
                <SignedIn />
              </Suspense>
            </div>
            <LanguageSwitch current={locale} path="/dashboard" label={t.common.language} />
          </div>
        </div>
      </header>
      <main id="main" className="mx-auto max-w-4xl px-4 pb-28 pt-6 sm:pb-6">
        {children}
      </main>
      <Suspense fallback={<BottomNav label={t.nav.tabs} tabs={tabs} />}>
        <CurrentTab label={t.nav.tabs} tabs={tabs} />
      </Suspense>
    </div>
  );
}

async function SignedIn() {
  const { locale, t } = await currentLocale();
  const user = await getCurrentUser();
  if (!user) return null;
  return (
    <div className="flex items-center gap-3 text-sm">
      <Link href={`/${locale}/account`} className="text-muted hover:underline">{fill(t.nav.signedInAs, { name: user.displayName })}</Link>
      <SignOutButton action={logout} locale={locale} label={t.common.signOut} className="rounded-full border border-ink px-3 py-1 font-semibold hover:bg-sky-soft" />
    </div>
  );
}
