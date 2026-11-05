"use client";

import { useActionState, useId, useState } from "react";
import { Field, FormStatus, inputClass } from "@/components/Field";
import type { Dictionary } from "@/i18n/id";
import type { PaymentMethod } from "@/lib/db/schema";
import { savePayment, type PaymentState } from "../actions";

/** Phone photos are several MB: send a JPEG of at most 1600 px instead (well under the 800 KB limit). */
async function smaller(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("compress"))), "image/jpeg", 0.75));
}

export function PaymentForm({ locale, orderId, suggested, today, credit, t, errorsText }: {
  locale: string; orderId: number; suggested: number; today: string; credit: number;
  t: Dictionary["payments"]; errorsText: Dictionary["errors"];
}) {
  const uid = useId();
  const [state, action, pending] = useActionState<PaymentState, FormData>(async (prev, form) => {
    const file = form.get("proof");
    if (file instanceof File && file.size > 0 && file.type.startsWith("image/")) {
      try {
        form.set("proof", await smaller(file), "proof.jpg");
      } catch {
        // Not readable as an image here: send it as it is and let the server decide.
      }
    }
    return savePayment(prev, form);
  }, {});
  const [values, setValues] = useState({ amount: suggested ? String(suggested) : "", method: "transfer" as PaymentMethod, paidOn: today, note: "" });
  const errors = state.errors ?? {};
  const error = (name: string) => (errors[name] ? errorsText[errors[name] as keyof Dictionary["errors"]] ?? errors[name] : undefined);
  const set = (name: keyof typeof values) => (e: { target: { value: string } }) => setValues((v) => ({ ...v, [name]: e.target.value }));

  return (
    <form action={action} noValidate className="mt-4 space-y-3 rounded-2xl border border-line p-4">
      <h3 className="font-bold">{t.record}</h3>
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="orderId" value={orderId} />
      <FormStatus saved={state.savedAt ? t.saved : undefined} failed={Object.keys(errors).length ? errorsText.failed : undefined} />
      <div className="grid gap-3 sm:grid-cols-3">
        <Field id={`${uid}-amount`} label={t.amount} error={error("amount")}>
          {(d) => <input id={`${uid}-amount`} name="amount" value={values.amount} onChange={set("amount")} inputMode="numeric" aria-invalid={Boolean(error("amount"))} aria-describedby={d} className={inputClass(Boolean(error("amount")))} />}
        </Field>
        <Field id={`${uid}-method`} label={t.method}>
          {() => (
            <select id={`${uid}-method`} name="method" value={values.method} onChange={set("method")} className={inputClass(false)}>
              {(["transfer", "qris", "cash"] as const).map((m) => <option key={m} value={m}>{t.methods[m]}</option>)}
              {credit > 0 && <option value="credit">{t.methods.credit}</option>}
            </select>
          )}
        </Field>
        <Field id={`${uid}-paidOn`} label={t.paidOn} error={error("paidOn")}>
          {(d) => <input id={`${uid}-paidOn`} name="paidOn" type="date" value={values.paidOn} onChange={set("paidOn")} aria-invalid={Boolean(error("paidOn"))} aria-describedby={d} className={inputClass(Boolean(error("paidOn")))} />}
        </Field>
      </div>
      <Field id={`${uid}-proof`} label={t.proof} hint={t.proofHint} error={error("proof")}>
        {(d) => <input id={`${uid}-proof`} name="proof" type="file" accept="image/*" aria-invalid={Boolean(error("proof"))} aria-describedby={d} className="block w-full text-sm" />}
      </Field>
      <Field id={`${uid}-note`} label={t.note} error={error("note")}>
        {(d) => <input id={`${uid}-note`} name="note" value={values.note} onChange={set("note")} aria-describedby={d} className={inputClass(false)} />}
      </Field>
      <button type="submit" disabled={pending} className="rounded-full bg-primary px-6 py-2.5 font-semibold text-white hover:bg-primary-dark disabled:opacity-60">{t.record}</button>
    </form>
  );
}
