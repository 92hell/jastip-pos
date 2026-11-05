import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { currentLocale } from "@/i18n/server";
import { requireUser } from "@/lib/auth/current-user";
import { getDb } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { clientOptions, eventOptions } from "../form-data";
import { OrderForm } from "../OrderForm";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await currentLocale();
  return { title: t.orders.newTitle };
}

export default async function NewOrderPage({ searchParams }: PageProps<"/[lang]/orders/new">) {
  const { t } = await currentLocale();
  return (
    <>
      <h1 className="mb-4 font-display text-4xl">{t.orders.newTitle}</h1>
      <Suspense fallback={<p>{t.common.loading}</p>}>
        <NewOrder searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function NewOrder({ searchParams }: { searchParams: PageProps<"/[lang]/orders/new">["searchParams"] }) {
  const { locale, t } = await currentLocale();
  await requireUser(locale);
  const [clients, settings, events] = await Promise.all([clientOptions(getDb()), getSettings(getDb()), eventOptions(getDb(), t.events)]);
  if (clients.length === 0) {
    return (
      <p className="rounded-3xl bg-white p-5">
        {t.orders.needClient}{" "}
        <Link href={`/${locale}/clients/new`} className="font-semibold text-primary underline">{t.clients.add}</Link>
      </p>
    );
  }
  const query = await searchParams;
  const preselect = String(query.client ?? "");
  const event = String(query.event ?? "");
  return (
    <OrderForm locale={locale} clients={clients} events={events} noEventLabel={t.events.noEvent} voucherAmount={settings.voucherAmount} t={t.orders} errorsText={t.errors} resellerLabel={t.clients.reseller}
      initial={{
        clientId: clients.some((c) => String(c.id) === preselect) ? preselect : "",
        eventId: events.some((e) => String(e.id) === event) ? event : "",
        note: "", discount: "", dpPercent: "", applyVoucher: false, shipping: "", bundles: [],
        items: [{ key: 1, name: "", store: "", quantity: "1", unitPrice: "", feeMode: "per_item", feeAmount: "", feePercent: "", bundle: "" }],
      }} />
  );
}
