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
import { jakartaToday } from "@/lib/server/public-url";
import { getStockItem, type StockDetail, type StockOrderLine } from "@/lib/stock";
import { addMoreStock, recountStock, removeStockItem, saveStockItem, sellStock, undoStockMove } from "../actions";
import { eventChoices, itemFields, saleFields } from "../fields";
import { StockForm } from "../StockForm";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await currentLocale();
  return { title: t.stock.title };
}

export default async function StockItemPage(props: PageProps<"/[lang]/stock/[id]">) {
  const { t } = await currentLocale();
  return (
    <Suspense fallback={<p>{t.common.loading}</p>}>
      <StockItemDetail {...props} />
    </Suspense>
  );
}

async function StockItemDetail({ params, searchParams }: PageProps<"/[lang]/stock/[id]">) {
  const { locale, t } = await currentLocale();
  await requireUser(locale);
  const id = Number((await params).id);
  const item = Number.isSafeInteger(id) ? await getStockItem(getDb(), id) : null;
  if (!item) notFound();
  const query = await searchParams;
  const events = await eventChoices(getDb(), t);
  const forEvent = events.some((e) => e.value !== "" && e.value === String(query.event ?? "")) ? String(query.event) : "";
  const money = (n: number) => rupiah(n, locale);
  const s = t.stock;
  const card = "space-y-3 rounded-3xl bg-white p-5 shadow-sm";

  // History: her own entries and the orders that took from this item, newest first.
  type Entry = { key: string; day: string; move?: StockDetail["moves"][number]; line?: StockOrderLine };
  const history: Entry[] = [
    ...item.moves.map((m) => ({ key: `m${m.id}`, day: m.movedOn, move: m })),
    ...item.orderLines.map((o) => ({ key: `o${o.orderId}-${o.createdAt.getTime()}`, day: jakartaToday(o.createdAt), line: o })),
  ].sort((a, b) => b.day.localeCompare(a.day));

  return (
    <>
      <p className="mb-2"><Link href={`/${locale}/stock`} className="text-primary underline">← {s.title}</Link></p>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="font-display text-4xl">{item.name}</h1>
        <span className={`rounded-full px-3 py-1 text-sm font-bold ${item.available > 0 ? "bg-sky" : "border border-muted text-muted"}`}>
          {item.available > 0 ? fill(s.left, { n: item.available }) : s.soldOutAll}
        </span>
      </div>
      <p className="mb-4 text-muted">{[item.store, item.eventName].filter(Boolean).join(" · ")}</p>
      {query.saved === "1" && <div className="mb-4"><FormStatus saved={s.saved} /></div>}

      <section aria-labelledby="item-summary" className="mb-6 rounded-3xl bg-sky p-5">
        <h2 id="item-summary" className="sr-only">{s.summary}</h2>
        <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1">
          <dt>{s.unitCost}</dt><dd className="text-right">{money(item.unitCost)}</dd>
          <dt>{s.price}</dt><dd className="text-right">{money(item.price)}</dd>
          <dt>{s.summaryValue}</dt><dd className="text-right">{money(Math.max(item.value, 0))}</dd>
          <dt>{s.summarySold}</dt><dd className="text-right">{fill(s.units, { n: item.sold })}</dd>
          <dt>{s.summaryRevenue}</dt><dd className="text-right">{money(item.revenue)}</dd>
          <dt className="font-bold">{s.summaryProfit}</dt><dd className="text-right font-bold">{money(item.profit)}</dd>
        </dl>
      </section>

      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        {item.available > 0 && (
          <section aria-labelledby="sell" className={card}>
            <h2 id="sell" className="font-display text-2xl">{s.sell}</h2>
            <p className="text-sm text-muted">{s.sellHint}</p>
            <StockForm action={sellStock} locale={locale} id={id} inCard={false} fields={saleFields(t, events)} submit={s.sellSubmit} done={s.sold} errorsText={t.errors}
              initial={{ quantity: "1", unitPrice: String(item.price), method: "cash", eventId: forEvent, soldOn: jakartaToday(), note: "" }} />
          </section>
        )}
        <div className="space-y-4">
          <section aria-labelledby="add-more" className={card}>
            <h2 id="add-more" className="font-display text-2xl">{s.addMore}</h2>
            <StockForm action={addMoreStock} locale={locale} id={id} inCard={false} submit={s.addMoreSubmit} done={s.added} errorsText={t.errors}
              fields={[{ name: "quantity", label: s.quantity, kind: "number", resetTo: "" }, { name: "note", label: s.note, resetTo: "" }]}
              initial={{ quantity: "", note: "" }} />
          </section>
          <section aria-labelledby="recount" className={card}>
            <h2 id="recount" className="font-display text-2xl">{s.recount}</h2>
            <p className="text-sm text-muted">{s.recountHint}</p>
            <StockForm action={recountStock} locale={locale} id={id} inCard={false} submit={s.recountSubmit} done={s.recounted} errorsText={t.errors}
              fields={[{ name: "counted", label: s.counted, kind: "number" }, { name: "note", label: s.reason, resetTo: "" }]}
              initial={{ counted: String(Math.max(item.available, 0)), note: "" }} />
          </section>
        </div>
      </div>

      <section aria-labelledby="history" className={`mb-6 ${card}`}>
        <h2 id="history" className="font-display text-2xl">{s.history}</h2>
        <ul className="divide-y divide-line">
          {history.map((h) => (
            <li key={h.key} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2">
              {h.move ? (
                <>
                  <span className="min-w-0">
                    <span className="font-semibold">{s.moves[h.move.kind]} {h.move.quantity > 0 ? `+${h.move.quantity}` : `−${-h.move.quantity}`}</span>
                    <span className="block text-sm text-muted">
                      {[
                        formatDay(h.move.movedOn, locale),
                        h.move.unitPrice !== null ? `${money(h.move.unitPrice)} × ${-h.move.quantity}` : "",
                        h.move.method ? s.methods[h.move.method] : "",
                        h.move.eventName ?? "",
                        h.move.note,
                      ].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                  <ActionButton action={undoStockMove} fields={{ locale, id, moveId: h.move.id }} confirmText={s.undoConfirm}
                    label={`${s.undo}: ${s.moves[h.move.kind]} ${formatDay(h.move.movedOn, locale)}`}
                    className="rounded-full border border-danger px-3 py-1 text-sm font-semibold text-danger hover:bg-red-50">{s.undo}</ActionButton>
                </>
              ) : (
                <>
                  <Link href={`/${locale}/orders/${h.line!.orderId}`} className="min-w-0 hover:underline">
                    <span className="font-semibold">{s.moves.sale} −{h.line!.quantity}</span>
                    <span className="block text-sm text-muted">{formatDay(h.day, locale)} · {fill(s.inOrder, { number: h.line!.orderNumber, client: h.line!.clientName })}</span>
                  </Link>
                  <span>{money(h.line!.amount)}</span>
                </>
              )}
            </li>
          ))}
        </ul>
      </section>

      <h2 className="mb-2 font-display text-2xl">{s.edit}</h2>
      <StockForm action={saveStockItem} locale={locale} id={id} fields={itemFields(t, events, false)} submit={t.common.save} done={s.saved} errorsText={t.errors}
        initial={{ name: item.name, store: item.store, unitCost: String(item.unitCost), price: String(item.price), eventId: item.eventId ? String(item.eventId) : "", note: item.note }} />
      {item.orderLines.length === 0 && (
        <div className="mt-6">
          <ActionButton action={removeStockItem} fields={{ locale, id }} confirmText={fill(s.removeConfirm, { name: item.name })}
            className="rounded-full border border-danger px-4 py-2 font-semibold text-danger hover:bg-red-50">{s.remove}</ActionButton>
        </div>
      )}
    </>
  );
}
