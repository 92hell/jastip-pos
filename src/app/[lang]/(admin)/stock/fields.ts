import "server-only";
import type { Dictionary } from "@/i18n/id";
import type { Db } from "@/lib/db";
import { listEvents } from "@/lib/events";
import type { FieldSpec } from "./StockForm";

/** Every event, newest first, labelled with its kind: where stock was bought, or sold. */
export async function eventChoices(db: Db, t: Dictionary) {
  const events = await listEvents(db);
  return [
    { value: "", label: t.stock.noEvent },
    ...events.map((e) => ({ value: String(e.id), label: `${e.name} (${t.events.kinds[e.kind]})` })),
  ];
}

export function itemFields(t: Dictionary, events: FieldSpec["options"], withQuantity: boolean): FieldSpec[] {
  const s = t.stock;
  return [
    { name: "name", label: s.name },
    { name: "store", label: s.store },
    ...(withQuantity ? [{ name: "quantity", label: s.quantity, kind: "number" as const }] : []),
    { name: "unitCost", label: s.unitCost, hint: s.unitCostHint, kind: "amount" },
    { name: "price", label: s.price, hint: s.priceHint, kind: "amount" },
    { name: "eventId", label: s.boughtOn, kind: "select", options: events },
    { name: "note", label: s.note, kind: "textarea" },
  ];
}

export function saleFields(t: Dictionary, events: FieldSpec["options"]): FieldSpec[] {
  const s = t.stock;
  return [
    { name: "quantity", label: s.quantity, kind: "number", resetTo: "1" },
    { name: "unitPrice", label: s.unitPrice, hint: t.orders.amountHint, kind: "amount" },
    { name: "method", label: s.method, kind: "select", options: (["cash", "qris", "transfer"] as const).map((m) => ({ value: m, label: s.methods[m] })) },
    { name: "eventId", label: s.soldAt, kind: "select", options: events },
    { name: "soldOn", label: s.soldOn, kind: "date" },
    { name: "note", label: s.note, kind: "textarea", resetTo: "" },
  ];
}
