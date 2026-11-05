import type { Metadata } from "next";
import { Suspense } from "react";
import { currentLocale } from "@/i18n/server";
import { requireUser } from "@/lib/auth/current-user";
import { EventForm } from "../EventForm";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await currentLocale();
  return { title: t.events.newTitle };
}

export default async function NewEventPage() {
  const { t } = await currentLocale();
  return (
    <>
      <h1 className="mb-4 font-display text-4xl">{t.events.newTitle}</h1>
      <Suspense fallback={<p>{t.common.loading}</p>}>
        <NewEvent />
      </Suspense>
    </>
  );
}

async function NewEvent() {
  const { locale, t } = await currentLocale();
  await requireUser(locale);
  return (
    <EventForm locale={locale} t={t.events} errorsText={t.errors} submit={t.common.save}
      initial={{ kind: "trip", name: "", location: "", startsOn: "", endsOn: "", orderDeadline: "", note: "" }} />
  );
}
