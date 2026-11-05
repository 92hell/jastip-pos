import type { Metadata } from "next";
import { Suspense } from "react";
import { fill } from "@/i18n";
import { currentLocale } from "@/i18n/server";
import { requireUser } from "@/lib/auth/current-user";
import { isDemo } from "@/lib/server/request";
import { PasswordForm } from "./PasswordForm";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await currentLocale();
  return { title: t.account.title };
}

export default async function AccountPage() {
  const { t } = await currentLocale();
  return (
    <>
      <h1 className="mb-4 font-display text-4xl">{t.account.title}</h1>
      <Suspense fallback={<p>{t.common.loading}</p>}>
        <Account />
      </Suspense>
    </>
  );
}

async function Account() {
  const { locale, t } = await currentLocale();
  const user = await requireUser(locale);
  return (
    <div className="space-y-4">
      <p className="text-muted">{fill(t.nav.signedInAs, { name: user.displayName })} ({user.username})</p>
      <section aria-labelledby="password" className="space-y-3 rounded-3xl bg-white p-5 shadow-sm">
        <h2 id="password" className="font-display text-2xl">{t.account.password}</h2>
        {isDemo() ? (
          <p className="rounded-xl bg-sky-soft p-3 text-sm font-semibold">{t.account.demoNote}</p>
        ) : (
          <>
            <p className="text-sm text-muted">{t.account.intro}</p>
            <PasswordForm locale={locale} username={user.username} t={t.account} />
          </>
        )}
      </section>
    </div>
  );
}
