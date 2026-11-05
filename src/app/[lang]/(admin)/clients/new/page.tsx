import type { Metadata } from "next";
import { Suspense } from "react";
import { currentLocale } from "@/i18n/server";
import { requireUser } from "@/lib/auth/current-user";
import { ClientForm } from "../ClientForm";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await currentLocale();
  return { title: t.clients.newTitle };
}

export default async function NewClientPage() {
  const { t } = await currentLocale();
  return (
    <>
      <h1 className="mb-4 font-display text-4xl">{t.clients.newTitle}</h1>
      <Suspense fallback={<p>{t.common.loading}</p>}>
        <NewClient />
      </Suspense>
    </>
  );
}

async function NewClient() {
  const { locale, t } = await currentLocale();
  await requireUser(locale);
  return (
    <ClientForm locale={locale} t={t.clients} errorsText={t.errors} submit={t.common.save}
      initial={{ name: "", whatsapp: "", address: "", notes: "", isReseller: false }} />
  );
}
