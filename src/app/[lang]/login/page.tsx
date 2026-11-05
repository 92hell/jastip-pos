import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { Brand } from "@/components/Brand";
import { LanguageSwitch } from "@/components/LanguageSwitch";
import { currentLocale } from "@/i18n/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { DEMO_PASSWORD, DEMO_USERNAME, isDemo } from "@/lib/server/request";
import { LoginForm } from "./LoginForm";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await currentLocale();
  return { title: t.login.title };
}

export default async function LoginPage() {
  const { locale, t } = await currentLocale();
  return (
    <main className="mx-auto max-w-sm px-4 py-8">
      <div className="mb-6 flex items-center justify-between gap-3">
        <Link href={`/${locale}`} className="no-underline">
          <Brand name="titiplailiyuk" />
        </Link>
        <LanguageSwitch current={locale} path="/login" label={t.common.language} />
      </div>
      <div className="rounded-3xl bg-white p-6 shadow-sm">
        <h1 className="mb-4 font-display text-3xl">{t.login.title}</h1>
        <Suspense fallback={<p>{t.common.loading}</p>}>
          <SignIn />
        </Suspense>
      </div>
    </main>
  );
}

/** Already signed in: straight to the admin. In the demo, offers the demo account. */
async function SignIn() {
  await connection();
  const { locale, t } = await currentLocale();
  if (await getCurrentUser()) redirect(`/${locale}/dashboard`);
  return <LoginForm locale={locale} t={t.login} demo={isDemo() ? { username: DEMO_USERNAME, password: DEMO_PASSWORD } : undefined} />;
}
