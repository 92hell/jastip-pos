/**
 * Rupiah as people type them in Indonesia: "350.000", "Rp 350.000", "350000", and the short forms
 * used in jastip chats: "25rb", "25k", "1,5jt". Returns whole rupiah, null for an empty field, or
 * NaN when it is not an amount.
 */
export function parseRupiah(input: string): number | null {
  const text = input.trim().toLowerCase().replace(/^rp\.?\s*/, "").replace(/\s+/g, "");
  if (text === "") return null;
  const short = /^([0-9]+(?:[.,][0-9]{1,3})?)(rb|ribu|k|jt|juta)$/.exec(text);
  if (short) {
    const value = Number(short[1].replace(",", "."));
    const factor = short[2] === "jt" || short[2] === "juta" ? 1_000_000 : 1_000;
    const result = Math.round(value * factor);
    return Number.isFinite(result) ? result : NaN;
  }
  // Dots (or commas) as thousands separators: "350.000", "1.250.000".
  if (/^[0-9]{1,3}([.,][0-9]{3})+$/.test(text)) return Number(text.replace(/[.,]/g, ""));
  if (/^[0-9]+$/.test(text)) return Number(text);
  return NaN;
}

/** "10", "7,5" or "7.5" (percent) → basis points (1000, 750); NaN when not a percentage of 0–100 with up to 2 decimals. */
export function parsePercent(input: string): number {
  const text = input.trim().replace(/%$/, "").trim().replace(",", ".");
  if (!/^[0-9]{1,3}(\.[0-9]{1,2})?$/.test(text)) return NaN;
  const basisPoints = Math.round(Number(text) * 100);
  return basisPoints <= 10_000 ? basisPoints : NaN;
}

/** Basis points back to how a person writes the percentage: 750 → "7,5" (id) / "7.5" (en). */
export function formatPercent(basisPoints: number, locale: "id" | "en"): string {
  const text = String(basisPoints / 100);
  return locale === "id" ? text.replace(".", ",") : text;
}
