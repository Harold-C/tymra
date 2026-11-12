import { afterEach, expect, it, vi } from "vitest";
import { Prisma } from "@tymra/db";
import { runControlCycle } from "../src/operations/control-cycle";

afterEach(() => vi.restoreAllMocks());

it.each(["worker", "scheduler"] as const)("keeps %s control failures visible without retrying the action in the same tick", async service => {
  const log = vi.spyOn(process.stderr, "write").mockReturnValue(true);
  const failure = new Prisma.PrismaClientKnownRequestError("private transaction detail", { code: "P2028", clientVersion: "6.19.0" });
  const work = vi.fn().mockRejectedValueOnce(failure).mockResolvedValueOnce(undefined);
  expect(await runControlCycle(service, work)).toBe(false);
  expect(work).toHaveBeenCalledTimes(1);
  expect(log).toHaveBeenCalledWith(JSON.stringify({ service: `tymra-${service}`, event: "control_transaction_interrupted", errorCode: "P2028" }) + "\n");
  expect(await runControlCycle(service, work)).toBe(true);
  expect(work).toHaveBeenCalledTimes(2);
  expect(log).toHaveBeenCalledTimes(1);
});

it("does not hide invalid schedule policy, integrity errors or an untrusted error code", async () => {
  for (const error of [Error("Unapproved schedule"), { code: "P2028" },
    new Prisma.PrismaClientKnownRequestError("Unique constraint", { code: "P2002", clientVersion: "6.19.0" })]) {
    await expect(runControlCycle("scheduler", async () => { throw error; })).rejects.toBe(error);
  }
});
