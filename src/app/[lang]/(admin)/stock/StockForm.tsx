"use client";

import { useActionState, useId, useState } from "react";
import { Field, FormStatus, inputClass } from "@/components/Field";
import type { Locale } from "@/i18n";
import type { Dictionary } from "@/i18n/id";
import type { StockState } from "./actions";

export type FieldSpec = {
  name: string;
  label: string;
  hint?: string;
  kind?: "text" | "amount" | "number" | "date" | "select" | "textarea";
  options?: { value: string; label: string }[];
  /** After a successful save, this field goes back to this value (others keep what was typed, handy for the next sale). */
  resetTo?: string;
};

/**
 * A stock form posting to a Server Action: the item itself, a direct sale, more stock, or a recount.
 * Controlled fields, so what she typed stays after a refused save.
 */
export function StockForm({ action, locale, id, fields, initial, submit, done, errorsText, inCard = true }: {
  action: (state: StockState, form: FormData) => Promise<StockState>;
  locale: Locale;
  id?: number;
  fields: FieldSpec[];
  initial: Record<string, string>;
  submit: string;
  done?: string;
  errorsText: Dictionary["errors"];
  inCard?: boolean;
}) {
  const [state, formAction, pending] = useActionState<StockState, FormData>(action, {});
  // Unique per form: Next.js keeps recently visited pages (with their forms) hidden in the page.
  const uid = useId();
  const [values, setValues] = useState(initial);
  const [seen, setSeen] = useState(state.doneAt);
  if (state.doneAt !== seen) {
    setSeen(state.doneAt);
    setValues((v) => ({ ...v, ...Object.fromEntries(fields.filter((f) => f.resetTo !== undefined).map((f) => [f.name, f.resetTo!])) }));
  }
  const errors = state.errors ?? {};
  const error = (name: string) => (errors[name] ? errorsText[errors[name] as keyof Dictionary["errors"]] ?? errors[name] : undefined);

  return (
    <form action={formAction} noValidate className={`space-y-4 ${inCard ? "rounded-3xl bg-white p-5 shadow-sm" : ""}`}>
      <input type="hidden" name="locale" value={locale} />
      {id && <input type="hidden" name="id" value={id} />}
      <FormStatus saved={state.doneAt && done ? done : undefined} failed={Object.keys(errors).length ? errorsText.failed : undefined} />
      <div className="grid gap-4 sm:grid-cols-2">
        {fields.map((f) => {
          const fid = `${uid}-${f.name}`;
          const err = error(f.name);
          const common = {
            id: fid, name: f.name, value: values[f.name] ?? "",
            onChange: (e: { target: { value: string } }) => setValues((v) => ({ ...v, [f.name]: e.target.value })),
            "aria-invalid": Boolean(err), className: inputClass(Boolean(err)),
          };
          const wide = f.kind === "textarea" || f.name === "name";
          return (
            <div key={f.name} className={wide ? "sm:col-span-2" : undefined}>
              <Field id={fid} label={f.label} hint={f.hint} error={err}>
                {(describedBy) =>
                  f.kind === "select" ? (
                    <select {...common} aria-describedby={describedBy}>
                      {f.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  ) : f.kind === "textarea" ? (
                    <textarea {...common} rows={2} aria-describedby={describedBy} />
                  ) : (
                    <input {...common} type={f.kind === "date" ? "date" : "text"} autoComplete="off"
                      inputMode={f.kind === "amount" || f.kind === "number" ? "numeric" : undefined} aria-describedby={describedBy} />
                  )
                }
              </Field>
            </div>
          );
        })}
      </div>
      <button type="submit" disabled={pending} className="rounded-full bg-primary px-6 py-2.5 font-bold text-white hover:bg-primary-dark disabled:opacity-60">{submit}</button>
    </form>
  );
}
