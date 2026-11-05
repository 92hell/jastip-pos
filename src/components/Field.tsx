import type { ReactNode } from "react";

export function inputClass(invalid: boolean) {
  return `w-full rounded-xl border bg-white px-3 py-2.5 ${invalid ? "border-danger" : "border-line"}`;
}

/** A label, the control, and its hint or error, linked for screen readers (aria-describedby). */
export function Field({ id, label, hint, error, children }: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  children: (describedBy?: string) => ReactNode;
}) {
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

/** A message for the whole form: success in a polite live region, a refusal as an alert. */
export function FormStatus({ saved, failed }: { saved?: string; failed?: string }) {
  return (
    <>
      <div aria-live="polite" role="status">
        {saved && <p className="rounded-xl bg-green-50 p-3 font-semibold text-success">{saved}</p>}
      </div>
      {failed && <p role="alert" className="rounded-xl bg-red-50 p-3 font-semibold text-danger">{failed}</p>}
    </>
  );
}
