/**
 * Waking the demo. It runs on a free server that sleeps after a while without visitors, and the
 * first request then waits for it to start. This page lives somewhere that never sleeps, keeps
 * knocking, and opens the app once the app itself answers.
 */

export const APP_URL = 'https://titip-laili-demo.onrender.com';

/**
 * Asks the app for its small icon (/icons/favicon-48.png). Only the app serves that image, so it loading means the app is
 * up (a "starting" page or a network error does not load as an image). No CORS is needed.
 */
export function pingApp(appUrl = APP_URL) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(true);
    img.onerror = () => resolve(false);
    img.src = `${appUrl}/icons/favicon-48.png?wake=${Date.now()}`;
  });
}

/**
 * Pings every `every` ms until one ping answers, without waiting for a ping that hangs (the
 * server may hold the first request while it starts). Gives up after `giveUpAfter` ms.
 *
 * @returns {Promise<{awake: boolean, elapsed: number}>}
 */
export function waitUntilAwake({ ping, wait, now, every = 4000, giveUpAfter = 180000, onTick = () => {} }) {
  const start = now();
  return new Promise((resolve) => {
    let settled = false;
    const finish = (awake) => {
      if (settled) return;
      settled = true;
      resolve({ awake, elapsed: now() - start });
    };
    (async () => {
      while (!settled) {
        ping().then((ok) => ok && finish(true), () => {});
        await wait(every);
        if (settled) return;
        const elapsed = now() - start;
        if (elapsed >= giveUpAfter) finish(false);
        else onTick(elapsed);
      }
    })();
  });
}

export const TEXT = {
  en: {
    heading: 'Waking up the demo…',
    explain: 'The demo runs on a free server that sleeps when nobody is using it. Starting it takes about a minute; you will be taken there as soon as it is ready.',
    checking: 'Checking whether the demo is awake…',
    starting: 'Starting… {s} s',
    ready: 'Ready. Opening the demo…',
    slow: 'This is taking longer than usual. Try opening the demo directly, or come back in a minute.',
    open: 'Open the demo now',
    source: 'Source code on GitHub',
  },
  id: {
    heading: 'Membangunkan demo…',
    explain: 'Demo ini berjalan di server gratis yang tidur saat tidak ada yang memakainya. Menyalakannya butuh sekitar satu menit; Anda akan diarahkan ke sana begitu siap.',
    checking: 'Memeriksa apakah demo sudah menyala…',
    starting: 'Menyalakan… {s} detik',
    ready: 'Siap. Membuka demo…',
    slow: 'Ini lebih lama dari biasanya. Coba buka demo langsung, atau kembali sebentar lagi.',
    open: 'Buka demo sekarang',
    source: 'Kode sumber di GitHub',
  },
};

/** Bahasa Indonesia when the browser prefers it, English otherwise. */
export function pickLanguage(languages) {
  return (languages ?? []).find((l) => /^(en|id)\b/i.test(l))?.slice(0, 2).toLowerCase() ?? 'en';
}
