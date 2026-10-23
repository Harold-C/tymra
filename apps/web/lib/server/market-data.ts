import "server-only";
import { readFile } from "node:fs/promises";
import { MARKET_READ_MODEL_SQL, prisma } from "@tymra/db";
import { marketDataSchema, type MarketData } from "../market-data";

let cached: { until: number; data: MarketData; snapshot: boolean } | undefined;
export async function loadMarketData() {
  if (cached && cached.until > Date.now()) return cached;
  const path = process.env.LOCAL_MARKET_SNAPSHOT_PATH;
  let raw: unknown;
  if (path) {
    // A copied dataset may never silently replace a production database.
    if (process.env.NODE_ENV !== "development" || new URL(process.env.PUBLIC_ORIGIN!).hostname !== "tymra.test") throw new Error("LOCAL_SNAPSHOT_NOT_ALLOWED");
    raw = JSON.parse(await readFile(path, "utf8"));
  } else {
    const rows = await prisma.$queryRawUnsafe<{ data: unknown }[]>(MARKET_READ_MODEL_SQL);
    raw = rows[0]?.data;
  }
  cached = { until: Date.now() + 60000, data: marketDataSchema.parse(raw), snapshot: Boolean(path) };
  return cached;
}
