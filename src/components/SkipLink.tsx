"use client";

/**
 * "Skip to content": moves focus to the page's visible <main>. Next.js keeps recently visited pages
 * mounted but hidden, each with its own <main>, so an id target could point at a hidden one.
 */
export function SkipLink({ label }: { label: string }) {
  return (
    <a href="#main" onClick={(e) => {
      const main = [...document.querySelectorAll("main")].find((el) => el.getClientRects().length > 0);
      if (!main) return;
      e.preventDefault();
      main.tabIndex = -1;
      main.focus();
      main.scrollIntoView();
    }} className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:bg-white focus:px-3 focus:py-2">
      {label}
    </a>
  );
}
