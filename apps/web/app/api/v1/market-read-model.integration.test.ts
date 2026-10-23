import { describe, expect, it } from "vitest";
import { MARKET_READ_MODEL_SQL, prisma } from "@tymra/db";
import { marketDataSchema } from "@/lib/market-data";

describe("regional market database projection", () => {
  it("reads the current migrated schema using the public-field contract", async () => {
    const rows = await prisma.$transaction(async transaction => {
      await transaction.$executeRawUnsafe("SET TRANSACTION READ ONLY");
      return transaction.$queryRawUnsafe<Array<{ data: unknown }>>(MARKET_READ_MODEL_SQL);
    });
    expect(rows).toHaveLength(1);
    const data = marketDataSchema.parse(rows[0].data);
    expect(data.version).toBe(1);
    expect(Object.keys(rows[0].data as object).sort()).toEqual(["asOf", "events", "rates", "signals", "version"]);
    expect(JSON.stringify(data)).not.toMatch(/encryptedEmail|passwordHash|wireJson|storageRef/);
  });
});
