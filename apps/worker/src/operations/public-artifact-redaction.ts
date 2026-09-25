import type { Prisma } from "@tymra/db";

export function redactPublicArtifact(value: unknown, preserveEventSessions = false): Prisma.InputJsonValue {
  if (value === null || value === undefined) return {};
  if (Array.isArray(value)) return value.map((item) => redactPublicArtifact(item, preserveEventSessions));
  if (typeof value !== "object") return value as string | number | boolean;
  const blocked = /cookie|session|token|authorization|credential|password/i;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .filter(([key]) => {
      if (preserveEventSessions && key === "event_sessions") return true;
      if (preserveEventSessions && /^contact(?:name|email|number|phone)$/i.test(key)) return false;
      return !blocked.test(key);
    })
    .map(([key, item]) => [key, redactPublicArtifact(item, preserveEventSessions)]));
}
