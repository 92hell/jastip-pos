import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { fill, formatDay } from "@/i18n";
import { currentLocale } from "@/i18n/server";
import { requireUser } from "@/lib/auth/current-user";
import { getDb } from "@/lib/db";
import { listEvents } from "@/lib/events";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await currentLocale();
  return { title: t.events.title };
}

export default async function EventsPage() {
  const { locale, t } = await currentLocale();
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-4xl">{t.events.title}</h1>
        <Link href={`/${locale}/events/new`} className="rounded-full bg-primary px-5 py-2.5 font-semibold text-white hover:bg-primary-dark">+ {t.events.add}</Link>
      </div>
      <p className="mb-4 mt-1 text-muted">{t.events.intro}</p>
      <Suspense fallback={<p>{t.common.loading}</p>}>
        <Events />
      </Suspense>
    </>
  );
}

async function Events() {
  const { locale, t } = await currentLocale();
  await requireUser(locale);
  const events = await listEvents(getDb());
  if (events.length === 0) return <p className="rounded-3xl bg-white p-5 text-muted">{t.events.empty}</p>;
  return (
    <ul className="divide-y divide-line overflow-hidden rounded-3xl bg-white shadow-sm">
      {events.map((e) => (
        <li key={e.id}>
          <Link href={`/${locale}/events/${e.id}`} className="block px-5 py-3 hover:bg-sky-soft">
            <span className="flex flex-wrap items-center gap-2">
              <span className="font-semibold">{e.name}</span>
              <span className="rounded-full bg-sky px-2 py-0.5 text-xs font-bold">{t.events.kinds[e.kind]}</span>
              {e.closedAt && <span className="rounded-full border border-muted px-2 py-0.5 text-xs font-bold text-muted">{t.events.closed}</span>}
            </span>
            <span className="block text-sm text-muted">
              {fill(t.events.dates, { from: formatDay(e.startsOn, locale), to: formatDay(e.endsOn, locale) })} · {fill(t.events.counts, { orders: e.orders, toBuy: e.toBuy })}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
