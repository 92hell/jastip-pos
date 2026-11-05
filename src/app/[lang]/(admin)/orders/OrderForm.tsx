"use client";

import { useActionState, useId, useMemo, useState } from "react";
import { Field, FormStatus, inputClass } from "@/components/Field";
import { fill, rupiah, type Locale } from "@/i18n";
import type { Dictionary } from "@/i18n/id";
import { parsePercent, parseRupiah } from "@/lib/money";
import { FEE_MODES, priceOrder, type Fee, type FeeMode } from "@/lib/pricing";
import { saveOrder, type OrderState } from "./actions";

export type OrderFormItem = {
  /** The saved line being edited (keeps its status); absent for a new line. */
  id?: number;
  key: number; name: string; store: string; quantity: string; unitPrice: string;
  feeMode: FeeMode; feeAmount: string; feePercent: string; bundle: string;
};
export type OrderFormBundle = { key: string; label: string; fee: string };
export type OrderFormValues = {
  clientId: string; eventId: string; note: string; items: OrderFormItem[]; bundles: OrderFormBundle[];
  discount: string; applyVoucher: boolean; shipping: string;
};

type Props = {
  locale: Locale;
  id?: number;
  initial: OrderFormValues;
  clients: { id: number; name: string; isReseller: boolean }[];
  events: { id: number; label: string }[];
  noEventLabel: string;
  voucherAmount: number;
  t: Dictionary["orders"];
  errorsText: Dictionary["errors"];
  resellerLabel: string;
};

const blankItem = (key: number, like?: OrderFormItem): OrderFormItem => ({
  id: undefined,
  key, name: "", store: like?.store ?? "", quantity: "1", unitPrice: "",
  feeMode: like?.feeMode ?? "per_item", feeAmount: like?.feeAmount ?? "", feePercent: like?.feePercent ?? "", bundle: like?.bundle ?? "",
});

/** The same pricing as the server, for the live summary; null while a field is not a valid amount yet. */
function preview(values: OrderFormValues, voucherAmount: number) {
  try {
    const amount = (v: string, optional = false) => {
      const n = parseRupiah(v);
      if (n === null) {
        if (optional) return 0;
        throw new RangeError("missing");
      }
      if (Number.isNaN(n)) throw new RangeError("invalid");
      return n;
    };
    return priceOrder({
      items: values.items.map((item) => {
        const quantity = Number(item.quantity);
        let fee: Fee;
        if (item.feeMode === "per_item") fee = { mode: "per_item", amount: amount(item.feeAmount) };
        else if (item.feeMode === "percent") fee = { mode: "percent", basisPoints: parsePercent(item.feePercent) };
        else if (item.feeMode === "bundle") fee = { mode: "bundle", bundle: item.bundle };
        else fee = { mode: "nett" };
        return { quantity, unitPrice: amount(item.unitPrice), fee };
      }),
      bundles: values.bundles.map((b) => ({ key: b.key, fee: amount(b.fee) })),
      discount: amount(values.discount, true),
      voucher: values.applyVoucher ? voucherAmount : 0,
      shipping: parseRupiah(values.shipping) === null ? null : amount(values.shipping),
    });
  } catch {
    return null;
  }
}

export function OrderForm({ locale, id, initial, clients, events, noEventLabel, voucherAmount, t, errorsText, resellerLabel }: Props) {
  const [state, action, pending] = useActionState<OrderState, FormData>(saveOrder, {});
  // Unique per form: Next.js keeps recently visited pages (with their forms) hidden in the page.
  const uid = useId();
  const [values, setValues] = useState(initial);
  const [nextKey, setNextKey] = useState(() => Math.max(0, ...initial.items.map((i) => i.key)) + 1);
  const priced = useMemo(() => preview(values, voucherAmount), [values, voucherAmount]);
  const errors = state.errors ?? {};
  const error = (name: string) => (errors[name] ? errorsText[errors[name] as keyof Dictionary["errors"]] ?? errors[name] : undefined);
  const money = (n: number) => rupiah(n, locale);

  const setItem = (key: number, patch: Partial<OrderFormItem>) =>
    setValues((v) => ({ ...v, items: v.items.map((item) => (item.key === key ? { ...item, ...patch } : item)) }));
  const setBundle = (key: string, patch: Partial<OrderFormBundle>) =>
    setValues((v) => ({ ...v, bundles: v.bundles.map((b) => (b.key === key ? { ...b, ...patch } : b)) }));
  const addItem = () => {
    setValues((v) => ({ ...v, items: [...v.items, blankItem(nextKey, v.items.at(-1))] }));
    setNextKey((k) => k + 1);
  };
  const addBundle = () =>
    setValues((v) => {
      const key = `b${Math.max(0, ...v.bundles.map((b) => Number(b.key.slice(1)))) + 1}`;
      return { ...v, bundles: [...v.bundles, { key, label: "", fee: "" }] };
    });
  const removeBundle = (key: string) =>
    setValues((v) => ({
      ...v,
      bundles: v.bundles.filter((b) => b.key !== key),
      items: v.items.map((item) => (item.bundle === key ? { ...item, bundle: "" } : item)),
    }));
  const payload = JSON.stringify({
    ...values,
    items: values.items.map(({ key: _key, ...item }) => item), // eslint-disable-line @typescript-eslint/no-unused-vars
  });
  const bundleName = (b: OrderFormBundle, i: number) => b.label || fill(t.bundleN, { n: i + 1 });

  return (
    <form action={action} noValidate className="space-y-6">
      <input type="hidden" name="locale" value={locale} />
      {id && <input type="hidden" name="id" value={id} />}
      <input type="hidden" name="order" value={payload} />
      <FormStatus failed={Object.keys(errors).length ? errorsText.failed : undefined} />

      <section className="space-y-4 rounded-3xl bg-white p-5 shadow-sm">
        <Field id={`${uid}-clientId`} label={t.client} error={error("clientId")}>
          {(describedBy) => (
            <select id={`${uid}-clientId`} value={values.clientId} onChange={(e) => setValues((v) => ({ ...v, clientId: e.target.value }))}
              aria-invalid={Boolean(error("clientId"))} aria-describedby={describedBy} className={inputClass(Boolean(error("clientId")))}>
              <option value="">{t.chooseClient}</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>{c.isReseller ? `${c.name} (${resellerLabel})` : c.name}</option>
              ))}
            </select>
          )}
        </Field>
        <Field id={`${uid}-eventId`} label={t.event} error={error("eventId")}>
          {(describedBy) => (
            <select id={`${uid}-eventId`} value={values.eventId} onChange={(e) => setValues((v) => ({ ...v, eventId: e.target.value }))}
              aria-invalid={Boolean(error("eventId"))} aria-describedby={describedBy} className={inputClass(Boolean(error("eventId")))}>
              <option value="">{noEventLabel}</option>
              {events.map((e) => <option key={e.id} value={e.id}>{e.label}</option>)}
            </select>
          )}
        </Field>
      </section>

      <section aria-labelledby={`${uid}-items`} className="space-y-4 rounded-3xl bg-white p-5 shadow-sm">
        <h2 id={`${uid}-items`} className="font-display text-2xl">{t.items}</h2>
        <p className="text-sm text-muted">{t.amountHint}</p>
        {error("items") && <p role="alert" className="font-semibold text-danger">{error("items")}</p>}
        {values.items.map((item, i) => {
          const f = (part: string) => `${uid}-item-${item.key}-${part}`;
          const e = (part: string) => error(`items.${i}.${part}`);
          const input = (part: "name" | "store" | "quantity" | "unitPrice" | "feeAmount" | "feePercent", label: string, mode?: "numeric" | "decimal") => (
            <Field id={f(part)} label={label} error={e(part)}>
              {(describedBy) => (
                <input id={f(part)} value={item[part]} inputMode={mode} autoComplete="off" onChange={(ev) => setItem(item.key, { [part]: ev.target.value })}
                  aria-invalid={Boolean(e(part))} aria-describedby={describedBy} className={inputClass(Boolean(e(part)))} />
              )}
            </Field>
          );
          const line = priced?.lines[i];
          return (
            <div key={item.key} role="group" aria-label={fill(t.itemN, { n: i + 1 })} className="space-y-3 rounded-2xl border border-line p-4">
              <div className="flex items-center justify-between gap-3">
                <h3 className="font-bold">{fill(t.itemN, { n: i + 1 })}</h3>
                {values.items.length > 1 && (
                  <button type="button" onClick={() => setValues((v) => ({ ...v, items: v.items.filter((x) => x.key !== item.key) }))}
                    aria-label={fill(t.removeItem, { n: i + 1 })} className="rounded-full border border-danger px-3 py-1 text-sm font-semibold text-danger hover:bg-red-50">✕</button>
                )}
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {input("name", t.itemName)}
                {input("store", t.store)}
              </div>
              <div className="grid gap-3 sm:grid-cols-[6rem_1fr]">
                {input("quantity", t.quantity, "numeric")}
                {input("unitPrice", t.unitPrice, "numeric")}
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field id={f("feeMode")} label={t.feeMode}>
                  {() => (
                    <select id={f("feeMode")} value={item.feeMode} onChange={(ev) => setItem(item.key, { feeMode: ev.target.value as FeeMode })} className={inputClass(false)}>
                      {FEE_MODES.map((mode) => (
                        <option key={mode} value={mode} disabled={mode === "bundle" && values.bundles.length === 0}>{t.feeModes[mode]}</option>
                      ))}
                    </select>
                  )}
                </Field>
                {item.feeMode === "per_item" && input("feeAmount", t.feeAmount, "numeric")}
                {item.feeMode === "percent" && input("feePercent", t.feePercent, "decimal")}
                {item.feeMode === "bundle" && (
                  <Field id={f("bundle")} label={t.bundle} error={e("bundle")}>
                    {(describedBy) => (
                      <select id={f("bundle")} value={item.bundle} onChange={(ev) => setItem(item.key, { bundle: ev.target.value })}
                        aria-invalid={Boolean(e("bundle"))} aria-describedby={describedBy} className={inputClass(Boolean(e("bundle")))}>
                        <option value="">{t.chooseBundle}</option>
                        {values.bundles.map((b, bi) => <option key={b.key} value={b.key}>{bundleName(b, bi)}</option>)}
                      </select>
                    )}
                  </Field>
                )}
              </div>
              {line && <p className="text-right text-sm text-muted">{money(line.subtotal)}{line.fee ? ` + ${money(line.fee)}` : ""}</p>}
            </div>
          );
        })}
        <button type="button" onClick={addItem} className="rounded-full border-2 border-ink px-4 py-2 font-semibold hover:bg-sky-soft">+ {t.addItem}</button>
      </section>

      <section aria-labelledby={`${uid}-bundles`} className="space-y-4 rounded-3xl bg-white p-5 shadow-sm">
        <h2 id={`${uid}-bundles`} className="font-display text-2xl">{t.bundles}</h2>
        <p className="text-sm text-muted">{t.bundlesHint}</p>
        {values.bundles.map((b, i) => (
          <div key={b.key} role="group" aria-label={fill(t.bundleN, { n: i + 1 })} className="grid gap-3 rounded-2xl border border-line p-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <Field id={`${uid}-bundle-${b.key}-label`} label={t.bundleLabel} error={error(`bundles.${i}.label`)}>
              {(describedBy) => <input id={`${uid}-bundle-${b.key}-label`} value={b.label} onChange={(e) => setBundle(b.key, { label: e.target.value })} aria-describedby={describedBy} className={inputClass(false)} />}
            </Field>
            <Field id={`${uid}-bundle-${b.key}-fee`} label={t.bundleFee} error={error(`bundles.${i}.fee`)}>
              {(describedBy) => (
                <input id={`${uid}-bundle-${b.key}-fee`} value={b.fee} inputMode="numeric" onChange={(e) => setBundle(b.key, { fee: e.target.value })}
                  aria-invalid={Boolean(error(`bundles.${i}.fee`))} aria-describedby={describedBy} className={inputClass(Boolean(error(`bundles.${i}.fee`)))} />
              )}
            </Field>
            <button type="button" onClick={() => removeBundle(b.key)} aria-label={fill(t.removeBundle, { n: i + 1 })}
              className="h-11 rounded-full border border-danger px-4 font-semibold text-danger hover:bg-red-50">✕</button>
          </div>
        ))}
        <button type="button" onClick={addBundle} className="rounded-full border-2 border-ink px-4 py-2 font-semibold hover:bg-sky-soft">+ {t.addBundle}</button>
      </section>

      <section aria-labelledby={`${uid}-amounts`} className="space-y-4 rounded-3xl bg-white p-5 shadow-sm">
        <h2 id={`${uid}-amounts`} className="font-display text-2xl">{t.amounts}</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field id={`${uid}-discount`} label={t.discount} error={error("discount")}>
            {(describedBy) => <input id={`${uid}-discount`} value={values.discount} inputMode="numeric" onChange={(e) => setValues((v) => ({ ...v, discount: e.target.value }))}
              aria-invalid={Boolean(error("discount"))} aria-describedby={describedBy} className={inputClass(Boolean(error("discount")))} />}
          </Field>
          <Field id={`${uid}-shipping`} label={t.shipping} hint={t.shippingHint} error={error("shipping")}>
            {(describedBy) => <input id={`${uid}-shipping`} value={values.shipping} inputMode="numeric" onChange={(e) => setValues((v) => ({ ...v, shipping: e.target.value }))}
              aria-invalid={Boolean(error("shipping"))} aria-describedby={describedBy} className={inputClass(Boolean(error("shipping")))} />}
          </Field>
        </div>
        {voucherAmount > 0 && (
          <label className="flex items-center gap-3 font-semibold">
            <input type="checkbox" checked={values.applyVoucher} onChange={(e) => setValues((v) => ({ ...v, applyVoucher: e.target.checked }))} className="size-5 accent-primary" />
            {fill(t.voucher, { amount: money(voucherAmount) })}
          </label>
        )}
        <Field id={`${uid}-note`} label={t.note} error={error("note")}>
          {(describedBy) => <textarea id={`${uid}-note`} rows={2} value={values.note} onChange={(e) => setValues((v) => ({ ...v, note: e.target.value }))} aria-describedby={describedBy} className={inputClass(false)} />}
        </Field>
      </section>

      <section aria-labelledby={`${uid}-summary`} aria-live="polite" className="rounded-3xl bg-sky p-5">
        <h2 id={`${uid}-summary`} className="font-display text-2xl">{t.summary}</h2>
        {priced ? (
          <dl className="mt-2 grid grid-cols-[1fr_auto] gap-x-4 gap-y-1">
            <dt>{t.itemsTotal}</dt><dd className="text-right">{money(priced.itemsTotal)}</dd>
            <dt>{t.feesTotal}</dt><dd className="text-right">{money(priced.feesTotal)}</dd>
            {priced.discount > 0 && (<><dt>{t.discountLine}</dt><dd className="text-right">− {money(priced.discount)}</dd></>)}
            {priced.voucher > 0 && (<><dt>{t.voucherLine}</dt><dd className="text-right">− {money(priced.voucher)}</dd></>)}
            <dt>{t.shippingLine}</dt><dd className="text-right">{priced.shipping === null ? t.shippingUnknown : money(priced.shipping)}</dd>
            <dt className="mt-1 border-t border-ink pt-1 text-lg font-bold">{t.totalLine}</dt>
            <dd className="mt-1 border-t border-ink pt-1 text-right text-lg font-bold">{money(priced.total)}</dd>
          </dl>
        ) : (
          <p className="mt-2">{t.checkInput}</p>
        )}
      </section>

      <button type="submit" disabled={pending} className="rounded-full bg-primary px-8 py-3 font-bold text-white hover:bg-primary-dark disabled:opacity-60">
        {id ? t.update : t.create}
      </button>
    </form>
  );
}
