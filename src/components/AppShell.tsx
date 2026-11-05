"use client";

import { useEffect, useSyncExternalStore } from "react";

const subscribe = (callback: () => void) => {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
};

/** Registers the service worker (production builds) and says when the phone has no signal. */
export function AppShell({ offlineText }: { offlineText: string }) {
  const online = useSyncExternalStore(subscribe, () => navigator.onLine, () => true);

  useEffect(() => {
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
        // Without a service worker the app still works, only not offline.
      });
    }
  }, []);

  if (online) return null;
  return (
    <p role="status" className="sticky top-0 z-40 bg-amber-100 px-4 py-2 text-center text-sm font-semibold text-ink">
      {offlineText}
    </p>
  );
}

/** On sign-out: forget the saved pages and any unsent ticks on this phone. */
export function forgetOfflineData() {
  try {
    window.localStorage.removeItem("jastip-pending");
    navigator.serviceWorker?.controller?.postMessage("clear");
  } catch {
    // Nothing stored.
  }
}
