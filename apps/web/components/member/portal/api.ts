import type { ApiPayload } from "../contracts";

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { cache: "no-store", ...init, headers: { ...(init?.body ? { "content-type": "application/json" } : {}), ...init?.headers } });
  const payload = await response.json() as ApiPayload<T>;
  if (!response.ok || !payload.data) throw new Error(payload.error?.message ?? "The request could not be completed.");
  return payload.data;
}
