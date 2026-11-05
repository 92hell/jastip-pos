"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { forgetOfflineData } from "./AppShell";

type Tab = { href: string; label: string; icon: string };

/**
 * Phone-sized screens: the main sections as a tab bar at the bottom, in thumb reach. Rendered
 * without the current tab first (it is part of the page's static shell), then marked by CurrentTab.
 */
export function BottomNav({ tabs, label, path = "" }: { tabs: Tab[]; label: string; path?: string }) {
  return (
    <nav aria-label={label} className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-white pb-[env(safe-area-inset-bottom)] sm:hidden">
      <ul className="grid grid-cols-4">
        {tabs.map((tab) => {
          const current = path === tab.href || path.startsWith(`${tab.href}/`);
          return (
            <li key={tab.href}>
              <Link href={tab.href} aria-current={current ? "page" : undefined}
                className={`flex flex-col items-center gap-0.5 py-2 text-xs font-semibold ${current ? "text-primary" : "text-muted"}`}>
                <span aria-hidden="true" className={`text-xl leading-none ${current ? "" : "grayscale"}`}>{tab.icon}</span>
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** The tab bar with the current section marked (reads the address, so it sits behind Suspense). */
export function CurrentTab(props: { tabs: Tab[]; label: string }) {
  return <BottomNav {...props} path={usePathname()} />;
}

/** Sign out, forgetting what this phone stored for offline use. */
export function SignOutButton({ action, locale, label, className }: { action: (form: FormData) => Promise<void>; locale: string; label: string; className: string }) {
  return (
    <form action={action} onSubmit={forgetOfflineData}>
      <input type="hidden" name="locale" value={locale} />
      <button type="submit" className={className}>{label}</button>
    </form>
  );
}

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

/** Chrome (Android, desktop) offers its install prompt here; iPhone gets the steps to follow. */
export function InstallApp({ labels }: { labels: { install: string; installed: string; hint: string; ios: string; android: string } }) {
  const [prompt, setPrompt] = useState<InstallEvent | null>(null);
  const [state, setState] = useState<"unknown" | "installed" | "ios" | "other">("unknown");

  useEffect(() => {
    const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone;
    // The platform is only known in the browser, so it is read after the first render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setState(standalone ? "installed" : /iphone|ipad|ipod/i.test(navigator.userAgent) ? "ios" : "other");
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPrompt(e as InstallEvent);
    };
    const onInstalled = () => setState("installed");
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (state === "installed") return <p className="font-semibold text-success">{labels.installed}</p>;
  return (
    <div className="space-y-2">
      <p>{labels.hint}</p>
      {prompt && (
        <button type="button" onClick={async () => { await prompt.prompt(); setPrompt(null); }}
          className="rounded-full bg-primary px-5 py-2.5 font-semibold text-white hover:bg-primary-dark">{labels.install}</button>
      )}
      <p className="text-sm text-muted">{state === "ios" ? labels.ios : labels.android}</p>
    </div>
  );
}
