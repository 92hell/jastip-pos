import "server-only";
import { isLocale, type Locale } from "@/i18n";

/** The page language a form posted from (a hidden "locale" field). */
export function formLocale(form: FormData): Locale {
  const value = String(form.get("locale"));
  return isLocale(value) ? value : "id";
}

export const formText = (form: FormData, name: string) => String(form.get(name) ?? "");
export const formId = (form: FormData, name: string) => {
  const n = Number(form.get(name));
  return Number.isSafeInteger(n) && n > 0 ? n : 0;
};
