import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ActionButton } from "@/components/ConfirmButton";
import { FormStatus } from "@/components/Field";
import { fill, formatDate, rupiah } from "@/i18n";
import { currentLocale } from "@/i18n/server";
import { requireUser } from "@/lib/auth/current-user";
import { getDb } from "@/lib/db";
import { formatPercent } from "@/lib/money";
import { getOrder } from "@/lib/orders";
import { waLink } from "@/lib/whatsapp";
import { cancelItem, shipOrder } from "../actions";
import { ReplaceForm, StatusControl } from "./ItemControls";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await currentLocale();
  return { title: t.orders.title };
}

export default async function OrderPage(props: PageProps<"/[lang]/orders/[id]">) {
  const { t } = await currentLocale();
  return (
    <Suspense fallback={<p>{t.common.loading}</p>}>
      <OrderDetailView {...props} />
    </Suspense>
  );
}

async function OrderDetailView({ params, searchParams }: PageProps<"/[lang]/orders/[id]">) {
  const { locale, t } = await currentLocale();
  await requireUser(locale);
  const id = Number((await params).id);
  const order = Number.isSafeInteger(id) ? await getOrder(getDb(), id) : null;
  if (!order) notFound();
  const saved = (await searchParams).saved === "1";
  const money = (n: number) => rupiah(n, locale);
  const bundleLabel = new Map(order.bundles.map((b, i) => [b.id, b.label || fill(t.orders.bundleN, { n: i + 1 })]));
  const feeText = (item: (typeof order.items)[number]) => {
    switch (item.feeMode) {
      case "per_item": return fill(t.orders.feeOf.per_item, { amount: money(item.feeAmount ?? 0) });
      case "percent": return fill(t.orders.feeOf.percent, { percent: formatPercent(item.feeBasisPoints ?? 0, locale) });
      case "bundle": return `${t.orders.feeOf.bundle}: ${bundleLabel.get(item.bundleId ?? 0) ?? ""}`;
      default: return t.orders.feeOf.nett;
    }
  };

  return (
    <>
      <div className="mb-1 flex flex-wrap items-center gap-3">
        <h1 className="font-display text-4xl">{order.number}</h1>
        <div className="ml-auto flex flex-wrap gap-2">
          {order.client.whatsapp && (
            <a href={waLink(order.client.whatsapp)} rel="noopener noreferrer" className="rounded-full border-2 border-ink px-4 py-2 font-semibold hover:bg-white">{t.clients.chat}</a>
          )}
          <Link href={`/${locale}/orders/${order.id}/edit`} className="rounded-full bg-primary px-5 py-2 font-semibold text-white hover:bg-primary-dark">{t.orders.edit}</Link>
        </div>
      </div>
      <p className="mb-4 text-muted">
        {order.client.anonymizedAt ? order.client.name : (
          <Link href={`/${locale}/clients/${order.client.id}`} className="font-semibold text-ink underline">{order.client.name}</Link>
        )}
        {order.client.isReseller && <span className="ml-2 rounded-full bg-sky px-2 py-0.5 text-xs font-bold text-ink">{t.orders.reseller}</span>}
        {order.event && (
          <>
            {" · "}
            <Link href={`/${locale}/events/${order.event.id}`} className="text-ink underline">{order.event.name}</Link>
          </>
        )}
        {" · "}{fill(t.orders.createdAt, { date: formatDate(order.createdAt, locale) })}
      </p>
      {saved && <div className="mb-4"><FormStatus saved={fill(t.orders.created, { number: order.number })} /></div>}

      <section aria-labelledby="order-items" className="rounded-3xl bg-white p-5 shadow-sm">
        <h2 id="order-items" className="font-display text-2xl">{t.orders.items}</h2>
        <ul className="mt-2 divide-y divide-line">
          {order.items.map((item) => {
            const soldOut = item.status === "sold_out";
            const fields = { locale, orderId: order.id, itemId: item.id };
            const replaced = item.replacesItemId ? order.items.find((x) => x.id === item.replacesItemId) : undefined;
            return (
              <li key={item.id} className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 py-3">
                <span className={`font-semibold ${soldOut ? "text-muted line-through" : ""}`}>{item.name}</span>
                <span className="text-right font-semibold">{money(item.subtotal)}</span>
                <span className="text-sm text-muted">
                  {item.quantity} × {money(item.unitPrice)}{item.store ? ` · ${item.store}` : ""} · {feeText(item)}
                  {replaced ? ` · ${fill(t.items.replaces, { name: replaced.name })}` : ""}
                </span>
                <span className="text-right text-sm text-muted">{item.fee ? `+ ${money(item.fee)}` : ""}</span>
                <div className="col-span-2 mt-1 flex flex-wrap items-center gap-2">
                  {/* Keyed by status: when the saved status changes (e.g. shipped), the picker starts from it again. */}
                  <StatusControl key={`${item.id}-${item.status}`} {...fields} itemName={item.name} status={item.status} t={t.items} save={t.common.save} />
                  {soldOut && item.soldOutResolution && (
                    <span className="rounded-full bg-red-50 px-3 py-1 text-sm font-semibold text-danger">{t.items.resolutions[item.soldOutResolution]}</span>
                  )}
                  {soldOut && item.soldOutResolution === "waiting" && (
                    <>
                      {order.client.whatsapp && (
                        <a href={waLink(order.client.whatsapp, fill(t.items.soldOutMessage, { client: order.client.name, item: item.name }))}
                          rel="noopener noreferrer" className="rounded-full border-2 border-ink px-3 py-1 text-sm font-semibold hover:bg-sky-soft">
                          {t.items.tellClient}
                        </a>
                      )}
                      <ActionButton action={cancelItem} fields={fields} label={`${t.items.cancel}: ${item.name}`}
                        className="rounded-full border border-danger px-3 py-1 text-sm font-semibold text-danger hover:bg-red-50">
                        {t.items.cancel}
                      </ActionButton>
                      <ReplaceForm {...fields} itemName={item.name} t={t.items} errorsText={t.errors} />
                    </>
                  )}
                </div>
              </li>
            );
          })}
          {order.bundles.map((b, i) => (
            <li key={b.id} className="grid grid-cols-[1fr_auto] gap-x-4 py-3">
              <span>{fill(t.orders.bundleLine, { label: b.label || fill(t.orders.bundleN, { n: i + 1 }) })}</span>
              <span className="text-right">+ {money(order.items.some((it) => it.bundleId === b.id) ? b.fee : 0)}</span>
            </li>
          ))}
        </ul>
        {order.note && <p className="mt-3 rounded-2xl bg-sky-soft p-3">{order.note}</p>}
      </section>

      <section aria-labelledby="order-shipping" className="mt-4 rounded-3xl bg-white p-5 shadow-sm">
        <h2 id="order-shipping" className="font-display text-2xl">{t.shipping.title}</h2>
        {order.shippedAt && (
          <p className="mt-2 font-semibold">
            {fill(t.shipping.shippedOn, { date: formatDate(order.shippedAt, locale) })}
            {order.courier || order.trackingNumber ? ` · ${[order.courier, order.trackingNumber].filter(Boolean).join(" ")}` : ""}
          </p>
        )}
        <form action={shipOrder} className="mt-3 grid gap-3 sm:grid-cols-[1fr_1.5fr_auto] sm:items-end">
          <input type="hidden" name="locale" value={locale} />
          <input type="hidden" name="orderId" value={order.id} />
          <div>
            <label htmlFor="ship-courier" className="mb-1 block font-semibold">{t.shipping.courier}</label>
            <input id="ship-courier" name="courier" defaultValue={order.courier} autoComplete="off" className="w-full rounded-xl border border-line bg-white px-3 py-2.5" />
          </div>
          <div>
            <label htmlFor="ship-tracking" className="mb-1 block font-semibold">{t.shipping.trackingNumber}</label>
            <input id="ship-tracking" name="trackingNumber" defaultValue={order.trackingNumber} autoComplete="off" className="w-full rounded-xl border border-line bg-white px-3 py-2.5" />
          </div>
          <button type="submit" className="h-11 rounded-full bg-primary px-5 font-semibold text-white hover:bg-primary-dark">{t.shipping.submit}</button>
        </form>
        <p className="mt-2 text-sm text-muted">{t.shipping.hint}</p>
      </section>

      <section aria-labelledby="order-summary" className="mt-4 rounded-3xl bg-sky p-5">
        <h2 id="order-summary" className="font-display text-2xl">{t.orders.summary}</h2>
        <dl className="mt-2 grid grid-cols-[1fr_auto] gap-x-4 gap-y-1">
          <dt>{t.orders.itemsTotal}</dt><dd className="text-right">{money(order.itemsTotal)}</dd>
          <dt>{t.orders.feesTotal}</dt><dd className="text-right">{money(order.feesTotal)}</dd>
          {order.discount > 0 && (<><dt>{t.orders.discountLine}</dt><dd className="text-right">− {money(order.discount)}</dd></>)}
          {order.voucher > 0 && (<><dt>{t.orders.voucherLine}</dt><dd className="text-right">− {money(order.voucher)}</dd></>)}
          <dt>{t.orders.shippingLine}</dt><dd className="text-right">{order.shipping === null ? t.orders.shippingUnknown : money(order.shipping)}</dd>
          <dt className="mt-1 border-t border-ink pt-1 text-lg font-bold">{t.orders.totalLine}</dt>
          <dd className="mt-1 border-t border-ink pt-1 text-right text-lg font-bold">{money(order.total)}</dd>
        </dl>
      </section>
    </>
  );
}
