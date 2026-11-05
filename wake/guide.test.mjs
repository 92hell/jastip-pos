// Laili's guide (guide/, published at /panduan/): a static page sent to her as a WhatsApp link.
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

const guide = new URL('../guide/', import.meta.url);
const html = readFileSync(new URL('index.html', guide), 'utf8');

describe("Laili's guide", () => {
  it('is a complete Indonesian page with a link preview for WhatsApp', () => {
    assert.match(html, /^<!doctype html>\n<html lang="id">/);
    assert.match(html, /<meta name="viewport" content="width=device-width/);
    for (const property of ['og:title', 'og:description', 'og:image', 'og:url']) assert.match(html, new RegExp(`<meta property="${property}" content="[^"]+">`));
    assert.equal(html.match(/<main/g).length, 1);
  });

  it('publishes every picture it shows, and only shows pictures it publishes', () => {
    const used = [...new Set([...html.matchAll(/(?:src|data-src)="(img\/[^"]+)"/g)].map((m) => m[1]))];
    assert.ok(used.length > 0);
    for (const file of used) assert.ok(existsSync(new URL(file, guide)), `${file} is missing`);
  });

  it('links only to the shop, the demo and WhatsApp, over https', () => {
    const links = [...html.matchAll(/href="(https?:[^"]+)"/g)].map((m) => m[1]).filter((u) => !u.startsWith('https://fonts.g'));
    for (const link of links) assert.match(link, /^https:\/\/(titip-laili\.onrender\.com|92hell\.github\.io\/jastip-pos\/|wa\.me\/)/, link);
  });
});
