import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { fill } from "@/i18n";
import { currentLocale } from "@/i18n/server";
import { requireUser } from "@/lib/auth/current-user";
import { listClients } from "@/lib/clients";
import { getDb } from "@/lib/db";
import { formatWhatsapp } from "@/lib/whatsapp";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await currentLocale();
  return { title: t.clients.title };
}

export default async function ClientsPage({ searchParams }: PageProps<"/[lang]/clients">) {
  const { locale, t } = await currentLocale();
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-4xl">{t.clients.title}</h1>
        <Link href={`/${locale}/clients/new`} className="rounded-full bg-primary px-5 py-2.5 font-semibold text-white hover:bg-primary-dark">
          + {t.clients.add}
        </Link>
      </div>
      <Suspense fallback={<p className="mt-4">{t.common.loading}</p>}>
        <Clients searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Clients({ searchParams }: { searchParams: PageProps<"/[lang]/clients">["searchParams"] }) {
  const { locale, t } = await currentLocale();
  await requireUser(locale);
  const q = String((await searchParams).q ?? "").slice(0, 80);
  const clients = await listClients(getDb(), q);
  return (
    <>
      <form role="search" className="my-4 flex gap-2">
        <label htmlFor="q" className="sr-only">{t.clients.search}</label>
        <input id="q" name="q" type="search" defaultValue={q} placeholder={t.clients.search} className="min-w-0 flex-1 rounded-xl border border-line bg-white px-3 py-2.5" />
        <button type="submit" className="rounded-full border-2 border-ink px-4 font-semibold hover:bg-white">{t.clients.searchButton}</button>
      </form>
      {clients.length === 0 ? (
        <p className="rounded-3xl bg-white p-5 text-muted">{q ? t.clients.noMatch : t.clients.empty}</p>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-3xl bg-white shadow-sm">
          {clients.map((c) => (
            <li key={c.id}>
              <Link href={`/${locale}/clients/${c.id}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-3 hover:bg-sky-soft">
                <span className="font-semibold">{c.name}</span>
                {c.isReseller && <span className="rounded-full bg-sky px-2 py-0.5 text-xs font-bold">{t.clients.reseller}</span>}
                <span className="ml-auto text-sm text-muted">
                  {c.whatsapp ? `${formatWhatsapp(c.whatsapp)} · ` : ""}
                  {fill(t.clients.orderCount, { n: c.orders })}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
