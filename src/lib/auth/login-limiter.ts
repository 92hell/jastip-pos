/**
 * Slows down password guessing: 5 failures for one username from one network address, or 20 from
 * one address across usernames, within 15 minutes lock that pair (or address) for 5 minutes.
 * In memory and bounded (the app runs as a single server).
 */
const WINDOW_MS = 15 * 60_000;
const LOCKOUT_MS = 5 * 60_000;
const PER_PAIR = 5;
const PER_ADDRESS = 20;
const MAX_TRACKED = 10_000;

type Attempts = { failures: number[]; lockedUntil: number };

export class LoginLimiter {
  private readonly attempts = new Map<string, Attempts>();

  constructor(private readonly now: () => number = Date.now) {}

  isBlocked(username: string, address: string): boolean {
    return this.locked(pairKey(username, address)) || this.locked(addressKey(address));
  }

  recordFailure(username: string, address: string) {
    this.count(pairKey(username, address), PER_PAIR);
    this.count(addressKey(address), PER_ADDRESS);
  }

  recordSuccess(username: string, address: string) {
    this.attempts.delete(pairKey(username, address));
  }

  private locked(key: string) {
    const entry = this.attempts.get(key);
    return entry !== undefined && entry.lockedUntil > this.now();
  }

  private count(key: string, limit: number) {
    const now = this.now();
    const entry = this.attempts.get(key) ?? { failures: [], lockedUntil: 0 };
    entry.failures = entry.failures.filter((t) => now - t < WINDOW_MS);
    entry.failures.push(now);
    if (entry.failures.length >= limit) {
      entry.lockedUntil = now + LOCKOUT_MS;
      entry.failures = [];
    }
    this.attempts.delete(key);
    this.attempts.set(key, entry);
    if (this.attempts.size > MAX_TRACKED) {
      this.attempts.delete(this.attempts.keys().next().value!);
    }
  }
}

function pairKey(username: string, address: string) {
  return `u:${username.trim().toLowerCase()}|${address}`;
}

function addressKey(address: string) {
  return `a:${address}`;
}

const globalForLimiter = globalThis as unknown as { jastipLoginLimiter?: LoginLimiter };

/** The one limiter of this server, shared by signing in and changing the password. */
export function sharedLoginLimiter(): LoginLimiter {
  return (globalForLimiter.jastipLoginLimiter ??= new LoginLimiter());
}
