import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { Brand } from "@/components/Brand";
import { LanguageSwitch } from "@/components/LanguageSwitch";
import { fill } from "@/i18n";
import { currentLocale } from "@/i18n/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { logout } from "../login/actions";

/** The admin's frame: navigation, who is signed in, sign out. Each page checks the session itself. */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const { locale, t } = await currentLocale();
  return (
    <div className="min-h-screen">
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3">
          <Link href={`/${locale}/dashboard`} className="no-underline">
            <Brand name="titiplailiyuk" />
          </Link>
          <nav aria-label="Admin" className="flex flex-wrap gap-x-4 gap-y-1 font-semibold">
            <Link href={`/${locale}/dashboard`} className="hover:underline">{t.nav.dashboard}</Link>
            <Link href={`/${locale}/orders`} className="hover:underline">{t.nav.orders}</Link>
            <Link href={`/${locale}/clients`} className="hover:underline">{t.nav.clients}</Link>
            <Link href={`/${locale}/settings`} className="hover:underline">{t.nav.settings}</Link>
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <Suspense fallback={null}>
              <SignedIn />
            </Suspense>
            <LanguageSwitch current={locale} path="/dashboard" label={t.common.language} />
          </div>
        </div>
      </header>
      <main id="main" className="mx-auto max-w-4xl px-4 py-6">
        {children}
      </main>
    </div>
  );
}

async function SignedIn() {
  const { locale, t } = await currentLocale();
  const user = await getCurrentUser();
  if (!user) return null;
  return (
    <form action={logout} className="flex items-center gap-3 text-sm">
      <input type="hidden" name="locale" value={locale} />
      <span className="text-muted">{fill(t.nav.signedInAs, { name: user.displayName })}</span>
      <button type="submit" className="rounded-full border border-ink px-3 py-1 font-semibold hover:bg-sky-soft">
        {t.common.signOut}
      </button>
    </form>
  );
}
