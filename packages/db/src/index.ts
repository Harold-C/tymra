import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { tymraPrisma?: PrismaClient };

export const prisma =
  globalForPrisma.tymraPrisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.tymraPrisma = prisma;

export * from "@prisma/client";
export * from "./collection-incidents";
export * from "./jobs";
export * from "./result-links";
export * from "./security";
