import { describe, expect, it } from "vitest";
import { formatPercent, parsePercent, parseRupiah } from "@/lib/money";

describe("Typed amounts", () => {
  it("read rupiah the way they are written in jastip chats", () => {
    const cases: [string, number | null][] = [
      ["350.000", 350_000],
      ["Rp 350.000", 350_000],
      ["rp350000", 350_000],
      ["1.250.000", 1_250_000],
      ["25rb", 25_000],
      ["25 ribu", 25_000],
      ["25k", 25_000],
      ["1,5jt", 1_500_000],
      ["1.5 juta", 1_500_000],
      ["0", 0],
      ["", null],
      ["   ", null],
    ];
    for (const [typed, expected] of cases) expect(parseRupiah(typed), typed).toBe(expected);
  });

  it("refuse what is not an amount", () => {
    for (const typed of ["abc", "-5000", "12.34", "1.2.3", "25rbu", "10%"]) expect(parseRupiah(typed), typed).toBeNaN();
  });

  it("read percentages with a comma or a dot, up to 100%", () => {
    expect(parsePercent("10")).toBe(1000);
    expect(parsePercent("7,5")).toBe(750);
    expect(parsePercent("7.25%")).toBe(725);
    expect(parsePercent("100")).toBe(10_000);
    for (const typed of ["101", "-1", "abc", "7,555", ""]) expect(parsePercent(typed), typed).toBeNaN();
    expect(formatPercent(750, "id")).toBe("7,5");
    expect(formatPercent(750, "en")).toBe("7.5");
  });
});
