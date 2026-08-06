import { randomUUID } from "node:crypto";

import { afterAll, describe, expect, it } from "vitest";

import { closeRedis, RedisLockUnavailableError, withRedisLock, withRedisLockWait } from "../src";

describe("Redis distributed lock", () => {
  afterAll(async () => closeRedis());

  it("rejects a competing holder and permits acquisition after release", async () => {
    const key = `integration:${randomUUID()}`;
    let releaseFirst!: () => void;
    let signalAcquired!: () => void;
    const acquired = new Promise<void>((resolve) => { signalAcquired = resolve; });
    const release = new Promise<void>((resolve) => { releaseFirst = resolve; });

    const first = withRedisLock(key, 10_000, async () => {
      signalAcquired();
      await release;
      return "first";
    });

    await acquired;
    await expect(withRedisLock(key, 10_000, async () => "second"))
      .rejects.toBeInstanceOf(RedisLockUnavailableError);

    releaseFirst();
    await expect(first).resolves.toBe("first");
    await expect(withRedisLock(key, 10_000, async () => "third"))
      .resolves.toBe("third");
  });

  it("waits for the active holder before running the next operation", async () => {
    const key = `integration-wait:${randomUUID()}`;
    let releaseFirst!: () => void;
    let signalAcquired!: () => void;
    const acquired = new Promise<void>((resolve) => { signalAcquired = resolve; });
    const release = new Promise<void>((resolve) => { releaseFirst = resolve; });
    const order: string[] = [];
    const first = withRedisLock(key, 10_000, async () => {
      order.push("first-start");
      signalAcquired();
      await release;
      order.push("first-end");
    });
    await acquired;
    const second = withRedisLockWait(key, 10_000, async () => { order.push("second"); }, undefined, 2_000);
    releaseFirst();
    await Promise.all([first, second]);
    expect(order).toEqual(["first-start", "first-end", "second"]);
  });
});
