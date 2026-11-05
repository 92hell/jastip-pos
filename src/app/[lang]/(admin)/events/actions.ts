"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/current-user";
import { getDb } from "@/lib/db";
import { EVENT_KINDS, type EventKind } from "@/lib/db/schema";
import { createEvent, deleteEvent, setEventClosed, updateEvent } from "@/lib/events";
import { formId, formLocale, formText } from "@/lib/server/forms";
import type { FieldErrors } from "@/lib/settings";

export type EventState = { errors?: FieldErrors };

export async function saveEvent(_state: EventState, form: FormData): Promise<EventState> {
  const locale = formLocale(form);
  await requireUser(locale);
  const kind = formText(form, "kind");
  const input = {
    kind: (EVENT_KINDS.includes(kind as EventKind) ? kind : "other") as EventKind,
    name: formText(form, "name"),
    location: formText(form, "location"),
    startsOn: formText(form, "startsOn"),
    endsOn: formText(form, "endsOn"),
    orderDeadline: formText(form, "orderDeadline"),
    note: formText(form, "note"),
  };
  const id = formId(form, "id");
  const result = id ? await updateEvent(getDb(), id, input) : await createEvent(getDb(), input);
  if (!result.ok) return { errors: result.errors };
  redirect(`/${locale}/events/${result.id}?saved=1`);
}

export async function toggleEventClosed(form: FormData) {
  await requireUser(formLocale(form));
  await setEventClosed(getDb(), formId(form, "id"), formText(form, "closed") === "true");
  refresh();
}

export async function removeEvent(form: FormData) {
  const locale = formLocale(form);
  await requireUser(locale);
  await deleteEvent(getDb(), formId(form, "id"));
  redirect(`/${locale}/events`);
}
