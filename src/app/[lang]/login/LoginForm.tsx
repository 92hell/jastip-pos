"use client";

import { useActionState, useRef, useState } from "react";
import type { Dictionary } from "@/i18n/id";
import type { Locale } from "@/i18n";
import { login, type LoginState } from "./actions";

export function LoginForm({ locale, t, demo }: { locale: Locale; t: Dictionary["login"]; demo?: { username: string; password: string } }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(login, {});
  const form = useRef<HTMLFormElement>(null);
  // Controlled, so the username stays after a refused sign-in (React resets uncontrolled fields after a form action).
  const [username, setUsername] = useState("");

  function tryDemo() {
    const f = form.current;
    if (!f || !demo) return;
    setUsername(demo.username);
    (f.elements.namedItem("password") as HTMLInputElement).value = demo.password;
    // Submit after React has rendered the new username into the field.
    requestAnimationFrame(() => f.requestSubmit());
  }

  return (
    <form ref={form} action={action} noValidate className="space-y-4">
      <input type="hidden" name="locale" value={locale} />
      {state.error && (
        <p role="alert" className="rounded-xl bg-red-50 p-3 font-semibold text-danger">
          {t[state.error]}
        </p>
      )}
      <div>
        <label htmlFor="username" className="mb-1 block font-semibold">
          {t.username}
        </label>
        <input id="username" name="username" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} required autoFocus
          className="w-full rounded-xl border border-line bg-white px-3 py-2.5" />
      </div>
      <div>
        <label htmlFor="password" className="mb-1 block font-semibold">
          {t.password}
        </label>
        <input id="password" name="password" type="password" autoComplete="current-password" required
          className="w-full rounded-xl border border-line bg-white px-3 py-2.5" />
      </div>
      <button type="submit" disabled={pending} className="w-full rounded-full bg-primary py-3 font-bold text-white hover:bg-primary-dark disabled:opacity-60">
        {t.submit}
      </button>
      {demo && (
        <div className="rounded-2xl bg-sky-soft p-3 text-center text-sm">
          <p className="mb-2">{t.demoHint}</p>
          <button type="button" onClick={tryDemo} disabled={pending} className="rounded-full border-2 border-ink px-4 py-1.5 font-semibold hover:bg-white">
            {t.tryDemo}
          </button>
        </div>
      )}
    </form>
  );
}
