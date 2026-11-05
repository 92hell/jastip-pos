"use client";

import { removeClient } from "./actions";

/** Asks before deleting: a client with orders is anonymised, which cannot be undone. */
export function DeleteClient({ locale, id, label, confirmText }: { locale: string; id: number; label: string; confirmText: string }) {
  return (
    <form action={removeClient} onSubmit={(e) => { if (!window.confirm(confirmText)) e.preventDefault(); }}>
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="id" value={id} />
      <button type="submit" className="rounded-full border border-danger px-4 py-2 font-semibold text-danger hover:bg-red-50">{label}</button>
    </form>
  );
}
