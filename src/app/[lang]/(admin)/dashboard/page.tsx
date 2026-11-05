import type { Metadata } from "next";
import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { fill, rupiah } from "@/i18n";
import { currentLocale } from "@/i18n/server";
import { requireUser } from "@/lib/auth/current-user";
import { getDashboard, type WorkItem } from "@/lib/dashboard";
import { getDb } from "@/lib/db";
import { getSettings } from "@/lib/settings";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await currentLocale();
  return { title: t.nav.dashboard };
}

export default async function DashboardPage() {
  const { t } = await currentLocale();
  return (
    <Suspense fallback={<p>{t.common.loading}</p>}>
      <Dashboard />
    </Suspense>
  );
}

/** What needs doing today, each linking to where it is done; then the money. */
async function Dashboard() {
  const { locale, t } = await currentLocale();
  const user = await requireUser(locale);
  const [d, settings] = await Promise.all([getDashboard(getDb()), getSettings(getDb())]);
  const money = (n: number) => rupiah(n, locale);
  const td = t.dashboard;
  const items = (list: WorkItem[]) =>
    list.slice(0, 8).map((i, k) => (
      <li key={k}>
        <Link href={`/${locale}/orders/${i.orderId}`} className="underline">{fill(td.itemLine, { item: i.itemName, qty: i.quantity, client: i.clientName })}</Link>
      </li>
    ));
  const nothingToDo = !d.toBuy.length && !d.waitingForClient.length && !d.toPack.length && !d.toShip.length && !d.dpDue.length && !d.overpaid.length;

  return (
    <>
      <h1 className="font-display text-4xl">{fill(td.title, { name: user.displayName })}</h1>
      <p className="mt-1 text-muted">{td.intro}</p>

      <section aria-labelledby="money" className="mt-6">
        <h2 id="money" className="sr-only">{td.money}</h2>
        <dl className="grid gap-3 sm:grid-cols-3">
          {[
            [td.outstanding, d.money.outstanding],
            [td.received, d.money.receivedThisMonth],
            [td.fees, d.money.feesThisMonth],
          ].map(([label, amount]) => (
            <div key={label as string} className="rounded-3xl bg-white p-4 shadow-sm">
              <dt className="text-sm text-muted">{label}</dt>
              <dd className="mt-1 text-2xl font-bold">{money(amount as number)}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section aria-labelledby="todo" className="mt-6">
        <h2 id="todo" className="font-display text-3xl">{td.todo}</h2>
        {nothingToDo && <p className="mt-2 rounded-3xl bg-white p-5 shadow-sm">{td.allDone}</p>}
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          {d.toBuy.length > 0 && (
            <Card title={td.toBuy.replace("{n}", String(d.toBuy.reduce((s, e) => s + e.quantity, 0)))}>
              {d.toBuy.map((e) => (
                <li key={e.eventId ?? "none"}>
                  {e.eventId ? (
                    <Link href={`/${locale}/events/${e.eventId}/shopping`} className="underline">{e.eventName}</Link>
                  ) : (
                    <Link href={`/${locale}/orders`} className="underline">{td.toBuyOneOff}</Link>
                  )}{" "}
                  ×{e.quantity}
                </li>
              ))}
            </Card>
          )}
          {d.waitingForClient.length > 0 && <Card title={td.waiting} tone="alert">{items(d.waitingForClient)}</Card>}
          {d.toPack.length > 0 && <Card title={td.toPack}>{items(d.toPack)}</Card>}
          {d.toShip.length > 0 && <Card title={td.toShip}>{items(d.toShip)}</Card>}
          {d.dpDue.length > 0 && (
            <Card title={td.dpDue}>
              {d.dpDue.slice(0, 8).map((o) => (
                <li key={o.id}><Link href={`/${locale}/orders/${o.id}`} className="underline">{fill(td.dpLine, { client: o.clientName, amount: money(o.balance.dpDue) })}</Link></li>
              ))}
            </Card>
          )}
          {d.overpaid.length > 0 && (
            <Card title={td.overpaid} tone="alert">
              {d.overpaid.map((o) => (
                <li key={o.id}><Link href={`/${locale}/orders/${o.id}`} className="underline">{fill(td.overpaidLine, { client: o.clientName, amount: money(o.balance.overpaid) })}</Link></li>
              ))}
            </Card>
          )}
        </div>
      </section>

      {settings.paymentAccounts.length === 0 && (
        <div className="mt-6 rounded-3xl bg-white p-5 shadow-sm">
          <p>{td.next}</p>
          <Link href={`/${locale}/settings`} className="mt-3 inline-block rounded-full bg-primary px-5 py-2.5 font-semibold text-white hover:bg-primary-dark">{td.openSettings}</Link>
        </div>
      )}
    </>
  );
}

function Card({ title, tone, children }: { title: string; tone?: "alert"; children: ReactNode }) {
  return (
    <div className={`rounded-3xl p-4 shadow-sm ${tone === "alert" ? "bg-amber-50" : "bg-white"}`}>
      <h3 className="font-bold">{title}</h3>
      <ul className="mt-1 space-y-1 text-sm">{children}</ul>
    </div>
  );
}
