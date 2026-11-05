"use client";

import { useActionState, useId, useState } from "react";
import { Field, inputClass } from "@/components/Field";
import type { Dictionary } from "@/i18n/id";
import { ITEM_STATUSES, type ItemStatus } from "@/lib/db/schema";
import { changeItemStatus, replaceItem, type ReplaceState } from "../actions";

type Common = { locale: string; orderId: number; itemId: number; itemName: string; t: Dictionary["items"] };

/** Status of one item: choose, then save (changing a select alone does nothing, as screen-reader users expect). */
export function StatusControl({ locale, orderId, itemId, itemName, status, t, save }: Common & { status: ItemStatus; save: string }) {
  const uid = useId();
  const [value, setValue] = useState(status);
  return (
    <form action={changeItemStatus} className="flex items-center gap-2">
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="orderId" value={orderId} />
      <input type="hidden" name="itemId" value={itemId} />
      <label htmlFor={`${uid}-status`} className="sr-only">{t.statusOf.replace("{name}", itemName)}</label>
      <select id={`${uid}-status`} name="status" value={value} onChange={(e) => setValue(e.target.value as ItemStatus)}
        className="rounded-xl border border-line bg-white px-2 py-1.5 text-sm">
        {ITEM_STATUSES.map((s) => <option key={s} value={s}>{t.statuses[s]}</option>)}
      </select>
      {value !== status && (
        <button type="submit" className="rounded-full bg-primary px-3 py-1.5 text-sm font-semibold text-white hover:bg-primary-dark">{save}</button>
      )}
    </form>
  );
}

/** A sold-out item the client chose to swap: the similar item's name, store and price. */
export function ReplaceForm({ locale, orderId, itemId, itemName, t, errorsText }: Common & { errorsText: Dictionary["errors"] }) {
  const uid = useId();
  const [state, action, pending] = useActionState<ReplaceState, FormData>(replaceItem, {});
  const [values, setValues] = useState({ name: "", store: "", unitPrice: "" });
  const errors = state.errors ?? {};
  const error = (name: string) => (errors[name] ? errorsText[errors[name] as keyof Dictionary["errors"]] ?? errors[name] : undefined);
  const input = (name: "name" | "store" | "unitPrice", label: string) => (
    <Field id={`${uid}-${name}`} label={label} error={error(name)}>
      {(describedBy) => (
        <input id={`${uid}-${name}`} name={name} value={values[name]} inputMode={name === "unitPrice" ? "numeric" : undefined} autoComplete="off"
          onChange={(e) => setValues((v) => ({ ...v, [name]: e.target.value }))}
          aria-invalid={Boolean(error(name))} aria-describedby={describedBy} className={inputClass(Boolean(error(name)))} />
      )}
    </Field>
  );
  return (
    <details className="w-full rounded-2xl border border-line p-3">
      <summary aria-label={`${t.replace}: ${itemName}`} className="cursor-pointer font-semibold">{t.replace}</summary>
      <form action={action} noValidate className="mt-3 grid gap-3 sm:grid-cols-[1.4fr_1fr_1fr_auto] sm:items-end">
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="orderId" value={orderId} />
        <input type="hidden" name="itemId" value={itemId} />
        {input("name", t.replacementName)}
        {input("store", t.replacementStore)}
        {input("unitPrice", t.replacementPrice)}
        <button type="submit" disabled={pending} className="h-11 rounded-full bg-primary px-4 font-semibold text-white hover:bg-primary-dark disabled:opacity-60">{t.replaceSubmit}</button>
      </form>
    </details>
  );
}
