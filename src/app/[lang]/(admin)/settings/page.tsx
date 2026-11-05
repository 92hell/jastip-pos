import type { Metadata } from "next";
import { Suspense } from "react";
import { currentLocale } from "@/i18n/server";
import { requireOwner } from "@/lib/auth/current-user";
import { getDb } from "@/lib/db";
import { isDemo } from "@/lib/server/request";
import { getSettings } from "@/lib/settings";
import { SettingsForm } from "./SettingsForm";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await currentLocale();
  return { title: t.settings.title };
}

export default async function SettingsPage() {
  const { t } = await currentLocale();
  return (
    <>
      <h1 className="font-display text-4xl">{t.settings.title}</h1>
      <p className="mb-6 mt-1 text-muted">{t.settings.intro}</p>
      <Suspense fallback={<p>{t.common.loading}</p>}>
        <Settings />
      </Suspense>
    </>
  );
}

async function Settings() {
  const { locale, t } = await currentLocale();
  await requireOwner(locale);
  const initial = await getSettings(getDb());
  return (
    <SettingsForm locale={locale} t={t.settings} initial={initial} demo={isDemo()}
      errorsText={{ ...t.errors, saved: t.common.saved, save: t.common.save, saving: t.common.saving }} />
  );
}
