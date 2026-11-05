import type { Metadata } from "next";
import { Suspense } from "react";
import { currentLocale } from "@/i18n/server";
import { requireUser } from "@/lib/auth/current-user";
import { getDb } from "@/lib/db";
import { saveStockItem } from "../actions";
import { eventChoices, itemFields } from "../fields";
import { StockForm } from "../StockForm";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await currentLocale();
  return { title: t.stock.newTitle };
}

export default async function NewStockPage() {
  const { t } = await currentLocale();
  return (
    <>
      <h1 className="mb-4 font-display text-4xl">{t.stock.newTitle}</h1>
      <Suspense fallback={<p>{t.common.loading}</p>}>
        <NewStock />
      </Suspense>
    </>
  );
}

async function NewStock() {
  const { locale, t } = await currentLocale();
  await requireUser(locale);
  const events = await eventChoices(getDb(), t);
  return (
    <StockForm action={saveStockItem} locale={locale} fields={itemFields(t, events, true)} submit={t.common.save} errorsText={t.errors}
      initial={{ name: "", store: "", quantity: "1", unitCost: "", price: "", eventId: "", note: "" }} />
  );
}
