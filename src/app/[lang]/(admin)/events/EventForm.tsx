"use client";

import { useActionState, useId, useState } from "react";
import { Field, FormStatus, inputClass } from "@/components/Field";
import type { Locale } from "@/i18n";
import type { Dictionary } from "@/i18n/id";
import { EVENT_KINDS, type EventKind } from "@/lib/db/schema";
import { saveEvent, type EventState } from "./actions";

type Values = { kind: EventKind; name: string; location: string; startsOn: string; endsOn: string; orderDeadline: string; note: string };

export function EventForm({ locale, id, initial, t, errorsText, submit }: {
  locale: Locale; id?: number; initial: Values; t: Dictionary["events"]; errorsText: Dictionary["errors"]; submit: string;
}) {
  const [state, action, pending] = useActionState<EventState, FormData>(saveEvent, {});
  // Unique per form: Next.js keeps recently visited pages (with their forms) hidden in the page.
  const uid = useId();
  const [values, setValues] = useState(initial);
  const errors = state.errors ?? {};
  const error = (name: string) => (errors[name] ? errorsText[errors[name] as keyof Dictionary["errors"]] ?? errors[name] : undefined);
  const set = (name: keyof Values) => (e: { target: { value: string } }) => setValues((v) => ({ ...v, [name]: e.target.value }));
  const input = (name: "name" | "location" | "startsOn" | "endsOn" | "orderDeadline", type = "text", hint?: string) => (
    <Field id={`${uid}-${name}`} label={t[name]} hint={hint} error={error(name)}>
      {(describedBy) => (
        <input id={`${uid}-${name}`} name={name} type={type} value={values[name]} onChange={set(name)} autoComplete="off"
          aria-invalid={Boolean(error(name))} aria-describedby={describedBy} className={inputClass(Boolean(error(name)))} />
      )}
    </Field>
  );

  return (
    <form action={action} noValidate className="space-y-4 rounded-3xl bg-white p-5 shadow-sm">
      <input type="hidden" name="locale" value={locale} />
      {id && <input type="hidden" name="id" value={id} />}
      <FormStatus failed={Object.keys(errors).length ? errorsText.failed : undefined} />
      <Field id={`${uid}-kind`} label={t.kind}>
        {() => (
          <select id={`${uid}-kind`} name="kind" value={values.kind} onChange={set("kind")} className={inputClass(false)}>
            {EVENT_KINDS.map((kind) => <option key={kind} value={kind}>{t.kinds[kind]}</option>)}
          </select>
        )}
      </Field>
      {input("name")}
      {input("location")}
      <div className="grid gap-4 sm:grid-cols-3">
        {input("startsOn", "date")}
        {input("endsOn", "date")}
        {input("orderDeadline", "date", t.orderDeadlineHint)}
      </div>
      <Field id={`${uid}-note`} label={t.note} error={error("note")}>
        {(describedBy) => <textarea id={`${uid}-note`} name="note" rows={2} value={values.note} onChange={set("note")} aria-describedby={describedBy} className={inputClass(false)} />}
      </Field>
      <button type="submit" disabled={pending} className="rounded-full bg-primary px-8 py-3 font-bold text-white hover:bg-primary-dark disabled:opacity-60">{submit}</button>
    </form>
  );
}
