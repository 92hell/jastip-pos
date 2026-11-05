import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ActionButton } from "@/components/ConfirmButton";
import { fill } from "@/i18n";
import { currentLocale } from "@/i18n/server";
import { requireUser } from "@/lib/auth/current-user";
import { getDb } from "@/lib/db";
import { getEvent, shoppingList } from "@/lib/events";
import { waLink } from "@/lib/whatsapp";
import { changeItemStatus } from "../../../orders/actions";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await currentLocale();
  return { title: t.events.shoppingList };
}

export default async function ShoppingPage({ params }: PageProps<"/[lang]/events/[id]/shopping">) {
  const { t } = await currentLocale();
  return (
    <Suspense fallback={<p>{t.common.loading}</p>}>
      <Shopping params={params} />
    </Suspense>
  );
}

/** What to buy on this event, by store: tick what is bought, mark what is sold out and tell the client. */
async function Shopping({ params }: { params: PageProps<"/[lang]/events/[id]/shopping">["params"] }) {
  const { locale, t } = await currentLocale();
  await requireUser(locale);
  const id = Number((await params).id);
  const event = Number.isSafeInteger(id) ? await getEvent(getDb(), id) : null;
  if (!event) notFound();
  const groups = await shoppingList(getDb(), id);
  const all = groups.flatMap((g) => g.items).filter((i) => i.status !== "sold_out");
  const done = all.filter((i) => i.status === "bought").length;

  return (
    <>
      <Link href={`/${locale}/events/${id}`} className="text-primary underline">← {event.name}</Link>
      <h1 className="mt-2 font-display text-4xl">{fill(t.shopping.title, { name: event.name })}</h1>
      <p className="mt-1 text-muted">{t.shopping.intro}</p>
      <p className="my-4 font-semibold" role="status">{fill(t.shopping.progress, { done, total: all.length })}</p>
      {groups.length === 0 && <p className="rounded-3xl bg-white p-5 text-muted">{t.shopping.empty}</p>}
      {groups.map((group) => (
        <section key={group.store || "-"} aria-label={group.store || t.shopping.otherStore} className="mb-4 rounded-3xl bg-white p-4 shadow-sm">
          <h2 className="font-display text-2xl">{group.store || t.shopping.otherStore}</h2>
          <ul className="mt-2 divide-y divide-line">
            {group.items.map((item) => {
              const bought = item.status === "bought";
              const soldOut = item.status === "sold_out";
              const fields = { locale, orderId: item.orderId, itemId: item.itemId };
              return (
                <li key={item.itemId} className="flex flex-wrap items-center gap-3 py-3">
                  <div className="min-w-0 basis-full sm:basis-auto sm:flex-1">
                    <p className={`font-semibold ${bought || soldOut ? "text-muted line-through" : ""}`}>{item.name} ×{item.quantity}</p>
                    <p className="text-sm text-muted">
                      {fill(t.shopping.for, { client: item.clientName, order: item.orderNumber })}
                      {soldOut && item.soldOutResolution ? ` · ${t.items.statuses.sold_out}, ${t.items.resolutions[item.soldOutResolution]}` : ""}
                    </p>
                  </div>
                  {soldOut ? (
                    item.soldOutResolution === "waiting" && item.clientWhatsapp && (
                      <a href={waLink(item.clientWhatsapp, fill(t.items.soldOutMessage, { client: item.clientName, item: item.name }))}
                        rel="noopener noreferrer" aria-label={`${t.items.tellClient}: ${item.clientName}`} className="rounded-full border-2 border-ink px-3 py-1.5 text-sm font-semibold hover:bg-sky-soft">
                        {t.items.tellClient}
                      </a>
                    )
                  ) : (
                    <>
                      <ActionButton action={changeItemStatus} fields={{ ...fields, status: bought ? "requested" : "bought" }}
                        label={`${t.shopping.bought}: ${item.name}`} pressed={bought}
                        className={`rounded-full px-3 py-1.5 text-sm font-semibold ${bought ? "bg-success text-white" : "border-2 border-ink hover:bg-sky-soft"}`}>
                        {bought ? "✓ " : ""}{t.shopping.bought}
                      </ActionButton>
                      {!bought && (
                        <ActionButton action={changeItemStatus} fields={{ ...fields, status: "sold_out" }} label={`${t.shopping.soldOut}: ${item.name}`}
                          className="rounded-full border border-danger px-3 py-1.5 text-sm font-semibold text-danger hover:bg-red-50">
                          {t.shopping.soldOut}
                        </ActionButton>
                      )}
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </>
  );
}
