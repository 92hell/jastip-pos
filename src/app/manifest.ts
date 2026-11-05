import type { MetadataRoute } from "next";

/** Makes the app installable: Chrome on Android/desktop offers "Install", iPhone uses "Add to Home Screen". */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Titip Laili Yuk",
    short_name: "TitipLaili",
    description: "Pesanan, event, dan pembayaran jastip TitipLailiYuk.",
    id: "/",
    start_url: "/id/orders",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#e8f6ff",
    theme_color: "#9fd8fd",
    lang: "id",
    categories: ["business", "shopping", "productivity"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Pesanan baru", url: "/id/orders/new", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Event", url: "/id/events", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
