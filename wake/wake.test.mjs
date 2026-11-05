// Run with: node --test wake/*.test.mjs
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { TEXT, pickLanguage, waitUntilAwake } from './wake.js';

/** A clock that only moves when the page waits, so the tests take no real time. */
function fakeClock() {
  let time = 0;
  return {
    now: () => time,
    wait: async (ms) => {
      // Answers already in let their callbacks run before the time moves on, as in a browser.
      await new Promise((resolve) => setImmediate(resolve));
      time += ms;
    },
  };
}

/** Pings answered in turn by `answers`: true (the app), false (not yet) or 'hang' (no answer at all). */
function pings(answers) {
  const calls = [];
  const ping = () => {
    const answer = answers[calls.length] ?? false;
    calls.push(answer);
    return answer === 'hang' ? new Promise(() => {}) : Promise.resolve(answer);
  };
  return { ping, calls };
}

describe('Waking the demo', () => {
  it('opens at once when the demo is already awake', async () => {
    const { ping, calls } = pings([true]);
    const result = await waitUntilAwake({ ping, ...fakeClock() });
    assert.deepEqual(result, { awake: true, elapsed: 0 });
    assert.equal(calls.length, 1);
  });

  it('keeps knocking while the server starts, and reports the time so far', async () => {
    const { ping, calls } = pings([false, false, false, true]);
    const ticks = [];
    const result = await waitUntilAwake({ ping, ...fakeClock(), every: 4000, onTick: (ms) => ticks.push(ms) });
    assert.deepEqual(result, { awake: true, elapsed: 12000 });
    assert.equal(calls.length, 4);
    assert.deepEqual(ticks, [4000, 8000, 12000]);
  });

  it('does not wait for a request the sleeping server holds', async () => {
    const { ping, calls } = pings(['hang', 'hang', true]);
    const result = await waitUntilAwake({ ping, ...fakeClock(), every: 5000 });
    assert.deepEqual(result, { awake: true, elapsed: 10000 });
    assert.equal(calls.length, 3);
  });

  it('gives up after three minutes, so the reader can open the demo directly', async () => {
    const { ping, calls } = pings([]);
    const result = await waitUntilAwake({ ping, ...fakeClock(), every: 4000, giveUpAfter: 180000 });
    assert.deepEqual(result, { awake: false, elapsed: 180000 });
    assert.equal(calls.length, 45);
  });
});

describe('Language of the wake-up page', () => {
  it('follows the browser: Bahasa Indonesia or English', () => {
    assert.equal(pickLanguage(['id-ID', 'en-US']), 'id');
    assert.equal(pickLanguage(['fr-FR', 'en-GB']), 'en');
    assert.equal(pickLanguage(['ja']), 'en');
    assert.equal(pickLanguage(undefined), 'en');
  });

  it('has every text in both languages', () => {
    assert.deepEqual(Object.keys(TEXT.id).sort(), Object.keys(TEXT.en).sort());
  });
});
