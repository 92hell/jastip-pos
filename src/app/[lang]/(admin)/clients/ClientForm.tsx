"use client";

import { useActionState, useId, useState } from "react";
import { Field, FormStatus, inputClass } from "@/components/Field";
import type { Locale } from "@/i18n";
import type { Dictionary } from "@/i18n/id";
import { saveClient, type ClientState } from "./actions";

type Values = { name: string; whatsapp: string; address: string; notes: string; isReseller: boolean };

export function ClientForm({ locale, id, initial, t, errorsText, submit }: {
  locale: Locale;
  id?: number;
  initial: Values;
  t: Dictionary["clients"];
  errorsText: Dictionary["errors"];
  submit: string;
}) {
  const [state, action, pending] = useActionState<ClientState, FormData>(saveClient, {});
  // Unique per form: Next.js keeps recently visited pages (with their forms) hidden in the page.
  const uid = useId();
  // Controlled, so what she typed stays after a refused save.
  const [values, setValues] = useState(initial);
  const errors = state.errors ?? {};
  const error = (name: string) => (errors[name] ? errorsText[errors[name] as keyof Dictionary["errors"]] ?? errors[name] : undefined);
  const text = (name: "name" | "whatsapp" | "address", hint?: string, autoComplete = "off") => (
    <Field id={`${uid}-${name}`} label={t[name]} hint={hint} error={error(name)}>
      {(describedBy) => (
        <input id={`${uid}-${name}`} name={name} value={values[name]} autoComplete={autoComplete} inputMode={name === "whatsapp" ? "tel" : undefined}
          onChange={(e) => setValues((v) => ({ ...v, [name]: e.target.value }))}
          aria-invalid={Boolean(error(name))} aria-describedby={describedBy} className={inputClass(Boolean(error(name)))} />
      )}
    </Field>
  );

  return (
    <form action={action} noValidate className="space-y-4 rounded-3xl bg-white p-5 shadow-sm">
      <input type="hidden" name="locale" value={locale} />
      {id && <input type="hidden" name="id" value={id} />}
      <FormStatus failed={Object.keys(errors).length ? errorsText.failed : undefined} />
      {text("name", undefined, "name")}
      {text("whatsapp", t.whatsappHint, "tel")}
      {text("address", undefined, "street-address")}
      <Field id={`${uid}-notes`} label={t.notes} error={error("notes")}>
        {(describedBy) => (
          <textarea id={`${uid}-notes`} name="notes" rows={3} value={values.notes} onChange={(e) => setValues((v) => ({ ...v, notes: e.target.value }))}
            aria-describedby={describedBy} className={inputClass(Boolean(error("notes")))} />
        )}
      </Field>
      <div className="flex items-start gap-3">
        <input id={`${uid}-isReseller`} name="isReseller" type="checkbox" checked={values.isReseller} aria-describedby={`${uid}-isReseller-hint`}
          onChange={(e) => setValues((v) => ({ ...v, isReseller: e.target.checked }))} className="mt-1 size-5 accent-primary" />
        <div>
          <label htmlFor={`${uid}-isReseller`} className="font-semibold">{t.reseller}</label>
          <p id={`${uid}-isReseller-hint`} className="text-sm text-muted">{t.resellerHint}</p>
        </div>
      </div>
      <button type="submit" disabled={pending} className="rounded-full bg-primary px-8 py-3 font-bold text-white hover:bg-primary-dark disabled:opacity-60">
        {submit}
      </button>
    </form>
  );
}
