import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { fill } from "@/i18n";
import { currentLocale } from "@/i18n/server";
import { requireUser } from "@/lib/auth/current-user";
import { getDb } from "@/lib/db";
import { getOrder } from "@/lib/orders";
import { getSettings } from "@/lib/settings";
import { clientOptions, toFormValues } from "../../form-data";
import { OrderForm } from "../../OrderForm";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await currentLocale();
  return { title: t.orders.edit };
}

export default async function EditOrderPage({ params }: PageProps<"/[lang]/orders/[id]/edit">) {
  const { t } = await currentLocale();
  return (
    <Suspense fallback={<p>{t.common.loading}</p>}>
      <EditOrder params={params} />
    </Suspense>
  );
}

async function EditOrder({ params }: { params: PageProps<"/[lang]/orders/[id]/edit">["params"] }) {
  const { locale, t } = await currentLocale();
  await requireUser(locale);
  const id = Number((await params).id);
  const order = Number.isSafeInteger(id) ? await getOrder(getDb(), id) : null;
  if (!order) notFound();
  const [clients, settings] = await Promise.all([clientOptions(getDb()), getSettings(getDb())]);
  if (!clients.some((c) => c.id === order.clientId)) clients.unshift({ id: order.client.id, name: order.client.name, isReseller: order.client.isReseller });
  return (
    <>
      <h1 className="mb-4 font-display text-4xl">{fill(t.orders.editTitle, { number: order.number })}</h1>
      <OrderForm locale={locale} id={order.id} clients={clients} voucherAmount={settings.voucherAmount}
        t={t.orders} errorsText={t.errors} resellerLabel={t.clients.reseller} initial={toFormValues(order, locale)} />
    </>
  );
}
