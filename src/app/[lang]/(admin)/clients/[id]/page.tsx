import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { FormStatus } from "@/components/Field";
import { fill, formatDate, rupiah } from "@/i18n";
import { currentLocale } from "@/i18n/server";
import { requireUser } from "@/lib/auth/current-user";
import { getClient } from "@/lib/clients";
import { getDb } from "@/lib/db";
import { listOrders } from "@/lib/orders";
import { clientCredit } from "@/lib/payments";
import { waLink } from "@/lib/whatsapp";
import { ClientForm } from "../ClientForm";
import { DeleteClient } from "../DeleteClient";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await currentLocale();
  return { title: t.clients.editTitle };
}

export default async function ClientPage(props: PageProps<"/[lang]/clients/[id]">) {
  const { t } = await currentLocale();
  return (
    <Suspense fallback={<p>{t.common.loading}</p>}>
      <ClientDetail {...props} />
    </Suspense>
  );
}

async function ClientDetail({ params, searchParams }: PageProps<"/[lang]/clients/[id]">) {
  const { locale, t } = await currentLocale();
  await requireUser(locale);
  const id = Number((await params).id);
  const client = Number.isSafeInteger(id) ? await getClient(getDb(), id) : null;
  if (!client || client.anonymizedAt) notFound();
  const saved = (await searchParams).saved === "1";
  const orders = await listOrders(getDb(), { clientId: id });
  const credit = await clientCredit(getDb(), id);

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h1 className="font-display text-4xl">{client.name}</h1>
        {client.isReseller && <span className="rounded-full bg-sky px-3 py-1 text-sm font-bold">{t.clients.reseller}</span>}
        <div className="ml-auto flex flex-wrap gap-2">
          {client.whatsapp && (
            <a href={waLink(client.whatsapp)} rel="noopener noreferrer" className="rounded-full border-2 border-ink px-4 py-2 font-semibold hover:bg-white">
              {t.clients.chat}
            </a>
          )}
          <Link href={`/${locale}/orders/new?client=${client.id}`} className="rounded-full bg-primary px-4 py-2 font-semibold text-white hover:bg-primary-dark">
            + {t.clients.newOrder}
          </Link>
        </div>
      </div>
      {saved && <div className="mb-4"><FormStatus saved={t.clients.saved} /></div>}
      {credit > 0 && <p className="mb-4 rounded-2xl bg-sky p-3 font-semibold">{fill(t.payments.credit, { amount: rupiah(credit, locale) })}</p>}

      <section aria-labelledby="client-orders" className="mb-6 rounded-3xl bg-white p-5 shadow-sm">
        <h2 id="client-orders" className="font-display text-2xl">{t.clients.ordersTitle}</h2>
        {orders.length === 0 ? (
          <p className="mt-2 text-muted">{t.clients.noOrders}</p>
        ) : (
          <ul className="mt-2 divide-y divide-line">
            {orders.map((o) => (
              <li key={o.id}>
                <Link href={`/${locale}/orders/${o.id}`} className="flex flex-wrap justify-between gap-2 py-2 hover:underline">
                  <span className="font-semibold">{o.number}</span>
                  <span className="text-muted">{formatDate(o.createdAt, locale)} · {rupiah(o.total, locale)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <h2 className="mb-2 font-display text-2xl">{t.clients.editTitle}</h2>
      <ClientForm locale={locale} id={client.id} t={t.clients} errorsText={t.errors} submit={t.common.save}
        initial={{ name: client.name, whatsapp: client.whatsapp, address: client.address, notes: client.notes, isReseller: client.isReseller }} />
      <div className="mt-6">
        <DeleteClient locale={locale} id={client.id} label={t.clients.remove} confirmText={fill(t.clients.removeConfirm, { name: client.name })} />
      </div>
    </>
  );
}
