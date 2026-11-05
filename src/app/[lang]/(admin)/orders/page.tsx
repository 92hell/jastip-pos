import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { formatDate, rupiah } from "@/i18n";
import { currentLocale } from "@/i18n/server";
import { requireUser } from "@/lib/auth/current-user";
import { getDb } from "@/lib/db";
import { listOrders } from "@/lib/orders";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await currentLocale();
  return { title: t.orders.title };
}

export default async function OrdersPage({ searchParams }: PageProps<"/[lang]/orders">) {
  const { locale, t } = await currentLocale();
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-4xl">{t.orders.title}</h1>
        <Link href={`/${locale}/orders/new`} className="rounded-full bg-primary px-5 py-2.5 font-semibold text-white hover:bg-primary-dark">
          + {t.orders.add}
        </Link>
      </div>
      <Suspense fallback={<p className="mt-4">{t.common.loading}</p>}>
        <Orders searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Orders({ searchParams }: { searchParams: PageProps<"/[lang]/orders">["searchParams"] }) {
  const { locale, t } = await currentLocale();
  await requireUser(locale);
  const q = String((await searchParams).q ?? "").slice(0, 80);
  const orders = await listOrders(getDb(), { q });
  return (
    <>
      <form role="search" className="my-4 flex gap-2">
        <label htmlFor="q" className="sr-only">{t.orders.search}</label>
        <input id="q" name="q" type="search" defaultValue={q} placeholder={t.orders.search} className="min-w-0 flex-1 rounded-xl border border-line bg-white px-3 py-2.5" />
        <button type="submit" className="rounded-full border-2 border-ink px-4 font-semibold hover:bg-white">{t.clients.searchButton}</button>
      </form>
      {orders.length === 0 ? (
        <p className="rounded-3xl bg-white p-5 text-muted">{q ? t.orders.noMatch : t.orders.empty}</p>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-3xl bg-white shadow-sm">
          {orders.map((o) => (
            <li key={o.id}>
              <Link href={`/${locale}/orders/${o.id}`} className="grid grid-cols-[1fr_auto] gap-x-3 px-5 py-3 hover:bg-sky-soft">
                <span className="font-semibold">
                  {o.clientName}
                  {o.isReseller && <span className="ml-2 rounded-full bg-sky px-2 py-0.5 text-xs font-bold">{t.orders.reseller}</span>}
                </span>
                <span className="text-right font-semibold">{rupiah(o.total, locale)}</span>
                <span className="text-sm text-muted">{o.number}</span>
                <span className="text-right text-sm text-muted">{formatDate(o.createdAt, locale)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
