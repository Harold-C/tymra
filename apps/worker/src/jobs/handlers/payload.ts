import { type Prisma } from "@tymra/db";

export type JsonObject = Record<string, unknown>;

export function jsonObject(value: Prisma.JsonValue | undefined | null): Record<string, Prisma.JsonValue> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, Prisma.JsonValue> : {};
}

export function asObject(value: Prisma.JsonValue): JsonObject {
  if (!value || Array.isArray(value) || typeof value !== "object") throw new Error("Job payload must be an object");
  return value as JsonObject;
}

export function requiredString(value: JsonObject, key: string): string {
  const result = value[key];
  if (typeof result !== "string" || !result) throw new Error(`Job payload is missing ${key}`);
  return result;
}

export function optionalString(value: JsonObject, key: string): string | undefined {
  const result = value[key];
  return typeof result === "string" && result ? result : undefined;
}

export function optionalNumber(value: JsonObject, key: string): number | undefined {
  const result = value[key];
  return typeof result === "number" && Number.isInteger(result) && result > 0 ? result : undefined;
}

export function optionalBoolean(value: JsonObject, key: string): boolean | undefined {
  const result = value[key];
  return typeof result === "boolean" ? result : undefined;
}

export function optionalDate(value: JsonObject, key: string): Date | undefined {
  const candidate = optionalString(value, key);
  if (!candidate) return undefined;
  const date = new Date(candidate);
  if (Number.isNaN(date.getTime())) throw new Error(`Job payload contains invalid ${key}`);
  return date;
}

export function eventCollectionPhase(value: JsonObject): "discovery" | "details" | "full" | undefined {
  const phase = optionalString(value, "phase");
  if (!phase) return undefined;
  if (["discovery", "details", "full"].includes(phase)) return phase as "discovery" | "details" | "full";
  throw new Error(`Unsupported event collection phase: ${phase}`);
}
