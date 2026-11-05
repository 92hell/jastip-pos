/**
 * Indonesian WhatsApp numbers as typed ("0812-3456-7890", "+62 812 3456 7890", "6281234567890")
 * to international digits ("6281234567890"); null when it is not a phone number.
 */
export function normalizeWhatsapp(input: string): string | null {
  const trimmed = input.trim();
  if (!/^\+?[0-9(][0-9 ().\-]*$/.test(trimmed)) return null;
  let digits = trimmed.replace(/\D/g, "");
  if (digits.startsWith("0")) digits = `62${digits.slice(1)}`;
  return /^[1-9][0-9]{8,14}$/.test(digits) ? digits : null;
}

/** A wa.me link that opens a chat with this number, optionally with a message ready to send. */
export function waLink(digits: string, text?: string): string {
  return `https://wa.me/${digits}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
}

/** "6281234567890" → "+62 812-3456-7890" for reading. */
export function formatWhatsapp(digits: string): string {
  if (!digits.startsWith("62")) return `+${digits}`;
  const rest = digits.slice(2);
  return `+62 ${rest.slice(0, 3)}-${rest.slice(3, 7)}-${rest.slice(7)}`.replace(/-$/, "");
}
