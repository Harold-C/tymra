/** Operational context is viewable without exposing authentication or payment material. */
export function redactServicePayload(value: unknown, depth = 0, truncate = true): unknown {
  if (truncate && depth > 12) return "[depth limit]";
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return (truncate ? value.slice(0, 100) : value).map((item) => redactServicePayload(item, depth + 1, truncate));
  if (value && typeof value === "object") return Object.fromEntries((truncate ? Object.entries(value).slice(0, 100) : Object.entries(value)).map(([key, item]) => [
    key, /password|secret|token|authorization|credential|cookie|session|encrypted|api.?key|access.?key|private.?key/iu.test(key) ? "[protected]" : redactServicePayload(item, depth + 1, truncate),
  ]));
  if (typeof value === "string") {
    if (/^https?:\/\//iu.test(value)) {
      try {
        const url = new URL(value);
        url.username = ""; url.password = "";
        for (const key of [...url.searchParams.keys()]) if (/password|secret|token|authorization|credential|cookie|session|api.?key|access.?key|private.?key/iu.test(key)) url.searchParams.set(key, "[protected]");
        return truncate ? url.toString().slice(0, 2_000) : url.toString();
      } catch { return "[invalid URL]"; }
    }
    return truncate ? value.slice(0, 2_000) : value;
  }
  return value;
}
