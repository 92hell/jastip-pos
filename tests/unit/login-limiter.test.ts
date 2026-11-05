import { describe, expect, it } from "vitest";
import { LoginLimiter } from "@/lib/auth/login-limiter";

function clock(start = 0) {
  let now = start;
  return { now: () => now, advance: (ms: number) => (now += ms) };
}

describe("Sign-in throttling", () => {
  it("locks a username on one network after 5 failures, for 5 minutes", () => {
    const time = clock();
    const limiter = new LoginLimiter(time.now);
    for (let i = 0; i < 5; i++) limiter.recordFailure("laili", "10.0.0.1");

    expect(limiter.isBlocked("laili", "10.0.0.1")).toBe(true);
    expect(limiter.isBlocked("laili", "10.0.0.2")).toBe(false);
    time.advance(5 * 60_000 + 1);
    expect(limiter.isBlocked("laili", "10.0.0.1")).toBe(false);
  });

  it("locks a network that tries many usernames (20 failures)", () => {
    const limiter = new LoginLimiter(clock().now);
    for (let i = 0; i < 20; i++) limiter.recordFailure(`user${i}`, "10.0.0.9");

    expect(limiter.isBlocked("someone-else", "10.0.0.9")).toBe(true);
  });

  it("forgets failures after a successful sign-in, and failures older than 15 minutes", () => {
    const time = clock();
    const limiter = new LoginLimiter(time.now);
    for (let i = 0; i < 4; i++) limiter.recordFailure("laili", "10.0.0.1");
    limiter.recordSuccess("laili", "10.0.0.1");
    limiter.recordFailure("laili", "10.0.0.1");
    expect(limiter.isBlocked("laili", "10.0.0.1")).toBe(false);

    for (let i = 0; i < 3; i++) limiter.recordFailure("laili", "10.0.0.1");
    time.advance(16 * 60_000);
    limiter.recordFailure("laili", "10.0.0.1");
    expect(limiter.isBlocked("laili", "10.0.0.1")).toBe(false);
  });

  it("treats usernames without regard to case", () => {
    const limiter = new LoginLimiter(clock().now);
    for (let i = 0; i < 5; i++) limiter.recordFailure(i % 2 ? "LAILI" : "laili", "10.0.0.1");

    expect(limiter.isBlocked("Laili", "10.0.0.1")).toBe(true);
  });
});
