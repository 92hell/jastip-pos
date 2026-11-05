"use client";

import { useActionState, useState, type ReactNode } from "react";
import type { Locale } from "@/i18n";
import type { Dictionary } from "@/i18n/id";
import type { PaymentAccount } from "@/lib/db/schema";
import { saveSettings, type SettingsState } from "./actions";

type Values = {
  shopName: string;
  tagline: string;
  location: string;
  instagram: string;
  whatsapp: string;
  paymentAccounts: PaymentAccount[];
  rules: string;
  voucherAmount: number;
};

const fill = (template: string, n: number) => template.replace("{n}", String(n));

export function SettingsForm({ locale, t, errorsText, initial, demo }: {
  locale: Locale;
  t: Dictionary["settings"];
  errorsText: Dictionary["errors"] & { saved: string; save: string; saving: string };
  initial: Values;
  demo: boolean;
}) {
  const [state, action, pending] = useActionState<SettingsState, FormData>(saveSettings, {});
  const [accounts, setAccounts] = useState<(PaymentAccount & { key: number })[]>(
    initial.paymentAccounts.map((a, i) => ({ ...a, key: i })),
  );
  const [nextKey, setNextKey] = useState(initial.paymentAccounts.length);
  // Controlled, so what she typed stays after a refused save (React resets uncontrolled fields after a form action).
  const [values, setValues] = useState({ ...initial, voucherAmount: String(initial.voucherAmount) });
  const set = (name: keyof typeof values) => (e: { target: { value: string } }) => setValues((v) => ({ ...v, [name]: e.target.value }));
  const errors = state.errors ?? {};
  const error = (name: string) => (errors[name] ? errorsText[errors[name] as keyof Dictionary["errors"]] ?? errors[name] : undefined);

  function field(name: keyof Values, label: string, opts: { hint?: string; type?: string; inputMode?: "numeric"; autoComplete?: string } = {}) {
    return (
      <Field id={name} label={label} hint={opts.hint} error={error(name)}>
        {(describedBy) => (
          <input id={name} name={name} type={opts.type ?? "text"} inputMode={opts.inputMode} autoComplete={opts.autoComplete ?? "off"}
            value={String(values[name])} onChange={set(name)} aria-invalid={Boolean(error(name))} aria-describedby={describedBy}
            className={inputClass(Boolean(error(name)))} />
        )}
      </Field>
    );
  }

  return (
    <form action={action} noValidate className="space-y-6">
      <input type="hidden" name="locale" value={locale} />
      <div aria-live="polite" role="status">
        {state.status === "saved" && <p className="rounded-xl bg-green-50 p-3 font-semibold text-success">{errorsText.saved}</p>}
      </div>
      {state.status === "failed" && <p role="alert" className="rounded-xl bg-red-50 p-3 font-semibold text-danger">{errorsText.failed}</p>}

      <fieldset className="space-y-4 rounded-3xl bg-white p-5 shadow-sm [&>legend+*]:clear-both">
        <legend className="float-left mb-2 w-full font-display text-2xl">{t.profile}</legend>
        {field("shopName", t.shopName, { autoComplete: "organization" })}
        {field("tagline", t.tagline)}
        {field("location", t.location)}
        {field("instagram", t.instagram)}
        {field("whatsapp", t.whatsapp, { hint: t.whatsappHint })}
      </fieldset>

      <fieldset className="space-y-4 rounded-3xl bg-white p-5 shadow-sm [&>legend+*]:clear-both">
        <legend className="float-left mb-2 w-full font-display text-2xl">{t.payments}</legend>
        <p className="text-sm text-muted">{t.paymentsHint}</p>
        {demo && <p className="rounded-xl bg-sky-soft p-3 text-sm font-semibold">{t.demoNote}</p>}
        {accounts.map((account, i) => (
          <div key={account.key} role="group" aria-label={fill(t.accountN, i + 1)} className="grid gap-3 rounded-2xl border border-line p-3 sm:grid-cols-[1fr_1.4fr_1.4fr_auto] sm:items-end">
            {(["bank", "holder", "number"] as const).map((part) => {
              const name = `${part}_${i}`;
              const message = error(`paymentAccounts.${i}.${part}`);
              return (
                <Field key={part} id={name} label={t[part]} error={message}>
                  {(describedBy) => (
                    <input id={name} name={name} value={account[part]} inputMode={part === "number" ? "numeric" : undefined} autoComplete="off"
                      onChange={(e) => setAccounts((all) => all.map((a) => (a.key === account.key ? { ...a, [part]: e.target.value } : a)))}
                      aria-invalid={Boolean(message)} aria-describedby={describedBy} className={inputClass(Boolean(message))} />
                  )}
                </Field>
              );
            })}
            <button type="button" onClick={() => setAccounts((all) => all.filter((a) => a.key !== account.key))}
              aria-label={fill(t.removeAccount, i + 1)} className="h-11 rounded-full border border-danger px-4 font-semibold text-danger hover:bg-red-50">
              ✕
            </button>
          </div>
        ))}
        {accounts.length < 5 && (
          <button type="button" onClick={() => { setAccounts((all) => [...all, { bank: "", holder: "", number: "", key: nextKey }]); setNextKey((k) => k + 1); }}
            className="rounded-full border-2 border-ink px-4 py-2 font-semibold hover:bg-sky-soft">
            + {t.addAccount}
          </button>
        )}
      </fieldset>

      <fieldset className="space-y-4 rounded-3xl bg-white p-5 shadow-sm [&>legend+*]:clear-both">
        <legend className="float-left mb-2 w-full font-display text-2xl">{t.rules}</legend>
        <Field id="rules" label={t.rules} hint={t.rulesHint} error={error("rules")}>
          {(describedBy) => (
            <textarea id="rules" name="rules" rows={6} value={values.rules} onChange={set("rules")} aria-describedby={describedBy}
              aria-invalid={Boolean(error("rules"))} className={inputClass(Boolean(error("rules")))} />
          )}
        </Field>
        {field("voucherAmount", t.voucher, { hint: t.voucherHint, inputMode: "numeric" })}
      </fieldset>

      <button type="submit" disabled={pending} className="rounded-full bg-primary px-8 py-3 font-bold text-white hover:bg-primary-dark disabled:opacity-60">
        {pending ? errorsText.saving : errorsText.save}
      </button>
    </form>
  );
}

function inputClass(invalid: boolean) {
  return `w-full rounded-xl border bg-white px-3 py-2.5 ${invalid ? "border-danger" : "border-line"}`;
}

/** A label, the control, and its hint or error, linked for screen readers. */
function Field({ id, label, hint, error, children }: { id: string; label: string; hint?: string; error?: string; children: (describedBy?: string) => ReactNode }) {
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div>
      <label htmlFor={id} className="mb-1 block font-semibold">{label}</label>
      {children(describedBy)}
      {error ? (
        <p id={`${id}-error`} className="mt-1 text-sm font-semibold text-danger">{error}</p>
      ) : (
        hint && <p id={`${id}-hint`} className="mt-1 text-sm text-muted">{hint}</p>
      )}
    </div>
  );
}
