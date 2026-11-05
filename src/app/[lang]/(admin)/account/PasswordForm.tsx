"use client";

import { useActionState, useId } from "react";
import { Field, FormStatus, inputClass } from "@/components/Field";
import type { Locale } from "@/i18n";
import type { Dictionary } from "@/i18n/id";
import { changeMyPassword, type PasswordState } from "./actions";

/**
 * Current password, then the new one twice. The fields are left uncontrolled on purpose: React
 * empties them after each attempt, so no password stays on screen.
 */
export function PasswordForm({ locale, username, t }: { locale: Locale; username: string; t: Dictionary["account"] }) {
  const [state, action, pending] = useActionState<PasswordState, FormData>(changeMyPassword, {});
  // Unique per form: Next.js keeps recently visited pages (with their forms) hidden in the page.
  const uid = useId();
  const errors = state.errors ?? {};
  const failed = state.status === "blocked" ? t.blocked : state.status === "failed" ? t.failed : state.status === "demo" ? t.demoNote : undefined;

  function field(name: "current" | "next" | "confirm", label: string, autoComplete: string, hint?: string) {
    const id = `${uid}-${name}`;
    const error = errors[name] ? t.errors[errors[name]] : undefined;
    return (
      <Field id={id} label={label} hint={hint} error={error}>
        {(describedBy) => (
          <input id={id} name={name} type="password" autoComplete={autoComplete} required
            aria-invalid={Boolean(error)} aria-describedby={describedBy} className={inputClass(Boolean(error))} />
        )}
      </Field>
    );
  }

  return (
    <form action={action} noValidate className="space-y-4">
      <input type="hidden" name="locale" value={locale} />
      {/* Tells password managers which account the new password belongs to. */}
      <input type="text" name="username" autoComplete="username" value={username} readOnly hidden />
      <FormStatus saved={state.status === "changed" ? t.changed : undefined} failed={failed} />
      {field("current", t.current, "current-password")}
      {field("next", t.next, "new-password", t.nextHint)}
      {field("confirm", t.confirm, "new-password")}
      <button type="submit" disabled={pending} className="rounded-full bg-primary px-5 py-2.5 font-bold text-white hover:bg-primary-dark disabled:opacity-60">
        {t.submit}
      </button>
    </form>
  );
}
