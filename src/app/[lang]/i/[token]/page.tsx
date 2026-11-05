import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { Brand } from "@/components/Brand";
import { LanguageSwitch } from "@/components/LanguageSwitch";
import { fill, formatDate, formatDay, rupiah } from "@/i18n";
import { currentLocale } from "@/i18n/server";
import { getDb } from "@/lib/db";
import { getInvoice } from "@/lib/invoice";

/** Private to whoever has the link: kept out of search engines, and the link is not passed on to other sites. */
export async function generateMetadata(): Promise<Metadata> {
  const { t } = await currentLocale();
  return { title: t.invoice.title.replace(" {number}", ""), robots: { index: false, follow: false }, referrer: "no-referrer" };
}

export default async function InvoicePage({ params }: PageProps<"/[lang]/i/[token]">) {
  const { t } = await currentLocale();
  return (
    <main id="main" className="mx-auto max-w-2xl px-4 py-6">
      <Suspense fallback={<p>{t.common.loading}</p>}>
        <InvoiceView params={params} />
      </Suspense>
    </main>
  );
}

async function InvoiceView({ params }: { params: PageProps<"/[lang]/i/[token]">["params"] }) {
  await connection();
  const { locale, t } = await currentLocale();
  const token = (await params).token;
  const invoice = await getInvoice(getDb(), token);
  const money = (n: number) => rupiah(n, locale);
  if (!invoice) return <p className="rounded-3xl bg-white p-6 shadow-sm">{t.invoice.notFound}</p>;
  const { balance, shop } = invoice;
  const rules = shop.rules.split("\n").map((r) => r.trim()).filter(Boolean);
  const chat = shop.whatsapp.startsWith("https://") ? shop.whatsapp : null;

  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-3 print:hidden">
        <Brand name={shop.shopName} />
        <LanguageSwitch current={locale} path={`/i/${token}`} label={t.common.language} />
      </div>
      <article className="rounded-3xl bg-white p-6 shadow-sm">
        <h1 className="font-display text-4xl">{fill(t.invoice.title, { number: invoice.number })}</h1>
        <p className="text-muted">
          {fill(t.invoice.for, { client: invoice.clientName })} · {formatDate(invoice.createdAt, locale)}{invoice.eventName ? ` · ${invoice.eventName}` : ""}
        </p>
        <p className="mt-2">
          <span className="rounded-full bg-sky px-3 py-1 text-sm font-bold">{t.payments.statuses[balance.status]}</span>
        </p>

        <ul className="mt-4 divide-y divide-line">
          {invoice.items.map((item, i) => (
            <li key={i} className="grid grid-cols-[1fr_auto] gap-x-4 py-2">
              <span className={`font-semibold ${item.status === "sold_out" ? "text-muted line-through" : ""}`}>{item.name}</span>
              <span className="text-right">{money(item.subtotal + item.fee)}</span>
              <span className="text-sm text-muted">
                {item.quantity} × {money(item.unitPrice)} · {t.items.statuses[item.status as keyof typeof t.items.statuses]}
                {item.soldOutResolution ? ` (${t.items.resolutions[item.soldOutResolution as keyof typeof t.items.resolutions]})` : ""}
              </span>
            </li>
          ))}
          {invoice.bundles.map((b, i) => (
            <li key={`b${i}`} className="grid grid-cols-[1fr_auto] gap-x-4 py-2">
              <span>{fill(t.orders.bundleLine, { label: b.label })}</span>
              <span className="text-right">{money(b.fee)}</span>
            </li>
          ))}
        </ul>

        <dl className="mt-4 grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 rounded-2xl bg-sky-soft p-4">
          {invoice.discount > 0 && (<><dt>{t.orders.discountLine}</dt><dd className="text-right">− {money(invoice.discount)}</dd></>)}
          {invoice.voucher > 0 && (<><dt>{t.orders.voucherLine}</dt><dd className="text-right">− {money(invoice.voucher)}</dd></>)}
          <dt>{t.orders.shippingLine}</dt><dd className="text-right">{invoice.shipping === null ? t.orders.shippingUnknown : money(invoice.shipping)}</dd>
          <dt className="font-bold">{t.orders.totalLine}</dt><dd className="text-right font-bold">{money(invoice.total)}</dd>
          <dt>{t.payments.paid}</dt><dd className="text-right">{money(balance.paid)}</dd>
          {balance.dpDue > 0 && (<><dt>{t.payments.dpDue}</dt><dd className="text-right">{money(balance.dpDue)}</dd></>)}
          <dt className="text-lg font-bold">{t.payments.due}</dt><dd className="text-right text-lg font-bold">{money(balance.due)}</dd>
        </dl>

        {invoice.payments.length > 0 && (
          <section aria-labelledby="inv-history" className="mt-4">
            <h2 id="inv-history" className="font-bold">{t.invoice.history}</h2>
            <ul className="mt-1 text-sm">
              {invoice.payments.map((p, i) => (
                <li key={i}>{formatDay(p.paidOn, locale)}: {t.payments.kinds[p.kind as keyof typeof t.payments.kinds]} {money(p.amount)}</li>
              ))}
            </ul>
          </section>
        )}
        {(invoice.courier || invoice.trackingNumber) && (
          <p className="mt-3 font-semibold">{fill(t.invoice.tracking, { courier: invoice.courier, tracking: invoice.trackingNumber })}</p>
        )}

        {balance.due > 0 && shop.paymentAccounts.length > 0 && (
          <section aria-labelledby="inv-pay" className="mt-4 rounded-2xl border-2 border-sky p-4">
            <h2 id="inv-pay" className="font-bold">{t.invoice.payTo}</h2>
            <ul className="mt-1 space-y-1">
              {shop.paymentAccounts.map((a, i) => (
                <li key={i}><span className="font-semibold">{a.bank}</span> {a.number} · a.n. {a.holder}</li>
              ))}
            </ul>
            <p className="mt-2 text-sm text-muted">{t.invoice.payNote}</p>
          </section>
        )}
        {rules.length > 0 && (
          <section aria-labelledby="inv-rules" className="mt-4 text-sm">
            <h2 id="inv-rules" className="font-bold">{t.invoice.rules}</h2>
            <ul className="mt-1 list-disc pl-5">{rules.map((r) => <li key={r}>{r}</li>)}</ul>
          </section>
        )}
      </article>
      <p className="mt-4 text-center text-sm text-muted print:hidden">
        {shop.instagram && <a href={`https://instagram.com/${shop.instagram}`} rel="noopener noreferrer" className="underline">@{shop.instagram}</a>}
        {chat && <> · <a href={chat} rel="noopener noreferrer" className="underline">WhatsApp</a></>}
      </p>
    </>
  );
}

