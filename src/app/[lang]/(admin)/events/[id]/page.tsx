import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ActionButton } from "@/components/ConfirmButton";
import { FormStatus } from "@/components/Field";
import { fill, formatDay, rupiah } from "@/i18n";
import { currentLocale } from "@/i18n/server";
import { requireUser } from "@/lib/auth/current-user";
import { getDb } from "@/lib/db";
import { getEventSummary } from "@/lib/dashboard";
import { getEvent } from "@/lib/events";
import { listOrders } from "@/lib/orders";
import { EventForm } from "../EventForm";
import { removeEvent, toggleEventClosed } from "../actions";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await currentLocale();
  return { title: t.events.title };
}

export default async function EventPage(props: PageProps<"/[lang]/events/[id]">) {
  const { t } = await currentLocale();
  return (
    <Suspense fallback={<p>{t.common.loading}</p>}>
      <EventDetail {...props} />
    </Suspense>
  );
}

async function EventDetail({ params, searchParams }: PageProps<"/[lang]/events/[id]">) {
  const { locale, t } = await currentLocale();
  await requireUser(locale);
  const id = Number((await params).id);
  const event = Number.isSafeInteger(id) ? await getEvent(getDb(), id) : null;
  if (!event) notFound();
  const [orders, summary] = await Promise.all([listOrders(getDb(), { eventId: id }), getEventSummary(getDb(), id)]);
  const money = (n: number) => rupiah(n, locale);
  const saved = (await searchParams).saved === "1";
  const button = "rounded-full border-2 border-ink px-4 py-2 font-semibold hover:bg-white";

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="font-display text-4xl">{event.name}</h1>
        <span className="rounded-full bg-sky px-3 py-1 text-sm font-bold">{t.events.kinds[event.kind]}</span>
      </div>
      <p className="mb-4 text-muted">
        {fill(t.events.dates, { from: formatDay(event.startsOn, locale), to: formatDay(event.endsOn, locale) })}
        {event.location ? ` · ${event.location}` : ""}
        {event.orderDeadline ? ` · ${fill(t.events.deadline, { date: formatDay(event.orderDeadline, locale) })}` : ""}
      </p>
      {saved && <div className="mb-4"><FormStatus saved={t.events.saved} /></div>}
      {event.closedAt && <p className="mb-4 rounded-2xl bg-white p-3 font-semibold">{t.events.closedNote}</p>}

      <div className="mb-6 flex flex-wrap gap-2">
        <Link href={`/${locale}/events/${id}/shopping`} className="rounded-full bg-primary px-5 py-2 font-semibold text-white hover:bg-primary-dark">{t.events.shoppingList}</Link>
        {!event.closedAt && <Link href={`/${locale}/orders/new?event=${id}`} className={button}>+ {t.orders.add}</Link>}
        <ActionButton action={toggleEventClosed} fields={{ locale, id, closed: String(!event.closedAt) }} className={button}>
          {event.closedAt ? t.events.reopen : t.events.close}
        </ActionButton>
      </div>

      <section aria-labelledby="event-summary" className="mb-6 rounded-3xl bg-sky p-5">
        <h2 id="event-summary" className="font-display text-2xl">{t.events.summary}</h2>
        <dl className="mt-2 grid grid-cols-[1fr_auto] gap-x-4 gap-y-1">
          <dt>{t.events.summaryOrders}</dt><dd className="text-right">{summary.orders}</dd>
          <dt>{t.events.summaryItems}</dt><dd className="text-right">{money(summary.itemsTotal)}</dd>
          <dt className="font-bold">{t.events.summaryFees}</dt><dd className="text-right font-bold">{money(summary.feesTotal)}</dd>
          <dt>{t.events.summaryTotal}</dt><dd className="text-right">{money(summary.total)}</dd>
          <dt>{t.events.summaryPaid}</dt><dd className="text-right">{money(summary.paid)}</dd>
          <dt>{t.events.summaryOutstanding}</dt><dd className="text-right">{money(summary.outstanding)}</dd>
          {summary.soldOut > 0 && (<><dt>{t.events.summarySoldOut}</dt><dd className="text-right">{summary.soldOut}</dd></>)}
        </dl>
      </section>

      <section aria-labelledby="event-orders" className="mb-6 rounded-3xl bg-white p-5 shadow-sm">
        <h2 id="event-orders" className="font-display text-2xl">{t.events.orders}</h2>
        {orders.length === 0 ? (
          <p className="mt-2 text-muted">{t.events.noOrders}</p>
        ) : (
          <ul className="mt-2 divide-y divide-line">
            {orders.map((o) => (
              <li key={o.id}>
                <Link href={`/${locale}/orders/${o.id}`} className="flex flex-wrap justify-between gap-2 py-2 hover:underline">
                  <span><span className="font-semibold">{o.clientName}</span> <span className="text-sm text-muted">{o.number}</span></span>
                  <span>{money(o.total)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <h2 className="mb-2 font-display text-2xl">{t.events.editTitle}</h2>
      <EventForm locale={locale} id={id} t={t.events} errorsText={t.errors} submit={t.common.save}
        initial={{ kind: event.kind, name: event.name, location: event.location, startsOn: event.startsOn, endsOn: event.endsOn, orderDeadline: event.orderDeadline ?? "", note: event.note }} />
      {orders.length === 0 && (
        <div className="mt-6">
          <ActionButton action={removeEvent} fields={{ locale, id }} confirmText={fill(t.events.removeConfirm, { name: event.name })}
            className="rounded-full border border-danger px-4 py-2 font-semibold text-danger hover:bg-red-50">{t.events.remove}</ActionButton>
        </div>
      )}
    </>
  );
}
