import { describe, expect, it } from "vitest";
import { formatWhatsapp, normalizeWhatsapp, waLink } from "@/lib/whatsapp";

describe("WhatsApp numbers", () => {
  it("accept the ways people write Indonesian numbers", () => {
    for (const typed of ["0812-3456-7890", "+62 812 3456 7890", "6281234567890", "(0812) 3456.7890"]) {
      expect(normalizeWhatsapp(typed), typed).toBe("6281234567890");
    }
  });

  it("refuse what is not a phone number", () => {
    for (const typed of ["", "12345", "0812 abc", "https://wa.me/62812", "+0812345678901234567"]) {
      expect(normalizeWhatsapp(typed), typed).toBeNull();
    }
  });

  it("make a chat link with a ready message, and read nicely", () => {
    expect(waLink("6281234567890", "Halo kak, ini invoice-nya")).toBe("https://wa.me/6281234567890?text=Halo%20kak%2C%20ini%20invoice-nya");
    expect(formatWhatsapp("6281234567890")).toBe("+62 812-3456-7890");
  });
});
