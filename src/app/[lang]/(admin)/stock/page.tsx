import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { fill, rupiah } from "@/i18n";
import { currentLocale } from "@/i18n/server";
import { requireUser } from "@/lib/auth/current-user";
import { getDb } from "@/lib/db";
import { listStock } from "@/lib/stock";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await currentLocale();
  return { title: t.stock.title };
}

export default async function StockPage({ searchParams }: PageProps<"/[lang]/stock">) {
  const { locale, t } = await currentLocale();
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-4xl">{t.stock.title}</h1>
        <Link href={`/${locale}/stock/new`} className="rounded-full bg-primary px-5 py-2.5 font-semibold text-white hover:bg-primary-dark">+ {t.stock.add}</Link>
      </div>
      <p className="mb-4 mt-1 max-w-2xl text-muted">{t.stock.intro}</p>
      <Suspense fallback={<p>{t.common.loading}</p>}>
        <Stock searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Stock({ searchParams }: { searchParams: PageProps<"/[lang]/stock">["searchParams"] }) {
  const { locale, t } = await currentLocale();
  await requireUser(locale);
  const rows = await listStock(getDb());
  if (rows.length === 0) return <p className="rounded-3xl bg-white p-5 text-muted">{t.stock.empty}</p>;
  // Opened from an event ("Sell from stock"): each item's page opens with that event chosen for the sale.
  const event = Number((await searchParams).event);
  const suffix = Number.isSafeInteger(event) && event > 0 ? `?event=${event}` : "";
  const money = (n: number) => rupiah(n, locale);
  const sum = (pick: (r: (typeof rows)[number]) => number) => rows.reduce((s, r) => s + pick(r), 0);
  const total = { value: sum((r) => Math.max(r.value, 0)), revenue: sum((r) => r.revenue), profit: sum((r) => r.profit) };
  const sold = sum((r) => r.sold);

  return (
    <div className="space-y-4">
      <section aria-labelledby="stock-summary" className="rounded-3xl bg-sky p-5">
        <h2 id="stock-summary" className="sr-only">{t.stock.summary}</h2>
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div><dt className="text-sm">{t.stock.summaryValue}</dt><dd className="text-xl font-bold">{money(total.value)}</dd></div>
          <div><dt className="text-sm">{t.stock.summarySold}</dt><dd className="text-xl font-bold">{fill(t.stock.units, { n: sold })}</dd></div>
          <div><dt className="text-sm">{t.stock.summaryRevenue}</dt><dd className="text-xl font-bold">{money(total.revenue)}</dd></div>
          <div><dt className="text-sm">{t.stock.summaryProfit}</dt><dd className="text-xl font-bold">{money(total.profit)}</dd></div>
        </dl>
      </section>
      <ul className="divide-y divide-line overflow-hidden rounded-3xl bg-white shadow-sm">
        {rows.map((r) => (
          <li key={r.id}>
            <Link href={`/${locale}/stock/${r.id}${suffix}`} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-5 py-3 hover:bg-sky-soft">
              <span className="min-w-0">
                <span className="block font-semibold">{r.name}</span>
                <span className="block text-sm text-muted">{[r.store, money(r.price)].filter(Boolean).join(" · ")}</span>
              </span>
              <span className={`rounded-full px-3 py-1 text-sm font-bold ${r.available > 0 ? "bg-sky" : "border border-muted text-muted"}`}>
                {r.available > 0 ? fill(t.stock.left, { n: r.available }) : t.stock.soldOutAll}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
