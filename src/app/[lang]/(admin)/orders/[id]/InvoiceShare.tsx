"use client";

import { useState } from "react";

/** The invoice link with "send on WhatsApp" and "copy". */
export function InvoiceShare({ link, whatsappHref, labels }: {
  link: string; whatsappHref: string | null; labels: { title: string; send: string; copy: string; copied: string };
}) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="space-y-2">
      <p className="font-semibold">{labels.title}</p>
      <p className="break-all rounded-xl bg-sky-soft p-2 font-mono text-sm">{link}</p>
      <div className="flex flex-wrap gap-2">
        {whatsappHref && (
          <a href={whatsappHref} rel="noopener noreferrer" className="rounded-full bg-primary px-4 py-2 font-semibold text-white hover:bg-primary-dark">{labels.send}</a>
        )}
        <button type="button" onClick={async () => { await navigator.clipboard.writeText(link); setCopied(true); }}
          className="rounded-full border-2 border-ink px-4 py-2 font-semibold hover:bg-white">{labels.copy}</button>
        <span role="status" className="self-center text-sm font-semibold text-success">{copied ? labels.copied : ""}</span>
      </div>
    </div>
  );
}
