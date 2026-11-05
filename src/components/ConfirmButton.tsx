"use client";

import type { ReactNode } from "react";

/** A small form posting to a Server Action, asking first when `confirmText` is given. */
export function ActionButton({ action, fields, confirmText, label, pressed, className, children }: {
  action: (form: FormData) => Promise<void>;
  fields: Record<string, string | number>;
  confirmText?: string;
  /** Accessible name when the visible text needs context, e.g. "Bought: Tas" (it starts with the visible text). */
  label?: string;
  /** For toggles such as "bought". */
  pressed?: boolean;
  className: string;
  children: ReactNode;
}) {
  return (
    <form action={action} onSubmit={(e) => { if (confirmText && !window.confirm(confirmText)) e.preventDefault(); }}>
      {Object.entries(fields).map(([name, value]) => <input key={name} type="hidden" name={name} value={value} />)}
      <button type="submit" aria-label={label} aria-pressed={pressed} className={className}>{children}</button>
    </form>
  );
}
